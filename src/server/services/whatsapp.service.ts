import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  calcWhatsAppJitterSeconds,
  formatarMensagemWhatsAppComOptOut,
  sanitizarTelefoneBR,
  WhatsAppEnvioInput,
  WhatsAppEnvioSchema,
  WhatsAppFilaItem,
} from "@/server/schemas/whatsapp.schema";
import { registrarDeliveryLog } from "@/server/services/email.service";

// Armazenamento em memória para fila e opt-outs (testes, fallback e alta velocidade)
const memoryWhatsAppQueue: WhatsAppFilaItem[] = [];
const memoryOptOutNumbers = new Set<string>();

export interface EvolutionConfig {
  url: string | null;
  apiKey: string | null;
  instanceName: string;
  configurado: boolean;
}

export function obterConfigEvolutionApi(): EvolutionConfig {
  const url = process.env.EVOLUTION_API_URL?.trim().replace(/\/+$/, "") || null;
  const apiKey = process.env.EVOLUTION_API_KEY?.trim() || null;
  const instanceName =
    process.env.EVOLUTION_INSTANCE_NAME?.trim() || "portal-licitacoes-whatsapp-master";

  return {
    url,
    apiKey,
    instanceName,
    configurado: Boolean(url && apiKey),
  };
}

export interface ResultadoEnvioWhatsApp {
  ok: boolean;
  skipped: boolean;
  status: "ENVIADO" | "FALHA" | "IGNORADO_SEM_CHAVE" | "PAUSADO_OPT_OUT";
  destinatario: string;
  providerMessageId?: string | null;
  erro?: string;
  queueItem?: WhatsAppFilaItem;
}

/**
 * Registra opt-out definitivo para um número de WhatsApp (imune a envio de novos alertas).
 */
export async function registrarOptOutWhatsApp(
  telefone: string,
  motivo = "Solicitação pelo usuário",
): Promise<{ ok: boolean; telefone: string }> {
  const sanitizado = sanitizarTelefoneBR(telefone);
  memoryOptOutNumbers.add(sanitizado);

  try {
    await prisma.whatsAppOptOut.upsert({
      where: { telefone: sanitizado },
      create: { telefone: sanitizado, motivo },
      update: { motivo },
    });
  } catch {
    // Continua com armazenamento em memória
  }

  return { ok: true, telefone: sanitizado };
}

/**
 * Verifica se um número está bloqueado por opt-out.
 */
export async function verificarNumeroBloqueadoOptOut(
  telefone: string,
): Promise<boolean> {
  const sanitizado = sanitizarTelefoneBR(telefone);
  if (memoryOptOutNumbers.has(sanitizado)) {
    return true;
  }

  try {
    const registro = await prisma.whatsAppOptOut.findUnique({
      where: { telefone: sanitizado },
    });
    if (registro) {
      memoryOptOutNumbers.add(sanitizado);
      return true;
    }
  } catch {
    // fallback
  }

  return false;
}

/**
 * Envia texto diretamente via Evolution API v2 (`/message/sendText/{instance}`)
 * respeitando opt-out, sanitização BR (`55` + DDD) e fallback seguro sem chave.
 */
export async function enviarTextoEvolutionApi(params: {
  destinatario: string;
  mensagem: string;
  tenantId?: string | null;
  userId?: string | null;
  evento?: string;
  delayMs?: number;
  incluirRodapeOptOut?: boolean;
}): Promise<ResultadoEnvioWhatsApp> {
  const sanitizado = sanitizarTelefoneBR(params.destinatario);
  if (!sanitizado || sanitizado.length < 12) {
    return {
      ok: false,
      skipped: true,
      status: "FALHA",
      destinatario: sanitizado,
      erro: "Telefone inválido para envio via WhatsApp.",
    };
  }

  const evento = params.evento || "GERAL";
  const estaBloqueado = await verificarNumeroBloqueadoOptOut(sanitizado);
  if (estaBloqueado) {
    await registrarDeliveryLog({
      canal: "WHATSAPP",
      evento,
      destinatario: sanitizado,
      status: "PAUSADO_OPT_OUT",
      erro: "Número bloqueado por solicitação de opt-out",
      tenantId: params.tenantId,
      userId: params.userId,
    });

    return {
      ok: false,
      skipped: true,
      status: "PAUSADO_OPT_OUT",
      destinatario: sanitizado,
      erro: "Número bloqueado por solicitação de opt-out",
    };
  }

  const textoFinal =
    params.incluirRodapeOptOut === false
      ? params.mensagem.trim()
      : formatarMensagemWhatsAppComOptOut(params.mensagem);

  const cfg = obterConfigEvolutionApi();
  if (!cfg.configurado || !cfg.url || !cfg.apiKey) {
    await registrarDeliveryLog({
      canal: "WHATSAPP",
      evento,
      destinatario: sanitizado,
      status: "IGNORADO_SEM_CHAVE",
      erro: "EVOLUTION_API_URL / EVOLUTION_API_KEY não configuradas",
      tenantId: params.tenantId,
      userId: params.userId,
    });

    if (process.env.VITEST !== "true") {
      console.info(
        `[EvolutionFallback] Mensagem WhatsApp para '${sanitizado}' registrada em modo simulado (sem EVOLUTION_API_URL/KEY).`,
      );
    }

    return {
      ok: false,
      skipped: true,
      status: "IGNORADO_SEM_CHAVE",
      destinatario: sanitizado,
    };
  }

  try {
    const endpoint = `${cfg.url}/message/sendText/${encodeURIComponent(cfg.instanceName)}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: cfg.apiKey,
      },
      body: JSON.stringify({
        number: sanitizado,
        text: textoFinal,
        delay: params.delayMs ?? 1200,
      }),
    });

    const json = (await response.json().catch(() => ({}))) as {
      key?: { id?: string };
      messageId?: string;
      id?: string;
      message?: string;
      error?: string;
    };

    if (!response.ok) {
      const erroMsg =
        json.message || json.error || `HTTP ${response.status} ao enviar via Evolution API`;
      await registrarDeliveryLog({
        canal: "WHATSAPP",
        evento,
        destinatario: sanitizado,
        status: "FALHA",
        erro: erroMsg,
        tenantId: params.tenantId,
        userId: params.userId,
      });

      return {
        ok: false,
        skipped: false,
        status: "FALHA",
        destinatario: sanitizado,
        erro: erroMsg,
      };
    }

    const providerMessageId = json.key?.id || json.messageId || json.id || null;
    await registrarDeliveryLog({
      canal: "WHATSAPP",
      evento,
      destinatario: sanitizado,
      status: "ENVIADO",
      providerMessageId,
      tenantId: params.tenantId,
      userId: params.userId,
    });

    return {
      ok: true,
      skipped: false,
      status: "ENVIADO",
      destinatario: sanitizado,
      providerMessageId,
    };
  } catch (err: any) {
    const erroMsg = err?.message || "Erro de rede ao comunicar com Evolution API";
    await registrarDeliveryLog({
      canal: "WHATSAPP",
      evento,
      destinatario: sanitizado,
      status: "FALHA",
      erro: erroMsg,
      tenantId: params.tenantId,
      userId: params.userId,
    });

    return {
      ok: false,
      skipped: false,
      status: "FALHA",
      destinatario: sanitizado,
      erro: erroMsg,
    };
  }
}

/**
 * Adiciona mensagem à fila de envio com jitter humano calculado e opt-out compulsório.
 */
export async function enfileirarMensagemWhatsApp(
  input: WhatsAppEnvioInput,
): Promise<WhatsAppFilaItem> {
  const parsed = WhatsAppEnvioSchema.parse(input);
  const estaBloqueado = await verificarNumeroBloqueadoOptOut(parsed.destinatario);

  const jitterSegundos = calcWhatsAppJitterSeconds(4, 9);
  const mensagemFormatada = formatarMensagemWhatsAppComOptOut(parsed.mensagem);
  const agora = new Date();

  const item: WhatsAppFilaItem = {
    id: `wpp_${randomUUID().slice(0, 12)}`,
    destinatario: parsed.destinatario,
    mensagem: mensagemFormatada,
    tipo: parsed.tipo,
    status: estaBloqueado ? "PAUSADO_OPT_OUT" : "PENDENTE",
    tentativas: 0,
    erro: estaBloqueado ? "Número bloqueado por solicitação de opt-out" : null,
    jitterSegundos,
    agendadoPara: parsed.agendadoPara || agora,
    criadoEm: agora,
  };

  memoryWhatsAppQueue.push(item);

  try {
    await prisma.whatsAppMensagem.create({
      data: {
        id: item.id,
        tenantId: parsed.tenantId || null,
        destinatario: item.destinatario,
        mensagem: item.mensagem,
        tipo: item.tipo,
        status: item.status as any,
        jitterSegundos: item.jitterSegundos,
        agendadoPara: item.agendadoPara,
      },
    });
  } catch {
    // mantido na fila em memória
  }

  return item;
}

/**
 * Enfileira e dispara imediatamente (quando Evolution API está configurada) uma notificação
 * transacional de WhatsApp (boas-vindas, protocolo de suporte, vencimento ou cobrança).
 */
export async function enviarNotificacaoWhatsApp(params: {
  destinatario: string;
  mensagem: string;
  tipo?: "ALERTA" | "BOAS_VINDAS" | "URGENTE" | "SISTEMA";
  evento?: string;
  tenantId?: string | null;
  userId?: string | null;
}): Promise<ResultadoEnvioWhatsApp> {
  const item = await enfileirarMensagemWhatsApp({
    destinatario: params.destinatario,
    mensagem: params.mensagem,
    tipo: params.tipo ?? "ALERTA",
    tenantId: params.tenantId ?? null,
  });

  if (item.status === "PAUSADO_OPT_OUT") {
    await registrarDeliveryLog({
      canal: "WHATSAPP",
      evento: params.evento || item.tipo,
      destinatario: item.destinatario,
      status: "PAUSADO_OPT_OUT",
      erro: item.erro || "Número bloqueado por opt-out",
      tenantId: params.tenantId,
      userId: params.userId,
    });

    return {
      ok: false,
      skipped: true,
      status: "PAUSADO_OPT_OUT",
      destinatario: item.destinatario,
      erro: item.erro || undefined,
      queueItem: item,
    };
  }

  const envio = await enviarTextoEvolutionApi({
    destinatario: item.destinatario,
    mensagem: item.mensagem,
    tenantId: params.tenantId,
    userId: params.userId,
    evento: params.evento || item.tipo,
    incluirRodapeOptOut: false,
  });

  if (envio.ok) {
    item.status = "ENVIADO";
    item.tentativas += 1;
    item.enviadoEm = new Date();
    try {
      await prisma.whatsAppMensagem.update({
        where: { id: item.id },
        data: { status: "ENVIADO", enviadoEm: item.enviadoEm, tentativas: item.tentativas },
      });
    } catch {}
  } else if (envio.status === "FALHA") {
    item.status = "FALHA";
    item.tentativas += 1;
    item.erro = envio.erro || null;
    try {
      await prisma.whatsAppMensagem.update({
        where: { id: item.id },
        data: { status: "FALHA", erro: item.erro, tentativas: item.tentativas },
      });
    } catch {}
  }

  return {
    ...envio,
    queueItem: item,
  };
}

/**
 * Processa a fila de mensagens pendentes aplicando jitter e enviando via Evolution API v2
 * (com fallback seguro simulado caso as variáveis Evolution ainda não existam).
 */
export async function processarFilaWhatsAppComJitter(params?: {
  limite?: number;
  simularDelay?: boolean;
}): Promise<{
  processados: WhatsAppFilaItem[];
  totalPendentes: number;
}> {
  const limite = params?.limite || 10;
  const pendentes = memoryWhatsAppQueue.filter(
    (item) => item.status === "PENDENTE" && item.agendadoPara <= new Date(),
  );

  const aProcessar = pendentes.slice(0, limite);
  const processados: WhatsAppFilaItem[] = [];
  const cfg = obterConfigEvolutionApi();

  for (const item of aProcessar) {
    if (params?.simularDelay) {
      await new Promise((r) => setTimeout(r, item.jitterSegundos * 1000));
    }

    if (cfg.configurado) {
      const res = await enviarTextoEvolutionApi({
        destinatario: item.destinatario,
        mensagem: item.mensagem,
        evento: item.tipo,
        incluirRodapeOptOut: false,
      });

      item.tentativas += 1;
      if (res.ok) {
        item.status = "ENVIADO";
        item.enviadoEm = new Date();
      } else if (res.status === "PAUSADO_OPT_OUT") {
        item.status = "PAUSADO_OPT_OUT";
        item.erro = res.erro || null;
      } else {
        item.status = "FALHA";
        item.erro = res.erro || null;
      }
    } else {
      item.status = "ENVIADO";
      item.enviadoEm = new Date();
    }

    processados.push(item);

    try {
      await prisma.whatsAppMensagem.update({
        where: { id: item.id },
        data: {
          status: item.status as any,
          tentativas: item.tentativas,
          erro: item.erro,
          enviadoEm: item.enviadoEm,
        },
      });
    } catch {
      // Ignora erro em memória
    }
  }

  const totalPendentes = memoryWhatsAppQueue.filter((i) => i.status === "PENDENTE").length;

  return {
    processados,
    totalPendentes,
  };
}

/**
 * Retorna o status da instância do WhatsApp e tamanho da fila de envio.
 */
export async function obterStatusInstanciaWhatsApp(): Promise<{
  instanciaConectada: boolean;
  nomeInstancia: string;
  filaTamanho: number;
  totalEnviadas: number;
  totalOptOuts: number;
  provedorConfigurado: boolean;
}> {
  const cfg = obterConfigEvolutionApi();
  const filaTamanho = memoryWhatsAppQueue.filter((i) => i.status === "PENDENTE").length;
  const totalEnviadas = memoryWhatsAppQueue.filter((i) => i.status === "ENVIADO").length;

  let instanciaConectada = !cfg.configurado ? true : false;
  if (cfg.configurado && cfg.url && cfg.apiKey) {
    try {
      const resp = await fetch(
        `${cfg.url}/instance/connectionState/${encodeURIComponent(cfg.instanceName)}`,
        {
          headers: { apikey: cfg.apiKey },
          signal: AbortSignal.timeout(4000),
        },
      );
      if (resp.ok) {
        const json = (await resp.json().catch(() => ({}))) as {
          instance?: { state?: string };
          state?: string;
        };
        const state = json.instance?.state || json.state || "";
        instanciaConectada = state.toLowerCase() === "open" || state.toLowerCase() === "connected";
      }
    } catch {
      instanciaConectada = false;
    }
  }

  return {
    instanciaConectada,
    nomeInstancia: cfg.instanceName,
    filaTamanho,
    totalEnviadas,
    totalOptOuts: memoryOptOutNumbers.size,
    provedorConfigurado: cfg.configurado,
  };
}

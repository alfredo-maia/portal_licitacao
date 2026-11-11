import { randomUUID } from "node:crypto";
import { WhatsAppStatus, type WhatsAppMensagem } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  calcWhatsAppJitterSeconds,
  formatarMensagemWhatsAppComOptOut,
  sanitizarTelefoneBR,
  WhatsAppEnvioInput,
  WhatsAppEnvioSchema,
  WhatsAppFilaItem,
  WhatsAppFilaItemSchema,
} from "@/server/schemas/whatsapp.schema";
import { registrarDeliveryLog } from "@/server/services/email.service";

// Armamento/fila em memória para testes, fallback e alta velocidade
const memoryWhatsAppQueue: WhatsAppFilaItem[] = [];
const memoryOptOutNumbers = new Set<string>();

export function resetInMemoryWhatsAppStoreForTesting(): void {
  memoryWhatsAppQueue.length = 0;
  memoryOptOutNumbers.clear();
}

function inicioDoDiaBrt(agora = new Date()): Date {
  const brtDate = agora.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  return new Date(`${brtDate}T00:00:00-03:00`);
}

function horaAtualBrt(agora = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(agora);
}

function estaNaJanelaEnvio(atual: string, inicio: string, fim: string): boolean {
  if (inicio <= fim) {
    return atual >= inicio && atual <= fim;
  }
  return atual >= inicio || atual <= fim;
}

async function obterConfigWhatsAppDinamica() {
  try {
    const mod = await import("@/server/services/superadmin/operacional");
    return await mod.obterConfigWhatsAppSuperAdmin();
  } catch {
    return {
      minDelaySegundos: 4,
      maxDelaySegundos: 9,
      limiteDiarioWarmup: 200,
      janelaInicio: "08:00",
      janelaFim: "20:00",
    };
  }
}

function toWhatsAppPrismaStatus(status: WhatsAppFilaItem["status"]): WhatsAppStatus {
  switch (status) {
    case "ENVIANDO":
      return WhatsAppStatus.ENVIANDO;
    case "ENVIADO":
      return WhatsAppStatus.ENVIADO;
    case "FALHA":
      return WhatsAppStatus.FALHA;
    case "PAUSADO_OPT_OUT":
      return WhatsAppStatus.PAUSADO_OPT_OUT;
    default:
      return WhatsAppStatus.PENDENTE;
  }
}

function dbRowToFilaItem(row: WhatsAppMensagem): WhatsAppFilaItem {
  const parsedStatus = WhatsAppFilaItemSchema.shape.status.safeParse(row.status);
  return {
    id: row.id,
    destinatario: row.destinatario,
    mensagem: row.mensagem,
    tipo: row.tipo,
    status: parsedStatus.success ? parsedStatus.data : "PENDENTE",
    tentativas: row.tentativas,
    erro: row.erro,
    jitterSegundos: Math.max(1, row.jitterSegundos || 4),
    agendadoPara: new Date(row.agendadoPara),
    enviadoEm: row.enviadoEm ? new Date(row.enviadoEm) : null,
    criadoEm: new Date(row.criadoEm),
  };
}

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
  } catch (err: unknown) {
    const erroMsg =
      err instanceof Error ? err.message : "Erro de rede ao comunicar com Evolution API";
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
  const [estaBloqueado, wppConfig] = await Promise.all([
    verificarNumeroBloqueadoOptOut(parsed.destinatario),
    obterConfigWhatsAppDinamica(),
  ]);

  const jitterSegundos = calcWhatsAppJitterSeconds(
    wppConfig.minDelaySegundos,
    wppConfig.maxDelaySegundos,
  );
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
        status: toWhatsAppPrismaStatus(item.status),
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
  respeitarJanela?: boolean;
  referencia?: Date;
}): Promise<{
  processados: WhatsAppFilaItem[];
  totalPendentes: number;
  restantesHoje: number;
  motivoBloqueio?: "FORA_DA_JANELA" | "LIMITE_DIARIO_ATINGIDO" | null;
}> {
  const limite = params?.limite || 10;
  const agora = params?.referencia ?? new Date();
  const inicioDia = inicioDoDiaBrt(agora);
  const wppConfig = await obterConfigWhatsAppDinamica();

  const pendentesMap = new Map<string, WhatsAppFilaItem>();
  try {
    const dbPendentes = await prisma.whatsAppMensagem.findMany({
      where: {
        status: WhatsAppStatus.PENDENTE,
        agendadoPara: { lte: agora },
      },
      orderBy: { agendadoPara: "asc" },
      take: Math.max(limite * 2, 50),
    });
    for (const row of dbPendentes) {
      pendentesMap.set(row.id, dbRowToFilaItem(row));
    }
  } catch {
    // fallback em memória
  }

  for (const item of memoryWhatsAppQueue) {
    if (item.status === "PENDENTE" && new Date(item.agendadoPara) <= agora) {
      pendentesMap.set(item.id, item);
    } else if (item.status !== "PENDENTE") {
      // Estado mais recente em memória prevalece sobre snapshot antigo de banco mockado
      pendentesMap.delete(item.id);
    }
  }

  const pendentes = Array.from(pendentesMap.values()).sort(
    (a, b) => new Date(a.agendadoPara).getTime() - new Date(b.agendadoPara).getTime(),
  );

  const contarPendentesTotais = async (): Promise<number> => {
    const idsPendentes = new Set<string>();
    try {
      const rows = await prisma.whatsAppMensagem.findMany({
        where: { status: WhatsAppStatus.PENDENTE },
        select: { id: true },
      });
      for (const r of rows) idsPendentes.add(r.id);
    } catch {}
    for (const item of memoryWhatsAppQueue) {
      if (item.status === "PENDENTE") idsPendentes.add(item.id);
      else idsPendentes.delete(item.id);
    }
    return idsPendentes.size;
  };

  const deveChecarJanela = params?.respeitarJanela === true || process.env.VITEST !== "true";
  if (deveChecarJanela) {
    const horaAtual = horaAtualBrt(agora);
    if (!estaNaJanelaEnvio(horaAtual, wppConfig.janelaInicio, wppConfig.janelaFim)) {
      return {
        processados: [],
        totalPendentes: await contarPendentesTotais(),
        restantesHoje: 0,
        motivoBloqueio: "FORA_DA_JANELA",
      };
    }
  }

  const idsEnviadosHoje = new Set<string>();
  try {
    const enviadosDb = await prisma.whatsAppMensagem.findMany({
      where: {
        status: WhatsAppStatus.ENVIADO,
        enviadoEm: { gte: inicioDia },
      },
      select: { id: true },
    });
    for (const r of enviadosDb) idsEnviadosHoje.add(r.id);
  } catch {}
  for (const item of memoryWhatsAppQueue) {
    if (item.status === "ENVIADO" && item.enviadoEm && new Date(item.enviadoEm) >= inicioDia) {
      idsEnviadosHoje.add(item.id);
    }
  }

  const restantesHoje = Math.max(0, wppConfig.limiteDiarioWarmup - idsEnviadosHoje.size);
  if (restantesHoje <= 0) {
    return {
      processados: [],
      totalPendentes: await contarPendentesTotais(),
      restantesHoje: 0,
      motivoBloqueio: "LIMITE_DIARIO_ATINGIDO",
    };
  }

  const aProcessar = pendentes.slice(0, Math.min(limite, restantesHoje));
  const processados: WhatsAppFilaItem[] = [];
  const cfg = obterConfigEvolutionApi();
  let enviadosNesteLote = 0;

  for (const item of aProcessar) {
    const estaBloqueado = await verificarNumeroBloqueadoOptOut(item.destinatario);
    if (estaBloqueado) {
      item.status = "PAUSADO_OPT_OUT";
      item.erro = "Número bloqueado por solicitação de opt-out";
      processados.push(item);

      try {
        await prisma.whatsAppMensagem.update({
          where: { id: item.id },
          data: {
            status: WhatsAppStatus.PAUSADO_OPT_OUT,
            erro: item.erro,
          },
        });
      } catch {}
      continue;
    }

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
        enviadosNesteLote++;
      } else if (res.status === "PAUSADO_OPT_OUT") {
        item.status = "PAUSADO_OPT_OUT";
        item.erro = res.erro || null;
      } else {
        item.status = "FALHA";
        item.erro = res.erro || null;
      }
    } else {
      item.tentativas += 1;
      item.status = "ENVIADO";
      item.enviadoEm = new Date();
      enviadosNesteLote++;
    }

    processados.push(item);

    try {
      await prisma.whatsAppMensagem.update({
        where: { id: item.id },
        data: {
          status: toWhatsAppPrismaStatus(item.status),
          tentativas: item.tentativas,
          erro: item.erro,
          enviadoEm: item.enviadoEm,
        },
      });
    } catch {
      // Ignora erro em memória
    }
  }

  return {
    processados,
    totalPendentes: await contarPendentesTotais(),
    restantesHoje: Math.max(0, restantesHoje - enviadosNesteLote),
    motivoBloqueio: null,
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

/**
 * Lista a fila de mensagens recentes (memória + Postgres) para o Portal ADM.
 */
export async function listarFilaWhatsApp(limite = 50): Promise<
  Array<{
    id: string;
    destinatario: string;
    mensagem: string;
    tipo: string;
    status: string;
    tentativas: number;
    erro: string | null;
    criadoEm: Date;
    enviadoEm: Date | null;
  }>
> {
  type WhatsAppFilaRow = WhatsAppMensagem | WhatsAppFilaItem;
  const out = new Map<string, WhatsAppFilaRow>();
  try {
    const rows = await prisma.whatsAppMensagem.findMany({
      orderBy: { criadoEm: "desc" },
      take: limite,
    });
    for (const r of rows) out.set(r.id, r);
  } catch {
    // fallback em memória
  }
  for (const m of memoryWhatsAppQueue) if (!out.has(m.id)) out.set(m.id, m);
  return Array.from(out.values())
    .sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime())
    .slice(0, limite)
    .map((m) => ({
      id: m.id,
      destinatario: m.destinatario,
      mensagem: m.mensagem,
      tipo: m.tipo,
      status: String(m.status),
      tentativas: m.tentativas ?? 0,
      erro: m.erro ?? null,
      criadoEm: m.criadoEm,
      enviadoEm: m.enviadoEm ?? null,
    }));
}

/**
 * Lista telefones em opt-out (lista de bloqueio) para o Portal ADM.
 */
export async function listarOptOutsWhatsApp(): Promise<
  Array<{ telefone: string; motivo: string | null; criadoEm: Date | null }>
> {
  const out = new Map<string, { telefone: string; motivo: string | null; criadoEm: Date | null }>();
  try {
    const rows = await prisma.whatsAppOptOut.findMany({ orderBy: { criadoEm: "desc" } });
    for (const r of rows) {
      out.set(r.telefone, { telefone: r.telefone, motivo: r.motivo, criadoEm: r.criadoEm });
    }
  } catch {
    // fallback em memória
  }
  for (const tel of memoryOptOutNumbers) {
    if (!out.has(tel)) out.set(tel, { telefone: tel, motivo: null, criadoEm: null });
  }
  return Array.from(out.values());
}

/**
 * Remove um telefone da lista de opt-out (reativa recebimento de mensagens).
 */
export async function removerOptOutWhatsApp(
  telefone: string,
): Promise<{ ok: boolean; telefone: string }> {
  const sanitizado = sanitizarTelefoneBR(telefone);
  memoryOptOutNumbers.delete(sanitizado);
  try {
    await prisma.whatsAppOptOut.delete({ where: { telefone: sanitizado } });
  } catch {
    // inexistente ou banco offline
  }
  return { ok: true, telefone: sanitizado };
}

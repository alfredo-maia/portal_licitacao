import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  calcWhatsAppJitterSeconds,
  formatarMensagemWhatsAppComOptOut,
  sanitizarTelefoneBR,
  isWhatsAppOptOutMessage,
  WhatsAppEnvioInput,
  WhatsAppEnvioSchema,
  WhatsAppFilaItem,
} from "@/server/schemas/whatsapp.schema";

// Armazenamento em memória para fila e opt-outs (testes, fallback e alta velocidade)
const memoryWhatsAppQueue: WhatsAppFilaItem[] = [];
const memoryOptOutNumbers = new Set<string>();

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
 * Processa a fila de mensagens pendentes aplicando jitter e simulando envio para o gateway.
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

  for (const item of aProcessar) {
    if (params?.simularDelay) {
      // Aplica o jitter humano real
      await new Promise((r) => setTimeout(r, item.jitterSegundos * 1000));
    }

    item.status = "ENVIADO";
    item.enviadoEm = new Date();
    processados.push(item);

    try {
      await prisma.whatsAppMensagem.update({
        where: { id: item.id },
        data: {
          status: "ENVIADO",
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
}> {
  const filaTamanho = memoryWhatsAppQueue.filter((i) => i.status === "PENDENTE").length;
  const totalEnviadas = memoryWhatsAppQueue.filter((i) => i.status === "ENVIADO").length;

  return {
    instanciaConectada: true,
    nomeInstancia: "portal-licitacoes-whatsapp-master",
    filaTamanho,
    totalEnviadas,
    totalOptOuts: memoryOptOutNumbers.size,
  };
}

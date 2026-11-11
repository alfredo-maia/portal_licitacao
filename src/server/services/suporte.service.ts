import { randomUUID } from "node:crypto";
import type { Prisma, SupportTicketMessage } from "@prisma/client";
import { APP_CONFIG } from "@/config/brand";
import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/server/audit";
import { enviarEmailProtocoloSuporte } from "@/server/services/email.service";
import { criarNotificacaoAdmin } from "@/server/services/superadmin/notificacoes";
import { enviarNotificacaoWhatsApp } from "@/server/services/whatsapp.service";
import {
  criarTicketSuporteInputSchema,
  responderTicketSuporteInputSchema,
  supportTicketAutorTipoSchema,
  supportTicketCategoriaSchema,
  supportTicketStatusSchema,
  supportTicketUrgenciaSchema,
  type CriarTicketSuporteInput,
  type ResponderTicketSuporteInput,
  type SupportTicketItem,
  type SupportTicketMessageItem,
  type SupportTicketStatus,
} from "@/server/schemas/suporte.schema";

type SupportTicketWithMessages = Prisma.SupportTicketGetPayload<{
  include: { mensagens: true };
}>;

const inMemorySuporteTickets = new Map<string, SupportTicketItem>();
let suporteSequenciaMemoria = 0;
let suporteTablesEnsured = false;

export function resetInMemorySuporteStore(): void {
  inMemorySuporteTickets.clear();
  suporteSequenciaMemoria = 0;
}

async function ensureSuporteTables(): Promise<void> {
  if (suporteTablesEnsured || process.env.VITEST === "true") return;
  const statements = [
    `CREATE TABLE IF NOT EXISTS "support_ticket" (
      "id" TEXT NOT NULL,
      "protocolo" TEXT NOT NULL,
      "tenantId" TEXT,
      "userId" TEXT,
      "autorNome" TEXT NOT NULL,
      "autorEmail" TEXT,
      "autorTelefone" TEXT,
      "categoria" TEXT NOT NULL DEFAULT 'DUVIDA',
      "urgencia" TEXT NOT NULL DEFAULT 'MEDIA',
      "assunto" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'ABERTO',
      "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "concluidoEm" TIMESTAMP(3),
      CONSTRAINT "support_ticket_pkey" PRIMARY KEY ("id")
    );`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "support_ticket_protocolo_key" ON "support_ticket"("protocolo");`,
    `CREATE INDEX IF NOT EXISTS "support_ticket_tenantId_idx" ON "support_ticket"("tenantId");`,
    `CREATE INDEX IF NOT EXISTS "support_ticket_status_idx" ON "support_ticket"("status");`,
    `CREATE INDEX IF NOT EXISTS "support_ticket_userId_idx" ON "support_ticket"("userId");`,
    `CREATE TABLE IF NOT EXISTS "support_ticket_message" (
      "id" TEXT NOT NULL,
      "ticketId" TEXT NOT NULL,
      "autorId" TEXT,
      "autorNome" TEXT NOT NULL,
      "autorTipo" TEXT NOT NULL DEFAULT 'CLIENTE',
      "mensagem" TEXT NOT NULL,
      "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "support_ticket_message_pkey" PRIMARY KEY ("id")
    );`,
    `CREATE INDEX IF NOT EXISTS "support_ticket_message_ticketId_idx" ON "support_ticket_message"("ticketId");`,
  ];

  for (const sql of statements) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch {
      // Silencioso quando sem Postgres ativo
    }
  }
  suporteTablesEnsured = true;
}

function mapDbMessage(msg: SupportTicketMessage): SupportTicketMessageItem {
  const parsedTipo = supportTicketAutorTipoSchema.safeParse(msg.autorTipo);
  return {
    id: String(msg.id),
    ticketId: String(msg.ticketId),
    autorId: msg.autorId ?? null,
    autorNome: String(msg.autorNome || "Usuário"),
    autorTipo: parsedTipo.success ? parsedTipo.data : "CLIENTE",
    mensagem: String(msg.mensagem || ""),
    criadoEm: new Date(msg.criadoEm),
  };
}

function mapDbTicket(row: SupportTicketWithMessages): SupportTicketItem {
  const parsedCat = supportTicketCategoriaSchema.safeParse(row.categoria);
  const parsedUrg = supportTicketUrgenciaSchema.safeParse(row.urgencia);
  const parsedSt = supportTicketStatusSchema.safeParse(row.status);
  return {
    id: String(row.id),
    protocolo: String(row.protocolo),
    tenantId: row.tenantId ?? null,
    userId: row.userId ?? null,
    autorNome: String(row.autorNome || "Cliente"),
    autorEmail: row.autorEmail ?? null,
    autorTelefone: row.autorTelefone ?? null,
    categoria: parsedCat.success ? parsedCat.data : "DUVIDA",
    urgencia: parsedUrg.success ? parsedUrg.data : "MEDIA",
    assunto: String(row.assunto),
    status: parsedSt.success ? parsedSt.data : "ABERTO",
    criadoEm: new Date(row.criadoEm),
    atualizadoEm: new Date(row.atualizadoEm),
    concluidoEm: row.concluidoEm ? new Date(row.concluidoEm) : null,
    mensagens: Array.isArray(row.mensagens) ? row.mensagens.map(mapDbMessage) : [],
  };
}

async function gerarProximoProtocolo(referencia = new Date()): Promise<string> {
  const ano = referencia.getUTCFullYear();
  const mes = String(referencia.getUTCMonth() + 1).padStart(2, "0");
  const prefixo = `PROT-${ano}${mes}-`;

  let maiorSeq = suporteSequenciaMemoria;
  for (const item of inMemorySuporteTickets.values()) {
    if (item.protocolo.startsWith(prefixo)) {
      const n = parseInt(item.protocolo.slice(prefixo.length), 10);
      if (!Number.isNaN(n) && n > maiorSeq) maiorSeq = n;
    }
  }

  try {
    const ultimo = await prisma.supportTicket.findFirst({
      where: { protocolo: { startsWith: prefixo } },
      orderBy: { protocolo: "desc" },
      select: { protocolo: true },
    });
    if (ultimo?.protocolo?.startsWith(prefixo)) {
      const n = parseInt(ultimo.protocolo.slice(prefixo.length), 10);
      if (!Number.isNaN(n) && n > maiorSeq) maiorSeq = n;
    }
  } catch {
    // fallback offline
  }

  const proximo = maiorSeq + 1;
  suporteSequenciaMemoria = proximo;
  return `${prefixo}${String(proximo).padStart(4, "0")}`;
}

export interface SuporteActorContext {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  telefone?: string | null;
  tenantId?: string | null;
  autorTipo?: "CLIENTE" | "SUPORTE";
  isSuperAdmin?: boolean;
}

export async function criarTicketSuporte(
  rawInput: CriarTicketSuporteInput,
  actor: SuporteActorContext,
): Promise<SupportTicketItem> {
  const input = criarTicketSuporteInputSchema.parse(rawInput);
  await ensureSuporteTables().catch(() => undefined);

  const agora = new Date();
  const protocolo = await gerarProximoProtocolo(agora);
  const ticketId = `tkt_${randomUUID()}`;
  const msgId = `tmsg_${randomUUID()}`;
  const autorNome = actor.name?.trim() || actor.email || "Cliente Licitante";

  const inicialMessage: SupportTicketMessageItem = {
    id: msgId,
    ticketId,
    autorId: actor.id ?? null,
    autorNome,
    autorTipo: "CLIENTE",
    mensagem: input.descricao,
    criadoEm: agora,
  };

  let ticketFinal: SupportTicketItem = {
    id: ticketId,
    protocolo,
    tenantId: actor.tenantId ?? null,
    userId: actor.id ?? null,
    autorNome,
    autorEmail: actor.email ?? null,
    autorTelefone: actor.telefone ?? null,
    categoria: input.categoria,
    urgencia: input.urgencia,
    assunto: input.assunto,
    status: "ABERTO",
    criadoEm: agora,
    atualizadoEm: agora,
    concluidoEm: null,
    mensagens: [inicialMessage],
  };

  try {
    const created = await prisma.supportTicket.create({
      data: {
        id: ticketId,
        protocolo,
        tenantId: actor.tenantId ?? null,
        userId: actor.id ?? null,
        autorNome,
        autorEmail: actor.email ?? null,
        autorTelefone: actor.telefone ?? null,
        categoria: input.categoria,
        urgencia: input.urgencia,
        assunto: input.assunto,
        status: "ABERTO",
        criadoEm: agora,
        atualizadoEm: agora,
        mensagens: {
          create: {
            id: msgId,
            autorId: actor.id ?? null,
            autorNome,
            autorTipo: "CLIENTE",
            mensagem: input.descricao,
            criadoEm: agora,
          },
        },
      },
      include: {
        mensagens: { orderBy: { criadoEm: "asc" } },
      },
    });
    ticketFinal = mapDbTicket(created);
  } catch {
    // Fallback em memória já montado
  }

  inMemorySuporteTickets.set(ticketFinal.id, ticketFinal);

  await recordAuditLog({
    acao: "SUPORTE_TICKET_CRIADO",
    entidadeTipo: "SUPORTE_TICKET",
    entidadeId: ticketFinal.id,
    tenantId: actor.tenantId ?? null,
    usuarioId: actor.id ?? null,
    usuarioNome: autorNome,
    depois: {
      protocolo: ticketFinal.protocolo,
      categoria: ticketFinal.categoria,
      urgencia: ticketFinal.urgencia,
      assunto: ticketFinal.assunto,
    },
  });

  // Confirmações via E-mail (Resend) e WhatsApp (Evolution) para cliente + equipe interna
  const teamNotifyEmail = process.env.SUPPORT_NOTIFY_EMAIL?.trim();
  const teamNotifyWhatsApp = process.env.SUPPORT_NOTIFY_WHATSAPP?.trim();

  if (actor.email) {
    await enviarEmailProtocoloSuporte({
      destinatarioEmail: actor.email,
      protocolo: ticketFinal.protocolo,
      autorNome,
      assunto: ticketFinal.assunto,
      categoria: ticketFinal.categoria,
      urgencia: ticketFinal.urgencia,
      mensagem: input.descricao,
      tenantId: actor.tenantId ?? null,
      userId: actor.id ?? null,
    }).catch(() => undefined);
  }

  if (teamNotifyEmail) {
    await enviarEmailProtocoloSuporte({
      destinatarioEmail: teamNotifyEmail,
      protocolo: ticketFinal.protocolo,
      autorNome,
      assunto: ticketFinal.assunto,
      categoria: ticketFinal.categoria,
      urgencia: ticketFinal.urgencia,
      mensagem: input.descricao,
      isEquipeInterna: true,
      tenantId: actor.tenantId ?? null,
      userId: actor.id ?? null,
    }).catch(() => undefined);
  }

  if (actor.telefone) {
    await enviarNotificacaoWhatsApp({
      destinatario: actor.telefone,
      mensagem: `${APP_CONFIG.brandName}: Seu chamado ${ticketFinal.protocolo} ("${ticketFinal.assunto}") foi registrado e está na fila de atendimento.`,
      tipo: "SISTEMA",
      evento: "SUPORTE_PROTOCOLO",
      tenantId: actor.tenantId ?? null,
      userId: actor.id ?? null,
    }).catch(() => undefined);
  }

  if (teamNotifyWhatsApp) {
    await enviarNotificacaoWhatsApp({
      destinatario: teamNotifyWhatsApp,
      mensagem: `[Suporte Interno] Novo protocolo ${ticketFinal.protocolo} (${ticketFinal.urgencia}) de ${autorNome}: ${ticketFinal.assunto}`,
      tipo: "SISTEMA",
      evento: "SUPORTE_EQUIPE",
      tenantId: actor.tenantId ?? null,
    }).catch(() => undefined);
  }

  await criarNotificacaoAdmin({
    categoria: "CHAMADO_SUPORTE",
    titulo: `Novo chamado de suporte ${ticketFinal.protocolo}: ${ticketFinal.assunto}`,
    descricao: `Aberto por ${autorNome} • Categoria ${ticketFinal.categoria} • Urgência ${ticketFinal.urgencia}.`,
    severidade:
      ticketFinal.urgencia === "CRITICA"
        ? "CRITICA"
        : ticketFinal.urgencia === "ALTA"
          ? "ATENCAO"
          : "INFO",
    tenantId: actor.tenantId ?? null,
    linkDestino: "/admin/suporte",
    atorNome: autorNome,
    metadados: { ticketId: ticketFinal.id, protocolo: ticketFinal.protocolo },
  }).catch(() => undefined);

  return ticketFinal;
}

export async function listarTicketsSuporte(
  tenantId?: string | null,
  userId?: string | null,
  options?: { isSuperAdmin?: boolean; status?: SupportTicketStatus },
): Promise<SupportTicketItem[]> {
  await ensureSuporteTables().catch(() => undefined);

  const memFiltrados = Array.from(inMemorySuporteTickets.values()).filter((t) => {
    if (options?.status && t.status !== options.status) return false;
    if (options?.isSuperAdmin) return true;
    if (tenantId) return t.tenantId === tenantId;
    if (userId) return t.userId === userId;
    return false;
  });

  try {
    const where: Prisma.SupportTicketWhereInput = {};
    if (options?.status) where.status = options.status;
    if (!options?.isSuperAdmin) {
      if (tenantId) {
        where.tenantId = tenantId;
      } else if (userId) {
        where.userId = userId;
      } else {
        return [];
      }
    }

    const dbRows = await prisma.supportTicket.findMany({
      where,
      include: {
        mensagens: { orderBy: { criadoEm: "asc" } },
      },
      orderBy: { atualizadoEm: "desc" },
    });

    const merged = new Map<string, SupportTicketItem>();
    for (const row of dbRows) {
      const mapped = mapDbTicket(row);
      merged.set(mapped.id, mapped);
    }
    for (const m of memFiltrados) {
      if (!merged.has(m.id)) merged.set(m.id, m);
    }

    return Array.from(merged.values()).sort(
      (a, b) => b.atualizadoEm.getTime() - a.atualizadoEm.getTime(),
    );
  } catch {
    return memFiltrados.sort(
      (a, b) => b.atualizadoEm.getTime() - a.atualizadoEm.getTime(),
    );
  }
}

export async function obterTicketSuportePorId(
  ticketId: string,
  tenantId?: string | null,
  userId?: string | null,
  isSuperAdmin = false,
): Promise<SupportTicketItem | null> {
  await ensureSuporteTables().catch(() => undefined);

  try {
    const db = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: { mensagens: { orderBy: { criadoEm: "asc" } } },
    });
    if (db) {
      const mapped = mapDbTicket(db);
      if (
        isSuperAdmin ||
        (tenantId && mapped.tenantId === tenantId) ||
        (!tenantId && userId && mapped.userId === userId)
      ) {
        inMemorySuporteTickets.set(mapped.id, mapped);
        return mapped;
      }
      return null;
    }
  } catch {
    // fallback
  }

  const mem = inMemorySuporteTickets.get(ticketId);
  if (!mem) return null;
  if (
    isSuperAdmin ||
    (tenantId && mem.tenantId === tenantId) ||
    (!tenantId && userId && mem.userId === userId)
  ) {
    return mem;
  }
  return null;
}

export async function adicionarMensagemTicketSuporte(
  ticketId: string,
  rawInput: ResponderTicketSuporteInput,
  actor: SuporteActorContext,
): Promise<SupportTicketItem | null> {
  const input = responderTicketSuporteInputSchema.parse(rawInput);
  const existente = await obterTicketSuportePorId(
    ticketId,
    actor.tenantId,
    actor.id,
    Boolean(actor.isSuperAdmin),
  );
  if (!existente) return null;

  const agora = new Date();
  const autorTipo = actor.autorTipo === "SUPORTE" ? "SUPORTE" : "CLIENTE";
  const autorNome = actor.name?.trim() || actor.email || (autorTipo === "SUPORTE" ? "Equipe de Suporte" : "Cliente");

  const novoStatus: SupportTicketStatus =
    autorTipo === "SUPORTE"
      ? "RESPONDIDO"
      : existente.status === "AGUARDANDO_CLIENTE"
        ? "EM_ATENDIMENTO"
        : existente.status;

  const novaMsg: SupportTicketMessageItem = {
    id: `tmsg_${randomUUID()}`,
    ticketId,
    autorId: actor.id ?? null,
    autorNome,
    autorTipo,
    mensagem: input.mensagem,
    criadoEm: agora,
  };

  let atualizado: SupportTicketItem = {
    ...existente,
    status: novoStatus,
    atualizadoEm: agora,
    mensagens: [...existente.mensagens, novaMsg],
  };

  try {
    const dbUpdated = await prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: novoStatus,
        atualizadoEm: agora,
        mensagens: {
          create: {
            id: novaMsg.id,
            autorId: novaMsg.autorId,
            autorNome: novaMsg.autorNome,
            autorTipo: novaMsg.autorTipo,
            mensagem: novaMsg.mensagem,
            criadoEm: agora,
          },
        },
      },
      include: {
        mensagens: { orderBy: { criadoEm: "asc" } },
      },
    });
    atualizado = mapDbTicket(dbUpdated);
  } catch {
    // Fallback em memória já preparado
  }

  inMemorySuporteTickets.set(ticketId, atualizado);

  await recordAuditLog({
    acao: "SUPORTE_TICKET_MENSAGEM",
    entidadeTipo: "SUPORTE_TICKET",
    entidadeId: ticketId,
    tenantId: existente.tenantId,
    usuarioId: actor.id ?? null,
    usuarioNome: autorNome,
    depois: { autorTipo, status: novoStatus },
  });

  if (autorTipo === "SUPORTE") {
    if (existente.autorEmail) {
      await enviarEmailProtocoloSuporte({
        destinatarioEmail: existente.autorEmail,
        protocolo: existente.protocolo,
        autorNome: existente.autorNome,
        assunto: existente.assunto,
        categoria: existente.categoria,
        urgencia: existente.urgencia,
        mensagem: input.mensagem,
        isAtualizacao: true,
        tenantId: existente.tenantId,
        userId: existente.userId,
      }).catch(() => undefined);
    }

    if (existente.autorTelefone) {
      await enviarNotificacaoWhatsApp({
        destinatario: existente.autorTelefone,
        mensagem: `${APP_CONFIG.brandName}: Atualização no protocolo ${existente.protocolo}: ${input.mensagem}`,
        tipo: "SISTEMA",
        evento: "SUPORTE_ATUALIZACAO",
        tenantId: existente.tenantId,
        userId: existente.userId,
      }).catch(() => undefined);
    }
  } else {
    const teamNotifyEmail = process.env.SUPPORT_NOTIFY_EMAIL?.trim();
    if (teamNotifyEmail) {
      await enviarEmailProtocoloSuporte({
        destinatarioEmail: teamNotifyEmail,
        protocolo: existente.protocolo,
        autorNome,
        assunto: `Nova mensagem em ${existente.protocolo}`,
        categoria: existente.categoria,
        urgencia: existente.urgencia,
        mensagem: input.mensagem,
        isEquipeInterna: true,
        tenantId: existente.tenantId,
        userId: actor.id ?? null,
      }).catch(() => undefined);
    }

    await criarNotificacaoAdmin({
      categoria: "CHAMADO_SUPORTE",
      titulo: `Nova mensagem no chamado ${existente.protocolo}`,
      descricao: `${autorNome} respondeu em "${existente.assunto}": ${input.mensagem.slice(0, 140)}`,
      severidade: "INFO",
      tenantId: existente.tenantId,
      linkDestino: "/admin/suporte",
      atorNome: autorNome,
      metadados: { ticketId: existente.id, protocolo: existente.protocolo },
    }).catch(() => undefined);
  }

  return atualizado;
}

export async function atualizarStatusTicketSuporte(
  ticketId: string,
  statusRaw: SupportTicketStatus,
  actor: SuporteActorContext,
): Promise<SupportTicketItem | null> {
  const status = supportTicketStatusSchema.parse(statusRaw);
  const existente = await obterTicketSuportePorId(
    ticketId,
    actor.tenantId,
    actor.id,
    Boolean(actor.isSuperAdmin),
  );
  if (!existente) return null;

  const agora = new Date();
  const concluidoEm = status === "CONCLUIDO" ? agora : null;

  let atualizado: SupportTicketItem = {
    ...existente,
    status,
    atualizadoEm: agora,
    concluidoEm,
  };

  try {
    const dbUpdated = await prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status, atualizadoEm: agora, concluidoEm },
      include: { mensagens: { orderBy: { criadoEm: "asc" } } },
    });
    atualizado = mapDbTicket(dbUpdated);
  } catch {}

  inMemorySuporteTickets.set(ticketId, atualizado);

  await recordAuditLog({
    acao: "SUPORTE_TICKET_STATUS_ATUALIZADO",
    entidadeTipo: "SUPORTE_TICKET",
    entidadeId: ticketId,
    tenantId: existente.tenantId,
    usuarioId: actor.id ?? null,
    antes: { status: existente.status },
    depois: { status },
  });

  return atualizado;
}

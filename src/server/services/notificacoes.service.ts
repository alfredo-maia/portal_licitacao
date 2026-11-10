import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/server/audit";
import { enviarEmailAlertaVencimento } from "@/server/services/email.service";
import { enviarNotificacaoWhatsApp } from "@/server/services/whatsapp.service";
import {
  STATUS_PIPELINE_ATIVO,
  OPERACAO_TIMEZONE,
} from "@/server/schemas/status-grupos.schema";
import {
  NOTIFICACAO_MATRIZ,
  NOTIFICACAO_N5_JANELA_HORAS,
  type NotificacaoCriarInput,
  type NotificacaoItem,
  type NotificacaoTipo,
  type NotificacoesListQuery,
  type NotificacoesListResponse,
  montarChaveIdempotencia,
  notificacaoCriarInputSchema,
  notificacoesListQuerySchema,
} from "@/server/schemas/notificacao.schema";
import {
  getInMemoryLicitacaoById,
  getInMemoryLicitacaoEquipe,
  getInMemoryTenantLicitacao,
  insertInMemoryNotificacao,
  listInMemoryLicitacoes,
  listInMemoryNotificacoesUsuario,
  listInMemoryPortais,
  listInMemoryDocumentos,
  listInMemoryImpugnacoes,
  listInMemoryUsuarios,
  marcarInMemoryNotificacaoLida,
  marcarTodasInMemoryNotificacoesLidas,
} from "./licitacoes-store";

/* =========================================================================
   1. Criar Notificação (com Fan-out e Idempotência)
========================================================================= */

async function despacharNotificacoesExternas(params: {
  destinatarioIds: string[];
  tenantId?: string | null;
  nomeItem: string;
  tipoItem: "DOCUMENTO" | "PORTAL" | "LICITACAO";
  diasRestantes: number;
  descricao: string;
  linkDestino?: string;
  eventoWhatsApp: string;
}): Promise<void> {
  if (!params.destinatarioIds || params.destinatarioIds.length === 0) return;

  const idSet = new Set(params.destinatarioIds);
  const recipientsMap = new Map<
    string,
    { id: string; email?: string | null; telefone?: string | null }
  >();

  try {
    const dbUsers = await prisma.user.findMany({
      where: { id: { in: params.destinatarioIds }, ativo: true },
      select: { id: true, email: true, telefone: true },
    });
    for (const u of dbUsers) {
      recipientsMap.set(u.id, { id: u.id, email: u.email, telefone: u.telefone });
    }
  } catch {
    // Fallback para usuários em memória quando banco estiver indisponível
  }

  for (const u of listInMemoryUsuarios()) {
    if (u.ativo === false) continue;
    if (!idSet.has(u.id)) continue;
    if (!recipientsMap.has(u.id)) {
      recipientsMap.set(u.id, {
        id: u.id,
        email: u.email ?? null,
        telefone: u.telefone ?? null,
      });
    }
  }

  const recipients = Array.from(recipientsMap.values());
  if (recipients.length === 0) return;

  const prazoLabel =
    params.diasRestantes < 0
      ? `vencido há ${Math.abs(params.diasRestantes)} dia(s)`
      : params.diasRestantes === 0
        ? "vence hoje"
        : `expira em ${params.diasRestantes} dia(s)`;

  await Promise.allSettled(
    recipients.flatMap((user) => {
      const tasks: Promise<unknown>[] = [];
      if (user.email) {
        tasks.push(
          enviarEmailAlertaVencimento({
            destinatarioEmail: user.email,
            nomeItem: params.nomeItem,
            tipoItem: params.tipoItem,
            diasRestantes: params.diasRestantes,
            descricao: params.descricao,
            linkDestino: params.linkDestino,
            tenantId: params.tenantId,
            userId: user.id,
          }),
        );
      }
      if (user.telefone) {
        tasks.push(
          enviarNotificacaoWhatsApp({
            destinatario: user.telefone,
            mensagem: `Alerta ${params.tipoItem}: ${params.nomeItem} (${prazoLabel}). ${params.descricao}`,
            tipo: "ALERTA",
            evento: params.eventoWhatsApp,
            tenantId: params.tenantId,
            userId: user.id,
          }),
        );
      }
      return tasks;
    }),
  );
}

export async function criarNotificacao(
  rawInput: NotificacaoCriarInput,
): Promise<{ id: string; criada: boolean }> {
  const input = notificacaoCriarInputSchema.parse(rawInput);
  const severidade = input.severidade ?? NOTIFICACAO_MATRIZ[input.tipo].severidade;

  try {
    // Verifica idempotência
    const existing = await prisma.notificacao.findUnique({
      where: { chaveIdempotencia: input.chaveIdempotencia },
      select: { id: true },
    });

    if (existing) {
      return { id: existing.id, criada: false };
    }

    const created = await prisma.notificacao.create({
      data: {
        tipo: input.tipo,
        titulo: input.titulo,
        descricao: input.descricao,
        severidade,
        linkDestino: input.linkDestino ?? null,
        licitacaoId: input.licitacaoId ?? null,
        chaveIdempotencia: input.chaveIdempotencia,
        destinatarios: {
          create: input.destinatarioIds.map((uid) => ({
            usuarioId: uid,
          })),
        },
      },
      select: { id: true },
    });

    return { id: created.id, criada: true };
  } catch (err: any) {
    if (err?.code === "P2002") {
      // Violação de UK em concorrência
      return { id: `idempotent_${input.chaveIdempotencia}`, criada: false };
    }

    // Fallback resiliente em memória para testes isolados
    const res = insertInMemoryNotificacao(
      {
        tipo: input.tipo,
        titulo: input.titulo,
        descricao: input.descricao,
        severidade,
        linkDestino: input.linkDestino ?? null,
        licitacaoId: input.licitacaoId ?? null,
        chaveIdempotencia: input.chaveIdempotencia,
      },
      input.destinatarioIds,
    );

    return { id: res.notificacao.id, criada: res.criada };
  }
}

/* =========================================================================
   2. Listar Notificações do Usuário
========================================================================= */

export async function listNotificacoes(
  usuarioId: string,
  rawQuery?: z.input<typeof notificacoesListQuerySchema>,
): Promise<NotificacoesListResponse> {
  const query = notificacoesListQuerySchema.parse(rawQuery ?? {});

  try {
    const whereDest = {
      usuarioId,
      ...(query.apenasNaoLidas ? { lidaEm: null } : {}),
      ...(query.tipo ? { notificacao: { tipo: query.tipo } } : {}),
    };

    const [total, naoLidasCount, dests] = await Promise.all([
      prisma.notificacaoDestinatario.count({
        where: whereDest,
      }),
      prisma.notificacaoDestinatario.count({
        where: { usuarioId, lidaEm: null },
      }),
      prisma.notificacaoDestinatario.findMany({
        where: whereDest,
        include: { notificacao: true },
        orderBy: { notificacao: { criadaEm: "desc" } },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    const notificacoes: NotificacaoItem[] = dests.map((d) => ({
      id: d.notificacao.id,
      tipo: d.notificacao.tipo,
      titulo: d.notificacao.titulo,
      descricao: d.notificacao.descricao,
      severidade: d.notificacao.severidade,
      linkDestino: d.notificacao.linkDestino,
      criadaEm: d.notificacao.criadaEm,
      lida: d.lidaEm !== null,
      lidaEm: d.lidaEm,
    }));

    return {
      ok: true,
      total,
      naoLidas: naoLidasCount,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize) || 0,
      notificacoes,
    };
  } catch {
    // Fallback resiliente em memória
    const memoria = listInMemoryNotificacoesUsuario(usuarioId, query.apenasNaoLidas);
    const filtrado = query.tipo
      ? memoria.filter((m) => m.notificacao.tipo === query.tipo)
      : memoria;

    const total = filtrado.length;
    const naoLidasCount = listInMemoryNotificacoesUsuario(usuarioId, true).length;
    const paginado = filtrado.slice(
      (query.page - 1) * query.pageSize,
      query.page * query.pageSize,
    );

    const notificacoes: NotificacaoItem[] = paginado.map((m) => ({
      id: m.notificacao.id,
      tipo: m.notificacao.tipo,
      titulo: m.notificacao.titulo,
      descricao: m.notificacao.descricao,
      severidade: m.notificacao.severidade,
      linkDestino: m.notificacao.linkDestino,
      criadaEm: m.notificacao.criadaEm,
      lida: m.lida,
      lidaEm: m.lidaEm,
    }));

    return {
      ok: true,
      total,
      naoLidas: naoLidasCount,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize) || 0,
      notificacoes,
    };
  }
}

/* =========================================================================
   3. Resumo para o Sino Global
========================================================================= */

export async function getResumoNotificacoes(usuarioId: string): Promise<{
  ok: true;
  naoLidas: number;
  recentes: NotificacaoItem[];
}> {
  const lista = await listNotificacoes(usuarioId, { page: 1, pageSize: 5 });
  return {
    ok: true,
    naoLidas: lista.naoLidas,
    recentes: lista.notificacoes,
  };
}

/* =========================================================================
   4. Marcar Lida / Marcar Todas
========================================================================= */

export async function marcarNotificacaoLida(
  usuarioId: string,
  notificacaoId: string,
): Promise<{ ok: true; marcadas: number }> {
  try {
    const updated = await prisma.notificacaoDestinatario.updateMany({
      where: {
        notificacaoId,
        usuarioId,
        lidaEm: null,
      },
      data: { lidaEm: new Date() },
    });

    await recordAuditLog({
      acao: "NOTIFICACAO_LIDA",
      entidadeTipo: "NOTIFICACAO",
      entidadeId: notificacaoId,
      usuarioId,
      depois: { lidaEm: new Date() },
    });

    return { ok: true, marcadas: updated.count };
  } catch {
    const ok = marcarInMemoryNotificacaoLida(usuarioId, notificacaoId);
    return { ok: true, marcadas: ok ? 1 : 0 };
  }
}

export async function marcarTodasLidas(
  usuarioId: string,
): Promise<{ ok: true; marcadas: number }> {
  try {
    const updated = await prisma.notificacaoDestinatario.updateMany({
      where: {
        usuarioId,
        lidaEm: null,
      },
      data: { lidaEm: new Date() },
    });

    await recordAuditLog({
      acao: "NOTIFICACAO_MARCAR_TODAS",
      entidadeTipo: "NOTIFICACAO",
      entidadeId: usuarioId,
      usuarioId,
      depois: { totalMarcadas: updated.count },
    });

    return { ok: true, marcadas: updated.count };
  } catch {
    const total = marcarTodasInMemoryNotificacoesLidas(usuarioId);
    return { ok: true, marcadas: total };
  }
}

/* =========================================================================
   5. Job Diário de Varredura (N3, N4, N5)
========================================================================= */

function calcularDiasCivis(dataFutura: Date, dataRef: Date): number {
  const dF = new Date(dataFutura.getFullYear(), dataFutura.getMonth(), dataFutura.getDate());
  const dR = new Date(dataRef.getFullYear(), dataRef.getMonth(), dataRef.getDate());
  return Math.round((dF.getTime() - dR.getTime()) / (1000 * 60 * 60 * 24));
}

export async function executarJobNotificacoesDiarias(referencia?: Date): Promise<{
  ok: true;
  criadas: Record<NotificacaoTipo, number>;
  contagens: Record<NotificacaoTipo, number>;
  executadoEm: string;
  dataReferencia: string;
  ignoradasPorIdempotencia: number;
}> {
  const agora = referencia ?? new Date();
  const dataBrtStr = agora.toLocaleDateString("sv-SE", { timeZone: OPERACAO_TIMEZONE });

  const contagens: Record<NotificacaoTipo, number> = {
    N1_COLETA_CONCLUIDA: 0,
    N2_LICITACAO_ATUALIZADA: 0,
    N3_ABERTURA_AMANHA: 0,
    N4_PRESENCIAL_PROXIMA: 0,
    N5_PENDENTE_CRITICA: 0,
    N6_VENCIMENTO_PORTAL: 0,
    N7_VENCIMENTO_DOCUMENTO: 0,
    N8_PRAZO_IMPUGNACAO: 0,
    N9_MENCAO_NOTA: 0,
    N10_MOVIMENTACAO_LICITACAO: 0,
    N11_RELATORIO_IA_PRONTO: 0,
  };
  let ignoradas = 0;

  // Busca usuários para mapeamento de perfis
  let allUsers: { id: string; role: string; tenantIds: string[] }[] = [];
  try {
    const dbUsers = await prisma.user.findMany({
      where: { ativo: true },
      select: {
        id: true,
        role: true,
        tenantMemberships: {
          where: { ativo: true },
          select: { tenantId: true },
        },
      },
    });
    allUsers = dbUsers.map((u) => ({
      id: u.id,
      role: u.role,
      tenantIds: (u.tenantMemberships || []).map((m) => m.tenantId).filter(Boolean),
    }));
  } catch {
    const memUsers = listInMemoryUsuarios().filter((u) => u.ativo !== false);
    allUsers = [
      { id: "seed_vitor", role: "DIRETORIA", tenantIds: [] },
      { id: "seed_alfredo", role: "DIRETORIA", tenantIds: [] },
      ...memUsers.map((u) => ({
        id: u.id,
        role: u.role,
        tenantIds: u.tenantId ? [u.tenantId] : [],
      })),
    ];
  }

  const diretoriaEComercialIds = allUsers
    .filter((u) => u.role === "DIRETORIA" || u.role === "ANALISTA_COMERCIAL")
    .map((u) => u.id);

  const diretoriaIds = allUsers
    .filter((u) => u.role === "DIRETORIA")
    .map((u) => u.id);

  // Busca licitações
  let licitacoes: any[] = [];
  try {
    licitacoes = await prisma.licitacao.findMany({
      include: { atribuidos: true },
    });
  } catch (err) {
    console.error("[executarJobDiarioNotificacoes] Erro ao buscar no banco:", err);
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "Licitacao" ADD COLUMN IF NOT EXISTS "dataEncerramentoProposta" TIMESTAMP(3);`).catch(() => undefined);
      await prisma.$executeRawUnsafe(`ALTER TABLE "licitacao" ADD COLUMN IF NOT EXISTS "dataEncerramentoProposta" TIMESTAMP(3);`).catch(() => undefined);
      await prisma.$executeRawUnsafe(`UPDATE "Licitacao" SET "dataEncerramentoProposta" = "dataAbertura" WHERE "dataEncerramentoProposta" IS NULL;`).catch(() => undefined);
      await prisma.$executeRawUnsafe(`UPDATE "licitacao" SET "dataEncerramentoProposta" = "dataAbertura" WHERE "dataEncerramentoProposta" IS NULL;`).catch(() => undefined);
      licitacoes = await prisma.licitacao.findMany({
        include: { atribuidos: true },
      });
    } catch {
      licitacoes = listInMemoryLicitacoes();
    }
  }

  for (const lic of licitacoes) {
    const prazoLimite = lic.dataEncerramentoProposta ? new Date(lic.dataEncerramentoProposta) : new Date(lic.dataAbertura);
    const diffMs = prazoLimite.getTime() - agora.getTime();
    const diffDias = Math.floor(diffMs / (24 * 3600 * 1000));
    const diffHoras = diffMs / (3600 * 1000);

    const responsavelId = lic.responsavelId;
    const atribuidoIds = Array.isArray(lic.atribuidos)
      ? lic.atribuidos.map((a: any) => a.usuarioId)
      : [];
    const destinatariosEnvolvidos = Array.from(
      new Set([responsavelId, ...atribuidoIds].filter(Boolean)),
    ) as string[];

    const fallbackDestinatarios =
      destinatariosEnvolvidos.length > 0
        ? destinatariosEnvolvidos
        : diretoriaEComercialIds;

    // N3 — Prazo Limite Amanhã (D+1) em certame ativo
    if (
      (STATUS_PIPELINE_ATIVO as readonly string[]).includes(lic.status) &&
      diffDias === 1
    ) {
      const chave = montarChaveIdempotencia({
        tipo: "N3_ABERTURA_AMANHA",
        entidadeId: lic.id,
        janela: dataBrtStr,
      });

      const horaStr = prazoLimite.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      const res = await criarNotificacao({
        tipo: "N3_ABERTURA_AMANHA",
        titulo: `Prazo Limite Amanhã (${horaStr}): ${lic.numeroEdital}`,
        descricao: `A licitação ${lic.numeroEdital} (${lic.orgaoNome}) tem prazo fatal para envio da proposta amanhã às ${horaStr}.`,
        linkDestino: `/oportunidades/${lic.id}`,
        licitacaoId: lic.id,
        chaveIdempotencia: chave,
        destinatarioIds: fallbackDestinatarios,
      });

      if (res.criada) {
        contagens.N3_ABERTURA_AMANHA++;
        await despacharNotificacoesExternas({
          destinatarioIds: fallbackDestinatarios,
          tenantId: lic.tenantId ?? null,
          nomeItem: `${lic.numeroEdital} (${lic.orgaoNome})`,
          tipoItem: "LICITACAO",
          diasRestantes: diffDias,
          descricao: `Prazo fatal para envio da proposta amanhã às ${horaStr}.`,
          linkDestino: `/oportunidades/${lic.id}`,
          eventoWhatsApp: "N3_ABERTURA_AMANHA",
        }).catch(() => {});
      } else {
        ignoradas++;
      }
    }

    // N4 — Presencial Próxima (D-7 ou D-1)
    if (
      lic.isPresencial &&
      (STATUS_PIPELINE_ATIVO as readonly string[]).includes(lic.status) &&
      (diffDias === 7 || diffDias === 1)
    ) {
      const chave = montarChaveIdempotencia({
        tipo: "N4_PRESENCIAL_PROXIMA",
        entidadeId: lic.id,
        janela: `${dataBrtStr}_D${diffDias}`,
      });

      const res = await criarNotificacao({
        tipo: "N4_PRESENCIAL_PROXIMA",
        titulo: `Disputa Presencial se Aproximando: ${lic.numeroEdital}`,
        descricao: `A licitação presencial ${lic.numeroEdital} em ${lic.municipio ?? "localidade externa"} ocorrerá em ${diffDias} dia(s). Verifique logística de deslocamento.`,
        linkDestino: `/oportunidades/${lic.id}`,
        licitacaoId: lic.id,
        chaveIdempotencia: chave,
        destinatarioIds: fallbackDestinatarios,
      });

      if (res.criada) contagens.N4_PRESENCIAL_PROXIMA++;
      else ignoradas++;
    }

    // N5 — Licitação Pendente Crítica (< 72h)
    if (
      lic.status === "PENDENTE" &&
      diffHoras > 0 &&
      diffHoras <= NOTIFICACAO_N5_JANELA_HORAS
    ) {
      const chave = montarChaveIdempotencia({
        tipo: "N5_PENDENTE_CRITICA",
        entidadeId: lic.id,
        janela: dataBrtStr,
      });

      const res = await criarNotificacao({
        tipo: "N5_PENDENTE_CRITICA",
        titulo: `Atenção Crítica: ${lic.numeroEdital} abre em menos de 72h`,
        descricao: `O certame ${lic.numeroEdital} (${lic.orgaoNome}) ainda está aguardando decisão GO / No-GO e abre em breve.`,
        linkDestino: `/oportunidades?status=PENDENTE`,
        licitacaoId: lic.id,
        chaveIdempotencia: chave,
        destinatarioIds: diretoriaEComercialIds,
      });

      if (res.criada) {
        contagens.N5_PENDENTE_CRITICA++;
        await despacharNotificacoesExternas({
          destinatarioIds: diretoriaEComercialIds,
          tenantId: lic.tenantId ?? null,
          nomeItem: `${lic.numeroEdital} (${lic.orgaoNome})`,
          tipoItem: "LICITACAO",
          diasRestantes: Math.max(0, diffDias),
          descricao: `O certame ${lic.numeroEdital} ainda aguarda decisão GO / No-GO e abre em menos de 72h.`,
          linkDestino: `/oportunidades?status=PENDENTE`,
          eventoWhatsApp: "N5_PENDENTE_CRITICA",
        }).catch(() => {});
      } else {
        ignoradas++;
      }
    }

    // N8 — Alerta Antecipado de Impugnação (D-4 da data limite / 1 dia antes do prazo fatal de 3 dias úteis)
    if (
      (STATUS_PIPELINE_ATIVO as readonly string[]).includes(lic.status) &&
      diffDias === 4
    ) {
      const chave = montarChaveIdempotencia({
        tipo: "N8_PRAZO_IMPUGNACAO",
        entidadeId: `d4_${lic.id}`,
        janela: dataBrtStr,
      });

      const assignados = await obterUsuariosAssignadosLicitacao(lic.id, lic.tenantId);
      const destinatarios = assignados.length > 0 ? assignados : fallbackDestinatarios;

      const res = await criarNotificacao({
        tipo: "N8_PRAZO_IMPUGNACAO",
        titulo: `Atenção: 1 dia antes do Prazo Fatal de Impugnação (${lic.numeroEdital})`,
        descricao: `Faltam 4 dias para a abertura/encerramento da licitação ${lic.numeroEdital} (${lic.orgaoNome}). Amanhã encerra-se o prazo legal seguro de 3 dias úteis para protocolar impugnação ou pedido de esclarecimento (Art. 164 Lei 14.133/2021).`,
        linkDestino: `/impugnacoes`,
        licitacaoId: lic.id,
        chaveIdempotencia: chave,
        destinatarioIds: destinatarios,
      });

      if (res.criada) contagens.N8_PRAZO_IMPUGNACAO++;
      else ignoradas++;
    }
  }

  const todosUsuariosIds = allUsers.map((u) => u.id);

  // Varredura N6 — Vencimento de Portais (PRD §4.5, §6.2)
  let portais: any[] = [];
  try {
    portais = await prisma.portal.findMany({
      where: { dataVencimento: { not: null } },
    });
  } catch {
    portais = listInMemoryPortais().filter((p) => Boolean(p.dataVencimento));
  }

  for (const portal of portais) {
    const dataVenc = new Date(portal.dataVencimento);
    const diffDias = calcularDiasCivis(dataVenc, agora);
    const janelasN6 = NOTIFICACAO_MATRIZ.N6_VENCIMENTO_PORTAL.antecedenciaDias;

    if (janelasN6 && (janelasN6 as readonly number[]).includes(diffDias)) {
      const chave = montarChaveIdempotencia({
        tipo: "N6_VENCIMENTO_PORTAL",
        entidadeId: portal.id,
        janela: `${dataBrtStr}_D${diffDias}`,
      });

      const destTenant = portal.tenantId
        ? allUsers
            .filter(
              (u) =>
                u.tenantIds.includes(portal.tenantId) &&
                (u.role === "DIRETORIA" || u.role === "ANALISTA_COMERCIAL" || u.role === "SUPERADMIN"),
            )
            .map((u) => u.id)
        : [];
      const destinatariosPortal = portal.tenantId
        ? destTenant
        : diretoriaEComercialIds;

      const res = await criarNotificacao({
        tipo: "N6_VENCIMENTO_PORTAL",
        titulo: `Renovação de Portal: ${portal.nome} vence em ${diffDias} dias`,
        descricao: `A assinatura da plataforma de compras ${portal.nome} expira em ${diffDias} dia(s). Regularize a anuidade para evitar suspensão de lances.`,
        linkDestino: `/portais/${portal.id}`,
        chaveIdempotencia: chave,
        destinatarioIds: destinatariosPortal,
      });

      if (res.criada) {
        contagens.N6_VENCIMENTO_PORTAL++;
        await despacharNotificacoesExternas({
          destinatarioIds: destinatariosPortal,
          tenantId: portal.tenantId ?? null,
          nomeItem: portal.nome,
          tipoItem: "PORTAL",
          diasRestantes: diffDias,
          descricao: `A assinatura da plataforma ${portal.nome} expira em ${diffDias} dia(s).`,
          linkDestino: `/portais/${portal.id}`,
          eventoWhatsApp: "VENCIMENTO_PORTAL",
        }).catch(() => {});
      } else {
        ignoradas++;
      }
    }
  }

  // Varredura N7 — Vencimento de Documentos (PRD §4.6, §6.2)
  let documentos: any[] = [];
  try {
    documentos = await prisma.documento.findMany({
      where: {
        status: "ATIVO",
        semValidade: false,
        dataVencimento: { not: null },
      },
    });
  } catch {
    documentos = listInMemoryDocumentos().filter(
      (d) => d.status === "ATIVO" && !d.semValidade && Boolean(d.dataVencimento),
    );
  }

  for (const doc of documentos) {
    const dataVenc = new Date(doc.dataVencimento);
    const diffDias = calcularDiasCivis(dataVenc, agora);
    const janelasN7 = NOTIFICACAO_MATRIZ.N7_VENCIMENTO_DOCUMENTO.antecedenciaDias;

    if (janelasN7 && (janelasN7 as readonly number[]).includes(diffDias)) {
      const chave = montarChaveIdempotencia({
        tipo: "N7_VENCIMENTO_DOCUMENTO",
        entidadeId: doc.id,
        janela: `${dataBrtStr}_D${diffDias}`,
      });

      const destTenant = doc.tenantId
        ? allUsers.filter((u) => u.tenantIds.includes(doc.tenantId)).map((u) => u.id)
        : [];
      const destinatariosDoc = doc.tenantId
        ? destTenant
        : todosUsuariosIds;

      const res = await criarNotificacao({
        tipo: "N7_VENCIMENTO_DOCUMENTO",
        titulo: `Documento Vencendo: ${doc.nome} expira em ${diffDias} dias`,
        descricao: `O documento de habilitação ${doc.nome} (${doc.categoria}) expira em ${diffDias} dia(s). Providencie a renovação/emissão para manter a empresa habilitada.`,
        linkDestino: `/documentacao`,
        chaveIdempotencia: chave,
        destinatarioIds: destinatariosDoc,
      });

      if (res.criada) {
        contagens.N7_VENCIMENTO_DOCUMENTO++;
        await despacharNotificacoesExternas({
          destinatarioIds: destinatariosDoc,
          tenantId: doc.tenantId ?? null,
          nomeItem: doc.nome,
          tipoItem: "DOCUMENTO",
          diasRestantes: diffDias,
          descricao: `O documento ${doc.nome} (${doc.categoria}) expira em ${diffDias} dia(s).`,
          linkDestino: `/documentacao`,
          eventoWhatsApp: "VENCIMENTO_DOCUMENTO",
        }).catch(() => {});
      } else {
        ignoradas++;
      }
    }
  }

  /* -------------------------------------------------------------------------
     N8: Prazo Fatal de Impugnação Vencendo (Art. 164 Lei 14.133)
  ------------------------------------------------------------------------- */
  let impugnacoesRascunho: any[] = [];
  try {
    impugnacoesRascunho = await prisma.impugnacao.findMany({
      where: {
        status: "RASCUNHO",
        prazoFatal: { gte: agora },
      },
    });
  } catch {
    impugnacoesRascunho = listInMemoryImpugnacoes().filter(
      (i) => i.status === "RASCUNHO" && new Date(i.prazoFatal).getTime() >= agora.getTime(),
    );
  }

  for (const imp of impugnacoesRascunho) {
    const prazoDate = new Date(imp.prazoFatal);
    const diffDias = Math.ceil((prazoDate.getTime() - agora.getTime()) / (1000 * 60 * 60 * 24));
    const janelasN8 = NOTIFICACAO_MATRIZ.N8_PRAZO_IMPUGNACAO.antecedenciaDias;

    if (janelasN8 && (janelasN8 as readonly number[]).includes(diffDias)) {
      const chave = montarChaveIdempotencia({
        tipo: "N8_PRAZO_IMPUGNACAO",
        entidadeId: imp.id,
        janela: `${dataBrtStr}_D${diffDias}`,
      });

      const assignados = imp.licitacaoId
        ? await obterUsuariosAssignadosLicitacao(imp.licitacaoId, imp.tenantId)
        : [];
      const destinatarios = assignados.length > 0 ? assignados : diretoriaIds;

      const res = await criarNotificacao({
        tipo: "N8_PRAZO_IMPUGNACAO",
        titulo: `Prazo Fatal de Impugnação: ${imp.numeroEdital} expira em ${diffDias} dia(s)`,
        descricao: `O prazo fatal para protocolo de impugnação do edital ${imp.numeroEdital} (${imp.orgaoNome}) expira em ${diffDias} dia(s) (Art. 164 Lei 14.133/2021). Motivo: ${imp.motivoLegal}.`,
        linkDestino: `/impugnacoes`,
        chaveIdempotencia: chave,
        destinatarioIds: destinatarios,
      });

      if (res.criada) contagens.N8_PRAZO_IMPUGNACAO++;
      else ignoradas++;
    }
  }

  await recordAuditLog({
    acao: "JOB_NOTIFICACOES_DIARIAS",
    entidadeTipo: "JOB",
    entidadeId: `diario_${dataBrtStr}`,
    depois: { contagens, ignoradasPorIdempotencia: ignoradas },
  });

  return {
    ok: true,
    executadoEm: new Date().toISOString(),
    dataReferencia: dataBrtStr,
    contagens,
    criadas: contagens,
    ignoradasPorIdempotencia: ignoradas,
  };
}

/* =========================================================================
   6. Helpers de Disparo de Eventos (N9, N10, N11 e Vencimento Imediato N6/N7)
========================================================================= */

/**
 * Resolve todos os usuários assignados (Coordenador Único `responsavelId` +
 * Membros Atribuídos `membrosEquipeIds` / `atribuidoIds`) para uma licitação,
 * considerando tanto o escopo `tenantId` quanto o vínculo global/memória.
 */
export async function obterUsuariosAssignadosLicitacao(
  licitacaoId: string,
  tenantId?: string | null,
): Promise<string[]> {
  const ids = new Set<string>();

  // 1. Verifica store em memória (TenantLicitacao e LicitacaoEquipe)
  if (tenantId) {
    const tlMem = getInMemoryTenantLicitacao(tenantId, licitacaoId);
    if (tlMem?.responsavelId) ids.add(tlMem.responsavelId);
    if (Array.isArray(tlMem?.membrosEquipeIds)) {
      for (const uid of tlMem.membrosEquipeIds) {
        if (uid) ids.add(uid);
      }
    }
    const eqTenantMem = getInMemoryLicitacaoEquipe(licitacaoId, tenantId);
    if (eqTenantMem?.responsavelId) ids.add(eqTenantMem.responsavelId);
    if (Array.isArray(eqTenantMem?.atribuidoIds)) {
      for (const uid of eqTenantMem.atribuidoIds) {
        if (uid) ids.add(uid);
      }
    }
  }

  const eqGlobalMem = getInMemoryLicitacaoEquipe(licitacaoId);
  if (eqGlobalMem?.responsavelId) ids.add(eqGlobalMem.responsavelId);
  if (Array.isArray(eqGlobalMem?.atribuidoIds)) {
    for (const uid of eqGlobalMem.atribuidoIds) {
      if (uid) ids.add(uid);
    }
  }

  const licMem = getInMemoryLicitacaoById(licitacaoId);
  if (licMem?.responsavelId) ids.add(licMem.responsavelId);

  // 2. Verifica no banco (TenantLicitacao e Licitacao + LicitacaoAtribuido)
  try {
    if (tenantId) {
      const tl = await prisma.tenantLicitacao.findUnique({
        where: {
          tenantId_licitacaoId: {
            tenantId,
            licitacaoId,
          },
        },
        select: {
          responsavelId: true,
        },
      });
      if (tl?.responsavelId) ids.add(tl.responsavelId);
    } else {
      // Sem tenantId específico (ex.: sincronização global), busca todos os TenantLicitacao vinculados
      const tls = await prisma.tenantLicitacao.findMany({
        where: { licitacaoId },
        select: { responsavelId: true },
      });
      for (const tl of tls) {
        if (tl.responsavelId) ids.add(tl.responsavelId);
      }
    }

    const licDb = await prisma.licitacao.findUnique({
      where: { id: licitacaoId },
      select: {
        responsavelId: true,
        atribuidos: { select: { usuarioId: true } },
      },
    });
    if (licDb?.responsavelId) ids.add(licDb.responsavelId);
    if (Array.isArray(licDb?.atribuidos)) {
      for (const a of licDb.atribuidos) {
        if (a?.usuarioId) ids.add(a.usuarioId);
      }
    }
  } catch {
    // Silencioso em modo offline/memória
  }

  return Array.from(ids);
}

/**
 * N9 — Notifica colaboradores mencionados com `@` em uma nota na aba Notas.
 */
export async function notificarMencaoNota(params: {
  licitacaoId: string;
  notaId: string;
  numeroEdital: string;
  autorNome: string;
  textoNota: string;
  mencoesIds: string[];
  sufixoIdempotencia?: string;
}): Promise<{ acionada: boolean; destinatariosCount: number; notificacaoId?: string }> {
  const destinatarios = Array.from(
    new Set((params.mencoesIds || []).map((id) => id.trim()).filter(Boolean)),
  );
  if (destinatarios.length === 0) {
    return { acionada: false, destinatariosCount: 0 };
  }

  const resumo =
    params.textoNota.length > 160
      ? `${params.textoNota.slice(0, 157)}...`
      : params.textoNota;

  const chave = montarChaveIdempotencia({
    tipo: "N9_MENCAO_NOTA",
    entidadeId: params.notaId,
    janela: params.sufixoIdempotencia || "criacao",
  });

  const res = await criarNotificacao({
    tipo: "N9_MENCAO_NOTA",
    titulo: `Você foi mencionado por ${params.autorNome} no Edital ${params.numeroEdital}`,
    descricao: `"${resumo}" — Clique para abrir a aba Notas da oportunidade.`,
    linkDestino: `/oportunidades/${params.licitacaoId}?aba=notas`,
    licitacaoId: params.licitacaoId,
    chaveIdempotencia: chave,
    destinatarioIds: destinatarios,
  });

  return {
    acionada: res.criada,
    destinatariosCount: destinatarios.length,
    notificacaoId: res.id,
  };
}

/**
 * N10 — Notifica Coordenador e/ou Membros Atribuídos quando a licitação
 * sofre alteração de status, atualização de documentos/arquivos ou mudança de datas.
 */
export async function notificarMovimentacaoLicitacao(params: {
  licitacaoId: string;
  numeroEdital: string;
  orgaoNome: string;
  tipoEvento: "STATUS" | "ARQUIVOS" | "DATAS";
  resumoMudanca: string;
  tenantId?: string | null;
  chaveSufixo?: string;
}): Promise<{ acionada: boolean; destinatariosCount: number; notificacaoId?: string }> {
  const destinatarios = await obterUsuariosAssignadosLicitacao(
    params.licitacaoId,
    params.tenantId,
  );

  if (destinatarios.length === 0) {
    return { acionada: false, destinatariosCount: 0 };
  }

  const prefixoTitulo =
    params.tipoEvento === "STATUS"
      ? "Alteração de Status"
      : params.tipoEvento === "ARQUIVOS"
        ? "Atualização de Documentos"
        : "Mudança de Datas";

  const chave = montarChaveIdempotencia({
    tipo: "N10_MOVIMENTACAO_LICITACAO",
    entidadeId: params.licitacaoId,
    janela: `${params.tipoEvento}_${params.chaveSufixo || Date.now()}`,
  });

  const res = await criarNotificacao({
    tipo: "N10_MOVIMENTACAO_LICITACAO",
    titulo: `${prefixoTitulo}: ${params.numeroEdital}`,
    descricao: `${params.resumoMudanca} (${params.orgaoNome}).`,
    linkDestino: `/oportunidades/${params.licitacaoId}`,
    licitacaoId: params.licitacaoId,
    chaveIdempotencia: chave,
    destinatarioIds: destinatarios,
  });

  return {
    acionada: res.criada,
    destinatariosCount: destinatarios.length,
    notificacaoId: res.id,
  };
}

/**
 * N11 — Notifica todos os usuários assignados no projeto (+ solicitante)
 * quando o relatório assíncrono de participação com IA estiver concluído.
 */
export async function notificarRelatorioIAPronto(params: {
  licitacaoId: string;
  analiseId: string;
  numeroEdital: string;
  orgaoNome: string;
  parecer: "APTO" | "APTO_COM_RESSALVAS" | "INAPTO";
  score: number;
  solicitanteId?: string | null;
  tenantId?: string | null;
}): Promise<{ acionada: boolean; destinatariosCount: number; notificacaoId?: string }> {
  const assignados = await obterUsuariosAssignadosLicitacao(
    params.licitacaoId,
    params.tenantId,
  );
  const conjunto = new Set<string>(assignados);
  if (params.solicitanteId) {
    conjunto.add(params.solicitanteId);
  }

  if (conjunto.size === 0 && params.tenantId) {
    try {
      const tenantUsers = await prisma.user.findMany({
        where: { tenantMemberships: { some: { tenantId: params.tenantId } }, ativo: true },
        select: { id: true },
      });
      for (const u of tenantUsers) conjunto.add(u.id);
    } catch {
      for (const u of listInMemoryUsuarios(params.tenantId)) {
        if (u.id) conjunto.add(u.id);
      }
    }
  }

  const destinatarios = Array.from(conjunto);
  if (destinatarios.length === 0) {
    return { acionada: false, destinatariosCount: 0 };
  }

  const labelParecer =
    params.parecer === "APTO"
      ? "APTO PARA PARTICIPAR"
      : params.parecer === "APTO_COM_RESSALVAS"
        ? "APTO COM RESSALVAS"
        : "INAPTO / IMPEDIMENTO";

  const chave = montarChaveIdempotencia({
    tipo: "N11_RELATORIO_IA_PRONTO",
    entidadeId: params.analiseId,
    janela: "concluido",
  });

  const res = await criarNotificacao({
    tipo: "N11_RELATORIO_IA_PRONTO",
    titulo: `Relatório de IA Pronto (${labelParecer}): ${params.numeroEdital}`,
    descricao: `A análise de participação do edital ${params.numeroEdital} (${params.orgaoNome}) foi concluída com score ${params.score}/100 e PDF disponível na aba Histórico Análise IA.`,
    linkDestino: `/oportunidades/${params.licitacaoId}?aba=historico-ia`,
    licitacaoId: params.licitacaoId,
    chaveIdempotencia: chave,
    destinatarioIds: destinatarios,
  });

  return {
    acionada: res.criada,
    destinatariosCount: destinatarios.length,
    notificacaoId: res.id,
  };
}

/**
 * Disparo imediato de N7 quando um documento é cadastrado/atualizado já próximo de vencer (<= 30 dias).
 */
export async function verificarDisparoImediatoVencimentoDocumento(doc: {
  id: string;
  nome: string;
  categoria: string;
  status?: string | null;
  semValidade?: boolean | null;
  dataVencimento?: Date | string | null;
  tenantId?: string | null;
}): Promise<{ acionada: boolean }> {
  if (!doc.dataVencimento || doc.semValidade || (doc.status && doc.status !== "ATIVO")) {
    return { acionada: false };
  }
  const agora = new Date();
  const dataVenc = new Date(doc.dataVencimento);
  if (Number.isNaN(dataVenc.getTime())) return { acionada: false };

  const diffDias = calcularDiasCivis(dataVenc, agora);
  if (diffDias > 30 || diffDias < -365) {
    return { acionada: false };
  }

  let destinatarios: string[] = [];
  try {
    const users = await prisma.user.findMany({
      where: {
        ativo: true,
        ...(doc.tenantId
          ? { tenantMemberships: { some: { tenantId: doc.tenantId, ativo: true } } }
          : {}),
      },
      select: { id: true },
    });
    destinatarios = users.map((u) => u.id);
  } catch {
    destinatarios = listInMemoryUsuarios(doc.tenantId)
      .filter((u) => u.ativo !== false)
      .map((u) => u.id);
  }

  if (!doc.tenantId && destinatarios.length === 0) {
    destinatarios = listInMemoryUsuarios()
      .filter((u) => u.ativo !== false)
      .map((u) => u.id);
  }
  if (destinatarios.length === 0) return { acionada: false };

  const dataBrtStr = agora.toLocaleDateString("sv-SE", { timeZone: OPERACAO_TIMEZONE });
  const chave = montarChaveIdempotencia({
    tipo: "N7_VENCIMENTO_DOCUMENTO",
    entidadeId: doc.id,
    janela: `${dataBrtStr}_D${diffDias}`,
  });

  const titulo =
    diffDias < 0
      ? `Documento Vencido: ${doc.nome} venceu há ${Math.abs(diffDias)} dia(s)`
      : diffDias === 0
        ? `Documento Vence Hoje: ${doc.nome}`
        : `Documento Vencendo: ${doc.nome} expira em ${diffDias} dia(s)`;

  const res = await criarNotificacao({
    tipo: "N7_VENCIMENTO_DOCUMENTO",
    titulo,
    descricao: `O documento de habilitação ${doc.nome} (${doc.categoria}) requer atenção imediata para manter a empresa habilitada.`,
    linkDestino: `/documentacao`,
    chaveIdempotencia: chave,
    destinatarioIds: destinatarios,
  });

  if (res.criada) {
    await despacharNotificacoesExternas({
      destinatarioIds: destinatarios,
      tenantId: doc.tenantId ?? null,
      nomeItem: doc.nome,
      tipoItem: "DOCUMENTO",
      diasRestantes: diffDias,
      descricao: `O documento de habilitação ${doc.nome} (${doc.categoria}) requer atenção imediata.`,
      linkDestino: `/documentacao`,
      eventoWhatsApp: "VENCIMENTO_DOCUMENTO",
    }).catch(() => {});
  }

  return { acionada: res.criada };
}

/**
 * Disparo imediato de N6 quando um portal é cadastrado/atualizado já próximo de vencer (<= 30 dias).
 */
export async function verificarDisparoImediatoVencimentoPortal(portal: {
  id: string;
  nome: string;
  dataVencimento?: Date | string | null;
  tenantId?: string | null;
}): Promise<{ acionada: boolean }> {
  if (!portal.dataVencimento) return { acionada: false };
  const agora = new Date();
  const dataVenc = new Date(portal.dataVencimento);
  if (Number.isNaN(dataVenc.getTime())) return { acionada: false };

  const diffDias = calcularDiasCivis(dataVenc, agora);
  if (diffDias > 30 || diffDias < -365) {
    return { acionada: false };
  }

  let destinatarios: string[] = [];
  try {
    const users = await prisma.user.findMany({
      where: {
        ativo: true,
        ...(portal.tenantId
          ? { tenantMemberships: { some: { tenantId: portal.tenantId, ativo: true } } }
          : {}),
        role: { in: ["DIRETORIA", "ANALISTA_COMERCIAL", "SUPERADMIN"] as any },
      },
      select: { id: true },
    });
    destinatarios = users.map((u) => u.id);
  } catch {
    destinatarios = listInMemoryUsuarios(portal.tenantId)
      .filter(
        (u) =>
          u.ativo !== false &&
          (u.role === "DIRETORIA" || u.role === "ANALISTA_COMERCIAL" || u.role === "SUPERADMIN"),
      )
      .map((u) => u.id);
  }

  if (!portal.tenantId && destinatarios.length === 0) {
    destinatarios = listInMemoryUsuarios()
      .filter(
        (u) =>
          u.ativo !== false &&
          (u.role === "DIRETORIA" || u.role === "ANALISTA_COMERCIAL" || u.role === "SUPERADMIN"),
      )
      .map((u) => u.id);
  }
  if (destinatarios.length === 0) return { acionada: false };

  const dataBrtStr = agora.toLocaleDateString("sv-SE", { timeZone: OPERACAO_TIMEZONE });
  const chave = montarChaveIdempotencia({
    tipo: "N6_VENCIMENTO_PORTAL",
    entidadeId: portal.id,
    janela: `${dataBrtStr}_D${diffDias}`,
  });

  const titulo =
    diffDias < 0
      ? `Portal Vencido: ${portal.nome} expirou há ${Math.abs(diffDias)} dia(s)`
      : diffDias === 0
        ? `Renovação de Portal: ${portal.nome} vence hoje`
        : `Renovação de Portal: ${portal.nome} vence em ${diffDias} dia(s)`;

  const res = await criarNotificacao({
    tipo: "N6_VENCIMENTO_PORTAL",
    titulo,
    descricao: `A assinatura da plataforma de compras ${portal.nome} requer renovação para evitar bloqueio de participação em certames.`,
    linkDestino: `/portais/${portal.id}`,
    chaveIdempotencia: chave,
    destinatarioIds: destinatarios,
  });

  if (res.criada) {
    await despacharNotificacoesExternas({
      destinatarioIds: destinatarios,
      tenantId: portal.tenantId ?? null,
      nomeItem: portal.nome,
      tipoItem: "PORTAL",
      diasRestantes: diffDias,
      descricao: `A assinatura da plataforma ${portal.nome} requer renovação.`,
      linkDestino: `/portais/${portal.id}`,
      eventoWhatsApp: "VENCIMENTO_PORTAL",
    }).catch(() => {});
  }

  return { acionada: res.criada };
}


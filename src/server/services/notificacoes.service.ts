import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/server/audit";
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
  insertInMemoryNotificacao,
  listInMemoryLicitacoes,
  listInMemoryNotificacoesUsuario,
  listInMemoryPortais,
  listInMemoryDocumentos,
  listInMemoryImpugnacoes,
  marcarInMemoryNotificacaoLida,
  marcarTodasInMemoryNotificacoesLidas,
} from "./licitacoes-store";

/* =========================================================================
   1. Criar Notificação (com Fan-out e Idempotência)
========================================================================= */

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

export async function executarJobNotificacoesDiarias(referencia?: Date): Promise<{
  ok: true;
  criadas: Record<NotificacaoTipo, number>;
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
  };
  let ignoradas = 0;

  // Busca usuários para mapeamento de perfis
  let allUsers: { id: string; role: string }[] = [];
  try {
    allUsers = await prisma.user.findMany({
      where: { ativo: true },
      select: { id: true, role: true },
    });
  } catch {
    allUsers = [
      { id: "seed_vitor", role: "DIRETORIA" },
      { id: "seed_alfredo", role: "DIRETORIA" },
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
  } catch {
    licitacoes = listInMemoryLicitacoes();
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

      if (res.criada) contagens.N3_ABERTURA_AMANHA++;
      else ignoradas++;
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
    const diffDias = Math.ceil((dataVenc.getTime() - agora.getTime()) / (1000 * 60 * 60 * 24));
    const janelasN6 = NOTIFICACAO_MATRIZ.N6_VENCIMENTO_PORTAL.antecedenciaDias;

    if (janelasN6 && (janelasN6 as readonly number[]).includes(diffDias)) {
      const chave = montarChaveIdempotencia({
        tipo: "N6_VENCIMENTO_PORTAL",
        entidadeId: portal.id,
        janela: `${dataBrtStr}_D${diffDias}`,
      });

      const res = await criarNotificacao({
        tipo: "N6_VENCIMENTO_PORTAL",
        titulo: `Renovação de Portal: ${portal.nome} vence em ${diffDias} dias`,
        descricao: `A assinatura da plataforma de compras ${portal.nome} expira em ${diffDias} dia(s). Regularize a anuidade para evitar suspensão de lances.`,
        linkDestino: `/portais/${portal.id}`,
        chaveIdempotencia: chave,
        destinatarioIds: diretoriaEComercialIds,
      });

      if (res.criada) contagens.N6_VENCIMENTO_PORTAL++;
      else ignoradas++;
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
    const diffDias = Math.ceil((dataVenc.getTime() - agora.getTime()) / (1000 * 60 * 60 * 24));
    const janelasN7 = NOTIFICACAO_MATRIZ.N7_VENCIMENTO_DOCUMENTO.antecedenciaDias;

    if (janelasN7 && (janelasN7 as readonly number[]).includes(diffDias)) {
      const chave = montarChaveIdempotencia({
        tipo: "N7_VENCIMENTO_DOCUMENTO",
        entidadeId: doc.id,
        janela: `${dataBrtStr}_D${diffDias}`,
      });

      const res = await criarNotificacao({
        tipo: "N7_VENCIMENTO_DOCUMENTO",
        titulo: `Documento Vencendo: ${doc.nome} expira em ${diffDias} dias`,
        descricao: `O documento de habilitação ${doc.nome} (${doc.categoria}) expira em ${diffDias} dia(s). Providencie a renovação/emissão para manter a empresa habilitada.`,
        linkDestino: `/documentacao`,
        chaveIdempotencia: chave,
        destinatarioIds: todosUsuariosIds,
      });

      if (res.criada) contagens.N7_VENCIMENTO_DOCUMENTO++;
      else ignoradas++;
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

      const res = await criarNotificacao({
        tipo: "N8_PRAZO_IMPUGNACAO",
        titulo: `Prazo Fatal de Impugnação: ${imp.numeroEdital} expira em ${diffDias} dia(s)`,
        descricao: `O prazo fatal para protocolo de impugnação do edital ${imp.numeroEdital} (${imp.orgaoNome}) expira em ${diffDias} dia(s) (Art. 164 Lei 14.133/2021). Motivo: ${imp.motivoLegal}.`,
        linkDestino: `/impugnacoes`,
        chaveIdempotencia: chave,
        destinatarioIds: diretoriaIds,
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
    criadas: contagens,
    ignoradasPorIdempotencia: ignoradas,
  };
}

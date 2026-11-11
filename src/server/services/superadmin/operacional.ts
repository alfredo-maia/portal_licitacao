import { randomUUID } from "node:crypto";
import { NotificacaoSeveridade, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuditActorContext } from "@/server/audit";
import {
  AdminCreateBroadcastSchema,
  OnboardingChecklist,
  RegistrarAiUsageInputSchema,
  SuperAdminMetrics,
  type AdminCreateBroadcastInput,
  type RegistrarAiUsageInput,
} from "@/server/schemas/superadmin.schema";
import {
  obterConfigEvolutionApi,
  obterStatusInstanciaWhatsApp,
} from "@/server/services/whatsapp.service";
import { inMemoryTenantUsers } from "@/server/services/tenant.service";
import { getInMemoryLeituraResumoPorChaves } from "@/server/services/licitacoes-store";
import { listarExecucoesIngestaoPncp } from "@/server/services/pncp-ingestao-diaria.service";
import { listarAfiliadosSuperAdmin } from "./financeiro";
import {
  DIA_MS,
  USD_BRL,
  VALOR_PLANO,
  dbTry,
  getErrorMessage,
  getMemWhatsAppConfig,
  gravarSetting,
  inicioDoDia,
  inicioDoMes,
  lerLogsIa,
  lerSetting,
  listarTenantsSuperAdmin,
  memAiLogs,
  memBroadcasts,
  precoPorMilhaoUsd,
  registrarAuditoriaAdm,
  setMemWhatsAppConfig,
  typedError,
  type MemAiLog,
  type MemBroadcast,
  type WhatsAppConfigState,
} from "./shared";

/* =========================================================================
   Dashboard Executivo (/admin)
========================================================================= */

async function contarTicketsAbertos(): Promise<number> {
  try {
    const { listarTicketsSuporte } = await import("@/server/services/suporte.service");
    const todos = await listarTicketsSuporte(null, null, { isSuperAdmin: true });
    return todos.filter((t) => t.status !== "CONCLUIDO").length;
  } catch {
    return 0;
  }
}

async function listarUltimasVitorias(): Promise<
  NonNullable<SuperAdminMetrics["ultimasVitorias"]>
> {
  const rows = await dbTry(() =>
    prisma.tenantLicitacao.findMany({
      where: { statusKanban: "CONTEMPLADA" },
      orderBy: { dataDecisao: "desc" },
      take: 5,
      include: {
        tenant: { select: { id: true, razaoSocial: true } },
        licitacao: { select: { numeroEdital: true, orgaoNome: true, valorEstimado: true } },
      },
    }),
  );
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => ({
    id: r.id,
    tenantId: r.tenantId,
    razaoSocial: r.tenant?.razaoSocial || "—",
    numeroEdital: r.licitacao?.numeroEdital || "—",
    orgaoNome: r.licitacao?.orgaoNome || "—",
    valorArrematado: r.valorHomologado || r.lanceMinimo || r.licitacao?.valorEstimado || 0,
    data: new Date(r.dataDecisao || Date.now()).toISOString(),
  }));
}

export async function obterMetricasSuperAdmin(): Promise<SuperAdminMetrics> {
  const whatsappStatus = await obterStatusInstanciaWhatsApp();
  const tenants = await listarTenantsSuperAdmin();

  let mrr = 0;
  let receitaEmRisco = 0;
  let ativos = 0;
  let trial = 0;
  let grace = 0;
  let bloqueados = 0;
  let cancelados = 0;
  let abandonados = 0;
  let engajados = 0;
  let volume = 0;
  let contempladas = 0;
  let r2 = 0;
  let novosHoje = 0;
  let novos7 = 0;
  let novos30 = 0;
  const agora = Date.now();
  const dia = inicioDoDia().getTime();

  for (const t of tenants) {
    const valor = t.valorMensalidade ?? VALOR_PLANO[t.plano] ?? 497;
    if (t.billingStatus === "ATIVO") {
      ativos++;
      mrr += valor;
    } else if (t.billingStatus === "GRACE_PERIOD") {
      grace++;
      mrr += valor;
      receitaEmRisco += valor;
    } else if (t.billingStatus === "TRIAL") {
      trial++;
      if (t.onboarding?.statusEngajamento === "CADASTROU_E_SAIU") abandonados++;
      if (t.onboarding?.statusEngajamento === "ENGAJADO") engajados++;
    } else if (t.billingStatus === "BLOQUEADO") {
      bloqueados++;
      receitaEmRisco += valor;
    } else {
      cancelados++;
    }
    volume += t.volumeArrematado;
    contempladas += t.totalContempladas;
    r2 += t.espacoUsadoMb;
    const criado = new Date(t.criadoEm).getTime();
    if (criado >= dia) novosHoje++;
    if (agora - criado <= 7 * DIA_MS) novos7++;
    if (agora - criado <= 30 * DIA_MS) novos30++;
  }

  const logsMes = await lerLogsIa(inicioDoMes());
  let gastoHoje = 0;
  let gastoMes = 0;
  let tokensHoje = 0;
  let chamadasHoje = 0;
  for (const l of logsMes) {
    const custo = Number(l.custoEstimadoBrl) || 0;
    gastoMes += custo;
    if (new Date(l.criadoEm).getTime() >= dia) {
      gastoHoje += custo;
      tokensHoje += Number(l.totalTokens) || 0;
      chamadasHoje++;
    }
  }

  const [ticketsAbertos, comissoes, execucoes, ultimasVitorias] = await Promise.all([
    contarTicketsAbertos(),
    listarAfiliadosSuperAdmin().catch(() => null),
    listarExecucoesIngestaoPncp(1).catch(() => []),
    listarUltimasVitorias(),
  ]);

  const comissoesPendentesBrl = (comissoes?.comissoes || [])
    .filter((c) => c.status === "PENDENTE")
    .reduce((acc, c) => acc + (c.valorComissao || 0), 0);

  const ultima = execucoes[0];

  return {
    mrrEstimado: Math.round(mrr * 100) / 100,
    arrEstimado: Math.round(mrr * 12 * 100) / 100,
    receitaEmRisco: Math.round(receitaEmRisco * 100) / 100,
    totalTenants: tenants.length,
    tenantsAtivos: ativos,
    tenantsTrial: trial,
    tenantsGracePeriod: grace,
    tenantsBloqueados: bloqueados,
    tenantsCancelados: cancelados,
    novosClientesHoje: novosHoje,
    novosClientes7d: novos7,
    novosClientes30d: novos30,
    trialsAbandonados: abandonados,
    trialsEngajados: engajados,
    totalVolumeArrematado: Math.round(volume * 100) / 100,
    totalLicitacoesContempladas: contempladas,
    r2StorageTotalMb: Math.round(r2 * 10) / 10,
    whatsappFilaPendentes: whatsappStatus.filaTamanho,
    whatsappInstanciaConectada: whatsappStatus.instanciaConectada,
    gastoIaHojeBrl: Math.round(gastoHoje * 100) / 100,
    gastoIaMesBrl: Math.round(gastoMes * 100) / 100,
    tokensIaHoje: Math.round(tokensHoje),
    chamadasIaHoje: chamadasHoje,
    ticketsAbertos,
    comissoesPendentesBrl: Math.round(comissoesPendentesBrl * 100) / 100,
    ultimaColetaStatus: ultima?.status || "SEM_EXECUCOES",
    ultimaColetaEm: ultima?.executadoEm ? new Date(ultima.executadoEm).toISOString() : null,
    ultimasVitorias,
  };
}

/* =========================================================================
   Telemetria de IA (/admin/ia)
========================================================================= */

export async function registrarConsumoIaSuperAdmin(
  rawInput: Partial<RegistrarAiUsageInput>,
) {
  const input = RegistrarAiUsageInputSchema.parse(rawInput);
  const preco = precoPorMilhaoUsd(input.model);
  const custoUsd =
    (input.promptTokens / 1_000_000) * preco.input +
    (input.outputTokens / 1_000_000) * preco.output;
  const dados = {
    tenantId: input.tenantId ?? null,
    userId: input.userId ?? null,
    usuarioNome: input.usuarioNome ?? null,
    empresaNome: input.empresaNome ?? null,
    licitacaoId: input.licitacaoId ?? null,
    feature: input.feature,
    provider: input.provider,
    model: input.model,
    promptTokens: input.promptTokens,
    outputTokens: input.outputTokens,
    totalTokens: input.promptTokens + input.outputTokens,
    custoEstimadoUsd: Math.round(custoUsd * 1_000_000) / 1_000_000,
    custoEstimadoBrl: Math.round(custoUsd * USD_BRL * 1_000_000) / 1_000_000,
    duracaoMs: input.duracaoMs,
    status: input.status,
    erro: input.erro ?? null,
  };
  const criado = await dbTry(() => prisma.aiUsageLog.create({ data: dados }));
  if (!criado) {
    memAiLogs.push({ id: `ai_${randomUUID()}`, ...dados, criadoEm: new Date() });
    if (memAiLogs.length > 5000) memAiLogs.splice(0, memAiLogs.length - 5000);
  }
  return { ok: true, ...dados };
}

interface AgrupadoIa {
  chave: string;
  rotulo: string;
  chamadas: number;
  tokens: number;
  gastoBrl: number;
}

export async function obterPainelConsumoIaSuperAdmin() {
  const logs = await lerLogsIa(inicioDoMes());
  const dia = inicioDoDia().getTime();

  let tokensHoje = 0;
  let gastoHojeBrl = 0;
  let gastoHojeUsd = 0;
  let chamadasHoje = 0;
  let tokensMes = 0;
  let gastoMesBrl = 0;
  let gastoMesUsd = 0;

  const grupos = {
    cliente: new Map<string, AgrupadoIa>(),
    usuario: new Map<string, AgrupadoIa>(),
    feature: new Map<string, AgrupadoIa>(),
    modelo: new Map<string, AgrupadoIa>(),
  };
  const serie = new Map<
    string,
    { data: string; gastoBrl: number; tokens: number; chamadas: number }
  >();

  const somar = (
    m: Map<string, AgrupadoIa>,
    chave: string,
    rotulo: string,
    l: MemAiLog,
    apenasHoje: boolean,
  ) => {
    if (apenasHoje && new Date(l.criadoEm).getTime() < dia) return;
    const cur = m.get(chave) || { chave, rotulo, chamadas: 0, tokens: 0, gastoBrl: 0 };
    cur.chamadas++;
    cur.tokens += Number(l.totalTokens) || 0;
    cur.gastoBrl += Number(l.custoEstimadoBrl) || 0;
    m.set(chave, cur);
  };

  for (const l of logs) {
    const tokens = Number(l.totalTokens) || 0;
    const brl = Number(l.custoEstimadoBrl) || 0;
    const usd = Number(l.custoEstimadoUsd) || 0;
    tokensMes += tokens;
    gastoMesBrl += brl;
    gastoMesUsd += usd;
    const ehHoje = new Date(l.criadoEm).getTime() >= dia;
    if (ehHoje) {
      tokensHoje += tokens;
      gastoHojeBrl += brl;
      gastoHojeUsd += usd;
      chamadasHoje++;
    }
    const dataStr = new Date(l.criadoEm).toLocaleDateString("en-CA", {
      timeZone: "America/Sao_Paulo",
    });
    const s = serie.get(dataStr) || { data: dataStr, gastoBrl: 0, tokens: 0, chamadas: 0 };
    s.gastoBrl += brl;
    s.tokens += tokens;
    s.chamadas++;
    serie.set(dataStr, s);

    somar(
      grupos.cliente,
      l.tenantId || "SEM_TENANT",
      l.empresaNome || l.tenantId || "Sem empresa",
      l,
      false,
    );
    somar(
      grupos.usuario,
      l.userId || l.usuarioNome || "SEM_USUARIO",
      l.usuarioNome || l.userId || "Sem usuário",
      l,
      false,
    );
    somar(grupos.feature, l.feature || "GERAL", l.feature || "GERAL", l, false);
    somar(grupos.modelo, l.model || "—", l.model || "—", l, false);
  }

  const ordenar = (m: Map<string, AgrupadoIa>) =>
    Array.from(m.values())
      .map((x) => ({ ...x, gastoBrl: Math.round(x.gastoBrl * 100) / 100 }))
      .sort((a, b) => b.gastoBrl - a.gastoBrl);

  const arred = (n: number) => Math.round(n * 100) / 100;
  return {
    totalTokensHoje: tokensHoje,
    chamadasHoje,
    gastoHojeBrl: arred(gastoHojeBrl),
    gastoHojeUsd: arred(gastoHojeUsd),
    totalTokensMes: tokensMes,
    chamadasMes: logs.length,
    gastoMesBrl: arred(gastoMesBrl),
    gastoMesUsd: arred(gastoMesUsd),
    cotacaoUsdBrl: USD_BRL,
    porCliente: ordenar(grupos.cliente).map((x) => ({
      tenantId: x.chave,
      empresaNome: x.rotulo,
      chamadas: x.chamadas,
      tokens: x.tokens,
      gastoBrl: x.gastoBrl,
    })),
    porUsuario: ordenar(grupos.usuario),
    porFeature: ordenar(grupos.feature),
    porModelo: ordenar(grupos.modelo),
    serieDiaria: Array.from(serie.values()).sort((a, b) => a.data.localeCompare(b.data)),
    ultimasChamadas: [...logs]
      .sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime())
      .slice(0, 30)
      .map((l) => ({
        id: l.id,
        criadoEm: new Date(l.criadoEm).toISOString(),
        empresaNome: l.empresaNome || l.tenantId || "—",
        usuarioNome: l.usuarioNome || l.userId || "—",
        feature: l.feature,
        model: l.model,
        tokens: Number(l.totalTokens) || 0,
        custoBrl: arred(Number(l.custoEstimadoBrl) || 0),
        status: l.status,
      })),
  };
}

/* =========================================================================
   Avisos em Massa (/admin/avisos)
========================================================================= */

function tenantCombinaPublico(
  publico: string,
  targetIds: string[],
  item: {
    id: string;
    plano: string;
    billingStatus: string;
    onboarding?: OnboardingChecklist;
    cnpjsVinculados?: Array<{ id: string }>;
  },
): boolean {
  switch (publico) {
    case "TODOS":
      return true;
    case "TRIAL":
      return item.billingStatus === "TRIAL";
    case "ABANDONO_TRIAL":
      return (
        item.billingStatus === "TRIAL" &&
        item.onboarding?.statusEngajamento === "CADASTROU_E_SAIU"
      );
    case "PAGANTES":
      return item.billingStatus === "ATIVO";
    case "INADIMPLENTES":
      return item.billingStatus === "GRACE_PERIOD" || item.billingStatus === "BLOQUEADO";
    case "PLANO_BASICO":
      return item.plano === "BASICO";
    case "PLANO_PRO":
      return item.plano === "PRO";
    case "PLANO_ENTERPRISE":
      return item.plano === "ENTERPRISE";
    case "ESPECIFICO":
      return (
        targetIds.includes(item.id) ||
        Boolean(item.cnpjsVinculados?.some((c) => targetIds.includes(c.id)))
      );
    default:
      return false;
  }
}

export async function criarAvisoEmMassaSuperAdmin(rawInput: AdminCreateBroadcastInput) {
  const input = AdminCreateBroadcastSchema.parse(rawInput);
  const tenants = await listarTenantsSuperAdmin();
  const matchedTenants = tenants.filter((t) =>
    tenantCombinaPublico(input.publicoAlvo, input.targetIds, t),
  );
  const totalDestinatarios = matchedTenants.length;
  const actor = getAuditActorContext();

  const dados = {
    titulo: input.titulo,
    mensagem: input.mensagem,
    severidade: input.severidade,
    formato: input.formato,
    publicoAlvo: input.publicoAlvo,
    targetIds: input.targetIds,
    linkDestino: input.linkDestino ?? null,
    ativo: true,
    expiraEm: input.expiraEm ? new Date(input.expiraEm) : null,
    criadoPorId: actor?.usuarioId ?? null,
    criadoPorNome: actor?.usuarioNome ?? "SuperAdmin Backoffice",
    totalDestinatarios,
  };
  let aviso: MemBroadcast | undefined = await dbTry(() =>
    prisma.systemBroadcast.create({ data: dados }),
  );
  if (!aviso) {
    aviso = { id: `bc_${randomUUID()}`, ...dados, criadoEm: new Date() };
    memBroadcasts.set(aviso.id, aviso);
  }

  // Se formato inclui SINO, entrega no sino global (/notificacoes) usando N12_AVISO_SISTEMA
  if ((input.formato === "SINO" || input.formato === "AMBOS") && matchedTenants.length > 0) {
    try {
      const targetUserIds = new Set<string>();
      const matchedIds = Array.from(
        new Set(
          matchedTenants.flatMap((t) => [
            t.id,
            ...(t.cnpjsVinculados?.map((c) => c.id) ?? []),
          ]),
        ),
      );
      const dbUsers = await dbTry(() =>
        prisma.tenantUser.findMany({
          where: { tenantId: { in: matchedIds }, ativo: true },
          select: { userId: true },
        }),
      );
      if (Array.isArray(dbUsers)) {
        for (const u of dbUsers) if (u.userId) targetUserIds.add(u.userId);
      }
      for (const tu of inMemoryTenantUsers) {
        if (matchedIds.includes(tu.tenantId) && tu.ativo) targetUserIds.add(tu.userId);
      }
      if (targetUserIds.size > 0) {
        const { criarNotificacao } = await import("@/server/services/notificacoes.service");
        const linkRelativo =
          input.linkDestino && input.linkDestino.startsWith("/")
            ? input.linkDestino
            : undefined;
        await criarNotificacao({
          tipo: "N12_AVISO_SISTEMA",
          titulo: input.titulo.slice(0, 160),
          descricao: input.mensagem.slice(0, 2000),
          severidade: input.severidade as NotificacaoSeveridade,
          linkDestino: linkRelativo,
          chaveIdempotencia: `AVISO_MASSA:${aviso.id}`,
          destinatarioIds: Array.from(targetUserIds),
        });
      }
    } catch {
      // Silencioso para manter broadcast ativo mesmo se notificação individual falhar
    }
  }

  await registrarAuditoriaAdm("DISPARAR_AVISO_EM_MASSA", "SYSTEM_BROADCAST", aviso.id, {
    titulo: input.titulo,
    publicoAlvo: input.publicoAlvo,
    totalDestinatarios,
  });
  return { ok: true, aviso, totalDestinatarios };
}

export async function listarAvisosEmMassaSuperAdmin() {
  const out = new Map<string, MemBroadcast>();
  const rows = await dbTry(() =>
    prisma.systemBroadcast.findMany({ orderBy: { criadoEm: "desc" }, take: 200 }),
  );
  if (Array.isArray(rows)) for (const r of rows) out.set(r.id, r);
  for (const [id, a] of memBroadcasts) if (!out.has(id)) out.set(id, a);

  const lista = Array.from(out.values()).sort(
    (a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime(),
  );
  const chaves = lista.map((a) => `AVISO_MASSA:${a.id}`);
  const leituraPorChave = getInMemoryLeituraResumoPorChaves(chaves);

  const dbNotifs = await dbTry(() =>
    prisma.notificacao.findMany({
      where: { chaveIdempotencia: { in: chaves } },
      select: {
        chaveIdempotencia: true,
        destinatarios: { select: { lidaEm: true } },
      },
    }),
  );
  if (Array.isArray(dbNotifs)) {
    for (const n of dbNotifs) {
      const dests = Array.isArray(n.destinatarios) ? n.destinatarios : [];
      leituraPorChave.set(n.chaveIdempotencia, {
        entregues: dests.length,
        lidas: dests.filter((d) => d.lidaEm !== null).length,
      });
    }
  }

  return lista.map((a) => {
    const stat = leituraPorChave.get(`AVISO_MASSA:${a.id}`) ?? { entregues: 0, lidas: 0 };
    const taxaLeituraPct =
      stat.entregues > 0 ? Math.round((stat.lidas / stat.entregues) * 100) : 0;
    return {
      ...a,
      totalEntreguesNotif: stat.entregues,
      totalLidas: stat.lidas,
      taxaLeituraPct,
    };
  });
}

export async function desativarAvisoEmMassaSuperAdmin(id: string) {
  const upd = await dbTry(() =>
    prisma.systemBroadcast.update({ where: { id }, data: { ativo: false } }),
  );
  const mem = memBroadcasts.get(id);
  if (mem) memBroadcasts.set(id, { ...mem, ativo: false });
  if (!upd && !mem) throw typedError("Aviso não encontrado.", 404);
  await registrarAuditoriaAdm("DESATIVAR_AVISO_EM_MASSA", "SYSTEM_BROADCAST", id);
  return { ok: true, id };
}

/** Avisos ativos que devem aparecer (banner/sino) para o CNPJ informado. */
export async function listarAvisosAtivosParaTenant(tenantId: string | null) {
  const todos = await listarAvisosEmMassaSuperAdmin();
  const agora = Date.now();
  const ativos = todos.filter(
    (a) => a.ativo && (!a.expiraEm || new Date(a.expiraEm).getTime() > agora),
  );
  if (ativos.length === 0) return [];
  const itens = await listarTenantsSuperAdmin();
  const alvo = tenantId
    ? itens.find(
        (t) =>
          t.id === tenantId ||
          Boolean(t.cnpjsVinculados?.some((c) => c.id === tenantId)),
      )
    : undefined;
  return ativos
    .filter((a) =>
      alvo
        ? tenantCombinaPublico(a.publicoAlvo, a.targetIds, alvo)
        : a.publicoAlvo === "TODOS",
    )
    .map((a) => ({
      id: a.id,
      titulo: a.titulo,
      mensagem: a.mensagem,
      severidade: a.severidade,
      formato: a.formato,
      linkDestino: a.linkDestino,
      criadoEm: a.criadoEm,
    }));
}

/* =========================================================================
   WhatsApp — QR Code, Jitter Anti-Ban, Fila e Opt-Out (/admin/whatsapp)
========================================================================= */

interface EvolutionQrResponse {
  instance?: { state?: string };
  state?: string;
  base64?: string;
  pairingCode?: string;
  qrcode?: { base64?: string; pairingCode?: string };
}

function svgPlaceholderQr(mensagem: string): string {
  const linhas = [mensagem, "Configure EVOLUTION_API_URL e EVOLUTION_API_KEY"];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="260" viewBox="0 0 260 260"><rect width="260" height="260" fill="#f4f4f4"/><rect x="10" y="10" width="240" height="240" fill="none" stroke="#8d8d8d" stroke-dasharray="6 4"/><text x="130" y="110" font-family="sans-serif" font-size="14" font-weight="bold" text-anchor="middle" fill="#161616">MODO SIMULAÇÃO</text><text x="130" y="140" font-family="sans-serif" font-size="10" text-anchor="middle" fill="#525252">${linhas[0]}</text><text x="130" y="158" font-family="sans-serif" font-size="9" text-anchor="middle" fill="#525252">${linhas[1]}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export async function gerarQrCodeWhatsAppSuperAdmin(): Promise<{
  ok: boolean;
  simulado: boolean;
  conectado: boolean;
  nomeInstancia: string;
  qrCodeSvgDataUrl: string | null;
  qrCodeImagemDataUrl: string | null;
  pairingCode: string | null;
  mensagem: string;
}> {
  const cfg = obterConfigEvolutionApi();
  const base = {
    nomeInstancia: cfg.instanceName,
    qrCodeSvgDataUrl: null as string | null,
    qrCodeImagemDataUrl: null as string | null,
    pairingCode: null as string | null,
  };

  if (!cfg.configurado || !cfg.url || !cfg.apiKey) {
    return {
      ok: true,
      simulado: true,
      conectado: false,
      ...base,
      qrCodeSvgDataUrl: svgPlaceholderQr("Evolution API não configurada"),
      mensagem: "Evolution API não configurada neste ambiente — exibindo QR de simulação.",
    };
  }

  const headers = { apikey: cfg.apiKey, "Content-Type": "application/json" };
  const instancia = encodeURIComponent(cfg.instanceName);
  try {
    const estado = await fetch(`${cfg.url}/instance/connectionState/${instancia}`, {
      headers,
      signal: AbortSignal.timeout(6000),
    });
    if (estado.ok) {
      const j = (await estado.json().catch(() => ({}))) as EvolutionQrResponse;
      const st = String(j?.instance?.state || j?.state || "").toLowerCase();
      if (st === "open" || st === "connected") {
        return {
          ok: true,
          simulado: false,
          conectado: true,
          ...base,
          mensagem: "Instância já conectada ao WhatsApp.",
        };
      }
    }

    let resp = await fetch(`${cfg.url}/instance/connect/${instancia}`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (resp.status === 404) {
      resp = await fetch(`${cfg.url}/instance/create`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          instanceName: cfg.instanceName,
          qrcode: true,
          integration: "WHATSAPP-BAILEYS",
        }),
        signal: AbortSignal.timeout(15000),
      });
    }
    if (!resp.ok) {
      return {
        ok: false,
        simulado: false,
        conectado: false,
        ...base,
        mensagem: `Evolution API respondeu HTTP ${resp.status} ao gerar o QR Code.`,
      };
    }
    const j = (await resp.json().catch(() => ({}))) as EvolutionQrResponse;
    const b64 = j?.base64 || j?.qrcode?.base64;
    return {
      ok: Boolean(b64 || j?.pairingCode),
      simulado: false,
      conectado: false,
      ...base,
      qrCodeImagemDataUrl: b64
        ? b64.startsWith("data:")
          ? b64
          : `data:image/png;base64,${b64}`
        : null,
      pairingCode: j?.pairingCode || j?.qrcode?.pairingCode || null,
      mensagem: b64
        ? "Escaneie o QR Code com o WhatsApp da empresa (Aparelhos conectados)."
        : "A Evolution API não retornou QR Code. Tente novamente em instantes.",
    };
  } catch (err: unknown) {
    return {
      ok: false,
      simulado: false,
      conectado: false,
      ...base,
      mensagem: `Falha ao contatar a Evolution API: ${getErrorMessage(err)}`,
    };
  }
}

export async function obterConfigWhatsAppSuperAdmin(): Promise<WhatsAppConfigState> {
  return lerSetting("whatsapp_jitter", getMemWhatsAppConfig());
}

export async function atualizarConfigWhatsAppSuperAdmin(
  rawInput: Partial<WhatsAppConfigState>,
) {
  const atual = await obterConfigWhatsAppSuperAdmin();
  const minDelaySegundos = Math.max(
    1,
    Math.floor(rawInput.minDelaySegundos ?? atual.minDelaySegundos),
  );
  const maxDelaySegundos = Math.max(
    minDelaySegundos,
    Math.floor(rawInput.maxDelaySegundos ?? atual.maxDelaySegundos),
  );
  const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
  const janelaInicio = rawInput.janelaInicio ?? atual.janelaInicio;
  const janelaFim = rawInput.janelaFim ?? atual.janelaFim;
  if (!hhmm.test(janelaInicio) || !hhmm.test(janelaFim)) {
    throw typedError("Janela de envio inválida (use HH:MM).", 400);
  }
  const config: WhatsAppConfigState = {
    minDelaySegundos,
    maxDelaySegundos,
    limiteDiarioWarmup: Math.max(
      1,
      Math.floor(rawInput.limiteDiarioWarmup ?? atual.limiteDiarioWarmup),
    ),
    janelaInicio,
    janelaFim,
  };
  setMemWhatsAppConfig(config);
  await gravarSetting("whatsapp_jitter", config);
  await registrarAuditoriaAdm("ATUALIZAR_CONFIG_WHATSAPP", "WHATSAPP", "jitter", {
    minDelaySegundos: config.minDelaySegundos,
    maxDelaySegundos: config.maxDelaySegundos,
    limiteDiarioWarmup: config.limiteDiarioWarmup,
    janelaInicio: config.janelaInicio,
    janelaFim: config.janelaFim,
  });
  return { ok: true, config };
}

export async function listarOptOutsWhatsAppSuperAdmin() {
  const { listarOptOutsWhatsApp } = await import("@/server/services/whatsapp.service");
  return listarOptOutsWhatsApp();
}

export async function removerOptOutWhatsAppSuperAdmin(telefone: string) {
  const { removerOptOutWhatsApp } = await import("@/server/services/whatsapp.service");
  const r = await removerOptOutWhatsApp(telefone);
  await registrarAuditoriaAdm("REMOVER_OPT_OUT_WHATSAPP", "WHATSAPP", r.telefone);
  return r;
}

export type { Prisma };


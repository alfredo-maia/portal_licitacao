import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";

export type UsageHealthStatus =
  | "USO_DIARIO"
  | "USO_SEMANAL"
  | "ESFRIANDO"
  | "SEM_USO";

export interface DailyActivitySeriesPoint {
  dataBrt: string;
  acessos: number;
  acoesValor: number;
}

export interface ModuleUsageCount {
  modulo: string;
  rotulo: string;
  acessos: number;
}

export interface ActionUsageCount {
  acao: string;
  rotulo: string;
  total: number;
}

export interface TenantUsageSummary {
  status: UsageHealthStatus;
  rotulo: string;
  diasAtivos7d: number;
  diasAtivos30d: number;
  totalAcessos30d: number;
  totalAcoesValor30d: number;
  ultimoAcessoEm: string | null;
  ultimaRota: string | null;
}

export interface TenantUsageDetailed extends TenantUsageSummary {
  tenantId: string;
  serie14Dias: DailyActivitySeriesPoint[];
  modulosTop: ModuleUsageCount[];
  acoesTop: ActionUsageCount[];
}

export interface UserUsageSummary {
  userId: string;
  nome: string;
  email: string;
  diasAtivos7d: number;
  diasAtivos30d: number;
  totalAcessos30d: number;
  totalAcoesValor30d: number;
  ultimoAcessoEm: string | null;
}

export interface MemDailyActivityRecord {
  id: string;
  tenantId: string;
  userId: string;
  usuarioNome: string | null;
  usuarioEmail: string | null;
  dataBrt: string;
  acessosCount: number;
  acoesValorCount: number;
  modulosVisitados: Record<string, number>;
  acoesPorTipo: Record<string, number>;
  ultimaRota: string | null;
  primeiroAcessoEm: Date;
  ultimoAcessoEm: Date;
}

const BRT_TZ = "America/Sao_Paulo";

export const MODULO_ROTULOS: Record<string, string> = {
  dashboard: "Dashboard",
  oportunidades: "Oportunidades",
  dossie: "Dossiê da Licitação",
  "minhas-licitacoes": "Minhas Licitações",
  "historico-licitacoes": "Histórico de Licitações",
  calendario: "Calendário",
  portais: "Portais de Licitações",
  documentacao: "Cofre / Documentação",
  declaracoes: "Declarações",
  impugnacoes: "Impugnações",
  "inteligencia-precos": "Inteligência de Preços",
  "robo-de-lances": "Robô de Lances",
  notificacoes: "Notificações",
  planos: "Planos & Assinatura",
  configuracoes: "Configurações",
  outros: "Outros",
};

export const ACAO_VALOR_ROTULOS: Record<string, string> = {
  deliberacao: "Deliberações (Participar/Recusar)",
  busca_historico: "Buscas no Histórico",
  analise_ia: "Análises de IA",
  documento_cofre: "Uploads no Cofre",
  declaracao_gerada: "Declarações Geradas",
  impugnacao_criada: "Impugnações Criadas",
  pdf_emitido: "PDFs Oficiais Emitidos",
  calculadora_salva: "Calculadora / Proposta Salva",
  atividade_operacional: "Ações Operacionais",
};

export const inMemoryDailyActivity = new Map<string, MemDailyActivityRecord>();

export function clearInMemoryDailyActivity(): void {
  inMemoryDailyActivity.clear();
}

export function dataCivilBrt(ref: Date = new Date()): string {
  return ref.toLocaleDateString("sv-SE", { timeZone: BRT_TZ });
}

function deslocarDiasBrt(ref: Date, deltaDias: number): string {
  return dataCivilBrt(new Date(ref.getTime() + deltaDias * 24 * 60 * 60 * 1000));
}

export function normalizarModuloDaRota(rawRota: string): string {
  const pathOnly = (rawRota || "/dashboard").split("?")[0]?.split("#")[0] || "/dashboard";
  if (pathOnly.startsWith("/oportunidades/") && pathOnly.length > "/oportunidades/".length) {
    return "dossie";
  }
  const seg = pathOnly.replace(/^\/+/, "").split("/")[0]?.toLowerCase() || "dashboard";
  return MODULO_ROTULOS[seg] ? seg : "outros";
}

export function classificarSaudeUso(params: {
  diasAtivos7d: number;
  diasAtivos30d: number;
  ultimoAcessoEm: Date | string | null | undefined;
  agora?: Date;
}): { status: UsageHealthStatus; rotulo: string } {
  const agora = params.agora ?? new Date();
  if (params.diasAtivos7d >= 3) {
    return { status: "USO_DIARIO", rotulo: "Uso diário" };
  }
  if (params.diasAtivos7d >= 1) {
    return { status: "USO_SEMANAL", rotulo: "Uso semanal" };
  }
  if (params.ultimoAcessoEm) {
    const dt = new Date(params.ultimoAcessoEm);
    if (!Number.isNaN(dt.getTime())) {
      const diffDias = (agora.getTime() - dt.getTime()) / (24 * 60 * 60 * 1000);
      if (diffDias <= 14) {
        return { status: "ESFRIANDO", rotulo: "Esfriando" };
      }
    }
  }
  return { status: "SEM_USO", rotulo: "Sem uso" };
}

function parseJsonCountMap(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) out[k] = Math.floor(n);
  }
  return out;
}

let tableEnsured = false;
async function ensureDailyActivityTable(): Promise<void> {
  if (tableEnsured) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "tenant_daily_activity" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "tenantId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "usuarioNome" TEXT,
        "usuarioEmail" TEXT,
        "dataBrt" VARCHAR(10) NOT NULL,
        "acessosCount" INTEGER NOT NULL DEFAULT 1,
        "acoesValorCount" INTEGER NOT NULL DEFAULT 0,
        "modulosVisitados" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "acoesPorTipo" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "ultimaRota" TEXT,
        "primeiroAcessoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "ultimoAcessoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "tenant_daily_activity_tenantId_userId_dataBrt_key"
      ON "tenant_daily_activity"("tenantId", "userId", "dataBrt");
    `);
    tableEnsured = true;
  } catch {
    // Em ambientes sem banco (unit tests) permanece em memória
  }
}

function keyMem(tenantId: string, userId: string, dataBrt: string): string {
  return `${tenantId}::${userId}::${dataBrt}`;
}

export async function registrarAtividadeCliente(params: {
  tenantId: string;
  userId: string;
  usuarioNome?: string | null;
  usuarioEmail?: string | null;
  rota: string;
  modulo?: string;
  ocorridoEm?: Date;
}): Promise<void> {
  if (!params.tenantId || !params.userId) return;
  const agora = params.ocorridoEm ?? new Date();
  const dataBrt = dataCivilBrt(agora);
  const modulo = params.modulo || normalizarModuloDaRota(params.rota);
  const rotaLimpa = params.rota.slice(0, 200);

  // 1. Atualiza store em memória (síncrono e imediato)
  const k = keyMem(params.tenantId, params.userId, dataBrt);
  const existing = inMemoryDailyActivity.get(k);
  if (existing) {
    existing.acessosCount += 1;
    existing.modulosVisitados[modulo] = (existing.modulosVisitados[modulo] || 0) + 1;
    existing.ultimaRota = rotaLimpa;
    if (agora.getTime() > existing.ultimoAcessoEm.getTime()) {
      existing.ultimoAcessoEm = agora;
    }
    if (params.usuarioNome) existing.usuarioNome = params.usuarioNome;
    if (params.usuarioEmail) existing.usuarioEmail = params.usuarioEmail;
  } else {
    inMemoryDailyActivity.set(k, {
      id: `tda_${randomUUID()}`,
      tenantId: params.tenantId,
      userId: params.userId,
      usuarioNome: params.usuarioNome ?? null,
      usuarioEmail: params.usuarioEmail ?? null,
      dataBrt,
      acessosCount: 1,
      acoesValorCount: 0,
      modulosVisitados: { [modulo]: 1 },
      acoesPorTipo: {},
      ultimaRota: rotaLimpa,
      primeiroAcessoEm: agora,
      ultimoAcessoEm: agora,
    });
  }

  // 2. Persiste no PostgreSQL (silencioso se DB indisponível)
  try {
    await ensureDailyActivityTable();
    const row = await prisma.tenantDailyActivity.findUnique({
      where: {
        tenantId_userId_dataBrt: {
          tenantId: params.tenantId,
          userId: params.userId,
          dataBrt,
        },
      },
    });
    if (row) {
      const mods = parseJsonCountMap(row.modulosVisitados);
      mods[modulo] = (mods[modulo] || 0) + 1;
      await prisma.tenantDailyActivity.update({
        where: { id: row.id },
        data: {
          acessosCount: { increment: 1 },
          modulosVisitados: mods,
          ultimaRota: rotaLimpa,
          ultimoAcessoEm: agora,
          ...(params.usuarioNome ? { usuarioNome: params.usuarioNome } : {}),
          ...(params.usuarioEmail ? { usuarioEmail: params.usuarioEmail } : {}),
        },
      });
    } else {
      await prisma.tenantDailyActivity.create({
        data: {
          tenantId: params.tenantId,
          userId: params.userId,
          usuarioNome: params.usuarioNome ?? null,
          usuarioEmail: params.usuarioEmail ?? null,
          dataBrt,
          acessosCount: 1,
          acoesValorCount: 0,
          modulosVisitados: { [modulo]: 1 },
          acoesPorTipo: {},
          ultimaRota: rotaLimpa,
          primeiroAcessoEm: agora,
          ultimoAcessoEm: agora,
        },
      });
    }

    await prisma.tenant
      .update({
        where: { id: params.tenantId },
        data: { ultimaAtividadeEm: agora },
      })
      .catch(() => undefined);
  } catch {
    // Nunca quebra fluxo do cliente por telemetria
  }
}

export async function registrarAcaoValorCliente(params: {
  tenantId?: string | null;
  userId?: string | null;
  usuarioNome?: string | null;
  usuarioEmail?: string | null;
  acao: string;
  rota?: string;
  ocorridoEm?: Date;
}): Promise<void> {
  if (!params.tenantId || !params.userId) return;
  const agora = params.ocorridoEm ?? new Date();
  const dataBrt = dataCivilBrt(agora);
  const acaoKey = params.acao.trim().toLowerCase() || "atividade_operacional";

  const k = keyMem(params.tenantId, params.userId, dataBrt);
  const existing = inMemoryDailyActivity.get(k);
  if (existing) {
    existing.acoesValorCount += 1;
    existing.acoesPorTipo[acaoKey] = (existing.acoesPorTipo[acaoKey] || 0) + 1;
    if (agora.getTime() > existing.ultimoAcessoEm.getTime()) {
      existing.ultimoAcessoEm = agora;
    }
  } else {
    inMemoryDailyActivity.set(k, {
      id: `tda_${randomUUID()}`,
      tenantId: params.tenantId,
      userId: params.userId,
      usuarioNome: params.usuarioNome ?? null,
      usuarioEmail: params.usuarioEmail ?? null,
      dataBrt,
      acessosCount: 1,
      acoesValorCount: 1,
      modulosVisitados: params.rota ? { [normalizarModuloDaRota(params.rota)]: 1 } : {},
      acoesPorTipo: { [acaoKey]: 1 },
      ultimaRota: params.rota ?? null,
      primeiroAcessoEm: agora,
      ultimoAcessoEm: agora,
    });
  }

  try {
    await ensureDailyActivityTable();
    const row = await prisma.tenantDailyActivity.findUnique({
      where: {
        tenantId_userId_dataBrt: {
          tenantId: params.tenantId,
          userId: params.userId,
          dataBrt,
        },
      },
    });
    if (row) {
      const acoes = parseJsonCountMap(row.acoesPorTipo);
      acoes[acaoKey] = (acoes[acaoKey] || 0) + 1;
      await prisma.tenantDailyActivity.update({
        where: { id: row.id },
        data: {
          acoesValorCount: { increment: 1 },
          acoesPorTipo: acoes,
          ultimoAcessoEm: agora,
        },
      });
    } else {
      await prisma.tenantDailyActivity.create({
        data: {
          tenantId: params.tenantId,
          userId: params.userId,
          usuarioNome: params.usuarioNome ?? null,
          usuarioEmail: params.usuarioEmail ?? null,
          dataBrt,
          acessosCount: 1,
          acoesValorCount: 1,
          modulosVisitados: params.rota ? { [normalizarModuloDaRota(params.rota)]: 1 } : {},
          acoesPorTipo: { [acaoKey]: 1 },
          ultimaRota: params.rota ?? null,
          primeiroAcessoEm: agora,
          ultimoAcessoEm: agora,
        },
      });
    }

    await prisma.tenant
      .update({
        where: { id: params.tenantId },
        data: { ultimaAtividadeEm: agora },
      })
      .catch(() => undefined);
  } catch {
    // Nunca quebra fluxo principal
  }
}

interface TenantAccumulator {
  dias7d: Set<string>;
  dias30d: Set<string>;
  totalAcessos30d: number;
  totalAcoesValor30d: number;
  ultimoAcessoMs: number;
  ultimaRota: string | null;
  porDia14: Map<string, { acessos: number; acoesValor: number }>;
  modulos: Map<string, number>;
  acoes: Map<string, number>;
}

interface UserAccumulator {
  userId: string;
  nome: string;
  email: string;
  dias7d: Set<string>;
  dias30d: Set<string>;
  totalAcessos30d: number;
  totalAcoesValor30d: number;
  ultimoAcessoMs: number;
}

function criarTenantAcc(dias14Lista: string[]): TenantAccumulator {
  const porDia14 = new Map<string, { acessos: number; acoesValor: number }>();
  for (const d of dias14Lista) {
    porDia14.set(d, { acessos: 0, acoesValor: 0 });
  }
  return {
    dias7d: new Set(),
    dias30d: new Set(),
    totalAcessos30d: 0,
    totalAcoesValor30d: 0,
    ultimoAcessoMs: 0,
    ultimaRota: null,
    porDia14,
    modulos: new Map(),
    acoes: new Map(),
  };
}

export async function agregarTelemetriaUsoTenants(
  tenantIds: string[],
  options?: {
    agora?: Date;
    incluirRetroativoDb?: boolean;
    usuariosBase?: Array<{
      id: string;
      name: string;
      email: string;
      ultimoLoginEm?: Date | string | null;
      tenants?: string[];
    }>;
  },
): Promise<{
  porTenant: Map<string, TenantUsageDetailed>;
  global: TenantUsageSummary;
  porUsuario: UserUsageSummary[];
}> {
  const agora = options?.agora ?? new Date();
  const incluirRetroativoDb = options?.incluirRetroativoDb !== false;
  const uniqueIds = Array.from(new Set(tenantIds.filter(Boolean)));
  const limite30dDate = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000);
  const dataMin30d = deslocarDiasBrt(agora, -29);
  const dataMin7d = deslocarDiasBrt(agora, -6);

  const dias14Lista: string[] = [];
  for (let i = 13; i >= 0; i--) {
    dias14Lista.push(deslocarDiasBrt(agora, -i));
  }

  const accMap = new Map<string, TenantAccumulator>();
  for (const tid of uniqueIds) {
    accMap.set(tid, criarTenantAcc(dias14Lista));
  }
  const userAccMap = new Map<string, UserAccumulator>();
  const globalDias7d = new Set<string>();
  const globalDias30d = new Set<string>();
  let globalAcessos30d = 0;
  let globalAcoesValor30d = 0;
  let globalUltimoMs = 0;
  let globalUltimaRota: string | null = null;

  const ensureUserAcc = (userId: string, nome?: string | null, email?: string | null) => {
    let u = userAccMap.get(userId);
    if (!u) {
      u = {
        userId,
        nome: nome || "Usuário",
        email: email || "—",
        dias7d: new Set(),
        dias30d: new Set(),
        totalAcessos30d: 0,
        totalAcoesValor30d: 0,
        ultimoAcessoMs: 0,
      };
      userAccMap.set(userId, u);
    } else {
      if (nome && u.nome === "Usuário") u.nome = nome;
      if (email && u.email === "—") u.email = email;
    }
    return u;
  };

  for (const ub of options?.usuariosBase || []) {
    const uAcc = ensureUserAcc(ub.id, ub.name, ub.email);
    if (ub.ultimoLoginEm) {
      const loginDt = new Date(ub.ultimoLoginEm);
      if (!Number.isNaN(loginDt.getTime())) {
        const ms = loginDt.getTime();
        if (ms > uAcc.ultimoAcessoMs) uAcc.ultimoAcessoMs = ms;
        const dBrt = dataCivilBrt(loginDt);
        if (dBrt >= dataMin30d) {
          uAcc.dias30d.add(dBrt);
          globalDias30d.add(dBrt);
          if (dBrt >= dataMin7d) {
            uAcc.dias7d.add(dBrt);
            globalDias7d.add(dBrt);
          }
          if (ms > globalUltimoMs) globalUltimoMs = ms;
          const tList = ub.tenants?.length ? ub.tenants : uniqueIds.slice(0, 1);
          for (const tid of tList) {
            const tAcc = accMap.get(tid);
            if (!tAcc) continue;
            tAcc.dias30d.add(dBrt);
            if (dBrt >= dataMin7d) tAcc.dias7d.add(dBrt);
            if (ms > tAcc.ultimoAcessoMs) tAcc.ultimoAcessoMs = ms;
            const slot = tAcc.porDia14.get(dBrt);
            if (slot && slot.acessos === 0) slot.acessos = 1;
          }
        }
      }
    }
  }

  const aplicarRegistro = (rec: {
    tenantId: string;
    userId?: string | null;
    usuarioNome?: string | null;
    usuarioEmail?: string | null;
    dataBrt: string;
    acessosCount: number;
    acoesValorCount: number;
    modulosVisitados: Record<string, number>;
    acoesPorTipo: Record<string, number>;
    ultimaRota: string | null;
    ultimoAcessoEm: Date;
  }) => {
    const tAcc = accMap.get(rec.tenantId);
    if (!tAcc) return;
    if (rec.dataBrt < dataMin30d) return;

    tAcc.dias30d.add(rec.dataBrt);
    globalDias30d.add(rec.dataBrt);
    if (rec.dataBrt >= dataMin7d) {
      tAcc.dias7d.add(rec.dataBrt);
      globalDias7d.add(rec.dataBrt);
    }

    tAcc.totalAcessos30d += rec.acessosCount;
    tAcc.totalAcoesValor30d += rec.acoesValorCount;
    globalAcessos30d += rec.acessosCount;
    globalAcoesValor30d += rec.acoesValorCount;

    const ms = rec.ultimoAcessoEm.getTime();
    if (ms > tAcc.ultimoAcessoMs) {
      tAcc.ultimoAcessoMs = ms;
      if (rec.ultimaRota) tAcc.ultimaRota = rec.ultimaRota;
    }
    if (ms > globalUltimoMs) {
      globalUltimoMs = ms;
      if (rec.ultimaRota) globalUltimaRota = rec.ultimaRota;
    }

    const slot = tAcc.porDia14.get(rec.dataBrt);
    if (slot) {
      slot.acessos += rec.acessosCount;
      slot.acoesValor += rec.acoesValorCount;
    }

    for (const [m, count] of Object.entries(rec.modulosVisitados)) {
      tAcc.modulos.set(m, (tAcc.modulos.get(m) || 0) + count);
    }
    for (const [a, count] of Object.entries(rec.acoesPorTipo)) {
      tAcc.acoes.set(a, (tAcc.acoes.get(a) || 0) + count);
    }

    if (rec.userId) {
      const uAcc = ensureUserAcc(rec.userId, rec.usuarioNome, rec.usuarioEmail);
      uAcc.dias30d.add(rec.dataBrt);
      if (rec.dataBrt >= dataMin7d) uAcc.dias7d.add(rec.dataBrt);
      uAcc.totalAcessos30d += rec.acessosCount;
      uAcc.totalAcoesValor30d += rec.acoesValorCount;
      if (ms > uAcc.ultimoAcessoMs) uAcc.ultimoAcessoMs = ms;
    }
  };

  // 1. Ler tabela tenant_daily_activity (DB)
  const seenKeys = new Set<string>();
  if (uniqueIds.length > 0 && incluirRetroativoDb) {
    try {
      await ensureDailyActivityTable();
      const dbRows = await prisma.tenantDailyActivity.findMany({
        where: {
          tenantId: { in: uniqueIds },
          dataBrt: { gte: dataMin30d },
        },
      });
      for (const r of dbRows) {
        seenKeys.add(keyMem(r.tenantId, r.userId, r.dataBrt));
        aplicarRegistro({
          tenantId: r.tenantId,
          userId: r.userId,
          usuarioNome: r.usuarioNome,
          usuarioEmail: r.usuarioEmail,
          dataBrt: r.dataBrt,
          acessosCount: r.acessosCount,
          acoesValorCount: r.acoesValorCount,
          modulosVisitados: parseJsonCountMap(r.modulosVisitados),
          acoesPorTipo: parseJsonCountMap(r.acoesPorTipo),
          ultimaRota: r.ultimaRota,
          ultimoAcessoEm: new Date(r.ultimoAcessoEm),
        });
      }
    } catch {
      // Fallback apenas memória
    }
  }

  // 2. Mesclar registros em memória ainda não presentes no DB
  for (const r of inMemoryDailyActivity.values()) {
    if (!accMap.has(r.tenantId)) continue;
    const k = keyMem(r.tenantId, r.userId, r.dataBrt);
    if (seenKeys.has(k)) continue;
    aplicarRegistro(r);
  }

  // 3. Enriquecimento retroativo com dados operacionais dos últimos 30 dias já existentes no banco
  if (uniqueIds.length > 0 && incluirRetroativoDb) {
    try {
      const [audits, aiLogs, tLics, docs] = await Promise.all([
        prisma.auditLog
          .findMany({
            where: {
              tenantId: { in: uniqueIds },
              ocorridoEm: { gte: limite30dDate },
            },
            select: {
              tenantId: true,
              usuarioId: true,
              usuarioNome: true,
              acao: true,
              ocorridoEm: true,
            },
            take: 1500,
          })
          .catch(() => []),
        prisma.aiUsageLog
          .findMany({
            where: {
              tenantId: { in: uniqueIds },
              criadoEm: { gte: limite30dDate },
            },
            select: {
              tenantId: true,
              userId: true,
              usuarioNome: true,
              criadoEm: true,
            },
            take: 500,
          })
          .catch(() => []),
        prisma.tenantLicitacao
          .findMany({
            where: {
              tenantId: { in: uniqueIds },
              atualizadoEm: { gte: limite30dDate },
            },
            select: {
              tenantId: true,
              responsavelId: true,
              atualizadoEm: true,
            },
            take: 500,
          })
          .catch(() => []),
        prisma.documento
          .findMany({
            where: {
              tenantId: { in: uniqueIds },
              criadoEm: { gte: limite30dDate },
            },
            select: {
              tenantId: true,
              criadoPorId: true,
              criadoEm: true,
            },
            take: 500,
          })
          .catch(() => []),
      ]);

      for (const a of audits) {
        if (!a.tenantId) continue;
        const dt = new Date(a.ocorridoEm);
        const dBrt = dataCivilBrt(dt);
        // Só injeta retroativamente se não houver linha daily_activity para o mesmo dia/usuário
        if (a.usuarioId && seenKeys.has(keyMem(a.tenantId, a.usuarioId, dBrt))) continue;
        aplicarRegistro({
          tenantId: a.tenantId,
          userId: a.usuarioId,
          usuarioNome: a.usuarioNome,
          usuarioEmail: null,
          dataBrt: dBrt,
          acessosCount: 1,
          acoesValorCount: 1,
          modulosVisitados: {},
          acoesPorTipo: { atividade_operacional: 1 },
          ultimaRota: null,
          ultimoAcessoEm: dt,
        });
      }

      for (const l of aiLogs) {
        if (!l.tenantId) continue;
        const dt = new Date(l.criadoEm);
        const dBrt = dataCivilBrt(dt);
        if (l.userId && seenKeys.has(keyMem(l.tenantId, l.userId, dBrt))) continue;
        aplicarRegistro({
          tenantId: l.tenantId,
          userId: l.userId,
          usuarioNome: l.usuarioNome,
          usuarioEmail: null,
          dataBrt: dBrt,
          acessosCount: 1,
          acoesValorCount: 1,
          modulosVisitados: { dossie: 1 },
          acoesPorTipo: { analise_ia: 1 },
          ultimaRota: null,
          ultimoAcessoEm: dt,
        });
      }

      for (const tl of tLics) {
        const dt = new Date(tl.atualizadoEm);
        const dBrt = dataCivilBrt(dt);
        if (tl.responsavelId && seenKeys.has(keyMem(tl.tenantId, tl.responsavelId, dBrt))) continue;
        aplicarRegistro({
          tenantId: tl.tenantId,
          userId: tl.responsavelId,
          usuarioNome: null,
          usuarioEmail: null,
          dataBrt: dBrt,
          acessosCount: 1,
          acoesValorCount: 1,
          modulosVisitados: { "minhas-licitacoes": 1 },
          acoesPorTipo: { deliberacao: 1 },
          ultimaRota: null,
          ultimoAcessoEm: dt,
        });
      }

      for (const d of docs) {
        if (!d.tenantId) continue;
        const dt = new Date(d.criadoEm);
        const dBrt = dataCivilBrt(dt);
        if (d.criadoPorId && seenKeys.has(keyMem(d.tenantId, d.criadoPorId, dBrt))) continue;
        aplicarRegistro({
          tenantId: d.tenantId,
          userId: d.criadoPorId,
          usuarioNome: null,
          usuarioEmail: null,
          dataBrt: dBrt,
          acessosCount: 1,
          acoesValorCount: 1,
          modulosVisitados: { documentacao: 1 },
          acoesPorTipo: { documento_cofre: 1 },
          ultimaRota: null,
          ultimoAcessoEm: dt,
        });
      }
    } catch {
      // Silencioso em ambientes sem DB
    }
  }

  // 4. Montar saídas finais
  const porTenant = new Map<string, TenantUsageDetailed>();
  for (const [tid, acc] of accMap.entries()) {
    const ultimoAcessoDt = acc.ultimoAcessoMs > 0 ? new Date(acc.ultimoAcessoMs) : null;
    const saude = classificarSaudeUso({
      diasAtivos7d: acc.dias7d.size,
      diasAtivos30d: acc.dias30d.size,
      ultimoAcessoEm: ultimoAcessoDt,
      agora,
    });

    const modulosTop: ModuleUsageCount[] = Array.from(acc.modulos.entries())
      .map(([modulo, acessos]) => ({
        modulo,
        rotulo: MODULO_ROTULOS[modulo] || modulo,
        acessos,
      }))
      .sort((a, b) => b.acessos - a.acessos)
      .slice(0, 8);

    const acoesTop: ActionUsageCount[] = Array.from(acc.acoes.entries())
      .map(([acao, total]) => ({
        acao,
        rotulo: ACAO_VALOR_ROTULOS[acao] || acao,
        total,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);

    const serie14Dias: DailyActivitySeriesPoint[] = dias14Lista.map((dataBrt) => {
      const slot = acc.porDia14.get(dataBrt) || { acessos: 0, acoesValor: 0 };
      return { dataBrt, acessos: slot.acessos, acoesValor: slot.acoesValor };
    });

    porTenant.set(tid, {
      tenantId: tid,
      status: saude.status,
      rotulo: saude.rotulo,
      diasAtivos7d: acc.dias7d.size,
      diasAtivos30d: acc.dias30d.size,
      totalAcessos30d: acc.totalAcessos30d,
      totalAcoesValor30d: acc.totalAcoesValor30d,
      ultimoAcessoEm: ultimoAcessoDt ? ultimoAcessoDt.toISOString() : null,
      ultimaRota: acc.ultimaRota,
      serie14Dias,
      modulosTop,
      acoesTop,
    });
  }

  const globalUltimoDt = globalUltimoMs > 0 ? new Date(globalUltimoMs) : null;
  const globalSaude = classificarSaudeUso({
    diasAtivos7d: globalDias7d.size,
    diasAtivos30d: globalDias30d.size,
    ultimoAcessoEm: globalUltimoDt,
    agora,
  });

  const global: TenantUsageSummary = {
    status: globalSaude.status,
    rotulo: globalSaude.rotulo,
    diasAtivos7d: globalDias7d.size,
    diasAtivos30d: globalDias30d.size,
    totalAcessos30d: globalAcessos30d,
    totalAcoesValor30d: globalAcoesValor30d,
    ultimoAcessoEm: globalUltimoDt ? globalUltimoDt.toISOString() : null,
    ultimaRota: globalUltimaRota,
  };

  const porUsuario: UserUsageSummary[] = Array.from(userAccMap.values())
    .map((u) => ({
      userId: u.userId,
      nome: u.nome,
      email: u.email,
      diasAtivos7d: u.dias7d.size,
      diasAtivos30d: u.dias30d.size,
      totalAcessos30d: u.totalAcessos30d,
      totalAcoesValor30d: u.totalAcoesValor30d,
      ultimoAcessoEm: u.ultimoAcessoMs > 0 ? new Date(u.ultimoAcessoMs).toISOString() : null,
    }))
    .sort((a, b) => b.diasAtivos7d - a.diasAtivos7d || b.totalAcessos30d - a.totalAcessos30d);

  return { porTenant, global, porUsuario };
}

/**
 * Consolida a saúde de uso global de uma conta multi-CNPJ a partir dos detalhes por empresa,
 * fazendo a união exata dos dias distintos nos últimos 7 dias (sem consultas extras ao DB).
 */
export function consolidarUsoContaMultiCnpj(
  lista: TenantUsageDetailed[],
  fallbackUltimaAtividade?: Date | string | null,
  agora: Date = new Date(),
): TenantUsageSummary {
  const dias7Set = new Set<string>();
  let totalAcessos30d = 0;
  let totalAcoesValor30d = 0;
  let maxDias30d = 0;
  let ultimoMs = 0;
  let ultimaRota: string | null = null;

  if (fallbackUltimaAtividade) {
    const fb = new Date(fallbackUltimaAtividade);
    if (!Number.isNaN(fb.getTime())) {
      ultimoMs = fb.getTime();
    }
  }

  for (const u of lista) {
    totalAcessos30d += u.totalAcessos30d;
    totalAcoesValor30d += u.totalAcoesValor30d;
    if (u.diasAtivos30d > maxDias30d) maxDias30d = u.diasAtivos30d;
    const ultimos7 = u.serie14Dias.slice(-7);
    for (const pt of ultimos7) {
      if (pt.acessos > 0 || pt.acoesValor > 0) {
        dias7Set.add(pt.dataBrt);
      }
    }
    if (u.ultimoAcessoEm) {
      const ms = new Date(u.ultimoAcessoEm).getTime();
      if (!Number.isNaN(ms) && ms > ultimoMs) {
        ultimoMs = ms;
        if (u.ultimaRota) ultimaRota = u.ultimaRota;
      }
    }
  }

  const diasAtivos7d = dias7Set.size;
  const diasAtivos30d = Math.min(30, Math.max(maxDias30d, diasAtivos7d));
  const ultimoDt = ultimoMs > 0 ? new Date(ultimoMs) : null;
  const saude = classificarSaudeUso({
    diasAtivos7d,
    diasAtivos30d,
    ultimoAcessoEm: ultimoDt,
    agora,
  });

  return {
    status: saude.status,
    rotulo: saude.rotulo,
    diasAtivos7d,
    diasAtivos30d,
    totalAcessos30d,
    totalAcoesValor30d,
    ultimoAcessoEm: ultimoDt ? ultimoDt.toISOString() : null,
    ultimaRota,
  };
}

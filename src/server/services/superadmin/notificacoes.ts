import { randomUUID } from "node:crypto";
import {
  AdminNotificationItemSchema,
  type AdminNotificationCategory,
  type AdminNotificationItem,
} from "@/server/schemas/superadmin.schema";
import { gravarSetting, lerSetting, typedError } from "./shared";

const ADMIN_NOTIFICACOES_SETTING_KEY = "admin_notificacoes_central";
const MAX_ADMIN_NOTIFICACOES = 300;
let notificacaoWriteQueue: Promise<unknown> = Promise.resolve();

function withNotificacaoWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const exec = notificacaoWriteQueue.catch(() => undefined).then(fn);
  notificacaoWriteQueue = exec;
  return exec;
}

export type AdminNotificationView = AdminNotificationItem & {
  lida: boolean;
};

export async function criarNotificacaoAdmin(params: {
  categoria: AdminNotificationCategory;
  titulo: string;
  descricao: string;
  severidade?: "INFO" | "ATENCAO" | "CRITICA";
  somenteMaster?: boolean;
  tenantId?: string | null;
  linkDestino?: string | null;
  atorNome?: string | null;
  metadados?: Record<string, unknown>;
}): Promise<AdminNotificationItem> {
  return withNotificacaoWriteLock(async () => {
    const atu = await lerSetting<AdminNotificationItem[]>(
      ADMIN_NOTIFICACOES_SETTING_KEY,
      [],
    );
    const lista = Array.isArray(atu) ? atu : [];

    const ehFinanceiroFraude = params.categoria === "ACAO_FATURAMENTO_ADM";
    const item = AdminNotificationItemSchema.parse({
      id: `adm_notif_${randomUUID()}`,
      categoria: params.categoria,
      titulo: params.titulo,
      descricao: params.descricao,
      severidade: params.severidade ?? (ehFinanceiroFraude ? "ATENCAO" : "INFO"),
      somenteMaster: ehFinanceiroFraude ? true : Boolean(params.somenteMaster),
      tenantId: params.tenantId ?? null,
      linkDestino: params.linkDestino ?? null,
      atorNome: params.atorNome ?? null,
      metadados: params.metadados,
      lidaPor: [],
      criadaEm: new Date().toISOString(),
    });

    const proxima = [item, ...lista].slice(0, MAX_ADMIN_NOTIFICACOES);
    await gravarSetting(ADMIN_NOTIFICACOES_SETTING_KEY, proxima);
    return item;
  });
}

function podeVerNotificacao(
  item: AdminNotificationItem,
  adminRole?: string | null,
): boolean {
  const isMaster = adminRole === "SUPERADMIN_MASTER";
  if (item.somenteMaster || item.categoria === "ACAO_FATURAMENTO_ADM") {
    return isMaster;
  }
  return true;
}

export async function listarNotificacoesAdminSuperAdmin(params: {
  adminRole?: string | null;
  userId?: string | null;
  categoria?: string;
  somenteNaoLidas?: boolean;
  limite?: number;
}): Promise<{
  notificacoes: AdminNotificationView[];
  naoLidas: number;
}> {
  const bruto = await lerSetting<AdminNotificationItem[]>(
    ADMIN_NOTIFICACOES_SETTING_KEY,
    [],
  );
  const base = Array.isArray(bruto) ? bruto : [];
  const visiveis = base.filter((item) => podeVerNotificacao(item, params.adminRole));

  const uid = params.userId?.trim() || "";
  const comStatus: AdminNotificationView[] = visiveis.map((item) => ({
    ...item,
    lida: Boolean(uid && Array.isArray(item.lidaPor) && item.lidaPor.includes(uid)),
  }));

  const naoLidas = comStatus.filter((n) => !n.lida).length;

  let filtradas = comStatus;
  if (params.categoria && params.categoria !== "TODAS") {
    filtradas = filtradas.filter((n) => n.categoria === params.categoria);
  }
  if (params.somenteNaoLidas) {
    filtradas = filtradas.filter((n) => !n.lida);
  }

  const limite = Math.max(1, Math.min(300, params.limite ?? 100));
  return {
    notificacoes: filtradas.slice(0, limite),
    naoLidas,
  };
}

export async function marcarNotificacaoAdminLidaSuperAdmin(
  id: string,
  userId: string,
  adminRole?: string | null,
): Promise<{ ok: boolean; id: string }> {
  return withNotificacaoWriteLock(async () => {
    const bruto = await lerSetting<AdminNotificationItem[]>(
      ADMIN_NOTIFICACOES_SETTING_KEY,
      [],
    );
    const lista = Array.isArray(bruto) ? [...bruto] : [];
    const idx = lista.findIndex((item) => item.id === id);
    if (idx === -1) {
      throw typedError("Notificação administrativa não encontrada.", 404);
    }
    if (!podeVerNotificacao(lista[idx], adminRole)) {
      throw typedError("Notificação administrativa não encontrada.", 404);
    }

    const lidaPor = Array.isArray(lista[idx].lidaPor) ? [...lista[idx].lidaPor] : [];
    if (userId && !lidaPor.includes(userId)) {
      lidaPor.push(userId);
    }
    lista[idx] = { ...lista[idx], lidaPor };
    await gravarSetting(ADMIN_NOTIFICACOES_SETTING_KEY, lista);
    return { ok: true, id };
  });
}

export async function marcarTodasNotificacoesAdminLidasSuperAdmin(
  userId: string,
  adminRole?: string | null,
): Promise<{ ok: boolean; atualizadas: number }> {
  return withNotificacaoWriteLock(async () => {
    const bruto = await lerSetting<AdminNotificationItem[]>(
      ADMIN_NOTIFICACOES_SETTING_KEY,
      [],
    );
    const lista = Array.isArray(bruto) ? [...bruto] : [];
    let atualizadas = 0;

    const proxima = lista.map((item) => {
      if (!podeVerNotificacao(item, adminRole)) return item;
      const lidaPor = Array.isArray(item.lidaPor) ? [...item.lidaPor] : [];
      if (userId && !lidaPor.includes(userId)) {
        lidaPor.push(userId);
        atualizadas++;
        return { ...item, lidaPor };
      }
      return item;
    });

    await gravarSetting(ADMIN_NOTIFICACOES_SETTING_KEY, proxima);
    return { ok: true, atualizadas };
  });
}

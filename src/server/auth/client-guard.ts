import { NextResponse } from "next/server";

export interface SessionActorClaims {
  id?: string | null;
  email?: string | null;
  name?: string | null;
  role?: string | null;
  ativo?: boolean;
  isSuperAdmin?: boolean | null;
  adminRole?: string | null;
  activeTenantId?: string | null;
  plano?: string | null;
  cnpj?: string | null;
  telefone?: string | null;
  tenantRole?: string | null;
}

const MASTER_ADMIN_EMAIL = "vitorhenrique018@gmail.com";

export function isSuperAdminSessionUser(
  user: SessionActorClaims | null | undefined,
): boolean {
  if (!user) return false;
  const normalizedEmail =
    typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
  return (
    user.role === "SUPERADMIN" ||
    user.isSuperAdmin === true ||
    Boolean(user.adminRole) ||
    normalizedEmail === MASTER_ADMIN_EMAIL
  );
}

export function respostaNaoAutenticadoCliente(): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error: "UNAUTHORIZED",
      message: "Sessão de usuário não autenticada.",
    },
    { status: 401 },
  );
}

export function respostaProibidaAdminEmRotaCliente(): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error: "FORBIDDEN",
      message:
        "Contas administrativas do Portal ADM não podem acessar APIs da área do cliente.",
    },
    { status: 403 },
  );
}

export type ClientApiGuardResult =
  | { ok: true; user: SessionActorClaims & { id: string } }
  | { ok: false; response: NextResponse };

export function exigirClienteEmApi(
  user: SessionActorClaims | null | undefined,
): ClientApiGuardResult {
  if (!user?.id) {
    return { ok: false, response: respostaNaoAutenticadoCliente() };
  }
  if (isSuperAdminSessionUser(user)) {
    return { ok: false, response: respostaProibidaAdminEmRotaCliente() };
  }
  return {
    ok: true,
    user: {
      ...user,
      id: user.id,
    },
  };
}

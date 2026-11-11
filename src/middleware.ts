import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const PUBLIC_ROUTES = [
  "/login",
  "/admin/login",
  "/cadastro",
  "/esqueci-senha",
  "/recuperar-senha",
];

async function resolveDecodedToken(req: NextRequest) {
  const secret = process.env.NEXTAUTH_SECRET || "pncp-dev-secret-2026";
  const hasSecureCookie = Boolean(
    req.cookies.get("__Secure-next-auth.session-token")?.value,
  );
  const hasStandardCookie = Boolean(
    req.cookies.get("next-auth.session-token")?.value,
  );
  const hasPortalCookie = Boolean(
    req.cookies.get("portal_licitacao_token")?.value,
  );

  if (!hasSecureCookie && !hasStandardCookie && !hasPortalCookie) {
    return null;
  }

  let token = null;
  if (hasSecureCookie) {
    token = await getToken({ req, secret, secureCookie: true });
  }
  if (!token && hasStandardCookie) {
    token = await getToken({ req, secret, secureCookie: false });
  }
  if (!token) {
    token = await getToken({ req, secret });
  }
  return token;
}

/**
 * Middleware de Segurança, Autenticação Estrita e Governança Multi-Tenant (PRD §6, §13 / ADR 0010 / Issue #20 / Issue #50):
 * 1. Isolamento Bidirecional (ADM <-> Cliente): Sessão ativa de SuperAdmin fora de /admin redireciona para /admin; cliente em /admin/login redireciona para /dashboard.
 * 2. Rotas Públicas: Libera /login, /admin/login, /cadastro, /esqueci-senha, /recuperar-senha sem verificação de sessão.
 * 3. Barreira Invisível para o Portal SuperAdmin (/admin): Retorna /404 para não administradores.
 * 4. Proteção Estrita de Rotas Pós-Logout: Redireciona (307) para /login se não houver cookie de sessão ativo.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const hasSession = Boolean(
    req.cookies.get("next-auth.session-token")?.value ||
      req.cookies.get("__Secure-next-auth.session-token")?.value ||
      req.cookies.get("portal_licitacao_token")?.value,
  );

  const token = hasSession ? await resolveDecodedToken(req) : null;
  const isRevoked = Boolean(token?.sessionRevoked || token?.ativo === false);
  const tokenEmail =
    typeof token?.email === "string" ? token.email.trim().toLowerCase() : "";
  const isSuper =
    Boolean(token) &&
    !isRevoked &&
    (token?.role === "SUPERADMIN" ||
      token?.isSuperAdmin === true ||
      Boolean(token?.adminRole) ||
      tokenEmail === "vitorhenrique018@gmail.com");

  // Proteção de rotas /api/* antes de redirecionamentos de página:
  // Bloqueia contas SuperAdmin nas APIs da área de clientes com HTTP 403 JSON,
  // liberando apenas /api/admin/*, /api/auth/*, /api/webhooks/* e /api/cron/*.
  if (pathname === "/api" || pathname.startsWith("/api/")) {
    if (
      isSuper &&
      pathname !== "/api/admin" &&
      !pathname.startsWith("/api/admin/") &&
      pathname !== "/api/auth" &&
      !pathname.startsWith("/api/auth/") &&
      !pathname.startsWith("/api/webhooks/") &&
      !pathname.startsWith("/api/cron/")
    ) {
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
    return NextResponse.next();
  }

  // Isolamento estrito entre Portal ADM e Área de Clientes quando houver token JWT decodificado
  if (token && !isRevoked) {
    const isAdminLogin =
      pathname === "/admin/login" || pathname.startsWith("/admin/login/");
    const isAdminArea = pathname === "/admin" || pathname.startsWith("/admin/");

    if (isSuper) {
      if (isAdminLogin || !isAdminArea) {
        const adminUrl = req.nextUrl.clone();
        adminUrl.pathname = "/admin";
        return NextResponse.redirect(adminUrl, 307);
      }
    } else if (isAdminLogin) {
      const dashUrl = req.nextUrl.clone();
      dashUrl.pathname = "/dashboard";
      return NextResponse.redirect(dashUrl, 307);
    }
  }

  // 1. Liberação de rotas públicas de autenticação
  const isPublicRoute = PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  if (isPublicRoute) {
    return NextResponse.next();
  }

  // 2. Proteção de Borda Defensiva para o Portal SuperAdmin (/admin)
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (!isSuper) {
      // Reescreve para /404 simulando página inexistente para qualquer cliente ou bot
      const notFoundUrl = req.nextUrl.clone();
      notFoundUrl.pathname = "/404";
      return NextResponse.rewrite(notFoundUrl);
    }
    return NextResponse.next();
  }

  // 3. Verificação de Sessão Ativa em Rotas Protegidas
  if (!hasSession) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl, 307);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};

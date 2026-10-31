import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const PUBLIC_ROUTES = [
  "/login",
  "/cadastro",
  "/esqueci-senha",
  "/recuperar-senha",
];

/**
 * Middleware de Segurança, Autenticação Estrita e Governança Multi-Tenant (PRD §6, §13 / ADR 0010 / Issue #20):
 * 1. Rotas Públicas: Libera /login, /cadastro, /esqueci-senha sem verificação de sessão.
 * 2. Barreira Invisível para o Portal SuperAdmin (/admin): Retorna 404 para não administradores.
 * 3. Proteção Estrita de Rotas Pós-Logout: Redireciona (307) para /login se não houver cookie de sessão ativo.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Liberação de rotas públicas de autenticação
  const isPublicRoute = PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  if (isPublicRoute) {
    return NextResponse.next();
  }

  // 2. Proteção de Borda Defensiva para o Portal SuperAdmin (/admin)
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const hasSecureCookie = Boolean(
      req.cookies.get("__Secure-next-auth.session-token")?.value,
    );
    const hasStandardCookie = Boolean(
      req.cookies.get("next-auth.session-token")?.value,
    );

    let token = null;

    if (hasSecureCookie) {
      token = await getToken({
        req,
        secret: process.env.NEXTAUTH_SECRET || "pncp-dev-secret-2026",
        secureCookie: true,
      });
    }

    if (!token && hasStandardCookie) {
      token = await getToken({
        req,
        secret: process.env.NEXTAUTH_SECRET || "pncp-dev-secret-2026",
        secureCookie: false,
      });
    }

    if (!token && !hasSecureCookie && !hasStandardCookie) {
      token = await getToken({
        req,
        secret: process.env.NEXTAUTH_SECRET || "pncp-dev-secret-2026",
      });
    }

    const email = typeof token?.email === "string" ? token.email.toLowerCase() : "";
    const isSuper =
      token?.role === "SUPERADMIN" ||
      email === "vitorhenrique018@gmail.com" ||
      email === "alfredosouza100@gmail.com";

    if (!isSuper) {
      // Reescreve para /404 simulando página inexistente para qualquer cliente ou bot
      const notFoundUrl = req.nextUrl.clone();
      notFoundUrl.pathname = "/404";
      return NextResponse.rewrite(notFoundUrl);
    }
  }

  // 3. Verificação de Sessão Ativa em Rotas Protegidas
  const hasSession = Boolean(
    req.cookies.get("next-auth.session-token")?.value ||
    req.cookies.get("__Secure-next-auth.session-token")?.value ||
    req.cookies.get("portal_licitacao_token")?.value,
  );

  if (!hasSession) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl, 307);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};

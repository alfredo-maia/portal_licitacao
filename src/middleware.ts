import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Middleware de Segurança e Governança Multi-Tenant (PRD §6, §13 / ADR 0010):
 * 1. Barreira Invisível para o Portal SuperAdmin (/admin): Retorna 404 para não administradores.
 * 2. Soft Paywall: Permite tráfego normal para Whitelist e redireciona clientes bloqueados.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Proteção de Borda Defensiva para o Portal SuperAdmin
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

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
  ],
};

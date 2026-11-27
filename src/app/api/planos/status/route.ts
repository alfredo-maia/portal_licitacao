import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { cookies } from "next/headers";
import { authOptions } from "@/server/auth";
import {
  exigirClienteEmApi,
  type SessionActorClaims,
} from "@/server/auth/client-guard";
import { obterStatusAssinaturaCliente } from "@/server/services/subscription-status.service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions).catch(() => null);
    const guard = exigirClienteEmApi(
      session?.user as SessionActorClaims | undefined,
    );
    if (!guard.ok) return guard.response;

    let cookieTenant: string | undefined;
    try {
      const cookieStore = await cookies();
      cookieTenant = cookieStore.get("portal_licitacao_active_tenant")?.value;
    } catch {}

    const status = await obterStatusAssinaturaCliente({
      user: guard.user,
      cookieTenant,
    });

    return NextResponse.json({
      ok: true,
      tenantId: status.tenantId,
      cnpj: status.cnpj,
      razaoSocial: status.razaoSocial,
      ...status.evaluation,
      maxCnpjs: status.maxCnpjs,
      maxUsers: status.maxUsers,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Erro ao consultar status da assinatura";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

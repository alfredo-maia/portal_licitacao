import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import { authOptions } from "@/server/auth";
import {
  isSuperAdminSessionUser,
  respostaProibidaAdminEmRotaCliente,
  type SessionActorClaims,
} from "@/server/auth/client-guard";
import { prisma } from "@/lib/prisma";
import { CATALOGO_MACRO_SEGMENTOS } from "@/server/schemas/segmentos.schema";
import { obterConfiguracaoEmpresa } from "@/server/services/configuracoes.service";
import { resolveUserActiveTenantId } from "@/server/services/tenant.service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions).catch(() => null);
    const sessionUser = session?.user as SessionActorClaims | undefined;
    if (isSuperAdminSessionUser(sessionUser)) {
      return respostaProibidaAdminEmRotaCliente();
    }
    const userId = sessionUser?.id || "";
    let cookieTenant: string | undefined;
    try {
      const cookieStore = await cookies();
      cookieTenant = cookieStore.get("portal_licitacao_active_tenant")?.value;
    } catch {}

    const sessionTenant = (session?.user as any)?.activeTenantId;
    const tenantId = await resolveUserActiveTenantId(userId, cookieTenant, sessionTenant);

    const config = await obterConfiguracaoEmpresa(tenantId);
    const hasCustomSegments = Array.isArray(config.segmentos) && config.segmentos.length > 0;
    const hasCustomUfs = Array.isArray(config.ufs) && config.ufs.length > 0;

    if (hasCustomSegments || hasCustomUfs || config.brasilInteiro === false) {
      return NextResponse.json({
        ok: true,
        segmentos: hasCustomSegments ? config.segmentos : Object.keys(CATALOGO_MACRO_SEGMENTOS),
        subsegmentos: Array.isArray(config.subsegmentos) ? config.subsegmentos : [],
        ufs: hasCustomUfs ? config.ufs : [],
        brasilInteiro: config.brasilInteiro ?? true,
      });
    }

    // Default caso ainda não tenha configurado a Seção 5
    const todosSegmentos = Object.keys(CATALOGO_MACRO_SEGMENTOS);
    return NextResponse.json({
      ok: true,
      segmentos: todosSegmentos,
      subsegmentos: [],
      ufs: [],
      brasilInteiro: true,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: "Erro ao buscar preferências do tenant" },
      { status: 500 },
    );
  }
}


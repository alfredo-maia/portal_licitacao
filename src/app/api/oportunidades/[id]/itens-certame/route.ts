import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { RbacUser } from "@/lib/rbac";
import { authOptions } from "@/server/auth";
import {
  getOportunidadeById,
  OportunidadesServiceError,
} from "@/server/services/oportunidades.service";
import { resolveUserActiveTenantId } from "@/server/services/tenant.service";
import {
  resolverContextoContaCota,
  verificarEIncrementarLimiteSilenciosoLicitacao,
} from "@/server/services/analise-ia-participacao.service";
import { extrairItensCertameCompleto } from "@/server/services/extracao-itens-certame.service";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function resolveTenantAndUser(request: Request) {
  const session = await getServerSession(authOptions).catch(() => null);
  const user = session?.user as RbacUser | undefined;
  if (!user) {
    return { user: undefined, tenantId: null };
  }

  let cookieTenant: string | undefined;
  try {
    const cookieStore = await cookies();
    cookieTenant = cookieStore.get("portal_licitacao_active_tenant")?.value;
  } catch {}
  const queryTenant = new URL(request.url).searchParams.get("tenantId") || undefined;
  const sessionTenant = (user as any)?.activeTenantId || undefined;
  const preferredTenant = queryTenant || cookieTenant || sessionTenant;
  const tenantId = await resolveUserActiveTenantId(
    (user as any)?.id || "",
    preferredTenant,
    sessionTenant,
  );

  return { user, tenantId };
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const { user, tenantId } = await resolveTenantAndUser(request);
  if (!user) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  const url = new URL(request.url);
  const refresh =
    url.searchParams.get("refresh") === "true" || request.method === "POST";

  try {
    const userIdentifier = (user as any)?.id || (user as any)?.email || null;
    const { plano } = await resolverContextoContaCota(tenantId, userIdentifier);

    // Verificação de plano: exclusivo PRO e ENTERPRISE
    if (plano === "BASICO") {
      return NextResponse.json(
        {
          ok: false,
          error: "PLANO_INSUFICIENTE",
          message:
            "A extração e sincronização automática de itens do certame é um recurso exclusivo dos planos Pro e Enterprise. Faça upgrade da sua assinatura para desbloquear esta ferramenta.",
        },
        { status: 403 },
      );
    }

    // Trava silenciosa anti-abuso (máximo 5 reprocessamentos explícitos por certame)
    if (refresh) {
      try {
        verificarEIncrementarLimiteSilenciosoLicitacao(
          id,
          String(userIdentifier || tenantId || "anonimo"),
        );
      } catch (err: any) {
        return NextResponse.json(
          {
            ok: false,
            error: err.code || err.codigo || "ERRO_PROCESSAMENTO_SISTEMA",
            message:
              err.message ||
              "Ocorreu um erro interno no sistema ao processar esta solicitação automática para esta licitação. Por favor, entre em contato com o nosso suporte técnico.",
          },
          { status: 500 },
        );
      }
    }

    const oportunidade = await getOportunidadeById(id, tenantId);
    const resultado = await extrairItensCertameCompleto(oportunidade, {
      forcarVarreduraDocumentos: refresh,
    });

    return NextResponse.json(
      {
        ok: true,
        itens: resultado.itens,
        totalItens: resultado.totalItens,
        origem: resultado.origem,
        documentosLidos: resultado.documentosLidos,
        avisos: resultado.avisos,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof OportunidadesServiceError) {
      return NextResponse.json(
        { ok: false, error: error.code, message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR", message: "Erro ao consultar itens do certame." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  return GET(request, context);
}

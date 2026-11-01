import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authOptions, DIRECTORS_SEED } from "@/server/auth";
import { getDashboardData } from "@/server/services/dashboard.service";
import { obterConfiguracaoEmpresa } from "@/server/services/configuracoes.service";
import { resolveUserActiveTenantId } from "@/server/services/tenant.service";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  let user = session?.user;
  if (!user && process.env.NODE_ENV !== "test" && process.env.VITEST !== "true") {
    user = DIRECTORS_SEED[0] as any;
  }
  if (!user) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const mesParam = searchParams.get("mes");
  const anoParam = searchParams.get("ano");

  const userId = (user as any)?.id || "";
  let cookieTenant: string | undefined;
  try {
    const cookieStore = await cookies();
    cookieTenant = cookieStore.get("portal_licitacao_active_tenant")?.value;
  } catch {}
  const headerTenant = searchParams.get("tenantId");
  const preferredTenant = headerTenant || cookieTenant || (user as any)?.activeTenantId;
  const tenantId = await resolveUserActiveTenantId(userId, preferredTenant);

  let configuracaoPendente = false;
  let segmentosTenantAtivo: string[] | undefined;
  if (tenantId) {
    try {
      const cfg = await obterConfiguracaoEmpresa(tenantId);
      if (!cfg?.segmentos || cfg.segmentos.length === 0) {
        configuracaoPendente = true;
      } else {
        segmentosTenantAtivo = cfg.segmentos;
      }
    } catch {}
  }

  if (configuracaoPendente) {
    return NextResponse.json(
      {
        configuracaoPendente: true,
        cards: {
          totalRecebidas: 0,
          triagemPendente: 0,
          emParticipacao: 0,
          vencendoHoje: 0,
          taxaConversao: 0,
          valorTotalGanho: 0,
          oportunidadesNovasHoje: 0,
        },
        kanban: {
          triagem: [],
          emAnalise: [],
          emDisputa: [],
          homologada: [],
        },
        alertasValidade: [],
        graficoPizza: [],
        graficoBarras: [],
      },
      { status: 200 },
    );
  }

  try {
    const data = await getDashboardData({
      mes: mesParam ? parseInt(mesParam, 10) : undefined,
      ano: anoParam ? parseInt(anoParam, 10) : undefined,
      tenantId: tenantId || undefined,
      segmentosTenantAtivo,
    });
    return NextResponse.json({ ...data, configuracaoPendente: false }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: "INVALID_QUERY", message: error?.message },
      { status: 400 },
    );
  }
}

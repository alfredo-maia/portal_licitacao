import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/server/auth";
import { can } from "@/lib/rbac";
import { obterMetricasSuperAdmin } from "@/server/services/superadmin.service";

/**
 * Retorna as métricas executivas consolidadas para o Portal SuperAdmin.
 * Retorna 404 caso o usuário não tenha privilégios de SUPERADMIN (invisibilidade defensiva).
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions).catch(() => null);

  if (!session?.user || !can(session.user as any, "superadmin:view", "admin")) {
    return NextResponse.json({ error: "Página não encontrada" }, { status: 404 });
  }

  try {
    const metricas = await obterMetricasSuperAdmin();
    return NextResponse.json(metricas, { status: 200 });
  } catch (error: any) {
    console.error("[SuperAdmin Metricas Error]:", error);
    return NextResponse.json(
      { error: "Erro ao obter métricas administrativas" },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/server/auth";
import { can } from "@/lib/rbac";
import {
  listarTenantsSuperAdmin,
  expandirCotaStorageTenant,
} from "@/server/services/superadmin.service";

/**
 * Gestão de Tenants do SuperAdmin:
 * GET: Lista todos os tenants com suas cotas de armazenamento e status financeiro.
 * POST: Expande cota de armazenamento R2 de um tenant com 1 clique (+1 GB, +2 GB).
 * Retorna 404 para não administradores.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions).catch(() => null);

  if (!session?.user || !can(session.user as any, "superadmin:view", "admin")) {
    return NextResponse.json({ error: "Página não encontrada" }, { status: 404 });
  }

  try {
    const tenants = await listarTenantsSuperAdmin();
    return NextResponse.json(tenants, { status: 200 });
  } catch (error: any) {
    console.error("[SuperAdmin List Tenants Error]:", error);
    return NextResponse.json(
      { error: "Erro ao listar tenants" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions).catch(() => null);

  if (!session?.user || !can(session.user as any, "superadmin:manage", "admin")) {
    return NextResponse.json({ error: "Página não encontrada" }, { status: 404 });
  }

  try {
    const body = await req.json();
    const res = await expandirCotaStorageTenant(body);
    return NextResponse.json(res, { status: 200 });
  } catch (error: any) {
    console.error("[SuperAdmin Expand Quota Error]:", error);
    if (error.name === "ZodError") {
      return NextResponse.json(
        { error: "Dados de expansão inválidos", issues: error.issues },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: error.message || "Erro ao expandir cota" },
      { status: 500 },
    );
  }
}

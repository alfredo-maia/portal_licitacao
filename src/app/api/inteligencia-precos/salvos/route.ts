import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { cookies } from "next/headers";
import { ZodError } from "zod";
import { authOptions } from "@/server/auth";
import { resolveUserActiveTenantId } from "@/server/services/tenant.service";
import {
  listarItensPrecosSalvos,
  salvarItemPrecoTenant,
} from "@/server/services/inteligencia-precos.service";

export const dynamic = "force-dynamic";

async function resolverTenantAtivo(
  req: Request,
  bodyTenantId?: string,
): Promise<string | null> {
  const session = await getServerSession(authOptions).catch(() => null);
  let cookieTenant: string | undefined;
  try {
    const cookieStore = await cookies();
    cookieTenant = cookieStore.get("portal_licitacao_active_tenant")?.value;
  } catch {}

  const { searchParams } = new URL(req.url);
  const queryTenant = searchParams.get("tenantId") || req.headers.get("x-tenant-id");
  const userId = (session?.user as any)?.id || "";
  const sessionTenant =
    (session?.user as any)?.activeTenantId || (session?.user as any)?.tenantId;
  const requestedTenant = queryTenant || bodyTenantId || cookieTenant;

  if (userId) {
    return resolveUserActiveTenantId(userId, requestedTenant, sessionTenant);
  }
  return requestedTenant || "tenant-default";
}

export async function GET(req: Request) {
  try {
    const tenantId = await resolverTenantAtivo(req);
    if (!tenantId) {
      return NextResponse.json(
        { ok: false, error: "Empresa ativa não identificada", itens: [] },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(req.url);
    const busca = searchParams.get("busca") || undefined;
    const itens = await listarItensPrecosSalvos(tenantId, busca);

    return NextResponse.json({
      ok: true,
      activeTenantId: tenantId,
      itens,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Erro ao listar itens salvos de inteligência de preços",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const tenantId = await resolverTenantAtivo(req, body?.tenantId);
    if (!tenantId) {
      return NextResponse.json(
        { ok: false, error: "Empresa ativa não identificada para salvar o item" },
        { status: 403 },
      );
    }

    const item = await salvarItemPrecoTenant(tenantId, body);
    return NextResponse.json(
      {
        ok: true,
        activeTenantId: tenantId,
        item,
      },
      { status: 201 },
    );
  } catch (error: any) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.issues[0]?.message || "Dados inválidos para salvar o item",
          detalhes: error.flatten(),
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Erro ao salvar item na base de inteligência de preços",
      },
      { status: 500 },
    );
  }
}

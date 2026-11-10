import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authOptions } from "@/server/auth";
import { parseDataCivil } from "@/lib/date-utils";
import {
  atualizarDocumento,
  excluirDocumento,
  obterDocumento,
} from "@/server/services/documentos.service";
import { resolveUserActiveTenantId } from "@/server/services/tenant.service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function resolveTenantForSession(session: any): Promise<string | null> {
  const userId = session?.user?.id || "";
  if (!userId) return null;
  let cookieTenant: string | undefined;
  try {
    const cookieStore = await cookies();
    cookieTenant = cookieStore.get("portal_licitacao_active_tenant")?.value;
  } catch {}
  const sessionTenant = session?.user?.activeTenantId;
  return resolveUserActiveTenantId(userId, cookieTenant, sessionTenant);
}

export async function GET(_request: Request, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string } | undefined;
  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const tenantId = await resolveTenantForSession(session);
  const { id } = await params;
  const detalhe = await obterDocumento(id, tenantId);
  if (!detalhe) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json(detalhe, { status: 200 });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const tenantId = await resolveTenantForSession(session);
  const { id } = await params;
  try {
    const body = await request.json();
    if (body.dataEmissao !== undefined) {
      body.dataEmissao = body.dataEmissao ? parseDataCivil(body.dataEmissao) : null;
    }
    if (body.dataVencimento !== undefined) {
      body.dataVencimento = body.dataVencimento ? parseDataCivil(body.dataVencimento) : null;
    }
    const doc = await atualizarDocumento(id, body, user.id, tenantId);
    if (!doc) {
      return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, documento: doc }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: "VALIDATION_ERROR", message: error?.message },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  if (user.role !== "DIRETORIA") {
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  const tenantId = await resolveTenantForSession(session);
  const { id } = await params;
  const sucesso = await excluirDocumento(id, user.id, tenantId);
  if (!sucesso) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

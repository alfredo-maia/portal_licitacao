import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authOptions } from "@/server/auth";
import { parseDataCivil } from "@/lib/date-utils";
import { runWithAuditActorContext } from "@/server/audit";
import { documentoAtualizarInputSchema } from "@/server/schemas/documento.schema";
import {
  atualizarDocumento,
  excluirDocumento,
  obterDocumento,
} from "@/server/services/documentos.service";
import { resolveUserActiveTenantId } from "@/server/services/tenant.service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface SessionUserWithTenant {
  id?: string;
  name?: string | null;
  email?: string | null;
  role?: string;
  activeTenantId?: string | null;
}

async function resolveTenantForUser(
  user?: SessionUserWithTenant,
): Promise<string | null> {
  const userId = user?.id || "";
  if (!userId) return null;
  let cookieTenant: string | undefined;
  try {
    const cookieStore = await cookies();
    cookieTenant = cookieStore.get("portal_licitacao_active_tenant")?.value;
  } catch {}
  return resolveUserActiveTenantId(
    userId,
    cookieTenant,
    user?.activeTenantId ?? null,
  );
}

export async function GET(_request: Request, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  const user = session?.user as SessionUserWithTenant | undefined;
  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const tenantId = await resolveTenantForUser(user);
  const { id } = await params;
  const detalhe = await obterDocumento(id, tenantId);
  if (!detalhe) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json(detalhe, { status: 200 });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  const user = session?.user as SessionUserWithTenant | undefined;
  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  const userId = user.id;
  const userName = user.name ?? user.email ?? null;
  const tenantId = await resolveTenantForUser(user);

  return runWithAuditActorContext(
    {
      usuarioId: userId,
      usuarioNome: userName,
      tenantId,
      ip: request.headers?.get?.("x-forwarded-for") ?? null,
    },
    async () => {
      const { id } = await params;
      try {
        const rawBody = (await request.json()) as Record<string, unknown>;
        const payload: Record<string, unknown> = { ...rawBody };
        if (payload.dataEmissao !== undefined) {
          payload.dataEmissao =
            typeof payload.dataEmissao === "string" && payload.dataEmissao
              ? parseDataCivil(payload.dataEmissao)
              : null;
        }
        if (payload.dataVencimento !== undefined) {
          payload.dataVencimento =
            typeof payload.dataVencimento === "string" && payload.dataVencimento
              ? parseDataCivil(payload.dataVencimento)
              : null;
        }
        const validated = documentoAtualizarInputSchema.parse(payload);
        const doc = await atualizarDocumento(id, validated, userId, tenantId);
        if (!doc) {
          return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
        }
        return NextResponse.json({ ok: true, documento: doc }, { status: 200 });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Erro de validação";
        return NextResponse.json(
          { ok: false, error: "VALIDATION_ERROR", message },
          { status: 400 },
        );
      }
    },
  );
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  const user = session?.user as SessionUserWithTenant | undefined;
  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  if (user.role !== "DIRETORIA") {
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  const userId = user.id;
  const userName = user.name ?? user.email ?? null;
  const tenantId = await resolveTenantForUser(user);

  return runWithAuditActorContext(
    {
      usuarioId: userId,
      usuarioNome: userName,
      tenantId,
      ip: request?.headers?.get?.("x-forwarded-for") ?? null,
    },
    async () => {
      const { id } = await params;
      const sucesso = await excluirDocumento(id, userId, tenantId);
      if (!sucesso) {
        return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
      }

      return NextResponse.json({ ok: true }, { status: 200 });
    },
  );
}

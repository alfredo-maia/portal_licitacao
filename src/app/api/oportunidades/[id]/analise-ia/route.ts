import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ZodError } from "zod";
import type { RbacUser } from "@/lib/rbac";
import { authOptions } from "@/server/auth";
import { runWithAuditActorContext } from "@/server/audit";
import {
  AnaliseIAParticipacaoError,
  iniciarAnaliseParticipacaoAssincrona,
  obterStatusCotaAnaliseIA,
} from "@/server/services/analise-ia-participacao.service";
import {
  getOportunidadeById,
  OportunidadesServiceError,
  salvarAnaliseIA,
} from "@/server/services/oportunidades.service";
import { resolveUserActiveTenantId } from "@/server/services/tenant.service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export const maxDuration = 300;
export const dynamic = "force-dynamic";

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
  const headerTenant = new URL(request.url).searchParams.get("tenantId") || undefined;
  const sessionTenant = user.activeTenantId || undefined;
  const preferredTenant = headerTenant || cookieTenant || sessionTenant;
  const tenantId = await resolveUserActiveTenantId(
    user.id || "",
    preferredTenant,
    sessionTenant,
  );

  return { user, tenantId };
}

/**
 * `GET /api/oportunidades/[id]/analise-ia`:
 * Consulta a cota mensal vigente do Tenant (usadas / limite / renovaEm / mensagemBloqueio)
 * e o histórico de análises da licitação.
 */
export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const { user, tenantId } = await resolveTenantAndUser(request);
  if (!user) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  return runWithAuditActorContext(
    {
      usuarioId: user.id ?? null,
      usuarioNome: user.name ?? user.email ?? null,
      tenantId,
      ip: request.headers?.get?.("x-forwarded-for") ?? null,
    },
    async () => {
      try {
        const userIdentifier = user.id || user.email || null;
        const [cota, oportunidade] = await Promise.all([
          obterStatusCotaAnaliseIA(tenantId, new Date(), userIdentifier),
          getOportunidadeById(id, tenantId),
        ]);

        return NextResponse.json(
          {
            ok: true,
            cota,
            analises: oportunidade.analisesIA || [],
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
          { ok: false, error: "INTERNAL_ERROR" },
          { status: 500 },
        );
      }
    },
  );
}

/**
 * `POST /api/oportunidades/[id]/analise-ia`:
 * Dispara a geração assíncrona de relatório de participação com IA,
 * validando a cota mensal do plano (Básico 5, Pro 10, Enterprise 20)
 * e gerando PDF com parecer executivo e checklist multi-segmento.
 * Mantém retrocompatibilidade com salvamento manual direto (sprint-2).
 */
export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const { user, tenantId } = await resolveTenantAndUser(request);
  if (!user) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    const text = await request.text();
    if (text) {
      const parsedJson = JSON.parse(text) as unknown;
      body =
        parsedJson && typeof parsedJson === "object" && !Array.isArray(parsedJson)
          ? (parsedJson as Record<string, unknown>)
          : {};
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: "INVALID_JSON" },
      { status: 400 },
    );
  }

  const ip = request.headers.get("x-forwarded-for");
  const userName = user.name ?? user.email ?? null;
  const actorContext = {
    ip,
    usuarioId: user.id,
    usuarioNome: userName,
  };

  return runWithAuditActorContext(
    {
      usuarioId: user.id ?? null,
      usuarioNome: userName,
      tenantId,
      ip: ip ?? null,
    },
    async () => {
      // Compatibilidade com salvamento síncrono legado direto
      if (Boolean(body.scriptPrompt) && Boolean(body.relatorioTexto) && !body.observacoes) {
        try {
          const criada = await salvarAnaliseIA(id, body, user, actorContext);
          return NextResponse.json({ ok: true, analise: criada }, { status: 201 });
        } catch (error) {
          if (error instanceof ZodError) {
            return NextResponse.json(
              { ok: false, error: "VALIDATION_ERROR", issues: error.issues },
              { status: 400 },
            );
          }
          if (error instanceof OportunidadesServiceError) {
            return NextResponse.json(
              { ok: false, error: error.code, message: error.message },
              { status: error.status },
            );
          }
          return NextResponse.json(
            { ok: false, error: "INTERNAL_ERROR" },
            { status: 500 },
          );
        }
      }

      // Novo fluxo assíncrono com cota mensal e geração de PDF
      try {
        const resultado = await iniciarAnaliseParticipacaoAssincrona(
          id,
          body,
          user,
          actorContext,
          tenantId,
        );

        return NextResponse.json(
          {
            ...resultado,
          },
          { status: 201 },
        );
      } catch (error) {
        if (error instanceof AnaliseIAParticipacaoError) {
          return NextResponse.json(
            {
              ok: false,
              error: error.code,
              message: error.message,
              cota: error.cota,
            },
            { status: error.status },
          );
        }
        if (error instanceof ZodError) {
          return NextResponse.json(
            { ok: false, error: "VALIDATION_ERROR", issues: error.issues },
            { status: 400 },
          );
        }
        if (error instanceof OportunidadesServiceError) {
          return NextResponse.json(
            { ok: false, error: error.code, message: error.message },
            { status: error.status },
          );
        }
        return NextResponse.json(
          { ok: false, error: "INTERNAL_ERROR" },
          { status: 500 },
        );
      }
    },
  );
}

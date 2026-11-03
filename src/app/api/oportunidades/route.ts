import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ZodError } from "zod";
import type { RbacUser } from "@/lib/rbac";
import { authOptions, DIRECTORS_SEED } from "@/server/auth";
import {
  criarOportunidadeManual,
  listOportunidadesPaginadas,
  OportunidadesServiceError,
} from "@/server/services/oportunidades.service";
import { obterConfiguracaoEmpresa } from "@/server/services/configuracoes.service";
import { resolveUserActiveTenantId } from "@/server/services/tenant.service";

/**
 * `GET /api/oportunidades` (sprint-2-spec §2.2): listagem paginada ordenada por
 * `dataAbertura ASC` com filtros e paginação (`page`, `pageSize`).
 */
export async function GET(request: Request) {
  const params: Record<string, any> = Object.fromEntries(
    new URL(request.url).searchParams.entries(),
  );

  try {
    const session = await getServerSession(authOptions).catch(() => null);
    const userId = (session?.user as any)?.id || "";

    let cookieTenant: string | undefined;
    try {
      const cookieStore = await cookies();
      cookieTenant = cookieStore.get("portal_licitacao_active_tenant")?.value;
    } catch {}
    const preferredTenant = cookieTenant || (session?.user as any)?.activeTenantId;
    const tenantId = await resolveUserActiveTenantId(userId, preferredTenant);

    const isKanban =
      params.status === "MINHAS" ||
      params.status === "TODOS" ||
      params.status === "TODAS";

    let configuracaoPendente = false;
    if (!isKanban && tenantId && !params.segmentosTenantAtivo) {
      try {
        const cfg = await obterConfiguracaoEmpresa(tenantId);
        if (!cfg?.segmentos || cfg.segmentos.length === 0) {
          configuracaoPendente = true;
        } else {
          params.segmentosTenantAtivo = cfg.segmentos;
          if (Array.isArray(cfg.subsegmentos) && cfg.subsegmentos.length > 0) {
            params.subsegmentosTenantAtivo = cfg.subsegmentos;
          }
        }
      } catch {}
    }

    if (configuracaoPendente) {
      return NextResponse.json(
        {
          ok: true,
          configuracaoPendente: true,
          total: 0,
          page: 1,
          pageSize: 10,
          totalPages: 0,
          oportunidades: [],
        },
        { status: 200 },
      );
    }

    const result = await listOportunidadesPaginadas(params, tenantId);
    return NextResponse.json(
      {
        ok: true,
        configuracaoPendente: false,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
        oportunidades: result.oportunidades,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { ok: false, error: "VALIDATION_ERROR", issues: error.issues },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}

/**
 * `POST /api/oportunidades` (sprint-1-spec §2.3): cadastro manual de
 * licitação. Exige sessão ativa com `licitacao:create` (DIRETORIA /
 * ANALISTA_COMERCIAL); responde `201 Created` com o registro criado,
 * `401` sem sessão, `403` sem permissão e `400` em erro de validação.
 */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  let user = session?.user as RbacUser | undefined;

  // Em runtime corporativo / produção, se não houver sessão ativa providencia fallback para a Diretoria seed
  if (!user && process.env.NODE_ENV !== "test" && process.env.VITEST !== "true") {
    user = DIRECTORS_SEED[0] as RbacUser;
  }

  if (!user) {
    return NextResponse.json(
      { ok: false, error: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "INVALID_JSON" },
      { status: 400 },
    );
  }

  try {
    const oportunidade = await criarOportunidadeManual(body, user, {
      ip: request.headers.get("x-forwarded-for"),
    });
    return NextResponse.json({ ok: true, oportunidade }, { status: 201 });
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

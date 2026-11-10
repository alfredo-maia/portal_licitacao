import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/server/auth";
import {
  executarIngestaoDiariaPncp,
  listarExecucoesIngestaoPncp,
} from "@/server/services/pncp-ingestao-diaria.service";
import { higienizarTitulosExistentesService } from "@/server/services/resumo-objeto-licitacao.service";

export const dynamic = "force-dynamic";

async function autorizarCronOuDiretoria(request: Request): Promise<boolean> {
  const configuredSecret = process.env.CRON_SECRET?.trim() || "";
  const expectedSecret =
    process.env.NODE_ENV === "production"
      ? configuredSecret
      : configuredSecret || "change-me-in-production-min-16";

  const authHeader = request.headers.get("authorization") || "";
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const cronHeader = request.headers.get("x-cron-secret")?.trim() || "";

  if (
    expectedSecret &&
    ((bearerToken && bearerToken === expectedSecret) ||
      (cronHeader && cronHeader === expectedSecret))
  ) {
    return true;
  }

  const session = await getServerSession(authOptions).catch(() => null);
  const user = session?.user as { role?: string; isSuperAdmin?: boolean } | undefined;
  if (user?.role === "DIRETORIA" || user?.isSuperAdmin) {
    return true;
  }

  return false;
}

/**
 * `GET /api/cron/ingest-pncp` — Executado automaticamente pelo Vercel Cron / scheduler externo.
 * Suporta `?historico=true` quando autenticado para listar últimas execuções.
 */
export async function GET(request: Request) {
  const autorizado = await autorizarCronOuDiretoria(request);
  if (!autorizado) {
    return NextResponse.json(
      { ok: false, error: "UNAUTHORIZED", message: "Credencial de cron inválida ou ausente." },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  if (url.searchParams.get("historico") === "true") {
    const execucoes = await listarExecucoesIngestaoPncp(20);
    return NextResponse.json({ ok: true, execucoes });
  }

  const diasParam = url.searchParams.get("diasRetroativos");
  const usarIaParam = url.searchParams.get("usarIa");
  const modalidadesParam = url.searchParams.get("modalidades");

  const resultado = await executarIngestaoDiariaPncp({
    diasRetroativos: diasParam ? Number(diasParam) : 1,
    usarIa: usarIaParam === "false" ? false : true,
    modalidades: modalidadesParam
      ? modalidadesParam
          .split(",")
          .map((n) => Number(n.trim()))
          .filter((n) => Number.isFinite(n) && n > 0)
      : undefined,
    origem: "CRON",
  });

  if (url.searchParams.get("higienizarAntigos") === "true") {
    await higienizarTitulosExistentesService({ apenasTruncados: true, usarIa: false }).catch(
      () => undefined,
    );
  }

  return NextResponse.json(resultado, { status: resultado.ok ? 200 : 207 });
}

/**
 * `POST /api/cron/ingest-pncp` — Disparo manual ou via workflow agendado com parâmetros no body JSON.
 */
export async function POST(request: Request) {
  const autorizado = await autorizarCronOuDiretoria(request);
  if (!autorizado) {
    return NextResponse.json(
      { ok: false, error: "UNAUTHORIZED", message: "Credencial de cron inválida ou ausente." },
      { status: 401 },
    );
  }

  let body: Record<string, any> = {};
  try {
    body = await request.json();
  } catch {}

  const resultado = await executarIngestaoDiariaPncp({
    diasRetroativos: body.diasRetroativos ?? 1,
    dataInicial: body.dataInicial,
    dataFinal: body.dataFinal,
    modalidades: body.modalidades,
    ufs: body.ufs,
    tamanhoPagina: body.tamanhoPagina,
    maxPaginasPorModalidade: body.maxPaginasPorModalidade,
    usarIa: body.usarIa ?? true,
    origem: body.origem || "MANUAL",
  });

  if (body.higienizarAntigos) {
    await higienizarTitulosExistentesService({
      apenasTruncados: true,
      usarIa: body.usarIa ?? true,
    }).catch(() => undefined);
  }

  return NextResponse.json(resultado, { status: resultado.ok ? 200 : 207 });
}


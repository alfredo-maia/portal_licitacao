import { NextResponse } from "next/server";
import {
  getOportunidadeById,
  OportunidadesServiceError,
} from "@/server/services/oportunidades.service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * `GET /api/oportunidades/[id]` (sprint-1-spec §2.3/§2.4): detalhes de uma
 * oportunidade para a rota `/oportunidades/[id]`. Responde `404` quando o
 * identificador não existe.
 */
export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const oportunidade = await getOportunidadeById(id);
    return NextResponse.json({ ok: true, oportunidade }, { status: 200 });
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
}

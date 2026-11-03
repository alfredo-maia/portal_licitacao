import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ingestLicitacoesV2 } from "@/server/services/ingestao.service";

/**
 * `POST /api/ingestao` (PRD §8 / sprint-1-spec §2.2): recebe o payload
 * `licitacoes_portal.json` (`versaoContrato: 2`) da esteira de IA, executa a
 * sincronização cirúrgica via `ingestLicitacoesV2` e responde `200 OK` com o
 * resumo do lote. Erros de contrato Zod respondem `400 Bad Request` com
 * `{ ok: false, error: "VALIDATION_ERROR", issues }`.
 */
export async function POST(request: Request) {
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
    const resultado = await ingestLicitacoesV2(body, {
      ip: request.headers.get("x-forwarded-for"),
    });
    return NextResponse.json(resultado, { status: 200 });
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

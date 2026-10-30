import { type NextRequest, NextResponse } from "next/server";
import { pesquisarLicitacoes } from "@/server/services/busca-licitacoes.service";

/**
 * Endpoint de busca e filtragem Full-Text Search de oportunidades de licitação.
 * GET /api/licitacoes/busca
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const queryParams: Record<string, any> = {};

    if (searchParams.has("q")) queryParams.q = searchParams.get("q");
    if (searchParams.has("macroSegmentos")) {
      queryParams.macroSegmentos = searchParams.getAll("macroSegmentos").join(",");
    }
    if (searchParams.has("subcategorias")) {
      queryParams.subcategorias = searchParams.getAll("subcategorias").join(",");
    }
    if (searchParams.has("modalidades")) {
      queryParams.modalidades = searchParams.getAll("modalidades").join(",");
    }
    if (searchParams.has("ufs")) {
      queryParams.ufs = searchParams.getAll("ufs").join(",");
    }
    if (searchParams.has("valorMin")) queryParams.valorMin = searchParams.get("valorMin");
    if (searchParams.has("valorMax")) queryParams.valorMax = searchParams.get("valorMax");
    if (searchParams.has("dataInicio")) queryParams.dataInicio = searchParams.get("dataInicio");
    if (searchParams.has("dataFim")) queryParams.dataFim = searchParams.get("dataFim");
    if (searchParams.has("ordenarPor")) queryParams.ordenarPor = searchParams.get("ordenarPor");
    if (searchParams.has("ordem")) queryParams.ordem = searchParams.get("ordem");
    if (searchParams.has("pagina")) queryParams.pagina = searchParams.get("pagina");
    if (searchParams.has("limite")) queryParams.limite = searchParams.get("limite");

    const resultado = await pesquisarLicitacoes(queryParams);
    return NextResponse.json(resultado, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Erro ao processar consulta de licitações", detalhes: err?.message },
      { status: 400 },
    );
  }
}

import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { pesquisarInteligenciaPrecos } from "@/server/services/inteligencia-precos.service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const resultado = await pesquisarInteligenciaPrecos({
      q: searchParams.get("q") || "",
      uf: searchParams.get("uf") || "TODOS",
      modalidade: searchParams.get("modalidade") || "TODOS",
      periodoMeses: searchParams.get("periodoMeses") || 12,
      limite: searchParams.get("limite") || 20,
    });

    return NextResponse.json({
      ok: true,
      ...resultado,
    });
  } catch (error: any) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.issues[0]?.message || "Parâmetros inválidos na busca de preços",
          detalhes: error.flatten(),
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Erro ao consultar preços homologados",
      },
      { status: 500 },
    );
  }
}


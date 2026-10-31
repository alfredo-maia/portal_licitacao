import { NextResponse } from "next/server";
import { buscarCnaes } from "@/config/cnae-catalogo";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") || "";
    const limiteParam = searchParams.get("limite");
    const limite = limiteParam ? parseInt(limiteParam, 10) : 25;

    const cnaes = buscarCnaes(q, isNaN(limite) ? 25 : limite);

    return NextResponse.json({ ok: true, cnaes });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || "Erro ao consultar catálogo CNAE" },
      { status: 500 },
    );
  }
}

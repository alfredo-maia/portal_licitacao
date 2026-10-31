import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ cep: string }> },
) {
  try {
    const { cep } = await context.params;
    const cepLimpo = (cep || "").replace(/\D/g, "");

    if (cepLimpo.length !== 8) {
      return NextResponse.json(
        { ok: false, error: "CEP deve conter exatamente 8 dígitos numéricos" },
        { status: 400 },
      );
    }

    // 1. Consulta ViaCEP primária
    try {
      const resViaCep = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`, {
        headers: { "User-Agent": "PortalLicitacoes/1.0" },
      });
      if (resViaCep.ok) {
        const dataViaCep = await resViaCep.json();
        if (!dataViaCep.erro && (dataViaCep.cep || dataViaCep.localidade)) {
          return NextResponse.json({
            ok: true,
            cep: dataViaCep.cep || cepLimpo,
            logradouro: dataViaCep.logradouro || "",
            bairro: dataViaCep.bairro || "",
            cidade: dataViaCep.localidade || "",
            uf: dataViaCep.uf || "",
          });
        }
      }
    } catch {
      // Fallback para BrasilAPI
    }

    // 2. Fallback BrasilAPI
    try {
      const resBrasilApi = await fetch(
        `https://brasilapi.com.br/api/cep/v1/${cepLimpo}`,
        {
          headers: { "User-Agent": "PortalLicitacoes/1.0" },
        },
      );
      if (resBrasilApi.ok) {
        const dataBrasilApi = await resBrasilApi.json();
        if (dataBrasilApi.city || dataBrasilApi.state) {
          return NextResponse.json({
            ok: true,
            cep: dataBrasilApi.cep || cepLimpo,
            logradouro: dataBrasilApi.street || "",
            bairro: dataBrasilApi.neighborhood || "",
            cidade: dataBrasilApi.city || "",
            uf: dataBrasilApi.state || "",
          });
        }
      }
    } catch {
      // Falha nos dois provedores
    }

    return NextResponse.json(
      { ok: false, error: "CEP não encontrado nos serviços de busca" },
      { status: 404 },
    );
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || "Erro interno ao consultar CEP" },
      { status: 500 },
    );
  }
}

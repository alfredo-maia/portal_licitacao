import { describe, expect, it } from "vitest";
import { limparTodasLicitacoes, ingestLicitacoesV2 } from "@/server/services/ingestao.service";
import { listOportunidadesPaginadas } from "@/server/services/oportunidades.service";
import { DELETE } from "@/app/api/ingestao/route";

describe("Ingestão — Limpeza de Oportunidades (#25)", () => {
  it("deve limpar completamente todas as licitações do sistema", async () => {
    // 1. Ingesta um item de teste
    await ingestLicitacoesV2({
      versaoContrato: 2,
      licitacoes: [
        {
          pncpId: "TESTE-CLEAN-001/2026",
          numeroEdital: "PE-CLEAN-01",
          orgao: {
            nome: "Prefeitura Municipal de Teste",
            cnpj: "00.000.000/0001-99",
            uf: "GO",
            municipio: "Goiânia",
          },
          modalidade: "Pregão Eletrônico",
          valorEstimado: 75000,
          dataAbertura: new Date("2026-11-20T10:00:00Z"),
          miniResumo: "Aquisição de Insumos para Teste",
          resumo: "Aquisição de insumos para teste de limpeza no sistema",
          tipoSistemaSugerido: "OUTROS",
          parecerGoNoGo: "AVALIAR",
        },
      ],
    });

    const antes = await listOportunidadesPaginadas({});
    expect(antes.total).toBeGreaterThan(0);

    // 2. Executa a limpeza
    const resultado = await limparTodasLicitacoes();
    expect(resultado.ok).toBe(true);

    // 3. Verifica que nenhuma licitação sobrou
    const depois = await listOportunidadesPaginadas({});
    expect(depois.total).toBe(0);
    expect(depois.oportunidades).toHaveLength(0);
  });

  it("rota HTTP DELETE /api/ingestao deve responder 200 e limpar as oportunidades", async () => {
    const req = new Request("http://localhost:3000/api/ingestao", {
      method: "DELETE",
    });

    const res = await DELETE(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);

    const listagem = await listOportunidadesPaginadas({});
    expect(listagem.total).toBe(0);
  });
});


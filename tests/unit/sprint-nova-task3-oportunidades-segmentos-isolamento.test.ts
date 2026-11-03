import { describe, expect, it } from "vitest";
import { listOportunidades } from "@/server/services/oportunidades.service";
import { insertInMemoryLicitacao, resetInMemoryLicitacoes } from "@/server/services/licitacoes-store";

describe("Sprint Nova Task 3 — Oportunidades: Filtro de Segmentos e Isolamento por Empresa", () => {
  it("deve restringir a busca padrão ('Todos os Segmentos') apenas aos segmentos configurados na empresa ativa", async () => {
    resetInMemoryLicitacoes();

    // Licitação de Alimentos
    insertInMemoryLicitacao({
      id: "lic_alim_1",
      idPncp: "alim_001",
      numeroEdital: "PE 10/2026",
      orgaoNome: "Prefeitura de Goiânia",
      uf: "GO",
      objeto: "Aquisição de gêneros alimentícios e merenda escolar",
      dataAbertura: new Date("2026-11-15T09:00:00Z"),
      valorEstimado: 100000,
      tipoSistemaCodigo: "OUTROS",
      segmentoMacro: "ALIMENTACAO",
      status: "PENDENTE",
    } as any);

    // Licitação de Medicamentos
    insertInMemoryLicitacao({
      id: "lic_med_1",
      idPncp: "med_001",
      numeroEdital: "PE 20/2026",
      orgaoNome: "Hospital Municipal",
      uf: "GO",
      objeto: "Aquisição de medicamentos e insumos hospitalares",
      dataAbertura: new Date("2026-11-15T09:00:00Z"),
      valorEstimado: 200000,
      tipoSistemaCodigo: "OUTROS",
      segmentoMacro: "SAUDE",
      status: "PENDENTE",
    } as any);

    // Cenário: Empresa ativa trabalha APENAS com ALIMENTACAO
    const resultadoEmpresaAlimentos = await listOportunidades({
      segmentosTenantAtivo: ["ALIMENTACAO"],
      // segmento não informado (busca default 'Todos os Segmentos')
    });

    expect(resultadoEmpresaAlimentos.some((l) => l.segmentoMacro === "ALIMENTACAO")).toBe(true);
    expect(resultadoEmpresaAlimentos.some((l) => l.segmentoMacro === "SAUDE")).toBe(false);
  });
});

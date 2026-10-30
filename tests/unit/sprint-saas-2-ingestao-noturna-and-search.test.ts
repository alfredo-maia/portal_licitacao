import { describe, expect, it } from "vitest";
import { ingestLicitacoesV2 } from "@/server/services/ingestao.service";
import { pesquisarLicitacoes } from "@/server/services/busca-licitacoes.service";

describe("Sprint SaaS 2 — Ingestão Noturna, Prorrogação de Prazos e Full-Text Search", () => {
  const dataHoje = new Date();
  const dataAberturaOriginal = new Date(dataHoje.getTime() + 10 * 24 * 60 * 60 * 1000);
  const dataEncerramentoOriginal = new Date(dataHoje.getTime() + 9 * 24 * 60 * 60 * 1000);

  it("deve ingerir edital atribuindo macroSegmento, subcategorias e modalidadeCodigo automaticamente", async () => {
    const payload = {
      versaoContrato: 2,
      executadoEm: new Date().toISOString(),
      totalRegistros: 1,
      licitacoes: [
        {
          pncpId: "SAAS-MED-001-2026",
          numeroEdital: "PE-88/2026",
          orgao: {
            cnpj: "11.222.333/0001-44",
            nome: "Secretaria de Saúde do Estado de Goiás",
            uf: "GO",
            municipio: "Goiânia",
          },
          modalidade: "Pregão Eletrônico",
          valorEstimado: 850000.0,
          dataAbertura: dataAberturaOriginal.toISOString(),
          dataEncerramentoProposta: dataEncerramentoOriginal.toISOString(),
          miniResumo: "Aquisição de antibióticos e seringas descartáveis",
          resumo: "Pregão para compra de amoxicilina comprimido, soro fisiológico e seringas estéreis hospitalares.",
          tipoSistemaSugerido: "OUTROS",
        },
      ],
    };

    const res = await ingestLicitacoesV2(payload);
    expect(res.ok).toBe(true);
    expect(res.criados).toBe(1);

    const registro = res.registros[0];
    expect(registro.idPncp).toBe("SAAS-MED-001-2026");
    expect(registro.segmentoMacro).toBe("SAUDE_MEDICAMENTOS_HOSPITALAR");
    expect(registro.modalidadeCodigo).toBe(6);
  });

  it("deve detectar prorrogação de prazo (dataEncerramentoProposta divergente) e atualizar o registro", async () => {
    const dataProrrogada = new Date(dataHoje.getTime() + 15 * 24 * 60 * 60 * 1000);

    const payloadAtualizacao = {
      versaoContrato: 2,
      executadoEm: new Date().toISOString(),
      totalRegistros: 1,
      licitacoes: [
        {
          pncpId: "SAAS-MED-001-2026",
          numeroEdital: "PE-88/2026",
          orgao: {
            cnpj: "11.222.333/0001-44",
            nome: "Secretaria de Saúde do Estado de Goiás",
            uf: "GO",
            municipio: "Goiânia",
          },
          modalidade: "Pregão Eletrônico",
          valorEstimado: 850000.0,
          dataAbertura: dataAberturaOriginal.toISOString(),
          dataEncerramentoProposta: dataProrrogada.toISOString(),
          miniResumo: "Aquisição de antibióticos e seringas descartáveis (Prorrogado)",
          resumo: "Pregão para compra de amoxicilina comprimido, soro fisiológico e seringas estéreis hospitalares. Data de propostas prorrogada.",
          tipoSistemaSugerido: "OUTROS",
        },
      ],
    };

    const res = await ingestLicitacoesV2(payloadAtualizacao);
    expect(res.ok).toBe(true);
    expect(res.atualizados).toBe(1);

    const atualizado = res.registros[0];
    expect(new Date(atualizado.dataEncerramentoProposta!).getTime()).toBe(dataProrrogada.getTime());
  });

  describe("Serviço de Full-Text Search (pesquisarLicitacoes)", () => {
    it("deve encontrar certame por termo textual do objeto ou resumo", async () => {
      const busca = await pesquisarLicitacoes({
        q: "amoxicilina",
        pagina: 1,
        limite: 10,
      });

      expect(busca.total).toBeGreaterThanOrEqual(1);
      const match = busca.itens.find((i) => i.idPncp === "SAAS-MED-001-2026");
      expect(match).toBeDefined();
      expect(match?.segmentoMacro).toBe("SAUDE_MEDICAMENTOS_HOSPITALAR");
    });

    it("deve filtrar licitações por Macro-Segmento", async () => {
      const busca = await pesquisarLicitacoes({
        macroSegmentos: ["SAUDE_MEDICAMENTOS_HOSPITALAR"],
        pagina: 1,
        limite: 10,
      });

      expect(busca.total).toBeGreaterThanOrEqual(1);
      for (const item of busca.itens) {
        expect(item.segmentoMacro).toBe("SAUDE_MEDICAMENTOS_HOSPITALAR");
      }
    });

    it("deve filtrar licitações por Modalidade (código PNCP)", async () => {
      const busca = await pesquisarLicitacoes({
        modalidades: [6], // Pregão Eletrônico
        pagina: 1,
        limite: 10,
      });

      expect(busca.total).toBeGreaterThanOrEqual(1);
      for (const item of busca.itens) {
        expect(item.modalidadeCodigo).toBe(6);
      }
    });

    it("deve filtrar licitações por UF", async () => {
      const busca = await pesquisarLicitacoes({
        ufs: ["GO"],
        pagina: 1,
        limite: 10,
      });

      expect(busca.total).toBeGreaterThanOrEqual(1);
      for (const item of busca.itens) {
        expect(item.uf).toBe("GO");
      }
    });

    it("deve retornar vazio quando os filtros não coincidirem", async () => {
      const busca = await pesquisarLicitacoes({
        q: "termo_completamente_inexistente_xyz_999",
        pagina: 1,
        limite: 10,
      });

      expect(busca.total).toBe(0);
      expect(busca.itens).toHaveLength(0);
    });
  });
});

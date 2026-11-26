import { beforeEach, describe, expect, it } from "vitest";
import {
  pareceTituloTruncadoOuPobre,
  sintetizarMiniResumo,
} from "@/lib/resumo-licitacao";
import {
  CATALOGO_MACRO_SEGMENTOS,
  MacroSegmentoEnum,
} from "@/server/schemas/segmentos.schema";
import { classificarLicitacaoPorTexto } from "@/server/services/classificador-segmentos.service";
import { ingestLicitacoesV2 } from "@/server/services/ingestao.service";
import { listOportunidades } from "@/server/services/oportunidades.service";
import { pesquisarLicitacoes } from "@/server/services/busca-licitacoes.service";
import { clearInMemoryLicitacoes } from "@/server/services/licitacoes-store";
import { reclassificarCatalogoLicitacoesService } from "@/server/services/resumo-objeto-licitacao.service";

describe("Issue #57 — Motor Semântico Determinístico V3 (Títulos Fiéis, Núcleo vs. Destinatário e OUTROS)", () => {
  beforeEach(() => {
    clearInMemoryLicitacoes();
  });

  describe("1. Caso Real Município de Itariri/SP (46578522000176-1-000033/2026) e Colisões de Títulos", () => {
    it("não transforma concessão de auxílio-funeral para famílias em vulnerabilidade social em Software SUAS e classifica em FUNERARIA (3601)", () => {
      const objetoItariri =
        "CONCESSÃO DO AUXILIO-FUNERAL PARA ATENDER AS DEMANDAS DAS FAMILIAS EM SITUAÇÃO DE VULNERABILIDADE SOCIAL/ECONOMICA";

      const titulo = sintetizarMiniResumo(objetoItariri);
      expect(titulo.toLowerCase()).not.toContain("software");
      expect(titulo.toLowerCase()).not.toContain("saas");
      expect(titulo.toLowerCase()).not.toContain("suas");
      expect(titulo.toLowerCase()).toMatch(/aux[íi]lio[- ]funeral/);

      const classif = classificarLicitacaoPorTexto(objetoItariri);
      expect(classif.macro).toBe("FUNERARIA");
      expect(classif.subcategorias).toContain("3601");
    });

    it("não aplica templates de TI em objetos físicos/obras/serviços públicos que citam educação, saúde, IPTU, licenciamento ambiental ou diário oficial", () => {
      const casos = [
        {
          objeto:
            "Registro de preços para aquisição de gêneros alimentícios da agricultura familiar destinados à merenda da rede municipal de ensino",
          proibidoNoTitulo: /plataforma|gestão escolar|diário eletrônico|software|sistema/i,
          macroEsperado: "ALIMENTACAO",
          subEsperada: "2501",
        },
        {
          objeto:
            "Contratação de empresa de engenharia para execução de obra de reforma e ampliação de UBS da atenção primária em saúde",
          proibidoNoTitulo: /prontuário|e-sus|sistema|software/i,
          macroEsperado: "ENGENHARIA_SERVICOS",
          subEsperada: "0101",
        },
        {
          objeto:
            "Contratação de serviços gráficos para confecção e impressão de carnês de IPTU do exercício de 2027",
          proibidoNoTitulo: /sistema de gestão tributária|nfs-e|software/i,
          macroEsperado: "ESCRITORIO_E_GRAFICA",
          subEsperada: "3004",
        },
        {
          objeto:
            "Contratação de consultoria para elaboração de estudos ambientais e licenciamento ambiental do aterro municipal",
          proibidoNoTitulo: /subscrição de softwares|licenciamento corporativo/i,
          macroEsperado: "ESPECIALIZADOS",
          subEsperada: "0402",
        },
        {
          objeto:
            "Contratação de jornal diário de grande circulação para publicação oficial de avisos de licitação e atos administrativos",
          proibidoNoTitulo: /portal da transparência|eletrônico/i,
          macroEsperado: "PUBLICIDADE",
          subEsperada: "3403",
        },
        {
          objeto:
            "Aquisição eventual de cestas básicas de alimentos para distribuição pelo CRAS e Secretaria Municipal de Assistência Social",
          proibidoNoTitulo: /software|saas|suas/i,
          macroEsperado: "ALIMENTACAO",
          subEsperada: "2502",
        },
      ];

      for (const c of casos) {
        const titulo = sintetizarMiniResumo(c.objeto);
        expect(titulo).not.toMatch(c.proibidoNoTitulo);

        const classif = classificarLicitacaoPorTexto(c.objeto);
        expect(classif.macro).toBe(c.macroEsperado);
        expect(classif.subcategorias).toContain(c.subEsperada);
      }
    });

    it("preserva síntese rica de TI quando o objeto é genuinamente licenciamento de software SUAS", () => {
      const objetoSoftwareSuas =
        "Contratação de empresa especializada para licenciamento de software web em nuvem (SaaS) de gestão da assistência social (SUAS) para CRAS e CREAS";
      const titulo = sintetizarMiniResumo(objetoSoftwareSuas);
      expect(titulo).toBe("SaaS de gestão da assistência social (SUAS)");

      const classif = classificarLicitacaoPorTexto(objetoSoftwareSuas);
      expect(classif.macro).toBe("INFORMATICA");
      expect(classif.subcategorias).toContain("3101");
    });
  });

  describe("2. Separação Núcleo vs. Destinatário, Jargões Licitatórios e Fallback OUTROS", () => {
    it("mantém catálogo selecionável em 40 segmentos e classifica objetos sem aderência como OUTROS (nunca ASSESSORIAS)", () => {
      expect(Object.keys(CATALOGO_MACRO_SEGMENTOS)).toHaveLength(40);
      expect(MacroSegmentoEnum.options).toHaveLength(40);

      const semAderencia1 = classificarLicitacaoPorTexto(
        "Contratação de soluções diversas para atendimento de demanda administrativa interna",
      );
      expect(semAderencia1.macro).toBe("OUTROS");
      expect(semAderencia1.subcategorias).toEqual([]);
      expect(semAderencia1.score).toBe(0);

      const semAderencia2 = classificarLicitacaoPorTexto(
        "Concessão de benefício pecuniário de auxílio-moradia emergencial para famílias desabrigadas em vulnerabilidade social",
      );
      expect(semAderencia2.macro).toBe("OUTROS");
      expect(semAderencia2.subcategorias).toEqual([]);
    });

    it("não pontua INFORMATICA por causa de 'Sistema de Registro de Preços' ou 'Processo Eletrônico' no preâmbulo", () => {
      const res = classificarLicitacaoPorTexto(
        "Pregão na forma de Processo Eletrônico pelo Sistema de Registro de Preços visando atendimento das secretarias municipais",
      );
      expect(res.macro).toBe("OUTROS");
      expect(res.macro).not.toBe("INFORMATICA");
    });
  });

  describe("3. Isolamento de Filtragem e Saneamento Retroativo da Base", () => {
    it("bloqueia OUTROS e registros sem subcategoria nos filtros do cliente e reclassifica base contaminada", async () => {
      const amanha = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();

      await ingestLicitacoesV2(
        {
          versaoContrato: 2,
          executadoEm: new Date().toISOString(),
          totalRegistros: 2,
          licitacoes: [
            {
              pncpId: "46578522000176-1-000033/2026",
              numeroEdital: "33/2026",
              orgao: { cnpj: "46.578.522/0001-76", nome: "MUNICIPIO DE ITARIRI", uf: "SP" },
              modalidade: "Pregão Eletrônico",
              valorEstimado: 1620635,
              dataAbertura: amanha,
              miniResumo: "Software de gestão da assistência social (SUAS)",
              resumo:
                "CONCESSÃO DO AUXILIO-FUNERAL PARA ATENDER AS DEMANDAS DAS FAMILIAS EM SITUAÇÃO DE VULNERABILIDADE SOCIAL/ECONOMICA",
              tipoSistemaSugerido: "OUTROS",
            },
            {
              pncpId: "00000000000191-1-000099/2026",
              numeroEdital: "99/2026",
              orgao: { cnpj: "00.000.000/0001-91", nome: "PREFEITURA TESTE", uf: "GO" },
              modalidade: "Dispensa de Licitação",
              valorEstimado: 15000,
              dataAbertura: amanha,
              miniResumo: "Atendimento de demandas gerais",
              resumo: "Cessão de servidor público efetivo mediante convênio interinstitucional",
              tipoSistemaSugerido: "OUTROS",
            },
          ],
        },
        undefined,
        { usarIaTitulos: false },
      );

      // 1) Filtro por INFORMATICA não pode trazer Itariri/SP nem o item OUTROS
      const listaTi = await listOportunidades({ segmento: "INFORMATICA" });
      expect(listaTi).toHaveLength(0);

      // 2) Filtro por ASSESSORIAS não pode trazer o item sem aderência (que agora é OUTROS)
      const listaAssessorias = await listOportunidades({ segmento: "ASSESSORIAS" });
      expect(listaAssessorias).toHaveLength(0);

      // 3) Filtro por FUNERARIA traz Itariri/SP com título fiel (sem Software)
      const listaFuneraria = await listOportunidades({ segmento: "FUNERARIA" });
      expect(listaFuneraria).toHaveLength(1);
      expect(listaFuneraria[0].idPncp).toBe("46578522000176-1-000033/2026");
      expect(listaFuneraria[0].miniResumo.toLowerCase()).not.toContain("software");

      // 4) Busca global não quebra ao serializar item com segmentoMacro = "OUTROS"
      const buscaGlobal = await pesquisarLicitacoes({ q: "convênio" });
      expect(buscaGlobal.itens).toHaveLength(1);
      expect(buscaGlobal.itens[0].segmentoMacro).toBe("OUTROS");

      // 5) Reclassificação retroativa corrige registros legados corrompidos
      const { updateInMemoryLicitacao } = await import("@/server/services/licitacoes-store");
      updateInMemoryLicitacao(listaFuneraria[0].id, {
        miniResumo: "Software de gestão da assistência social (SUAS)",
        segmentoMacro: "INFORMATICA",
        subcategorias: ["3101"],
      });

      expect(
        pareceTituloTruncadoOuPobre("Software de gestão da assistência social (SUAS)"),
      ).toBe(false);

      const saneamento = await reclassificarCatalogoLicitacoesService();
      expect(saneamento.ok).toBe(true);
      expect(saneamento.segmentosAlterados).toBeGreaterThanOrEqual(1);
      expect(saneamento.titulosCorrigidos).toBeGreaterThanOrEqual(1);

      const posSaneamentoTi = await listOportunidades({ segmento: "INFORMATICA" });
      expect(posSaneamentoTi).toHaveLength(0);

      const posSaneamentoFuneraria = await listOportunidades({ segmento: "FUNERARIA" });
      expect(posSaneamentoFuneraria).toHaveLength(1);
      expect(posSaneamentoFuneraria[0].miniResumo.toLowerCase()).not.toContain("software");
    });
  });
});

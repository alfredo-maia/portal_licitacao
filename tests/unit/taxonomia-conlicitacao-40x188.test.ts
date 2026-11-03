import { beforeEach, describe, expect, it } from "vitest";
import {
  CATALOGO_MACRO_SEGMENTOS,
  MacroSegmentoEnum,
} from "@/server/schemas/segmentos.schema";
import { classificarLicitacaoPorTexto } from "@/server/services/classificador-segmentos.service";
import { ingestLicitacoesV2 } from "@/server/services/ingestao.service";
import * as ingestaoServiceModule from "@/server/services/ingestao.service";
import * as ingestaoRouteModule from "@/app/api/ingestao/route";
import { listOportunidades } from "@/server/services/oportunidades.service";
import { pesquisarLicitacoes } from "@/server/services/busca-licitacoes.service";
import { clearInMemoryLicitacoes } from "@/server/services/licitacoes-store";

const MACRO_CODES_ESPERADOS = [
  "AGROPECUARIO",
  "ALIMENTACAO",
  "ARMAZENAGEM",
  "ASSESSORIAS",
  "CARTOES",
  "COMBUSTIVEIS",
  "COMUNICACAO_IDENTIFICACAO_VISUAL",
  "CONCESSOES_EXPLORACAO_IMOVEL",
  "CONFECCOES_DECORACAO",
  "DIDATICO",
  "ELETRO_ELETRONICOS_OTICA",
  "EMBALAGENS_E_LACRES",
  "ENGENHARIA_MATERIAIS",
  "ENGENHARIA_SERVICOS",
  "EQUIPAMENTOS_FERRAMENTAS",
  "ESCRITORIO_E_GRAFICA",
  "ESPECIALIZADOS",
  "ESPORTIVOS_MUSICAIS",
  "EVENTOS",
  "FERROVIARIOS",
  "FUNERARIA",
  "HOSPEDAGEM",
  "INFANTIL_PLAYGROUND",
  "INFORMATICA",
  "INSTALACOES",
  "LEILOES",
  "MOBILIARIOS",
  "PASSAGENS",
  "PETROBRAS",
  "PRESTACAO_DE_SERVICOS_MAO_DE_OBRA",
  "PRODUTOS_DE_LIMPEZA",
  "PUBLICIDADE",
  "QUIMICOS",
  "SAUDE",
  "SEGURANCA_PROTECAO",
  "SEGUROS",
  "SISTEMA_DE_VALES",
  "TRANSPORTES_AEREOS",
  "TRANSPORTES_NAUTICOS",
  "TRANSPORTES_RODOVIARIOS",
] as const;

describe("Issue #35 — Taxonomia Oficial Conlicitação (40 Macro-Categorias e 188 Subatividades)", () => {
  beforeEach(() => {
    clearInMemoryLicitacoes();
  });

  describe("1. Integridade Estrutural do Catálogo 40x188", () => {
    it("deve possuir exatamente 40 macro-categorias oficiais", () => {
      const chaves = Object.keys(CATALOGO_MACRO_SEGMENTOS);
      expect(chaves).toHaveLength(40);
      for (const code of MACRO_CODES_ESPERADOS) {
        expect(chaves).toContain(code);
        expect(MacroSegmentoEnum.safeParse(code).success).toBe(true);
      }
    });

    it("deve possuir exatamente 188 subatividades únicas com códigos de 4 dígitos e palavras-chave ricas", () => {
      const todasSubs = Object.values(CATALOGO_MACRO_SEGMENTOS).flatMap(
        (m) => m.subcategorias,
      );
      expect(todasSubs).toHaveLength(188);

      const codigosUnicos = new Set(todasSubs.map((s) => s.codigo));
      expect(codigosUnicos.size).toBe(188);

      for (const sub of todasSubs) {
        expect(sub.codigo).toMatch(/^\d{4}$/);
        expect(sub.nome.trim().length).toBeGreaterThan(2);
        expect(sub.palavrasChave.length).toBeGreaterThanOrEqual(4);
      }
    });
  });

  describe("2. Precisão do Classificador Semântico em Objetos Reais do PNCP", () => {
    it("classifica medicamentos em SAUDE / 2201 e materiais hospitalares em SAUDE / 2202", () => {
      const med = classificarLicitacaoPorTexto(
        "Registro de preços para aquisição de medicamentos injetáveis, antibióticos e amoxicilina para a Farmácia Básica Municipal",
      );
      expect(med.macro).toBe("SAUDE");
      expect(med.subcategorias).toContain("2201");

      const hosp = classificarLicitacaoPorTexto(
        "Aquisição de materiais médico-hospitalares descartáveis: seringas, luvas de procedimento, gaze estéril e cateteres",
      );
      expect(hosp.macro).toBe("SAUDE");
      expect(hosp.subcategorias).toContain("2202");
    });

    it("classifica SaaS/ERP em INFORMATICA / 3101 e relógio de ponto eletrônico em INFORMATICA / 3106", () => {
      const saas = classificarLicitacaoPorTexto(
        "Contratação de empresa especializada para licenciamento de software de gestão pública municipal (ERP) em nuvem SaaS",
      );
      expect(saas.macro).toBe("INFORMATICA");
      expect(saas.subcategorias).toContain("3101");

      const ponto = classificarLicitacaoPorTexto(
        "Aquisição e implantação de relógio de ponto eletrônico biométrico e controle de acesso por catraca",
      );
      expect(ponto.macro).toBe("INFORMATICA");
      expect(ponto.subcategorias).toContain("3106");
    });

    it("separa COMBUSTIVEIS (2001/2002), TRANSPORTES_RODOVIARIOS (1701/1705) e SISTEMA_DE_VALES (2601)", () => {
      const comb = classificarLicitacaoPorTexto(
        "Fornecimento parcelado de combustíveis (gasolina comum e óleo diesel S10) e óleos lubrificantes automotivos",
      );
      expect(comb.macro).toBe("COMBUSTIVEIS");
      expect(comb.subcategorias).toContain("2001");

      const glp = classificarLicitacaoPorTexto(
        "Aquisição de recarga de gás liquefeito de petróleo (GLP) acondicionado em botijões P13 e P45",
      );
      expect(glp.macro).toBe("COMBUSTIVEIS");
      expect(glp.subcategorias).toContain("2002");

      const frota = classificarLicitacaoPorTexto(
        "Aquisição de pneus novos radiais, câmaras de ar, baterias e serviços de manutenção preventiva de veículos da frota",
      );
      expect(frota.macro).toBe("TRANSPORTES_RODOVIARIOS");
      expect(frota.subcategorias).toContain("1705");

      const vales = classificarLicitacaoPorTexto(
        "Administração e gerenciamento de benefício de auxílio-alimentação e vale-refeição por meio de cartões magnéticos",
      );
      expect(vales.macro).toBe("SISTEMA_DE_VALES");
      expect(vales.subcategorias).toContain("2601");
    });

    it("separa ENGENHARIA_SERVICOS (0103), ENGENHARIA_MATERIAIS (0121) e INSTALACOES (0204/0208)", () => {
      const pavimentacao = classificarLicitacaoPorTexto(
        "Contratação de obra de engenharia para pavimentação asfáltica em CBUQ, recapeamento e drenagem pluvial",
      );
      expect(pavimentacao.macro).toBe("ENGENHARIA_SERVICOS");
      expect(pavimentacao.subcategorias).toContain("0103");

      const matConstrucao = classificarLicitacaoPorTexto(
        "Registro de preços para aquisição de cimento Portland, areia lavada, pedra britada, tijolos cerâmicos e telhas",
      );
      expect(matConstrucao.macro).toBe("ENGENHARIA_MATERIAIS");
      expect(matConstrucao.subcategorias).toContain("0121");

      const arCond = classificarLicitacaoPorTexto(
        "Serviços de instalação e manutenção preventiva de aparelhos de ar condicionado split com PMOC e limpeza de dutos",
      );
      expect(arCond.macro).toBe("INSTALACOES");
      expect(arCond.subcategorias).toContain("0204");
    });

    it("não gera falso positivo em LEILOES para compras normais, mas classifica leilão de inservíveis em LEILOES", () => {
      const compraVeiculos = classificarLicitacaoPorTexto(
        "Pregão Eletrônico para aquisição de 02 veículos zero km tipo ambulância e caminhonete 4x4",
      );
      expect(compraVeiculos.macro).toBe("TRANSPORTES_RODOVIARIOS");
      expect(compraVeiculos.macro).not.toBe("LEILOES");

      const leilao = classificarLicitacaoPorTexto(
        "Leilão eletrônico para alienação de bens móveis inservíveis, sucatas e veículos antieconômicos do patrimônio municipal",
      );
      expect(leilao.macro).toBe("LEILOES");
      expect(
        leilao.subcategorias.some((c) => c === "3701" || c === "3708"),
      ).toBe(true);
    });
  });

  describe("3. Filtragem Estrita por Segmento e Subsegmento (Oportunidades & Busca)", () => {
    it("filtra corretamente por segmento, subsegmento, subsegmentosTenantAtivo e subcategorias", async () => {
      const amanha = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
      await ingestLicitacoesV2({
        versaoContrato: 2,
        executadoEm: new Date().toISOString(),
        totalRegistros: 3,
        licitacoes: [
          {
            pncpId: "TEST-INF-ERP-001",
            numeroEdital: "PE 01/2026",
            orgao: { cnpj: "11.222.333/0001-81", nome: "Prefeitura Alfa", uf: "GO" },
            modalidade: "Pregão Eletrônico",
            valorEstimado: 250000,
            dataAbertura: amanha,
            miniResumo: "Software ERP em nuvem",
            resumo: "Licenciamento de software de gestão pública ERP em nuvem SaaS com suporte técnico",
            tipoSistemaSugerido: "OUTROS",
          },
          {
            pncpId: "TEST-INF-PONTO-002",
            numeroEdital: "PE 02/2026",
            orgao: { cnpj: "11.222.333/0001-81", nome: "Prefeitura Beta", uf: "SP" },
            modalidade: "Pregão Eletrônico",
            valorEstimado: 45000,
            dataAbertura: amanha,
            miniResumo: "Relógio de ponto biométrico",
            resumo: "Aquisição de relógio de ponto eletrônico biométrico homologado pelo MTE",
            tipoSistemaSugerido: "OUTROS",
          },
          {
            pncpId: "TEST-SAUDE-MED-003",
            numeroEdital: "PE 03/2026",
            orgao: { cnpj: "11.222.333/0001-81", nome: "Fundo Municipal de Saúde", uf: "MG" },
            modalidade: "Pregão Eletrônico",
            valorEstimado: 180000,
            dataAbertura: amanha,
            miniResumo: "Aquisição de medicamentos básicos",
            resumo: "Registro de preços para aquisição de medicamentos antibióticos e analgésicos",
            tipoSistemaSugerido: "OUTROS",
          },
        ],
      });

      // 1) Filtro por segmento INFORMATICA retorna os 2 de TI
      const listaInf = await listOportunidades({ segmento: "INFORMATICA" });
      expect(listaInf.map((l) => l.idPncp).sort()).toEqual([
        "TEST-INF-ERP-001",
        "TEST-INF-PONTO-002",
      ]);

      // 2) Filtro por segmento INFORMATICA + subsegmento 3106 retorna apenas o relógio de ponto
      const listaPonto = await listOportunidades({
        segmento: "INFORMATICA",
        subsegmento: "3106",
      });
      expect(listaPonto.map((l) => l.idPncp)).toEqual(["TEST-INF-PONTO-002"]);

      // 3) Preferência do tenant restrita a subsegmentosTenantAtivo: ["3101"] exclui o 3106
      const listaTenantErpOnly = await listOportunidades({
        segmentosTenantAtivo: ["INFORMATICA"],
        subsegmentosTenantAtivo: ["3101"],
      } as any);
      expect(listaTenantErpOnly.map((l) => l.idPncp)).toEqual([
        "TEST-INF-ERP-001",
      ]);

      // 4) Busca textual/facetada com filtro de subcategorias: ["2201"]
      const buscaMed = await pesquisarLicitacoes({
        macroSegmentos: ["SAUDE"],
        subcategorias: ["2201"],
      });
      expect(buscaMed.itens.map((i) => i.idPncp)).toEqual([
        "TEST-SAUDE-MED-003",
      ]);
    });
  });

  describe("4. Governança Anti-Exclusão em Massa no Código de Produção", () => {
    it("não deve expor endpoint DELETE em /api/ingestao nem função limparTodasLicitacoes no serviço", () => {
      expect("DELETE" in ingestaoRouteModule).toBe(false);
      expect("limparTodasLicitacoes" in ingestaoServiceModule).toBe(false);
    });
  });
});


describe("Issue #35 — Busca rápida de segmentos e subatividades (cadastro/configurações)", () => {
  it("filtra macro-categorias por nome, subatividade ou código, ignorando acentos", async () => {
    const { filtrarCatalogoSegmentos } = await import("@/lib/segmentos-busca");
    expect(filtrarCatalogoSegmentos("")).toHaveLength(40);
    expect(filtrarCatalogoSegmentos("pavimentacao").map((m) => m.codigo)).toContain("ENGENHARIA_SERVICOS");
    expect(filtrarCatalogoSegmentos("Saúde").map((m) => m.codigo)).toContain("SAUDE");
    expect(filtrarCatalogoSegmentos("3106").map((m) => m.codigo)).toEqual(["INFORMATICA"]);
    expect(filtrarCatalogoSegmentos("zzzz-inexistente")).toHaveLength(0);
  });
});

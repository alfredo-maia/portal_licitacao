import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RbacUser } from "@/lib/rbac";
import {
  itemDisputaEditalSchema,
  relatorioParticipacaoSchema,
} from "@/server/schemas/analise-ia.schema";
import {
  aguardarProcessamentoAnaliseIA,
  construirRelatorioParticipacaoHibrido,
  gerarPdfRelatorioParticipacao,
  iniciarAnaliseParticipacaoAssincrona,
  obterStatusCotaAnaliseIA,
} from "@/server/services/analise-ia-participacao.service";
import { getOportunidadeById } from "@/server/services/oportunidades.service";
import {
  insertInMemoryLicitacao,
  insertInMemoryLicitacaoArquivo,
  insertInMemoryUsuario,
  resetInMemoryLicitacoes,
} from "@/server/services/licitacoes-store";
import { inMemoryTenants } from "@/server/services/tenant.service";

const TENANT_ID = "tenant_raiox_test";

const DIRETOR: RbacUser & { id: string } = {
  id: "usr_raiox_dir",
  name: "Dário Diretor",
  email: "dario@empresa.com.br",
  role: "DIRETORIA",
  ativo: true,
};

describe("Issue #37 — Raio-X de Edital & ATA com Inteligência Artificial", () => {
  beforeEach(() => {
    resetInMemoryLicitacoes();
    inMemoryTenants.set(TENANT_ID, {
      id: TENANT_ID,
      nome: "Empresa Licitante Pro",
      plano: "PRO",
    } as any);
    insertInMemoryUsuario({
      id: DIRETOR.id,
      name: DIRETOR.name,
      email: DIRETOR.email,
      role: DIRETOR.role,
      tenantId: TENANT_ID,
      ativo: true,
    });
  });

  function criarLicitacaoBase(params?: {
    resumo?: string;
    isPresencial?: boolean;
    comArquivos?: boolean;
  }): string {
    const lic = insertInMemoryLicitacao({
      idPncp: `12345678000199-1-${Math.floor(Math.random() * 1e6)}/2026`,
      numeroControlePNCP: null,
      numeroEdital: "PE 999/2026",
      orgaoNome: "Tribunal de Justiça do Estado",
      orgaoCnpj: "12345678000199",
      uf: "DF",
      municipio: "Brasília",
      esfera: "E",
      poder: "J",
      modalidade: "Pregão Eletrônico",
      modalidadeCodigo: 6,
      portalDisputa: "Compras.gov.br",
      miniResumo: params?.resumo || "Aquisição de computadores portáteis e monitores",
      resumo:
        params?.resumo ||
        "Aquisição de Notebooks corporativos modelo Apple MacBook Pro M4 512GB SSD e Monitores Dell 27 polegadas 4K.",
      valorEstimado: 350_000,
      dataAbertura: new Date("2026-12-20T14:00:00Z"),
      dataEncerramentoProposta: new Date("2026-12-20T14:00:00Z"),
      dataPublicacaoPncp: new Date("2026-11-01T10:00:00Z"),
      dataUltimaAtualizacao: new Date("2026-11-01T10:00:00Z"),
      status: "PENDENTE",
      parecerIA: "GO",
      justificativaIA: null,
      tipoSistemaCodigo: "SISTEMA_NOVO",
      segmentoMacro: "TECNOLOGIA_DA_INFORMACAO",
      subcategorias: [],
      atestadosExigidos: ["Atestado de fornecimento de equipamentos de TI de alta performance"],
      motivoRecusa: null,
      quantidadeLotes: 2,
      loteUnico: false,
      precoPorLote: true,
      isPresencial: Boolean(params?.isPresencial),
      distanciaGoianiaKm: 210,
    } as any);

    if (params?.comArquivos !== false) {
      insertInMemoryLicitacaoArquivo(lic.id, {
        id: `arq_edital_${lic.id}`,
        nome: "Edital_PE_999_2026_TR.pdf",
        url: "https://pncp.gov.br/arquivos/edital_999.pdf",
        tamanho: 2048576,
        tipo: "EDITAL",
      });
    }

    return lic.id;
  }

  describe("1. Contrato Zod do Raio-X de Edital & ATA", () => {
    it("valida estrutura completa com itens, habilitação, cronograma, riscos e swot", () => {
      const mockRelatorio = {
        parecer: "APTO",
        scoreAderencia: 88,
        segmentoIdentificado: "Tecnologia da Informação",
        resumoExecutivo: "A empresa possui plena capacidade técnica e documental para disputar.",
        habilitacao: {
          status: "APTO",
          scoreConformidade: 90,
          resumo: "Certidões regulares cadastradas.",
          certidoesRegulares: ["CND Federal", "FGTS", "CNDT"],
          certidoesVencidasOuPendentes: [],
          atestadosExigidos: ["Atestado de Capacidade Técnica de TI"],
          exigenciasEspeciais: [],
        },
        cronograma: {
          dataPrevisaoInicio: "15/01/2027",
          prazoInicioPedidosAposAssinatura: "Até 10 dias úteis após assinatura da Ata",
          prazoEntregaExecucao: "30 dias por remessa",
          enderecoExecucaoOuEntrega: "Brasília - DF (Sede do TJ)",
          isPresencial: false,
        },
        itens: {
          totalItens: 2,
          valorTotalEstimado: 350000,
          destaqueMarcasExigidas: ["MacBook Pro M4 512GB", "Dell 27 polegadas"],
          lista: [
            {
              numeroItem: 1,
              lote: 1,
              descricao: "Notebook corporativo Apple MacBook Pro M4",
              quantidade: 20,
              unidadeMedida: "UN",
              valorUnitarioEstimado: 12000,
              valorTotalEstimado: 240000,
              marcaExigidaOuReferencia: "MacBook Pro M4",
            },
          ],
        },
        riscos: {
          prazoPagamentoOrgao: "Até 30 dias após atesto da Nota Fiscal",
          exigenciaGarantiaContratual: "Garantia de 5% sobre o valor adjudicado",
          clausulasPenalidadesMultas: ["Multa de 0,5% por dia de atraso"],
          riscosFinanceirosIdentificados: ["Descasamento de fluxo de caixa"],
          nivelRiscoGeral: "BAIXO",
        },
        swot: {
          forcas: ["Regularidade documental em /documentacao"],
          fraquezas: ["Necessidade de homologação rápida com o distribuidor"],
          oportunidades: ["Fornecimento continuado via Ata de Registro de Preços"],
          ameacas: ["Disputa predatória de lances"],
        },
      };

      const parsed = relatorioParticipacaoSchema.parse(mockRelatorio);
      expect(parsed.parecer).toBe("APTO");
      expect(parsed.habilitacao.status).toBe("APTO");
      expect(parsed.cronograma.prazoInicioPedidosAposAssinatura).toContain("10 dias úteis");
      expect(parsed.itens.destaqueMarcasExigidas).toHaveLength(2);
      expect(parsed.riscos.nivelRiscoGeral).toBe("BAIXO");
      expect(parsed.swot.forcas).toHaveLength(1);
    });

    it("valida schema de itens da disputa com lote e marca opcional", () => {
      const itemValido = {
        numeroItem: 1,
        lote: 2,
        descricao: "Dipirona Monoidratada 500mg/ml",
        quantidade: 5000,
        unidadeMedida: "FR",
        valorUnitarioEstimado: 2.5,
        valorTotalEstimado: 12500,
        marcaExigidaOuReferencia: "Genérico homologado Anvisa",
      };

      const itemParsed = itemDisputaEditalSchema.parse(itemValido);
      expect(itemParsed.unidadeMedida).toBe("FR");
      expect(itemParsed.marcaExigidaOuReferencia).toContain("Anvisa");
    });
  });

  describe("2. Pre-flight de Auto-Sincronização & Proteção de Cota", () => {
    it("interrompe sem arquivos e NÃO debita a cota mensal da empresa", async () => {
      const licSemArquivos = criarLicitacaoBase({ comArquivos: false });
      const refNovembro = new Date("2026-11-15T15:00:00Z");

      const cotaAntes = await obterStatusCotaAnaliseIA(TENANT_ID, refNovembro);
      expect(cotaAntes.usadas).toBe(0);

      await expect(
        iniciarAnaliseParticipacaoAssincrona(
          licSemArquivos,
          {},
          DIRETOR,
          undefined,
          TENANT_ID,
          { referencia: refNovembro },
        ),
      ).rejects.toMatchObject({
        code: "SEM_ARQUIVOS_EDITAL",
        status: 400,
      });

      // Verifica que a cota permaneceu intacta (0/10)
      const cotaDepois = await obterStatusCotaAnaliseIA(TENANT_ID, refNovembro);
      expect(cotaDepois.usadas).toBe(0);
      expect(cotaDepois.restantes).toBe(10);
    });

    it("inicia a análise com sucesso e incrementa a cota quando arquivos estão presentes", async () => {
      const licComArquivos = criarLicitacaoBase({ comArquivos: true });
      const refNovembro = new Date("2026-11-15T15:00:00Z");

      const inicio = await iniciarAnaliseParticipacaoAssincrona(
        licComArquivos,
        { observacoes: "Dar atenção especial aos prazos de entrega do Lote 1" },
        DIRETOR,
        undefined,
        TENANT_ID,
        { referencia: refNovembro },
      );

      expect(inicio.status).toBe("PROCESSANDO");
      expect(inicio.cota.usadas).toBe(1);
      expect(inicio.cota.limite).toBe(10);

      const concluido = await aguardarProcessamentoAnaliseIA(inicio.analiseId);
      expect(concluido).toBeTruthy();
      expect(concluido.status).toBe("CONCLUIDO");
      expect(["APTO", "APTO_COM_RESSALVAS"]).toContain(concluido.parecer);
      expect(concluido.relatorioJson?.habilitacao).toBeDefined();
      expect(concluido.relatorioJson?.cronograma).toBeDefined();
      expect(concluido.relatorioJson?.itens).toBeDefined();
      expect(concluido.relatorioJson?.riscos).toBeDefined();
      expect(concluido.relatorioJson?.swot).toBeDefined();
    });

    it("busca e baixa os editais do PNCP automaticamente caso o dossiê esteja sem arquivos e prossegue", async () => {
      const licSemArquivos = criarLicitacaoBase({ comArquivos: false });
      const refNovembro = new Date("2026-11-15T15:00:00Z");

      // Simula a resposta da API oficial do PNCP retornando 2 arquivos oficiais
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockImplementation((url: string, opts?: any) => {
        if (typeof url === "string" && url.includes("pncp.gov.br/api/pncp/v1/orgaos")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve([
                {
                  titulo: "Edital_Oficial_PE_999_2026.pdf",
                  url: "https://pncp.gov.br/arquivos/edital_999.pdf",
                  tamanho: 2048576,
                },
                {
                  titulo: "Termo_de_Referencia_Anexo_I.pdf",
                  url: "https://pncp.gov.br/arquivos/tr_anexo_1.pdf",
                  tamanho: 1048576,
                },
              ]),
          } as any);
        }
        return originalFetch(url, opts);
      });

      try {
        const inicio = await iniciarAnaliseParticipacaoAssincrona(
          licSemArquivos,
          {},
          DIRETOR,
          undefined,
          TENANT_ID,
          { referencia: refNovembro, aguardarConclusao: true },
        );

        expect(inicio.ok).toBe(true);
        expect(inicio.status).toBe("CONCLUIDO");
        expect(inicio.cota.usadas).toBe(1);

        // Verifica que os arquivos foram baixados e vinculados no dossiê
        const recarregada = await getOportunidadeById(licSemArquivos, TENANT_ID);
        expect(recarregada.arquivos.length).toBeGreaterThanOrEqual(2);
        const nomes = recarregada.arquivos.map((a: any) => a.nome);
        expect(nomes).toContain("Edital_Oficial_PE_999_2026.pdf");
        expect(nomes).toContain("Termo_de_Referencia_Anexo_I.pdf");
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe("3. Extração de Marcas, Prazos, Endereço e Matriz SWOT", () => {
    it("extrai marcas exigidas no objeto (ex: MacBook Pro, Dell) e monta SWOT", async () => {
      const licId = criarLicitacaoBase({
        resumo:
          "Registro de Preços para aquisição de Computadores Apple MacBook Pro M4 e Televisores Samsung 55 QLED para salas de audiência.",
        comArquivos: true,
      });

      const { relatorio, relatorioTexto } = await construirRelatorioParticipacaoHibrido(
        licId,
        { observacoes: "Verificar garantia contratual" },
        TENANT_ID,
      );

      expect(relatorio.segmentoIdentificado).toBeTruthy();
      expect(relatorio.habilitacao.status).toBeTruthy();
      expect(relatorio.cronograma.enderecoExecucaoOuEntrega).toContain("Brasília");
      expect(relatorio.cronograma.prazoInicioPedidosAposAssinatura).toBeTruthy();

      // Destaque de marcas detectadas no edital
      expect(relatorio.itens.destaqueMarcasExigidas.length).toBeGreaterThanOrEqual(1);
      const marcasTexto = relatorio.itens.destaqueMarcasExigidas.join(" ");
      expect(marcasTexto.toLowerCase()).toMatch(/macbook|samsung/);

      // Riscos e Matriz SWOT
      expect(relatorio.riscos.prazoPagamentoOrgao).toContain("30 dias");
      expect(relatorio.swot.forcas.length).toBeGreaterThan(0);
      expect(relatorio.swot.fraquezas.length).toBeGreaterThan(0);
      expect(relatorio.swot.oportunidades.length).toBeGreaterThan(0);
      expect(relatorio.swot.ameacas.length).toBeGreaterThan(0);

      // Relatório em texto estruturado
      expect(relatorioTexto).toContain("RAIO-X DE EDITAL & ATA DE REGISTRO DE PREÇOS");
      expect(relatorioTexto).toContain("1. RESUMO EXECUTIVO");
      expect(relatorioTexto).toContain("3. CRONOGRAMA, PRAZOS PÓS-ASSINATURA E ENDEREÇO");
      expect(relatorioTexto).toContain("4. ITENS E MARCAS EXIGIDAS");
      expect(relatorioTexto).toContain("6. MATRIZ SWOT");
    });

    it("sinaliza certame presencial e alerta de logística quando presencial for true", async () => {
      const licPresencialId = criarLicitacaoBase({
        isPresencial: true,
        comArquivos: true,
      });

      const { relatorio } = await construirRelatorioParticipacaoHibrido(
        licPresencialId,
        {},
        TENANT_ID,
      );

      expect(relatorio.cronograma.isPresencial).toBe(true);
      expect(relatorio.cronograma.observacoesLogistica).toContain("presencial");
      expect(
        relatorio.habilitacao.exigenciasEspeciais.some((e) =>
          e.toLowerCase().includes("presencial"),
        ),
      ).toBe(true);
    });
  });

  describe("4. Geração de PDF Válido 1.4 Corporativo", () => {
    it("gera PDF completo contendo todas as 7 seções do Raio-X", async () => {
      const licId = criarLicitacaoBase({ comArquivos: true });
      const { relatorio, oportunidade, empresa } =
        await construirRelatorioParticipacaoHibrido(licId, {}, TENANT_ID);

      const { pdfBase64, pdfNome } = gerarPdfRelatorioParticipacao({
        numeroEdital: oportunidade.numeroEdital,
        orgaoNome: oportunidade.orgaoNome,
        modalidade: oportunidade.modalidade,
        uf: oportunidade.uf,
        municipio: oportunidade.municipio,
        valorEstimado: oportunidade.valorEstimado,
        dataAbertura: oportunidade.dataAbertura,
        empresaNome: empresa?.razaoSocial || "Empresa Licitante Teste",
        empresaCnpj: empresa?.cnpj || "00.000.000/0001-00",
        relatorio,
      });

      expect(pdfNome).toMatch(/^Relatorio_IA_Edital_.*\.pdf$/);
      expect(pdfBase64).toBeTruthy();

      const decoded = Buffer.from(pdfBase64, "base64").toString("ascii");
      expect(decoded.startsWith("%PDF-1.4")).toBe(true);
      expect(decoded).toContain("RAIO-X DE EDITAL & ATA");
      expect(decoded).toContain("1. IDENTIFICACAO DO CERTAME");
      expect(decoded).toContain("2. VEREDITO DE HABILITACAO");
      expect(decoded).toContain("3. CRONOGRAMA, PRAZOS POS-ASSINATURA");
      expect(decoded).toContain("4. ITENS EM DISPUTA E MARCAS EXIGIDAS");
      expect(decoded).toContain("5. RISCOS CONTRATUAIS");
      expect(decoded).toContain("6. MATRIZ SWOT DA OPORTUNIDADE");
      expect(decoded.trim().endsWith("%%EOF")).toBe(true);
    });
  });
});

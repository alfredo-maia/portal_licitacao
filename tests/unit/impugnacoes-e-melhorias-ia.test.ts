import { describe, it, expect, beforeEach } from "vitest";
import {
  calcularPrazoFatalImpugnacao,
  impugnacaoCriarInputSchema,
} from "@/server/schemas/impugnacao.schema";
import {
  criarImpugnacao,
  listarImpugnacoes,
  obterImpugnacao,
} from "@/server/services/impugnacoes.service";
import {
  gerarMinutaJuridica,
  gerarPdfMinutaImpugnacao,
} from "@/lib/minuta-juridica";
import { relatorioParticipacaoSchema } from "@/server/schemas/analise-ia.schema";
import { gerarPdfRelatorioParticipacao } from "@/server/services/analise-ia-participacao.service";

describe("Evolução do Módulo de Impugnações e Raio-X IA", () => {
  const tenantA = "tenant_empresa_alpha_cnpj_1";
  const tenantB = "tenant_empresa_beta_cnpj_2";

  it("1. Calcula corretamente o Prazo Fatal Legal (3 dias úteis antes às 18h)", () => {
    // Sexta-feira: 2026-11-20T09:00:00Z -> Prazo Fatal: Terça-feira 2026-11-17 às 18:00
    const dataAbertura = new Date("2026-11-20T09:00:00.000Z");
    const fatal = calcularPrazoFatalImpugnacao(dataAbertura);

    expect(fatal.getDate()).toBe(17);
    expect(fatal.getHours()).toBe(18);
    expect(fatal.getMinutes()).toBe(0);
  });

  it("2. Garante isolamento estrito Multi-Tenant entre CNPJs para impugnações", async () => {
    const impA = await criarImpugnacao(
      {
        numeroEdital: "PE 101/2026-ALPHA",
        orgaoNome: "Tribunal Regional Eleitoral - SP",
        motivoLegal: "Súmula 273/TCU — Exigência indevida de marca exclusiva",
        dataAberturaSessao: new Date("2026-11-25T10:00:00Z"),
        fundamentacao: "Fundamentação legal detalhada para a empresa Alpha...",
        pedidos: "Requer republicação do edital.",
      },
      "user_alpha",
      tenantA,
    );

    const impB = await criarImpugnacao(
      {
        numeroEdital: "PE 202/2026-BETA",
        orgaoNome: "Prefeitura Municipal de Santos",
        motivoLegal: "Súmula 263/TCU — Atestados técnicos desproporcionais",
        dataAberturaSessao: new Date("2026-11-26T14:00:00Z"),
        fundamentacao: "Fundamentação legal detalhada para a empresa Beta...",
        pedidos: "Requer exclusão da cláusula 5.2.",
      },
      "user_beta",
      tenantB,
    );

    // Listagem no tenant A: deve retornar apenas a impugnação de A
    const listA = await listarImpugnacoes({ page: 1, pageSize: 20 }, tenantA);
    expect(listA.impugnacoes.some((i) => i.id === impA.id)).toBe(true);
    expect(listA.impugnacoes.some((i) => i.id === impB.id)).toBe(false);

    // Listagem no tenant B: deve retornar apenas a impugnação de B
    const listB = await listarImpugnacoes({ page: 1, pageSize: 20 }, tenantB);
    expect(listB.impugnacoes.some((i) => i.id === impB.id)).toBe(true);
    expect(listB.impugnacoes.some((i) => i.id === impA.id)).toBe(false);

    // Tentativa de obter impugnação de B usando credencial de A: deve retornar null
    const cruzamento = await obterImpugnacao(impB.id, tenantA);
    expect(cruzamento).toBeNull();
  });

  it("3. Gera Minuta Jurídica com dados societários dinâmicos da empresa ativa (Zero dados mock fixos)", () => {
    const dadosEmpresa = {
      razaoSocial: "EMPRESA DINAMICA LICITACOES LTDA",
      cnpj: "12.345.678/0001-90",
      enderecoCompleto: "Av. Paulista, 1000 - São Paulo/SP",
      representanteLegal: "Dr. Carlos Eduardo Silva",
    };

    const imp = {
      id: "imp_test_123",
      numeroEdital: "PE 88/2026",
      orgaoNome: "Tribunal de Contas da União",
      objeto: "Fornecimento de infraestrutura de TI",
      motivoLegal: "Vedação à marca exclusiva",
      fundamentacao: "Afronta a jurisprudência sumulada do TCU.",
      pedidos: "Retificação do instrumento convocatório.",
      dataAberturaSessao: new Date("2026-12-01T10:00:00Z"),
      prazoFatal: new Date("2026-11-26T18:00:00Z"),
      status: "RASCUNHO" as const,
      horasRestantesPrazoFatal: 72,
      prazoVencido: false,
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    };

    const minuta = gerarMinutaJuridica(imp, dadosEmpresa);
    expect(minuta.minutaTexto).toContain("EMPRESA DINAMICA LICITACOES LTDA");
    expect(minuta.minutaTexto).toContain("12.345.678/0001-90");
    expect(minuta.minutaTexto).not.toContain("APONTA TECNOLOGIA E SERVICOS LTDA");
  });

  it("4. Gera PDF Timbrado Corporativo válido com os metadados do CNPJ ativo", async () => {
    const imp = {
      id: "imp_pdf_456",
      numeroEdital: "PE 99/2026",
      orgaoNome: "Companhia Docas do Estado de São Paulo",
      objeto: "Obras civis de revitalização portuária",
      motivoLegal: "Prazo inexequível de mobilização",
      fundamentacao: "Acórdão 1.542/2019-Plenário do TCU.",
      pedidos: "Dilação de prazo para 20 dias úteis.",
      dataAberturaSessao: new Date("2026-12-10T10:00:00Z"),
      prazoFatal: new Date("2026-12-07T18:00:00Z"),
      status: "RASCUNHO" as const,
      horasRestantesPrazoFatal: 96,
      prazoVencido: false,
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    };

    const empresa = {
      razaoSocial: "CONSTRUTORA E ENGENHARIA BRASIL SA",
      cnpj: "98.765.432/0001-10",
      enderecoCompleto: "Rua das Docas, 45 - Santos/SP",
      representanteLegal: "Engenheira Fernanda Souza",
      logoUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    };

    const { pdfBuffer, pdfNome } = await gerarPdfMinutaImpugnacao({
      impugnacao: imp,
      empresa,
    });

    expect(pdfBuffer).toBeDefined();
    expect(pdfBuffer.byteLength).toBeGreaterThan(500);
    expect(pdfBuffer.toString("utf8", 0, 8)).toContain("%PDF-");
    expect(pdfNome).toContain("impugnacao_PE_99_2026_timbrada.pdf");
  });

  it("4b. Valida geração de PDF com Folha Timbrada em PDF e precedência sobre logotipo", async () => {
    const { PDFDocument } = await import("pdf-lib");
    const bgDoc = await PDFDocument.create();
    const bgPage = bgDoc.addPage([595.28, 841.89]);
    bgPage.drawText("CABECALHO TIMBRADO DA EMPRESA MODELO", { x: 54, y: 800, size: 10 });
    const bgBytes = await bgDoc.save();
    const bgBase64 = `data:application/pdf;base64,${Buffer.from(bgBytes).toString("base64")}`;

    const imp = {
      id: "imp_timbrado_test",
      licitacaoId: null,
      tenantId: "tenant_alpha",
      numeroEdital: "PE 101/2026",
      orgaoNome: "PREFEITURA MUNICIPAL DE EXEMPLO",
      objeto: "Servicos especializados de engenharia",
      status: "RASCUNHO" as const,
      motivoLegal: "Exigencia descabida",
      dataAberturaSessao: new Date("2026-11-20T10:00:00Z"),
      prazoFatal: new Date("2026-11-17T18:00:00Z"),
      fundamentacao: "Afronta a jurisprudencia consolidada do TCU.",
      pedidos: "Requer-se retificacao do edital.",
      horasRestantesPrazoFatal: 72,
      prazoVencido: false,
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    };

    const empresa = {
      razaoSocial: "EMPRESA TIMBRADA LTDA",
      cnpj: "11.222.333/0001-44",
      papelTimbradoUrl: bgBase64,
      logoUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    };

    const { pdfBuffer, pdfNome } = await gerarPdfMinutaImpugnacao({
      impugnacao: imp,
      empresa,
    });

    expect(pdfBuffer).toBeDefined();
    expect(pdfBuffer.byteLength).toBeGreaterThan(1000);
    expect(pdfBuffer.toString("utf8", 0, 8)).toContain("%PDF-");
    expect(pdfNome).toBe("impugnacao_PE_101_2026_timbrada.pdf");
  });

  it("5. Valida o novo contrato de Raio-X IA com sugestão de CNAEs e Certificações Especiais", () => {
    const mockRelatorio = {
      parecer: "APTO_COM_RESSALVAS",
      scoreAderencia: 82,
      segmentoIdentificado: "Engenharia e Infraestrutura",
      resumoExecutivo: "A empresa possui aderência técnica sólida para participar da concorrência.",
      cnaesAptosSugeridos: [
        "4120-4/00 - Construção de edifícios",
        "4321-5/00 - Instalação e manutenção elétrica",
      ],
      certificacoesETempoAtuacao: {
        certificacoesEspeciais: ["ISO 9001:2015", "PBQP-H Nível A"],
        tempoMinimoAtuacao: "Mínimo de 3 anos de constituição jurídica",
      },
      habilitacao: {
        status: "APTO_COM_RESSALVAS",
        scoreConformidade: 82,
        resumo: "Conformidade preliminar com exigência de vistoria técnica.",
        certidoesRegulares: ["CND Federal", "FGTS"],
        certidoesVencidasOuPendentes: [],
        atestadosExigidos: ["Atestado de execução de obras civis > 2.000m²"],
        exigenciasEspeciais: ["Declaração formal de conhecimento do local"],
      },
      swot: {
        forcas: ["Regularidade fiscal plena"],
        fraquezas: ["Pendente atestado complementar"],
        oportunidades: ["Acervo técnico para certames futuros"],
        ameacas: ["Concorrência com preços agressivos"],
      },
    };

    const validado = relatorioParticipacaoSchema.parse(mockRelatorio);
    expect(validado.cnaesAptosSugeridos).toHaveLength(2);
    expect(validado.cnaesAptosSugeridos[0]).toContain("4120-4/00");
    expect(validado.certificacoesETempoAtuacao.certificacoesEspeciais).toContain("ISO 9001:2015");
    expect(validado.certificacoesETempoAtuacao.tempoMinimoAtuacao).toBe("Mínimo de 3 anos de constituição jurídica");

    // Valida também geração do PDF do Raio-X com esses novos campos
    const { pdfBuffer } = gerarPdfRelatorioParticipacao({
      numeroEdital: "PE 50/2026",
      orgaoNome: "DER-SP",
      modalidade: "Pregão Eletrônico",
      uf: "SP",
      municipio: "São Paulo",
      valorEstimado: 2500000,
      dataAbertura: "2026-12-15T09:00:00Z",
      empresaNome: "Empresa Teste",
      empresaCnpj: "00.000.000/0001-00",
      relatorio: validado,
    });

    expect(pdfBuffer).toBeDefined();
    expect(pdfBuffer.toString("utf8", 0, 8)).toContain("%PDF-1.4");
  });
});

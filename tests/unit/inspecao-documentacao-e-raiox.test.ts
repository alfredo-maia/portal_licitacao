import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  inspecionarArquivoDocumentoCofre,
} from "@/server/services/inspecao-documento-cofre.service";
import {
  criarDocumento,
  revalidarAnexoDocumento,
} from "@/server/services/documentos.service";
import {
  construirRelatorioParticipacaoHibrido,
} from "@/server/services/analise-ia-participacao.service";
import {
  insertInMemoryLicitacao,
  insertInMemoryLicitacaoArquivo,
  insertInMemoryPortal,
  resetInMemoryLicitacoes,
  updateInMemoryConfiguracaoEmpresa,
} from "@/server/services/licitacoes-store";
import { inMemoryTenants } from "@/server/services/tenant.service";

async function criarPdfTexto(linhas: string[]): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595, 842]);
  let y = 780;
  for (const linha of linhas) {
    page.drawText(linha, { x: 42, y, size: 11, font });
    y -= 18;
  }
  return Buffer.from(await pdf.save());
}

describe("Inspeção Real de Documentos (/documentacao) & Veracidade do Raio-X IA (Conta 80.445.611/0001-82)", () => {
  const TENANT_ID = "tenant_80445611";
  const CNPJ_ALVO = "80.445.611/0001-82";
  const arquivosTemporarios: string[] = [];
  const originalFetch = global.fetch;
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  const originalOpenAiKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    resetInMemoryLicitacoes();
    inMemoryTenants.set(TENANT_ID, {
      id: TENANT_ID,
      razaoSocial: "COMERCIO ALIMENTICIO TESTE LTDA",
      nomeFantasia: "Alimentos Teste",
      cnpj: CNPJ_ALVO,
      plano: "PRO",
      segmentos: ["ALIMENTACAO"],
      ufs: ["SP"],
      brasilInteiro: false,
      ativo: true,
    } as any);
    updateInMemoryConfiguracaoEmpresa(
      {
        razaoSocial: "COMERCIO ALIMENTICIO TESTE LTDA",
        cnpj: CNPJ_ALVO,
        segmentos: ["ALIMENTACAO"],
        ufs: ["SP"],
        brasilInteiro: false,
      },
      TENANT_ID,
    );
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(async () => {
    global.fetch = originalFetch;
    if (originalGeminiKey !== undefined) {
      process.env.GEMINI_API_KEY = originalGeminiKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
    if (originalOpenAiKey !== undefined) {
      process.env.OPENAI_API_KEY = originalOpenAiKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
    for (const filePath of arquivosTemporarios.splice(0)) {
      await unlink(filePath).catch(() => undefined);
    }
    vi.restoreAllMocks();
  });

  describe("1. Inspeção de Arquivos Anexados (PDF, JPEG OCR, Divergência e Rascunho)", () => {
    it("valida PDF pesquisável com CNPJ titular compatível, tipo detectado e datas extraídas", async () => {
      const pdfBuf = await criarPdfTexto([
        "TRIBUNAL DE JUSTICA - CERTIDAO NEGATIVA DE FALENCIA E CONCORDATA",
        `Empresa Titular CNPJ: ${CNPJ_ALVO}`,
        "Data de emissao: 01/11/2026",
        "Valida ate: 31/12/2027",
      ]);

      const inspecao = await inspecionarArquivoDocumentoCofre({
        buffer: pdfBuf,
        nomeArquivo: "certidao_falencia.pdf",
        mimeType: "application/pdf",
        nomeInformado: "Certidão de Falência",
        dataVencimentoInformada: new Date("2027-12-31T12:00:00Z"),
        semValidade: false,
        tenantCnpj: CNPJ_ALVO,
      });

      expect(inspecao.validacaoStatus).toBe("VALIDADO");
      expect(inspecao.cnpjExtraido).toBe(CNPJ_ALVO);
      expect(inspecao.emissaoExtraida).toBe("2026-11-01");
      expect(inspecao.vencimentoExtraido).toBe("2027-12-31");
      expect(inspecao.tipoDetectado).toContain("Falência");
    });

    it("marca DIVERGENTE quando o CNPJ lido no PDF pertence a outra empresa", async () => {
      const pdfOutroCnpj = await criarPdfTexto([
        "CRF - REGULARIDADE DO FGTS - CAIXA ECONOMICA FEDERAL",
        "CNPJ: 11.222.333/0001-44",
        "Validade: 30/12/2027",
      ]);

      const inspecao = await inspecionarArquivoDocumentoCofre({
        buffer: pdfOutroCnpj,
        nomeArquivo: "crf_outro_cnpj.pdf",
        mimeType: "application/pdf",
        dataVencimentoInformada: new Date("2027-12-30T12:00:00Z"),
        semValidade: false,
        tenantCnpj: CNPJ_ALVO,
      });

      expect(inspecao.validacaoStatus).toBe("DIVERGENTE");
      expect(inspecao.validacaoResumo).toContain("diverge da empresa ativa");
      expect(inspecao.cnpjExtraido).toBe("11.222.333/0001-44");
    });

    it("marca DIVERGENTE quando a data de vencimento no PDF diverge da informada no cadastro", async () => {
      const pdfDataDiferente = await criarPdfTexto([
        "CERTIDAO DE REGULARIDADE DO FGTS - CRF",
        `CNPJ: ${CNPJ_ALVO}`,
        "Valida ate: 15/06/2027",
      ]);

      const inspecao = await inspecionarArquivoDocumentoCofre({
        buffer: pdfDataDiferente,
        nomeArquivo: "fgts.pdf",
        mimeType: "application/pdf",
        dataVencimentoInformada: new Date("2027-12-31T12:00:00Z"),
        semValidade: false,
        tenantCnpj: CNPJ_ALVO,
      });

      expect(inspecao.validacaoStatus).toBe("DIVERGENTE");
      expect(inspecao.validacaoResumo).toContain("diverge da data cadastrada");
    });

    it("inspeciona imagem JPEG via OCR multimodal (Gemini) e retorna VALIDADO ou ILEGIVEL sem chave", async () => {
      const jpegFake = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

      // Sem API key de OCR -> reporta ILEGIVEL com orientação clara
      const semOcr = await inspecionarArquivoDocumentoCofre({
        buffer: jpegFake,
        nomeArquivo: "fgts_foto.jpg",
        mimeType: "image/jpeg",
        tenantCnpj: CNPJ_ALVO,
      });
      expect(semOcr.validacaoStatus).toBe("ILEGIVEL");

      // Com GEMINI_API_KEY mockada -> extrai campos da imagem e valida
      process.env.GEMINI_API_KEY = "test_ocr_key";
      global.fetch = vi.fn().mockImplementation(async () => ({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      legivel: true,
                      tipoDocumento: "CRF / Regularidade do FGTS",
                      cnpjTitular: CNPJ_ALVO,
                      cnpjs: [CNPJ_ALVO],
                      dataEmissao: "2026-11-01",
                      dataVencimento: "2027-11-30",
                      resumo: "CRF vigente emitida pela Caixa",
                    }),
                  },
                ],
              },
            },
          ],
        }),
      })) as any;

      const comOcr = await inspecionarArquivoDocumentoCofre({
        buffer: jpegFake,
        nomeArquivo: "fgts_foto.jpg",
        mimeType: "image/jpeg",
        dataVencimentoInformada: new Date("2027-11-30T12:00:00Z"),
        tenantCnpj: CNPJ_ALVO,
      });
      expect(comOcr.validacaoStatus).toBe("VALIDADO");
      expect(comOcr.cnpjExtraido).toBe(CNPJ_ALVO);
      expect(comOcr.tipoDetectado).toBe("CRF / Regularidade do FGTS");
    });

    it("lê arquivo Word (.docx) extraindo texto, CNPJ titular e categoria", async () => {
      const zip = new JSZip();
      zip.file(
        "[Content_Types].xml",
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-officedocument.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      );
      zip.file(
        "_rels/.rels",
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      );
      zip.file(
        "word/document.xml",
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>ATESTADO DE CAPACIDADE TECNICA - Atestamos que a empresa CNPJ ${CNPJ_ALVO} forneceu generos alimenticios com excelencia.</w:t></w:r></w:p></w:body></w:document>`,
      );
      const docxBuf = await zip.generateAsync({ type: "nodebuffer" });

      const inspecao = await inspecionarArquivoDocumentoCofre({
        buffer: docxBuf,
        nomeArquivo: "atestado_capacidade.docx",
        nomeInformado: "Atestado de Capacidade Técnica",
        semValidade: true,
        tenantCnpj: CNPJ_ALVO,
      });

      expect(inspecao.validacaoStatus).toBe("VALIDADO");
      expect(inspecao.cnpjExtraido).toBe(CNPJ_ALVO);
      expect(inspecao.tipoDetectado).toContain("Atestado");
    });

    it("mantém rascunho sem anexo como PENDENTE_ANEXO e revalida arquivo físico ao enviar PDF", async () => {
      const rascunho = await criarDocumento(
        {
          nome: "Certidão de Falência e Concordata",
          categoria: "QUALIFICACAO_ECONOMICA",
          semValidade: true,
        },
        undefined,
        TENANT_ID,
      );

      expect(rascunho.possuiAnexo).toBe(false);
      expect(rascunho.validacaoStatus).toBe("PENDENTE_ANEXO");

      const revalSemArquivo = await revalidarAnexoDocumento(rascunho.id, TENANT_ID);
      expect(revalSemArquivo?.validacaoStatus).toBe("PENDENTE_ANEXO");

      // Grava um PDF real em disco temporário e vincula ao documento para testar revalidação automática
      const nomeTemp = `vitest_cofre_${Date.now()}.pdf`;
      const publicDocsDir = path.join(process.cwd(), "public", "uploads", "documentos");
      const fullPath = path.join(publicDocsDir, nomeTemp);
      await mkdir(publicDocsDir, { recursive: true });
      const pdfReal = await criarPdfTexto([
        "CERTIDAO NEGATIVA DE FALENCIA E CONCORDATA",
        `CNPJ: ${CNPJ_ALVO}`,
        "Data de emissao: 05/11/2026",
      ]);
      await writeFile(fullPath, pdfReal);
      arquivosTemporarios.push(fullPath);

      const docComPdf = await criarDocumento(
        {
          nome: "Certidão de Falência com PDF",
          categoria: "QUALIFICACAO_ECONOMICA",
          semValidade: true,
          arquivoUrl: `/uploads/documentos/${nomeTemp}`,
          arquivoNome: nomeTemp,
          mimeType: "application/pdf",
        },
        undefined,
        TENANT_ID,
      );

      const revalidado = await revalidarAnexoDocumento(docComPdf.id, TENANT_ID);
      expect(revalidado?.possuiAnexo).toBe(true);
      expect(revalidado?.validacaoStatus).toBe("VALIDADO");
      expect(revalidado?.cnpjExtraido).toBe(CNPJ_ALVO);
    });
  });

  describe("2. Raio-X IA diante de 3 rascunhos sem anexo (Falência, FGTS e Atestado)", () => {
    it("NÃO rotula rascunhos vigentes como vencidos, sinaliza PENDENTE_ANEXO e bloqueia alucinação da LLM", async () => {
      // Cadastra exatamente os 3 documentos sem anexo descritos pelo cliente (nenhum vencido!)
      await criarDocumento(
        {
          nome: "Certidão de Falência",
          categoria: "QUALIFICACAO_ECONOMICA",
          semValidade: true,
        },
        undefined,
        TENANT_ID,
      );
      await criarDocumento(
        {
          nome: "CRF FGTS",
          categoria: "FISCAL_TRABALHISTA",
          semValidade: false,
          dataVencimento: new Date("2027-12-31T12:00:00Z"),
        },
        undefined,
        TENANT_ID,
      );
      await criarDocumento(
        {
          nome: "Atestado de Capacidade Técnica",
          categoria: "QUALIFICACAO_TECNICA",
          semValidade: true,
        },
        undefined,
        TENANT_ID,
      );

      insertInMemoryPortal({
        id: "portal_bll_sp",
        tenantId: TENANT_ID,
        nome: "BLL Compras",
        status: "CADASTRADO",
        dataVencimento: new Date("2027-12-31T12:00:00Z"),
      });

      const lic = insertInMemoryLicitacao({
        idPncp: "46634092000196-1-000777/2026",
        numeroControlePNCP: "46634092000196-1-000777/2026",
        numeroEdital: "PE 777/2026",
        orgaoNome: "MUNICIPIO DE PIEDADE",
        orgaoCnpj: "46634092000196",
        uf: "SP",
        municipio: "Piedade",
        esfera: "M",
        poder: "E",
        modalidade: "Pregão Eletrônico",
        modalidadeCodigo: 6,
        portalDisputa: "BLL Compras",
        miniResumo: "Gêneros Alimentícios",
        resumo: "Aquisição de gêneros alimentícios diversos.",
        valorEstimado: 150000,
        dataAbertura: new Date("2026-12-20T12:00:00Z"),
        dataEncerramentoProposta: new Date("2026-12-20T12:00:00Z"),
        dataPublicacaoPncp: new Date("2026-11-01T10:00:00Z"),
        dataUltimaAtualizacao: new Date("2026-11-01T10:00:00Z"),
        status: "EM_ANALISE",
        parecerIA: "GO",
        justificativaIA: null,
        tipoSistemaCodigo: "PNCP",
        segmentoMacro: "ALIMENTACAO",
        subcategorias: [],
        atestadosExigidos: ["Atestado de fornecimento de gêneros alimentícios"],
        motivoRecusa: null,
        quantidadeLotes: 1,
        loteUnico: false,
        precoPorLote: false,
        isPresencial: false,
        distanciaGoianiaKm: null,
      } as any);

      insertInMemoryLicitacaoArquivo(lic.id, {
        id: "arq_ed_raiox",
        nome: "Edital_777.pdf",
        url: "https://docs.licitacao.internal/edital_777.pdf",
      });

      // Simula LLM tentando alucinar que o cliente está APTO ou que o FGTS está vencido
      process.env.GEMINI_API_KEY = "test_gemini_mock";
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (String(url).includes("generativelanguage.googleapis.com")) {
          return {
            ok: true,
            json: async () => ({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text: JSON.stringify({
                          resumoExecutivo: "Análise de participação gerada.",
                          habilitacao: {
                            status: "APTO",
                            scoreConformidade: 95,
                            resumo: "O documento CRF FGTS encontra-se vencido.",
                            certidoesVencidasOuPendentes: [
                              "CRF FGTS (Vencido há 5 dias)",
                              "Certidão Negativa de Débitos Trabalhistas (CNDT) específica do edital",
                            ],
                          },
                        }),
                      },
                    ],
                  },
                },
              ],
            }),
          };
        }
        return { ok: false, json: async () => [] };
      }) as any;

      const { relatorio, origemLLM } = await construirRelatorioParticipacaoHibrido(
        lic.id,
        {},
        TENANT_ID,
      );

      expect(origemLLM).toBe("LLM_GEMINI");
      // Guard determinístico impede APTO quando há documentos sem anexo no cofre
      expect(relatorio.parecer).toBe("APTO_COM_RESSALVAS");
      expect(relatorio.habilitacao.status).toBe("APTO_COM_RESSALVAS");

      // Nenhum dos 3 rascunhos pode estar como VENCIDO nem como REGULAR
      expect(relatorio.habilitacao.certidoesRegulares).toHaveLength(0);
      const statusChecklist = (relatorio.checklistDocumental ?? []).map((c) => ({
        doc: c.documento,
        status: c.status,
      }));
      expect(statusChecklist).toContainEqual({
        doc: "Certidão de Falência",
        status: "PENDENTE_ANEXO",
      });
      expect(statusChecklist).toContainEqual({
        doc: "CRF FGTS",
        status: "PENDENTE_ANEXO",
      });
      expect(statusChecklist).toContainEqual({
        doc: "Atestado de Capacidade Técnica",
        status: "PENDENTE_ANEXO",
      });
      expect(statusChecklist.some((c) => c.status === "VENCIDO")).toBe(false);

      // Guard bloqueou a mentira da LLM ("CRF FGTS (Vencido...)") e substituiu o resumo com 'vencido'
      const pendenciasJoined = relatorio.habilitacao.certidoesVencidasOuPendentes.join(" | ");
      expect(pendenciasJoined).toContain("Pendente de anexo em /documentacao");
      expect(pendenciasJoined).not.toContain("CRF FGTS (Vencido");
      expect(relatorio.habilitacao.resumo.toLowerCase()).not.toContain("encontra-se vencido");
      expect(relatorio.habilitacao.resumo).toContain("sem arquivo PDF/imagem anexado");
    });

    it("aprova como APTO quando todas as 4 categorias essenciais possuem anexo validado em dia", async () => {
      const categoriasDocs: Array<{ nome: string; categoria: any }> = [
        { nome: "Contrato Social Consolidado", categoria: "JURIDICA" },
        { nome: "CRF FGTS e CND Federal", categoria: "FISCAL_TRABALHISTA" },
        { nome: "Certidão de Falência", categoria: "QUALIFICACAO_ECONOMICA" },
        { nome: "Atestado de Capacidade Técnica Alimentos", categoria: "QUALIFICACAO_TECNICA" },
      ];

      for (const item of categoriasDocs) {
        await criarDocumento(
          {
            nome: item.nome,
            categoria: item.categoria,
            semValidade: false,
            dataVencimento: new Date("2027-12-31T12:00:00Z"),
            arquivoUrl: `/uploads/documentos/${item.categoria.toLowerCase()}.pdf`,
            arquivoNome: `${item.categoria.toLowerCase()}.pdf`,
            validacaoStatus: "VALIDADO",
            cnpjExtraido: CNPJ_ALVO,
          },
          undefined,
          TENANT_ID,
        );
      }

      insertInMemoryPortal({
        id: "portal_bll_ok",
        tenantId: TENANT_ID,
        nome: "BLL Compras",
        status: "CADASTRADO",
        dataVencimento: new Date("2027-12-31T12:00:00Z"),
      });

      const lic = insertInMemoryLicitacao({
        idPncp: "46634092000196-1-000888/2026",
        numeroControlePNCP: "46634092000196-1-000888/2026",
        numeroEdital: "PE 888/2026",
        orgaoNome: "MUNICIPIO DE PIEDADE",
        orgaoCnpj: "46634092000196",
        uf: "SP",
        municipio: "Piedade",
        esfera: "M",
        poder: "E",
        modalidade: "Pregão Eletrônico",
        modalidadeCodigo: 6,
        portalDisputa: "BLL Compras",
        miniResumo: "Gêneros Alimentícios",
        resumo: "Aquisição de gêneros alimentícios.",
        valorEstimado: 150000,
        dataAbertura: new Date("2026-12-20T12:00:00Z"),
        dataEncerramentoProposta: new Date("2026-12-20T12:00:00Z"),
        dataPublicacaoPncp: new Date("2026-11-01T10:00:00Z"),
        dataUltimaAtualizacao: new Date("2026-11-01T10:00:00Z"),
        status: "EM_ANALISE",
        parecerIA: "GO",
        justificativaIA: null,
        tipoSistemaCodigo: "PNCP",
        segmentoMacro: "ALIMENTACAO",
        subcategorias: [],
        atestadosExigidos: [],
        motivoRecusa: null,
        quantidadeLotes: 1,
        loteUnico: false,
        precoPorLote: false,
        isPresencial: false,
        distanciaGoianiaKm: null,
      } as any);

      const { relatorio } = await construirRelatorioParticipacaoHibrido(lic.id, {}, TENANT_ID);
      expect(relatorio.parecer).toBe("APTO");
      expect(relatorio.habilitacao.certidoesRegulares).toHaveLength(4);
      expect(relatorio.habilitacao.certidoesRegulares[0]).toContain("[Anexo validado ✓]");
      expect(relatorio.habilitacao.certidoesVencidasOuPendentes).toHaveLength(0);
    });
  });
});

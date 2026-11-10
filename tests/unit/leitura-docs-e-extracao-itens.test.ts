import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { PDFDocument, StandardFonts } from "pdf-lib";
import * as XLSX from "xlsx";
import {
  classificarPrioridadeDocumento,
  detectarTipoRealPorBuffer,
  lerDocumentosCertame,
} from "@/server/services/leitor-documentos-certame.service";
import {
  buscarItensPaginadosPncp,
  extrairItensCertameCompleto,
  extrairItensDePlanilhas,
  pareceCabecalhoDeLoteOuObjeto,
  parseNumeroBrasileiro,
} from "@/server/services/extracao-itens-certame.service";
import {
  isItemPlaceholderCertame,
  mesclarItensCertameNaCalculadora,
  normalizarChaveItem,
  normalizarMapaSelecaoCotacao,
  sincronizarRegrasDisputaComCalculadora,
} from "@/lib/sincronizacao-itens-certame";
import {
  consolidarCalculadoraProposta,
  type ItemCalculadoraInput,
} from "@/server/schemas/proposta-calculadora.schema";
import { gerarConteudoPropostaComercial } from "@/lib/proposta-comercial-template";
import { gerarConteudoPedidoCotacao } from "@/lib/pedido-cotacao-template";
import {
  insertInMemoryLicitacao,
  insertInMemoryLicitacaoArquivo,
  resetInMemoryLicitacoes,
} from "@/server/services/licitacoes-store";

async function criarPdfSimples(paginasTexto: string[]): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  for (const texto of paginasTexto) {
    const page = pdf.addPage([595, 842]);
    const linhas = texto.split("\n");
    let y = 790;
    for (const linha of linhas) {
      page.drawText(linha, { x: 40, y, size: 10, font });
      y -= 14;
    }
  }

  return Buffer.from(await pdf.save());
}

function criarPlanilhaXlsx(linhas: (string | number)[][], aba = "Itens"): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(linhas);
  XLSX.utils.book_append_sheet(wb, ws, aba);
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

describe("Leitura Multi-Documento do Certame e Extração Completa de Itens (Caso Piedade)", () => {
  const originalFetch = global.fetch;
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  const originalOpenAiKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    resetInMemoryLicitacoes();
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
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
    vi.restoreAllMocks();
  });

  describe("1. Parsers numéricos PT-BR e detecção de arquivo", () => {
    it("converte separadores de milhar brasileiros e valores monetários corretamente", () => {
      expect(parseNumeroBrasileiro("13.000")).toBe(13000);
      expect(parseNumeroBrasileiro("2.762")).toBe(2762);
      expect(parseNumeroBrasileiro("3.128")).toBe(3128);
      expect(parseNumeroBrasileiro("1.250.000")).toBe(1250000);
      expect(parseNumeroBrasileiro("R$ 1.250,50")).toBe(1250.5);
      expect(parseNumeroBrasileiro("0,75")).toBe(0.75);
      expect(parseNumeroBrasileiro(494)).toBe(494);
      expect(parseNumeroBrasileiro("")).toBeNull();
      expect(parseNumeroBrasileiro("N/A")).toBeNull();
    });

    it("detecta mime type real por magic bytes e prioriza TR/Planilhas sobre Edital", () => {
      expect(detectarTipoRealPorBuffer(Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]), "arq.bin")).toBe(
        "application/pdf",
      );
      expect(detectarTipoRealPorBuffer(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), "foto.bin")).toBe(
        "image/jpeg",
      );
      expect(detectarTipoRealPorBuffer(Buffer.from([0x89, 0x50, 0x4e, 0x47]), "img.bin")).toBe(
        "image/png",
      );
      expect(
        detectarTipoRealPorBuffer(
          Buffer.concat([
            Buffer.from("RIFF", "ascii"),
            Buffer.alloc(4),
            Buffer.from("WEBP", "ascii"),
          ]),
          "anexo.bin",
        ),
      ).toBe("image/webp");
      expect(detectarTipoRealPorBuffer(Buffer.from([0x50, 0x4b, 0x03, 0x04]), "lote.zip")).toBe(
        "application/zip",
      );

      expect(classificarPrioridadeDocumento("Termo_de_Referencia_Anexo_I.pdf")).toBe(100);
      expect(classificarPrioridadeDocumento("Planilha_Relacao_Itens.xlsx")).toBe(100);
      expect(classificarPrioridadeDocumento("Edital_PE_01_2026.pdf")).toBe(75);
      expect(classificarPrioridadeDocumento("Anexo_IV_Minuta.pdf")).toBe(60);
      expect(classificarPrioridadeDocumento("Aviso_Publicacao.pdf")).toBe(40);
    });

    it("detecta cabeçalho genérico de Lote/Objeto sem confundir itens reais", () => {
      const objetoPiedade =
        "AQUISIÇÃO DE GÊNEROS ALIMENTÍCIOS PARA O USO DOS DIVERSOS SETORES DA PREFEITURA";
      expect(
        pareceCabecalhoDeLoteOuObjeto(
          "AQUISIÇÃO DE GÊNEROS ALIMENTÍCIOS PARA O USO DOS DIVERSOS SETORES DA PREFEITURA - LOTE 01, PARA O PERÍODO DE 12 MESES",
          1,
          "UN",
          objetoPiedade,
        ),
      ).toBe(true);
      expect(
        pareceCabecalhoDeLoteOuObjeto(
          "Bolinho sabor baunilha - com recheio de sabores diversos, embalagem minima 80g",
          13000,
          "UNID",
          objetoPiedade,
        ),
      ).toBe(false);
    });
  });

  describe("2. Descompactação ZIP recursiva, PDF multipágina (pág. 32), XLSX e Imagem OCR", () => {
    it("lê ZIP contendo PDF de 35 páginas preservando o TR da página 32, planilha XLSX com col 0 vazia e imagem JPEG", async () => {
      const paginas: string[] = [];
      for (let i = 1; i <= 35; i++) {
        if (i === 1) {
          paginas.push(
            "PREFEITURA MUNICIPAL DE PIEDADE\nEDITAL DE PREGAO ELETRONICO\nCLAUSULAS GERAIS",
          );
        } else if (i === 32) {
          paginas.push(
            "V - DESCRITIVO E ESTIMATIVA DE CONSUMO\n" +
              "Item 1 | Bolinho sabor baunilha - embalagem minima de 80g | UNID | 13.000\n" +
              "Item 2 | BISCOITO DOCE SABOR LEITE - Pacote 400g | PCT | 2.762",
          );
        } else {
          paginas.push(
            [
              `CLAUSULA ADMINISTRATIVA ${i} - CONDICOES GERAIS DE FORNECIMENTO`,
              "As licitantes deverao observar integralmente os prazos estabelecidos neste edital.",
              "O fornecimento sera efetuado mediante solicitacao formal da secretaria requisitante.",
              "Os produtos entregues deverao atender as normas vigentes da ANVISA e INMETRO.",
            ].join("\n"),
          );
        }
      }

      const pdfBuffer = await criarPdfSimples(paginas);
      const xlsxBuffer = criarPlanilhaXlsx([
        ["", "DESCRIÇÃO", "UNIDADE", "Quant"],
        ["1", "Bolinho sabor baunilha - embalagem 80g", "UNID", "13.000"],
        ["2", "BISCOITO DOCE SABOR LEITE - Pacote 400g", "PCT", "2.762"],
        ["3", "BISCOITO TIPO CREAM CRAKER - Pacote 180g", "PCT", "3.128"],
        ["4", "Presunto; Sem Capa de Gordura (magro); Fatiado", "kg", "494"],
        ["5", "Queijo; Muçarela fatiada", "Kg", "494"],
      ]);
      const jpegFake = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

      const zip = new JSZip();
      zip.file("Edital_Completo_Piedade.pdf", pdfBuffer);
      zip.file("Planilha_Itens_TR.xlsx", xlsxBuffer);
      zip.file("Anexo_Tabela_Escaneada.jpg", jpegFake);
      const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

      const lic = insertInMemoryLicitacao({
        idPncp: "46634092000196-1-000120/2026",
        numeroControlePNCP: "46634092000196-1-000120/2026",
        numeroEdital: "PE 120/2026",
        orgaoNome: "MUNICIPIO DE PIEDADE",
        orgaoCnpj: "46634092000196",
        uf: "SP",
        municipio: "Piedade",
        esfera: "M",
        poder: "E",
        modalidade: "Pregão Eletrônico",
        modalidadeCodigo: 6,
        portalDisputa: "Compras.gov.br",
        miniResumo: "Gêneros Alimentícios",
        resumo: "AQUISIÇÃO DE GÊNEROS ALIMENTÍCIOS PARA O USO DOS DIVERSOS SETORES",
        valorEstimado: 250000,
        dataAbertura: new Date("2026-12-10T12:00:00Z"),
        dataEncerramentoProposta: new Date("2026-12-10T12:00:00Z"),
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

      insertInMemoryLicitacaoArquivo(lic.id, {
        id: "arq_zip_piedade",
        nome: "Pacote_Piedade.zip",
        r2Url: "https://pncp.gov.br/api/pncp/v1/arquivos/Pacote_Piedade.zip",
        mimeType: "application/zip",
      });

      global.fetch = vi.fn().mockImplementation(async () => ({
        ok: true,
        headers: new Headers({ "content-type": "application/zip" }),
        arrayBuffer: async () =>
          zipBuffer.buffer.slice(zipBuffer.byteOffset, zipBuffer.byteOffset + zipBuffer.byteLength),
      })) as any;

      const leitura = await lerDocumentosCertame(lic.id, {
        sincronizarPncpSeVazio: false,
        maxCharsConsolidado: 15000,
      });

      const nomesLidos = leitura.documentosLidos.map((d) => d.nome);
      expect(nomesLidos).toContain("Pacote_Piedade.zip/Planilha_Itens_TR.xlsx");
      expect(nomesLidos).toContain("Pacote_Piedade.zip/Edital_Completo_Piedade.pdf");
      expect(nomesLidos).toContain("Pacote_Piedade.zip/Anexo_Tabela_Escaneada.jpg");

      expect(leitura.planilhas.length).toBeGreaterThanOrEqual(1);
      const itensPlanilha = extrairItensDePlanilhas(leitura.planilhas);
      expect(itensPlanilha).toHaveLength(5);
      expect(itensPlanilha[0]).toMatchObject({
        numeroItem: 1,
        descricao: "Bolinho sabor baunilha - embalagem 80g",
        unidadeMedida: "UNID",
        quantidade: 13000,
      });
      expect(itensPlanilha[1].quantidade).toBe(2762);
      expect(itensPlanilha[2].quantidade).toBe(3128);
      expect(itensPlanilha[3].unidadeMedida).toBe("KG");

      expect(leitura.anexosBinariosMultimodais.length).toBe(1);
      expect(leitura.anexosBinariosMultimodais[0].mimeType).toBe("image/jpeg");

      const docPdfLido = leitura.documentosLidos.find((d) =>
        d.nome.endsWith("Edital_Completo_Piedade.pdf"),
      );
      expect(docPdfLido?.escaneadoOuImagem).toBe(false);
      expect(docPdfLido?.totalPaginas).toBe(35);

      // Mesmo com limite apertado de 15k chars, o algoritmo page-aware selecionou a página 32 do TR
      expect(leitura.textoConsolidado).toContain("Bolinho sabor baunilha");
    });

    it("detecta PDF escaneado sem texto selecionável (< 120 chars/pág.) e envia em anexo multimodal", async () => {
      const pdfEscaneado = await criarPdfSimples(["", ""]);

      const lic = insertInMemoryLicitacao({
        idPncp: "46634092000196-1-000121/2026",
        numeroControlePNCP: "46634092000196-1-000121/2026",
        numeroEdital: "PE 121/2026",
        orgaoNome: "MUNICIPIO DE PIEDADE",
        orgaoCnpj: "46634092000196",
        uf: "SP",
        municipio: "Piedade",
        esfera: "M",
        poder: "E",
        modalidade: "Pregão Eletrônico",
        modalidadeCodigo: 6,
        portalDisputa: "Compras.gov.br",
        miniResumo: "Gêneros Alimentícios",
        resumo: "Aquisição de alimentos.",
        valorEstimado: 100000,
        dataAbertura: new Date("2026-12-10T12:00:00Z"),
        dataEncerramentoProposta: new Date("2026-12-10T12:00:00Z"),
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

      insertInMemoryLicitacaoArquivo(lic.id, {
        id: "arq_pdf_escaneado",
        nome: "Anexo_TR_Escaneado.pdf",
        r2Url: "https://pncp.gov.br/arquivos/tr_escaneado.pdf",
        mimeType: "application/pdf",
      });

      global.fetch = vi.fn().mockImplementation(async () => ({
        ok: true,
        headers: new Headers({ "content-type": "application/pdf" }),
        arrayBuffer: async () =>
          pdfEscaneado.buffer.slice(
            pdfEscaneado.byteOffset,
            pdfEscaneado.byteOffset + pdfEscaneado.byteLength,
          ),
      })) as any;

      const leitura = await lerDocumentosCertame(lic.id, {
        sincronizarPncpSeVazio: false,
      });

      expect(leitura.documentosLidos[0]).toMatchObject({
        nome: "Anexo_TR_Escaneado.pdf",
        escaneadoOuImagem: true,
      });
      expect(leitura.anexosBinariosMultimodais).toHaveLength(1);
      expect(leitura.anexosBinariosMultimodais[0].mimeType).toBe("application/pdf");
    });
  });

  describe("3. Paginação PNCP completa e Cenário Real Piedade (substituição do Item 01)", () => {
    it("pagina todas as páginas de /itens do PNCP quando pagina=1 retorna 250 registros", async () => {
      const pagina1 = Array.from({ length: 250 }, (_, i) => ({
        numeroItem: i + 1,
        descricao: `Produto Oficial ${i + 1}`,
        quantidade: 10 + i,
        unidadeMedida: "UN",
      }));
      const pagina2 = [
        { numeroItem: 251, descricao: "Produto Oficial 251", quantidade: 50, unidadeMedida: "CX" },
        { numeroItem: 252, descricao: "Produto Oficial 252", quantidade: 25, unidadeMedida: "KG" },
      ];

      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        const u = String(url);
        if (u.includes("pagina=1")) {
          return { ok: true, json: async () => pagina1 };
        }
        if (u.includes("pagina=2")) {
          return { ok: true, json: async () => pagina2 };
        }
        return { ok: true, json: async () => [] };
      }) as any;

      const itens = await buscarItensPaginadosPncp({
        idPncp: "46634092000196-1-000120/2026",
        orgaoCnpj: "46634092000196",
      });

      expect(itens).toHaveLength(252);
      expect(itens[0].numeroItem).toBe(1);
      expect(itens[251]).toMatchObject({
        numeroItem: 252,
        descricao: "Produto Oficial 252",
        quantidade: 25,
        unidadeMedida: "KG",
      });
    });

    it("substitui o cabeçalho LOTE 01 retornado no Item 1 do PNCP pelos itens reais do Termo de Referência via IA multimodal", async () => {
      process.env.GEMINI_API_KEY = "test_gemini_key";

      const trPdf = await criarPdfSimples([
        "TERMO DE REFERENCIA - GENEROS ALIMENTICIOS\n" +
          "1 | Bolinho sabor baunilha 80g | UNID | 13.000\n" +
          "2 | BISCOITO DOCE SABOR LEITE 400g | PCT | 2.762\n" +
          "3 | BISCOITO TIPO CREAM CRAKER 180g | PCT | 3.128\n" +
          "4 | Presunto cozido fatiado | kg | 494\n" +
          "5 | Queijo Mucarela fatiada | Kg | 494",
      ]);

      const lic = insertInMemoryLicitacao({
        idPncp: "46634092000196-1-000999/2026",
        numeroControlePNCP: "46634092000196-1-000999/2026",
        numeroEdital: "PE 088/2026",
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
        resumo:
          "AQUISIÇÃO DE GÊNEROS ALIMENTÍCIOS PARA O USO DOS DIVERSOS SETORES DA PREFEITURA",
        valorEstimado: 195000,
        dataAbertura: new Date("2026-12-12T13:00:00Z"),
        dataEncerramentoProposta: new Date("2026-12-12T13:00:00Z"),
        dataPublicacaoPncp: new Date("2026-11-02T10:00:00Z"),
        dataUltimaAtualizacao: new Date("2026-11-02T10:00:00Z"),
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

      insertInMemoryLicitacaoArquivo(lic.id, {
        id: "arq_tr_piedade",
        nome: "Termo_de_Referencia_Piedade.pdf",
        r2Url: "https://pncp.gov.br/arquivos/tr_piedade.pdf",
        mimeType: "application/pdf",
      });

      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        const u = String(url);
        if (u.includes("/itens?pagina=1")) {
          // Simula o retorno defeituoso real do PNCP para Piedade
          return {
            ok: true,
            json: async () => [
              {
                numeroItem: 1,
                descricao:
                  "AQUISIÇÃO DE GÊNEROS ALIMENTÍCIOS PARA O USO DOS DIVERSOS SETORES DA PREFEITURA - LOTE 01, PARA O PERÍODO DE 12(DOZE) MESES",
                quantidade: 1,
                unidadeMedida: "UN",
              },
              {
                numeroItem: 2,
                descricao: "BISCOITO DOCE SABOR LEITE - Pacote com no minimo 400 gramas.",
                quantidade: 2762,
                unidadeMedida: "PACOTE",
              },
            ],
          };
        }
        if (u.includes("tr_piedade.pdf")) {
          return {
            ok: true,
            headers: new Headers({ "content-type": "application/pdf" }),
            arrayBuffer: async () =>
              trPdf.buffer.slice(trPdf.byteOffset, trPdf.byteOffset + trPdf.byteLength),
          };
        }
        if (u.includes("generativelanguage.googleapis.com")) {
          return {
            ok: true,
            json: async () => ({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text: JSON.stringify({
                          itens: [
                            {
                              numeroItem: 1,
                              lote: 1,
                              descricao:
                                "Bolinho sabor baunilha – com recheio de sabores diversos, embalagem mínima de 80 gramas.",
                              quantidade: "13.000",
                              unidadeMedida: "UNID",
                            },
                            {
                              numeroItem: 2,
                              lote: 1,
                              descricao: "BISCOITO DOCE SABOR LEITE – Pacote com no mínimo 400 gramas.",
                              quantidade: "2.762",
                              unidadeMedida: "PCT",
                            },
                            {
                              numeroItem: 3,
                              lote: 1,
                              descricao: "BISCOITO TIPO CREAM CRAKER – pacote de no mínimo 180grs.",
                              quantidade: "3.128",
                              unidadeMedida: "PCT",
                            },
                            {
                              numeroItem: 4,
                              lote: 1,
                              descricao: "Presunto; Sem Capa de Gordura (magro); Cozido, Fatiado",
                              quantidade: 494,
                              unidadeMedida: "KG",
                            },
                            {
                              numeroItem: 5,
                              lote: 1,
                              descricao: "Queijo; Muçarela, fatiada, Transportado e Conservado",
                              quantidade: 494,
                              unidadeMedida: "KG",
                            },
                          ],
                        }),
                      },
                    ],
                  },
                },
              ],
            }),
          };
        }
        return { ok: true, json: async () => [] };
      }) as any;

      const resultado = await extrairItensCertameCompleto(lic, {
        forcarVarreduraDocumentos: true,
      });

      expect(resultado.origem).toBe("EDITAL_ANEXOS");
      expect(resultado.totalItens).toBe(5);
      expect(resultado.documentosLidos.map((d) => d.nome)).toContain(
        "Termo_de_Referencia_Piedade.pdf",
      );
      expect(resultado.itens[0].descricao).toContain("Bolinho sabor baunilha");
      expect(resultado.itens[0].descricao).not.toContain("LOTE 01");
      expect(resultado.itens[0].quantidade).toBe(13000);
      expect(resultado.itens[0].unidadeMedida).toBe("UNID");
      expect(resultado.itens[1].quantidade).toBe(2762);
      expect(resultado.itens[2].quantidade).toBe(3128);
      expect(resultado.itens[3].unidadeMedida).toBe("KG");
      expect(resultado.itens[4].unidadeMedida).toBe("KG");
    });
  });

  describe("4. Sincronização End-to-End (Calculadora -> Proposta Timbrada -> Cotação -> Robô de Lances)", () => {
    it("substitui placeholder item_01 e cabeçalho Lote 01, zera custo heurístico falso e propaga aos módulos", () => {
      const objetoPiedade =
        "AQUISIÇÃO DE GÊNEROS ALIMENTÍCIOS PARA O USO DOS DIVERSOS SETORES DA PREFEITURA";

      const prevItens: ItemCalculadoraInput[] = [
        {
          id: "item_01",
          numeroItem: "01",
          descricao:
            "AQUISIÇÃO DE GÊNEROS ALIMENTÍCIOS PARA O USO DOS DIVERSOS SETORES DA PREFEITURA - LOTE 01",
          marcaModelo: null,
          unidade: "UN",
          quantidade: 1,
          valorEstimadoUnitario: 10000,
          custoUnitario: 6000,
          freteUnitario: 0,
          outrosCustosUnitario: 0,
          impostosPercentual: 12,
          bdiPercentual: 25,
          margemMinimaPercentual: 10,
          margemAlvoPercentual: 20,
          valorUnitarioArrematado: null,
        },
        {
          id: "item_real_2",
          numeroItem: "02",
          descricao: "BISCOITO DOCE SABOR LEITE",
          marcaModelo: "Bauducco",
          unidade: "PCT",
          quantidade: 2762,
          valorEstimadoUnitario: 7.5,
          custoUnitario: 4.2,
          freteUnitario: 0.3,
          outrosCustosUnitario: 0,
          impostosPercentual: 12,
          bdiPercentual: 25,
          margemMinimaPercentual: 10,
          margemAlvoPercentual: 20,
          valorUnitarioArrematado: null,
        },
      ];

      expect(isItemPlaceholderCertame(prevItens[0], objetoPiedade, 10000)).toBe(true);
      expect(isItemPlaceholderCertame(prevItens[1], objetoPiedade, 10000)).toBe(false);

      const mesclados = mesclarItensCertameNaCalculadora({
        prevItens,
        novosItensExtraidos: [
          {
            numeroItem: 1,
            lote: 1,
            descricao: "Bolinho sabor baunilha – embalagem mínima de 80 gramas",
            quantidade: 13000,
            unidadeMedida: "UNID",
            valorUnitarioEstimado: 2.8,
            valorTotalEstimado: 36400,
            marcaExigidaOuReferencia: "Ana Maria",
          },
          {
            numeroItem: 2,
            lote: 1,
            descricao: "BISCOITO DOCE SABOR LEITE – Pacote 400g",
            quantidade: 2762,
            unidadeMedida: "PCT",
            valorUnitarioEstimado: 7.5,
            valorTotalEstimado: 20715,
            marcaExigidaOuReferencia: null,
          },
        ],
        objetoCertame: objetoPiedade,
        valorEstimadoOpp: 10000,
        parametrosPadrao: {
          impostosPercentual: 12,
          bdiPercentual: 25,
          margemMinimaPercentual: 10,
          margemAlvoPercentual: 20,
        },
        timestampMs: 1794285000000,
      });

      // Item 01 foi substituído integralmente e teve o custo heurístico de 6000 zerado
      expect(mesclados[0]).toMatchObject({
        numeroItem: "01",
        descricao: "Bolinho sabor baunilha – embalagem mínima de 80 gramas",
        unidade: "UNID",
        quantidade: 13000,
        custoUnitario: 0,
        marcaModelo: "Ana Maria",
      });
      expect(mesclados[0].id).not.toBe("item_01");

      // Item 02 preservou o custo unitário e marca preenchidos pelo usuário
      expect(mesclados[1]).toMatchObject({
        id: "item_real_2",
        numeroItem: "02",
        descricao: "BISCOITO DOCE SABOR LEITE – Pacote 400g",
        unidade: "PCT",
        quantidade: 2762,
        custoUnitario: 4.2,
        freteUnitario: 0.3,
        marcaModelo: "Bauducco",
      });

      // Chaves normalizadas na Cotação ("1" -> "01")
      const mapaSelecao = normalizarMapaSelecaoCotacao({ "1": false }, mesclados);
      expect(mapaSelecao).toEqual({ "01": false, "02": true });

      // Propagação na Calculadora, Proposta Timbrada, Pedido de Cotação e Robô de Lances
      const consolidado = consolidarCalculadoraProposta(mesclados);
      expect(consolidado.totalItens).toBe(2);

      const proposta = gerarConteudoPropostaComercial({
        orgaoNome: "MUNICIPIO DE PIEDADE",
        numeroEdital: "PE 088/2026",
        objetoLicitacao: objetoPiedade,
        itens: mesclados,
      });
      expect(proposta.conteudoHtml).toContain("Bolinho sabor baunilha");
      expect(proposta.conteudoTexto).toContain("13000 UNID");
      expect(proposta.conteudoTexto).not.toContain("- Item 01: AQUISIÇÃO DE GÊNEROS");

      const cotacao = gerarConteudoPedidoCotacao({
        orgaoNome: "MUNICIPIO DE PIEDADE",
        numeroEdital: "PE 088/2026",
        itens: mesclados.map((it) => ({
          numeroItem: it.numeroItem,
          descricao: it.descricao,
          quantidade: it.quantidade,
          unidadeMedida: it.unidade,
          marcaSugerida: it.marcaModelo,
        })),
        configuracao: { ocultarOrgaoEdital: true },
      });
      expect(cotacao.conteudoHtml).toContain("Bolinho sabor baunilha");

      const regrasDisputa = sincronizarRegrasDisputaComCalculadora(consolidado.itens, [
        {
          itemId: "item_01",
          numeroItem: normalizarChaveItem("1"),
          descricao:
            "AQUISIÇÃO DE GÊNEROS ALIMENTÍCIOS PARA O USO DOS DIVERSOS SETORES DA PREFEITURA - LOTE 01",
          unidade: "UN",
          quantidade: 1,
          ativoNoRobo: false,
          pisoUnitarioSeguro: 8823,
          propostaUnitaria: 11000,
          tipoDecremento: "FIXO_REAIS",
          valorDecremento: 5,
          tatica: "SNIPER",
          statusItem: "PRONTO",
          melhorLanceSala: null,
          meuUltimoLance: null,
          minhaPosicao: null,
          observacoes: "",
        },
        {
          itemId: "item_real_2",
          numeroItem: "02",
          descricao: "BISCOITO DOCE SABOR LEITE",
          unidade: "PCT",
          quantidade: 2762,
          ativoNoRobo: true,
          pisoUnitarioSeguro: 7.21,
          propostaUnitaria: 8.27,
          tipoDecremento: "CENTAVOS_1",
          valorDecremento: 0.01,
          tatica: "SNIPER",
          statusItem: "PRONTO",
          melhorLanceSala: null,
          meuUltimoLance: null,
          minhaPosicao: null,
          observacoes: "",
        },
      ]);

      expect(regrasDisputa).toHaveLength(2);
      // Como regra 01 anterior era cabeçalho de Lote, foi substituída de forma limpa
      expect(regrasDisputa[0]).toMatchObject({
        numeroItem: "01",
        descricao: "Bolinho sabor baunilha – embalagem mínima de 80 gramas",
        unidade: "UNID",
        quantidade: 13000,
        ativoNoRobo: true,
        tatica: "IMEDIATO",
      });
      // Regra 02 real manteve a tática configurada pelo usuário
      expect(regrasDisputa[1]).toMatchObject({
        numeroItem: "02",
        tatica: "SNIPER",
        quantidade: 2762,
      });
    });
  });
});

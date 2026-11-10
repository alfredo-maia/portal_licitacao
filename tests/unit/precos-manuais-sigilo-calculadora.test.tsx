import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import JSZip from "jszip";
import {
  calcularItemProposta,
  consolidarCalculadoraProposta,
  validarPropostaManual,
  validarRegrasDisputa,
  type DisputaItemRegra,
  type ItemCalculadoraInput,
} from "@/server/schemas/proposta-calculadora.schema";
import { gerarConteudoPropostaComercial } from "@/lib/proposta-comercial-template";
import { gerarPdfPedidoCotacao } from "@/lib/pedido-cotacao-pdf";
import {
  sanearItensCalculadoraHidratados,
  sincronizarRegrasDisputaComCalculadora,
} from "@/lib/sincronizacao-itens-certame";
import {
  avaliarProximoLance,
  listarItensPisoMaiorQueProposta,
  type ContextoDisputa,
} from "@/lib/robo-lances-engine";
import { SalaSimuladaModal } from "@/components/robo-lances/sala-simulada-modal";
import {
  atualizarKanbanStatus,
  OportunidadesServiceError,
} from "@/server/services/oportunidades.service";
import {
  insertInMemoryLicitacao,
  insertInMemoryLicitacaoArquivo,
  resetInMemoryLicitacoes,
} from "@/server/services/licitacoes-store";
import {
  detectarTipoRealPorBuffer,
  extrairTextoPdf,
  lerDocumentosCertame,
} from "@/server/services/leitor-documentos-certame.service";
import { PATCH as patchSalasRobo } from "@/app/api/robo-de-lances/salas/route";
import OportunidadesDetalhePage from "@/app/oportunidades/[id]/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const itemCalculadoraZeroCusto: ItemCalculadoraInput = {
  id: "item_01",
  numeroItem: "01",
  descricao: "Notebook Corporativo i7 16GB SSD 512GB",
  marcaModelo: "Dell Latitude",
  unidade: "UN",
  quantidade: 4,
  valorEstimadoUnitario: 6000,
  custoUnitario: 0,
  freteUnitario: 0,
  outrosCustosUnitario: 0,
  impostosPercentual: 12,
  bdiPercentual: 25,
  margemMinimaPercentual: 10,
  margemAlvoPercentual: 20,
  valorUnitarioPropostaManual: 4250.5,
  valorUnitarioArrematado: null,
};

const regraDisputaBase: DisputaItemRegra = {
  itemId: "item_01",
  numeroItem: "01",
  descricao: "Notebook Corporativo i7",
  unidade: "UN",
  quantidade: 4,
  ativoNoRobo: true,
  pisoUnitarioSeguro: 3500,
  propostaUnitaria: 4250,
  tipoDecremento: "CENTAVOS_1",
  valorDecremento: 0.01,
  tatica: "IMEDIATO",
  statusItem: "PRONTO",
  melhorLanceSala: 4100,
  meuUltimoLance: 4250,
  minhaPosicao: 2,
  observacoes: "",
};

const contextoDisputaPadrao: ContextoDisputa = {
  pausaEmergencia: false,
  tempoRestanteSegundos: 30,
  segundosFinaisSniper: 10,
  tempoRespostaSegundos: 3,
  modoDisputa: "ABERTO",
  minhaEmpresaMeEpp: true,
};

describe("1. Preços Manuais na Proposta Comercial (Sem exigir custos na Calculadora)", () => {
  it("calcula proposta manual com custo zero na Calculadora e preserva propostaCalculadoraUnitaria", () => {
    const consolidado = consolidarCalculadoraProposta([itemCalculadoraZeroCusto], {
      modoEmissao: "ITENS_CALCULADORA",
      origemValoresProposta: "MANUAL",
      tipoTabelaProposta: "PROPOSTA_INICIAL",
    });

    expect(consolidado.itens).toHaveLength(1);
    expect(consolidado.itens[0].pisoUnitarioSeguro).toBe(0);
    expect(consolidado.itens[0].propostaCalculadoraUnitaria).toBe(0);
    expect(consolidado.itens[0].propostaUnitaria).toBe(4250.5);
    expect(consolidado.itens[0].propostaTotal).toBe(17002);
    expect(consolidado.propostaTotalGeral).toBe(17002);

    const doc = gerarConteudoPropostaComercial({
      orgaoNome: "Prefeitura de Teste",
      numeroEdital: "PE 100/2026",
      objetoLicitacao: "Aquisição de notebooks",
      itens: [itemCalculadoraZeroCusto],
      configuracao: {
        modoEmissao: "ITENS_CALCULADORA",
        origemValoresProposta: "MANUAL",
        tipoTabelaProposta: "PROPOSTA_INICIAL",
      },
    });
    expect(doc.valorTotalFormatado).toBe("R$ 17.002,00".replace(/\u00a0/g, doc.valorTotalFormatado.includes("\u00a0") ? "\u00a0" : " "));
    expect(doc.conteudoHtml).toContain("4.250,50");
    expect(doc.conteudoTexto).toContain("17.002,00");
  });

  it("valida proposta manual exigindo > 0 no modo MANUAL e liberando normalmente mesmo com custo = 0", () => {
    const ok = validarPropostaManual([itemCalculadoraZeroCusto], {
      modoEmissao: "ITENS_CALCULADORA",
      origemValoresProposta: "MANUAL",
      tipoTabelaProposta: "PROPOSTA_INICIAL",
    });
    expect(ok.valido).toBe(true);

    const zerado = validarPropostaManual(
      [{ ...itemCalculadoraZeroCusto, valorUnitarioPropostaManual: 0 }],
      {
        modoEmissao: "ITENS_CALCULADORA",
        origemValoresProposta: "MANUAL",
        tipoTabelaProposta: "PROPOSTA_INICIAL",
      },
    );
    expect(zerado.valido).toBe(false);
    expect(zerado.itensInvalidosIds).toEqual(["item_01"]);

    const globalVazio = validarPropostaManual(
      [{ ...itemCalculadoraZeroCusto, valorUnitarioPropostaManual: 0 }],
      {
        modoEmissao: "VALOR_GLOBAL",
        origemValoresProposta: "MANUAL",
        tipoTabelaProposta: "PROPOSTA_INICIAL",
        valorGlobalManual: null,
      },
    );
    expect(globalVazio.valido).toBe(false);
    expect(globalVazio.erro).toContain("Valor Global");
  });
});

describe("2. Disputa Manual Independente e Bloqueio Estrito (Valor Mínimo > Proposta Inicial)", () => {
  it("libera disputa manual sem custos na Calculadora quando Proposta >= Piso > 0", () => {
    const res = validarRegrasDisputa(
      [{ ...regraDisputaBase, pisoUnitarioSeguro: 150, propostaUnitaria: 200 }],
      "MANUAL",
    );
    expect(res.valido).toBe(true);
    expect(res.itensPisoMaiorIds).toHaveLength(0);
    expect(res.itensSemValorIds).toHaveLength(0);
  });

  it("bloqueia item ativo no modo MANUAL com piso ou proposta <= 0", () => {
    const res = validarRegrasDisputa(
      [{ ...regraDisputaBase, pisoUnitarioSeguro: 0, propostaUnitaria: 200 }],
      "MANUAL",
    );
    expect(res.valido).toBe(false);
    expect(res.itensSemValorIds).toEqual(["item_01"]);
  });

  it("bloqueia SEMPRE quando Piso Seguro for maior que Proposta Inicial", () => {
    const res = validarRegrasDisputa(
      [{ ...regraDisputaBase, pisoUnitarioSeguro: 500, propostaUnitaria: 400 }],
      "MANUAL",
    );
    expect(res.valido).toBe(false);
    expect(res.itensPisoMaiorIds).toEqual(["item_01"]);
    expect(res.erros[0]).toContain("não pode ser maior que a Proposta Inicial");
  });

  it("preserva pisos e propostas editados manualmente ao sincronizar com a Calculadora no modo MANUAL", () => {
    const calcItem = calcularItemProposta({
      ...itemCalculadoraZeroCusto,
      custoUnitario: 100,
    });
    const prevManual: DisputaItemRegra[] = [
      {
        ...regraDisputaBase,
        itemId: calcItem.id,
        pisoUnitarioSeguro: 999.99,
        propostaUnitaria: 1299.99,
      },
    ];

    const preservado = sincronizarRegrasDisputaComCalculadora([calcItem], prevManual, {
      origemPrecosDisputa: "MANUAL",
    });
    expect(preservado[0].pisoUnitarioSeguro).toBe(999.99);
    expect(preservado[0].propostaUnitaria).toBe(1299.99);

    const sobrescrito = sincronizarRegrasDisputaComCalculadora([calcItem], prevManual, {
      origemPrecosDisputa: "CALCULADORA",
    });
    expect(sobrescrito[0].pisoUnitarioSeguro).toBe(calcItem.pisoUnitarioSeguro);
    expect(sobrescrito[0].propostaUnitaria).toBe(calcItem.propostaUnitaria);
  });

  it("retorna PISO_INVALIDO_ACIMA_PROPOSTA no motor e bloqueia SalaSimuladaModal", () => {
    const regraInvalida: DisputaItemRegra = {
      ...regraDisputaBase,
      pisoUnitarioSeguro: 4500,
      propostaUnitaria: 4000,
    };

    expect(listarItensPisoMaiorQueProposta([regraInvalida])).toHaveLength(1);
    const decisao = avaliarProximoLance(regraInvalida, contextoDisputaPadrao);
    expect(decisao.deveDisparar).toBe(false);
    expect(decisao.tipo).toBe("PISO_INVALIDO_ACIMA_PROPOSTA");

    render(
      <SalaSimuladaModal
        open={true}
        onRequestClose={() => {}}
        planoTenant="PRO"
        licitacaoInicial={{
          id: "lic-piso-invalido",
          numeroEdital: "PE 300/2026",
          orgao: "Órgão Teste",
          portal: "Compras.gov.br",
          regrasItens: [regraInvalida],
        }}
      />,
    );

    expect(
      screen.getByText(/Configuração bloqueada: Item\(ns\) #01 com Valor Mínimo \(Piso\) maior que a Proposta Inicial/i),
    ).toBeInTheDocument();
    const btnIniciar = screen.getByRole("button", { name: /Iniciar Disputa/i });
    expect(btnIniciar).toBeDisabled();
  });

  it("bloqueia no backend (oportunidades.service e PATCH /api/robo-de-lances/salas) com HTTP 400 quando Piso > Proposta", async () => {
    resetInMemoryLicitacoes();
    const criada = insertInMemoryLicitacao({
      idPncp: "99999999000199-1-000100/2026",
      numeroControlePNCP: "99999999000199-1-000100/2026",
      numeroEdital: "PE 100/2026",
      orgaoNome: "Prefeitura de Teste",
      orgaoCnpj: "99.999.999/0001-99",
      uf: "GO",
      municipio: "Goiânia",
      esfera: "M",
      poder: "E",
      modalidade: "Pregão Eletrônico",
      modalidadeCodigo: 6,
      portalDisputa: "Compras.gov.br",
      valorEstimado: 50000,
      dataAbertura: new Date("2026-12-01T10:00:00.000Z"),
      dataEncerramentoProposta: new Date("2026-12-01T10:00:00.000Z"),
      dataPublicacaoPncp: new Date("2026-11-01T10:00:00.000Z"),
      dataUltimaAtualizacao: new Date("2026-11-01T10:00:00.000Z"),
      miniResumo: "Compra teste",
      resumo: "Compra de teste",
      justificativaIA: null,
      tipoSistemaCodigo: "TI",
      segmentoMacro: "TI_INFORMATICA",
      subcategorias: [],
      atestadosExigidos: [],
      motivoRecusa: null,
      parecerIA: "GO",
      status: "ACEITA",
      quantidadeLotes: 1,
      loteUnico: false,
      precoPorLote: false,
      isPresencial: false,
      distanciaGoianiaKm: null,
    } as any);

    await expect(
      atualizarKanbanStatus(
        criada.id,
        {
          status: "EM_DISPUTA",
          calculadoraDados: {
            disputaConfig: {
              portal: "Compras.gov.br",
              origemPrecos: "MANUAL",
              statusGeral: "CONFIGURADA",
              pausaEmergencia: false,
              tempoRespostaSegundos: 3,
              segundosFinaisSniper: 10,
              regrasItens: [
                {
                  ...regraDisputaBase,
                  pisoUnitarioSeguro: 600,
                  propostaUnitaria: 500,
                },
              ],
            },
          },
        },
        null,
        undefined,
        "tenant-default",
      ),
    ).rejects.toMatchObject({
      code: "VALOR_MINIMO_MAIOR_QUE_PROPOSTA",
      status: 400,
    });

    const patchRes = await patchSalasRobo(
      new Request("http://localhost:3000/api/robo-de-lances/salas?tenantId=tenant-default", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          licitacaoId: criada.id,
          disputaConfig: {
            origemPrecos: "MANUAL",
            regrasItens: [
              {
                ...regraDisputaBase,
                pisoUnitarioSeguro: 600,
                propostaUnitaria: 500,
              },
            ],
          },
        }),
      }),
    );
    expect(patchRes.status).toBe(400);
    const patchJson = await patchRes.json();
    expect(patchJson.ok).toBe(false);
    expect(patchJson.error).toContain("não pode ser maior que a Proposta Inicial");
  });
});

describe("3. Correção da 1ª Linha da Calculadora (Note Amarelo / Saneamento de Placeholder)", () => {
  it("não dispara alertaInexequivel ou motivoAlerta amarelo quando pisoUnitarioSeguro = 0 (custo zero)", () => {
    const res = calcularItemProposta({
      ...itemCalculadoraZeroCusto,
      custoUnitario: 0,
      freteUnitario: 0,
      outrosCustosUnitario: 0,
      valorEstimadoUnitario: 450000,
    });

    expect(res.pisoUnitarioSeguro).toBe(0);
    expect(res.alertaInexequivel).toBe(false);
    expect(res.motivoAlerta).toBeUndefined();
  });

  it("saneia item_01 legado contaminado com valorEstimado e 60% do valor global, mantendo itens válidos", () => {
    const contaminado: ItemCalculadoraInput[] = [
      {
        ...itemCalculadoraZeroCusto,
        id: "item_01",
        numeroItem: "01",
        descricao: "Objeto Principal do Edital",
        valorEstimadoUnitario: 450000,
        custoUnitario: 270000,
      },
    ];
    const saneado = sanearItensCalculadoraHidratados(contaminado, 450000);
    expect(saneado[0].valorEstimadoUnitario).toBeNull();
    expect(saneado[0].custoUnitario).toBe(0);

    const legitimo: ItemCalculadoraInput[] = [
      {
        ...itemCalculadoraZeroCusto,
        id: "item_01",
        numeroItem: "01",
        descricao: "Notebook i7 16GB",
        valorEstimadoUnitario: 5000,
        custoUnitario: 2800,
      },
      {
        ...itemCalculadoraZeroCusto,
        id: "item_02",
        numeroItem: "02",
        descricao: "Mouse USB",
        valorEstimadoUnitario: 100,
        custoUnitario: 40,
      },
    ];
    const preservado = sanearItensCalculadoraHidratados(legitimo, 450000);
    expect(preservado[0].valorEstimadoUnitario).toBe(5000);
    expect(preservado[0].custoUnitario).toBe(2800);
    expect(preservado[1].custoUnitario).toBe(40);
  });

  it("separa nota informativa azul (25%-50% desconto) de motivoAlerta amarelo (Art. 59 §4º)", () => {
    // Piso ~ 64.10 com estimado 100 => entre 50% e 75% => notaInformativa azul, sem motivoAlerta amarelo
    const res = calcularItemProposta({
      ...itemCalculadoraZeroCusto,
      valorEstimadoUnitario: 100,
      custoUnitario: 50,
      freteUnitario: 0,
      outrosCustosUnitario: 0,
      bdiPercentual: 0,
      impostosPercentual: 12,
      margemMinimaPercentual: 10,
      margemAlvoPercentual: 20,
    });

    expect(res.pisoUnitarioSeguro).toBeGreaterThan(50);
    expect(res.pisoUnitarioSeguro).toBeLessThan(75);
    expect(res.alertaInexequivel).toBe(false);
    expect(res.motivoAlerta).toBeUndefined();
    expect(res.notaInformativa).toContain("25%");
  });
});

describe("4. PDF do Pedido de Cotação — Sigilo Comercial Ligado e Desligado", () => {
  it("exibe Órgão, Edital, Condições de Pagamento e Observações quando ocultarOrgaoEdital = false, e oculta quando true", async () => {
    const semSigilo = await gerarPdfPedidoCotacao({
      orgaoNome: "Prefeitura Municipal de Piedade",
      numeroEdital: "PE 055/2026",
      itens: [
        {
          numeroItem: "01",
          descricao: "Biscoito Doce Sabor Leite 400g",
          quantidade: 2762,
          unidadeMedida: "PCT",
        },
      ],
      configuracao: {
        ocultarOrgaoEdital: false,
        fornecedorNome: "Atacado Alimentos LTDA",
        localEntregaCidade: "Piedade",
        localEntregaUf: "SP",
        modalidadeFrete: "CIF",
        condicoesPagamento: "28 DDL via empenho",
        observacoes: "Entrega em lotes semanais",
      },
    });

    expect(semSigilo.pdfNome).not.toContain("sigilo");
    const textoSemSigilo = await extrairTextoPdf(semSigilo.pdfBuffer);
    expect(textoSemSigilo.texto).toContain("Prefeitura Municipal de Piedade");
    expect(textoSemSigilo.texto).toContain("PE 055/2026");
    expect(textoSemSigilo.texto).toContain("28 DDL via empenho");
    expect(textoSemSigilo.texto).toContain("Entrega em lotes semanais");

    const comSigilo = await gerarPdfPedidoCotacao({
      orgaoNome: "Prefeitura Municipal de Piedade",
      numeroEdital: "PE 055/2026",
      itens: [
        {
          numeroItem: "01",
          descricao: "Biscoito Doce Sabor Leite 400g",
          quantidade: 2762,
          unidadeMedida: "PCT",
        },
      ],
      configuracao: {
        ocultarOrgaoEdital: true,
        localEntregaCidade: "Piedade",
        localEntregaUf: "SP",
        modalidadeFrete: "CIF",
      },
    });

    expect(comSigilo.pdfNome).toContain("sigilo");
    const textoComSigilo = await extrairTextoPdf(comSigilo.pdfBuffer);
    expect(textoComSigilo.texto).not.toContain("Prefeitura Municipal de Piedade");
    expect(textoComSigilo.texto).not.toContain("PE 055/2026");
    expect(textoComSigilo.texto).toContain("Piedade/SP");
  });
});

describe("5. Leitura de XML e JSON (Avulso e dentro de ZIP)", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("detecta mimeType de XML e JSON por conteúdo", () => {
    expect(
      detectarTipoRealPorBuffer(Buffer.from('<?xml version="1.0"?><itens><item>1</item></itens>'), "itens.bin"),
    ).toBe("application/xml");
    expect(
      detectarTipoRealPorBuffer(Buffer.from('{"itens":[{"numero":1,"descricao":"Arroz"}]}'), "itens.bin"),
    ).toBe("application/json");
  });

  it("lê anexos .xml, .json e .zip contendo XML/JSON em lerDocumentosCertame", async () => {
    resetInMemoryLicitacoes();
    const opp = insertInMemoryLicitacao({
      idPncp: "11111111000111-1-000010/2026",
      numeroControlePNCP: "11111111000111-1-000010/2026",
      numeroEdital: "PE 010/2026",
      orgaoNome: "Prefeitura Teste XML",
      orgaoCnpj: "11.111.111/0001-11",
      uf: "SP",
      municipio: "São Paulo",
      esfera: "M",
      poder: "E",
      modalidade: "Pregão Eletrônico",
      modalidadeCodigo: 6,
      portalDisputa: "Compras.gov.br",
      valorEstimado: 15000,
      dataAbertura: new Date("2026-12-01T10:00:00.000Z"),
      dataEncerramentoProposta: new Date("2026-12-01T10:00:00.000Z"),
      dataPublicacaoPncp: new Date("2026-11-01T10:00:00.000Z"),
      dataUltimaAtualizacao: new Date("2026-11-01T10:00:00.000Z"),
      miniResumo: "Gêneros Alimentícios",
      resumo: "Gêneros Alimentícios",
      justificativaIA: null,
      tipoSistemaCodigo: "ALIMENTACAO",
      segmentoMacro: "ALIMENTACAO",
      subcategorias: [],
      atestadosExigidos: [],
      motivoRecusa: null,
      parecerIA: "GO",
      status: "PENDENTE",
      quantidadeLotes: 1,
      loteUnico: false,
      precoPorLote: false,
      isPresencial: false,
      distanciaGoianiaKm: null,
    } as any);

    const xmlConteudo = '<?xml version="1.0"?><itens><item><descricao>Bolinho Baunilha 80g</descricao><qtd>13000</qtd></item></itens>';
    const jsonConteudo = JSON.stringify({
      itens: [{ numero: 2, descricao: "Biscoito Sabor Leite 400g", quantidade: 2762 }],
    });

    const zip = new JSZip();
    zip.file("anexo_itens.xml", xmlConteudo);
    zip.file("catalogo_itens.json", jsonConteudo);
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
    const xmlBuffer = Buffer.from(xmlConteudo, "utf-8");

    insertInMemoryLicitacaoArquivo(opp.id, {
      id: "arq-zip-xml-json",
      nome: "pacote_itens_xml_json.zip",
      mimeType: "application/zip",
      tamanho: zipBuffer.length,
      r2Url: "https://pncp.gov.br/api/pncp/v1/arquivos/pacote_itens_xml_json.zip",
    });

    insertInMemoryLicitacaoArquivo(opp.id, {
      id: "arq-xml-direto",
      nome: "planilha_relacao.xml",
      mimeType: "application/xml",
      tamanho: xmlBuffer.length,
      r2Url: "https://pncp.gov.br/api/pncp/v1/arquivos/planilha_relacao.xml",
    });

    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes(".zip")) {
        return {
          ok: true,
          headers: new Headers({ "content-type": "application/zip" }),
          arrayBuffer: async () =>
            zipBuffer.buffer.slice(zipBuffer.byteOffset, zipBuffer.byteOffset + zipBuffer.byteLength),
        };
      }
      return {
        ok: true,
        headers: new Headers({ "content-type": "application/xml" }),
        arrayBuffer: async () =>
          xmlBuffer.buffer.slice(xmlBuffer.byteOffset, xmlBuffer.byteOffset + xmlBuffer.byteLength),
      };
    }) as any;

    const res = await lerDocumentosCertame(opp.id, {
      sincronizarPncpSeVazio: false,
    });

    expect(res.textoConsolidado).toContain("Bolinho Baunilha 80g");
    expect(res.textoConsolidado).toContain("Biscoito Sabor Leite 400g");
    expect(res.documentosLidos.some((d) => d.nome.includes("anexo_itens.xml"))).toBe(true);
    expect(res.documentosLidos.some((d) => d.nome.includes("catalogo_itens.json"))).toBe(true);
    expect(res.documentosLidos.some((d) => d.nome.includes("planilha_relacao.xml"))).toBe(true);
  });
});

describe("6. Integração UI /oportunidades/[id] — Calculadora Sem Note Amarelo, Proposta Manual -> Disputa, Bloqueio Piso > Proposta e Salvar Cotação", () => {
  const originalFetch = global.fetch;
  let patchPayloads: Record<string, unknown>[] = [];

  beforeEach(() => {
    patchPayloads = [];
    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (init?.method === "PATCH" && url.includes("/api/oportunidades/opp_manual_ui/status")) {
        const parsed = JSON.parse(String(init.body || "{}"));
        patchPayloads.push(parsed);
        return new Response(JSON.stringify({ ok: true, oportunidade: { id: "opp_manual_ui", ...parsed } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/api/oportunidades/opp_manual_ui/notas")) {
        return new Response(JSON.stringify({ ok: true, notas: [] }), { status: 200 });
      }
      if (url.includes("/api/oportunidades/opp_manual_ui/analise-ia")) {
        return new Response(JSON.stringify({ ok: true, analises: [], cota: null }), { status: 200 });
      }
      if (url.includes("/api/usuarios")) {
        return new Response(JSON.stringify({ ok: true, usuarios: [] }), { status: 200 });
      }
      if (url.includes("/api/configuracoes/empresa")) {
        return new Response(
          JSON.stringify({
            ok: true,
            empresa: {
              razaoSocial: "Empresa Exemplo LTDA",
              cnpj: "12.345.678/0001-90",
              cidade: "Goiânia",
              uf: "GO",
            },
          }),
          { status: 200 },
        );
      }
      if (url.includes("/api/oportunidades/opp_manual_ui")) {
        return new Response(
          JSON.stringify({
            ok: true,
            oportunidade: {
              id: "opp_manual_ui",
              idPncp: "12345678000190-1-000010/2026",
              numeroEdital: "PE 010/2026",
              orgaoNome: "Prefeitura de Piedade",
              orgaoCnpj: "12.345.678/0001-90",
              municipio: "Piedade",
              uf: "SP",
              modalidade: "Pregão Eletrônico",
              valorEstimado: 100000,
              dataAbertura: "2026-12-10T09:00:00.000Z",
              miniResumo: "Gêneros Alimentícios",
              resumo: "Aquisição de Gêneros Alimentícios",
              status: "ACEITA",
              isPresencial: false,
              arquivos: [],
              repositoriosSimilares: [],
              analisesIA: [],
            },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("executa o fluxo completo nas abas Calculadora, Pedido de Cotação, Proposta Comercial e Disputa", async () => {
    render(<OportunidadesDetalhePage params={{ id: "opp_manual_ui" }} />);

    await screen.findByTestId("dossie-header");

    // 1. Aba Calculadora: 1ª linha sem note amarelo ao carregar com custo = 0
    fireEvent.click(screen.getByTestId("tab-calculadora"));
    expect(screen.queryByTestId("alerta-calc-item-0")).not.toBeInTheDocument();

    // 2. Aba Pedido de Cotação: alterna Sigilo e salva via botão dedicado
    fireEvent.click(screen.getByTestId("tab-pedido-cotacao"));
    const btnSalvarCotacao = await screen.findByTestId("btn-salvar-pedido-cotacao");
    fireEvent.change(screen.getByLabelText(/Condições de Pagamento Desejadas/i), {
      target: { value: "28 DDL faturado" },
    });
    const toggleSigilo = screen.getByRole("switch", { name: /Sigilo Comercial/i });
    fireEvent.click(toggleSigilo);
    expect(screen.getByTestId("sigilo-comercial-status-texto")).toHaveTextContent(/Sigilo DESATIVADO/i);
    fireEvent.click(btnSalvarCotacao);

    await waitFor(() => {
      expect(patchPayloads.length).toBe(1);
    });
    expect((patchPayloads[0].calculadoraDados as any).cotacaoConfig.ocultarOrgaoEdital).toBe(false);
    expect((patchPayloads[0].calculadoraDados as any).cotacaoConfig.condicoesPagamento).toBe(
      "28 DDL faturado",
    );

    // 3. Aba Proposta Comercial: alterna para Manual com custo zero na Calculadora, edita para R$ 185,50 e salva
    fireEvent.click(screen.getByTestId("tab-proposta-comercial"));
    const selectOrigemProposta = document.getElementById("select-origem-valores-proposta") as HTMLSelectElement;
    fireEvent.change(selectOrigemProposta, { target: { value: "MANUAL" } });

    await screen.findByTestId("lista-itens-proposta-manual");
    const inputPropManual = document.getElementById("item-proposta-manual-0") as HTMLInputElement;
    fireEvent.focus(inputPropManual);
    fireEvent.change(inputPropManual, { target: { value: "185,50" } });
    fireEvent.blur(inputPropManual);

    fireEvent.click(screen.getByTestId("btn-salvar-proposta-aba"));
    await waitFor(() => {
      expect(patchPayloads.length).toBe(2);
    });
    expect(patchPayloads[1].valorProposta).toBe(185.5);

    // 4. Aba Disputa: já recebeu R$ 185,50 na Proposta Inicial; alterna para Manual e testa bloqueio Piso > Proposta
    fireEvent.click(screen.getByTestId("tab-disputa"));
    const selectOrigemDisputa = document.getElementById("select-origem-precos-disputa") as HTMLSelectElement;
    fireEvent.change(selectOrigemDisputa, { target: { value: "MANUAL" } });

    const inputDisputaProp = document.getElementById("disputa-proposta-item_01") as HTMLInputElement;
    const inputDisputaPiso = document.getElementById("disputa-piso-item_01") as HTMLInputElement;
    expect(inputDisputaProp.value).toBe("185.5");

    // Usuário ajusta independentemente Proposta para 210 e Piso para 250 (> Proposta)
    fireEvent.focus(inputDisputaProp);
    fireEvent.change(inputDisputaProp, { target: { value: "210" } });
    fireEvent.blur(inputDisputaProp);

    fireEvent.focus(inputDisputaPiso);
    fireEvent.change(inputDisputaPiso, { target: { value: "250" } });
    fireEvent.blur(inputDisputaPiso);

    expect(screen.getByTestId("alerta-disputa-validacao")).toHaveTextContent(
      /não pode ser maior que a Proposta Inicial/i,
    );

    // Tentar salvar ou simular deve ser bloqueado sem enviar nova requisição PATCH
    fireEvent.click(screen.getByTestId("btn-salvar-disputa-topo"));
    expect(patchPayloads.length).toBe(2);

    fireEvent.click(screen.getByTestId("btn-simular-disputa-certame"));
    expect(screen.queryByText(/Sala de Disputa Simulada/i)).not.toBeInTheDocument();

    // Corrige Piso para 180 (< 210): erro some e salvamento funciona mesmo com custo = 0 na Calculadora
    fireEvent.focus(inputDisputaPiso);
    fireEvent.change(inputDisputaPiso, { target: { value: "180" } });
    fireEvent.blur(inputDisputaPiso);

    expect(screen.queryByTestId("alerta-disputa-validacao")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("btn-salvar-disputa-topo"));

    await waitFor(() => {
      expect(patchPayloads.length).toBe(3);
    });
    expect(patchPayloads[2].lanceMinimo).toBe(180);
    expect(patchPayloads[2].valorProposta).toBe(210);
  });
});

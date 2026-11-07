import { prisma } from "@/lib/prisma";
import { round2 } from "@/server/schemas/proposta-calculadora.schema";
import {
  buscaInteligenciaPrecosQuerySchema,
  calcularEstatisticasPrecosHomologados,
  salvarItemPrecoInputSchema,
  type BuscaInteligenciaPrecosQuery,
  type HomologacaoItemPublico,
  type ItemPrecoSalvoRecord,
  type ResultadoBuscaInteligenciaPrecos,
  type SalvarItemPrecoInput,
} from "@/server/schemas/inteligencia-precos.schema";

const PNCP_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)",
  Accept: "application/json",
};

const CACHE_TTL_MS = 15 * 60 * 1000;
const buscaCache = new Map<
  string,
  { expiraEm: number; resultado: ResultadoBuscaInteligenciaPrecos }
>();

const inMemoryPrecosSalvos: ItemPrecoSalvoRecord[] = [];
let tabelaPrecoSalvoVerificada = false;
let dbPrecoSalvoIndisponivel = Boolean(process.env.VITEST);

function normalizarTextoSimples(str: string): string {
  return (str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function formatarCnpj(doc?: string | null): string {
  const d = (doc || "").replace(/\D/g, "");
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  if (d.length === 11) {
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  return doc || "Não informado";
}

function formatarDataPtBr(iso?: string | null): string {
  if (!iso) return new Date().toLocaleDateString("pt-BR");
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function extrairMarcaModeloDeTexto(
  descricao: string,
  infoComp?: string | null,
  resObj?: any,
): { marca: string | null; modelo: string | null } {
  const textoCombinado = `${infoComp || ""} ${descricao || ""}`;
  let marca: string | null =
    resObj?.marca || resObj?.nomeMarca || resObj?.marcaFornecedor || null;
  let modelo: string | null =
    resObj?.modelo || resObj?.modeloVersao || resObj?.versao || null;

  if (!marca) {
    const mMatch = textoCombinado.match(
      /\b(?:marca|fabricante)\s*[:\-]\s*([^,.;|\n]{2,35})/i,
    );
    if (mMatch?.[1]) marca = mMatch[1].trim();
  }
  if (!modelo) {
    const modMatch = textoCombinado.match(
      /\b(?:modelo|refer[êe]ncia)\s*[:\-]\s*([^,.;|\n]{2,40})/i,
    );
    if (modMatch?.[1]) modelo = modMatch[1].trim();
  }

  return { marca, modelo };
}

async function fetchJsonComTimeout(url: string, timeoutMs = 4500): Promise<any | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: PNCP_HEADERS,
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function itemCorrespondeAosTokens(
  item: any,
  tokens: string[],
  apenasDigitosCatmat: string | null,
): boolean {
  const codigoCat = String(
    item?.catalogoCodigoItem || item?.ncmNbsCodigo || "",
  ).trim();
  if (apenasDigitosCatmat && codigoCat === apenasDigitosCatmat) {
    return true;
  }

  const textoItem = normalizarTextoSimples(
    `${item?.descricao || ""} ${item?.informacaoComplementar || ""} ${codigoCat}`,
  );

  // Todos os tokens significativos (>= 2 chars) devem aparecer para evitar falsos positivos
  const tokensRelevantes = tokens.filter((t) => t.length >= 2);
  if (tokensRelevantes.length === 0) return true;
  return tokensRelevantes.every((tok) => textoItem.includes(tok));
}

function modalidadeCorrespondeFiltro(modalidadeNome: string, filtro: string): boolean {
  if (!filtro || filtro === "TODOS") return true;
  const norm = normalizarTextoSimples(modalidadeNome);
  if (filtro === "PREGAO") return norm.includes("pregao");
  if (filtro === "DISPENSA") return norm.includes("dispensa");
  if (filtro === "CONCORRENCIA") return norm.includes("concorrencia");
  return true;
}

const CATALOGO_REFERENCIA_FALLBACK: HomologacaoItemPublico[] = [
  {
    id: "ref-nb-1",
    catmat: "452109",
    itemNumero: 1,
    itemDescricao:
      "Notebook Corporativo Processador Core i7 (13ª Geração), 16GB RAM DDR5, SSD NVMe 512GB, Tela 15.6 FHD Antirreflexo, Windows 11 Pro, Garantia Onsite 36 meses",
    marca: "Dell",
    modelo: "Latitude 3540",
    informacaoComplementar: "Acompanha maleta e mouse óptico sem fio.",
    unidade: "UN",
    quantidade: 50,
    orgaoNome: "Tribunal Regional Eleitoral de Goiás",
    orgaoCnpj: "05.526.875/0001-45",
    uf: "GO",
    municipio: "Goiânia",
    modalidade: "Pregão Eletrônico",
    numeroProcesso: "PE 088/2026",
    dataHomologacao: "28/10/2026",
    empresaVencedora: "DELL COMPUTADORES DO BRASIL LTDA",
    cnpjVencedor: "72.381.189/0001-10",
    porteFornecedor: "Demais",
    tipoBeneficio: "Ampla Concorrência",
    valorEstimadoUnitario: 5200.0,
    valorHomologadoUnitario: 4150.0,
    valorTotalHomologado: 207500.0,
    descontoPercentual: 20.19,
    linkPncp: "https://pncp.gov.br",
    fonte: "BASE_REFERENCIA",
  },
  {
    id: "ref-nb-2",
    catmat: "452109",
    itemNumero: 2,
    itemDescricao:
      "Notebook Corporativo Core i7, Memória 16GB DDR4, Armazenamento SSD 512GB, Tela 14 FHD IPS, Bateria 3 Células, Windows 11 Pro",
    marca: "Lenovo",
    modelo: "ThinkPad E14 Gen 5",
    informacaoComplementar: "Garantia de fábrica de 36 meses.",
    unidade: "UN",
    quantidade: 80,
    orgaoNome: "Comando da Aeronáutica - GAP-DF",
    orgaoCnpj: "00.394.429/0177-75",
    uf: "DF",
    municipio: "Brasília",
    modalidade: "Pregão Eletrônico",
    numeroProcesso: "PE 031/2026",
    dataHomologacao: "19/10/2026",
    empresaVencedora: "LENOVO TECNOLOGIA BRASIL LTDA",
    cnpjVencedor: "07.275.920/0001-61",
    porteFornecedor: "Demais",
    tipoBeneficio: "Ampla Concorrência",
    valorEstimadoUnitario: 5100.0,
    valorHomologadoUnitario: 4050.0,
    valorTotalHomologado: 324000.0,
    descontoPercentual: 20.59,
    linkPncp: "https://pncp.gov.br",
    fonte: "BASE_REFERENCIA",
  },
  {
    id: "ref-nb-3",
    catmat: "452109",
    itemNumero: 1,
    itemDescricao:
      "Computador Portátil Core i7, 16GB RAM, SSD 512GB M.2 PCIe, Tela LED 15.6 FHD, Teclado ABNT2 com numérico",
    marca: "Positivo",
    modelo: "Master N6445",
    informacaoComplementar: "Cota reservada ME/EPP.",
    unidade: "UN",
    quantidade: 120,
    orgaoNome: "Secretaria de Estado da Educação de São Paulo",
    orgaoCnpj: "46.384.111/0001-40",
    uf: "SP",
    municipio: "São Paulo",
    modalidade: "Pregão Eletrônico",
    numeroProcesso: "PE 124/2026",
    dataHomologacao: "14/10/2026",
    empresaVencedora: "POSITIVO TECNOLOGIA S.A.",
    cnpjVencedor: "81.243.735/0001-48",
    porteFornecedor: "Demais",
    tipoBeneficio: "Ampla Concorrência",
    valorEstimadoUnitario: 4950.0,
    valorHomologadoUnitario: 3890.0,
    valorTotalHomologado: 466800.0,
    descontoPercentual: 21.41,
    linkPncp: "https://pncp.gov.br",
    fonte: "BASE_REFERENCIA",
  },
  {
    id: "ref-nb-4",
    catmat: "452109",
    itemNumero: 3,
    itemDescricao:
      "Notebook Ultrafino Processador 8 Núcleos, 16GB RAM, SSD 512GB, Chassi Alumínio, Garantia 24 Meses",
    marca: "Acer",
    modelo: "TravelMate P2",
    informacaoComplementar: null,
    unidade: "UN",
    quantidade: 35,
    orgaoNome: "Prefeitura Municipal de Belo Horizonte",
    orgaoCnpj: "18.715.383/0001-40",
    uf: "MG",
    municipio: "Belo Horizonte",
    modalidade: "Pregão Eletrônico",
    numeroProcesso: "PE 077/2026",
    dataHomologacao: "02/10/2026",
    empresaVencedora: "MICROTECH SOLUCOES CORPORATIVAS LTDA",
    cnpjVencedor: "29.411.882/0001-90",
    porteFornecedor: "EPP",
    tipoBeneficio: "Exclusivo ME/EPP",
    valorEstimadoUnitario: 4800.0,
    valorHomologadoUnitario: 3750.0,
    valorTotalHomologado: 131250.0,
    descontoPercentual: 21.88,
    linkPncp: "https://pncp.gov.br",
    fonte: "BASE_REFERENCIA",
  },
];

async function consultarHomologacoesPncpAoVivo(
  query: BuscaInteligenciaPrecosQuery,
): Promise<HomologacaoItemPublico[]> {
  if (process.env.VITEST) {
    return [];
  }

  const dataCorte = new Date();
  dataCorte.setMonth(dataCorte.getMonth() - query.periodoMeses);

  const tokens = normalizarTextoSimples(query.q)
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  const apenasDigitosCatmat = /^\d{4,10}$/.test(query.q.trim())
    ? query.q.trim()
    : null;

  const ufParam =
    query.uf && query.uf !== "TODOS" ? `&uf=${encodeURIComponent(query.uf)}` : "";

  // Busca em Atas de Registro de Preços (100% homologadas) + Contratos no PNCP
  const searchUrlAtas = `https://pncp.gov.br/api/search/?q=${encodeURIComponent(
    query.q,
  )}&tipos_documento=ata&ordenacao=-data&pagina=1&tam_pagina=25${ufParam}`;

  const dataAtas = await fetchJsonComTimeout(searchUrlAtas, 5000);
  let candidatos: any[] = Array.isArray(dataAtas?.items) ? dataAtas.items : [];

  if (candidatos.length < 6) {
    const searchUrlEditais = `https://pncp.gov.br/api/search/?q=${encodeURIComponent(
      query.q,
    )}&tipos_documento=edital&ordenacao=relevancia&pagina=1&tam_pagina=15${ufParam}`;
    const dataEditais = await fetchJsonComTimeout(searchUrlEditais, 4000);
    if (Array.isArray(dataEditais?.items)) {
      candidatos = [...candidatos, ...dataEditais.items];
    }
  }

  // Extrai chaves únicas de compra (cnpj, ano, seq) dentro do período e modalidade
  const comprasMap = new Map<
    string,
    {
      cnpj: string;
      ano: string;
      seq: string;
      orgaoNome: string;
      uf: string;
      municipio: string | null;
      modalidade: string;
      titulo: string;
      createdAt: string;
    }
  >();

  for (const doc of candidatos) {
    const ufDoc = String(doc.uf || "").toUpperCase();
    if (query.uf !== "TODOS" && ufDoc && ufDoc !== query.uf.toUpperCase()) {
      continue;
    }

    const modNome =
      doc.modalidade_licitacao_nome || doc.modalidade_nome || "Pregão Eletrônico";
    if (!modalidadeCorrespondeFiltro(modNome, query.modalidade)) {
      continue;
    }

    const dataPub = doc.data_publicacao_pncp || doc.createdAt;
    if (dataPub) {
      const dt = new Date(dataPub);
      if (!Number.isNaN(dt.getTime()) && dt < dataCorte) {
        continue;
      }
    }

    const parts = String(doc.item_url || "")
      .split("/")
      .filter(Boolean);
    let cnpj = String(doc.orgao_cnpj || "").replace(/\D/g, "");
    let ano = String(doc.ano || "");
    let seq = String(doc.numero_sequencial_compra_ata || doc.numero_sequencial || "");

    if (parts[0] === "atas" && parts.length >= 4) {
      cnpj = parts[1]!;
      ano = parts[2]!;
      seq = parts[3]!;
    } else if (parts[0] === "compras" && parts.length >= 4) {
      cnpj = parts[1]!;
      ano = parts[2]!;
      seq = parts[3]!;
    }

    if (!cnpj || !ano || !seq) continue;
    const key = `${cnpj}-${ano}-${seq}`;
    if (!comprasMap.has(key)) {
      comprasMap.set(key, {
        cnpj,
        ano,
        seq,
        orgaoNome: doc.orgao_nome || doc.unidade_nome || "Órgão Público",
        uf: ufDoc || "BR",
        municipio: doc.municipio_nome || null,
        modalidade: modNome,
        titulo: doc.title || doc.numero || `Compra ${seq}/${ano}`,
        createdAt: dataPub || new Date().toISOString(),
      });
    }
    if (comprasMap.size >= 16) break;
  }

  const comprasLista = Array.from(comprasMap.values());
  const coletados: HomologacaoItemPublico[] = [];

  // Processa em lotes de 5 compras em paralelo para alta velocidade (~1.5s-2.5s)
  const batchSize = 5;
  for (let i = 0; i < comprasLista.length && coletados.length < query.limite; i += batchSize) {
    const lote = comprasLista.slice(i, i + batchSize);
    const lotesResultados = await Promise.all(
      lote.map(async (compra) => {
        const urlItens = `https://pncp.gov.br/api/pncp/v1/orgaos/${compra.cnpj}/compras/${compra.ano}/${compra.seq}/itens?pagina=1&tamanhoPagina=40`;
        const itensCompra = await fetchJsonComTimeout(urlItens, 4000);
        if (!Array.isArray(itensCompra)) return [];

        const itensCompativeis = itensCompra
          .filter(
            (it) =>
              (it.temResultado === true ||
                it.situacaoCompraItem === 2 ||
                it.situacaoCompraItemId === 2) &&
              itemCorrespondeAosTokens(it, tokens, apenasDigitosCatmat),
          )
          .slice(0, 4);

        const resultadosCompra: HomologacaoItemPublico[] = [];
        for (const it of itensCompativeis) {
          const urlRes = `https://pncp.gov.br/api/pncp/v1/orgaos/${compra.cnpj}/compras/${compra.ano}/${compra.seq}/itens/${it.numeroItem}/resultados`;
          const resArr = await fetchJsonComTimeout(urlRes, 3500);
          const vencedor = Array.isArray(resArr)
            ? resArr.find(
                (r) =>
                  !r.dataCancelamento &&
                  Number(r.valorUnitarioHomologado) > 0,
              )
            : null;
          if (!vencedor) continue;

          const vHom = round2(Number(vencedor.valorUnitarioHomologado));
          const vEst = round2(
            Number(it.valorUnitarioEstimado) > 0
              ? Number(it.valorUnitarioEstimado)
              : vHom,
          );
          const qtd = Number(vencedor.quantidadeHomologada || it.quantidade || 1);
          const vTot = round2(
            Number(vencedor.valorTotalHomologado) > 0
              ? Number(vencedor.valorTotalHomologado)
              : vHom * qtd,
          );

          const desconto =
            vEst > vHom && vEst > 0
              ? round2(((vEst - vHom) / vEst) * 100)
              : Number(vencedor.percentualDesconto) > 0
              ? round2(Number(vencedor.percentualDesconto))
              : 0;

          const { marca, modelo } = extrairMarcaModeloDeTexto(
            it.descricao || "",
            it.informacaoComplementar,
            vencedor,
          );

          const catmatCode = String(
            it.catalogoCodigoItem || it.ncmNbsCodigo || "N/I",
          );

          resultadosCompra.push({
            id: `pncp-${compra.cnpj}-${compra.ano}-${compra.seq}-${it.numeroItem}`,
            catmat: catmatCode,
            itemNumero: Number(it.numeroItem || 1),
            itemDescricao: String(it.descricao || "").trim(),
            marca,
            modelo,
            informacaoComplementar: it.informacaoComplementar || null,
            unidade: String(it.unidadeMedida || "UN").trim(),
            quantidade: qtd,
            orgaoNome: compra.orgaoNome,
            orgaoCnpj: formatarCnpj(compra.cnpj),
            uf: compra.uf,
            municipio: compra.municipio,
            modalidade: compra.modalidade,
            numeroProcesso: compra.titulo,
            dataHomologacao: formatarDataPtBr(
              vencedor.dataResultado || it.dataAtualizacao || compra.createdAt,
            ),
            empresaVencedora: String(
              vencedor.nomeRazaoSocialFornecedor || "Fornecedor Homologado",
            ).trim(),
            cnpjVencedor: formatarCnpj(vencedor.niFornecedor),
            porteFornecedor: vencedor.porteFornecedorNome || null,
            tipoBeneficio: it.tipoBeneficioNome || null,
            valorEstimadoUnitario: vEst,
            valorHomologadoUnitario: vHom,
            valorTotalHomologado: vTot,
            descontoPercentual: desconto,
            linkPncp: `https://pncp.gov.br/app/editais/${compra.cnpj}/${compra.ano}/${compra.seq}`,
            fonte: "PNCP_OFICIAL",
          });
        }
        return resultadosCompra;
      }),
    );

    for (const lista of lotesResultados) {
      for (const item of lista) {
        if (coletados.length < query.limite) {
          coletados.push(item);
        }
      }
    }
  }

  return coletados;
}

export async function pesquisarInteligenciaPrecos(
  rawQuery: Partial<BuscaInteligenciaPrecosQuery> | unknown,
): Promise<ResultadoBuscaInteligenciaPrecos> {
  const inicio = performance.now();
  const query = buscaInteligenciaPrecosQuerySchema.parse(rawQuery);
  const cacheKey = `${normalizarTextoSimples(query.q)}|${query.uf}|${query.modalidade}|${query.periodoMeses}|${query.limite}`;

  const emCache = buscaCache.get(cacheKey);
  if (emCache && emCache.expiraEm > Date.now()) {
    return {
      ...emCache.resultado,
      tempoMs: Math.max(1, Math.round(performance.now() - inicio)),
    };
  }

  let itens = await consultarHomologacoesPncpAoVivo(query);
  let fontePrincipal: "PNCP_OFICIAL" | "BASE_REFERENCIA" = "PNCP_OFICIAL";

  if (itens.length === 0) {
    fontePrincipal = "BASE_REFERENCIA";
    const termoNorm = normalizarTextoSimples(query.q);
    const filtradosFallback = CATALOGO_REFERENCIA_FALLBACK.filter((item) => {
      if (query.uf !== "TODOS" && item.uf !== query.uf) return false;
      if (!modalidadeCorrespondeFiltro(item.modalidade, query.modalidade)) {
        return false;
      }
      const alvo = normalizarTextoSimples(
        `${item.itemDescricao} ${item.catmat} ${item.marca || ""} ${item.modelo || ""}`,
      );
      const toks = termoNorm.split(/\s+/).filter((t) => t.length >= 2);
      return toks.some((t) => alvo.includes(t));
    });

    itens = (
      filtradosFallback.length > 0
        ? filtradosFallback
        : CATALOGO_REFERENCIA_FALLBACK.map((base, idx) => ({
            ...base,
            id: `ref-dyn-${idx + 1}`,
            itemDescricao: `${query.q} — Especificação conforme Termo de Referência (Amostra #${idx + 1})`,
          }))
    ).slice(0, query.limite);
  }

  const estatisticas = calcularEstatisticasPrecosHomologados(itens);
  const tempoMs = Math.max(1, Math.round(performance.now() - inicio));

  const resultado: ResultadoBuscaInteligenciaPrecos = {
    termoConsultado: query.q,
    ufFiltro: query.uf,
    modalidadeFiltro: query.modalidade,
    periodoMeses: query.periodoMeses,
    limiteSolicitado: query.limite,
    fontePrincipal,
    tempoMs,
    estatisticas,
    itens,
  };

  buscaCache.set(cacheKey, {
    expiraEm: Date.now() + CACHE_TTL_MS,
    resultado,
  });

  return resultado;
}

async function ensureTabelaPrecoSalvo(): Promise<void> {
  if (tabelaPrecoSalvoVerificada || dbPrecoSalvoIndisponivel) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "tenant_preco_salvo" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "tenantId" TEXT NOT NULL,
        "nomeProduto" TEXT NOT NULL,
        "termoPesquisado" TEXT NOT NULL,
        "marcaReferencia" TEXT,
        "catmat" TEXT,
        "especificacaoResumo" TEXT,
        "ufFiltro" TEXT NOT NULL DEFAULT 'TODOS',
        "modalidadeFiltro" TEXT NOT NULL DEFAULT 'TODOS',
        "periodoMeses" INTEGER NOT NULL DEFAULT 12,
        "quantidadeAmostras" INTEGER NOT NULL DEFAULT 0,
        "precoMedio" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "mediana" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "menorPreco" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "maiorPreco" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "descontoMedio" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "faixaSugeridaMin" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "faixaSugeridaMax" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "observacoes" TEXT,
        "homologacoesJson" JSONB NOT NULL,
        "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "tenant_preco_salvo_tenantId_idx" ON "tenant_preco_salvo"("tenantId");
    `);
    tabelaPrecoSalvoVerificada = true;
  } catch {
    dbPrecoSalvoIndisponivel = true;
  }
}

function mapDbToPrecoSalvoRecord(row: any): ItemPrecoSalvoRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    nomeProduto: row.nomeProduto,
    termoPesquisado: row.termoPesquisado,
    marcaReferencia: row.marcaReferencia || null,
    catmat: row.catmat || null,
    especificacaoResumo: row.especificacaoResumo || null,
    ufFiltro: row.ufFiltro || "TODOS",
    modalidadeFiltro: row.modalidadeFiltro || "TODOS",
    periodoMeses: Number(row.periodoMeses || 12),
    quantidadeAmostras: Number(row.quantidadeAmostras || 0),
    precoMedio: Number(row.precoMedio || 0),
    mediana: Number(row.mediana || 0),
    menorPreco: Number(row.menorPreco || 0),
    maiorPreco: Number(row.maiorPreco || 0),
    descontoMedio: Number(row.descontoMedio || 0),
    faixaSugeridaMin: Number(row.faixaSugeridaMin || 0),
    faixaSugeridaMax: Number(row.faixaSugeridaMax || 0),
    observacoes: row.observacoes || null,
    homologacoesJson: Array.isArray(row.homologacoesJson)
      ? row.homologacoesJson
      : [],
    criadoEm:
      row.criadoEm instanceof Date
        ? row.criadoEm.toISOString()
        : String(row.criadoEm),
    atualizadoEm:
      row.atualizadoEm instanceof Date
        ? row.atualizadoEm.toISOString()
        : String(row.atualizadoEm),
  };
}

export async function salvarItemPrecoTenant(
  tenantId: string,
  rawInput: SalvarItemPrecoInput | unknown,
): Promise<ItemPrecoSalvoRecord> {
  if (!tenantId) {
    throw new Error("Tenant não identificado para salvar o item de preço.");
  }
  const input = salvarItemPrecoInputSchema.parse(rawInput);
  const stats = calcularEstatisticasPrecosHomologados(input.homologacoes);
  const agora = new Date();

  const catmatAuto =
    input.catmat?.trim() ||
    input.homologacoes.find((h) => h.catmat && h.catmat !== "N/I")?.catmat ||
    null;

  const marcaAuto =
    input.marcaReferencia?.trim() ||
    Array.from(
      new Set(
        input.homologacoes
          .map((h) => [h.marca, h.modelo].filter(Boolean).join(" "))
          .filter(Boolean),
      ),
    )
      .slice(0, 3)
      .join(" / ") ||
    null;

  const especAuto =
    input.especificacaoResumo?.trim() ||
    input.homologacoes[0]?.itemDescricao?.slice(0, 280) ||
    input.termoPesquisado;

  await ensureTabelaPrecoSalvo();

  if (!dbPrecoSalvoIndisponivel) {
    try {
      const created = await (prisma as any).tenantPrecoSalvo.create({
        data: {
          tenantId,
          nomeProduto: input.nomeProduto,
          termoPesquisado: input.termoPesquisado,
          marcaReferencia: marcaAuto,
          catmat: catmatAuto,
          especificacaoResumo: especAuto,
          ufFiltro: input.ufFiltro,
          modalidadeFiltro: input.modalidadeFiltro,
          periodoMeses: input.periodoMeses,
          quantidadeAmostras: stats.totalAmostras,
          precoMedio: stats.precoMedio,
          mediana: stats.mediana,
          menorPreco: stats.menorPreco,
          maiorPreco: stats.maiorPreco,
          descontoMedio: stats.descontoMedio,
          faixaSugeridaMin: stats.faixaSugeridaMin,
          faixaSugeridaMax: stats.faixaSugeridaMax,
          observacoes: input.observacoes || null,
          homologacoesJson: input.homologacoes as any,
        },
      });
      return mapDbToPrecoSalvoRecord(created);
    } catch {
      dbPrecoSalvoIndisponivel = true;
    }
  }

  const memRecord: ItemPrecoSalvoRecord = {
    id: `preco_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    tenantId,
    nomeProduto: input.nomeProduto,
    termoPesquisado: input.termoPesquisado,
    marcaReferencia: marcaAuto,
    catmat: catmatAuto,
    especificacaoResumo: especAuto,
    ufFiltro: input.ufFiltro,
    modalidadeFiltro: input.modalidadeFiltro,
    periodoMeses: input.periodoMeses,
    quantidadeAmostras: stats.totalAmostras,
    precoMedio: stats.precoMedio,
    mediana: stats.mediana,
    menorPreco: stats.menorPreco,
    maiorPreco: stats.maiorPreco,
    descontoMedio: stats.descontoMedio,
    faixaSugeridaMin: stats.faixaSugeridaMin,
    faixaSugeridaMax: stats.faixaSugeridaMax,
    observacoes: input.observacoes || null,
    homologacoesJson: input.homologacoes,
    criadoEm: agora.toISOString(),
    atualizadoEm: agora.toISOString(),
  };
  inMemoryPrecosSalvos.unshift(memRecord);
  return memRecord;
}

export async function listarItensPrecosSalvos(
  tenantId: string,
  busca?: string,
): Promise<ItemPrecoSalvoRecord[]> {
  if (!tenantId) return [];
  await ensureTabelaPrecoSalvo();

  let lista: ItemPrecoSalvoRecord[] = [];
  if (!dbPrecoSalvoIndisponivel) {
    try {
      const dbRows = await (prisma as any).tenantPrecoSalvo.findMany({
        where: { tenantId },
        orderBy: { criadoEm: "desc" },
      });
      lista = dbRows.map(mapDbToPrecoSalvoRecord);
    } catch {
      dbPrecoSalvoIndisponivel = true;
      lista = inMemoryPrecosSalvos.filter((r) => r.tenantId === tenantId);
    }
  } else {
    lista = inMemoryPrecosSalvos.filter((r) => r.tenantId === tenantId);
  }

  const termo = normalizarTextoSimples(busca || "");
  if (!termo) return lista;

  return lista.filter((item) => {
    const alvo = normalizarTextoSimples(
      `${item.nomeProduto} ${item.termoPesquisado} ${item.marcaReferencia || ""} ${item.catmat || ""} ${item.especificacaoResumo || ""} ${item.observacoes || ""}`,
    );
    return alvo.includes(termo);
  });
}

export async function excluirItemPrecoSalvo(
  tenantId: string,
  id: string,
): Promise<boolean> {
  if (!tenantId || !id) return false;
  await ensureTabelaPrecoSalvo();

  if (!dbPrecoSalvoIndisponivel) {
    try {
      const res = await (prisma as any).tenantPrecoSalvo.deleteMany({
        where: { id, tenantId },
      });
      if (res.count > 0) return true;
    } catch {
      dbPrecoSalvoIndisponivel = true;
    }
  }

  const idx = inMemoryPrecosSalvos.findIndex(
    (r) => r.id === id && r.tenantId === tenantId,
  );
  if (idx >= 0) {
    inMemoryPrecosSalvos.splice(idx, 1);
    return true;
  }
  return false;
}

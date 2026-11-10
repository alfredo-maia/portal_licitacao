import type { ItemDisputaEdital } from "@/server/schemas/analise-ia.schema";
import {
  type RegrasDisputaDetectadas,
  regrasDisputaDetectadasSchema,
} from "@/server/schemas/proposta-calculadora.schema";
import {
  extrairRegrasDisputaDeTextoEdital,
  mesclarRegrasDisputaDetectadas,
  normalizarModoDisputaPncp,
} from "@/lib/regras-disputa-edital";
import {
  lerDocumentosCertame,
  type DocumentoLidoResumo,
  type PlanilhaExtraida,
} from "./leitor-documentos-certame.service";
import { chamarLlmJsonMultimodal } from "./llm-multimodal.service";

export type OrigemItensCertame = "PNCP" | "EDITAL_ANEXOS" | "IA" | "HISTORICO";

export interface ResultadoExtracaoItensCertame {
  itens: ItemDisputaEdital[];
  totalItens: number;
  origem: OrigemItensCertame;
  documentosLidos: DocumentoLidoResumo[];
  avisos: string[];
  regrasDisputaDetectadas?: RegrasDisputaDetectadas | null;
}

export function parseNumeroBrasileiro(valor: unknown): number | null {
  if (typeof valor === "number") {
    return Number.isFinite(valor) ? valor : null;
  }
  if (typeof valor !== "string") return null;
  const limpo = valor
    .replace(/R\$/gi, "")
    .replace(/\s+/g, "")
    .replace(/[^0-9.,-]/g, "");
  if (!limpo || limpo === "-" || limpo === "." || limpo === ",") return null;

  if (limpo.includes(",") && limpo.includes(".")) {
    const num = Number(limpo.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(num) ? num : null;
  }

  if (limpo.includes(",")) {
    const num = Number(limpo.replace(",", "."));
    return Number.isFinite(num) ? num : null;
  }

  // Apenas ponto: trata agrupamento de milhar PT-BR (ex: "13.000", "2.762", "1.250.000")
  if (/^-?\d{1,3}(\.\d{3})+$/.test(limpo)) {
    const num = Number(limpo.replace(/\./g, ""));
    return Number.isFinite(num) ? num : null;
  }

  const num = Number(limpo);
  return Number.isFinite(num) ? num : null;
}

function normalizarTextoSimples(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function pareceCabecalhoDeLoteOuObjeto(
  descricao: string,
  quantidade: number,
  unidadeMedida: string,
  objetoCertame?: string | null,
): boolean {
  const normDesc = normalizarTextoSimples(descricao);
  if (!normDesc) return true;

  const unit = (unidadeMedida || "").trim().toUpperCase();
  const unitGenerica = ["", "UN", "UNID", "LOTE", "UN/LOTE", "GLOBAL", "SV"].includes(unit);

  const contemFraseCabecalho =
    /\b(?:lote\s*\d+|lote\s*unico|registro\s+de\s+precos|termo\s+de\s+referencia|conforme\s+(?:o\s+)?(?:anexo|edital|especificacoes)|para\s+o\s+periodo\s+de)\b/.test(
      normDesc,
    ) && /^(?:aquisicao|contratacao|fornecimento|registro)\s+de\b/.test(normDesc);

  if (contemFraseCabecalho && quantidade <= 1 && unitGenerica) {
    return true;
  }

  if (objetoCertame) {
    const normObj = normalizarTextoSimples(objetoCertame);
    if (normObj.length >= 15 && quantidade <= 1 && unitGenerica) {
      if (normDesc === normObj || normDesc.includes(normObj) || normObj.includes(normDesc)) {
        return true;
      }
      const tokensObj = new Set(normObj.split(" ").filter((t) => t.length > 3));
      const tokensDesc = normDesc.split(" ").filter((t) => t.length > 3);
      if (tokensObj.size >= 4 && tokensDesc.length >= 4) {
        const emComum = tokensDesc.filter((t) => tokensObj.has(t)).length;
        if (emComum / Math.min(tokensObj.size, tokensDesc.length) >= 0.72) {
          return true;
        }
      }
    }
  }

  return false;
}

function normalizarUnidade(raw?: unknown): string {
  const u = String(raw || "UN")
    .trim()
    .toUpperCase()
    .replace(/\.+$/, "");
  if (!u) return "UN";
  return u;
}

function normalizarItemExtraido(
  raw: any,
  idx: number,
): ItemDisputaEdital | null {
  const descricao = String(raw?.descricao || raw?.especificacao || "").trim();
  if (!descricao || descricao.length < 2) return null;

  const numeroParsed =
    typeof raw?.numeroItem === "number"
      ? raw.numeroItem
      : parseNumeroBrasileiro(String(raw?.numeroItem ?? ""));
  const numeroItem =
    numeroParsed && numeroParsed > 0 ? Math.round(numeroParsed) : idx + 1;

  const loteParsed =
    raw?.lote != null
      ? typeof raw.lote === "number"
        ? raw.lote
        : parseNumeroBrasileiro(String(raw.lote))
      : 1;
  const lote = loteParsed && loteParsed > 0 ? Math.round(loteParsed) : 1;

  const qtdParsed = parseNumeroBrasileiro(raw?.quantidade);
  const quantidade = qtdParsed && qtdParsed > 0 ? qtdParsed : 1;

  const vUnitParsed = parseNumeroBrasileiro(
    raw?.valorUnitarioEstimado ?? raw?.valorUnitario,
  );
  const vTotalParsed = parseNumeroBrasileiro(
    raw?.valorTotalEstimado ?? raw?.valorTotal,
  );

  const valorUnitarioEstimado =
    vUnitParsed != null && vUnitParsed >= 0
      ? vUnitParsed
      : vTotalParsed != null && quantidade > 0
        ? Math.round((vTotalParsed / quantidade) * 10000) / 10000
        : null;

  const valorTotalEstimado =
    vTotalParsed != null && vTotalParsed >= 0
      ? vTotalParsed
      : valorUnitarioEstimado != null
        ? Math.round(valorUnitarioEstimado * quantidade * 100) / 100
        : null;

  const especificacaoDetalhada =
    String(
      raw?.especificacaoDetalhada || raw?.descricaoDetalhada || raw?.especificacao || descricao,
    ).trim() || undefined;

  return {
    numeroItem,
    lote,
    descricao,
    especificacaoDetalhada,
    quantidade,
    unidadeMedida: normalizarUnidade(raw?.unidadeMedida ?? raw?.unidade),
    valorUnitarioEstimado,
    valorTotalEstimado,
    marcaExigidaOuReferencia: raw?.marcaExigidaOuReferencia
      ? String(raw.marcaExigidaOuReferencia).trim()
      : raw?.marca
        ? String(raw.marca).trim()
        : null,
    exigeAmostra: Boolean(raw?.exigeAmostra) || /apresentar\s+amostra/i.test(descricao),
  };
}

export function extrairItensDePlanilhas(
  planilhas: PlanilhaExtraida[],
): ItemDisputaEdital[] {
  const extraidos: ItemDisputaEdital[] = [];

  for (const planilha of planilhas) {
    const { linhas } = planilha;
    if (linhas.length < 2) continue;

    let idxHeader = -1;
    let colItem = -1;
    let colLote = -1;
    let colDesc = -1;
    let colUnid = -1;
    let colQtd = -1;
    let colVUnit = -1;
    let colVTotal = -1;
    let colMarca = -1;

    for (let r = 0; r < Math.min(25, linhas.length); r++) {
      const cols = linhas[r].map(normalizarTextoSimples);
      const candDesc = cols.findIndex((c) =>
        /descric|especificac|produto|material|servico|objeto|denominac/.test(c),
      );
      const candQtd = cols.findIndex((c) => /\bqtd\b|quant/.test(c));
      if (candDesc >= 0 && (candQtd >= 0 || cols.some((c) => /\bunid|\bund\b/.test(c)))) {
        idxHeader = r;
        colDesc = candDesc;
        colQtd = candQtd;
        colItem = cols.findIndex(
          (c, i) => i !== candDesc && /^(item|n|no|num|numero|ordem|seq)/.test(c),
        );
        colLote = cols.findIndex((c) => /\blote\b|\bgrupo\b/.test(c));
        colUnid = cols.findIndex((c) => /\bunid|\bund\b|\bunidade/.test(c));
        colVUnit = cols.findIndex((c) =>
          /(valor|vlr|preco).*(unit|est|ref)|^unitario$/.test(c),
        );
        colVTotal = cols.findIndex(
          (c, i) => i !== colVUnit && /(valor|vlr|preco).*total|^total$/.test(c),
        );
        colMarca = cols.findIndex((c) => /marca|modelo|referencia/.test(c));
        break;
      }
    }

    if (idxHeader < 0 || colDesc < 0) continue;

    const primeiraColunaHeaderVazia =
      colItem < 0 &&
      colDesc > 0 &&
      normalizarTextoSimples(linhas[idxHeader][0] || "") === "";

    let seqFallback = extraidos.length + 1;
    for (let r = idxHeader + 1; r < linhas.length; r++) {
      const row = linhas[r];
      const desc = String(row[colDesc] ?? "").trim();
      if (!desc) continue;
      if (/^(total\s+geral|subtotal|valor\s+total|assinatura|observa)/i.test(desc)) {
        continue;
      }

      const rawItem =
        colItem >= 0
          ? row[colItem]
          : primeiraColunaHeaderVazia && /^\d{1,4}$/.test(String(row[0] ?? "").trim())
            ? String(row[0]).trim()
            : "";
      const numItem = parseNumeroBrasileiro(rawItem) || seqFallback;
      const lote = colLote >= 0 ? parseNumeroBrasileiro(row[colLote]) || 1 : 1;
      const qtd = colQtd >= 0 ? parseNumeroBrasileiro(row[colQtd]) : 1;
      const unid = colUnid >= 0 ? row[colUnid] : "UN";
      const vUnit = colVUnit >= 0 ? parseNumeroBrasileiro(row[colVUnit]) : null;
      const vTotal = colVTotal >= 0 ? parseNumeroBrasileiro(row[colVTotal]) : null;
      const marca = colMarca >= 0 ? row[colMarca] : null;

      // Ignora linha se não tem número de item e não tem quantidade numérica válida
      if (!parseNumeroBrasileiro(rawItem) && (qtd == null || qtd <= 0)) {
        continue;
      }

      const norm = normalizarItemExtraido(
        {
          numeroItem: numItem,
          lote,
          descricao: desc,
          quantidade: qtd ?? 1,
          unidadeMedida: unid || "UN",
          valorUnitarioEstimado: vUnit,
          valorTotalEstimado: vTotal,
          marcaExigidaOuReferencia: marca || null,
        },
        seqFallback - 1,
      );
      if (norm) {
        extraidos.push(norm);
        seqFallback++;
      }
    }
  }

  return extraidos;
}

interface PncpCompraMetadados {
  modoDisputaId: number | null;
  modoDisputaNome: string | null;
  criterioJulgamentoNome: string | null;
  linkSistemaOrigem: string | null;
  linkProcessoEletronico: string | null;
  usuarioNome: string | null;
  codigoUnidade: string | number | null;
}

function extrairComponentesIdPncp(params: {
  idPncp?: string | null;
  orgaoCnpj?: string | null;
}): { cnpj: string; ano: number; sequencial: string } | null {
  const idPncp = params.idPncp || "";
  if (!idPncp) return null;

  const partes = idPncp.split("-");
  const cnpj = partes[0]
    ? partes[0].replace(/\D/g, "")
    : (params.orgaoCnpj || "").replace(/\D/g, "");
  let ano = new Date().getFullYear();
  let sequencial = "1";

  if (partes[2]) {
    const sub = partes[2].split("/");
    const parsedSeq = parseInt(sub[0], 10);
    sequencial = isNaN(parsedSeq) ? "1" : parsedSeq.toString();
    ano = parseInt(sub[1], 10) || ano;
  }

  if (!cnpj || !sequencial) return null;
  return { cnpj, ano, sequencial };
}

export async function buscarMetadadosCompraPncp(params: {
  idPncp?: string | null;
  orgaoCnpj?: string | null;
}): Promise<PncpCompraMetadados | null> {
  const coords = extrairComponentesIdPncp(params);
  if (!coords) return null;

  const isTest = process.env.VITEST === "true" || process.env.NODE_ENV === "test";
  const timeoutMs = isTest ? 1000 : 8000;

  try {
    const url = `https://pncp.gov.br/api/consulta/v1/orgaos/${coords.cnpj}/compras/${coords.ano}/${coords.sequencial}`;
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res?.ok) return null;

    const data: unknown = await res.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return null;
    }

    const rec = data as Record<string, unknown>;
    const unidadeRaw =
      rec.unidadeOrgao && typeof rec.unidadeOrgao === "object"
        ? (rec.unidadeOrgao as Record<string, unknown>)
        : null;

    const modoId =
      typeof rec.modoDisputaId === "number"
        ? rec.modoDisputaId
        : rec.modoDisputaId != null && !Number.isNaN(Number(rec.modoDisputaId))
          ? Number(rec.modoDisputaId)
          : null;

    return {
      modoDisputaId: modoId,
      modoDisputaNome:
        typeof rec.modoDisputaNome === "string" ? rec.modoDisputaNome : null,
      criterioJulgamentoNome:
        typeof rec.criterioJulgamentoNome === "string"
          ? rec.criterioJulgamentoNome
          : null,
      linkSistemaOrigem:
        typeof rec.linkSistemaOrigem === "string" ? rec.linkSistemaOrigem : null,
      linkProcessoEletronico:
        typeof rec.linkProcessoEletronico === "string"
          ? rec.linkProcessoEletronico
          : null,
      usuarioNome:
        typeof rec.usuarioNome === "string" ? rec.usuarioNome : null,
      codigoUnidade:
        typeof unidadeRaw?.codigoUnidade === "string" ||
        typeof unidadeRaw?.codigoUnidade === "number"
          ? unidadeRaw.codigoUnidade
          : null,
    };
  } catch {
    return null;
  }
}

export async function buscarItensPaginadosPncp(params: {
  idPncp?: string | null;
  orgaoCnpj?: string | null;
}): Promise<ItemDisputaEdital[]> {
  const coords = extrairComponentesIdPncp(params);
  if (!coords) return [];
  const { cnpj, ano, sequencial } = coords;

  const isTest = process.env.VITEST === "true" || process.env.NODE_ENV === "test";
  const timeoutMs = isTest ? 1500 : 12000;
  const tamanhoPagina = 250;
  const maxPaginas = 12;
  const todos: ItemDisputaEdital[] = [];

  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    try {
      const pncpUrl = `https://pncp.gov.br/api/pncp/v1/orgaos/${cnpj}/compras/${ano}/${sequencial}/itens?pagina=${pagina}&tamanhoPagina=${tamanhoPagina}`;
      const res = await fetch(pncpUrl, {
        headers: { accept: "*/*" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res?.ok) break;

      const data = await res.json();
      const list: any[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data?.itens)
            ? data.itens
            : [];

      if (list.length === 0) break;

      for (let i = 0; i < list.length; i++) {
        const it = list[i];
        const norm = normalizarItemExtraido(
          {
            numeroItem: it.numeroItem ?? todos.length + 1,
            lote: it.numeroLote || it.lote || 1,
            descricao: it.descricao || `Item ${it.numeroItem || todos.length + 1}`,
            especificacaoDetalhada: it.descricaoDetalhada || it.especificacao || it.descricao,
            quantidade: it.quantidade ?? 1,
            unidadeMedida: it.unidadeMedida || "UN",
            valorUnitarioEstimado: it.valorUnitarioEstimado,
            valorTotalEstimado: it.valorTotal,
            marcaExigidaOuReferencia: it.marca || null,
          },
          todos.length,
        );
        if (norm) todos.push(norm);
      }

      if (list.length < tamanhoPagina) break;
    } catch {
      break;
    }
  }

  return todos;
}

function deduplicarEOrdenarItens(itens: ItemDisputaEdital[]): ItemDisputaEdital[] {
  const mapa = new Map<string, ItemDisputaEdital>();
  for (let i = 0; i < itens.length; i++) {
    const it = itens[i];
    const chave = `${it.lote ?? 1}:${it.numeroItem}`;
    const prev = mapa.get(chave);
    if (!prev || it.descricao.length > prev.descricao.length) {
      mapa.set(chave, it);
    }
  }
  return Array.from(mapa.values()).sort((a, b) => {
    const loteDiff = (a.lote ?? 1) - (b.lote ?? 1);
    if (loteDiff !== 0) return loteDiff;
    return a.numeroItem - b.numeroItem;
  });
}

/**
 * Extrai a relação oficial completa de itens/lotes do certame combinando:
 * 1) API paginada do PNCP,
 * 2) Planilhas (.xlsx/.xls/.csv) e documentos (Edital, Termo de Referência, Anexos, ZIPs),
 * 3) Extração multimodal via IA com substituição explícita de cabeçalhos genéricos de lote.
 */
export async function extrairItensCertameCompleto(
  oportunidade: any,
  options?: {
    forcarVarreduraDocumentos?: boolean;
    leituraPrevia?: Awaited<ReturnType<typeof lerDocumentosCertame>>;
  },
): Promise<ResultadoExtracaoItensCertame> {
  const avisos: string[] = [];
  const objetoCertame = String(oportunidade.resumo || oportunidade.miniResumo || "");

  // 1. Paginação completa no PNCP + Metadados públicos da compra
  const [itensPncp, metadadosPncp] = await Promise.all([
    buscarItensPaginadosPncp({
      idPncp: oportunidade.idPncp,
      orgaoCnpj: oportunidade.orgaoCnpj,
    }),
    buscarMetadadosCompraPncp({
      idPncp: oportunidade.idPncp,
      orgaoCnpj: oportunidade.orgaoCnpj,
    }),
  ]);

  const pncpTemItemGenericoLote = itensPncp.some((it) =>
    pareceCabecalhoDeLoteOuObjeto(
      it.descricao,
      it.quantidade,
      it.unidadeMedida,
      objetoCertame,
    ),
  );

  const deveVasculharDocumentos =
    Boolean(options?.forcarVarreduraDocumentos) ||
    Boolean(options?.leituraPrevia) ||
    itensPncp.length === 0 ||
    pncpTemItemGenericoLote ||
    itensPncp.length <= 2;

  let documentosLidos: DocumentoLidoResumo[] = [];
  let itensPlanilhas: ItemDisputaEdital[] = [];
  let itensIA: ItemDisputaEdital[] = [];
  let textoDocumentosLidos = options?.leituraPrevia?.textoConsolidado || "";
  let regrasIaExtraidas: Partial<RegrasDisputaDetectadas> | null = null;

  if (deveVasculharDocumentos) {
    const leitura =
      options?.leituraPrevia ??
      (await lerDocumentosCertame(oportunidade.id, {
        sincronizarPncpSeVazio: true,
        maxCharsConsolidado: 150_000,
      }));

    documentosLidos = leitura.documentosLidos;
    textoDocumentosLidos = leitura.textoConsolidado || "";
    avisos.push(...leitura.avisos);

    if (leitura.planilhas.length > 0) {
      itensPlanilhas = extrairItensDePlanilhas(leitura.planilhas);
    }

    const temMaterialParaIA =
      leitura.textoConsolidado.trim().length > 80 ||
      leitura.anexosBinariosMultimodais.length > 0;

    if (temMaterialParaIA) {
      const systemPrompt =
        "Você é um Especialista em Extração de Termo de Referência e Planilhas de Licitações Brasileiras (Lei 14.133/2021).\n" +
        "Sua tarefa é vasculhar TODOS os documentos fornecidos (Termo de Referência, Edital, Anexos, Planilhas e Imagens/PDFs escaneados) e extrair a lista COMPLETA e EXATA de TODOS os itens/produtos/serviços a serem licitados.\n\n" +
        "REGRAS CRÍTICAS (LEIA COM ATENÇÃO):\n" +
        "1. NUNCA coloque o título geral do certame ou cabeçalho do lote como Item 1 (ex: se o PNCP ou cabeçalho diz 'Item 1: AQUISIÇÃO DE GÊNEROS ALIMENTÍCIOS - LOTE 01, Qtd 1, UN', mas o Termo de Referência traz '1 - Bolinho sabor baunilha, UNID, 13.000', USE O ITEM REAL DO TERMO DE REFERÊNCIA!).\n" +
        "2. ATENÇÃO A NÚMEROS EM PORTUGUÊS: '13.000' em colunas de quantidade significa TREZE MIL (13000), '2.762' significa 2762, '3.128' significa 3128. Converta separadores de milhar corretamente para JSON number puro.\n" +
        "3. Preserve integralmente número do item, lote (se houver), descrição/especificação técnica, unidade de medida real do edital (ex: UNID, PCT, KG, PACOTE, QUILO, UN, CX) e quantidade.\n" +
        "4. Extraia também valorUnitarioEstimado, valorTotalEstimado e marcaExigidaOuReferencia quando constarem.\n" +
        "5. Extraia também as regras da disputa no objeto opcional 'regrasDisputa': portal eletrônico, modoDisputaEdital ('ABERTO', 'ABERTO_FECHADO' ou 'FECHADO_ABERTO'), intervaloMinimoLances, criterioJulgamento e uasg.\n" +
        "6. Retorne estritamente JSON no formato:\n" +
        '{ "regrasDisputa": { "portal": "Compras.gov.br", "modoDisputaEdital": "ABERTO", "intervaloMinimoLances": "R$ 0,01", "criterioJulgamento": "Menor Preço", "uasg": "158123" }, "itens": [ { "numeroItem": 1, "lote": 1, "descricao": "string", "especificacaoDetalhada": "string", "quantidade": 13000, "unidadeMedida": "UNID", "valorUnitarioEstimado": null, "valorTotalEstimado": null, "marcaExigidaOuReferencia": null, "exigeAmostra": false } ] }';

      const userPrompt = JSON.stringify({
        edital: oportunidade.numeroEdital,
        orgao: oportunidade.orgaoNome,
        objetoGeral: objetoCertame,
        itensPncpPreliminares: itensPncp.slice(0, 60),
        itensExtraidosDePlanilhas: itensPlanilhas.slice(0, 60),
        documentosLidos: documentosLidos.map((d) => ({
          nome: d.nome,
          paginas: d.totalPaginas,
          escaneado: d.escaneadoOuImagem,
        })),
        conteudoIntegralDocumentos: leitura.textoConsolidado,
      });

      const respLlm = await chamarLlmJsonMultimodal<{
        itens?: unknown[];
        regrasDisputa?: Record<string, unknown>;
      }>({
        systemPrompt,
        userPrompt,
        inlineParts: leitura.anexosBinariosMultimodais,
        timeoutMs: process.env.VITEST === "true" ? 4000 : 150000,
        maxOutputTokens: 32768,
      });

      if (respLlm?.data?.regrasDisputa && typeof respLlm.data.regrasDisputa === "object") {
        const rawRd = respLlm.data.regrasDisputa;
        const parsedRd = regrasDisputaDetectadasSchema.safeParse({
          ...rawRd,
          modoDisputaEdital:
            normalizarModoDisputaPncp(
              null,
              typeof rawRd.modoDisputaEdital === "string" ? rawRd.modoDisputaEdital : null,
            ) || null,
          fontes: ["IA"],
        });
        if (parsedRd.success) {
          regrasIaExtraidas = parsedRd.data;
        }
      }

      if (respLlm?.data && Array.isArray(respLlm.data.itens)) {
        itensIA = respLlm.data.itens
          .map((raw, idx) => normalizarItemExtraido(raw, idx))
          .filter((it): it is ItemDisputaEdital => Boolean(it))
          .filter(
            (it) =>
              !pareceCabecalhoDeLoteOuObjeto(
                it.descricao,
                it.quantidade,
                it.unidadeMedida,
                objetoCertame,
              ),
          );
      }
    }
  }

  const regrasDisputaBase = extrairRegrasDisputaDeTextoEdital(textoDocumentosLidos, {
    portalAtual: oportunidade.portalDisputa ?? null,
    linkSistemaOrigem:
      metadadosPncp?.linkSistemaOrigem || oportunidade.linkSistemaOrigem || null,
    linkProcessoEletronico: metadadosPncp?.linkProcessoEletronico ?? null,
    linkPncp: oportunidade.linkPncp ?? null,
    usuarioNome: metadadosPncp?.usuarioNome ?? null,
    numeroEdital: oportunidade.numeroEdital ?? null,
    codigoUnidade: metadadosPncp?.codigoUnidade ?? null,
    criterioJulgamentoNome: metadadosPncp?.criterioJulgamentoNome ?? null,
    modoDisputaId: metadadosPncp?.modoDisputaId ?? null,
    modoDisputaNome: metadadosPncp?.modoDisputaNome ?? null,
  });

  const regrasDisputaDetectadas = mesclarRegrasDisputaDetectadas(
    oportunidade?.calculadoraDados?.regrasDisputaDetectadas ?? null,
    regrasDisputaBase,
    regrasIaExtraidas,
  );

  // Decisão de precedência entre fontes:
  // 1) Se extração documental IA trouxe itens reais (especialmente quando substituiu cabeçalho de lote do PNCP ou completou itens faltantes)
  const itensPncpReais = itensPncp.filter(
    (it) =>
      !pareceCabecalhoDeLoteOuObjeto(
        it.descricao,
        it.quantidade,
        it.unidadeMedida,
        objetoCertame,
      ),
  );

  if (itensIA.length > 0 && itensIA.length >= itensPncpReais.length) {
    const mesclados = deduplicarEOrdenarItens(itensIA);
    return {
      itens: mesclados,
      totalItens: mesclados.length,
      origem: "EDITAL_ANEXOS",
      documentosLidos,
      avisos,
      regrasDisputaDetectadas,
    };
  }

  if (itensIA.length > 0 && itensPncpReais.length > itensIA.length) {
    // Se o PNCP trouxe muitos itens reais além dos extraídos no resumo da IA, mescla preservando substituições da IA
    const mapaMesclado = new Map<string, ItemDisputaEdital>();
    for (const it of itensPncpReais) {
      mapaMesclado.set(`${it.lote ?? 1}:${it.numeroItem}`, it);
    }
    for (const it of itensIA) {
      mapaMesclado.set(`${it.lote ?? 1}:${it.numeroItem}`, it);
    }
    const mesclados = deduplicarEOrdenarItens(Array.from(mapaMesclado.values()));
    return {
      itens: mesclados,
      totalItens: mesclados.length,
      origem: "EDITAL_ANEXOS",
      documentosLidos,
      avisos,
      regrasDisputaDetectadas,
    };
  }

  // 2) Se planilhas determinísticas trouxeram itens reais completos
  if (itensPlanilhas.length > 0 && itensPlanilhas.length >= itensPncpReais.length) {
    const limpos = deduplicarEOrdenarItens(
      itensPlanilhas.filter(
        (it) =>
          !pareceCabecalhoDeLoteOuObjeto(
            it.descricao,
            it.quantidade,
            it.unidadeMedida,
            objetoCertame,
          ),
      ),
    );
    if (limpos.length > 0) {
      return {
        itens: limpos,
        totalItens: limpos.length,
        origem: "EDITAL_ANEXOS",
        documentosLidos,
        avisos,
        regrasDisputaDetectadas,
      };
    }
  }

  // 3) Itens oficiais do PNCP sem cabeçalho falso
  if (itensPncpReais.length > 0) {
    const ordenados = deduplicarEOrdenarItens(itensPncpReais);
    return {
      itens: ordenados,
      totalItens: ordenados.length,
      origem: "PNCP",
      documentosLidos,
      avisos,
      regrasDisputaDetectadas,
    };
  }

  if (itensPncp.length > 0) {
    const ordenados = deduplicarEOrdenarItens(itensPncp);
    return {
      itens: ordenados,
      totalItens: ordenados.length,
      origem: "PNCP",
      documentosLidos,
      avisos,
      regrasDisputaDetectadas,
    };
  }

  // 4) Fallback: análise IA concluída anterior no histórico da licitação
  if (Array.isArray(oportunidade.analisesIA)) {
    const analiseValida = oportunidade.analisesIA.find(
      (a: any) =>
        a.status === "CONCLUIDO" &&
        (a.relatorioJson?.itens?.lista?.length > 0 ||
          a.relatorioJson?.itensDisputa?.length > 0 ||
          a.relatorioJson?.listaItens?.length > 0),
    );

    if (analiseValida) {
      const rawItens =
        analiseValida.relatorioJson?.itens?.lista ||
        analiseValida.relatorioJson?.itensDisputa ||
        analiseValida.relatorioJson?.listaItens ||
        [];

      const extraidos = rawItens
        .map((it: any, idx: number) => normalizarItemExtraido(it, idx))
        .filter((it: ItemDisputaEdital | null): it is ItemDisputaEdital => Boolean(it));

      if (extraidos.length > 0) {
        return {
          itens: deduplicarEOrdenarItens(extraidos),
          totalItens: extraidos.length,
          origem: "IA",
          documentosLidos,
          avisos,
          regrasDisputaDetectadas,
        };
      }
    }
  }

  // 5) Fallback: itens já salvos na própria oportunidade
  if (Array.isArray(oportunidade.itens) && oportunidade.itens.length > 0) {
    const salvos = (oportunidade.itens as any[])
      .map((it, idx) => normalizarItemExtraido(it, idx))
      .filter((it): it is ItemDisputaEdital => Boolean(it));

    if (salvos.length > 0) {
      return {
        itens: deduplicarEOrdenarItens(salvos),
        totalItens: salvos.length,
        origem: "HISTORICO",
        documentosLidos,
        avisos,
        regrasDisputaDetectadas,
      };
    }
  }

  // 6) Último recurso: sintetiza item único do objeto principal
  return {
    itens: [
      {
        numeroItem: 1,
        lote: 1,
        descricao:
          objetoCertame || "Fornecimento de bens e serviços conforme edital",
        especificacaoDetalhada: oportunidade.resumo || undefined,
        quantidade: 1,
        unidadeMedida: "UN",
        valorUnitarioEstimado: oportunidade.valorEstimado || null,
        valorTotalEstimado: oportunidade.valorEstimado || null,
        marcaExigidaOuReferencia: null,
      },
    ],
    totalItens: 1,
    origem: "HISTORICO",
    documentosLidos,
    avisos,
    regrasDisputaDetectadas,
  };
}

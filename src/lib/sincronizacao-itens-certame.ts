import {
  consolidarCalculadoraProposta,
  type DisputaItemRegra,
  type ItemCalculadoProposta,
  type ItemCalculadoraInput,
} from "@/server/schemas/proposta-calculadora.schema";
import type { ItemDisputaEdital } from "@/server/schemas/analise-ia.schema";

export interface ParametrosPadraoCalcInput {
  impostosPercentual: number;
  bdiPercentual: number;
  margemMinimaPercentual: number;
  margemAlvoPercentual: number;
}

function normalizarTextoComparacao(texto: string): string {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizarChaveItem(
  numeroOuIndice: string | number | null | undefined,
  fallbackIdx = 0,
): string {
  const raw = String(numeroOuIndice ?? "").trim();
  if (!raw) {
    return String(fallbackIdx + 1).padStart(2, "0");
  }
  if (/^\d+$/.test(raw)) {
    const num = Number.parseInt(raw, 10);
    if (Number.isFinite(num) && num > 0) {
      return String(num).padStart(2, "0");
    }
  }
  return raw.toUpperCase();
}

export function normalizarUnidadeItem(raw?: string | null): string {
  const cleaned = String(raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/\.+$/, "");

  if (!cleaned) return "UN";

  const aliases: Record<string, string> = {
    UNIDADE: "UNID",
    UNIDADES: "UNID",
    UND: "UNID",
    "UNID.": "UNID",
    PC: "PECA",
    PCS: "PECA",
    PECAS: "PECA",
    PACOTES: "PACOTE",
    CAIXAS: "CAIXA",
    QUILOS: "QUILO",
    QUILOGRAMA: "KG",
    QUILOGRAMAS: "KG",
    KILO: "KG",
    KILOS: "KG",
    KGS: "KG",
    LITROS: "LITRO",
    L: "LITRO",
    LT: "LITRO",
    GALOES: "GALAO",
    FRASCOS: "FRASCO",
    FARDOS: "FARDO",
    LATAS: "LATA",
    SACOS: "SACO",
    ROLOS: "ROLO",
    TUBOS: "TUBO",
    ENVELOPES: "ENVELOPE",
    SERVICOS: "SERVICO",
    DIARIAS: "DIARIA",
    HORAS: "HORA",
    MESES: "MES",
    METROS: "METRO",
    MT: "METRO",
    CONJUNTOS: "CONJUNTO",
    CONJ: "CONJUNTO",
    "UN/LOTE": "LOTE",
  };

  return aliases[cleaned] || cleaned;
}

export function isObjetoOuLoteHeaderClient(
  descricao?: string | null,
  quantidade?: number | null,
  unidade?: string | null,
  objetoCertame?: string | null,
): boolean {
  const normDesc = normalizarTextoComparacao(descricao || "");
  if (!normDesc) return true;

  if (
    normDesc === "fornecimento de materiais servicos conforme edital" ||
    normDesc === "fornecimento de bens e servicos conforme edital" ||
    normDesc.startsWith("fornecimento de materiais e ou servicos especializados conforme")
  ) {
    return true;
  }

  const qtd = Number(quantidade ?? 1);
  const unit = normalizarUnidadeItem(unidade);
  const unitGenerica = ["", "UN", "UNID", "LOTE", "GLOBAL", "SV"].includes(unit);

  const contemFraseCabecalho =
    /\b(?:lote\s*\d+|lote\s*unico|registro\s+de\s+precos|termo\s+de\s+referencia|conforme\s+(?:o\s+)?(?:anexo|edital|especificacoes)|para\s+o\s+periodo\s+de)\b/.test(
      normDesc,
    ) && /^(?:aquisicao|contratacao|fornecimento|registro)\s+de\b/.test(normDesc);

  if (contemFraseCabecalho && qtd <= 1 && unitGenerica) {
    return true;
  }

  if (objetoCertame) {
    const normObj = normalizarTextoComparacao(objetoCertame);
    if (normObj.length >= 15 && qtd <= 1 && unitGenerica) {
      if (
        normDesc === normObj ||
        normDesc.includes(normObj) ||
        normObj.includes(normDesc)
      ) {
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

export function isItemPlaceholderCertame(
  item: Partial<ItemCalculadoraInput>,
  objetoCertame?: string | null,
  valorEstimadoOpp?: number | null,
): boolean {
  if (!item.descricao || !item.descricao.trim()) return true;

  if (
    isObjetoOuLoteHeaderClient(
      item.descricao,
      item.quantidade,
      item.unidade,
      objetoCertame,
    )
  ) {
    return true;
  }

  const qtd = Number(item.quantidade ?? 1);
  const unit = normalizarUnidadeItem(item.unidade);
  const unitGenerica = ["UN", "UNID", "LOTE", "GLOBAL"].includes(unit);
  if (item.id === "item_01" && qtd <= 1 && unitGenerica) {
    const vEst = Number(valorEstimadoOpp || 0);
    const custoHeuristico = vEst > 0 ? Math.round(vEst * 0.6) : 5000;
    const custoAtual = Number(item.custoUnitario ?? 0);
    if (custoAtual === 0 || custoAtual === custoHeuristico || custoAtual === 5000) {
      return true;
    }
  }

  return false;
}

export function mesclarItensCertameNaCalculadora(params: {
  prevItens: ItemCalculadoraInput[];
  novosItensExtraidos: ItemDisputaEdital[];
  objetoCertame?: string | null;
  valorEstimadoOpp?: number | null;
  parametrosPadrao: ParametrosPadraoCalcInput;
  timestampMs?: number;
}): ItemCalculadoraInput[] {
  const {
    prevItens,
    novosItensExtraidos,
    objetoCertame,
    valorEstimadoOpp,
    parametrosPadrao,
    timestampMs = Date.now(),
  } = params;

  const mapaPrev = new Map<string, ItemCalculadoraInput>();
  prevItens.forEach((it, idx) => {
    mapaPrev.set(normalizarChaveItem(it.numeroItem, idx), it);
  });

  return novosItensExtraidos.map((ext, idx) => {
    const numStr = normalizarChaveItem(ext.numeroItem, idx);
    const existente = mapaPrev.get(numStr);
    const substituirCompletamente =
      !existente ||
      isItemPlaceholderCertame(existente, objetoCertame, valorEstimadoOpp);

    const unidadeNormalizada = normalizarUnidadeItem(ext.unidadeMedida || "UN");
    const qtdOficial =
      Number(ext.quantidade) > 0 ? Number(ext.quantidade) : 1;

    if (!substituirCompletamente && existente) {
      const estExistentePoisoned = Boolean(
        valorEstimadoOpp &&
          valorEstimadoOpp > 0 &&
          existente.valorEstimadoUnitario != null &&
          Math.abs(existente.valorEstimadoUnitario - valorEstimadoOpp) < 0.01 &&
          (novosItensExtraidos.length > 1 || existente.id === "item_01"),
      );
      return {
        ...existente,
        numeroItem: numStr,
        descricao: ext.descricao || existente.descricao,
        unidade: unidadeNormalizada || normalizarUnidadeItem(existente.unidade),
        quantidade: qtdOficial,
        valorEstimadoUnitario:
          ext.valorUnitarioEstimado ??
          (estExistentePoisoned ? null : (existente.valorEstimadoUnitario ?? null)),
        marcaModelo:
          (existente.marcaModelo && existente.marcaModelo.trim()) ||
          ext.marcaExigidaOuReferencia ||
          null,
      };
    }

    return {
      id:
        existente?.id && existente.id !== "item_01"
          ? existente.id
          : `item_calc_${timestampMs}_${idx}`,
      numeroItem: numStr,
      descricao: ext.descricao,
      marcaModelo: ext.marcaExigidaOuReferencia || null,
      unidade: unidadeNormalizada,
      quantidade: qtdOficial,
      valorEstimadoUnitario: ext.valorUnitarioEstimado ?? null,
      custoUnitario: 0,
      freteUnitario: 0,
      outrosCustosUnitario: 0,
      impostosPercentual: parametrosPadrao.impostosPercentual,
      bdiPercentual: parametrosPadrao.bdiPercentual,
      margemMinimaPercentual: parametrosPadrao.margemMinimaPercentual,
      margemAlvoPercentual: parametrosPadrao.margemAlvoPercentual,
      valorUnitarioArrematado: null,
    };
  });
}

export function sanearItensCalculadoraHidratados(
  itens: ItemCalculadoraInput[],
  valorEstimadoOpp?: number | null,
): ItemCalculadoraInput[] {
  if (!Array.isArray(itens) || itens.length === 0) return itens;
  const vEstOpp = Number(valorEstimadoOpp || 0);
  if (!(vEstOpp > 0)) return itens;

  const primeiro = itens[0];
  if (!primeiro) return itens;

  const primeiroComTotalGlobal =
    primeiro.valorEstimadoUnitario != null &&
    Math.abs(primeiro.valorEstimadoUnitario - vEstOpp) < 0.01;

  if (!primeiroComTotalGlobal) return itens;

  if (
    itens.length === 1 &&
    primeiro.id === "item_01" &&
    Math.abs(Number(primeiro.custoUnitario ?? 0) - Math.round(vEstOpp * 0.6)) < 0.01
  ) {
    return [
      {
        ...primeiro,
        valorEstimadoUnitario: null,
        custoUnitario: 0,
      },
    ];
  }

  if (itens.length > 1) {
    return itens.map((it, idx) =>
      idx === 0 ? { ...it, valorEstimadoUnitario: null } : it,
    );
  }

  return itens;
}

export function sincronizarRegrasDisputaComCalculadora(
  itensCalculadosOrInput: ItemCalculadoProposta[] | ItemCalculadoraInput[],
  prevRegras: DisputaItemRegra[],
  options?: { origemPrecosDisputa?: "CALCULADORA" | "MANUAL" },
): DisputaItemRegra[] {
  const itensCalculados: ItemCalculadoProposta[] =
    itensCalculadosOrInput.length > 0 &&
    "pisoUnitarioSeguro" in itensCalculadosOrInput[0]
      ? (itensCalculadosOrInput as ItemCalculadoProposta[])
      : consolidarCalculadoraProposta(
          itensCalculadosOrInput as ItemCalculadoraInput[],
          {},
        ).itens;

  const porId = new Map<string, DisputaItemRegra>();
  const porNumero = new Map<string, DisputaItemRegra>();
  prevRegras.forEach((r, idx) => {
    if (r.itemId) porId.set(r.itemId, r);
    porNumero.set(normalizarChaveItem(r.numeroItem, idx), r);
  });

  return itensCalculados.map((calcItem, idx) => {
    const numNorm = normalizarChaveItem(calcItem.numeroItem, idx);
    const matchPorId = porId.get(calcItem.id);
    const matchPorNumero = !matchPorId ? porNumero.get(numNorm) : undefined;
    const existing = matchPorId ?? matchPorNumero;
    const preserved =
      existing && !isObjetoOuLoteHeaderClient(existing.descricao, existing.quantidade, existing.unidade)
        ? existing
        : undefined;

    const manterPrecosManuais =
      options?.origemPrecosDisputa === "MANUAL" && Boolean(preserved);

    return {
      itemId: calcItem.id,
      numeroItem: numNorm,
      descricao: calcItem.descricao,
      unidade: calcItem.unidade,
      quantidade: calcItem.quantidade,
      ativoNoRobo: preserved ? preserved.ativoNoRobo : true,
      pisoUnitarioSeguro: manterPrecosManuais
        ? preserved!.pisoUnitarioSeguro
        : calcItem.pisoUnitarioSeguro,
      propostaUnitaria: manterPrecosManuais
        ? preserved!.propostaUnitaria
        : calcItem.propostaUnitaria,
      tipoDecremento: preserved?.tipoDecremento || "CENTAVOS_1",
      valorDecremento: preserved?.valorDecremento ?? 0.01,
      tatica: preserved?.tatica || "IMEDIATO",
      statusItem: preserved?.statusItem || "PRONTO",
      melhorLanceSala: preserved?.melhorLanceSala ?? null,
      meuUltimoLance: preserved?.meuUltimoLance ?? null,
      minhaPosicao: preserved?.minhaPosicao ?? null,
      observacoes: preserved?.observacoes || "",
    };
  });
}

export function normalizarMapaSelecaoCotacao(
  prevSelecao: Record<string, boolean>,
  itens: ItemCalculadoraInput[],
): Record<string, boolean> {
  const prevNorm: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(prevSelecao || {})) {
    if (v !== undefined) {
      prevNorm[normalizarChaveItem(k)] = Boolean(v);
    }
  }
  const next: Record<string, boolean> = {};
  itens.forEach((it, idx) => {
    const key = normalizarChaveItem(it.numeroItem, idx);
    const rawKey = String(it.numeroItem || idx + 1);
    const explicit =
      prevSelecao[key] !== undefined
        ? prevSelecao[key]
        : prevSelecao[rawKey] !== undefined
          ? prevSelecao[rawKey]
          : prevNorm[key];
    next[key] = explicit !== undefined ? explicit : true;
  });
  return next;
}

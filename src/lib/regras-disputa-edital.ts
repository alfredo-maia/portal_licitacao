import {
  PORTAIS_DISPUTA_OPCOES,
  type ModoDisputaEdital,
  type RegrasDisputaDetectadas,
} from "@/server/schemas/proposta-calculadora.schema";

function normalizarSemAcento(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizarUrlHttp(url?: string | null): string | null {
  if (!url || typeof url !== "string") return null;
  const limpa = url.trim().replace(/[.,;)\]]+$/, "");
  if (!/^https?:\/\/[^\s]+/i.test(limpa)) return null;
  return limpa;
}

export function normalizarModoDisputaPncp(
  modoId?: number | null,
  modoNome?: string | null,
): ModoDisputaEdital | null {
  if (typeof modoId === "number" && Number.isFinite(modoId)) {
    // Tabela oficial de domínios PNCP (Lei 14.133/2021):
    // 1 = Aberto, 2 = Fechado, 3 = Aberto-Fechado, 4 = Dispensa Com Disputa,
    // 5 = Não se aplica, 6 = Fechado-Aberto
    if (modoId === 1) return "ABERTO";
    if (modoId === 3) return "ABERTO_FECHADO";
    if (modoId === 6) return "FECHADO_ABERTO";
    if (modoId === 2 || modoId === 4 || modoId === 5) return null;
  }

  if (!modoNome || typeof modoNome !== "string") return null;
  const norm = normalizarSemAcento(modoNome);
  if (!norm || norm.includes("nao se aplica") || norm === "fechado") {
    return null;
  }

  if (/\bfechado[\s\-/]*(?:e[\s\-/]*)?aberto\b/.test(norm)) {
    return "FECHADO_ABERTO";
  }
  if (/\baberto[\s\-/]*(?:e[\s\-/]*)?fechado\b/.test(norm)) {
    return "ABERTO_FECHADO";
  }
  if (/\baberto\b/.test(norm)) {
    return "ABERTO";
  }
  return null;
}

const PADROES_PORTAIS: Array<{
  nome: (typeof PORTAIS_DISPUTA_OPCOES)[number];
  matchers: RegExp[];
}> = [
  {
    nome: "Compras.gov.br",
    matchers: [
      /compras\.gov\.br/i,
      /comprasnet\.gov\.br/i,
      /cnetmobile\.estaleiro\.serpro\.gov\.br/i,
      /\bcomprasnet\b/i,
      /\bgov\.br\/compras\b/i,
      /\bcompras\.gov\b/i,
    ],
  },
  {
    nome: "Portal de Compras Públicas",
    matchers: [
      /portaldecompraspublicas/i,
      /compraspublicas\.com/i,
      /portal\s+de\s+compras\s+p[uú]blicas/i,
    ],
  },
  {
    nome: "Licitar Digital",
    matchers: [/licitardigital/i, /licitar\.digital/i, /licitar\s+digital/i],
  },
  {
    nome: "Licitanet",
    matchers: [/licitanet/i],
  },
  {
    nome: "BNC (Bolsa Nacional de Compras)",
    matchers: [/bnccompras/i, /\bbnc\.org/i, /bolsa\s+nacional\s+de\s+compras/i, /\bbnc\b/i],
  },
  {
    nome: "BLL Compras",
    matchers: [/bllcompras/i, /\bbll\.org/i, /\bbll\s+compras\b/i, /\bbll\b/i],
  },
  {
    nome: "BBMNet",
    matchers: [/bbmnet/i, /novobbmnet/i],
  },
  {
    nome: "BEC-SP",
    matchers: [/bec\.sp\.gov\.br/i, /bolsa\s+eletr[oô]nica\s+de\s+compras/i, /\bbec[-\s]?sp\b/i],
  },
  {
    nome: "Licitações-e (Banco do Brasil)",
    matchers: [/licitacoes-e/i, /licita[cç][oõ]es-e/i],
  },
];

function identificarPortalPorString(raw?: string | null): string | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || /^pncp$/i.test(trimmed) || /^outro(\s+portal)?$/i.test(trimmed)) {
    return null;
  }
  for (const entry of PADROES_PORTAIS) {
    if (entry.matchers.some((rx) => rx.test(trimmed))) {
      return entry.nome;
    }
  }
  return null;
}

export function detectarPortalDisputaPorTextoEUrl(params: {
  linkSistemaOrigem?: string | null;
  linkProcessoEletronico?: string | null;
  usuarioNome?: string | null;
  portalAtual?: string | null;
  texto?: string | null;
}): {
  portal: string | null;
  linkSessao: string | null;
  identificadorSala: string | null;
  uasg: string | null;
  fontes: string[];
} {
  const linkOrigemLimpo = sanitizarUrlHttp(params.linkSistemaOrigem);
  const linkProcessoLimpo = sanitizarUrlHttp(params.linkProcessoEletronico);

  let portal: string | null = null;
  const fontes = new Set<string>();

  const portalLinkOrigem =
    identificarPortalPorString(linkOrigemLimpo) ||
    identificarPortalPorString(linkProcessoLimpo);
  if (portalLinkOrigem) {
    portal = portalLinkOrigem;
    fontes.add("Link de Origem");
  }

  if (!portal) {
    const portalUsuario = identificarPortalPorString(params.usuarioNome);
    if (portalUsuario) {
      portal = portalUsuario;
      fontes.add("PNCP");
    }
  }

  if (!portal && params.portalAtual) {
    const portalNormAtual = identificarPortalPorString(params.portalAtual);
    if (portalNormAtual) {
      portal = portalNormAtual;
      fontes.add("Cadastro do Certame");
    } else if (
      (PORTAIS_DISPUTA_OPCOES as readonly string[]).includes(params.portalAtual.trim()) &&
      params.portalAtual.trim() !== "Outro Portal"
    ) {
      portal = params.portalAtual.trim();
      fontes.add("Cadastro do Certame");
    }
  }

  const texto = typeof params.texto === "string" ? params.texto : "";
  if (!portal && texto) {
    const portalTexto = identificarPortalPorString(texto);
    if (portalTexto) {
      portal = portalTexto;
      fontes.add("Edital PDF");
    }
  }

  // Extração de link da sessão caso não exista no linkSistemaOrigem
  let linkSessao: string | null = linkOrigemLimpo || linkProcessoLimpo || null;
  if (!linkSessao && texto) {
    const urlsTexto = texto.match(/https?:\/\/[^\s"'<>)]+/gi) || [];
    for (const candidatoRaw of urlsTexto) {
      const candidato = sanitizarUrlHttp(candidatoRaw);
      if (!candidato) continue;
      if (identificarPortalPorString(candidato)) {
        linkSessao = candidato;
        break;
      }
    }
  }

  // Extração de código UASG
  let uasg: string | null = null;
  if (texto) {
    const matchUasg = texto.match(/\buasg\b[^0-9\n]{0,14}(\d{5,6})/i);
    if (matchUasg?.[1]) {
      uasg = matchUasg[1];
      fontes.add("Edital PDF");
    }
  }

  const identificadorSala = uasg ? `UASG ${uasg}` : null;

  return {
    portal,
    linkSessao,
    identificadorSala,
    uasg,
    fontes: Array.from(fontes),
  };
}

function extrairIntervaloMinimoTexto(texto: string): string | null {
  if (!texto) return null;
  const rxGatilho =
    /(?:intervalo\s+m[ií]nimo|diferen[cç]a\s+m[ií]nima|varia[cç][aã]o\s+m[ií]nima|redu[cç][aã]o\s+m[ií]nima|decremento\s+m[ií]nimo)([^\n.]{0,160})/gi;

  let m: RegExpExecArray | null;
  while ((m = rxGatilho.exec(texto)) !== null) {
    const trecho = m[1] || "";
    const matchReais = trecho.match(
      /R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})|\d+(?:[.,]\d{1,2})?)/i,
    );
    if (matchReais?.[1]) {
      const valorBruto = matchReais[1].trim().replace(/\.$/, "");
      if (/^\d+$/.test(valorBruto)) {
        return `R$ ${valorBruto},00`;
      }
      return `R$ ${valorBruto.replace(".", ",")}`;
    }

    const matchPercent = trecho.match(/(\d+(?:[.,]\d{1,2})?)\s*%/);
    if (matchPercent?.[1]) {
      return `${matchPercent[1].replace(".", ",")}%`;
    }
  }

  return null;
}

function extrairCriterioJulgamento(texto?: string | null): string | null {
  if (!texto || typeof texto !== "string") return null;

  // Prioriza trecho próximo de "Critério de Julgamento" quando presente
  const matchSecao = texto.match(
    /crit[eé]rio(?:\s+de)?\s+julgamento[^\n]{0,100}/i,
  );
  const alvo = matchSecao?.[0] || texto;

  if (/t[eé]cnica\s+e\s+pre[cç]o/i.test(alvo)) return "Técnica e Preço";
  if (/maior\s+desconto/i.test(alvo)) return "Maior Desconto";
  if (/maior\s+lance|maior\s+oferta/i.test(alvo)) return "Maior Lance";
  if (/menor\s+pre[cç]o/i.test(alvo)) return "Menor Preço";

  return null;
}

export function extrairRegrasDisputaDeTextoEdital(
  texto: string,
  contexto?: {
    portalAtual?: string | null;
    linkSistemaOrigem?: string | null;
    linkProcessoEletronico?: string | null;
    linkPncp?: string | null;
    usuarioNome?: string | null;
    numeroEdital?: string | null;
    codigoUnidade?: string | number | null;
    criterioJulgamentoNome?: string | null;
    modoDisputaId?: number | null;
    modoDisputaNome?: string | null;
  },
): RegrasDisputaDetectadas {
  const textoLimpo = typeof texto === "string" ? texto : "";
  const fontes = new Set<string>();

  const portalInfo = detectarPortalDisputaPorTextoEUrl({
    linkSistemaOrigem: contexto?.linkSistemaOrigem,
    linkProcessoEletronico: contexto?.linkProcessoEletronico,
    usuarioNome: contexto?.usuarioNome,
    portalAtual: contexto?.portalAtual,
    texto: textoLimpo,
  });

  for (const f of portalInfo.fontes) {
    fontes.add(f);
  }

  // Modo de Disputa: prioriza cláusula explícita no texto do edital, depois metadata PNCP
  let modoDisputaEdital: ModoDisputaEdital | null = null;
  let modoDisputaNomeOriginal: string | null = contexto?.modoDisputaNome ?? null;

  if (textoLimpo) {
    const matchFechadoAberto = textoLimpo.match(
      /(?:modo(?:\s+de)?\s+disputa[^.\n]{0,60}?|envio\s+de\s+lances[^.\n]{0,60}?)(fechado[\s\-/]*(?:e[\s\-/]*)?aberto)/i,
    );
    const matchAbertoFechado = textoLimpo.match(
      /(?:modo(?:\s+de)?\s+disputa[^.\n]{0,60}?|envio\s+de\s+lances[^.\n]{0,60}?)(aberto[\s\-/]*(?:e[\s\-/]*)?fechado)/i,
    );
    const matchAberto = textoLimpo.match(
      /modo(?:\s+de)?\s+disputa[^.\n]{0,60}?\b(aberto)\b/i,
    );

    if (matchFechadoAberto) {
      modoDisputaEdital = "FECHADO_ABERTO";
      modoDisputaNomeOriginal = modoDisputaNomeOriginal || matchFechadoAberto[1].trim();
      fontes.add("Edital PDF");
    } else if (matchAbertoFechado) {
      modoDisputaEdital = "ABERTO_FECHADO";
      modoDisputaNomeOriginal = modoDisputaNomeOriginal || matchAbertoFechado[1].trim();
      fontes.add("Edital PDF");
    } else if (matchAberto) {
      modoDisputaEdital = "ABERTO";
      modoDisputaNomeOriginal = modoDisputaNomeOriginal || matchAberto[1].trim();
      fontes.add("Edital PDF");
    }
  }

  if (!modoDisputaEdital && (contexto?.modoDisputaId != null || contexto?.modoDisputaNome)) {
    const modoPncp = normalizarModoDisputaPncp(
      contexto?.modoDisputaId,
      contexto?.modoDisputaNome,
    );
    if (modoPncp) {
      modoDisputaEdital = modoPncp;
      fontes.add("PNCP");
    }
  }

  // Intervalo mínimo de lances
  const intervaloMinimoLances = extrairIntervaloMinimoTexto(textoLimpo);
  if (intervaloMinimoLances) {
    fontes.add("Edital PDF");
  }

  // Critério de julgamento
  let criterioJulgamento = extrairCriterioJulgamento(textoLimpo);
  if (criterioJulgamento) {
    fontes.add("Edital PDF");
  } else if (contexto?.criterioJulgamentoNome) {
    criterioJulgamento =
      extrairCriterioJulgamento(contexto.criterioJulgamentoNome) ||
      contexto.criterioJulgamentoNome.trim() ||
      null;
    if (criterioJulgamento) {
      fontes.add("PNCP");
    }
  }

  // UASG (do texto ou do codigoUnidade PNCP se tiver 5 ou 6 dígitos)
  let uasg = portalInfo.uasg;
  if (!uasg && contexto?.codigoUnidade != null) {
    const uasgCand = String(contexto.codigoUnidade).trim();
    if (/^\d{5,6}$/.test(uasgCand)) {
      uasg = uasgCand;
      fontes.add("PNCP");
    }
  }

  const identificadorSala = uasg
    ? `UASG ${uasg}`
    : portalInfo.identificadorSala;

  const camposPreenchidos = [
    portalInfo.portal,
    modoDisputaEdital,
    intervaloMinimoLances,
    criterioJulgamento,
    uasg,
  ].filter(Boolean).length;

  const confianca: RegrasDisputaDetectadas["confianca"] =
    camposPreenchidos >= 3 ? "ALTA" : camposPreenchidos === 2 ? "MEDIA" : "BAIXA";

  return {
    portal: portalInfo.portal,
    modoDisputaEdital,
    modoDisputaNomeOriginal,
    intervaloMinimoLances,
    criterioJulgamento,
    identificadorSala,
    uasg,
    linkSessao: portalInfo.linkSessao || sanitizarUrlHttp(contexto?.linkPncp) || null,
    fontes: Array.from(fontes),
    confianca,
    detectadoEm: new Date().toISOString(),
  };
}

export function mesclarRegrasDisputaDetectadas(
  ...candidatos: Array<Partial<RegrasDisputaDetectadas> | null | undefined>
): RegrasDisputaDetectadas | null {
  let portal: string | null = null;
  let modoDisputaEdital: ModoDisputaEdital | null = null;
  let modoDisputaNomeOriginal: string | null = null;
  let intervaloMinimoLances: string | null = null;
  let criterioJulgamento: string | null = null;
  let identificadorSala: string | null = null;
  let uasg: string | null = null;
  let linkSessao: string | null = null;
  const fontesSet = new Set<string>();
  let confianca: RegrasDisputaDetectadas["confianca"] = "BAIXA";
  let detectadoEm: string | undefined;

  for (const item of candidatos) {
    if (!item || typeof item !== "object") continue;

    const candPortal =
      typeof item.portal === "string" &&
      item.portal.trim() &&
      !/^pncp$/i.test(item.portal.trim()) &&
      item.portal.trim() !== "Outro Portal"
        ? identificarPortalPorString(item.portal) || item.portal.trim()
        : null;
    if (candPortal) portal = candPortal;

    if (item.modoDisputaEdital) {
      const normModo = normalizarModoDisputaPncp(null, item.modoDisputaEdital) || item.modoDisputaEdital;
      if (
        normModo === "ABERTO" ||
        normModo === "ABERTO_FECHADO" ||
        normModo === "FECHADO_ABERTO"
      ) {
        modoDisputaEdital = normModo;
      }
    }

    if (item.modoDisputaNomeOriginal) {
      modoDisputaNomeOriginal = item.modoDisputaNomeOriginal;
    }
    if (item.intervaloMinimoLances) {
      intervaloMinimoLances = item.intervaloMinimoLances;
    }
    if (item.criterioJulgamento) {
      criterioJulgamento = item.criterioJulgamento;
    }
    if (item.uasg) {
      uasg = item.uasg;
    }
    if (item.identificadorSala) {
      identificadorSala = item.identificadorSala;
    }
    if (item.linkSessao) {
      linkSessao = sanitizarUrlHttp(item.linkSessao) || item.linkSessao;
    }
    if (Array.isArray(item.fontes)) {
      for (const f of item.fontes) {
        if (typeof f === "string" && f.trim()) {
          fontesSet.add(f.trim());
        }
      }
    }
    if (item.detectadoEm) {
      detectadoEm = item.detectadoEm;
    }
  }

  if (!identificadorSala && uasg) {
    identificadorSala = `UASG ${uasg}`;
  }

  const temDados = Boolean(
    portal ||
      modoDisputaEdital ||
      intervaloMinimoLances ||
      criterioJulgamento ||
      uasg ||
      identificadorSala ||
      linkSessao,
  );

  if (!temDados) return null;

  const camposPreenchidos = [
    portal,
    modoDisputaEdital,
    intervaloMinimoLances,
    criterioJulgamento,
    uasg,
  ].filter(Boolean).length;

  confianca =
    camposPreenchidos >= 3 ? "ALTA" : camposPreenchidos === 2 ? "MEDIA" : "BAIXA";

  return {
    portal,
    modoDisputaEdital,
    modoDisputaNomeOriginal,
    intervaloMinimoLances,
    criterioJulgamento,
    identificadorSala,
    uasg,
    linkSessao,
    fontes: Array.from(fontesSet),
    confianca,
    detectadoEm: detectadoEm || new Date().toISOString(),
  };
}


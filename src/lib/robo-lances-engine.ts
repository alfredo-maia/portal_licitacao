import {
  type DisputaConfig,
  type DisputaItemRegra,
  type TaticaDisputa,
  type TipoDecremento,
  disputaItemRegraSchema,
  parseDecimalFlexivel,
  round2,
} from "@/server/schemas/proposta-calculadora.schema";

export type PerfilConcorrenteVirtual = "CONSERVADOR" | "MODERADO" | "AGRESSIVO";
export type ModoDisputaSimulacao = "ABERTO" | "ABERTO_FECHADO" | "FECHADO_ABERTO";

export type TipoDisparoLance =
  | "PROPOSTA_INICIAL"
  | "IMEDIATO"
  | "SNIPER"
  | "LANCE_FECHADO"
  | "DESEMPATE_ME_EPP"
  | "CONCORRENTE"
  | "LANCE_MANUAL";

export interface LanceDisputaEvento {
  id: string;
  itemId: string;
  numeroItem: string;
  autorNome: string;
  isMinhaEmpresa: boolean;
  isMeEpp?: boolean;
  valorUnitario: number;
  valorTotal: number;
  timestamp: number;
  tempoRestanteSegundos: number;
  tipoDisparo: TipoDisparoLance;
  mensagem?: string;
}

export interface ContextoDisputa {
  pausaEmergencia: boolean;
  tempoRestanteSegundos: number;
  segundosFinaisSniper: number;
  tempoRespostaSegundos: number;
  modoDisputa: "ABERTO" | "ABERTO_FECHADO" | "FECHADO_ABERTO";
  minhaEmpresaMeEpp: boolean;
  intervaloMinimoLances?: string | null;
}

export interface IntervaloMinimoEditalParsed {
  tipo: "FIXO_REAIS" | "PERCENTUAL";
  valor: number;
  textoFormatado: string;
}

export interface ValidacaoIntervaloItem {
  compativel: boolean;
  decrementoItemReais: number;
  intervaloEditalReais: number;
  motivo?: string;
}

export interface ResultadoAplicarDecremento {
  novoValor: number;
  pisoAtingido: boolean;
  ajustadoPeloIntervaloEdital?: boolean;
  bloqueadoPorIntervaloNoPiso?: boolean;
  decrementoAplicado?: number;
}

export type TipoDecisaoRobo =
  | "ENVIAR_LANCE"
  | "JA_ESTA_VENCENDO"
  | "AGUARDAR_JANELA_SNIPER"
  | "MONITORAR_APENAS"
  | "BLOQUEADO_PISO_SEGURO"
  | "PISO_NAO_CONFIGURADO"
  | "PISO_INVALIDO_ACIMA_PROPOSTA"
  | "PAUSADO_EMERGENCIA"
  | "ITEM_INATIVO";

export interface DecisaoRoboLance {
  tipo: TipoDecisaoRobo;
  deveDisparar: boolean;
  novoValorUnitario?: number;
  novoValorTotal?: number;
  motivo: string;
  taticaUsada?: TaticaDisputa;
  pisoAtingido?: boolean;
}

/**
 * Interpreta o texto do Intervalo Mínimo entre Lances do edital ("R$ 5,00", "0,5%", "10.50").
 * Retorna null se vazio, inválido ou zero/negativo.
 */
export function parseIntervaloMinimoEdital(
  raw?: string | null,
): IntervaloMinimoEditalParsed | null {
  if (!raw || typeof raw !== "string") return null;
  const limpo = raw.trim();
  if (!limpo) return null;

  const matchPerc = limpo.match(/(\d+(?:[.,]\d{1,2})?)\s*%/);
  if (matchPerc?.[1]) {
    const val = parseDecimalFlexivel(matchPerc[1]);
    if (val != null && val > 0) {
      const arredondado = round2(val);
      return {
        tipo: "PERCENTUAL",
        valor: arredondado,
        textoFormatado: `${arredondado.toLocaleString("pt-BR", {
          maximumFractionDigits: 2,
        })}%`,
      };
    }
    return null;
  }

  const matchValor = limpo.match(
    /(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i,
  );
  if (matchValor?.[1]) {
    const val = parseDecimalFlexivel(matchValor[1]);
    if (val != null && val > 0) {
      const arredondado = round2(val);
      return {
        tipo: "FIXO_REAIS",
        valor: arredondado,
        textoFormatado: `R$ ${arredondado.toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`,
      };
    }
  }

  return null;
}

/** Calcula em R$ o passo mínimo exigido pelo edital sobre uma referência de lance. */
export function calcularDecrementoMinimoReaisEdital(
  valorBase: number,
  intervalo?: string | IntervaloMinimoEditalParsed | null,
): number {
  if (!intervalo) return 0;
  const parsed =
    typeof intervalo === "string"
      ? parseIntervaloMinimoEdital(intervalo)
      : intervalo;
  if (!parsed) return 0;
  if (parsed.tipo === "FIXO_REAIS") {
    return Math.max(0.01, round2(parsed.valor));
  }
  return Math.max(0.01, round2(Math.max(0, valorBase) * (parsed.valor / 100)));
}

function calcularDecrementoConfigReais(
  valorAtual: number,
  tipo: TipoDecremento,
  valorDecrementoConfig: number,
): number {
  if (tipo === "FIXO_REAIS") {
    return Math.max(0.01, round2(valorDecrementoConfig || 1.0));
  }
  if (tipo === "PERCENTUAL") {
    const perc = Math.max(0.01, valorDecrementoConfig || 0.5);
    return Math.max(0.01, round2(valorAtual * (perc / 100)));
  }
  return 0.01;
}

/** Verifica se o decremento configurado em um item atende ao intervalo mínimo exigido pelo edital. */
export function validarItemContraIntervaloMinimo(
  item: DisputaItemRegra,
  intervaloRaw?: string | null,
): ValidacaoIntervaloItem {
  const baseReferencia =
    item.melhorLanceSala != null && item.melhorLanceSala > 0
      ? item.melhorLanceSala
      : item.propostaUnitaria > 0
        ? item.propostaUnitaria
        : item.pisoUnitarioSeguro > 0
          ? item.pisoUnitarioSeguro
          : 100;

  const decrementoItemReais = calcularDecrementoConfigReais(
    baseReferencia,
    item.tipoDecremento,
    item.valorDecremento,
  );
  const parsed = parseIntervaloMinimoEdital(intervaloRaw);
  if (!parsed) {
    return {
      compativel: true,
      decrementoItemReais,
      intervaloEditalReais: 0,
    };
  }

  const intervaloEditalReais = calcularDecrementoMinimoReaisEdital(
    baseReferencia,
    parsed,
  );

  if (parsed.tipo === "PERCENTUAL" && item.tipoDecremento === "PERCENTUAL") {
    const compativel = item.valorDecremento + 1e-9 >= parsed.valor;
    return {
      compativel,
      decrementoItemReais,
      intervaloEditalReais,
      motivo: compativel
        ? undefined
        : `Item #${item.numeroItem} está em ${item.valorDecremento}% abaixo do mínimo de ${parsed.textoFormatado} exigido no edital.`,
    };
  }

  const compativel = decrementoItemReais + 1e-9 >= intervaloEditalReais;
  return {
    compativel,
    decrementoItemReais,
    intervaloEditalReais,
    motivo: compativel
      ? undefined
      : `Item #${item.numeroItem} usa decremento de R$ ${decrementoItemReais.toFixed(2)}, menor que o mínimo de ${parsed.textoFormatado} do edital.`,
  };
}

/** Lista itens ativos cujo decremento está abaixo do intervalo mínimo do edital. */
export function listarItensAbaixoIntervaloMinimo(
  itens: DisputaItemRegra[],
  intervaloRaw?: string | null,
): Array<{
  item: DisputaItemRegra;
  motivo: string;
  intervaloEditalReais: number;
  decrementoItemReais: number;
}> {
  const resultado: Array<{
    item: DisputaItemRegra;
    motivo: string;
    intervaloEditalReais: number;
    decrementoItemReais: number;
  }> = [];

  for (const item of itens) {
    if (!item.ativoNoRobo) continue;
    const valid = validarItemContraIntervaloMinimo(item, intervaloRaw);
    if (!valid.compativel && valid.motivo) {
      resultado.push({
        item,
        motivo: valid.motivo,
        intervaloEditalReais: valid.intervaloEditalReais,
        decrementoItemReais: valid.decrementoItemReais,
      });
    }
  }
  return resultado;
}

/** Atualiza itens ativos incompatíveis para atender ao intervalo mínimo do edital. */
export function adequarItensAoIntervaloMinimo(
  itens: DisputaItemRegra[],
  intervaloRaw?: string | null,
): DisputaItemRegra[] {
  const parsed = parseIntervaloMinimoEdital(intervaloRaw);
  if (!parsed) return itens;

  return itens.map((item) => {
    if (!item.ativoNoRobo) return item;
    const check = validarItemContraIntervaloMinimo(item, parsed.textoFormatado);
    if (check.compativel) return item;

    if (parsed.tipo === "PERCENTUAL") {
      return {
        ...item,
        tipoDecremento: "PERCENTUAL",
        valorDecremento: round2(parsed.valor),
      };
    }

    return {
      ...item,
      tipoDecremento: parsed.valor <= 0.01 ? "CENTAVOS_1" : "FIXO_REAIS",
      valorDecremento: round2(parsed.valor),
    };
  });
}

/**
 * Calcula o próximo lance aplicando a regra de decremento configurada e o
 * intervalo mínimo exigido pelo edital (quando informado), com trava
 * matemática inviolável para jamais ficar abaixo do piso seguro.
 */
export function aplicarDecremento(
  valorAtual: number,
  tipo: TipoDecremento,
  valorDecrementoConfig: number,
  pisoSeguro: number,
  intervaloMinimoEdital?: string | IntervaloMinimoEditalParsed | null,
): ResultadoAplicarDecremento {
  const decrementoConfig = calcularDecrementoConfigReais(
    valorAtual,
    tipo,
    valorDecrementoConfig,
  );
  const parsedIntervalo =
    typeof intervaloMinimoEdital === "string"
      ? parseIntervaloMinimoEdital(intervaloMinimoEdital)
      : (intervaloMinimoEdital ?? null);
  const minimoEditalReais = parsedIntervalo
    ? calcularDecrementoMinimoReaisEdital(valorAtual, parsedIntervalo)
    : 0;

  const ajustadoPeloIntervaloEdital =
    minimoEditalReais > decrementoConfig + 1e-9;
  const decrementoEfetivo = Math.max(decrementoConfig, minimoEditalReais);
  const valorCalculado = round2(valorAtual - decrementoEfetivo);

  // Se até o mínimo exigido pelo edital ultrapassar o Piso Seguro, bloqueia em vez de enviar lance ilegal ou com prejuízo
  if (
    minimoEditalReais > 0.01 + 1e-9 &&
    round2(valorAtual - minimoEditalReais) < pisoSeguro
  ) {
    return {
      novoValor: pisoSeguro,
      pisoAtingido: true,
      ajustadoPeloIntervaloEdital,
      bloqueadoPorIntervaloNoPiso: true,
      decrementoAplicado: 0,
    };
  }

  if (valorCalculado < pisoSeguro) {
    return {
      novoValor: pisoSeguro,
      pisoAtingido: true,
      ...(parsedIntervalo
        ? {
            ajustadoPeloIntervaloEdital,
            bloqueadoPorIntervaloNoPiso: false,
            decrementoAplicado: round2(valorAtual - pisoSeguro),
          }
        : {}),
    };
  }

  return {
    novoValor: valorCalculado,
    pisoAtingido: valorCalculado <= pisoSeguro && Boolean(parsedIntervalo),
    ...(parsedIntervalo
      ? {
          ajustadoPeloIntervaloEdital,
          bloqueadoPorIntervaloNoPiso: false,
          decrementoAplicado: decrementoEfetivo,
        }
      : {}),
  };
}

/**
 * Avalia o estado de um item e decide deterministicamente se o robô deve ou não
 * disparar um lance, respeitando piso seguro, tática (Imediato vs Sniper), intervalo mínimo e regras de disputa.
 */
export function avaliarProximoLance(
  item: DisputaItemRegra,
  contexto: ContextoDisputa,
): DecisaoRoboLance {
  if (item.statusItem === "FINALIZADO" || item.statusItem === "VENCEDOR") {
    return {
      tipo: "ITEM_INATIVO",
      deveDisparar: false,
      motivo:
        item.statusItem === "VENCEDOR"
          ? "Item já encerrado como vencedor."
          : "Item finalizado/desclassificado nesta sessão.",
    };
  }

  if (!item.ativoNoRobo) {
    return {
      tipo: "ITEM_INATIVO",
      deveDisparar: false,
      motivo: "Item desativado para atuação automática do robô.",
    };
  }

  if (contexto.pausaEmergencia || item.statusItem === "PAUSADO") {
    return {
      tipo: "PAUSADO_EMERGENCIA",
      deveDisparar: false,
      motivo: "Disputa em pausa de emergência preventiva.",
    };
  }

  if (item.tatica === "MONITORAR") {
    return {
      tipo: "MONITORAR_APENAS",
      deveDisparar: false,
      motivo: "Item em modo somente monitoramento. Não envia lances automáticos.",
    };
  }

  // Sem piso calculado não existe trava: o robô NUNCA atua às cegas
  if (!(item.pisoUnitarioSeguro > 0) || !(item.propostaUnitaria > 0)) {
    return {
      tipo: "PISO_NAO_CONFIGURADO",
      deveDisparar: false,
      motivo:
        "Piso Seguro ou Proposta Inicial não configurados na Calculadora. Robô bloqueado por segurança.",
    };
  }

  if (item.pisoUnitarioSeguro > item.propostaUnitaria) {
    return {
      tipo: "PISO_INVALIDO_ACIMA_PROPOSTA",
      deveDisparar: false,
      motivo: `Configuração inválida: Valor Mínimo / Piso Seguro (R$ ${item.pisoUnitarioSeguro.toFixed(2)}) é maior que a Proposta Inicial (R$ ${item.propostaUnitaria.toFixed(2)}). Robô bloqueado até correção.`,
    };
  }

  // Se já somos o 1º lugar na sala com lance registrado, não queimar margem contra nós mesmos
  if (
    item.minhaPosicao === 1 &&
    item.meuUltimoLance != null &&
    item.melhorLanceSala != null &&
    item.meuUltimoLance <= item.melhorLanceSala
  ) {
    return {
      tipo: "JA_ESTA_VENCENDO",
      deveDisparar: false,
      motivo: "Sua empresa já ocupa a 1ª posição da sala. Margem preservada.",
    };
  }

  // Tática Sniper: só atua nos segundos finais configurados
  if (item.tatica === "SNIPER") {
    const segundosLimite = contexto.segundosFinaisSniper || 10;
    if (contexto.tempoRestanteSegundos > segundosLimite) {
      return {
        tipo: "AGUARDAR_JANELA_SNIPER",
        deveDisparar: false,
        motivo: `Tática Sniper aguardando os últimos ${segundosLimite}s da rodada (faltam ${contexto.tempoRestanteSegundos}s).`,
      };
    }
  }

  const baseReferencia =
    item.melhorLanceSala != null && item.melhorLanceSala > 0
      ? item.melhorLanceSala
      : item.propostaUnitaria;

  if (baseReferencia <= item.pisoUnitarioSeguro) {
    return {
      tipo: "BLOQUEADO_PISO_SEGURO",
      deveDisparar: false,
      pisoAtingido: true,
      motivo: `Menor lance da sala (R$ ${baseReferencia.toFixed(2)}) atingiu ou ultrapassou o Piso Seguro (R$ ${item.pisoUnitarioSeguro.toFixed(2)}). Bloqueio preventivo contra prejuízo e inexequibilidade (Art. 59 da Lei 14.133/2021).`,
    };
  }

  const intervaloParsed = parseIntervaloMinimoEdital(contexto.intervaloMinimoLances);
  const {
    novoValor,
    pisoAtingido,
    ajustadoPeloIntervaloEdital,
    bloqueadoPorIntervaloNoPiso,
  } = aplicarDecremento(
    baseReferencia,
    item.tipoDecremento,
    item.valorDecremento,
    item.pisoUnitarioSeguro,
    intervaloParsed,
  );

  if (bloqueadoPorIntervaloNoPiso) {
    return {
      tipo: "BLOQUEADO_PISO_SEGURO",
      deveDisparar: false,
      pisoAtingido: true,
      motivo: `Respeitando o intervalo mínimo do edital (${intervaloParsed?.textoFormatado || contexto.intervaloMinimoLances}), o próximo lance ficaria abaixo do Piso Seguro (R$ ${item.pisoUnitarioSeguro.toFixed(2)}). Robô bloqueado por segurança.`,
    };
  }

  const novoTotal = round2(novoValor * (item.quantidade > 0 ? item.quantidade : 1));
  const sufixoIntervalo =
    ajustadoPeloIntervaloEdital && intervaloParsed
      ? ` (ajustado ao intervalo mínimo de ${intervaloParsed.textoFormatado} do edital)`
      : "";

  return {
    tipo: "ENVIAR_LANCE",
    deveDisparar: true,
    novoValorUnitario: novoValor,
    novoValorTotal: novoTotal,
    taticaUsada: item.tatica,
    pisoAtingido,
    motivo:
      item.tatica === "SNIPER"
        ? `Disparo Sniper executado nos segundos finais: cobrindo R$ ${baseReferencia.toFixed(2)} para R$ ${novoValor.toFixed(2)}${sufixoIntervalo}.`
        : `Lance Imediato disparado: cobrindo R$ ${baseReferencia.toFixed(2)} para R$ ${novoValor.toFixed(2)}${sufixoIntervalo}.`,
  };
}

/**
 * Validação de Empate Ficto ME/EPP (Lei Complementar 123/2006, Art. 44 e 45).
 * Se a menor proposta da sala for de empresa comum (não-ME) e a melhor ME/EPP
 * estiver em até 5% acima, a ME/EPP tem o direito de preferência de dar lance de desempate.
 */
export function verificarEmpateFictoMeEpp(
  melhorLanceGeral: number,
  liderIsMeEpp: boolean,
  meuUltimoLance: number | null,
  meuPisoSeguro: number,
  minhaEmpresaIsMeEpp: boolean,
): {
  podeDesempatar: boolean;
  margemPercentual: number;
  lanceSugerido: number;
  motivo: string;
} {
  if (!minhaEmpresaIsMeEpp) {
    return {
      podeDesempatar: false,
      margemPercentual: 0,
      lanceSugerido: 0,
      motivo: "Sua empresa não está enquadrada como ME/EPP no certame.",
    };
  }

  if (liderIsMeEpp) {
    return {
      podeDesempatar: false,
      margemPercentual: 0,
      lanceSugerido: 0,
      motivo: "O 1º colocado já é ME/EPP. Regra de empate ficto não se aplica.",
    };
  }

  if (meuUltimoLance == null || meuUltimoLance <= 0) {
    return {
      podeDesempatar: false,
      margemPercentual: 0,
      lanceSugerido: 0,
      motivo: "Sem lance registrado para análise de empate ficto.",
    };
  }

  if (meuUltimoLance <= melhorLanceGeral) {
    return {
      podeDesempatar: false,
      margemPercentual: 0,
      lanceSugerido: 0,
      motivo: "Sua empresa já possui o menor lance.",
    };
  }

  const diferencaPercentual = round2(
    ((meuUltimoLance - melhorLanceGeral) / melhorLanceGeral) * 100,
  );

  if (diferencaPercentual > 5.0) {
    return {
      podeDesempatar: false,
      margemPercentual: diferencaPercentual,
      lanceSugerido: 0,
      motivo: `Diferença de ${diferencaPercentual}% excede o limite legal de 5,0% da LC 123/2006.`,
    };
  }

  const lanceSugerido = round2(melhorLanceGeral - 0.01);

  if (lanceSugerido < meuPisoSeguro) {
    return {
      podeDesempatar: false,
      margemPercentual: diferencaPercentual,
      lanceSugerido,
      motivo: `Direito de preferência aplicável (${diferencaPercentual}% de margem), porém o lance de desempate (R$ ${lanceSugerido.toFixed(2)}) violaria o Piso Seguro de R$ ${meuPisoSeguro.toFixed(2)}.`,
    };
  }

  return {
    podeDesempatar: true,
    margemPercentual: diferencaPercentual,
    lanceSugerido,
    motivo: `Direito de Preferência ME/EPP ATIVO! Sua proposta está a ${diferencaPercentual}% do líder (≤ 5%). Você pode cobrir com R$ ${lanceSugerido.toFixed(2)}.`,
  };
}

const CONCORRENTES_VIRTUAIS: ReadonlyArray<{ nome: string; isMeEpp: boolean }> = [
  { nome: "Tech Distribuidora Ltda", isMeEpp: false },
  { nome: "Alfa Informática & Suprimentos", isMeEpp: false },
  { nome: "Prime Soluções Governamentais ME", isMeEpp: true },
  { nome: "Brasil Comércio de Tecnologia EPP", isMeEpp: true },
  { nome: "Mega Corp Logística e Serviços", isMeEpp: false },
  { nome: "Delta Sistemas Corporativos", isMeEpp: false },
];

const PERFIS_CONCORRENTE: Record<
  PerfilConcorrenteVirtual,
  { probabilidade: number; fatorPiso: number; desconto: (melhor: number) => number }
> = {
  // Agressivo: lances frequentes e fortes, aceita até ~22% de desconto
  AGRESSIVO: {
    probabilidade: 0.75,
    fatorPiso: 0.78,
    desconto: (melhor) =>
      round2(
        melhor > 20 ? Math.max(0.5, melhor * 0.01) : Math.max(0.01, melhor * 0.02),
      ),
  },
  // Moderado: disputa equilibrada, aceita até ~18% de desconto
  MODERADO: {
    probabilidade: 0.5,
    fatorPiso: 0.82,
    desconto: (melhor) => round2(Math.max(0.01, melhor * 0.003)),
  },
  // Conservador: poucos lances, desiste ao atingir 15% de desconto
  CONSERVADOR: {
    probabilidade: 0.3,
    fatorPiso: 0.85,
    desconto: () => 0.01,
  },
};

/** Piso fixo do concorrente virtual, ancorado no preço de referência do item. */
export function calcularPisoConcorrente(
  item: DisputaItemRegra,
  perfil: PerfilConcorrenteVirtual,
): number {
  return round2(item.propostaUnitaria * PERFIS_CONCORRENTE[perfil].fatorPiso);
}

/**
 * Simula a atuação autônoma de um concorrente virtual para movimentar o pregão.
 * O piso do concorrente é FIXO (ancorado na proposta de referência), então ele
 * desiste ao atingir seu limite em vez de descer indefinidamente.
 */
export function simularLanceConcorrente(
  item: DisputaItemRegra,
  perfil: PerfilConcorrenteVirtual,
  tempoRestanteSegundos: number,
  rodadaIndex: number = 1,
  random: () => number = Math.random,
): LanceDisputaEvento | null {
  const config = PERFIS_CONCORRENTE[perfil];
  const melhorAtual = item.melhorLanceSala || item.propostaUnitaria;
  if (!(melhorAtual > 0)) return null;

  if (random() > config.probabilidade) return null;

  const novoValor = round2(melhorAtual - config.desconto(melhorAtual));
  if (novoValor <= 0 || novoValor < calcularPisoConcorrente(item, perfil)) {
    return null;
  }

  const concorrente =
    CONCORRENTES_VIRTUAIS[Math.abs(rodadaIndex) % CONCORRENTES_VIRTUAIS.length];

  return {
    id: `lance-conc-${item.itemId}-${rodadaIndex}`,
    itemId: item.itemId,
    numeroItem: item.numeroItem,
    autorNome: concorrente.nome,
    isMinhaEmpresa: false,
    isMeEpp: concorrente.isMeEpp,
    valorUnitario: novoValor,
    valorTotal: round2(novoValor * (item.quantidade || 1)),
    timestamp: Date.now(),
    tempoRestanteSegundos,
    tipoDisparo: "CONCORRENTE",
    mensagem: `Concorrente ${concorrente.nome} cobriu a oferta com R$ ${novoValor.toFixed(2)}.`,
  };
}

/**
 * Gera um cenário demo realista com 3 itens balanceados para teste imediato.
 */
export function gerarCenarioDemoDisputa(): {
  config: DisputaConfig;
  itens: DisputaItemRegra[];
} {
  const config: DisputaConfig = {
    portal: "Compras.gov.br",
    identificadorSala: "UASG 160001 - PE 042/2026",
    modoDisputaEdital: "ABERTO",
    intervaloMinimoLances: "R$ 0,01",
    origemPrecos: "CALCULADORA",
    statusGeral: "CONFIGURADA",
    pausaEmergencia: false,
    tempoRespostaSegundos: 3,
    segundosFinaisSniper: 10,
    regrasItens: [],
    atualizadoEm: new Date().toISOString(),
  };

  const itens: DisputaItemRegra[] = [
    {
      itemId: "demo-item-1",
      numeroItem: "01",
      descricao: "Notebook Corporativo Core i7 16GB RAM SSD 512GB Tela 15.6 FHD",
      unidade: "UN",
      quantidade: 10,
      ativoNoRobo: true,
      pisoUnitarioSeguro: 4350.0,
      propostaUnitaria: 5200.0,
      tipoDecremento: "CENTAVOS_1",
      valorDecremento: 0.01,
      tatica: "IMEDIATO",
      statusItem: "PRONTO",
      melhorLanceSala: 5180.0,
      meuUltimoLance: 5200.0,
      minhaPosicao: 2,
      observacoes: "Tática imediata cobrindo centavo a centavo.",
    },
    {
      itemId: "demo-item-2",
      numeroItem: "02",
      descricao: "Monitor Profissional 27 Polegadas IPS QHD 75Hz Ajuste Altura",
      unidade: "UN",
      quantidade: 15,
      ativoNoRobo: true,
      pisoUnitarioSeguro: 1320.0,
      propostaUnitaria: 1650.0,
      tipoDecremento: "FIXO_REAIS",
      valorDecremento: 5.0,
      tatica: "SNIPER",
      statusItem: "PRONTO",
      melhorLanceSala: 1620.0,
      meuUltimoLance: 1650.0,
      minhaPosicao: 2,
      observacoes: "Tática sniper: disparo agressivo apenas nos últimos 10s da rodada.",
    },
    {
      itemId: "demo-item-3",
      numeroItem: "03",
      descricao: "Estação de Trabalho Gráfica Xeon 32GB RAM SSD 1TB RTX 4000",
      unidade: "UN",
      quantidade: 2,
      ativoNoRobo: true,
      pisoUnitarioSeguro: 14500.0,
      propostaUnitaria: 16900.0,
      tipoDecremento: "CENTAVOS_1",
      valorDecremento: 0.01,
      tatica: "MONITORAR",
      statusItem: "PRONTO",
      melhorLanceSala: 16400.0,
      meuUltimoLance: 16900.0,
      minhaPosicao: 3,
      observacoes: "Item em modo somente monitoramento. Exige confirmação humana.",
    },
  ];

  config.regrasItens = itens;

  return { config, itens };
}

// ============================================================================
// Ciclo completo da Sessão Simulada (funções puras — sem efeitos colaterais)
// ============================================================================

export const SIMULACAO_CONFIG = {
  tempoInicialSegundos: 45,
  janelaProrrogacaoSegundos: 10,
  prorrogacaoSegundos: 15,
  tempoMaximoSegundos: 60,
  limiteEventos: 200,
  margemFaseFechadaPercentual: 10,
} as const;

export interface OportunidadeDesempate {
  itemId: string;
  numeroItem: string;
  lanceSugerido: number;
  margemPercentual: number;
  motivo: string;
}

export interface AvisoSimulacao {
  id: number;
  tipo: "info" | "success" | "warning" | "error";
  texto: string;
}

export interface LiderConcorrente {
  nome: string;
  isMeEpp: boolean;
}

export interface ClassificacaoFechadoAbertoItem {
  apurada: boolean;
  classificado: boolean;
  melhorPropostaInicial: number;
  minhaPropostaInicial: number | null;
  limiteFaixa10PorCento: number;
  propostasConcorrentes: number[];
  motivo: string;
}

export interface EstadoSimulacao {
  itens: DisputaItemRegra[];
  /** Concorrente que lidera cada item (ausente quando sua empresa lidera) */
  liderConcorrente: Record<string, LiderConcorrente | undefined>;
  /** Último lance de concorrente por item (usado na fase fechada) */
  ultimoLanceConcorrente: Record<string, number | undefined>;
  /** Contagem regressiva em segundos/ticks antes de o robô disparar em cada item */
  cooldownResposta?: Record<string, number>;
  /** Indica se a etapa fechada inicial (Art. 25, FECHADO_ABERTO) já foi apurada */
  etapaFechadaApurada?: boolean;
  /** Resultado da classificação da etapa fechada inicial por item */
  classificacaoFechadoAberto?: Record<
    string,
    ClassificacaoFechadoAbertoItem | undefined
  >;
  tempoRestante: number;
  fase: "ABERTA" | "ENCERRADA";
  sequencia: number;
  /** Fita de lances, do mais recente para o mais antigo */
  eventos: LanceDisputaEvento[];
  desempates: OportunidadeDesempate[];
  ultimoAviso: AvisoSimulacao | null;
}

export interface ParametrosSimulacao {
  perfil: PerfilConcorrenteVirtual;
  pausaEmergencia: boolean;
  segundosFinaisSniper: number;
  tempoRespostaSegundos?: number;
  minhaEmpresaMeEpp: boolean;
  modoDisputa: ModoDisputaSimulacao;
  intervaloMinimoLances?: string | null;
  random?: () => number;
}

/**
 * Normaliza regras de itens vindas do banco (JSON livre) para a simulação:
 * aplica defaults do schema e posiciona a proposta inicial da empresa como melhor lance.
 */
export function normalizarItensParaSimulacao(regras: unknown[]): DisputaItemRegra[] {
  if (!Array.isArray(regras)) return [];
  return regras.flatMap((raw) => {
    const parsed = disputaItemRegraSchema.safeParse(raw);
    if (!parsed.success) return [];
    const item = parsed.data;
    const proposta = item.propostaUnitaria > 0 ? item.propostaUnitaria : null;
    return [
      {
        ...item,
        statusItem: "PRONTO" as const,
        meuUltimoLance: proposta,
        melhorLanceSala: proposta,
        minhaPosicao: proposta ? 1 : null,
      },
    ];
  });
}

/** Itens configurados sem Piso Seguro/Proposta (o robô não atuará neles). */
export function listarItensSemPiso(itens: DisputaItemRegra[]): DisputaItemRegra[] {
  return itens.filter(
    (it) => it.ativoNoRobo && it.tatica !== "MONITORAR" && !(it.pisoUnitarioSeguro > 0 && it.propostaUnitaria > 0),
  );
}

/** Itens ativos com Valor Mínimo / Piso Seguro superior à Proposta Inicial (configuração inválida). */
export function listarItensPisoMaiorQueProposta(itens: DisputaItemRegra[]): DisputaItemRegra[] {
  return itens.filter(
    (it) => it.ativoNoRobo && it.pisoUnitarioSeguro > it.propostaUnitaria,
  );
}

function criarEvento(
  seq: number,
  item: DisputaItemRegra,
  dados: Omit<LanceDisputaEvento, "id" | "itemId" | "numeroItem" | "valorTotal" | "timestamp">,
): LanceDisputaEvento {
  return {
    ...dados,
    id: `ev-${seq}`,
    itemId: item.itemId,
    numeroItem: item.numeroItem,
    valorTotal: round2(dados.valorUnitario * (item.quantidade > 0 ? item.quantidade : 1)),
    timestamp: Date.now(),
  };
}

function anexarEventos(
  eventosAnteriores: LanceDisputaEvento[],
  novosCronologicos: LanceDisputaEvento[],
): LanceDisputaEvento[] {
  if (novosCronologicos.length === 0) return eventosAnteriores;
  return [...[...novosCronologicos].reverse(), ...eventosAnteriores].slice(
    0,
    SIMULACAO_CONFIG.limiteEventos,
  );
}

export function criarEstadoSimulacao(
  itensEntrada: DisputaItemRegra[],
  tempoInicial: number = SIMULACAO_CONFIG.tempoInicialSegundos,
): EstadoSimulacao {
  const itens = itensEntrada.map((it) => ({ ...it }));
  const liderConcorrente: EstadoSimulacao["liderConcorrente"] = {};
  const ultimoLanceConcorrente: EstadoSimulacao["ultimoLanceConcorrente"] = {};
  const eventos: LanceDisputaEvento[] = [];
  let seq = 0;

  itens.forEach((item, idx) => {
    if (item.meuUltimoLance != null && item.meuUltimoLance > 0) {
      seq++;
      eventos.push(
        criarEvento(seq, item, {
          autorNome: "Sua Empresa",
          isMinhaEmpresa: true,
          valorUnitario: item.meuUltimoLance,
          tempoRestanteSegundos: tempoInicial,
          tipoDisparo: "PROPOSTA_INICIAL",
          mensagem: "Proposta inicial cadastrada no sistema.",
        }),
      );
    }

    const concorrenteLidera =
      item.melhorLanceSala != null &&
      item.meuUltimoLance != null &&
      item.melhorLanceSala < item.meuUltimoLance;

    if (concorrenteLidera && item.melhorLanceSala != null) {
      const concorrente = CONCORRENTES_VIRTUAIS[idx % CONCORRENTES_VIRTUAIS.length];
      seq++;
      liderConcorrente[item.itemId] = concorrente;
      ultimoLanceConcorrente[item.itemId] = item.melhorLanceSala;
      eventos.push(
        criarEvento(seq, item, {
          autorNome: concorrente.nome,
          isMinhaEmpresa: false,
          isMeEpp: concorrente.isMeEpp,
          valorUnitario: item.melhorLanceSala,
          tempoRestanteSegundos: tempoInicial,
          tipoDisparo: "CONCORRENTE",
          mensagem: "Proposta inicial do concorrente registrada na sala.",
        }),
      );
    }
  });

  return {
    itens,
    liderConcorrente,
    ultimoLanceConcorrente,
    cooldownResposta: {},
    etapaFechadaApurada: false,
    classificacaoFechadoAberto: {},
    tempoRestante: tempoInicial,
    fase: "ABERTA",
    sequencia: seq,
    eventos: anexarEventos([], eventos),
    desempates: [],
    ultimoAviso: null,
  };
}

function resolverCadenciaResposta(params: ParametrosSimulacao): number {
  const raw = params.tempoRespostaSegundos;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 1) {
    return Math.min(60, Math.round(raw));
  }
  return 1;
}

function montarContexto(params: ParametrosSimulacao, tempoRestante: number): ContextoDisputa {
  return {
    pausaEmergencia: params.pausaEmergencia,
    tempoRestanteSegundos: tempoRestante,
    segundosFinaisSniper: params.segundosFinaisSniper,
    tempoRespostaSegundos: resolverCadenciaResposta(params),
    modoDisputa: params.modoDisputa,
    minhaEmpresaMeEpp: params.minhaEmpresaMeEpp,
    intervaloMinimoLances: params.intervaloMinimoLances ?? null,
  };
}

interface ResultadoReacaoRobo {
  item: DisputaItemRegra;
  evento: Omit<LanceDisputaEvento, "id" | "itemId" | "numeroItem" | "valorTotal" | "timestamp"> | null;
  travouNoPiso: boolean;
  aguardandoCadencia: boolean;
  cooldownAtualizado?: number;
}

function reagirRobo(
  itemEntrada: DisputaItemRegra,
  params: ParametrosSimulacao,
  tempoRestante: number,
  cooldownAtual?: number,
): ResultadoReacaoRobo {
  const item = { ...itemEntrada };
  const contexto = montarContexto(params, tempoRestante);
  const decisao = avaliarProximoLance(item, contexto);

  if (decisao.deveDisparar && decisao.novoValorUnitario != null) {
    const cadencia = contexto.tempoRespostaSegundos;
    const restanteCooldown =
      cooldownAtual == null ? cadencia - 1 : Math.max(0, cooldownAtual - 1);

    if (restanteCooldown > 0) {
      return {
        item,
        evento: null,
        travouNoPiso: false,
        aguardandoCadencia: true,
        cooldownAtualizado: restanteCooldown,
      };
    }

    item.meuUltimoLance = decisao.novoValorUnitario;
    item.melhorLanceSala = decisao.novoValorUnitario;
    item.minhaPosicao = 1;
    item.statusItem = decisao.pisoAtingido ? "PISO_ATINGIDO" : "EM_DISPUTA";
    return {
      item,
      travouNoPiso: false,
      aguardandoCadencia: false,
      cooldownAtualizado: undefined,
      evento: {
        autorNome: `Sua Empresa (Robô ${decisao.taticaUsada === "SNIPER" ? "Sniper" : "Imediato"})`,
        isMinhaEmpresa: true,
        isMeEpp: params.minhaEmpresaMeEpp,
        valorUnitario: decisao.novoValorUnitario,
        tempoRestanteSegundos: tempoRestante,
        tipoDisparo: decisao.taticaUsada === "SNIPER" ? "SNIPER" : "IMEDIATO",
        mensagem: decisao.motivo,
      },
    };
  }

  const travouNoPiso =
    decisao.tipo === "BLOQUEADO_PISO_SEGURO" && item.statusItem !== "PISO_ATINGIDO";
  if (decisao.tipo === "BLOQUEADO_PISO_SEGURO") {
    item.statusItem = "PISO_ATINGIDO";
  }

  const manterCooldown = decisao.tipo === "PAUSADO_EMERGENCIA";
  return {
    item,
    evento: null,
    travouNoPiso,
    aguardandoCadencia: false,
    cooldownAtualizado: manterCooldown ? cooldownAtual : undefined,
  };
}

function itemFinalizado(item: DisputaItemRegra): boolean {
  return item.statusItem === "VENCEDOR" || item.statusItem === "FINALIZADO";
}

function gerarPropostasFechadasConcorrentes(
  propostaReferencia: number,
  perfil: PerfilConcorrenteVirtual,
  random: () => number,
): number[] {
  const fatores: Record<PerfilConcorrenteVirtual, [number, number, number]> = {
    CONSERVADOR: [0.98 + random() * 0.02, 1.01 + random() * 0.02, 1.04 + random() * 0.03],
    MODERADO: [0.93 + random() * 0.05, 0.98 + random() * 0.03, 1.02 + random() * 0.03],
    AGRESSIVO: [0.84 + random() * 0.05, 0.89 + random() * 0.04, 0.93 + random() * 0.04],
  };
  return fatores[perfil]
    .map((f) => Math.max(0.01, round2(propostaReferencia * f)))
    .sort((a, b) => a - b);
}

/**
 * Executa a triagem da etapa fechada inicial do Modo Fechado e Aberto (Art. 25 da IN SEGES/ME nº 73/2022):
 * classifica o autor da menor proposta e os autores das propostas com valor até +10% superiores,
 * ou, não havendo pelo menos 3 nessas condições, os 3 melhores colocados.
 */
export function executarEtapaFechadaInicial(
  estado: EstadoSimulacao,
  params: ParametrosSimulacao,
  propostasIniciaisPorItem?: Record<string, number[]>,
): EstadoSimulacao {
  if (params.modoDisputa !== "FECHADO_ABERTO") {
    return estado;
  }

  const random = params.random ?? Math.random;
  let seq = estado.sequencia;
  const novosEventos: LanceDisputaEvento[] = [];
  const liderConcorrente = { ...estado.liderConcorrente };
  const ultimoLanceConcorrente = { ...estado.ultimoLanceConcorrente };
  const cooldownResposta = { ...(estado.cooldownResposta || {}) };
  const classificacaoFechadoAberto: Record<
    string,
    ClassificacaoFechadoAbertoItem | undefined
  > = { ...(estado.classificacaoFechadoAberto || {}) };

  let qtdClassificados = 0;
  let qtdDesclassificados = 0;

  const itens = estado.itens.map((original, idx) => {
    const item = { ...original };
    if (itemFinalizado(item)) {
      classificacaoFechadoAberto[item.itemId] = {
        apurada: true,
        classificado: false,
        melhorPropostaInicial: item.melhorLanceSala ?? item.propostaUnitaria,
        minhaPropostaInicial: item.meuUltimoLance ?? item.propostaUnitaria,
        limiteFaixa10PorCento: round2(
          (item.melhorLanceSala ?? item.propostaUnitaria) *
            (1 + SIMULACAO_CONFIG.margemFaseFechadaPercentual / 100),
        ),
        propostasConcorrentes: [],
        motivo: "Item finalizado antes da etapa fechada.",
      };
      return item;
    }

    const minhaProposta =
      item.meuUltimoLance != null && item.meuUltimoLance > 0
        ? item.meuUltimoLance
        : item.propostaUnitaria > 0
          ? item.propostaUnitaria
          : null;

    const concExplicito = propostasIniciaisPorItem?.[item.itemId]?.filter(
      (v) => typeof v === "number" && Number.isFinite(v) && v > 0,
    );
    const jaTemConcSeedado =
      ultimoLanceConcorrente[item.itemId] != null &&
      (ultimoLanceConcorrente[item.itemId] ?? 0) > 0;

    const propostasConcorrentes =
      concExplicito && concExplicito.length > 0
        ? [...concExplicito].sort((a, b) => a - b)
        : jaTemConcSeedado
          ? [ultimoLanceConcorrente[item.itemId]!]
          : minhaProposta != null
            ? gerarPropostasFechadasConcorrentes(
                minhaProposta,
                params.perfil,
                random,
              )
            : [];

    const todasPropostas: Array<{ autor: "MINHA" | "CONC"; valor: number; concIdx?: number }> = [];
    if (minhaProposta != null) {
      todasPropostas.push({ autor: "MINHA", valor: minhaProposta });
    }
    propostasConcorrentes.forEach((valor, cIdx) => {
      todasPropostas.push({ autor: "CONC", valor, concIdx: cIdx });
    });

    if (todasPropostas.length === 0) {
      return item;
    }

    todasPropostas.sort(
      (a, b) => a.valor - b.valor || (a.autor === "MINHA" ? -1 : 1),
    );

    const melhorPropostaInicial = todasPropostas[0].valor;
    const limiteFaixa10PorCento = round2(
      melhorPropostaInicial *
        (1 + SIMULACAO_CONFIG.margemFaseFechadaPercentual / 100),
    );
    const qtdNaFaixa10 = todasPropostas.filter(
      (p) => p.valor <= limiteFaixa10PorCento,
    ).length;
    const minhaPosicaoRank = todasPropostas.findIndex(
      (p) => p.autor === "MINHA",
    );

    const classificado =
      minhaProposta != null &&
      (minhaProposta <= limiteFaixa10PorCento ||
        (qtdNaFaixa10 < 3 && minhaPosicaoRank >= 0 && minhaPosicaoRank < 3));

    const melhorConc =
      propostasConcorrentes.length > 0
        ? Math.min(...propostasConcorrentes)
        : null;

    if (melhorConc != null && (minhaProposta == null || melhorConc < minhaProposta)) {
      const concorrenteLider =
        liderConcorrente[item.itemId] ??
        CONCORRENTES_VIRTUAIS[idx % CONCORRENTES_VIRTUAIS.length];
      liderConcorrente[item.itemId] = concorrenteLider;
      ultimoLanceConcorrente[item.itemId] = melhorConc;
      item.melhorLanceSala = melhorConc;
      item.minhaPosicao = minhaPosicaoRank >= 0 ? minhaPosicaoRank + 1 : 2;
      if (!jaTemConcSeedado) {
        seq++;
        novosEventos.push(
          criarEvento(seq, item, {
            autorNome: `${concorrenteLider.nome} (Etapa Fechada)`,
            isMinhaEmpresa: false,
            isMeEpp: concorrenteLider.isMeEpp,
            valorUnitario: melhorConc,
            tempoRestanteSegundos: estado.tempoRestante,
            tipoDisparo: "LANCE_FECHADO",
            mensagem: `Proposta inicial sigilosa aberta na faixa competitiva (Art. 25 IN 73/2022).`,
          }),
        );
      }
    } else if (minhaProposta != null) {
      liderConcorrente[item.itemId] = undefined;
      item.melhorLanceSala = minhaProposta;
      item.minhaPosicao = 1;
    }

    if (classificado) {
      qtdClassificados++;
      const motivoClass =
        minhaProposta != null && minhaProposta <= limiteFaixa10PorCento
          ? `Classificado na etapa fechada (Art. 25 IN 73/2022): dentro dos +10% da menor proposta (limite ${limiteFaixa10PorCento.toFixed(2)}).`
          : `Classificado pelo critério das 3 melhores propostas na etapa fechada (Art. 25 §1º IN 73/2022).`;
      classificacaoFechadoAberto[item.itemId] = {
        apurada: true,
        classificado: true,
        melhorPropostaInicial,
        minhaPropostaInicial: minhaProposta,
        limiteFaixa10PorCento,
        propostasConcorrentes,
        motivo: motivoClass,
      };
      if (item.statusItem === "PRONTO") {
        item.statusItem = "EM_DISPUTA";
      }
      if (!jaTemConcSeedado && propostasConcorrentes.length > 0) {
        seq++;
        novosEventos.push(
          criarEvento(seq, item, {
            autorNome: "Sessão Pública (Art. 25 IN 73/2022)",
            isMinhaEmpresa: true,
            isMeEpp: params.minhaEmpresaMeEpp,
            valorUnitario: minhaProposta ?? melhorPropostaInicial,
            tempoRestanteSegundos: estado.tempoRestante,
            tipoDisparo: "PROPOSTA_INICIAL",
            mensagem: motivoClass,
          }),
        );
      }
    } else {
      qtdDesclassificados++;
      delete cooldownResposta[item.itemId];
      item.statusItem = "FINALIZADO";
      const diffPct =
        minhaProposta != null && melhorPropostaInicial > 0
          ? round2(((minhaProposta - melhorPropostaInicial) / melhorPropostaInicial) * 100)
          : 0;
      const motivoElim = `Desclassificado na etapa fechada (Art. 25 IN 73/2022): proposta inicial R$ ${(minhaProposta ?? 0).toFixed(2)} (+${diffPct.toFixed(1)}%) excedeu +10% da melhor (R$ ${melhorPropostaInicial.toFixed(2)}) e ficou fora das 3 melhores.`;
      classificacaoFechadoAberto[item.itemId] = {
        apurada: true,
        classificado: false,
        melhorPropostaInicial,
        minhaPropostaInicial: minhaProposta,
        limiteFaixa10PorCento,
        propostasConcorrentes,
        motivo: motivoElim,
      };
      seq++;
      novosEventos.push(
        criarEvento(seq, item, {
          autorNome: "Pregoeiro / Sistema (Art. 25 IN 73/2022)",
          isMinhaEmpresa: false,
          valorUnitario: minhaProposta ?? melhorPropostaInicial,
          tempoRestanteSegundos: estado.tempoRestante,
          tipoDisparo: "LANCE_FECHADO",
          mensagem: motivoElim,
        }),
      );
    }

    return item;
  });

  seq++;
  return {
    ...estado,
    itens,
    liderConcorrente,
    ultimoLanceConcorrente,
    cooldownResposta,
    etapaFechadaApurada: true,
    classificacaoFechadoAberto,
    sequencia: seq,
    eventos: anexarEventos(estado.eventos, novosEventos),
    ultimoAviso:
      qtdDesclassificados > 0
        ? {
            id: seq,
            tipo: "warning",
            texto: `📋 Etapa Fechada (Art. 25 IN 73/2022): ${qtdClassificados} item(ns) classificado(s) e ${qtdDesclassificados} desclassificado(s) por exceder +10% da menor proposta.`,
          }
        : {
            id: seq,
            tipo: "info",
            texto: `📋 Etapa Fechada apurada (Art. 25 IN 73/2022): ${qtdClassificados} item(ns) classificado(s) para a etapa aberta.`,
          },
  };
}

function encerrarSessao(
  estado: EstadoSimulacao,
  params: ParametrosSimulacao,
  random: () => number,
): EstadoSimulacao {
  let seq = estado.sequencia;
  const novosEventos: LanceDisputaEvento[] = [];
  const liderConcorrente = { ...estado.liderConcorrente };
  const ultimoLanceConcorrente = { ...estado.ultimoLanceConcorrente };

  let itens = estado.itens.map((it) => ({ ...it }));

  // Fase fechada (modo Aberto e Fechado): um único lance final sigiloso
  if (params.modoDisputa === "ABERTO_FECHADO") {
    itens = itens.map((original) => {
      const item = { ...original };
      const melhor = item.melhorLanceSala;
      if (melhor == null || !(melhor > 0)) return item;
      const limiteFase = melhor * (1 + SIMULACAO_CONFIG.margemFaseFechadaPercentual / 100);

      // Lance fechado do concorrente (se estiver na faixa de 10%)
      const ultimoConc = ultimoLanceConcorrente[item.itemId];
      let finalConcorrente: number | null = null;
      if (ultimoConc != null && ultimoConc <= limiteFase) {
        const pisoConc = calcularPisoConcorrente(item, params.perfil);
        const proposto = round2(melhor * (1 - random() * 0.02));
        finalConcorrente = Math.min(ultimoConc, Math.max(pisoConc, proposto));
      }

      // Lance fechado do robô (somente se ativo, não pausado, não monitoramento e dentro do intervalo mínimo)
      let meuFinal = item.meuUltimoLance;
      const roboPodeAtuar =
        item.ativoNoRobo &&
        !params.pausaEmergencia &&
        item.tatica !== "MONITORAR" &&
        item.pisoUnitarioSeguro > 0 &&
        item.pisoUnitarioSeguro <= item.propostaUnitaria &&
        item.meuUltimoLance != null &&
        item.meuUltimoLance <= limiteFase;

      const concorrenteNaFaixa = ultimoConc != null && ultimoConc <= limiteFase;
      if (
        roboPodeAtuar &&
        (item.minhaPosicao !== 1 || concorrenteNaFaixa) &&
        melhor > item.pisoUnitarioSeguro
      ) {
        const resultadoFechado = aplicarDecremento(
          melhor,
          item.tipoDecremento,
          item.valorDecremento,
          item.pisoUnitarioSeguro,
          params.intervaloMinimoLances,
        );
        if (!resultadoFechado.bloqueadoPorIntervaloNoPiso) {
          meuFinal = resultadoFechado.novoValor;
          seq++;
          novosEventos.push(
            criarEvento(seq, item, {
              autorNome: "Sua Empresa (Lance Fechado)",
              isMinhaEmpresa: true,
              isMeEpp: params.minhaEmpresaMeEpp,
              valorUnitario: meuFinal,
              tempoRestanteSegundos: 0,
              tipoDisparo: "LANCE_FECHADO",
              mensagem: "Lance final sigiloso enviado na fase fechada.",
            }),
          );
        }
      }

      if (finalConcorrente != null && finalConcorrente < (ultimoConc ?? Infinity)) {
        const lider = liderConcorrente[item.itemId] ?? CONCORRENTES_VIRTUAIS[0];
        seq++;
        novosEventos.push(
          criarEvento(seq, item, {
            autorNome: `${lider.nome} (Lance Fechado)`,
            isMinhaEmpresa: false,
            isMeEpp: lider.isMeEpp,
            valorUnitario: finalConcorrente,
            tempoRestanteSegundos: 0,
            tipoDisparo: "LANCE_FECHADO",
            mensagem: "Lance final sigiloso do concorrente na fase fechada.",
          }),
        );
        liderConcorrente[item.itemId] = lider;
        ultimoLanceConcorrente[item.itemId] = finalConcorrente;
      }

      item.meuUltimoLance = meuFinal;
      const conc = ultimoLanceConcorrente[item.itemId];
      if (meuFinal != null && (conc == null || meuFinal <= conc)) {
        item.melhorLanceSala = meuFinal;
        item.minhaPosicao = 1;
      } else if (conc != null) {
        item.melhorLanceSala = conc;
        item.minhaPosicao = 2;
      }
      return item;
    });
  }

  // Resultado final por item
  itens = itens.map((item) => {
    if (itemFinalizado(item)) return item;
    if (item.minhaPosicao === 1) {
      liderConcorrente[item.itemId] = undefined;
      return { ...item, statusItem: "VENCEDOR" as const };
    }
    return item.statusItem === "PISO_ATINGIDO" ? item : { ...item, statusItem: "FINALIZADO" as const };
  });

  // Direito de preferência ME/EPP (LC 123/2006)
  const desempates: OportunidadeDesempate[] = [];
  if (params.minhaEmpresaMeEpp) {
    for (const item of itens) {
      if (estado.classificacaoFechadoAberto?.[item.itemId]?.classificado === false) {
        continue;
      }
      if (item.minhaPosicao === 1 || item.melhorLanceSala == null) continue;
      const check = verificarEmpateFictoMeEpp(
        item.melhorLanceSala,
        liderConcorrente[item.itemId]?.isMeEpp ?? false,
        item.meuUltimoLance,
        item.pisoUnitarioSeguro,
        true,
      );
      if (check.podeDesempatar) {
        desempates.push({
          itemId: item.itemId,
          numeroItem: item.numeroItem,
          lanceSugerido: check.lanceSugerido,
          margemPercentual: check.margemPercentual,
          motivo: check.motivo,
        });
      }
    }
  }

  const vencidos = itens.filter((it) => it.statusItem === "VENCEDOR").length;
  const textoDesempate =
    desempates.length > 0
      ? ` ${desempates.length} item(ns) com direito de preferência ME/EPP disponível.`
      : "";

  return {
    ...estado,
    itens,
    liderConcorrente,
    ultimoLanceConcorrente,
    cooldownResposta: {},
    tempoRestante: 0,
    fase: "ENCERRADA",
    sequencia: seq + 1,
    eventos: anexarEventos(estado.eventos, novosEventos),
    desempates,
    ultimoAviso: {
      id: seq + 1,
      tipo: desempates.length > 0 ? "warning" : "info",
      texto: `🏁 Sessão encerrada: sua empresa arrematou ${vencidos} de ${itens.length} item(ns).${textoDesempate}`,
    },
  };
}

/**
 * Avança a sessão simulada em 1 segundo:
 * 0) no modo FECHADO_ABERTO, apura na abertura a etapa fechada (+10% / Top 3 - Art. 25);
 * 1) concorrentes reagem quando sua empresa lidera; 2) o robô reage respeitando cadência e intervalo mínimo;
 * 3) prorrogação automática; 4) encerramento e fase fechada.
 * Função pura: não altera o estado recebido.
 */
export function executarTickSimulacao(
  estado: EstadoSimulacao,
  params: ParametrosSimulacao,
): EstadoSimulacao {
  if (estado.fase === "ENCERRADA") return estado;

  const random = params.random ?? Math.random;
  const estadoBase =
    params.modoDisputa === "FECHADO_ABERTO" && !estado.etapaFechadaApurada
      ? executarEtapaFechadaInicial(estado, params)
      : estado;

  const novoTempo = Math.max(0, estadoBase.tempoRestante - 1);
  if (novoTempo <= 0) {
    return encerrarSessao(estadoBase, params, random);
  }
  const janela = SIMULACAO_CONFIG.janelaProrrogacaoSegundos;
  const liderConcorrente = { ...estadoBase.liderConcorrente };
  const ultimoLanceConcorrente = { ...estadoBase.ultimoLanceConcorrente };
  const cooldownResposta: Record<string, number> = {
    ...(estadoBase.cooldownResposta || {}),
  };
  const novosEventos: LanceDisputaEvento[] = [];
  let seq = estadoBase.sequencia;
  let houveLanceNaJanela = false;
  let aviso: AvisoSimulacao | null = null;

  const itens = estadoBase.itens.map((original, idx) => {
    let item = { ...original };
    if (itemFinalizado(item)) {
      delete cooldownResposta[item.itemId];
      return item;
    }

    // 1. Concorrente virtual só reage quando sua empresa está na liderança
    if (item.minhaPosicao === 1) {
      const lance = simularLanceConcorrente(item, params.perfil, novoTempo, seq + idx, random);
      if (lance) {
        seq++;
        novosEventos.push({ ...lance, id: `ev-${seq}` });
        liderConcorrente[item.itemId] = { nome: lance.autorNome, isMeEpp: Boolean(lance.isMeEpp) };
        ultimoLanceConcorrente[item.itemId] = lance.valorUnitario;
        item.melhorLanceSala = lance.valorUnitario;
        item.minhaPosicao = 2;
        delete cooldownResposta[item.itemId];
        if (item.statusItem === "PRONTO") item.statusItem = "EM_DISPUTA";
        if (novoTempo <= janela) houveLanceNaJanela = true;
      }
    }

    // 2. Reação do robô respeitando cadência (tempoRespostaSegundos) e intervalo mínimo
    const reacao = reagirRobo(item, params, novoTempo, cooldownResposta[item.itemId]);
    item = reacao.item;
    if (reacao.cooldownAtualizado != null && reacao.cooldownAtualizado > 0) {
      cooldownResposta[item.itemId] = reacao.cooldownAtualizado;
    } else {
      delete cooldownResposta[item.itemId];
    }

    if (reacao.evento) {
      seq++;
      novosEventos.push(criarEvento(seq, item, reacao.evento));
      liderConcorrente[item.itemId] = undefined;
      if (novoTempo <= janela) houveLanceNaJanela = true;
    } else if (reacao.travouNoPiso) {
      seq++;
      aviso = {
        id: seq,
        tipo: "warning",
        texto: `🔒 Item ${item.numeroItem}: concorrente abaixo do seu Piso Seguro (${item.pisoUnitarioSeguro.toFixed(2)}) ou bloqueado pelo intervalo mínimo do edital. Robô travado para proteger sua margem.`,
      };
    }
    return item;
  });

  let tempoRestante = novoTempo;
  const permiteProrrogacao =
    params.modoDisputa === "ABERTO" || params.modoDisputa === "FECHADO_ABERTO";
  if (houveLanceNaJanela && permiteProrrogacao) {
    tempoRestante = Math.min(
      novoTempo + SIMULACAO_CONFIG.prorrogacaoSegundos,
      SIMULACAO_CONFIG.tempoMaximoSegundos,
    );
    seq++;
    aviso = {
      id: seq,
      tipo: "info",
      texto: `⏱️ Prorrogação automática (+${SIMULACAO_CONFIG.prorrogacaoSegundos}s): lance registrado nos ${janela}s finais.`,
    };
  }

  const proximo: EstadoSimulacao = {
    ...estadoBase,
    itens,
    liderConcorrente,
    ultimoLanceConcorrente,
    cooldownResposta,
    tempoRestante,
    sequencia: seq,
    eventos: anexarEventos(estadoBase.eventos, novosEventos),
    ultimoAviso: aviso ?? estadoBase.ultimoAviso,
  };

  return tempoRestante <= 0 ? encerrarSessao(proximo, params, random) : proximo;
}

/** Injeta manualmente um lance rival para testar a reação do robô. */
export function injetarLanceRival(
  estado: EstadoSimulacao,
  itemId: string,
  params: ParametrosSimulacao,
): EstadoSimulacao {
  if (estado.fase === "ENCERRADA") return estado;
  const alvo = estado.itens.find((it) => it.itemId === itemId);
  if (!alvo || itemFinalizado(alvo)) return estado;

  const base = alvo.melhorLanceSala || alvo.propostaUnitaria;
  const passoRival =
    base > 10 ? Math.max(1.0, round2(base * 0.01)) : Math.max(0.01, round2(base * 0.05));
  const novoValorRival = round2(base - passoRival);
  if (!(novoValorRival > 0)) return estado;

  const janela = SIMULACAO_CONFIG.janelaProrrogacaoSegundos;
  let seq = estado.sequencia;
  const novosEventos: LanceDisputaEvento[] = [];
  const rival: LiderConcorrente = { nome: "Concorrente Desafiante (Injetado)", isMeEpp: false };
  const cooldownResposta: Record<string, number> = {
    ...(estado.cooldownResposta || {}),
  };

  seq++;
  novosEventos.push(
    criarEvento(seq, alvo, {
      autorNome: rival.nome,
      isMinhaEmpresa: false,
      isMeEpp: false,
      valorUnitario: novoValorRival,
      tempoRestanteSegundos: estado.tempoRestante,
      tipoDisparo: "LANCE_MANUAL",
      mensagem: `Lance concorrente de R$ ${novoValorRival.toFixed(2)} injetado manualmente para teste.`,
    }),
  );

  const itemComRival: DisputaItemRegra = {
    ...alvo,
    melhorLanceSala: novoValorRival,
    minhaPosicao: 2,
    statusItem: alvo.statusItem === "PRONTO" ? "EM_DISPUTA" : alvo.statusItem,
  };

  const cadencia = resolverCadenciaResposta(params);
  let reacao: ResultadoReacaoRobo;
  if (cadencia > 1) {
    const contexto = montarContexto(params, estado.tempoRestante);
    const decisao = avaliarProximoLance(itemComRival, contexto);
    if (decisao.deveDisparar) {
      cooldownResposta[itemId] = cadencia;
      reacao = {
        item: itemComRival,
        evento: null,
        travouNoPiso: false,
        aguardandoCadencia: true,
        cooldownAtualizado: cadencia,
      };
    } else {
      reacao = reagirRobo(itemComRival, params, estado.tempoRestante);
      delete cooldownResposta[itemId];
    }
  } else {
    reacao = reagirRobo(itemComRival, params, estado.tempoRestante);
    delete cooldownResposta[itemId];
  }

  const liderConcorrente = { ...estado.liderConcorrente, [itemId]: rival };
  if (reacao.evento) {
    seq++;
    novosEventos.push(criarEvento(seq, reacao.item, reacao.evento));
    liderConcorrente[itemId] = undefined;
  }

  const prorroga =
    estado.tempoRestante <= janela &&
    (params.modoDisputa === "ABERTO" || params.modoDisputa === "FECHADO_ABERTO");
  const tempoRestante = prorroga
    ? Math.min(
        estado.tempoRestante + SIMULACAO_CONFIG.prorrogacaoSegundos,
        SIMULACAO_CONFIG.tempoMaximoSegundos,
      )
    : estado.tempoRestante;

  seq++;
  return {
    ...estado,
    itens: estado.itens.map((it) => (it.itemId === itemId ? reacao.item : it)),
    liderConcorrente,
    ultimoLanceConcorrente: { ...estado.ultimoLanceConcorrente, [itemId]: novoValorRival },
    cooldownResposta,
    tempoRestante,
    sequencia: seq,
    eventos: anexarEventos(estado.eventos, novosEventos),
    ultimoAviso: {
      id: seq,
      tipo: reacao.travouNoPiso ? "warning" : "info",
      texto: reacao.travouNoPiso
        ? `🔒 Lance concorrente de R$ ${novoValorRival.toFixed(2)} injetado no Item ${alvo.numeroItem} atingiu seu Piso Seguro (R$ ${alvo.pisoUnitarioSeguro.toFixed(2)}). Robô bloqueado por segurança.`
        : `💥 Lance concorrente de R$ ${novoValorRival.toFixed(2)} injetado no Item ${alvo.numeroItem}. ${
            reacao.evento
              ? "O robô respondeu na hora."
              : reacao.aguardandoCadencia
                ? `Robô aguardará ${cadencia}s da cadência configurada.`
                : "O robô aguardou conforme a tática configurada."
          }`,
    },
  };
}

/** Exerce o direito de preferência ME/EPP em um item após o encerramento. */
export function exercerDesempateMeEpp(
  estado: EstadoSimulacao,
  itemId: string,
  minhaEmpresaMeEpp: boolean,
): EstadoSimulacao {
  const oportunidade = estado.desempates.find((d) => d.itemId === itemId);
  const alvo = estado.itens.find((it) => it.itemId === itemId);
  if (!oportunidade || !alvo || !minhaEmpresaMeEpp) return estado;

  const seq = estado.sequencia + 1;
  const evento = criarEvento(seq, alvo, {
    autorNome: "Sua Empresa (Desempate LC 123/2006)",
    isMinhaEmpresa: true,
    isMeEpp: true,
    valorUnitario: oportunidade.lanceSugerido,
    tempoRestanteSegundos: 0,
    tipoDisparo: "DESEMPATE_ME_EPP",
    mensagem: `Direito de preferência exercido: R$ ${oportunidade.lanceSugerido.toFixed(2)} arrematou o item.`,
  });

  return {
    ...estado,
    itens: estado.itens.map((it) =>
      it.itemId === itemId
        ? {
            ...it,
            meuUltimoLance: oportunidade.lanceSugerido,
            melhorLanceSala: oportunidade.lanceSugerido,
            minhaPosicao: 1,
            statusItem: "VENCEDOR" as const,
          }
        : it,
    ),
    liderConcorrente: { ...estado.liderConcorrente, [itemId]: undefined },
    desempates: estado.desempates.filter((d) => d.itemId !== itemId),
    sequencia: seq + 1,
    eventos: anexarEventos(estado.eventos, [evento]),
    ultimoAviso: {
      id: seq + 1,
      tipo: "success",
      texto: `🏆 Direito de preferência exercido! Sua empresa venceu o Item ${alvo.numeroItem} por R$ ${oportunidade.lanceSugerido.toFixed(2)}.`,
    },
  };
}

export function declinarDesempateMeEpp(estado: EstadoSimulacao, itemId: string): EstadoSimulacao {
  return { ...estado, desempates: estado.desempates.filter((d) => d.itemId !== itemId) };
}

/** Altera a tática de um item durante a simulação. */
export function alterarTaticaItem(
  estado: EstadoSimulacao,
  itemId: string,
  tatica: TaticaDisputa,
): EstadoSimulacao {
  return {
    ...estado,
    itens: estado.itens.map((it) => (it.itemId === itemId ? { ...it, tatica } : it)),
  };
}

import {
  type DisputaConfig,
  type DisputaItemRegra,
  type TaticaDisputa,
  type TipoDecremento,
  disputaItemRegraSchema,
  round2,
} from "@/server/schemas/proposta-calculadora.schema";

export type PerfilConcorrenteVirtual = "CONSERVADOR" | "MODERADO" | "AGRESSIVO";
export type ModoDisputaSimulacao = "ABERTO" | "ABERTO_FECHADO";

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
 * Calcula o próximo lance aplicando a regra de decremento configurada,
 * com trava matemática inviolável para jamais ficar abaixo do piso seguro.
 */
export function aplicarDecremento(
  valorAtual: number,
  tipo: TipoDecremento,
  valorDecrementoConfig: number,
  pisoSeguro: number,
): { novoValor: number; pisoAtingido: boolean } {
  let decrementoEfetivo = 0.01;

  if (tipo === "FIXO_REAIS") {
    decrementoEfetivo = Math.max(0.01, valorDecrementoConfig || 1.0);
  } else if (tipo === "PERCENTUAL") {
    const perc = Math.max(0.01, valorDecrementoConfig || 0.5);
    decrementoEfetivo = Math.max(0.01, round2(valorAtual * (perc / 100)));
  }

  const valorCalculado = round2(valorAtual - decrementoEfetivo);

  if (valorCalculado < pisoSeguro) {
    return { novoValor: pisoSeguro, pisoAtingido: true };
  }

  return { novoValor: valorCalculado, pisoAtingido: false };
}

/**
 * Avalia o estado de um item e decide deterministicamente se o robô deve ou não
 * disparar um lance, respeitando piso seguro, tática (Imediato vs Sniper) e regras de disputa.
 */
export function avaliarProximoLance(
  item: DisputaItemRegra,
  contexto: ContextoDisputa,
): DecisaoRoboLance {
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

  const { novoValor, pisoAtingido } = aplicarDecremento(
    baseReferencia,
    item.tipoDecremento,
    item.valorDecremento,
    item.pisoUnitarioSeguro,
  );

  const novoTotal = round2(novoValor * (item.quantidade > 0 ? item.quantidade : 1));

  return {
    tipo: "ENVIAR_LANCE",
    deveDisparar: true,
    novoValorUnitario: novoValor,
    novoValorTotal: novoTotal,
    taticaUsada: item.tatica,
    pisoAtingido,
    motivo:
      item.tatica === "SNIPER"
        ? `Disparo Sniper executado nos segundos finais: cobrindo R$ ${baseReferencia.toFixed(2)} para R$ ${novoValor.toFixed(2)}.`
        : `Lance Imediato disparado: cobrindo R$ ${baseReferencia.toFixed(2)} para R$ ${novoValor.toFixed(2)}.`,
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
    desconto: (melhor) => round2(Math.max(0.5, melhor * 0.01)),
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

export interface EstadoSimulacao {
  itens: DisputaItemRegra[];
  /** Concorrente que lidera cada item (ausente quando sua empresa lidera) */
  liderConcorrente: Record<string, LiderConcorrente | undefined>;
  /** Último lance de concorrente por item (usado na fase fechada) */
  ultimoLanceConcorrente: Record<string, number | undefined>;
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
  minhaEmpresaMeEpp: boolean;
  modoDisputa: ModoDisputaSimulacao;
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
    tempoRestante: tempoInicial,
    fase: "ABERTA",
    sequencia: seq,
    eventos: anexarEventos([], eventos),
    desempates: [],
    ultimoAviso: null,
  };
}

function montarContexto(params: ParametrosSimulacao, tempoRestante: number): ContextoDisputa {
  return {
    pausaEmergencia: params.pausaEmergencia,
    tempoRestanteSegundos: tempoRestante,
    segundosFinaisSniper: params.segundosFinaisSniper,
    tempoRespostaSegundos: 1,
    modoDisputa: params.modoDisputa,
    minhaEmpresaMeEpp: params.minhaEmpresaMeEpp,
  };
}

interface ResultadoReacaoRobo {
  item: DisputaItemRegra;
  evento: Omit<LanceDisputaEvento, "id" | "itemId" | "numeroItem" | "valorTotal" | "timestamp"> | null;
  travouNoPiso: boolean;
}

function reagirRobo(
  itemEntrada: DisputaItemRegra,
  params: ParametrosSimulacao,
  tempoRestante: number,
): ResultadoReacaoRobo {
  const item = { ...itemEntrada };
  const decisao = avaliarProximoLance(item, montarContexto(params, tempoRestante));

  if (decisao.deveDisparar && decisao.novoValorUnitario != null) {
    item.meuUltimoLance = decisao.novoValorUnitario;
    item.melhorLanceSala = decisao.novoValorUnitario;
    item.minhaPosicao = 1;
    item.statusItem = decisao.pisoAtingido ? "PISO_ATINGIDO" : "EM_DISPUTA";
    return {
      item,
      travouNoPiso: false,
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
  return { item, evento: null, travouNoPiso };
}

function itemFinalizado(item: DisputaItemRegra): boolean {
  return item.statusItem === "VENCEDOR" || item.statusItem === "FINALIZADO";
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

      // Lance fechado do robô (somente se ativo, não pausado e não em monitoramento)
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
        meuFinal = aplicarDecremento(
          melhor,
          item.tipoDecremento,
          item.valorDecremento,
          item.pisoUnitarioSeguro,
        ).novoValor;
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
 * 1) concorrentes reagem quando sua empresa lidera; 2) o robô reage pelas regras;
 * 3) prorrogação automática (modo Aberto); 4) encerramento e fase fechada.
 * Função pura: não altera o estado recebido.
 */
export function executarTickSimulacao(
  estado: EstadoSimulacao,
  params: ParametrosSimulacao,
): EstadoSimulacao {
  if (estado.fase === "ENCERRADA") return estado;

  const random = params.random ?? Math.random;
  const novoTempo = Math.max(0, estado.tempoRestante - 1);
  if (novoTempo <= 0) {
    return encerrarSessao(estado, params, random);
  }
  const janela = SIMULACAO_CONFIG.janelaProrrogacaoSegundos;
  const liderConcorrente = { ...estado.liderConcorrente };
  const ultimoLanceConcorrente = { ...estado.ultimoLanceConcorrente };
  const novosEventos: LanceDisputaEvento[] = [];
  let seq = estado.sequencia;
  let houveLanceNaJanela = false;
  let aviso: AvisoSimulacao | null = null;

  const itens = estado.itens.map((original, idx) => {
    let item = { ...original };
    if (itemFinalizado(item)) return item;

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
        if (item.statusItem === "PRONTO") item.statusItem = "EM_DISPUTA";
        if (novoTempo <= janela) houveLanceNaJanela = true;
      }
    }

    // 2. Reação do robô
    const reacao = reagirRobo(item, params, novoTempo);
    item = reacao.item;
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
        texto: `🔒 Item ${item.numeroItem}: concorrente abaixo do seu Piso Seguro (${item.pisoUnitarioSeguro.toFixed(2)}). Robô travado para proteger sua margem.`,
      };
    }
    return item;
  });

  let tempoRestante = novoTempo;
  if (houveLanceNaJanela && params.modoDisputa === "ABERTO") {
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
    ...estado,
    itens,
    liderConcorrente,
    ultimoLanceConcorrente,
    tempoRestante,
    sequencia: seq,
    eventos: anexarEventos(estado.eventos, novosEventos),
    ultimoAviso: aviso ?? estado.ultimoAviso,
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
  if (!alvo) return estado;

  const base = alvo.melhorLanceSala || alvo.propostaUnitaria;
  const novoValorRival = round2(base - Math.max(1.0, round2(base * 0.01)));
  if (!(novoValorRival > 0)) return estado;

  const janela = SIMULACAO_CONFIG.janelaProrrogacaoSegundos;
  let seq = estado.sequencia;
  const novosEventos: LanceDisputaEvento[] = [];
  const rival: LiderConcorrente = { nome: "Concorrente Desafiante (Injetado)", isMeEpp: false };

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
  const reacao = reagirRobo(itemComRival, params, estado.tempoRestante);
  const liderConcorrente = { ...estado.liderConcorrente, [itemId]: rival };
  if (reacao.evento) {
    seq++;
    novosEventos.push(criarEvento(seq, reacao.item, reacao.evento));
    liderConcorrente[itemId] = undefined;
  }

  const prorroga = estado.tempoRestante <= janela && params.modoDisputa === "ABERTO";
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

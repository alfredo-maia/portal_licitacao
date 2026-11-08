import {
  type DisputaConfig,
  type DisputaItemRegra,
  type TaticaDisputa,
  type TipoDecremento,
  round2,
} from "@/server/schemas/proposta-calculadora.schema";

export type PerfilConcorrenteVirtual = "CONSERVADOR" | "MODERADO" | "AGRESSIVO";

export type TipoDisparoLance =
  | "PROPOSTA_INICIAL"
  | "IMEDIATO"
  | "SNIPER"
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

  if (tipo === "CENTAVOS_1") {
    decrementoEfetivo = 0.01;
  } else if (tipo === "FIXO_REAIS") {
    decrementoEfetivo = Math.max(0.01, valorDecrementoConfig || 1.0);
  } else if (tipo === "PERCENTUAL") {
    const perc = Math.max(0.01, valorDecrementoConfig || 0.5);
    decrementoEfetivo = round2(valorAtual * (perc / 100));
    if (decrementoEfetivo < 0.01) decrementoEfetivo = 0.01;
  }

  const valorCalculado = round2(valorAtual - decrementoEfetivo);

  if (valorCalculado < pisoSeguro) {
    return {
      novoValor: pisoSeguro,
      pisoAtingido: true,
    };
  }

  return {
    novoValor: valorCalculado,
    pisoAtingido: false,
  };
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

  // Determinar o menor lance de referência a ser superado
  const baseReferencia =
    item.melhorLanceSala != null && item.melhorLanceSala > 0
      ? item.melhorLanceSala
      : item.propostaUnitaria;

  // Se a melhor oferta da sala já estiver no nosso piso ou abaixo, trava inviolável
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

  // Se após o decremento o valor for menor que o piso, trava no piso
  if (novoValor < item.pisoUnitarioSeguro) {
    return {
      tipo: "BLOQUEADO_PISO_SEGURO",
      deveDisparar: false,
      pisoAtingido: true,
      motivo: `Próximo lance calculado (R$ ${novoValor.toFixed(2)}) violaria o Piso Seguro de R$ ${item.pisoUnitarioSeguro.toFixed(2)}. Lance bloqueado.`,
    };
  }

  // Se já está exatamente no piso seguro e o líder também está no mesmo valor
  if (novoValor === baseReferencia) {
    return {
      tipo: "BLOQUEADO_PISO_SEGURO",
      deveDisparar: false,
      pisoAtingido: true,
      motivo: "Piso Seguro alcançado. Impossível cobrir sem operar com margem negativa.",
    };
  }

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

  // Lance sugerido de desempate: R$ 0,01 abaixo do líder
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

const NOMES_CONCORRENTES = [
  "Tech Distribuidora Ltda",
  "Alfa Informática & Suprimentos",
  "Prime Soluções Governamentais ME",
  "Brasil Comércio de Tecnologia Eireli",
  "Mega Corp Logística e Serviços",
  "Delta Sistemas Corporativos",
];

/**
 * Simula a atuação autônoma de um concorrente virtual para movimentar o pregão.
 */
export function simularLanceConcorrente(
  item: DisputaItemRegra,
  perfil: PerfilConcorrenteVirtual,
  tempoRestanteSegundos: number,
  rodadaIndex: number = 1,
): LanceDisputaEvento | null {
  const melhorAtual = item.melhorLanceSala || item.propostaUnitaria;

  // Piso estimado do concorrente para evitar lances irrealistas (geralmente 70% a 85% do estimado)
  const pisoEstimadoConcorrente = round2(melhorAtual * 0.88);

  // Concorrente agressivo atua com mais facilidade; conservador desiste mais cedo
  let probabilidadeLance = 0.5;
  let valorDesconto = 0.01;

  if (perfil === "AGRESSIVO") {
    probabilidadeLance = 0.75;
    valorDesconto = round2(Math.max(0.5, melhorAtual * 0.01));
  } else if (perfil === "MODERADO") {
    probabilidadeLance = 0.5;
    valorDesconto = round2(Math.max(0.01, melhorAtual * 0.003));
  } else {
    // CONSERVADOR
    probabilidadeLance = 0.3;
    valorDesconto = 0.01;
  }

  const sorteio = Math.random();
  if (sorteio > probabilidadeLance) {
    return null;
  }

  const novoValor = round2(melhorAtual - valorDesconto);
  if (novoValor < pisoEstimadoConcorrente || novoValor <= 0) {
    return null;
  }

  const nomeConcorrente =
    NOMES_CONCORRENTES[rodadaIndex % NOMES_CONCORRENTES.length];
  const isMe = nomeConcorrente.includes("ME") || nomeConcorrente.includes("Eireli");

  return {
    id: `lance-conc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    itemId: item.itemId,
    numeroItem: item.numeroItem,
    autorNome: nomeConcorrente,
    isMinhaEmpresa: false,
    isMeEpp: isMe,
    valorUnitario: novoValor,
    valorTotal: round2(novoValor * (item.quantidade || 1)),
    timestamp: Date.now(),
    tempoRestanteSegundos,
    tipoDisparo: "CONCORRENTE",
    mensagem: `Concorrente ${nomeConcorrente} cobriu a oferta com R$ ${novoValor.toFixed(2)}.`,
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


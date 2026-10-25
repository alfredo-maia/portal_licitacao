/**
 * Conjunto inicial realista de licitações para a Central de Oportunidades
 * (sprint-1-spec §2.3 — "Dados Iniciais / Fallback Resiliente"): mínimo de
 * 4 certames cobrindo pareceres `GO`, `AVALIAR` e `NO_GO`, UFs e faixas de
 * valor distintas e os tipos `EDUCACAO_PORTAL`, `SAUDE_ATENCAO_BASICA`,
 * `GESTAO_PUBLICA_ERP` e `INFRA_CLOUD_SUPORTE`.
 *
 * As datas são geradas dinamicamente a partir do momento da execução para que
 * a tela `/oportunidades` renderize dados sempre atuais, tanto no PostgreSQL
 * (via `seedLicitacoesIniciais()` em `prisma/seed.ts`) quanto no fallback em
 * memória dos testes automatizados.
 */

export interface LicitacaoSeedItem {
  idPncp: string;
  numeroEdital: string;
  orgaoNome: string;
  orgaoCnpj: string;
  uf: string;
  municipio: string;
  esfera: string;
  poder: string;
  modalidade: string;
  portalDisputa: string | null;
  miniResumo: string;
  resumo: string;
  valorEstimado: number;
  dataAbertura: Date;
  dataEncerramentoProposta?: Date | null;
  dataPublicacaoPncp: Date;
  status: "PENDENTE";
  parecerIA: "GO" | "AVALIAR" | "NO_GO";
  justificativaIA: string;
  tipoSistemaCodigo: string;
  quantidadeLotes: number;
  loteUnico: boolean;
  precoPorLote: boolean;
  isPresencial: boolean;
  distanciaGoianiaKm: number | null;
  linkPncp: string;
}

const DIA_EM_MS = 24 * 60 * 60 * 1000;

export function buildLicitacoesSeed(
  agora: Date = new Date(),
): readonly LicitacaoSeedItem[] {
  if (process.env.DISABLE_SEED_LICITACOES === "true" || process.env.NODE_ENV === "production") {
    return [];
  }

  const base = agora.getTime();

  return [
    {
      idPncp: "SEED-EDUC-GO-001",
      numeroEdital: "001/2026-SEDUC-GO",
      orgaoNome: "Secretaria de Estado da Educação de Goiás",
      orgaoCnpj: "01.603.428/0001-09",
      uf: "GO",
      municipio: "Goiânia",
      esfera: "ESTADUAL",
      poder: "EXECUTIVO",
      modalidade: "Pregão Eletrônico",
      portalDisputa: "ComprasNet",
      miniResumo: "Portal de Educação estadual",
      resumo:
        "Contratação de empresa especializada para desenvolvimento e sustentação de portal de educação com gestão escolar, matrícula on-line, diário de classe e módulo de merenda para a rede estadual de ensino de Goiás.",
      valorEstimado: 480_000,
      dataAbertura: new Date(base + 3 * DIA_EM_MS),
      dataPublicacaoPncp: new Date(base - 4 * DIA_EM_MS),
      status: "PENDENTE",
      parecerIA: "GO",
      justificativaIA:
        "Stack aderente ao portfólio, valor dentro da faixa-alvo e órgão estadual com histórico de adimplência.",
      tipoSistemaCodigo: "EDUCACAO_PORTAL",
      quantidadeLotes: 1,
      loteUnico: true,
      precoPorLote: false,
      isPresencial: false,
      distanciaGoianiaKm: 0,
      linkPncp: "https://pncp.gov.br/app/editais/seed-educ-go-001",
    },
    {
      idPncp: "SEED-SAUDE-SP-002",
      numeroEdital: "014/2026-SMS-CAMPINAS",
      orgaoNome: "Secretaria Municipal de Saúde de Campinas",
      orgaoCnpj: "45.862.968/0001-66",
      uf: "SP",
      municipio: "Campinas",
      esfera: "MUNICIPAL",
      poder: "EXECUTIVO",
      modalidade: "Pregão Eletrônico",
      portalDisputa: "BLL (Bolsa de Licitações)",
      miniResumo: "Prontuário eletrônico UBS",
      resumo:
        "Aquisição de sistema de prontuário eletrônico do cidadão para unidades básicas de saúde, incluindo regulação de consultas, agendamento integrado e interoperabilidade com o e-SUS APS.",
      valorEstimado: 1_250_000,
      dataAbertura: new Date(base + 7 * DIA_EM_MS),
      dataPublicacaoPncp: new Date(base - 2 * DIA_EM_MS),
      status: "PENDENTE",
      parecerIA: "AVALIAR",
      justificativaIA:
        "Aderência funcional alta, porém exige atestado de capacidade técnica em saúde municipal de porte similar.",
      tipoSistemaCodigo: "SAUDE_ATENCAO_BASICA",
      quantidadeLotes: 2,
      loteUnico: false,
      precoPorLote: true,
      isPresencial: false,
      distanciaGoianiaKm: 854,
      linkPncp: "https://pncp.gov.br/app/editais/seed-saude-sp-002",
    },
    {
      idPncp: "SEED-ERP-DF-003",
      numeroEdital: "029/2026-SEC-DF",
      orgaoNome: "Secretaria de Economia do Distrito Federal",
      orgaoCnpj: "00.394.547/0001-22",
      uf: "DF",
      municipio: "Brasília",
      esfera: "ESTADUAL",
      poder: "EXECUTIVO",
      modalidade: "Concorrência",
      portalDisputa: null,
      miniResumo: "ERP municipal completo",
      resumo:
        "Contratação de solução integrada de gestão pública (ERP) contemplando módulos contábil, orçamentário, tesouraria, compras, almoxarifado, patrimônio e folha de pagamento para administração direta e indireta do Distrito Federal.",
      valorEstimado: 3_800_000,
      dataAbertura: new Date(base + 12 * DIA_EM_MS),
      dataPublicacaoPncp: new Date(base - 1 * DIA_EM_MS),
      status: "PENDENTE",
      parecerIA: "NO_GO",
      justificativaIA:
        "Exigência de atestados em três entes federativos de porte equivalente e presença de disputa presencial elevam o risco de execução.",
      tipoSistemaCodigo: "GESTAO_PUBLICA_ERP",
      quantidadeLotes: 1,
      loteUnico: true,
      precoPorLote: false,
      isPresencial: true,
      distanciaGoianiaKm: 209,
      linkPncp: "https://pncp.gov.br/app/editais/seed-erp-df-003",
    },
    {
      idPncp: "SEED-INFRA-MG-004",
      numeroEdital: "077/2026-PRODEMGE",
      orgaoNome: "Companhia de Tecnologia da Informação do Estado de Minas Gerais",
      orgaoCnpj: "17.274.698/0001-05",
      uf: "MG",
      municipio: "Belo Horizonte",
      esfera: "ESTADUAL",
      poder: "EXECUTIVO",
      modalidade: "Pregão Eletrônico",
      portalDisputa: "Portal de Compras MG",
      miniResumo: "Suporte NOC e cloud",
      resumo:
        "Contratação de serviços continuados de sustentação de infraestrutura de TI, incluindo NOC 24x7, administração de ambiente de nuvem pública, datacenter e suporte técnico de campo para órgãos do Poder Executivo mineiro.",
      valorEstimado: 690_000,
      dataAbertura: new Date(base + 20 * DIA_EM_MS),
      dataPublicacaoPncp: new Date(base - 6 * DIA_EM_MS),
      status: "PENDENTE",
      parecerIA: "GO",
      justificativaIA:
        "Serviço continuado aderente à operação atual, SLA compatível e possibilidade de alocação remota da equipe.",
      tipoSistemaCodigo: "INFRA_CLOUD_SUPORTE",
      quantidadeLotes: 3,
      loteUnico: false,
      precoPorLote: true,
      isPresencial: false,
      distanciaGoianiaKm: 666,
      linkPncp: "https://pncp.gov.br/app/editais/seed-infra-mg-004",
    },
  ] as const;
}

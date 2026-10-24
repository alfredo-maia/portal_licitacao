/**
 * Catálogo canônico dos 22 Tipos de Sistema padronizados (PRD §5.1 / sprint-1-spec §2.1).
 *
 * Fonte única da verdade para a classificação das licitações em todo o portal:
 * o campo `tipoSistema` é sugerido pela esteira de IA na triagem e refinado pela
 * equipe comercial, sempre restrito a este vocabulário controlado (ordem 1 a 22,
 * de `SISTEMA_NOVO` a `OUTROS`).
 */

export interface TipoSistemaCatalogEntry {
  readonly ordem: number;
  readonly codigo: string;
  readonly nome: string;
}

export const TIPOS_SISTEMA_CATALOG = [
  {
    ordem: 1,
    codigo: "SISTEMA_NOVO",
    nome: "Sistema Novo (Desenvolvimento Sob Medida / Fábrica de Software)",
  },
  {
    ordem: 2,
    codigo: "GESTAO_PUBLICA_ERP",
    nome: "Gestão Pública (ERP Municipal / Administrativo Completo)",
  },
  {
    ordem: 3,
    codigo: "EDUCACAO_PORTAL",
    nome: "Portal de Educação (Gestão Escolar, Matrícula, Diário, Merenda)",
  },
  {
    ordem: 4,
    codigo: "SAUDE_ATENCAO_BASICA",
    nome: "Saúde (Atenção Básica, UBS, Prontuário Eletrônico, Regulação)",
  },
  {
    ordem: 5,
    codigo: "HOSPITALAR",
    nome: "Hospitalar (Gestão Hospitalar, UTI, Emergência, Leitos)",
  },
  {
    ordem: 6,
    codigo: "CONTABIL_ORCAMENTARIO",
    nome: "Contábil / Financeiro / Orçamentário / Tesouraria",
  },
  {
    ordem: 7,
    codigo: "ASSISTENCIA_SOCIAL",
    nome: "Assistência Social (CRAS, CREAS, Cadastro de Benefícios)",
  },
  {
    ordem: 8,
    codigo: "GOVERNANCA_CORPORATIVA",
    nome: "Governança Corporativa / Auditoria / Gestão Estratégica",
  },
  {
    ordem: 9,
    codigo: "RH_FOLHA",
    nome: "RH / Gestão de Pessoas / Folha de Pagamento",
  },
  {
    ordem: 10,
    codigo: "BANCARIO_FINANCEIRO",
    nome: "Bancário / Operações Financeiras / Conciliação Bancária",
  },
  {
    ordem: 11,
    codigo: "TRIBUTARIO_ARRECADACAO",
    nome: "Tributário / Arrecadação (IPTU, ISS, Nota Fiscal Eletrônica NFS-e)",
  },
  {
    ordem: 12,
    codigo: "PROTOCOLO_PROCESSO_ELETRONICO",
    nome: "Protocolo, Gestão Documental e Processo Administrativo Eletrônico",
  },
  {
    ordem: 13,
    codigo: "PATRIMONIO_ALMOXARIFADO_FROTA",
    nome: "Almoxarifado, Controle Patrimonial e Gestão de Frotas",
  },
  {
    ordem: 14,
    codigo: "TRANSPARENCIA_OUVIDORIA",
    nome: "Portal da Transparência / Ouvidoria / e-SIC",
  },
  {
    ordem: 15,
    codigo: "PREVIDENCIA_RPPS",
    nome: "Previdência e Gestão de Regime Próprio (RPPS)",
  },
  {
    ordem: 16,
    codigo: "SANEAMENTO_AGUA_ESGOTO",
    nome: "Saneamento Básico, Comercial e Faturamento de Água e Esgoto",
  },
  {
    ordem: 17,
    codigo: "URBANISMO_LICENCIAMENTO",
    nome: "Urbanismo, Obras, Alvará e Licenciamento Eletrônico",
  },
  {
    ordem: 18,
    codigo: "BI_ANALYTICS_DADOS",
    nome: "Business Intelligence (BI), Ciência de Dados e Dashboards",
  },
  {
    ordem: 19,
    codigo: "INFRA_CLOUD_SUPORTE",
    nome: "Infraestrutura de TI, Nuvem, Datacenter, NOC e Suporte Técnico",
  },
  {
    ordem: 20,
    codigo: "LICENCA_SOFTWARE",
    nome: "Compra e Renovação de Licenças de Software",
  },
  {
    ordem: 21,
    codigo: "IMOBILIARIO",
    nome: "Imobiliário (Gestão e Regularização de Bens e Terras Públicas)",
  },
  {
    ordem: 22,
    codigo: "OUTROS",
    nome: "Outros (Campo livre para novas especialidades de software)",
  },
] as const satisfies readonly TipoSistemaCatalogEntry[];

/** União estrita dos 22 códigos padronizados (PRD §5.1). */
export type TipoSistemaCodigo =
  (typeof TIPOS_SISTEMA_CATALOG)[number]["codigo"];

/** Tupla não vazia dos 22 códigos, na ordem canônica 1..22 (contrato para `z.enum`). */
export const TIPOS_SISTEMA_CODIGOS = TIPOS_SISTEMA_CATALOG.map(
  (tipo) => tipo.codigo,
) as [TipoSistemaCodigo, ...TipoSistemaCodigo[]];

/** Código fallback para valores vazios ou desconhecidos vindos de sistemas externos. */
export const TIPO_SISTEMA_FALLBACK: TipoSistemaCodigo = "OUTROS";

const catalogByCodigo: ReadonlyMap<
  string,
  (typeof TIPOS_SISTEMA_CATALOG)[number]
> = new Map(TIPOS_SISTEMA_CATALOG.map((tipo) => [tipo.codigo, tipo]));

/** Type guard: verifica se `value` é um dos 22 códigos padronizados. */
export function isTipoSistemaCodigo(
  value: unknown,
): value is TipoSistemaCodigo {
  return typeof value === "string" && catalogByCodigo.has(value);
}

/** Retorna a entrada completa do catálogo para um código válido. */
export function getTipoSistema(
  codigo: TipoSistemaCodigo,
): (typeof TIPOS_SISTEMA_CATALOG)[number] | undefined {
  return catalogByCodigo.get(codigo);
}

/** Retorna o nome de exibição do tipo; para códigos válidos nunca retorna vazio. */
export function getTipoSistemaNome(codigo: TipoSistemaCodigo): string {
  return catalogByCodigo.get(codigo)?.nome ?? codigo;
}

/** Lista os tipos na ordem canônica 1..22 (cópia defensiva imutável por contrato). */
export function listTiposSistema(): readonly TipoSistemaCatalogEntry[] {
  return TIPOS_SISTEMA_CATALOG;
}

/**
 * Normalização resiliente de códigos vindos de sistemas externos (esteira PNCP):
 * aplica trim, uppercase e converte espaços/hífens em underscore; valores vazios,
 * não textuais ou desconhecidos caem no fallback `OUTROS` (sprint-1-spec §2.2).
 */
export function normalizarTipoSistemaCodigo(
  value: unknown,
  fallback: TipoSistemaCodigo = TIPO_SISTEMA_FALLBACK,
): TipoSistemaCodigo {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  return isTipoSistemaCodigo(normalized) ? normalized : fallback;
}

/* ------------------------------------------------------------------------- */
/* Asserções de contrato em tempo de compilação (não emitem código)           */
/* ------------------------------------------------------------------------- */

type Expect<T extends true> = T;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

/** O catálogo deve conter exatamente 22 tipos (PRD §5.1). */
export type _CatalogoDeveTer22Tipos = Expect<
  Equal<(typeof TIPOS_SISTEMA_CATALOG)["length"], 22>
>;

/** O primeiro código deve ser SISTEMA_NOVO e o último OUTROS (ordem 1..22). */
export type _PrimeiroCodigoDeveSerSistemaNovo = Expect<
  Equal<(typeof TIPOS_SISTEMA_CATALOG)[0]["codigo"], "SISTEMA_NOVO">
>;
export type _UltimoCodigoDeveSerOutros = Expect<
  Equal<(typeof TIPOS_SISTEMA_CATALOG)[21]["codigo"], "OUTROS">
>;

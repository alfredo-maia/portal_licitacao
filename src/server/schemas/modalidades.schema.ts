import { z } from "zod";

/**
 * Catálogo Oficial de Modalidades PNCP (Lei 14.133/2021)
 * PRD §9.1 e Plano Mestre de Transição SaaS Multi-Tenant §9.1
 */

export const CODIGO_MODALIDADE_PNCP = {
  LEILAO_ELETRONICO: 1,
  DIALOGO_COMPETITIVO: 2,
  CONCURSO: 3,
  CONCORRENCIA_PRESENCIAL: 4,
  CONCORRENCIA_ELETRONICA: 5,
  PREGAO_ELETRONICO: 6,
  PREGAO_PRESENCIAL: 7,
  DISPENSA_LICITACAO: 8,
  INEXIGIBILIDADE: 9,
} as const;

export interface ModalidadeDef {
  codigo: number;
  slug: string;
  nome: string;
  descricao: string;
  relevanciaMercado: string;
}

export const CATALOGO_MODALIDADES: Record<number, ModalidadeDef> = {
  [CODIGO_MODALIDADE_PNCP.PREGAO_ELETRONICO]: {
    codigo: 6,
    slug: "pregao-eletronico",
    nome: "Pregão Eletrônico",
    descricao: "Modalidade obrigatória para bens e serviços comuns, caracterizada por disputa de lances",
    relevanciaMercado: "~60% do volume financeiro licitado no Brasil",
  },
  [CODIGO_MODALIDADE_PNCP.DISPENSA_LICITACAO]: {
    codigo: 8,
    slug: "dispensa-eletronica",
    nome: "Dispensa de Licitação (Compra Direta)",
    descricao: "Contratações ágeis (limites da Lei 14.133 até R$ 59,9k compras/serviços e R$ 119,8k obras)",
    relevanciaMercado: "~40% do volume diário de editais publicados",
  },
  [CODIGO_MODALIDADE_PNCP.CONCORRENCIA_ELETRONICA]: {
    codigo: 5,
    slug: "concorrencia-eletronica",
    nome: "Concorrência Eletrônica",
    descricao: "Grandes obras, concessões e projetos de engenharia complexos com critérios de técnica e preço",
    relevanciaMercado: "Alto valor contratual e grandes contratos governamentais",
  },
  [CODIGO_MODALIDADE_PNCP.INEXIGIBILIDADE]: {
    codigo: 9,
    slug: "inexigibilidade",
    nome: "Inexigibilidade de Licitação",
    descricao: "Inviabilidade de competição, credenciamentos e serviços técnicos especializados de natureza singular",
    relevanciaMercado: "Fornecedores exclusivos e credenciamentos de saúde/serviços",
  },
  [CODIGO_MODALIDADE_PNCP.LEILAO_ELETRONICO]: {
    codigo: 1,
    slug: "leilao-eletronico",
    nome: "Leilão Eletrônico",
    descricao: "Alienação de bens móveis inservíveis, veículos, sucatas e imóveis da administração",
    relevanciaMercado: "Desimobilização e alienação de ativos públicos",
  },
};

export const modalidadePncpSchema = z.object({
  codigo: z.number().int().positive(),
  nome: z.string().min(1),
  slug: z.string().optional(),
});

export type ModalidadePncp = z.infer<typeof modalidadePncpSchema>;

/**
 * Normaliza qualquer string ou número de modalidade vinda do PNCP ou de sistemas legados
 * para o nome canônico e código numérico oficial da Lei 14.133/2021.
 */
export function normalizarModalidade(input: string | number | null | undefined): {
  codigo: number;
  nome: string;
} {
  if (typeof input === "number") {
    const found = CATALOGO_MODALIDADES[input];
    if (found) {
      return { codigo: found.codigo, nome: found.nome };
    }
    return { codigo: input, nome: `Modalidade ${input}` };
  }

  const str = String(input || "").trim().toLowerCase();

  if (str.includes("pregão") || str.includes("pregao")) {
    return {
      codigo: CODIGO_MODALIDADE_PNCP.PREGAO_ELETRONICO,
      nome: CATALOGO_MODALIDADES[CODIGO_MODALIDADE_PNCP.PREGAO_ELETRONICO].nome,
    };
  }

  if (str.includes("dispensa") || str.includes("compra direta") || str.includes("cotação eletrônica")) {
    return {
      codigo: CODIGO_MODALIDADE_PNCP.DISPENSA_LICITACAO,
      nome: CATALOGO_MODALIDADES[CODIGO_MODALIDADE_PNCP.DISPENSA_LICITACAO].nome,
    };
  }

  if (str.includes("concorrência") || str.includes("concorrencia")) {
    return {
      codigo: CODIGO_MODALIDADE_PNCP.CONCORRENCIA_ELETRONICA,
      nome: CATALOGO_MODALIDADES[CODIGO_MODALIDADE_PNCP.CONCORRENCIA_ELETRONICA].nome,
    };
  }

  if (str.includes("inexigibilidade") || str.includes("inexigível")) {
    return {
      codigo: CODIGO_MODALIDADE_PNCP.INEXIGIBILIDADE,
      nome: CATALOGO_MODALIDADES[CODIGO_MODALIDADE_PNCP.INEXIGIBILIDADE].nome,
    };
  }

  if (str.includes("leilão") || str.includes("leilao")) {
    return {
      codigo: CODIGO_MODALIDADE_PNCP.LEILAO_ELETRONICO,
      nome: CATALOGO_MODALIDADES[CODIGO_MODALIDADE_PNCP.LEILAO_ELETRONICO].nome,
    };
  }

  // Fallback padrão se não identificado: Pregão Eletrônico
  return {
    codigo: CODIGO_MODALIDADE_PNCP.PREGAO_ELETRONICO,
    nome: "Pregão Eletrônico",
  };
}

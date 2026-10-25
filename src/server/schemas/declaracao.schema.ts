import { z } from "zod";

/**
 * Contrato dos 8 Modelos Oficiais de Declaração (PRD §4.7 / Anexo 5 / Lei 14.133/2021).
 */
export const DECLARACAO_TIPOS = [
  "CARTA_CREDENCIAMENTO",
  "ELABORACAO_INDEPENDENTE",
  "INEXISTENCIA_FATOS_IMPEDITIVOS",
  "NAO_TRABALHO_FORCADO",
  "RENUNCIA_VISTORIA",
  "HABILITACAO_PLENA",
  "ME_EPP",
  "NAO_EMPREGA_MENOR",
] as const;

export const declaracaoTipoSchema = z.enum(DECLARACAO_TIPOS);
export type DeclaracaoTipo = z.infer<typeof declaracaoTipoSchema>;

export const DECLARACAO_METADATA: Record<
  DeclaracaoTipo,
  {
    codigo: DeclaracaoTipo;
    titulo: string;
    fundamentoLegal: string;
    descricao: string;
  }
> = {
  CARTA_CREDENCIAMENTO: {
    codigo: "CARTA_CREDENCIAMENTO",
    titulo: "Carta de Credenciamento de Representante Legal / Procurador",
    fundamentoLegal: "Art. 12 da Lei nº 14.133/2021",
    descricao: "Outorga poderes para representação da empresa licitante na sessão pública, oferta de lances e interposição de recursos.",
  },
  ELABORACAO_INDEPENDENTE: {
    codigo: "ELABORACAO_INDEPENDENTE",
    titulo: "Declaração de Elaboração Independente de Proposta",
    fundamentoLegal: "Art. 9º, III da Lei nº 14.133/2021",
    descricao: "Atesta que a proposta foi elaborada de maneira autônoma, sem conluio ou ajuste com concorrentes.",
  },
  INEXISTENCIA_FATOS_IMPEDITIVOS: {
    codigo: "INEXISTENCIA_FATOS_IMPEDITIVOS",
    titulo: "Declaração de Inexistência de Fatos Impeditivos e Idoneidade",
    fundamentoLegal: "Art. 14 e Art. 156 da Lei nº 14.133/2021",
    descricao: "Declara idoneidade e ausência de impedimento legal, suspensão temporária ou declaração de inidoneidade para licitar.",
  },
  NAO_TRABALHO_FORCADO: {
    codigo: "NAO_TRABALHO_FORCADO",
    titulo: "Declaração de Não Utilização de Trabalho Forçado e Degradante",
    fundamentoLegal: "Art. 63, IV da Lei nº 14.133/2021 e Convenções da OIT",
    descricao: "Certifica estrita observância aos direitos humanos e não exploração de trabalho análogo à escravidão.",
  },
  RENUNCIA_VISTORIA: {
    codigo: "RENUNCIA_VISTORIA",
    titulo: "Declaração de Renúncia de Vistoria Técnica Presencial",
    fundamentoLegal: "Art. 67, § 2º da Lei nº 14.133/2021",
    descricao: "Declara pleno conhecimento das condições locais e renúncia à visita técnica, assumindo riscos e ônus correlatos.",
  },
  HABILITACAO_PLENA: {
    codigo: "HABILITACAO_PLENA",
    titulo: "Declaração de Pleno Atendimento aos Requisitos de Habilitação",
    fundamentoLegal: "Art. 63, I da Lei nº 14.133/2021",
    descricao: "Assegura o cumprimento integral das exigências de habilitação jurídica, fiscal, técnica e econômico-financeira.",
  },
  ME_EPP: {
    codigo: "ME_EPP",
    titulo: "Declaração de Enquadramento como Microempresa ou EPP",
    fundamentoLegal: "Lei Complementar nº 123/2006 e Art. 4º da Lei nº 14.133/2021",
    descricao: "Declara direito aos benefícios de desempate e tratamento favorecido previstos para micro e pequenas empresas.",
  },
  NAO_EMPREGA_MENOR: {
    codigo: "NAO_EMPREGA_MENOR",
    titulo: "Declaração de Cumprimento do Art. 7º, XXXIII da CF/88 (Não Emprego de Menores)",
    fundamentoLegal: "Art. 7º, XXXIII da CF/88 e Art. 68, VI da Lei nº 14.133/2021",
    descricao: "Declara que não emprega menores de dezoito anos em trabalho noturno, perigoso ou insalubre, nem menores de dezesseis anos, salvo como aprendiz a partir dos 14.",
  },
};

export const declaracaoGerarInputSchema = z.object({
  tipo: declaracaoTipoSchema,
  licitacaoId: z.string().trim().optional(),
  numeroEdital: z.string().trim().min(1, "Número do edital é obrigatório"),
  orgaoNome: z.string().trim().min(2, "Nome do órgão é obrigatório"),
  objetoLicitacao: z.string().trim().optional(),
  empresaRazaoSocial: z.string().trim().min(2, "Razão social da empresa é obrigatória"),
  empresaCnpj: z.string().trim().min(14, "CNPJ da empresa é obrigatório"),
  empresaEndereco: z.string().trim().optional(),
  representanteNome: z.string().trim().min(2, "Nome do representante legal é obrigatório"),
  representanteCpf: z.string().trim().min(11, "CPF do representante é obrigatório"),
  representanteRg: z.string().trim().optional(),
  representanteCargo: z.string().trim().default("Representante Legal"),
  cidade: z.string().trim().default("Goiânia"),
  uf: z.string().trim().default("GO"),
  dataDeclaracao: z.string().trim().optional(),
});

export type DeclaracaoGerarInput = z.infer<typeof declaracaoGerarInputSchema>;

export const declaracaoGeradaResponseSchema = z.object({
  ok: z.literal(true),
  tipo: declaracaoTipoSchema,
  titulo: z.string(),
  fundamentoLegal: z.string(),
  conteudoHtml: z.string(),
  conteudoTexto: z.string(),
  dadosPreenchidos: declaracaoGerarInputSchema,
});

export type DeclaracaoGeradaResponse = z.infer<typeof declaracaoGeradaResponseSchema>;

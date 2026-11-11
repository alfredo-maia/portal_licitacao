import { z } from "zod";
import { ASAAS_PLAN_PRICES_BRL } from "@/server/schemas/asaas.schema";
import { WhatsAppEnvioSchema } from "@/server/schemas/whatsapp.schema";

export const AdminRoleEnum = z.enum([
  "SUPERADMIN_MASTER",
  "ADMIN_OPERACIONAL",
  "SUPORTE_N1",
]);
export type AdminRole = z.infer<typeof AdminRoleEnum>;

export interface AdminRouteItem {
  readonly id: string;
  readonly path: string;
  readonly label: string;
  readonly description: string;
}

export const ADMIN_ROUTES: readonly AdminRouteItem[] = [
  {
    id: "dashboard",
    path: "/admin",
    label: "Dashboard Executivo",
    description: "Pulso em tempo real de faturamento, trials, IA e vitórias.",
  },
  {
    id: "clientes",
    path: "/admin/clientes",
    label: "Clientes 360º",
    description: "Conta principal, CNPJs, usuários, licitações, trial e recursos.",
  },
  {
    id: "financeiro",
    path: "/admin/financeiro",
    label: "Financeiro & Planos",
    description: "Pagantes, inadimplentes, teste grátis, planos e cupons.",
  },
  {
    id: "afiliados",
    path: "/admin/afiliados",
    label: "Afiliados & Comissões",
    description: "Parceiros indicadores, links ?ref=, clientes indicados e repasses PIX.",
  },
  {
    id: "suporte",
    path: "/admin/suporte",
    label: "Suporte (Lista & Kanban)",
    description: "Tickets PROT-AAAAMM-XXXX em Lista e Quadro Kanban Drag-and-Drop.",
  },
  {
    id: "avisos",
    path: "/admin/avisos",
    label: "Avisos em Massa",
    description: "Disparo de notificações no sino global e banners de topo.",
  },
  {
    id: "whatsapp",
    path: "/admin/whatsapp",
    label: "WhatsApp & QR Code",
    description: "Conexão de instância Evolution API, QR Code, Jitter e fila.",
  },
  {
    id: "ia",
    path: "/admin/ia",
    label: "Consumo & Custos IA",
    description: "Gasto diário e mensal de tokens e reais por usuário e função.",
  },
  {
    id: "licitacoes",
    path: "/admin/licitacoes",
    label: "Licitações & PNCP",
    description: "Catálogo global, injeção manual na mão e sincronização PNCP.",
  },
  {
    id: "sistema",
    path: "/admin/sistema",
    label: "Equipe ADM & Logs",
    description: "Contas administrativas, permissões e auditoria de ações ADM.",
  },
] as const;

/**
 * Schema para solicitação de expansão de cota de armazenamento R2 com 1 clique (PRD §13 / ADR 0010)
 */
export const ExpansaoCotaStorageSchema = z.object({
  tenantId: z.string().min(1, "ID do Tenant é obrigatório"),
  adicionarMb: z.number().int().positive("Valor a adicionar em MB deve ser positivo"),
  motivo: z.string().optional().default("Expansão solicitada via Suporte / SuperAdmin"),
});

export type ExpansaoCotaStorageInput = z.infer<typeof ExpansaoCotaStorageSchema>;

export const OnboardingChecklistSchema = z.object({
  contaCriada: z.boolean(),
  cnpjCadastrado: z.boolean(),
  filtrosConfigurados: z.boolean(),
  empresaPreenchida: z.boolean(),
  documentoCofreEnviado: z.boolean(),
  licitacaoNoKanban: z.boolean(),
  iaOuCalculadoraUsada: z.boolean(),
  score: z.number().int().min(0).max(7),
  percentual: z.number().int().min(0).max(100),
  statusEngajamento: z.enum(["CADASTROU_E_SAIU", "EM_CONFIGURACAO", "ENGAJADO"]),
});
export type OnboardingChecklist = z.infer<typeof OnboardingChecklistSchema>;

/**
 * Métricas consolidadas do Backoffice Executivo SuperAdmin
 */
export const SuperAdminMetricsSchema = z.object({
  mrrEstimado: z.number().nonnegative(),
  arrEstimado: z.number().nonnegative().optional().default(0),
  receitaEmRisco: z.number().nonnegative().optional().default(0),
  totalTenants: z.number().int().nonnegative(),
  tenantsAtivos: z.number().int().nonnegative(),
  tenantsTrial: z.number().int().nonnegative(),
  tenantsGracePeriod: z.number().int().nonnegative(),
  tenantsBloqueados: z.number().int().nonnegative(),
  tenantsCancelados: z.number().int().nonnegative().optional().default(0),
  novosClientesHoje: z.number().int().nonnegative().optional().default(0),
  novosClientes7d: z.number().int().nonnegative().optional().default(0),
  novosClientes30d: z.number().int().nonnegative().optional().default(0),
  trialsAbandonados: z.number().int().nonnegative().optional().default(0),
  trialsEngajados: z.number().int().nonnegative().optional().default(0),
  totalVolumeArrematado: z.number().nonnegative(),
  totalLicitacoesContempladas: z.number().int().nonnegative(),
  r2StorageTotalMb: z.number().nonnegative(),
  whatsappFilaPendentes: z.number().int().nonnegative(),
  whatsappInstanciaConectada: z.boolean(),
  gastoIaHojeBrl: z.number().nonnegative().optional().default(0),
  gastoIaMesBrl: z.number().nonnegative().optional().default(0),
  tokensIaHoje: z.number().int().nonnegative().optional().default(0),
  chamadasIaHoje: z.number().int().nonnegative().optional().default(0),
  ticketsAbertos: z.number().int().nonnegative().optional().default(0),
  comissoesPendentesBrl: z.number().nonnegative().optional().default(0),
  ultimaColetaStatus: z.string().optional().default("CONCLUIDO"),
  ultimaColetaEm: z.string().nullable().optional(),
  periodoMes: z.number().int().min(1).max(12).optional(),
  periodoAno: z.number().int().min(2020).max(2100).optional(),
  ultimasVitorias: z
    .array(
      z.object({
        id: z.string(),
        tenantId: z.string(),
        razaoSocial: z.string(),
        numeroEdital: z.string(),
        orgaoNome: z.string(),
        valorArrematado: z.number(),
        data: z.string(),
      }),
    )
    .optional()
    .default([]),
});

export type SuperAdminMetrics = z.input<typeof SuperAdminMetricsSchema>;

/**
 * Item individual de Tenant na tabela de gestão do SuperAdmin
 */
export const SuperAdminTenantItemSchema = z.object({
  id: z.string(),
  cnpj: z.string(),
  razaoSocial: z.string(),
  nomeFantasia: z.string().optional().nullable(),
  plano: z.string(),
  billingStatus: z.enum(["TRIAL", "ATIVO", "GRACE_PERIOD", "BLOQUEADO", "CANCELADO"]),
  diasRestantesTrial: z.number().int(),
  diasAtraso: z.number().int(),
  cotaBaseMb: z.number(),
  cotaExtraMb: z.number(),
  cotaTotalMb: z.number(),
  espacoUsadoMb: z.number(),
  percentualUsado: z.number(),
  volumeArrematado: z.number(),
  totalContempladas: z.number().int(),
  criadoEm: z.date(),
  // Campos expandidos Issue #49
  ativo: z.boolean().optional().default(true),
  titularUserId: z.string().nullable().optional(),
  titularNome: z.string().nullable().optional(),
  titularEmail: z.string().nullable().optional(),
  telefone: z.string().nullable().optional(),
  uf: z.string().nullable().optional(),
  cidade: z.string().nullable().optional(),
  segmentos: z.array(z.string()).optional().default([]),
  maxCnpjs: z.number().int().optional().default(1),
  maxUsers: z.number().int().optional().default(1),
  totalUsuarios: z.number().int().optional().default(1),
  totalLicitacoesKanban: z.number().int().optional().default(0),
  totalDocumentosCofre: z.number().int().optional().default(0),
  aiExtraQuotaMes: z.number().int().optional().default(0),
  aiUsadasMes: z.number().int().optional().default(0),
  gastoIaDiaBrl: z.number().optional().default(0),
  gastoIaMesBrl: z.number().optional().default(0),
  valorMensalidade: z.number().optional().default(ASAAS_PLAN_PRICES_BRL.PRO),
  vencimentoAssinatura: z.date().nullable().optional(),
  ultimoPagamentoEm: z.date().nullable().optional(),
  trialFim: z.date().nullable().optional(),
  ultimaAtividadeEm: z.date().nullable().optional(),
  affiliateId: z.string().nullable().optional(),
  affiliateNome: z.string().nullable().optional(),
  cupomCodigo: z.string().nullable().optional(),
  notasInternasAdm: z.string().nullable().optional(),
  onboarding: OnboardingChecklistSchema.optional(),
  qtdCnpjs: z.number().int().min(1).optional().default(1),
  cnpjsAdicionaisCount: z.number().int().min(0).optional().default(0),
  cnpjsVinculados: z
    .array(
      z.object({
        id: z.string(),
        cnpj: z.string(),
        razaoSocial: z.string(),
        nomeFantasia: z.string().nullable().optional(),
      }),
    )
    .optional()
    .default([]),
  subCnpjEncontrado: z
    .object({
      id: z.string(),
      cnpj: z.string(),
      razaoSocial: z.string(),
    })
    .nullable()
    .optional()
    .default(null),
});

export type SuperAdminTenantItem = z.input<typeof SuperAdminTenantItemSchema>;

/* =========================================================================
   Clientes 360º & Mutações "Deus ex Machina" (Issue #49)
========================================================================= */

export const AdminUpdateContaPrincipalSchema = z.object({
  userId: z.string().min(1),
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  cpf: z.string().nullable().optional(),
  telefone: z.string().nullable().optional(),
  cep: z.string().nullable().optional(),
  logradouro: z.string().nullable().optional(),
  numero: z.string().nullable().optional(),
  bairro: z.string().nullable().optional(),
  cidade: z.string().nullable().optional(),
  uf: z.string().nullable().optional(),
  ativo: z.boolean().optional(),
  forcarLogout: z.boolean().optional(),
  dispararResetSenha: z.boolean().optional(),
  notasInternasAdm: z.string().nullable().optional(),
});
export type AdminUpdateContaPrincipalInput = z.infer<
  typeof AdminUpdateContaPrincipalSchema
>;

export const AdminUpsertEmpresaClienteSchema = z.object({
  tenantId: z.string().optional(),
  ownerUserId: z.string().nullable().optional(),
  cnpj: z.string().min(11),
  razaoSocial: z.string().min(2),
  nomeFantasia: z.string().nullable().optional(),
  cnaePrincipal: z.string().nullable().optional(),
  cnaesSecundarios: z.array(z.string()).optional(),
  endereco: z.string().nullable().optional(),
  cidade: z.string().nullable().optional(),
  uf: z.string().nullable().optional(),
  telefone: z.string().nullable().optional(),
  segmentos: z.array(z.string()).optional(),
  ufs: z.array(z.string()).optional(),
  brasilInteiro: z.boolean().optional(),
  plano: z.enum(["BASICO", "PRO", "ENTERPRISE"]).optional(),
  billingStatus: z
    .enum(["TRIAL", "ATIVO", "GRACE_PERIOD", "BLOQUEADO", "CANCELADO"])
    .optional(),
  ativo: z.boolean().optional(),
  inscricaoEstadual: z.string().nullable().optional(),
  inscricaoMunicipal: z.string().nullable().optional(),
  representanteNome: z.string().nullable().optional(),
  representanteCpf: z.string().nullable().optional(),
  representanteRg: z.string().nullable().optional(),
  representanteCargo: z.string().nullable().optional(),
  bancoNome: z.string().nullable().optional(),
  agencia: z.string().nullable().optional(),
  contaCorrente: z.string().nullable().optional(),
  chavePix: z.string().nullable().optional(),
});
export type AdminUpsertEmpresaClienteInput = z.infer<
  typeof AdminUpsertEmpresaClienteSchema
>;

export const AdminUpsertUsuarioClienteSchema = z.object({
  userId: z.string().optional(),
  tenantId: z.string().min(1),
  name: z.string().min(2),
  email: z.string().email(),
  cpf: z.string().nullable().optional(),
  telefone: z.string().nullable().optional(),
  role: z.enum(["DIRETORIA", "ANALISTA_COMERCIAL", "OPERADOR"]).default("ANALISTA_COMERCIAL"),
  tenantRole: z.enum(["TITULAR", "MEMBRO", "CONSULTOR"]).default("MEMBRO"),
  ativo: z.boolean().default(true),
  dispararResetSenha: z.boolean().optional(),
});
export type AdminUpsertUsuarioClienteInput = z.infer<
  typeof AdminUpsertUsuarioClienteSchema
>;

export const AdminUpdateCotasClienteSchema = z.object({
  tenantId: z.string().min(1),
  maxCnpjs: z.number().int().min(1).max(100).optional(),
  maxUsers: z.number().int().min(1).max(200).optional(),
  storageExtraQuotaMb: z.number().int().min(0).optional(),
  adicionarStorageMb: z.number().int().optional(),
  aiExtraQuotaMes: z.number().int().min(0).optional(),
  adicionarAiQuota: z.number().int().optional(),
  resetarTravaIaLicitacaoId: z.string().optional(),
});
export type AdminUpdateCotasClienteInput = z.infer<
  typeof AdminUpdateCotasClienteSchema
>;

/* =========================================================================
   Financeiro, Planos & Cupons (/admin/financeiro)
========================================================================= */

export const TenantInvoicePaymentMethodEnum = z.enum(["PIX", "BOLETO", "CARTAO"]);
export type TenantInvoicePaymentMethod = z.infer<typeof TenantInvoicePaymentMethodEnum>;

export const TenantInvoiceRecordSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  empresaNome: z.string(),
  acao: z.enum([
    "DAR_BAIXA_MANUAL",
    "PRORROGAR_TRIAL",
    "ALTERAR_PLANO",
    "ALTERAR_STATUS",
    "APLICAR_CUPOM",
  ]),
  plano: z.string(),
  statusAnterior: z.string(),
  statusNovo: z.string(),
  valorPago: z.number().nonnegative().nullable().optional().default(null),
  metodoPagamento: TenantInvoicePaymentMethodEnum.nullable().optional().default(null),
  comprovanteDataUrl: z.string().nullable().optional().default(null),
  comprovanteNome: z.string().nullable().optional().default(null),
  comprovanteMimeType: z.string().nullable().optional().default(null),
  diasExtrasTrial: z.number().int().nullable().optional().default(null),
  cupomCodigo: z.string().nullable().optional().default(null),
  observacao: z.string().nullable().optional().default(null),
  operadorId: z.string().nullable().optional().default(null),
  operadorNome: z.string().nullable().optional().default(null),
  criadoEm: z.string(),
});
export type TenantInvoiceRecord = z.infer<typeof TenantInvoiceRecordSchema>;

export const ALLOWED_TRIAL_EXTENSION_DAYS = [7, 14, 21] as const;

const AdminFinanceiroActionBaseSchema = z.object({
  tenantId: z.string().min(1),
  action: z.enum([
    "ALTERAR_PLANO",
    "ALTERAR_STATUS",
    "DAR_BAIXA_MANUAL",
    "PRORROGAR_TRIAL",
    "APLICAR_CUPOM",
  ]),
  plano: z.enum(["BASICO", "PRO", "ENTERPRISE"]).optional(),
  billingStatus: z
    .enum(["TRIAL", "ATIVO", "GRACE_PERIOD", "BLOQUEADO", "CANCELADO"])
    .optional(),
  diasExtrasTrial: z.number().int().min(1).max(365).optional(),
  novoVencimento: z.string().optional(),
  cupomCodigo: z.string().optional(),
  observacao: z.string().optional(),
  metodoPagamento: TenantInvoicePaymentMethodEnum.optional(),
  valorPago: z.number().nonnegative().nullable().optional(),
  comprovanteDataUrl: z
    .string()
    .max(8_000_000, "Comprovante excede o tamanho máximo permitido (aprox. 5 MB).")
    .nullable()
    .optional(),
  comprovanteNome: z.string().max(255).nullable().optional(),
  comprovanteMimeType: z.string().max(120).nullable().optional(),
});

function normalizarMimeComprovante(mime: string): string {
  const lower = mime.trim().toLowerCase();
  return lower === "image/jpg" ? "image/jpeg" : lower;
}

function validarMagicBytesComprovante(mime: string, bytes: Uint8Array): boolean {
  if (mime === "image/png") {
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= 8 && sig.every((b, i) => bytes[i] === b);
  }
  if (mime === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mime === "image/webp") {
    return (
      bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    );
  }
  if (mime === "application/pdf") {
    return (
      bytes.length >= 5 &&
      bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46 &&
      bytes[4] === 0x2d
    );
  }
  return false;
}

function refinarAcaoFinanceira(
  val: z.infer<typeof AdminFinanceiroActionBaseSchema>,
  ctx: z.RefinementCtx,
) {
  if (
    val.action === "PRORROGAR_TRIAL" &&
    val.diasExtrasTrial !== undefined &&
    !ALLOWED_TRIAL_EXTENSION_DAYS.includes(
      val.diasExtrasTrial as (typeof ALLOWED_TRIAL_EXTENSION_DAYS)[number],
    )
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Prorrogação de Trial permitida apenas em 7, 14 ou 21 dias (máximo).",
      path: ["diasExtrasTrial"],
    });
  }
  if (val.comprovanteDataUrl) {
    const match =
      /^data:(image\/png|image\/jpe?g|image\/webp|application\/pdf);base64,([A-Za-z0-9+/=\s]+)$/i.exec(
        val.comprovanteDataUrl,
      );
    if (!match) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Formato de comprovante inválido. Envie uma imagem (PNG/JPG/WEBP) ou PDF.",
        path: ["comprovanteDataUrl"],
      });
      return;
    }

    const mimeDataUrl = normalizarMimeComprovante(match[1]);
    if (val.comprovanteMimeType) {
      const mimeDeclarado = normalizarMimeComprovante(val.comprovanteMimeType);
      if (mimeDeclarado !== mimeDataUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Tipo MIME do comprovante diverge do conteúdo enviado.",
          path: ["comprovanteMimeType"],
        });
        return;
      }
    }

    const b64Clean = match[2].replace(/\s+/g, "");
    if (!b64Clean || b64Clean.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64Clean)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Conteúdo Base64 do comprovante inválido.",
        path: ["comprovanteDataUrl"],
      });
      return;
    }

    try {
      const rawHead = atob(b64Clean.slice(0, 16));
      const bytes = new Uint8Array(rawHead.length);
      for (let i = 0; i < rawHead.length; i++) {
        bytes[i] = rawHead.charCodeAt(i);
      }
      if (!validarMagicBytesComprovante(mimeDataUrl, bytes)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Assinatura binária do comprovante não corresponde a PNG/JPG/WEBP ou PDF válido.",
          path: ["comprovanteDataUrl"],
        });
      }
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Não foi possível decodificar o comprovante enviado.",
        path: ["comprovanteDataUrl"],
      });
    }
  }
}

export const AdminFinanceiroActionSchema =
  AdminFinanceiroActionBaseSchema.superRefine(refinarAcaoFinanceira);
export type AdminFinanceiroActionInput = z.infer<
  typeof AdminFinanceiroActionSchema
>;

/* =========================================================================
   Central de Notificações do Portal ADM (/admin/notificacoes)
========================================================================= */

export const AdminNotificationCategoryEnum = z.enum([
  "NOVO_CLIENTE_TRIAL",
  "CHAMADO_SUPORTE",
  "ACAO_FATURAMENTO_ADM",
]);
export type AdminNotificationCategory = z.infer<typeof AdminNotificationCategoryEnum>;

export const AdminNotificationItemSchema = z.object({
  id: z.string(),
  categoria: AdminNotificationCategoryEnum,
  titulo: z.string(),
  descricao: z.string(),
  severidade: z.enum(["INFO", "ATENCAO", "CRITICA"]),
  somenteMaster: z.boolean().default(false),
  tenantId: z.string().nullable().optional().default(null),
  linkDestino: z.string().nullable().optional().default(null),
  atorNome: z.string().nullable().optional().default(null),
  metadados: z.record(z.string(), z.unknown()).optional(),
  lidaPor: z.array(z.string()).optional().default([]),
  criadaEm: z.string(),
});
export type AdminNotificationItem = z.infer<typeof AdminNotificationItemSchema>;

export const AdminNotificationsPatchSchema = z.discriminatedUnion("acao", [
  z.object({
    acao: z.literal("marcar_lida"),
    id: z.string().min(1),
  }),
  z.object({
    acao: z.literal("marcar_todas"),
  }),
]);
export type AdminNotificationsPatchInput = z.infer<typeof AdminNotificationsPatchSchema>;

export const AdminUpsertCouponSchema = z.object({
  id: z.string().optional(),
  codigo: z
    .string()
    .min(3)
    .max(40)
    .transform((v) => v.trim().toUpperCase()),
  descricao: z.string().nullable().optional(),
  descontoPercentual: z.number().min(0).max(100).default(0),
  diasExtrasTrial: z.number().int().min(0).max(180).default(0),
  affiliateId: z.string().nullable().optional(),
  maxUsos: z.number().int().positive().nullable().optional(),
  ativo: z.boolean().default(true),
  expiraEm: z.string().nullable().optional(),
});
export type AdminUpsertCouponInput = z.infer<typeof AdminUpsertCouponSchema>;

/* =========================================================================
   Afiliados & Comissões (/admin/afiliados)
========================================================================= */

export const AdminUpsertAffiliateSchema = z.object({
  id: z.string().optional(),
  nome: z.string().min(2, "Nome do afiliado é obrigatório"),
  documento: z.string().nullable().optional(),
  email: z.string().email("E-mail inválido"),
  telefone: z.string().nullable().optional(),
  chavePix: z.string().nullable().optional(),
  codigo: z
    .string()
    .min(3, "Código deve ter no mínimo 3 caracteres")
    .max(30)
    .transform((v) => v.trim().toUpperCase().replace(/\s+/g, "")),
  percentualComissao: z.number().min(1).max(100).default(20),
  tipoComissao: z.enum(["RECORRENTE", "PRIMEIRA_MENSALIDADE"]).default("RECORRENTE"),
  descontoIndicadosPct: z.number().min(0).max(100).default(0),
  diasExtrasTrial: z.number().int().min(0).max(90).default(0),
  ativo: z.boolean().default(true),
  observacoes: z.string().nullable().optional(),
});
export type AdminUpsertAffiliateInput = z.infer<typeof AdminUpsertAffiliateSchema>;

export const AdminVincularAffiliateSchema = z.object({
  tenantId: z.string().min(1),
  affiliateId: z.string().nullable(),
});

export const AdminPagarComissaoSchema = z.object({
  commissionId: z.string().min(1),
  status: z.enum(["PAGO", "PENDENTE", "CANCELADO"]).default("PAGO"),
  comprovanteObs: z.string().optional(),
});

/* =========================================================================
   Disparo de Avisos em Massa (/admin/avisos)
========================================================================= */

export const AdminCreateBroadcastSchema = z.object({
  titulo: z.string().min(3, "Título é obrigatório").max(160),
  mensagem: z.string().min(5, "Mensagem é obrigatória").max(2000),
  severidade: z.enum(["INFO", "ATENCAO", "CRITICA"]).default("INFO"),
  formato: z.enum(["SINO", "BANNER_TOPO", "AMBOS"]).default("AMBOS"),
  publicoAlvo: z
    .enum([
      "TODOS",
      "TRIAL",
      "ABANDONO_TRIAL",
      "PAGANTES",
      "INADIMPLENTES",
      "PLANO_BASICO",
      "PLANO_PRO",
      "PLANO_ENTERPRISE",
      "ESPECIFICO",
    ])
    .default("TODOS"),
  targetIds: z.array(z.string()).optional().default([]),
  linkDestino: z.string().nullable().optional(),
  expiraEm: z.string().nullable().optional(),
});
export type AdminCreateBroadcastInput = z.infer<typeof AdminCreateBroadcastSchema>;

/* =========================================================================
   Telemetria Diária de IA (/admin/ia)
========================================================================= */

export const AiUsageFeatureEnum = z.enum([
  "RAIO_X_EDITAL",
  "EXTRACAO_ITENS",
  "CARTAO_CNPJ",
  "INSPECAO_COFRE",
  "RESUMO_PNCP",
  "GERAL",
]);
export type AiUsageFeature = z.infer<typeof AiUsageFeatureEnum>;

export const RegistrarAiUsageInputSchema = z.object({
  tenantId: z.string().nullable().optional(),
  userId: z.string().nullable().optional(),
  usuarioNome: z.string().nullable().optional(),
  empresaNome: z.string().nullable().optional(),
  licitacaoId: z.string().nullable().optional(),
  feature: z.string().default("GERAL"),
  provider: z.string().default("LLM_GEMINI"),
  model: z.string().default("gemini-2.5-flash"),
  promptTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  duracaoMs: z.number().int().nonnegative().default(0),
  status: z.enum(["SUCESSO", "ERRO"]).default("SUCESSO"),
  erro: z.string().nullable().optional(),
});
export type RegistrarAiUsageInput = z.infer<typeof RegistrarAiUsageInputSchema>;

/* =========================================================================
   Catálogo Global & Injeção Manual de Licitações (/admin/licitacoes)
========================================================================= */

export const AdminLicitacaoKanbanStatusEnum = z.enum([
  "PENDENTE",
  "ACEITA",
  "RECUSADA",
  "ANALISE_TECNICA",
  "ANALISE_FINANCEIRA",
  "REVISAO_PROPOSTA",
  "ENVIADA",
  "EM_DISPUTA",
  "AGUARDANDO_RESULTADO",
  "CONTEMPLADA",
  "IMPUGNADA",
  "NAO_CONTEMPLADA_PRECO",
  "NAO_CONTEMPLADA_DOCUMENTACAO",
  "NAO_CONTEMPLADA_DESISTENCIA",
  "REVOGADA_ANULADA",
]);

export const AdminUpsertLicitacaoSchema = z.object({
  id: z.string().optional(),
  idPncp: z.string().optional(),
  numeroEdital: z.string().min(2, "Número do edital é obrigatório"),
  orgaoNome: z.string().min(2, "Nome do órgão é obrigatório"),
  orgaoCnpj: z.string().default("00.000.000/0001-00"),
  uf: z.string().length(2, "UF deve ter 2 letras").default("SP"),
  municipio: z.string().nullable().optional(),
  modalidade: z.string().default("Pregão Eletrônico"),
  segmentoMacro: z.string().nullable().optional(),
  portalDisputa: z.string().nullable().optional(),
  miniResumo: z.string().min(3, "Título/mini-resumo é obrigatório"),
  resumo: z.string().min(5, "Objeto/resumo é obrigatório"),
  valorEstimado: z.number().nonnegative().default(0),
  dataAbertura: z.string(),
  dataEncerramentoProposta: z.string().optional(),
  linkPncp: z.string().nullable().optional(),
  linkSistemaOrigem: z.string().nullable().optional(),
  parecerIA: z.enum(["GO", "AVALIAR", "NO_GO"]).default("AVALIAR"),
  injetarParaTenantId: z.string().nullable().optional(),
  statusKanbanInicial: AdminLicitacaoKanbanStatusEnum.default("PENDENTE"),
});
export type AdminUpsertLicitacaoInput = z.infer<typeof AdminUpsertLicitacaoSchema>;

export const AdminInjetarLicitacaoKanbanSchema = z.object({
  licitacaoId: z.string().min(1),
  tenantId: z.string().min(1),
  statusKanban: AdminLicitacaoKanbanStatusEnum.default("PENDENTE"),
  notas: z.string().optional(),
});

/* =========================================================================
   Equipe ADM & Governança (/admin/sistema)
========================================================================= */

export const AdminUpsertAdminUserSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2),
  email: z.string().email(),
  telefone: z.string().nullable().optional(),
  password: z.string().min(6).optional(),
  adminRole: AdminRoleEnum.default("ADMIN_OPERACIONAL"),
  ativo: z.boolean().default(true),
});
export type AdminUpsertAdminUserInput = z.infer<typeof AdminUpsertAdminUserSchema>;

/* =========================================================================
   Contratos de Payload das Rotas `/api/admin/*` (Issue #49)
========================================================================= */

export const AdminClientesPatchSchema = z.discriminatedUnion("tipo", [
  AdminUpdateContaPrincipalSchema.extend({ tipo: z.literal("conta") }),
  AdminUpsertEmpresaClienteSchema.extend({ tipo: z.literal("empresa") }),
  AdminUpsertUsuarioClienteSchema.extend({
    tipo: z.literal("usuario"),
    tenantId: z.string().min(1).optional(),
  }),
  AdminUpdateCotasClienteSchema.extend({
    tipo: z.literal("cotas"),
    tenantId: z.string().min(1).optional(),
  }),
  z.object({
    tipo: z.literal("disputa"),
    disputaId: z.string().min(1),
    status: z.enum(["APROVADA", "REJEITADA"]),
  }),
  AdminInjetarLicitacaoKanbanSchema.extend({
    tipo: z.literal("injetar"),
    tenantId: z.string().min(1).optional(),
  }),
]);
export type AdminClientesPatchInput = z.infer<typeof AdminClientesPatchSchema>;

export const AdminFinanceiroPostSchema = z
  .discriminatedUnion("tipo", [
    AdminUpsertCouponSchema.extend({ tipo: z.literal("cupom") }),
    AdminFinanceiroActionBaseSchema.extend({ tipo: z.literal("acao") }),
  ])
  .superRefine((val, ctx) => {
    if (val.tipo === "acao") {
      refinarAcaoFinanceira(val, ctx);
    }
  });
export type AdminFinanceiroPostInput = z.infer<typeof AdminFinanceiroPostSchema>;

export const AdminAfiliadosPostSchema = z.discriminatedUnion("tipo", [
  AdminUpsertAffiliateSchema.extend({ tipo: z.literal("afiliado") }),
  AdminVincularAffiliateSchema.extend({ tipo: z.literal("vincular") }),
  AdminPagarComissaoSchema.extend({ tipo: z.literal("comissao") }),
]);
export type AdminAfiliadosPostInput = z.infer<typeof AdminAfiliadosPostSchema>;

export const AdminAvisosPostSchema = z.union([
  z.object({
    acao: z.literal("desativar"),
    id: z.string().min(1),
  }),
  AdminCreateBroadcastSchema.extend({
    acao: z.literal("criar").optional(),
  }),
]);
export type AdminAvisosPostInput = z.infer<typeof AdminAvisosPostSchema>;

export const AdminSuportePostSchema = z.discriminatedUnion("acao", [
  z.object({
    acao: z.literal("responder"),
    ticketId: z.string().min(1),
    mensagem: z.string().trim().min(1, "Mensagem é obrigatória").max(5000),
  }),
  z.object({
    acao: z.literal("status"),
    ticketId: z.string().min(1),
    status: z.enum([
      "ABERTO",
      "EM_ATENDIMENTO",
      "AGUARDANDO_CLIENTE",
      "RESPONDIDO",
      "CONCLUIDO",
    ]),
  }),
  z.object({
    acao: z.literal("ajuda_rapida"),
    tenantId: z.string().min(1),
    adicionarAiQuota: z.number().int().min(0).optional(),
    adicionarStorageMb: z.number().int().min(0).optional(),
    resetarTravaIaLicitacaoId: z.string().min(1).optional(),
  }),
]);
export type AdminSuportePostInput = z.infer<typeof AdminSuportePostSchema>;

const adminWhatsAppConfigShape = {
  minDelaySegundos: z.number().int().min(1).max(300).optional(),
  maxDelaySegundos: z.number().int().min(1).max(600).optional(),
  limiteDiarioWarmup: z.number().int().min(1).max(10000).optional(),
  janelaInicio: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inicial inválido (use HH:MM)")
    .optional(),
  janelaFim: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário final inválido (use HH:MM)")
    .optional(),
};

export const AdminWhatsAppConfigSchema = z
  .object(adminWhatsAppConfigShape)
  .superRefine((val, ctx) => {
    if (
      val.minDelaySegundos !== undefined &&
      val.maxDelaySegundos !== undefined &&
      val.maxDelaySegundos < val.minDelaySegundos
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Delay máximo não pode ser menor que o delay mínimo.",
        path: ["maxDelaySegundos"],
      });
    }
  });
export type AdminWhatsAppConfigInput = z.infer<typeof AdminWhatsAppConfigSchema>;

export const AdminWhatsAppPostSchema = z.preprocess(
  (raw) => {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const rec = raw as Record<string, unknown>;
      if (rec.acao === undefined && typeof rec.action === "string") {
        return { ...rec, acao: rec.action };
      }
    }
    return raw;
  },
  z.union([
    z.object({ acao: z.literal("qrcode") }),
    z
      .object({
        acao: z.literal("config"),
        config: AdminWhatsAppConfigSchema.optional(),
        ...adminWhatsAppConfigShape,
      })
      .superRefine((val, ctx) => {
        const cfg = val.config ?? val;
        if (
          cfg.minDelaySegundos !== undefined &&
          cfg.maxDelaySegundos !== undefined &&
          cfg.maxDelaySegundos < cfg.minDelaySegundos
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Delay máximo não pode ser menor que o delay mínimo.",
            path: ["maxDelaySegundos"],
          });
        }
      }),
    z.object({
      acao: z.enum(["processar_fila", "processar_fila_legacy"]),
      limite: z.number().int().min(1).max(200).optional(),
    }),
    z.object({
      acao: z.literal("optout"),
      telefone: z.string().min(8, "Telefone inválido"),
      motivo: z.string().optional(),
    }),
    z.object({
      acao: z.literal("remover_optout"),
      telefone: z.string().min(8, "Telefone inválido"),
    }),
    z.object({
      acao: z.literal("teste"),
      destinatario: z.string().min(10, "Telefone inválido"),
      mensagem: z.string().min(1, "Mensagem não pode ser vazia"),
    }),
    WhatsAppEnvioSchema.extend({
      acao: z.undefined().optional(),
    }),
  ]),
);
export type AdminWhatsAppPostInput = z.infer<typeof AdminWhatsAppPostSchema>;

export const AdminMetricasQuerySchema = z.object({
  mes: z.coerce.number().int().min(1).max(12).optional(),
  ano: z.coerce.number().int().min(2020).max(2100).optional(),
});

export const AdminNotificacoesQuerySchema = z.object({
  categoria: z
    .enum(["TODAS", "NOVO_CLIENTE_TRIAL", "CHAMADO_SUPORTE", "ACAO_FATURAMENTO_ADM"])
    .optional(),
  naoLidas: z.enum(["true", "false", "1", "0"]).optional(),
  limite: z.coerce.number().int().min(1).max(300).optional(),
});

export const AdminFinanceiroQuerySchema = z.object({
  status: z.string().trim().max(40).optional(),
  faturasTenantId: z.string().trim().min(1).max(120).optional(),
});

export const AdminTenantsQuerySchema = z.object({
  status: z.string().trim().max(40).optional(),
  busca: z.string().trim().max(120).optional(),
});

export const AdminLicitacoesQuerySchema = z.object({
  busca: z.string().trim().max(160).optional(),
});

export const AdminLicitacoesPostSchema = z.discriminatedUnion("acao", [
  AdminUpsertLicitacaoSchema.extend({ acao: z.literal("salvar") }),
  AdminInjetarLicitacaoKanbanSchema.extend({ acao: z.literal("injetar") }),
  z.object({ acao: z.literal("excluir"), id: z.string().min(1) }),
  z.object({
    acao: z.literal("importar_lote"),
    itens: z.array(z.record(z.string(), z.unknown())).max(200),
  }),
  z.object({
    acao: z.literal("sincronizar_pncp"),
    diasRetroativos: z.number().int().min(1).max(15).optional().default(1),
    usarIa: z.boolean().optional().default(true),
  }),
]);
export type AdminLicitacoesPostInput = z.infer<typeof AdminLicitacoesPostSchema>;

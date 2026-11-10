import { APP_CONFIG } from "@/config/brand";
import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/server/audit";
import {
  ASAAS_PLAN_LABELS,
  ASAAS_PLAN_PRICES_BRL,
  AsaasAnyWebhookPayloadSchema,
  AsaasBillingType,
  AsaasWebhookPayload,
} from "@/server/schemas/asaas.schema";
import { PLAN_LIMITS, type PlanoAssinatura } from "@/server/schemas/tenant.schema";
import { enviarEmailFaturamento } from "@/server/services/email.service";
import { inMemoryTenants } from "@/server/services/tenant.service";
import { enviarNotificacaoWhatsApp } from "@/server/services/whatsapp.service";

// Armazenamento em memória para idempotência e testes resilientes
const memoryProcessedEvents = new Set<string>();
const memoryAsaasCustomers = new Map<string, { id: string; isMock: boolean }>();
const memoryAsaasSubscriptions = new Map<string, { subscriptionId: string; customerId: string; plano: PlanoAssinatura; isMock: boolean }>();

export interface AsaasFaturaItem {
  id: string;
  value: number;
  status: string;
  dueDate: string;
  billingType: string;
  invoiceUrl?: string | null;
  bankSlipUrl?: string | null;
  paymentDate?: string | null;
  description?: string | null;
}

const memoryMockInvoices = new Map<string, AsaasFaturaItem[]>();

export interface ResultadoProcessamentoWebhook {
  ok: boolean;
  duplicado: boolean;
  evento: string;
  mensagem?: string;
  tenantId?: string;
}

export function obterConfigAsaas(): {
  apiKey: string | null;
  apiUrl: string;
  configurado: boolean;
} {
  const apiKey = process.env.ASAAS_API_KEY?.trim() || null;
  const apiUrl = (
    process.env.ASAAS_API_URL?.trim() || "https://api-sandbox.asaas.com/v3"
  ).replace(/\/+$/, "");

  return {
    apiKey,
    apiUrl,
    configurado: Boolean(apiKey),
  };
}

async function asaasRequest<T = any>(
  endpointPath: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const cfg = obterConfigAsaas();
  if (!cfg.apiKey) {
    throw new Error("ASAAS_API_KEY não configurada");
  }

  const response = await fetch(`${cfg.apiUrl}${endpointPath}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      access_token: cfg.apiKey,
      "User-Agent": `${APP_CONFIG.shortName}-Billing/1.0`,
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });

  const data = (await response.json().catch(() => ({}))) as any;
  if (!response.ok) {
    const erroDetalhe =
      data?.errors?.[0]?.description ||
      data?.message ||
      `HTTP ${response.status} na API Asaas (${endpointPath})`;
    throw new Error(erroDetalhe);
  }

  return data as T;
}

function inferirPlanoPorDescricao(descricao?: string | null): PlanoAssinatura | null {
  if (!descricao) return null;
  const upper = descricao.toUpperCase();
  if (upper.includes("ENTERPRISE")) return "ENTERPRISE";
  if (upper.includes("PRO")) return "PRO";
  if (upper.includes("BASICO") || upper.includes("BÁSICO")) return "BASICO";
  return null;
}

async function resolverContatoTenant(tenantId: string): Promise<{
  razaoSocial: string;
  email: string | null;
  telefone: string | null;
  plano: string;
}> {
  let razaoSocial = "Empresa Licitante";
  let email: string | null = null;
  let telefone: string | null = null;
  let plano = "PRO";

  try {
    const tenantDb = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        users: {
          where: { ativo: true },
          include: { user: { select: { email: true, telefone: true } } },
          orderBy: { criadoEm: "asc" },
          take: 2,
        },
      },
    });
    if (tenantDb) {
      razaoSocial = tenantDb.razaoSocial || razaoSocial;
      telefone = tenantDb.telefone || tenantDb.users?.[0]?.user?.telefone || null;
      email = tenantDb.users?.[0]?.user?.email || null;
      plano = tenantDb.plano || plano;
      return { razaoSocial, email, telefone, plano };
    }
  } catch {}

  const memTenant = inMemoryTenants.get(tenantId);
  if (memTenant) {
    razaoSocial = memTenant.razaoSocial;
    plano = memTenant.plano;
  }

  return { razaoSocial, email, telefone, plano };
}

async function notificarEventoFaturamento(params: {
  tenantId: string;
  tipo: "CONFIRMADO" | "ATRASO" | "CANCELADO";
  valor?: number | null;
  invoiceUrl?: string | null;
  planoOverride?: string | null;
}): Promise<void> {
  try {
    const contato = await resolverContatoTenant(params.tenantId);
    const plano = params.planoOverride || contato.plano || "PRO";

    if (contato.email) {
      await enviarEmailFaturamento({
        destinatarioEmail: contato.email,
        tipo: params.tipo,
        razaoSocial: contato.razaoSocial,
        plano,
        valor: params.valor ?? null,
        invoiceUrl: params.invoiceUrl ?? null,
        tenantId: params.tenantId,
      }).catch(() => undefined);
    }

    if (contato.telefone) {
      const msg =
        params.tipo === "CONFIRMADO"
          ? `Pagamento confirmado! A assinatura do plano ${plano} da empresa ${contato.razaoSocial} no ${APP_CONFIG.brandName} está ativa.`
          : params.tipo === "ATRASO"
            ? `Aviso financeiro: identificamos uma fatura vencida do plano ${plano} (${contato.razaoSocial}). Regularize em /planos para manter o acesso contínuo.`
            : `Sua assinatura do plano ${plano} (${contato.razaoSocial}) no ${APP_CONFIG.brandName} foi cancelada.`;

      await enviarNotificacaoWhatsApp({
        destinatario: contato.telefone,
        mensagem: msg,
        tipo: "SISTEMA",
        evento: `FATURAMENTO_${params.tipo}`,
        tenantId: params.tenantId,
      }).catch(() => undefined);
    }
  } catch {
    // Notificação nunca deve falhar processamento de webhook
  }
}

/**
 * Processa evento de Webhook enviado pelo Asaas com garantia de Idempotência Atômica (ADR 0010).
 */
export async function processarWebhookAsaas(
  rawPayload: unknown,
): Promise<ResultadoProcessamentoWebhook> {
  const payload: AsaasWebhookPayload = AsaasAnyWebhookPayloadSchema.parse(rawPayload);

  // 1. Verificação de idempotência em memória (agilidade para CI e testes)
  if (memoryProcessedEvents.has(payload.id)) {
    return {
      ok: true,
      duplicado: true,
      evento: payload.event,
      mensagem: "Evento já processado anteriormente (idempotência preservada)",
    };
  }

  // 2. Verificação de idempotência no PostgreSQL
  try {
    const eventoExistente = await prisma.asaasWebhookEvent.findUnique({
      where: { id: payload.id },
    });

    if (eventoExistente && eventoExistente.processado) {
      memoryProcessedEvents.add(payload.id);
      return {
        ok: true,
        duplicado: true,
        evento: payload.event,
        mensagem: "Evento já registrado e processado no banco de dados",
      };
    }
  } catch {
    // Fallback gracioso caso a tabela ainda não exista em ambiente de teste local
  }

  let tenantId =
    payload.payment?.externalReference || payload.subscription?.externalReference || null;

  // Fallback de busca pelo subscriptionId / customerId caso externalReference não tenha vindo no evento
  if (!tenantId) {
    const subId = payload.payment?.subscription || payload.subscription?.id;
    const cusId = payload.payment?.customer || payload.subscription?.customer;
    try {
      const tenantMatch = await prisma.tenant.findFirst({
        where: {
          OR: [
            ...(subId ? [{ asaasSubscriptionId: subId }] : []),
            ...(cusId ? [{ asaasCustomerId: cusId }] : []),
          ],
        },
        select: { id: true },
      });
      if (tenantMatch) tenantId = tenantMatch.id;
    } catch {}
  }

  // 3. Registrar o recebimento do evento no banco
  try {
    await prisma.asaasWebhookEvent.upsert({
      where: { id: payload.id },
      create: {
        id: payload.id,
        evento: payload.event,
        tenantId,
        payload: payload as any,
        processado: false,
      },
      update: {},
    });
  } catch {
    // Continua com processamento em memória
  }

  memoryProcessedEvents.add(payload.id);

  // 4. Executa a transição de estado da empresa conforme o tipo de evento
  const agora = new Date();
  const planoInferido = inferirPlanoPorDescricao(
    payload.payment?.description || payload.subscription?.description,
  );

  if (tenantId) {
    try {
      if (
        payload.event === "PAYMENT_CONFIRMED" ||
        payload.event === "PAYMENT_RECEIVED"
      ) {
        const novaDataVencimento = new Date(agora);
        novaDataVencimento.setDate(novaDataVencimento.getDate() + 30);

        const updateData: Record<string, any> = {
          billingStatus: "ATIVO",
          vencimentoAssinatura: novaDataVencimento,
          ultimoPagamentoEm: agora,
          asaasCustomerId: payload.payment?.customer || payload.subscription?.customer || undefined,
          asaasSubscriptionId: payload.payment?.subscription || payload.subscription?.id || null,
        };

        if (planoInferido) {
          updateData.plano = planoInferido;
          updateData.maxCnpjs = PLAN_LIMITS[planoInferido].maxCnpjs;
          updateData.maxUsers = planoInferido === "ENTERPRISE" ? 10 : PLAN_LIMITS[planoInferido].maxUsers;
        }

        await prisma.tenant.update({
          where: { id: tenantId },
          data: updateData,
        });

        await recordAuditLog({
          usuarioId: "sistema_asaas",
          usuarioNome: "Gateway Asaas Webhook",
          acao: "CONFIRMAR_PAGAMENTO",
          entidadeTipo: "TENANT",
          entidadeId: tenantId,
          depois: {
            evento: payload.event,
            pagamentoId: payload.payment?.id,
            valor: payload.payment?.value,
            novoVencimento: novaDataVencimento,
          },
        });

        await notificarEventoFaturamento({
          tenantId,
          tipo: "CONFIRMADO",
          valor: payload.payment?.value ?? null,
          invoiceUrl: payload.payment?.invoiceUrl ?? null,
          planoOverride: planoInferido,
        });
      } else if (payload.event === "PAYMENT_OVERDUE") {
        await prisma.tenant.update({
          where: { id: tenantId },
          data: {
            billingStatus: "GRACE_PERIOD",
          },
        });

        await recordAuditLog({
          usuarioId: "sistema_asaas",
          usuarioNome: "Gateway Asaas Webhook",
          acao: "REGISTRAR_ATRASO",
          entidadeTipo: "TENANT",
          entidadeId: tenantId,
          depois: {
            evento: payload.event,
            pagamentoId: payload.payment?.id,
          },
        });

        await notificarEventoFaturamento({
          tenantId,
          tipo: "ATRASO",
          valor: payload.payment?.value ?? null,
          invoiceUrl: payload.payment?.invoiceUrl ?? null,
        });
      } else if (payload.event === "SUBSCRIPTION_DELETED") {
        await prisma.tenant.update({
          where: { id: tenantId },
          data: {
            billingStatus: "CANCELADO",
          },
        });

        await recordAuditLog({
          usuarioId: "sistema_asaas",
          usuarioNome: "Gateway Asaas Webhook",
          acao: "CANCELAR_ASSINATURA",
          entidadeTipo: "TENANT",
          entidadeId: tenantId,
          depois: {
            evento: payload.event,
            assinaturaId: payload.subscription?.id || payload.payment?.subscription,
          },
        });

        await notificarEventoFaturamento({
          tenantId,
          tipo: "CANCELADO",
        });
      } else if (
        payload.event === "PAYMENT_DELETED" ||
        payload.event === "PAYMENT_REFUNDED"
      ) {
        await prisma.tenant.update({
          where: { id: tenantId },
          data: {
            billingStatus: "BLOQUEADO",
          },
        });
      }
    } catch (err) {
      console.warn("[Asaas Webhook] Aviso ao atualizar tenant no banco:", err);
    }
  }

  // 5. Marca evento como processado
  try {
    await prisma.asaasWebhookEvent.update({
      where: { id: payload.id },
      data: {
        processado: true,
        processadoEm: agora,
      },
    });
  } catch {
    // Ignora se em memória
  }

  return {
    ok: true,
    duplicado: false,
    evento: payload.event,
    tenantId: tenantId || undefined,
  };
}

/**
 * Cria ou busca cliente no Asaas para um determinado Tenant.
 * Quando `ASAAS_API_KEY` não estiver configurada, retorna um identificador mock seguro.
 */
export async function obterOuCriarClienteAsaas(params: {
  tenantId: string;
  razaoSocial: string;
  cnpj: string;
  email: string;
  telefone?: string;
}): Promise<{ asaasCustomerId: string; mock: boolean }> {
  const cfg = obterConfigAsaas();
  const cpfCnpjLimpo = params.cnpj.replace(/\D/g, "");

  if (!cfg.configurado) {
    const cached = memoryAsaasCustomers.get(params.tenantId);
    const mockId = cached?.id || `cus_${params.tenantId.slice(0, 10)}`;
    memoryAsaasCustomers.set(params.tenantId, { id: mockId, isMock: true });
    return { asaasCustomerId: mockId, mock: true };
  }

  // 1. Verifica cliente real já salvo no cache ou banco
  const cached = memoryAsaasCustomers.get(params.tenantId);
  if (cached && !cached.isMock) {
    return { asaasCustomerId: cached.id, mock: false };
  }

  try {
    const existingTenant = await prisma.tenant.findUnique({
      where: { id: params.tenantId },
      select: { asaasCustomerId: true },
    });
    if (
      existingTenant?.asaasCustomerId &&
      !existingTenant.asaasCustomerId.startsWith(`cus_${params.tenantId.slice(0, 10)}`)
    ) {
      memoryAsaasCustomers.set(params.tenantId, {
        id: existingTenant.asaasCustomerId,
        isMock: false,
      });
      return { asaasCustomerId: existingTenant.asaasCustomerId, mock: false };
    }
  } catch {}

  // 2. Consulta por CPF/CNPJ no Asaas
  if (cpfCnpjLimpo) {
    const search = await asaasRequest<{ data?: Array<{ id: string }> }>(
      `/customers?cpfCnpj=${encodeURIComponent(cpfCnpjLimpo)}`,
    );
    if (search?.data?.[0]?.id) {
      const existingId = search.data[0].id;
      memoryAsaasCustomers.set(params.tenantId, { id: existingId, isMock: false });
      try {
        await prisma.tenant.update({
          where: { id: params.tenantId },
          data: { asaasCustomerId: existingId },
        });
      } catch {}
      return { asaasCustomerId: existingId, mock: false };
    }
  }

  // 3. Cria novo cliente no Asaas
  const created = await asaasRequest<{ id: string }>("/customers", {
    method: "POST",
    body: {
      name: params.razaoSocial,
      cpfCnpj: cpfCnpjLimpo || undefined,
      email: params.email,
      mobilePhone: params.telefone?.replace(/\D/g, "") || undefined,
      externalReference: params.tenantId,
      notificationDisabled: false,
    },
  });

  const asaasCustomerId = created.id;
  memoryAsaasCustomers.set(params.tenantId, { id: asaasCustomerId, isMock: false });

  try {
    await prisma.tenant.update({
      where: { id: params.tenantId },
      data: { asaasCustomerId },
    });
  } catch {}

  return { asaasCustomerId, mock: false };
}

export interface ResultadoCheckoutAssinatura {
  ok: boolean;
  mock: boolean;
  plano: PlanoAssinatura;
  valor: number;
  billingType: AsaasBillingType;
  asaasCustomerId: string;
  subscriptionId: string;
  paymentId?: string | null;
  invoiceUrl?: string | null;
  bankSlipUrl?: string | null;
  pixPayload?: string | null;
  pixQrCodeBase64?: string | null;
  status: string;
}

/**
 * Cria assinatura recorrente mensal no Asaas para o Tenant informado, retornando link da fatura
 * e payload PIX (quando aplicável), com fallback mock seguro quando `ASAAS_API_KEY` ausente.
 */
export async function criarAssinaturaAsaas(params: {
  tenantId: string;
  plano: PlanoAssinatura;
  billingType: AsaasBillingType;
  razaoSocial: string;
  cnpj: string;
  email: string;
  telefone?: string;
}): Promise<ResultadoCheckoutAssinatura> {
  const cfg = obterConfigAsaas();
  const valor = ASAAS_PLAN_PRICES_BRL[params.plano];
  const planoLabel = ASAAS_PLAN_LABELS[params.plano];
  const { asaasCustomerId } = await obterOuCriarClienteAsaas({
    tenantId: params.tenantId,
    razaoSocial: params.razaoSocial,
    cnpj: params.cnpj,
    email: params.email,
    telefone: params.telefone,
  });

  const hojeIso = new Date().toISOString().slice(0, 10);

  if (!cfg.configurado) {
    const subscriptionId = `sub_mock_${params.tenantId.slice(0, 8)}_${Date.now().toString(36)}`;
    const paymentId = `pay_mock_${Date.now().toString(36)}`;
    const invoiceUrl = `/planos?checkout=simulado&subscriptionId=${subscriptionId}`;
    const pixPayload =
      params.billingType === "PIX" ? `000201MOCKPIX.${subscriptionId}` : null;

    memoryAsaasSubscriptions.set(params.tenantId, {
      subscriptionId,
      customerId: asaasCustomerId,
      plano: params.plano,
      isMock: true,
    });

    const listaExistente = memoryMockInvoices.get(params.tenantId) || [];
    listaExistente.unshift({
      id: paymentId,
      value: valor,
      status: "PENDING",
      dueDate: hojeIso,
      billingType: params.billingType,
      invoiceUrl,
      description: `Assinatura ${APP_CONFIG.brandName} — Plano ${planoLabel}`,
    });
    memoryMockInvoices.set(params.tenantId, listaExistente);

    await enviarEmailFaturamento({
      destinatarioEmail: params.email,
      tipo: "CHECKOUT",
      razaoSocial: params.razaoSocial,
      plano: planoLabel,
      valor,
      invoiceUrl,
      tenantId: params.tenantId,
    }).catch(() => undefined);

    return {
      ok: true,
      mock: true,
      plano: params.plano,
      valor,
      billingType: params.billingType,
      asaasCustomerId,
      subscriptionId,
      paymentId,
      invoiceUrl,
      bankSlipUrl: params.billingType === "BOLETO" ? invoiceUrl : null,
      pixPayload,
      pixQrCodeBase64: null,
      status: "PENDING",
    };
  }

  const description = `Assinatura ${APP_CONFIG.brandName} — Plano ${planoLabel}`;
  const sub = await asaasRequest<{ id: string; status?: string }>("/subscriptions", {
    method: "POST",
    body: {
      customer: asaasCustomerId,
      billingType: params.billingType,
      value: valor,
      nextDueDate: hojeIso,
      cycle: "MONTHLY",
      description,
      externalReference: params.tenantId,
    },
  });

  const subscriptionId = sub.id;
  memoryAsaasSubscriptions.set(params.tenantId, {
    subscriptionId,
    customerId: asaasCustomerId,
    plano: params.plano,
    isMock: false,
  });

  try {
    await prisma.tenant.update({
      where: { id: params.tenantId },
      data: {
        asaasCustomerId,
        asaasSubscriptionId: subscriptionId,
      },
    });
  } catch {}

  let firstPayment: any = null;
  try {
    const paymentsRes = await asaasRequest<{ data?: any[] }>(
      `/subscriptions/${encodeURIComponent(subscriptionId)}/payments`,
    );
    firstPayment = paymentsRes?.data?.[0] || null;
  } catch {}

  let pixPayload: string | null = null;
  let pixQrCodeBase64: string | null = null;
  if (params.billingType === "PIX" && firstPayment?.id) {
    try {
      const qr = await asaasRequest<{ payload?: string; encodedImage?: string }>(
        `/payments/${encodeURIComponent(firstPayment.id)}/pixQrCode`,
      );
      pixPayload = qr?.payload || null;
      pixQrCodeBase64 = qr?.encodedImage || null;
    } catch {}
  }

  const invoiceUrl = firstPayment?.invoiceUrl || null;

  await enviarEmailFaturamento({
    destinatarioEmail: params.email,
    tipo: "CHECKOUT",
    razaoSocial: params.razaoSocial,
    plano: planoLabel,
    valor,
    invoiceUrl,
    tenantId: params.tenantId,
  }).catch(() => undefined);

  return {
    ok: true,
    mock: false,
    plano: params.plano,
    valor,
    billingType: params.billingType,
    asaasCustomerId,
    subscriptionId,
    paymentId: firstPayment?.id || null,
    invoiceUrl,
    bankSlipUrl: firstPayment?.bankSlipUrl || null,
    pixPayload,
    pixQrCodeBase64,
    status: firstPayment?.status || sub.status || "PENDING",
  };
}

/**
 * Lista faturas/cobranças da assinatura do Tenant no Asaas (ou histórico simulado sem chave).
 */
export async function listarCobrancasAssinaturaAsaas(params: {
  tenantId?: string | null;
  subscriptionId?: string | null;
  customerId?: string | null;
}): Promise<{ ok: true; mock: boolean; faturas: AsaasFaturaItem[] }> {
  const cfg = obterConfigAsaas();
  const memSub = params.tenantId ? memoryAsaasSubscriptions.get(params.tenantId) : undefined;
  const subId = params.subscriptionId || memSub?.subscriptionId || null;
  const cusId = params.customerId || memSub?.customerId || null;

  if (!cfg.configurado || (!subId && !cusId)) {
    const mockFaturas = params.tenantId ? memoryMockInvoices.get(params.tenantId) || [] : [];
    return {
      ok: true,
      mock: true,
      faturas: mockFaturas,
    };
  }

  try {
    const queryParam = subId
      ? `subscription=${encodeURIComponent(subId)}`
      : `customer=${encodeURIComponent(cusId!)}`;
    const data = await asaasRequest<{ data?: any[] }>(`/payments?${queryParam}&limit=20`);
    const faturas: AsaasFaturaItem[] = (Array.isArray(data?.data) ? data.data : []).map((p) => ({
      id: String(p.id),
      value: Number(p.value || 0),
      status: String(p.status || "PENDING"),
      dueDate: String(p.dueDate || ""),
      billingType: String(p.billingType || "PIX"),
      invoiceUrl: p.invoiceUrl ?? null,
      bankSlipUrl: p.bankSlipUrl ?? null,
      paymentDate: p.paymentDate ?? null,
      description: p.description ?? null,
    }));

    return {
      ok: true,
      mock: false,
      faturas,
    };
  } catch {
    const fallbackFaturas = params.tenantId ? memoryMockInvoices.get(params.tenantId) || [] : [];
    return {
      ok: true,
      mock: true,
      faturas: fallbackFaturas,
    };
  }
}

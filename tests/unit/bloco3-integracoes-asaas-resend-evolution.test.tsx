// @vitest-environment jsdom
import React from "react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

import { getServerSession } from "next-auth/next";
import { prisma } from "@/lib/prisma";
import { resetInMemoryLicitacoes, insertInMemoryUsuario } from "@/server/services/licitacoes-store";
import {
  resetInMemoryTenantStorage,
  inMemoryTenants,
  inMemoryTenantUsers,
} from "@/server/services/tenant.service";
import { resetInMemorySuporteStore } from "@/server/services/suporte.service";
import { _resetRateLimit, solicitarRecuperacaoSenha } from "@/server/services/esqueci-senha.service";
import { realizarCadastroConta } from "@/server/services/cadastro.service";
import { criarTicketSuporte, adicionarMensagemTicketSuporte } from "@/server/services/suporte.service";
import { verificarDisparoImediatoVencimentoDocumento } from "@/server/services/notificacoes.service";
import {
  registrarOptOutWhatsApp,
  verificarNumeroBloqueadoOptOut,
  enviarNotificacaoWhatsApp,
  processarFilaWhatsAppComJitter,
  enfileirarMensagemWhatsApp,
} from "@/server/services/whatsapp.service";
import {
  obterOuCriarClienteAsaas,
  criarAssinaturaAsaas,
  listarCobrancasAssinaturaAsaas,
  processarWebhookAsaas,
} from "@/server/services/asaas.service";

const mockedGetServerSession = vi.mocked(getServerSession);

const ENV_BACKUP = { ...process.env };

function restoreEnv() {
  for (const key of [
    "RESEND_API_KEY",
    "EMAIL_FROM",
    "EVOLUTION_API_URL",
    "EVOLUTION_API_KEY",
    "EVOLUTION_INSTANCE_NAME",
    "EVOLUTION_WEBHOOK_TOKEN",
    "ASAAS_API_KEY",
    "ASAAS_API_URL",
    "ASAAS_WEBHOOK_TOKEN",
    "SUPPORT_NOTIFY_EMAIL",
    "SUPPORT_NOTIFY_WHATSAPP",
    "NEXT_PUBLIC_APP_URL",
  ]) {
    if (ENV_BACKUP[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = ENV_BACKUP[key];
    }
  }
}

describe("Bloco 3 (Issue #40) — Integrações Asaas, Resend, Evolution API v2 & Triggers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    restoreEnv();
    resetInMemoryLicitacoes();
    resetInMemoryTenantStorage();
    resetInMemorySuporteStore();
    _resetRateLimit();
  });

  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
  });

  describe("1. Serviço de E-mail Transacional (Resend)", () => {
    it("1.1 deve executar fallback seguro sem lançar erro quando RESEND_API_KEY estiver ausente e registrar DeliveryLog IGNORADO_SEM_CHAVE", async () => {
      delete process.env.RESEND_API_KEY;
      const fetchSpy = vi.spyOn(global, "fetch");

      const {
        enviarEmailTransacional,
        listarLogsEntregaEmail,
        resetInMemoryDeliveryLogs,
      } = await import("@/server/services/email.service");
      resetInMemoryDeliveryLogs();

      const res = await enviarEmailTransacional({
        para: "diretor@empresa.com.br",
        assunto: "Teste Boas-vindas",
        html: "<p>Bem-vindo</p>",
        evento: "BOAS_VINDAS",
        tenantId: "tnt_1",
      });

      expect(res.ok).toBe(false);
      expect(res.skipped).toBe(true);
      expect(res.status).toBe("IGNORADO_SEM_CHAVE");
      expect(fetchSpy).not.toHaveBeenCalled();

      const logs = listarLogsEntregaEmail();
      expect(logs.some((l) => l.status === "IGNORADO_SEM_CHAVE" && l.destinatario === "diretor@empresa.com.br")).toBe(true);
    });

    it("1.2 deve chamar POST https://api.resend.com/emails com Bearer token e layout Carbon sem cores roxas quando RESEND_API_KEY estiver configurada", async () => {
      process.env.RESEND_API_KEY = "re_test_key_abc";
      process.env.EMAIL_FROM = "Atendimento <contato@licitasoft.com.br>";

      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "email_resend_001" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const { enviarEmailBoasVindas, resetInMemoryDeliveryLogs, listarLogsEntregaEmail } = await import(
        "@/server/services/email.service"
      );
      resetInMemoryDeliveryLogs();

      const res = await enviarEmailBoasVindas({
        nome: "Ana Silva",
        email: "ana@licitante.com.br",
        razaoSocial: "Licitante Alfa LTDA",
        cnpj: "12.345.678/0001-90",
        diasTrial: 14,
        tenantId: "tnt_alfa",
        userId: "usr_ana",
      });

      expect(res.ok).toBe(true);
      expect(res.providerMessageId).toBe("email_resend_001");
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe("https://api.resend.com/emails");
      expect((init?.headers as Record<string, string>)?.Authorization).toBe("Bearer re_test_key_abc");
      const sentBody = JSON.parse(String(init?.body || "{}"));
      expect(sentBody.from).toBe("Atendimento <contato@licitasoft.com.br>");
      expect(sentBody.to).toEqual(["ana@licitante.com.br"]);
      expect(sentBody.html).toContain("Grátis - Pro");
      expect(sentBody.html).toContain("14 dias");
      expect(sentBody.html).toContain("#0f62fe");
      expect(sentBody.html).not.toMatch(/#8a3ffc|#a56eff|purple|violet/i);

      const logs = listarLogsEntregaEmail();
      expect(logs.some((l) => l.status === "ENVIADO" && l.providerMessageId === "email_resend_001")).toBe(true);
    });
  });

  describe("2. Conector WhatsApp Evolution API v2 & Webhook Opt-Out", () => {
    it("2.1 deve enviar mensagem via Evolution API /message/sendText/{instance} com header apikey quando configurado", async () => {
      process.env.EVOLUTION_API_URL = "https://evo.empresa.com.br/";
      process.env.EVOLUTION_API_KEY = "evo_secret_999";
      process.env.EVOLUTION_INSTANCE_NAME = "inst_portal";

      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ key: { id: "wamid_evo_777" }, status: "PENDING" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const res = await enviarNotificacaoWhatsApp({
        destinatario: "(62) 99988-7766",
        mensagem: "Seu protocolo PROT-202611-0001 foi aberto.",
        tipo: "SISTEMA",
        evento: "SUPORTE_PROTOCOLO",
        tenantId: "tnt_1",
      });

      expect(res.ok).toBe(true);
      expect(res.status).toBe("ENVIADO");
      expect(res.providerMessageId).toBe("wamid_evo_777");
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe("https://evo.empresa.com.br/message/sendText/inst_portal");
      expect((init?.headers as Record<string, string>)?.apikey).toBe("evo_secret_999");
      const sentBody = JSON.parse(String(init?.body || "{}"));
      expect(sentBody.number).toBe("5562999887766");
      expect(sentBody.text).toContain("PROT-202611-0001");
    });

    it("2.2 deve respeitar opt-out mesmo quando Evolution API estiver configurada e processar fila com Evolution API", async () => {
      process.env.EVOLUTION_API_URL = "https://evo.empresa.com.br";
      process.env.EVOLUTION_API_KEY = "evo_secret_999";
      process.env.EVOLUTION_INSTANCE_NAME = "inst_portal";

      await registrarOptOutWhatsApp("62911112222", "Pediu SAIR");
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ key: { id: "wamid_fila_1" } }), { status: 201 }),
      );

      const blocked = await enviarNotificacaoWhatsApp({
        destinatario: "(62) 91111-2222",
        mensagem: "Alerta bloqueado",
        evento: "VENCIMENTO_DOCUMENTO",
      });

      expect(blocked.ok).toBe(false);
      expect(blocked.status).toBe("PAUSADO_OPT_OUT");
      expect(fetchSpy).not.toHaveBeenCalled();

      await enfileirarMensagemWhatsApp({
        destinatario: "(62) 93333-4444",
        mensagem: "Certidão FGTS vence amanhã.",
        tipo: "ALERTA",
      });

      const filaRes = await processarFilaWhatsAppComJitter({ limite: 5, simularDelay: false });
      expect(filaRes.processados.length).toBeGreaterThanOrEqual(1);
      expect(fetchSpy).toHaveBeenCalled();
    });

    it("2.3 POST /api/webhooks/evolution deve processar comando SAIR/PARAR e bloquear opt-out + validar token quando configurado", async () => {
      process.env.EVOLUTION_WEBHOOK_TOKEN = "wh_evo_secret_42";
      const { POST: evolutionWebhookPost } = await import("@/app/api/webhooks/evolution/route");

      // Token incorreto -> 401
      const reqUnauthorized = new Request("http://localhost/api/webhooks/evolution", {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: "wrong" },
        body: JSON.stringify({ event: "MESSAGES_UPSERT", data: {} }),
      });
      const res401 = await evolutionWebhookPost(reqUnauthorized as any);
      expect(res401.status).toBe(401);

      // Mensagem válida com SAIR
      const reqOptOut = new Request("http://localhost/api/webhooks/evolution", {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: "wh_evo_secret_42" },
        body: JSON.stringify({
          event: "messages.upsert",
          data: {
            key: { remoteJid: "5511977776666@s.whatsapp.net", fromMe: false },
            message: { conversation: "SAIR" },
          },
        }),
      });
      const res200 = await evolutionWebhookPost(reqOptOut as any);
      expect(res200.status).toBe(200);
      const data200 = await res200.json();
      expect(data200.optOutRegistrado).toBe(true);
      expect(await verificarNumeroBloqueadoOptOut("11977776666")).toBe(true);
    });
  });

  describe("3. Asaas Real API, Checkout, Faturas & Segurança de Webhook", () => {
    it("3.1 sem ASAAS_API_KEY deve operar em fallback mock seguro sem quebrar fluxo", async () => {
      delete process.env.ASAAS_API_KEY;
      const cliente = await obterOuCriarClienteAsaas({
        tenantId: "tnt_mock_01",
        razaoSocial: "Empresa Mock LTDA",
        cnpj: "12.345.678/0001-90",
        email: "fin@mock.com.br",
      });
      expect(cliente.asaasCustomerId).toContain("cus_");

      const assinatura = await criarAssinaturaAsaas({
        tenantId: "tnt_mock_01",
        plano: "PRO",
        billingType: "PIX",
        razaoSocial: "Empresa Mock LTDA",
        cnpj: "12.345.678/0001-90",
        email: "fin@mock.com.br",
      });
      expect(assinatura.ok).toBe(true);
      expect(assinatura.mock).toBe(true);
      expect(assinatura.subscriptionId).toContain("sub_");
      expect(assinatura.valor).toBe(97);
    });

    it("3.2 com ASAAS_API_KEY configurada deve criar cliente, assinatura mensal, retornar link/PIX e listar faturas via REST v3", async () => {
      process.env.ASAAS_API_KEY = "asaas_key_test_123";
      process.env.ASAAS_API_URL = "https://api-sandbox.asaas.com/v3";

      const fetchSpy = vi
        .spyOn(global, "fetch")
        // 1. Buscar cliente por CPF/CNPJ
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ data: [] }), { status: 200 }),
        )
        // 2. Criar cliente
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ id: "cus_asaas_real_01" }), { status: 200 }),
        )
        // 3. Criar assinatura
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: "sub_asaas_real_01",
              status: "ACTIVE",
              value: 497.0,
              billingType: "PIX",
            }),
            { status: 200 },
          ),
        )
        // 4. Consultar cobranças da assinatura
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              data: [
                {
                  id: "pay_asaas_real_01",
                  value: 497.0,
                  status: "PENDING",
                  dueDate: "2026-11-11",
                  billingType: "PIX",
                  invoiceUrl: "https://sandbox.asaas.com/i/pay_asaas_real_01",
                },
              ],
            }),
            { status: 200 },
          ),
        )
        // 5. QR Code PIX
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              encodedImage: "base64qr==",
              payload: "000201PIXTESTE",
            }),
            { status: 200 },
          ),
        )
        // 6. Listagem de faturas (listarCobrancasAssinaturaAsaas)
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              data: [
                {
                  id: "pay_asaas_real_01",
                  value: 497.0,
                  status: "CONFIRMED",
                  dueDate: "2026-11-11",
                  billingType: "PIX",
                  invoiceUrl: "https://sandbox.asaas.com/i/pay_asaas_real_01",
                },
              ],
            }),
            { status: 200 },
          ),
        );

      const assinatura = await criarAssinaturaAsaas({
        tenantId: "tnt_real_01",
        plano: "PRO",
        billingType: "PIX",
        razaoSocial: "Empresa Real S/A",
        cnpj: "33.000.167/0001-01",
        email: "financeiro@real.com.br",
      });

      expect(assinatura.ok).toBe(true);
      expect(assinatura.mock).toBe(false);
      expect(assinatura.asaasCustomerId).toBe("cus_asaas_real_01");
      expect(assinatura.subscriptionId).toBe("sub_asaas_real_01");
      expect(assinatura.invoiceUrl).toBe("https://sandbox.asaas.com/i/pay_asaas_real_01");
      expect(assinatura.pixPayload).toBe("000201PIXTESTE");

      const faturasRes = await listarCobrancasAssinaturaAsaas({
        subscriptionId: "sub_asaas_real_01",
        customerId: "cus_asaas_real_01",
      });
      expect(faturasRes.faturas).toHaveLength(1);
      expect(faturasRes.faturas[0].id).toBe("pay_asaas_real_01");
      expect(faturasRes.faturas[0].status).toBe("CONFIRMED");
      expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(5);
    });

    it("3.3 POST /api/webhooks/asaas deve validar header asaas-access-token e tratar SUBSCRIPTION_DELETED como CANCELADO", async () => {
      process.env.ASAAS_WEBHOOK_TOKEN = "tok_webhook_seguro_999";
      const updateSpy = vi.spyOn(prisma.tenant, "update").mockResolvedValue({} as any);

      const { POST: asaasWebhookPost } = await import("@/app/api/webhooks/asaas/route");

      // Sem token -> 401
      const reqSemToken = new Request("http://localhost/api/webhooks/asaas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "evt_sub_del_fail",
          event: "SUBSCRIPTION_DELETED",
          subscription: { id: "sub_1", externalReference: "tnt_cancel_1" },
        }),
      });
      const res401 = await asaasWebhookPost(reqSemToken as any);
      expect(res401.status).toBe(401);

      // Com token válido -> 200 e CANCELADO
      const reqValida = new Request("http://localhost/api/webhooks/asaas", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "asaas-access-token": "tok_webhook_seguro_999",
        },
        body: JSON.stringify({
          id: "evt_sub_del_ok_1",
          event: "SUBSCRIPTION_DELETED",
          subscription: {
            id: "sub_cancel_1",
            customer: "cus_cancel_1",
            externalReference: "tnt_cancel_1",
          },
        }),
      });
      const res200 = await asaasWebhookPost(reqValida as any);
      expect(res200.status).toBe(200);
      const data = await res200.json();
      expect(data.ok).toBe(true);
      expect(data.evento).toBe("SUBSCRIPTION_DELETED");
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "tnt_cancel_1" },
          data: expect.objectContaining({ billingStatus: "CANCELADO" }),
        }),
      );
    });

    it("3.4 POST /api/planos/checkout e GET /api/faturamento/faturas devem respeitar autenticação, RBAC e retornar dados de cobrança", async () => {
      const { POST: checkoutPost } = await import("@/app/api/planos/checkout/route");
      const { GET: faturasGet } = await import("@/app/api/faturamento/faturas/route");

      mockedGetServerSession.mockResolvedValueOnce(null);
      const reqUnauth = new Request("http://localhost/api/planos/checkout", {
        method: "POST",
        body: JSON.stringify({ plano: "PRO", billingType: "PIX" }),
      });
      expect((await checkoutPost(reqUnauth as any)).status).toBe(401);

      // OPERADOR bloqueado de contratar/alterar assinatura
      mockedGetServerSession.mockResolvedValueOnce({
        user: { id: "usr_op", role: "OPERADOR", email: "op@emp.com", activeTenantId: "tnt_op" },
      } as any);
      const reqOperador = new Request("http://localhost/api/planos/checkout", {
        method: "POST",
        body: JSON.stringify({ plano: "PRO", billingType: "PIX" }),
      });
      expect((await checkoutPost(reqOperador as any)).status).toBe(403);

      // DIRETORIA realiza checkout com sucesso
      mockedGetServerSession.mockResolvedValue({
        user: {
          id: "usr_dir",
          name: "Diretor Teste",
          role: "DIRETORIA",
          email: "dir@emp.com.br",
          activeTenantId: "tnt_checkout_1",
          cnpj: "12.345.678/0001-90",
        },
      } as any);

      const reqOk = new Request("http://localhost/api/planos/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plano: "ENTERPRISE", billingType: "BOLETO" }),
      });
      const resCheckout = await checkoutPost(reqOk as any);
      expect(resCheckout.status).toBe(200);
      const jsonCheckout = await resCheckout.json();
      expect(jsonCheckout.ok).toBe(true);
      expect(jsonCheckout.plano).toBe("ENTERPRISE");
      expect(jsonCheckout.valor).toBe(197);
      expect(jsonCheckout.subscriptionId).toContain("sub_");

      const resFaturas = await faturasGet();
      expect(resFaturas.status).toBe(200);
      const jsonFaturas = await resFaturas.json();
      expect(jsonFaturas.ok).toBe(true);
      expect(Array.isArray(jsonFaturas.faturas)).toBe(true);
    });
  });

  describe("4. Fiação dos Triggers Transacionais (Cadastro, Esqueci-Senha, Convites, Suporte, Vencimentos)", () => {
    it("4.1 realizarCadastroConta deve disparar e-mail de boas-vindas (14 dias Grátis - Pro) quando RESEND_API_KEY estiver presente", async () => {
      process.env.RESEND_API_KEY = "re_key_cadastro";
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ id: "email_welcome_1" }), { status: 200 }),
      );

      await realizarCadastroConta({
        cnpj: "11.222.333/0001-81",
        razaoSocial: "Padaria Central LTDA",
        nome: "João Padeiro",
        email: `joao_${Date.now()}@padaria.com.br`,
        whatsapp: "(62) 99999-1234",
        senha: "SenhaForte@2026",
        segmentos: ["ALIMENTACAO"],
        subsegmentos: [],
        ufs: ["GO"],
        brasilInteiro: false,
      });

      const resendCall = fetchSpy.mock.calls.find(([url]) => String(url).includes("api.resend.com"));
      expect(resendCall).toBeDefined();
      const body = JSON.parse(String(resendCall![1]?.body || "{}"));
      expect(body.subject).toContain("Boas-vindas");
      expect(body.html).toContain("14 dias");
    });

    it("4.2 solicitarRecuperacaoSenha deve enviar e-mail para usuário existente mantendo resposta anti-enumeração", async () => {
      process.env.RESEND_API_KEY = "re_key_reset";
      vi.spyOn(prisma.user, "findUnique").mockResolvedValueOnce({
        id: "usr_reset_1",
        name: "Maria Diretora",
        email: "maria@licitacoes.com.br",
      } as any);
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ id: "email_reset_1" }), { status: 200 }),
      );

      const res = await solicitarRecuperacaoSenha("maria@licitacoes.com.br", "10.0.0.5");
      expect(res.ok).toBe(true);

      const resendCall = fetchSpy.mock.calls.find(([url]) => String(url).includes("api.resend.com"));
      expect(resendCall).toBeDefined();
      const body = JSON.parse(String(resendCall![1]?.body || "{}"));
      expect(body.to).toEqual(["maria@licitacoes.com.br"]);
      expect(body.subject).toMatch(/Recuperação de Senha/i);
    });

    it("4.3 POST /api/tenants/[id]/convites deve enviar e-mail com link/token de convite quando RESEND_API_KEY estiver ativa", async () => {
      process.env.RESEND_API_KEY = "re_key_convite";
      inMemoryTenants.set("tnt_conv_1", {
        id: "tnt_conv_1",
        cnpj: "00000000000191",
        razaoSocial: "Empresa Convite LTDA",
        plano: "PRO",
        maxCnpjs: 2,
        maxUsers: 2,
        ativo: true,
        criadoEm: new Date(),
        updatedAt: new Date(),
      });
      inMemoryTenantUsers.push({
        id: "tu_1",
        tenantId: "tnt_conv_1",
        userId: "usr_titular_1",
        userEmail: "titular@empresa.com.br",
        userName: "Titular",
        role: "TITULAR",
        ativo: true,
        criadoEm: new Date(),
      });

      mockedGetServerSession.mockResolvedValue({
        user: { id: "usr_titular_1", email: "titular@empresa.com.br", name: "Titular" },
      } as any);

      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ id: "email_convite_1" }), { status: 200 }),
      );

      const { POST: postConvite } = await import("@/app/api/tenants/[id]/convites/route");
      const req = new Request("http://localhost/api/tenants/tnt_conv_1/convites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "colega@empresa.com.br", role: "MEMBRO" }),
      });

      const resp = await postConvite(req, { params: Promise.resolve({ id: "tnt_conv_1" }) });
      expect(resp.status).toBe(201);

      const resendCall = fetchSpy.mock.calls.find(([url]) => String(url).includes("api.resend.com"));
      expect(resendCall).toBeDefined();
      const body = JSON.parse(String(resendCall![1]?.body || "{}"));
      expect(body.to).toEqual(["colega@empresa.com.br"]);
      expect(body.html).toContain("token_");
    });

    it("4.4 criarTicketSuporte e resposta SUPORTE devem notificar cliente e equipe interna via Resend + Evolution", async () => {
      process.env.RESEND_API_KEY = "re_key_sup";
      process.env.EVOLUTION_API_URL = "https://evo.teste.com";
      process.env.EVOLUTION_API_KEY = "evo_key_sup";
      process.env.EVOLUTION_INSTANCE_NAME = "suporte";
      process.env.SUPPORT_NOTIFY_EMAIL = "atendimento@licitasoft.com.br";
      process.env.SUPPORT_NOTIFY_WHATSAPP = "5562999990000";

      const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async () =>
        new Response(JSON.stringify({ id: "msg_sup_1", key: { id: "wpp_sup_1" } }), {
          status: 200,
        }),
      );

      const ticket = await criarTicketSuporte(
        {
          categoria: "FINANCEIRO",
          urgencia: "ALTA",
          assunto: "Dúvida na nota fiscal",
          descricao: "Preciso da NFS-e referente ao plano Pro.",
        },
        {
          id: "usr_sup_cli",
          name: "Carlos Cliente",
          email: "carlos@cliente.com.br",
          telefone: "62988887777",
          tenantId: "tnt_sup_1",
        },
      );

      // Cliente Email + Equipe Email + Cliente WhatsApp + Equipe WhatsApp
      expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(4);

      const updated = await adicionarMensagemTicketSuporte(
        ticket.id,
        { mensagem: "Olá Carlos, já emitimos sua NFS-e!" },
        { id: "adm_1", name: "Suporte N1", autorTipo: "SUPORTE", isSuperAdmin: true },
      );

      expect(updated?.status).toBe("RESPONDIDO");
      expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(6);
    });

    it("4.5 alerta de vencimento de documento (N7) deve disparar e-mail/WhatsApp aos usuários do tenant", async () => {
      process.env.RESEND_API_KEY = "re_key_doc";
      insertInMemoryUsuario({
        id: "usr_doc_1",
        name: "Gestor Docs",
        email: "docs@empresa.com.br",
        role: "DIRETORIA",
        ativo: true,
        tenantId: "tnt_doc_1",
      });

      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ id: "email_doc_n7" }), { status: 200 }),
      );

      const amanha = new Date();
      amanha.setDate(amanha.getDate() + 5);

      const res = await verificarDisparoImediatoVencimentoDocumento({
        id: "doc_fgts_1",
        nome: "CRF FGTS",
        categoria: "FISCAL_TRABALHISTA",
        status: "ATIVO",
        semValidade: false,
        dataVencimento: amanha,
        tenantId: "tnt_doc_1",
      });

      expect(res.acionada).toBe(true);
      const resendCall = fetchSpy.mock.calls.find(([url]) => String(url).includes("api.resend.com"));
      expect(resendCall).toBeDefined();
      const body = JSON.parse(String(resendCall![1]?.body || "{}"));
      expect(body.to).toContain("docs@empresa.com.br");
      expect(body.subject).toContain("CRF FGTS");
    });
  });

  describe("5. Interface /planos (Checkout Real sem alert()) & .env.example", () => {
    it("5.1 página /planos deve realizar checkout via POST /api/planos/checkout sem chamar window.alert e exibir faturas", async () => {
      const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
      const fetchMock = vi.spyOn(global, "fetch").mockImplementation(async (input) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes("/api/planos/status")) {
          return new Response(
            JSON.stringify({
              ok: true,
              plano: "PRO",
              billingStatus: "TRIAL",
              diasRestantesTrial: 12,
              isReadOnly: false,
              isBlocked: false,
              inGracePeriod: false,
              maxCnpjs: 2,
              maxUsers: 2,
              cnpj: "12.345.678/0001-90",
            }),
            { status: 200 },
          );
        }
        if (url.includes("/api/faturamento/faturas")) {
          return new Response(
            JSON.stringify({
              ok: true,
              mock: true,
              faturas: [
                {
                  id: "pay_hist_01",
                  value: 497,
                  status: "PENDING",
                  dueDate: "2026-11-15",
                  billingType: "PIX",
                  invoiceUrl: "https://sandbox.asaas.com/i/pay_hist_01",
                },
              ],
            }),
            { status: 200 },
          );
        }
        if (url.includes("/api/planos/checkout")) {
          return new Response(
            JSON.stringify({
              ok: true,
              mock: true,
              plano: "PRO",
              valor: 497,
              billingType: "PIX",
              subscriptionId: "sub_ui_001",
              invoiceUrl: "https://sandbox.asaas.com/i/sub_ui_001",
              pixPayload: "000201PIXUI",
            }),
            { status: 200 },
          );
        }
        return new Response("{}", { status: 404 });
      });

      const { default: PlanosPage } = await import("@/app/planos/page");
      render(<PlanosPage />);

      const contratarPro = await screen.findByRole("button", { name: /Contratar Pro/i });
      fireEvent.click(contratarPro);

      expect(await screen.findByText(/Forma de pagamento/i)).toBeInTheDocument();

      const confirmBtn = screen.getByRole("button", { name: /Confirmar Contratação/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/planos/checkout",
          expect.objectContaining({ method: "POST" }),
        );
      });

      expect(alertSpy).not.toHaveBeenCalled();
      expect(await screen.findByText(/000201PIXUI/i)).toBeInTheDocument();
      expect(await screen.findByText(/Histórico de Cobranças/i)).toBeInTheDocument();
    });

    it("5.2 .env.example deve documentar todas as variáveis de IA, Resend, Asaas, Evolution API e Suporte sem chaves reais", () => {
      const envExample = fs.readFileSync(path.resolve(process.cwd(), ".env.example"), "utf-8");
      for (const requiredKey of [
        "GEMINI_API_KEY",
        "OPENAI_API_KEY",
        "RESEND_API_KEY",
        "EMAIL_FROM",
        "ASAAS_API_KEY",
        "ASAAS_API_URL",
        "ASAAS_WEBHOOK_TOKEN",
        "EVOLUTION_API_URL",
        "EVOLUTION_API_KEY",
        "EVOLUTION_INSTANCE_NAME",
        "CRON_SECRET",
        "SUPPORT_NOTIFY_EMAIL",
        "SUPPORT_NOTIFY_WHATSAPP",
      ]) {
        expect(envExample).toContain(requiredKey);
      }
    });
  });
});

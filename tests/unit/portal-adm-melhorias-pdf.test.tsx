import React from "react";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextRequest } from "next/server";
import * as nextAuthJwt from "next-auth/jwt";

const {
  mockGetServerSession,
  mockSignIn,
  mockSignOut,
  mockRouterPush,
  mockRouterRefresh,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockSignIn: vi.fn(),
  mockSignOut: vi.fn(),
  mockRouterPush: vi.fn(),
  mockRouterRefresh: vi.fn(),
}));

vi.mock("next-auth/next", () => ({
  getServerSession: mockGetServerSession,
}));

vi.mock("next-auth/react", () => ({
  signIn: mockSignIn,
  signOut: mockSignOut,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin",
  useRouter: () => ({
    push: mockRouterPush,
    replace: vi.fn(),
    refresh: mockRouterRefresh,
  }),
}));

import { prisma } from "@/lib/prisma";
import { APP_CONFIG } from "@/config/brand";
import { middleware } from "@/middleware";
import * as authModule from "@/server/auth";
import {
  SESSION_MAX_AGE_SECONDS,
  authorizeCredentials,
  authOptions,
  findAuthUserForOtp,
  generateAndStoreOtp,
  upsertInMemoryAuthUser,
  verifyOtpCode,
} from "@/server/auth";
import {
  POST as otpPostRoute,
  _resetOtpRateLimitForTesting,
} from "@/app/api/auth/otp/route";
import { GET as tenantsRouteGET, POST as tenantsRoutePOST } from "@/app/api/tenants/route";
import { GET as configEmpresaGET, PUT as configEmpresaPUT } from "@/app/api/configuracoes/empresa/route";
import { POST as planosCheckoutPOST } from "@/app/api/planos/checkout/route";
import { GET as oportunidadesGET, POST as oportunidadesPOST } from "@/app/api/oportunidades/route";
import { GET as dashboardGET } from "@/app/api/dashboard/route";
import { GET as faturamentoGET } from "@/app/api/faturamento/route";
import { GET as suporteTicketsGET } from "@/app/api/suporte/tickets/route";
import { GET as auditGET } from "@/app/api/audit/route";
import { GET as auditExportGET } from "@/app/api/audit/export-csv/route";
import { getInMemoryAuditLogs } from "@/server/audit";
import { processarWebhookAsaas } from "@/server/services/asaas.service";
import * as emailService from "@/server/services/email.service";
import {
  listarLogsEntregaEmail,
  resetInMemoryDeliveryLogs,
} from "@/server/services/email.service";
import {
  getInMemoryUsuario,
  insertInMemoryDocumento,
  insertInMemoryLicitacao,
  insertInMemoryPortal,
  resetInMemoryLicitacoes,
  setInMemoryTenantLicitacao,
} from "@/server/services/licitacoes-store";
import {
  createTenantForUser,
  inMemoryTenants,
  inMemoryTenantUsers,
  resetInMemoryTenantStorage,
} from "@/server/services/tenant.service";
import {
  listarFilaWhatsApp,
  resetInMemoryWhatsAppStoreForTesting,
} from "@/server/services/whatsapp.service";
import { listNotificacoes } from "@/server/services/notificacoes.service";
import {
  DEFAULT_WHATSAPP_CONFIG,
  memAdminUsers,
  memAffiliates,
  memAiLogs,
  memBroadcasts,
  memCommissions,
  memCoupons,
  memDisputes,
  memLicitacoesExcluidas,
  memTenantExtras,
  memUsers,
  memoryTenantExtraQuota,
  setMemWhatsAppConfig,
} from "@/server/services/superadmin/shared";
import {
  atualizarContaPrincipalSuperAdmin,
  atualizarCotasClienteSuperAdmin,
  criarAvisoEmMassaSuperAdmin,
  executarAcaoFinanceiraSuperAdmin,
  listarAvisosAtivosParaTenant,
  listarTenantsSuperAdmin,
  obterDossieCliente360SuperAdmin,
  obterEspelhamentoClienteSuperAdmin,
  obterMetricasSuperAdmin,
  salvarAfiliadoSuperAdmin,
  salvarCupomSuperAdmin,
  salvarEmpresaClienteSuperAdmin,
  salvarUsuarioAdminSuperAdmin,
  salvarUsuarioClienteSuperAdmin,
} from "@/server/services/superadmin.service";
import type { SuperAdminTenantItem } from "@/server/schemas/superadmin.schema";
import AdminLoginPage from "@/app/admin/login/page";
import LoginPage from "@/app/login/page";
import { AdminShell } from "@/components/admin/AdminShell";
import { EngajamentoTag } from "@/components/admin/admin-ui";
import { SuperAdminDashboard } from "@/components/admin/SuperAdminDashboard";
import { ClientesScreen } from "@/components/admin/screens/ClientesScreen";
import { AvisosScreen } from "@/components/admin/screens/AvisosScreen";
import { Cliente360Screen } from "@/components/admin/screens/Cliente360Screen";
import { FinanceiroScreen } from "@/components/admin/screens/FinanceiroScreen";
import { SistemaAdminScreen } from "@/components/admin/screens/SistemaAdminScreen";

function gerarCnpjValido(baseOitoDigitos: string): string {
  const base12 = `${baseOitoDigitos.padStart(8, "0").slice(0, 8)}0001`
    .split("")
    .map(Number);
  const calcDv = (nums: number[], pesos: number[]) => {
    const soma = nums.reduce((acc, n, i) => acc + n * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = calcDv(base12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calcDv([...base12, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const full = [...base12, d1, d2].join("");
  return `${full.slice(0, 2)}.${full.slice(2, 5)}.${full.slice(5, 8)}/${full.slice(8, 12)}-${full.slice(12, 14)}`;
}

function resetAllTestStores(): void {
  resetInMemoryTenantStorage();
  resetInMemoryLicitacoes();
  resetInMemoryDeliveryLogs();
  resetInMemoryWhatsAppStoreForTesting();
  _resetOtpRateLimitForTesting();
  memUsers.clear();
  memTenantExtras.clear();
  memAffiliates.clear();
  memCommissions.clear();
  memCoupons.clear();
  memAiLogs.length = 0;
  memBroadcasts.clear();
  memDisputes.clear();
  memAdminUsers.clear();
  memLicitacoesExcluidas.clear();
  memoryTenantExtraQuota.clear();
  setMemWhatsAppConfig({ ...DEFAULT_WHATSAPP_CONFIG });
}

async function seedContaMultiCnpj(opts?: {
  suffix?: string;
  plano?: "BASICO" | "PRO" | "ENTERPRISE";
  billingStatus?: "TRIAL" | "ATIVO" | "GRACE_PERIOD" | "BLOQUEADO" | "CANCELADO";
  trialFim?: Date | null;
  maxCnpjs?: number;
}) {
  const sfx = opts?.suffix ?? `${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const userId = `usr_acc_${sfx}`;
  const email = `titular.${sfx}@empresa.com.br`;
  const t1Id = `tnt_1_${sfx}`;
  const t2Id = `tnt_2_${sfx}`;
  const cnpj1 = gerarCnpjValido(`11${sfx.replace(/\D/g, "").slice(-6).padStart(6, "0")}`);
  const cnpj2 = gerarCnpjValido(`22${sfx.replace(/\D/g, "").slice(-6).padStart(6, "0")}`);
  const t1Created = new Date(Date.now() - 10 * 86400000);
  const t2Created = new Date(Date.now() - 5 * 86400000);
  const status = opts?.billingStatus ?? "TRIAL";
  const trialFim =
    opts?.trialFim !== undefined
      ? opts.trialFim
      : status === "TRIAL"
        ? new Date(Date.now() + 9 * 86400000)
        : null;
  const venc = status === "ATIVO" ? new Date(Date.now() + 20 * 86400000) : null;

  memUsers.set(userId, {
    id: userId,
    name: `Titular ${sfx}`,
    email,
    role: "DIRETORIA",
    ativo: true,
    sessionVersion: 1,
    telefone: "62998887766",
    cidade: "São Paulo",
    uf: "SP",
    criadoEm: t1Created,
  });

  inMemoryTenants.set(t1Id, {
    id: t1Id,
    cnpj: cnpj1,
    razaoSocial: `EMPRESA MATRIZ ${sfx} LTDA`,
    nomeFantasia: `Matriz ${sfx}`,
    plano: opts?.plano ?? "PRO",
    billingStatus: status,
    trialFim,
    vencimentoAssinatura: venc,
    ultimoPagamentoEm: status === "ATIVO" ? new Date(Date.now() - 10 * 86400000) : null,
    segmentos: ["TECNOLOGIA_INFORMATICA"],
    ufs: ["SP"],
    brasilInteiro: false,
    uf: "SP",
    cidade: "São Paulo",
    maxCnpjs: opts?.maxCnpjs ?? 3,
    maxUsers: 5,
    ativo: true,
    criadoEm: t1Created,
    updatedAt: t1Created,
  });

  inMemoryTenants.set(t2Id, {
    id: t2Id,
    cnpj: cnpj2,
    razaoSocial: `EMPRESA FILIAL ${sfx} LTDA`,
    nomeFantasia: `Filial ${sfx}`,
    plano: opts?.plano ?? "PRO",
    billingStatus: status,
    trialFim,
    vencimentoAssinatura: venc,
    ultimoPagamentoEm: status === "ATIVO" ? new Date(Date.now() - 10 * 86400000) : null,
    segmentos: ["TECNOLOGIA_INFORMATICA"],
    ufs: ["MG"],
    brasilInteiro: false,
    uf: "MG",
    cidade: "Belo Horizonte",
    maxCnpjs: opts?.maxCnpjs ?? 3,
    maxUsers: 5,
    ativo: true,
    criadoEm: t2Created,
    updatedAt: t2Created,
  });

  inMemoryTenantUsers.push(
    {
      id: `tu_1_${sfx}`,
      tenantId: t1Id,
      userId,
      userEmail: email,
      userName: `Titular ${sfx}`,
      role: "TITULAR",
      ativo: true,
      criadoEm: t1Created,
    },
    {
      id: `tu_2_${sfx}`,
      tenantId: t2Id,
      userId,
      userEmail: email,
      userName: `Titular ${sfx}`,
      role: "TITULAR",
      ativo: true,
      criadoEm: t2Created,
    },
  );

  return { userId, email, t1Id, t2Id, cnpj1, cnpj2 };
}

describe("Issue #50 — Melhorias e Correções no Portal ADM", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    mockGetServerSession.mockReset();
    mockSignIn.mockReset();
    mockSignOut.mockReset();
    mockRouterPush.mockReset();
    mockRouterRefresh.mockReset();
    resetAllTestStores();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    resetAllTestStores();
  });

  describe("Tarefa 1 — Login ADM (3 Opções), Isolamento de Sessão/Rotas & Header Limpo", () => {
    it("1.1 AdminLoginPage mantém PASSWORD como padrão e permite entrar via EMAIL_OTP e WHATSAPP_OTP com realm: 'admin'", async () => {
      mockSignIn.mockResolvedValue({ ok: true, error: null });
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/auth/otp") {
          return new Response(JSON.stringify({ ok: true, devCode: "654321" }), { status: 200 });
        }
        return new Response(JSON.stringify({ mrrEstimado: 0 }), { status: 200 });
      });
      vi.stubGlobal("fetch", fetchMock);

      const view = render(<AdminLoginPage />);

      // Padrão inicial PASSWORD preservado (compatível com testes legados)
      expect(screen.getByLabelText("E-mail administrativo")).toBeInTheDocument();
      expect(screen.getByLabelText("Senha")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Entrar no Portal ADM/i })).toBeInTheDocument();

      // Seleciona opção EMAIL_OTP
      const btnEmailOtp = screen.getByRole("button", { name: /Receber código por E-mail/i });
      expect(btnEmailOtp).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Receber código no WhatsApp/i }),
      ).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText("E-mail administrativo"), {
        target: { value: "VitorHenrique018@gmail.com" },
      });
      fireEvent.click(btnEmailOtp);

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/auth/otp",
          expect.objectContaining({
            method: "POST",
            body: JSON.stringify({
              email: "vitorhenrique018@gmail.com",
              method: "EMAIL_OTP",
              realm: "admin",
            }),
          }),
        ),
      );

      const otpInput = await screen.findByLabelText(/Código de 6 Dígitos/i);
      fireEvent.change(otpInput, { target: { value: "654321" } });
      fireEvent.click(screen.getByRole("button", { name: /Validar e Entrar/i }));

      await waitFor(() =>
        expect(mockSignIn).toHaveBeenCalledWith("credentials", {
          email: "vitorhenrique018@gmail.com",
          code: "654321",
          realm: "admin",
          redirect: false,
        }),
      );
      await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith("/admin"));

      // Alterna para WHATSAPP_OTP também com realm: "admin"
      fireEvent.click(screen.getByRole("button", { name: /Entrar com senha/i }));
      fireEvent.click(screen.getByRole("button", { name: /Receber código no WhatsApp/i }));
      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/auth/otp",
          expect.objectContaining({
            method: "POST",
            body: JSON.stringify({
              email: "vitorhenrique018@gmail.com",
              method: "WHATSAPP_OTP",
              realm: "admin",
            }),
          }),
        ),
      );

      view.unmount();
    });

    it("1.2 LoginPage de clientes envia realm: 'client' em /api/auth/otp e signIn", async () => {
      mockSignIn.mockResolvedValue({ ok: true, error: null });
      const fetchMock = vi.fn(async () =>
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
      vi.stubGlobal("fetch", fetchMock);

      const view = render(<LoginPage />);
      fireEvent.change(screen.getByTestId("login-email"), {
        target: { value: "cliente@empresa.com.br" },
      });
      fireEvent.click(screen.getByTestId("login-avancar"));

      fireEvent.click(screen.getByRole("button", { name: /Receber código por E-mail/i }));
      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/auth/otp",
          expect.objectContaining({
            body: JSON.stringify({
              email: "cliente@empresa.com.br",
              method: "EMAIL_OTP",
              realm: "client",
            }),
          }),
        ),
      );

      fireEvent.change(await screen.findByTestId("login-otp"), {
        target: { value: "123456" },
      });
      fireEvent.click(screen.getByTestId("login-submit-otp"));
      await waitFor(() =>
        expect(mockSignIn).toHaveBeenCalledWith("credentials", {
          email: "cliente@empresa.com.br",
          code: "123456",
          realm: "client",
          redirect: false,
        }),
      );

      fireEvent.click(screen.getByRole("button", { name: /Escolher outro método de entrada/i }));
      fireEvent.click(screen.getByRole("button", { name: /Entrar com senha/i }));
      fireEvent.change(screen.getByTestId("login-password"), {
        target: { value: "Senha123!" },
      });
      fireEvent.click(screen.getByTestId("login-submit"));
      await waitFor(() =>
        expect(mockSignIn).toHaveBeenCalledWith("credentials", {
          email: "cliente@empresa.com.br",
          password: "Senha123!",
          realm: "client",
          redirect: false,
        }),
      );

      view.unmount();
    });

    it("1.3 enviarEmailCodigoOtp, findAuthUserForOtp e POST /api/auth/otp suportam ADM sem tenant, bloqueiam cross-realm e validam WhatsApp sem telefone", async () => {
      const enviarFn = (
        emailService as unknown as {
          enviarEmailCodigoOtp?: (p: {
            nome?: string | null;
            email: string;
            codigo: string;
            isAdmin?: boolean;
            userId?: string | null;
          }) => Promise<{ status: string }>;
        }
      ).enviarEmailCodigoOtp;
      expect(typeof enviarFn).toBe("function");

      const findFn = (
        authModule as unknown as {
          findAuthUserForOtp?: (email: string) => Promise<{
            id: string;
            email: string;
            isSuperAdmin: boolean;
            telefone: string | null;
          } | null>;
        }
      ).findAuthUserForOtp;
      expect(typeof findFn).toBe("function");

      const masterLookup = await findFn!("vitorhenrique018@gmail.com");
      expect(masterLookup).not.toBeNull();
      expect(masterLookup?.isSuperAdmin).toBe(true);

      // Admin com telefone na memória
      upsertInMemoryAuthUser({
        id: "adm_otp_tel",
        name: "Admin Tel",
        email: "adm.otp.tel@portal.internal",
        role: "SUPERADMIN",
        ativo: true,
        isSuperAdmin: true,
        adminRole: "ADMIN_OPERACIONAL",
        sessionVersion: 1,
        passwordHash: "",
        activeTenantId: null,
        cnpj: null,
        plano: null,
        tenantRole: null,
        telefone: "62991230000",
      } as Parameters<typeof upsertInMemoryAuthUser>[0]);

      // Admin sem telefone
      upsertInMemoryAuthUser({
        id: "adm_otp_semtel",
        name: "Admin Sem Tel",
        email: "adm.otp.semtel@portal.internal",
        role: "SUPERADMIN",
        ativo: true,
        isSuperAdmin: true,
        adminRole: "ADMIN_OPERACIONAL",
        sessionVersion: 1,
        passwordHash: "",
        activeTenantId: null,
        cnpj: null,
        plano: null,
        tenantRole: null,
        telefone: null,
      } as Parameters<typeof upsertInMemoryAuthUser>[0]);

      // Cliente comum
      upsertInMemoryAuthUser({
        id: "cli_otp_1",
        name: "Cliente Comum",
        email: "cliente.otp@empresa.com.br",
        role: "DIRETORIA",
        ativo: true,
        isSuperAdmin: false,
        adminRole: null,
        sessionVersion: 1,
        passwordHash: "",
        activeTenantId: "tnt_cli_1",
        cnpj: "11.222.333/0001-81",
        plano: "PRO",
        tenantRole: "TITULAR",
        telefone: "62998881111",
      } as Parameters<typeof upsertInMemoryAuthUser>[0]);

      // EMAIL_OTP para admin mesmo sem telefone -> 200 e log OTP_ACESSO com APP_CONFIG.brandName
      const resAdminEmail = await otpPostRoute(
        new Request("http://localhost:3011/api/auth/otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "adm.otp.semtel@portal.internal",
            method: "EMAIL_OTP",
            realm: "admin",
          }),
        }),
      );
      expect(resAdminEmail.status).toBe(200);
      const emailLogs = listarLogsEntregaEmail({ canal: "EMAIL" });
      expect(emailLogs.some((l) => l.evento === "OTP_ACESSO" && l.destinatario === "adm.otp.semtel@portal.internal")).toBe(true);

      // WHATSAPP_OTP para admin sem telefone -> 400
      const resAdminSemTel = await otpPostRoute(
        new Request("http://localhost:3011/api/auth/otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "adm.otp.semtel@portal.internal",
            method: "WHATSAPP_OTP",
            realm: "admin",
          }),
        }),
      );
      expect(resAdminSemTel.status).toBe(400);

      // WHATSAPP_OTP para admin com telefone -> 200 e fila WhatsApp com APP_CONFIG.brandName
      const resAdminWa = await otpPostRoute(
        new Request("http://localhost:3011/api/auth/otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "adm.otp.tel@portal.internal",
            method: "WHATSAPP_OTP",
            realm: "admin",
          }),
        }),
      );
      expect(resAdminWa.status).toBe(200);
      const filaWa = await listarFilaWhatsApp(10);
      expect(
        filaWa.some(
          (w) =>
            (w.destinatario === "62991230000" || w.destinatario === "5562991230000") &&
            w.mensagem.includes(APP_CONFIG.brandName),
        ),
      ).toBe(true);

      // Cliente tentando OTP com realm: "admin" -> 404
      const resCliInAdm = await otpPostRoute(
        new Request("http://localhost:3011/api/auth/otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "cliente.otp@empresa.com.br",
            method: "EMAIL_OTP",
            realm: "admin",
          }),
        }),
      );
      expect(resCliInAdm.status).toBe(404);

      // Admin tentando OTP com realm: "client" -> 403
      const resAdmInCli = await otpPostRoute(
        new Request("http://localhost:3011/api/auth/otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "adm.otp.tel@portal.internal",
            method: "EMAIL_OTP",
            realm: "client",
          }),
        }),
      );
      expect(resAdmInCli.status).toBe(403);

      // Garante ausência de DIRECTORS_SEED na rota API
      const otpSource = fs.readFileSync(
        path.resolve(process.cwd(), "src/app/api/auth/otp/route.ts"),
        "utf-8",
      );
      expect(otpSource).not.toContain("DIRECTORS_SEED");
    });

    it("1.4 authorizeCredentials & authOptions aplicam realm estrito, limpam claims de tenant do SuperAdmin e preservam 30d + SUPERADMIN_MASTER", async () => {
      const codeVitor = generateAndStoreOtp("vitorhenrique018@gmail.com", "EMAIL_OTP");

      // SuperAdmin em realm: "client" -> bloqueado
      const vitorNoClient = await authorizeCredentials({
        email: "vitorhenrique018@gmail.com",
        code: codeVitor,
        realm: "client",
      });
      expect(vitorNoClient).toBeNull();

      // SuperAdmin em realm: "admin" -> liberado e sem tenant claims
      const vitorNoAdmin = await authorizeCredentials({
        email: "vitorhenrique018@gmail.com",
        password: "123456",
        realm: "admin",
      });
      expect(vitorNoAdmin).not.toBeNull();
      expect(vitorNoAdmin?.role).toBe("SUPERADMIN");
      expect(vitorNoAdmin?.isSuperAdmin).toBe(true);
      expect(vitorNoAdmin?.activeTenantId).toBeNull();
      expect(vitorNoAdmin?.cnpj).toBeNull();
      expect(vitorNoAdmin?.plano).toBeNull();
      expect(vitorNoAdmin?.tenantRole).toBeNull();

      // Cliente em realm: "admin" -> bloqueado
      const clienteNoAdmin = await authorizeCredentials({
        email: "alfredosouza100@gmail.com",
        password: authModule.DEFAULT_SEED_DIRECTOR_PASSWORD,
        realm: "admin",
      });
      expect(clienteNoAdmin).toBeNull();

      // Valida jwt.maxAge = 30 dias (2.592.000s)
      expect(authOptions.jwt?.maxAge).toBe(SESSION_MAX_AGE_SECONDS);
      expect(authOptions.session?.maxAge).toBe(SESSION_MAX_AGE_SECONDS);

      // Jwt callback limpa tenant claims para SuperAdmin e mantém master role em refresh do banco
      vi.stubEnv("VITEST", "false");
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        ativo: true,
        sessionVersion: 1,
        role: "DIRETORIA",
        isSuperAdmin: false,
        adminRole: null,
      } as never);

      const jwtCb = authOptions.callbacks?.jwt;
      expect(jwtCb).toBeDefined();
      const refreshedToken = await jwtCb!({
        token: {
          sub: "usr_master",
          email: "vitorhenrique018@gmail.com",
          role: "SUPERADMIN",
          isSuperAdmin: true,
          adminRole: "SUPERADMIN_MASTER",
          sessionVersion: 1,
          activeTenantId: "tnt_legado",
          cnpj: "12.345.678/0001-90",
          plano: "ENTERPRISE",
          tenantRole: "TITULAR",
        },
        trigger: "update",
      } as never);

      expect(refreshedToken.role).toBe("SUPERADMIN");
      expect(refreshedToken.isSuperAdmin).toBe(true);
      expect(refreshedToken.adminRole).toBe("SUPERADMIN_MASTER");
      expect(refreshedToken.activeTenantId).toBeNull();
      expect(refreshedToken.cnpj).toBeNull();
      expect(refreshedToken.plano).toBeNull();
      expect(refreshedToken.tenantRole).toBeNull();
    });

    it("1.5 middleware.ts isola bidirecionalmente ADM ⇄ Cliente sem quebrar cookies dummy sem assinatura", async () => {
      // SuperAdmin tentando acessar /dashboard, /oportunidades ou /admin/login -> 307 /admin
      for (const target of ["/dashboard", "/oportunidades", "/login", "/admin/login"]) {
        vi.spyOn(nextAuthJwt, "getToken").mockResolvedValueOnce({
          email: "vitorhenrique018@gmail.com",
          role: "SUPERADMIN",
          isSuperAdmin: true,
          adminRole: "SUPERADMIN_MASTER",
          ativo: true,
        } as never);

        const req = new NextRequest(`http://localhost:3011${target}`, {
          headers: { cookie: "__Secure-next-auth.session-token=valid-adm-jwt" },
        });
        const res = await middleware(req);
        expect(res.status).toBe(307);
        expect(res.headers.get("location")).toBe("http://localhost:3011/admin");
      }

      // Cliente comum tentando acessar /admin/login -> 307 /dashboard
      vi.spyOn(nextAuthJwt, "getToken").mockResolvedValueOnce({
        email: "cliente@empresa.com.br",
        role: "DIRETORIA",
        isSuperAdmin: false,
        ativo: true,
      } as never);
      const resCliLoginAdm = await middleware(
        new NextRequest("http://localhost:3011/admin/login", {
          headers: { cookie: "next-auth.session-token=valid-client-jwt" },
        }),
      );
      expect(resCliLoginAdm.status).toBe(307);
      expect(resCliLoginAdm.headers.get("location")).toBe("http://localhost:3011/dashboard");

      // Cliente comum tentando acessar /admin/clientes -> rewrite /404
      vi.spyOn(nextAuthJwt, "getToken").mockResolvedValueOnce({
        email: "cliente@empresa.com.br",
        role: "DIRETORIA",
        isSuperAdmin: false,
        ativo: true,
      } as never);
      const resCliAdm = await middleware(
        new NextRequest("http://localhost:3011/admin/clientes", {
          headers: { cookie: "next-auth.session-token=valid-client-jwt" },
        }),
      );
      expect(resCliAdm.headers.get("x-middleware-rewrite")).toContain("/404");

      // Cookie dummy sem token assinado (getToken === null) continua passando em /dashboard
      vi.spyOn(nextAuthJwt, "getToken").mockResolvedValueOnce(null);
      const resDummy = await middleware(
        new NextRequest("http://localhost:3011/dashboard", {
          headers: { cookie: "next-auth.session-token=mock-token" },
        }),
      );
      expect(resDummy.status).not.toBe(307);
    });

    it("1.6 licitacoes-store, docker-entrypoint.cjs, AdminShell e SistemaAdminScreen aplicam desvinculação, limpeza do Header e telefone ADM", async () => {
      const vitorStore = getInMemoryUsuario("usr_dir_1");
      expect(vitorStore?.name).toBe("Vítor Henrique");
      expect(vitorStore?.role).toBe("SUPERADMIN");
      expect(vitorStore?.isSuperAdmin).toBe(true);
      expect(vitorStore?.adminRole).toBe("SUPERADMIN_MASTER");

      const entrypointText = fs.readFileSync(
        path.resolve(process.cwd(), "scripts/docker-entrypoint.cjs"),
        "utf-8",
      );
      expect(entrypointText).toContain("tenantUser.deleteMany");
      expect(entrypointText).not.toMatch(/!\s*existing\.isSuperAdmin\s*&&\s*!\s*existing\.adminRole/);

      // AdminShell sem busca global e sem botão "Ir para o Portal do Cliente"
      const shellView = render(
        <AdminShell adminRole="SUPERADMIN_MASTER">
          <div>Conteúdo</div>
        </AdminShell>,
      );
      expect(screen.queryByTestId("admin-global-search")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Ir para o Portal do Cliente/i }),
      ).not.toBeInTheDocument();
      shellView.unmount();

      // Telefone em salvarUsuarioAdminSuperAdmin e #adm-tel + zero tags purple em SistemaAdminScreen
      const admCriado = await salvarUsuarioAdminSuperAdmin({
        name: "Operador Wa",
        email: "op.wa@portal.internal",
        telefone: "62991234567",
        adminRole: "ADMIN_OPERACIONAL",
        ativo: true,
      });
      expect(admCriado.usuario.telefone).toBe("62991234567");

      const fetchSistema = vi.fn(async () =>
        new Response(
          JSON.stringify({
            usuarios: [admCriado.usuario],
            logs: [
              {
                id: "log_1",
                ocorridoEm: new Date().toISOString(),
                usuarioNome: "Vítor",
                acao: "ADMIN_EDITAR",
                entidadeTipo: "USER",
                entidadeId: "u1",
                tenantId: null,
                depois: { ok: true },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
      vi.stubGlobal("fetch", fetchSistema);

      const sisView = render(<SistemaAdminScreen />);
      await waitFor(() => expect(screen.getByText("Operador Wa")).toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: /Novo operador ADM/i }));
      expect(document.querySelector("#adm-tel")).toBeInTheDocument();

      const sisSrc = fs.readFileSync(
        path.resolve(process.cwd(), "src/components/admin/screens/SistemaAdminScreen.tsx"),
        "utf-8",
      );
      expect(sisSrc).not.toContain('type="purple"');
      sisView.unmount();
    });
  });

  describe("Tarefa 2 — Agrupamento Global por Conta Principal & Unificação de Trial/Financeiro", () => {
    it("2.1 2º CNPJ criado por createTenantForUser ou salvarEmpresaClienteSuperAdmin herda Trial, Plano e Status do 1º CNPJ", async () => {
      const baseTrial = new Date(Date.now() + 5 * 86400000);
      const uid = `usr_trial_inherit_${Date.now()}`;
      memUsers.set(uid, {
        id: uid,
        name: "Herança Trial",
        email: "heranca.trial@empresa.com.br",
        role: "DIRETORIA",
        ativo: true,
        sessionVersion: 1,
        criadoEm: new Date(Date.now() - 9 * 86400000),
      });

      const primeiro = await createTenantForUser({
        userId: uid,
        userEmail: "heranca.trial@empresa.com.br",
        userName: "Herança Trial",
        userPlan: "PRO",
        input: {
          cnpj: gerarCnpjValido("10203040"),
          razaoSocial: "PRIMEIRA MATRIZ LTDA",
          uf: "SP",
          plano: "PRO",
        },
      });
      // Simula que o trial do 1º CNPJ já correu 9 dias (faltam 5) e recebeu cota customizada de 3 CNPJs
      primeiro.trialFim = baseTrial;
      primeiro.maxCnpjs = 3;
      inMemoryTenants.set(primeiro.id, primeiro);

      // 2º CNPJ via createTenantForUser
      const segundo = await createTenantForUser({
        userId: uid,
        userEmail: "heranca.trial@empresa.com.br",
        userName: "Herança Trial",
        userPlan: "PRO",
        input: {
          cnpj: gerarCnpjValido("20304050"),
          razaoSocial: "SEGUNDA FILIAL PORTAL LTDA",
          uf: "RJ",
          plano: "PRO",
        },
      });

      expect(segundo.trialFim?.getTime()).toBe(baseTrial.getTime());
      expect(segundo.plano).toBe("PRO");
      expect(segundo.billingStatus).toBe("TRIAL");

      // 3º CNPJ via salvarEmpresaClienteSuperAdmin (usando maxCnpjs expandido = 3)
      const terceiro = await salvarEmpresaClienteSuperAdmin({
        ownerUserId: uid,
        cnpj: gerarCnpjValido("30405060"),
        razaoSocial: "TERCEIRA FILIAL ADM LTDA",
      });
      expect(terceiro.empresa.trialFim ? new Date(terceiro.empresa.trialFim).getTime() : null).toBe(
        baseTrial.getTime(),
      );
      expect(terceiro.empresa.plano).toBe("PRO");
      expect(terceiro.empresa.billingStatus).toBe("TRIAL");
    });

    it("2.2 listarTenantsSuperAdmin agrupa múltiplos CNPJs em 1 conta e destaca subCnpjEncontrado na busca por filial", async () => {
      const conta = await seedContaMultiCnpj({ suffix: "9001", plano: "PRO", billingStatus: "TRIAL" });

      const todos = await listarTenantsSuperAdmin();
      expect(todos).toHaveLength(1);
      expect(todos[0].id).toBe(conta.t1Id);
      expect(todos[0].qtdCnpjs).toBe(2);
      expect(todos[0].cnpjsAdicionaisCount).toBe(1);
      expect(todos[0].cnpjsVinculados).toHaveLength(2);
      expect(todos[0].subCnpjEncontrado).toBeNull();

      // Busca pelo CNPJ da filial retorna a conta principal indicando o sub-CNPJ encontrado
      const buscaFilial = await listarTenantsSuperAdmin({ busca: conta.cnpj2 });
      expect(buscaFilial).toHaveLength(1);
      expect(buscaFilial[0].id).toBe(conta.t1Id);
      expect(buscaFilial[0].subCnpjEncontrado).toEqual({
        id: conta.t2Id,
        cnpj: conta.cnpj2,
        razaoSocial: "EMPRESA FILIAL 9001 LTDA",
      });
    });

    it("2.3 executarAcaoFinanceiraSuperAdmin propaga alterações para todos os CNPJs com 1 consumo de cupom e 1 comissão", async () => {
      const conta = await seedContaMultiCnpj({ suffix: "9002", plano: "PRO", billingStatus: "TRIAL" });
      const af = await salvarAfiliadoSuperAdmin({
        nome: "Parceiro Unico",
        email: "parceiro@afiliados.com",
        codigo: "PARC50",
        percentualComissao: 20,
        tipoComissao: "RECORRENTE",
        descontoIndicadosPct: 0,
        diasExtrasTrial: 0,
        ativo: true,
      });
      memTenantExtras.set(conta.t1Id, { affiliateId: af.afiliado.id });
      const t1 = inMemoryTenants.get(conta.t1Id)!;
      t1.affiliateId = af.afiliado.id;
      inMemoryTenants.set(conta.t1Id, t1);

      await salvarCupomSuperAdmin({
        codigo: "UNICO50",
        descricao: "Uso único na conta",
        descontoPercentual: 20,
        diasExtrasTrial: 5,
        maxUsos: 1,
        ativo: true,
      });

      const resCupom = await executarAcaoFinanceiraSuperAdmin({
        tenantId: conta.t2Id,
        action: "APLICAR_CUPOM",
        cupomCodigo: "UNICO50",
      });
      expect(resCupom.ok).toBe(true);
      expect(inMemoryTenants.get(conta.t1Id)?.cupomCodigo).toBe("UNICO50");
      expect(inMemoryTenants.get(conta.t2Id)?.cupomCodigo).toBe("UNICO50");
      expect(memCoupons.get("UNICO50")?.usosAtuais).toBe(1);

      await executarAcaoFinanceiraSuperAdmin({
        tenantId: conta.t1Id,
        action: "ALTERAR_PLANO",
        plano: "ENTERPRISE",
      });
      expect(inMemoryTenants.get(conta.t1Id)?.plano).toBe("ENTERPRISE");
      expect(inMemoryTenants.get(conta.t2Id)?.plano).toBe("ENTERPRISE");

      await executarAcaoFinanceiraSuperAdmin({
        tenantId: conta.t1Id,
        action: "DAR_BAIXA_MANUAL",
      });
      expect(inMemoryTenants.get(conta.t1Id)?.billingStatus).toBe("ATIVO");
      expect(inMemoryTenants.get(conta.t2Id)?.billingStatus).toBe("ATIVO");
      expect(memCommissions.size).toBe(1);
    });

    it("2.4 Avisos em massa por ESPECIFICO alcançam usuários e notificações/banners de sub-CNPJs", async () => {
      const conta = await seedContaMultiCnpj({ suffix: "9003", plano: "PRO", billingStatus: "ATIVO" });
      const userSecundarioId = "usr_sec_bc_9003";
      inMemoryTenantUsers.push({
        id: "tu_sec_9003",
        tenantId: conta.t2Id,
        userId: userSecundarioId,
        userEmail: "sec9003@empresa.com.br",
        userName: "Secundário 9003",
        role: "MEMBRO",
        ativo: true,
        criadoEm: new Date(),
      });

      const bc = await criarAvisoEmMassaSuperAdmin({
        titulo: "Aviso Conta Consolidada",
        mensagem: "Deve chegar até quem usa apenas a filial.",
        severidade: "INFO",
        formato: "AMBOS",
        publicoAlvo: "ESPECIFICO",
        targetIds: [conta.t1Id],
        linkDestino: "/dashboard",
      });
      expect(bc.totalDestinatarios).toBe(1);

      const notifsSec = await listNotificacoes(userSecundarioId);
      expect(notifsSec.notificacoes.some((n) => n.titulo === "Aviso Conta Consolidada")).toBe(true);

      const ativosFilial = await listarAvisosAtivosParaTenant(conta.t2Id);
      expect(ativosFilial.some((a) => a.titulo === "Aviso Conta Consolidada")).toBe(true);
    });
  });

  describe("Tarefa 3 — Dashboard (/admin): MRR por Conta, Tooltips apenas em Siglas e Radar Table", () => {
    it("3.1 obterMetricasSuperAdmin conta 1 Enterprise com 3 CNPJs como 1 cliente e 1 mensalidade no MRR", async () => {
      const conta = await seedContaMultiCnpj({ suffix: "3001", plano: "ENTERPRISE", billingStatus: "ATIVO", maxCnpjs: 5 });
      const t3Id = "tnt_3_3001";
      inMemoryTenants.set(t3Id, {
        ...inMemoryTenants.get(conta.t1Id)!,
        id: t3Id,
        cnpj: gerarCnpjValido("33003001"),
        razaoSocial: "EMPRESA FILIAL 2 3001 LTDA",
        criadoEm: new Date(),
      });
      inMemoryTenantUsers.push({
        id: "tu_3_3001",
        tenantId: t3Id,
        userId: conta.userId,
        userEmail: conta.email,
        userName: "Titular 3001",
        role: "TITULAR",
        ativo: true,
        criadoEm: new Date(),
      });

      insertInMemoryDocumento({ id: "d1", tenantId: conta.t1Id, nome: "A.pdf", categoria: "OUTROS", arquivoTamanho: 100 * 1024 * 1024 });
      insertInMemoryDocumento({ id: "d2", tenantId: conta.t2Id, nome: "B.pdf", categoria: "OUTROS", arquivoTamanho: 200 * 1024 * 1024 });
      insertInMemoryDocumento({ id: "d3", tenantId: t3Id, nome: "C.pdf", categoria: "OUTROS", arquivoTamanho: 50 * 1024 * 1024 });

      const metrics = await obterMetricasSuperAdmin();
      expect(metrics.totalTenants).toBe(1);
      expect(metrics.tenantsAtivos).toBe(1);
      expect(metrics.mrrEstimado).toBe(997);
      expect(metrics.r2StorageTotalMb).toBe(350);
    });

    it("3.2 SuperAdminDashboard exibe 5 tooltips (i) somente em siglas, Radar em tabela (top 10 recentes) e sem Multi-Tenant inferior", () => {
      const trials: SuperAdminTenantItem[] = Array.from({ length: 12 }, (_, idx) => ({
        id: `tnt_rad_${idx + 1}`,
        cnpj: gerarCnpjValido(`${10000000 + idx}`),
        razaoSocial: `Trial Empresa ${idx + 1} Ltda`,
        nomeFantasia: idx === 11 ? "Trial Mais Recente" : `Fantasia ${idx + 1}`,
        plano: "PRO",
        billingStatus: "TRIAL",
        diasRestantesTrial: 10,
        diasAtraso: 0,
        cotaBaseMb: 2048,
        cotaExtraMb: 0,
        cotaTotalMb: 2048,
        espacoUsadoMb: 10,
        percentualUsado: 1,
        volumeArrematado: 0,
        totalContempladas: 0,
        qtdCnpjs: idx === 11 ? 3 : 1,
        cnpjsAdicionaisCount: idx === 11 ? 2 : 0,
        titularNome: `Cliente ${idx + 1}`,
        titularEmail: `cliente${idx + 1}@teste.com`,
        onboarding: {
          contaCriada: true,
          cnpjCadastrado: true,
          filtrosConfigurados: false,
          empresaPreenchida: false,
          documentoCofreEnviado: false,
          licitacaoNoKanban: false,
          iaOuCalculadoraUsada: false,
          score: 2,
          percentual: 29,
          statusEngajamento: "CADASTROU_E_SAIU",
        },
        criadoEm: new Date(Date.now() - (20 - idx) * 86400000),
      }));

      const view = render(
        <SuperAdminDashboard
          initialMetrics={{
            mrrEstimado: 1994,
            arrEstimado: 23928,
            receitaEmRisco: 0,
            totalTenants: 14,
            tenantsAtivos: 2,
            tenantsTrial: 12,
            tenantsGracePeriod: 0,
            tenantsBloqueados: 0,
            tenantsCancelados: 0,
            novosClientesHoje: 1,
            novosClientes7d: 5,
            novosClientes30d: 14,
            trialsEngajados: 0,
            trialsAbandonados: 12,
            totalVolumeArrematado: 0,
            totalLicitacoesContempladas: 0,
            r2StorageTotalMb: 120,
            whatsappFilaPendentes: 0,
            whatsappInstanciaConectada: true,
            gastoIaHojeBrl: 3.5,
            gastoIaMesBrl: 40,
            tokensIaHoje: 1000,
            chamadasIaHoje: 2,
            ticketsAbertos: 0,
            comissoesPendentesBrl: 0,
            ultimaColetaStatus: "CONCLUIDO",
            ultimaColetaEm: new Date().toISOString(),
          }}
          initialTenants={trials}
        />,
      );

      expect(screen.getAllByTestId("kpi-info-icon")).toHaveLength(5);
      expect(screen.getByText(/pendentes de configuração/i)).toBeInTheDocument();
      expect(screen.queryByText(/cadastraram e saíram/i)).not.toBeInTheDocument();
      expect(screen.queryByText("Clientes & Assinaturas (Multi-Tenant)")).not.toBeInTheDocument();

      // Top 10 mais recentes: Trial 12 aparece com +2 CNPJ(s), Trial 1 e Trial 2 (mais antigos) não
      expect(screen.getByText("Trial Mais Recente")).toBeInTheDocument();
      expect(screen.getByText("+2 CNPJ(s)")).toBeInTheDocument();
      expect(screen.queryByText("Fantasia 1")).not.toBeInTheDocument();
      expect(screen.queryByText("Fantasia 2")).not.toBeInTheDocument();

      view.unmount();
    });
  });

  describe("Tarefa 4 — Clientes (/admin/clientes) & Rótulo Profissional", () => {
    it("4.1 Substitui 'Cadastrou e saiu' por 'Pendente de configuração' e destaca sub-CNPJ buscado", async () => {
      const tagView = render(<EngajamentoTag status="CADASTROU_E_SAIU" />);
      expect(screen.getByText("Pendente de configuração")).toBeInTheDocument();
      expect(screen.queryByText("Cadastrou e saiu")).not.toBeInTheDocument();
      tagView.unmount();

      const avisosView = render(<AvisosScreen />);
      expect(screen.getByText("Trials pendentes de configuração")).toBeInTheDocument();
      avisosView.unmount();

      const contaItem: SuperAdminTenantItem = {
        id: "tnt_p_1",
        cnpj: "11.111.111/0001-11",
        razaoSocial: "CONTA PRINCIPAL LTDA",
        nomeFantasia: "Principal",
        plano: "PRO",
        billingStatus: "TRIAL",
        diasRestantesTrial: 10,
        diasAtraso: 0,
        cotaBaseMb: 2048,
        cotaExtraMb: 0,
        cotaTotalMb: 2048,
        espacoUsadoMb: 0,
        percentualUsado: 0,
        volumeArrematado: 0,
        totalContempladas: 0,
        qtdCnpjs: 3,
        cnpjsAdicionaisCount: 2,
        titularNome: "Mariana",
        titularEmail: "mariana@principal.com.br",
        totalUsuarios: 2,
        totalLicitacoesKanban: 0,
        totalDocumentosCofre: 0,
        criadoEm: new Date(),
        onboarding: {
          contaCriada: true,
          cnpjCadastrado: true,
          filtrosConfigurados: false,
          empresaPreenchida: false,
          documentoCofreEnviado: false,
          licitacaoNoKanban: false,
          iaOuCalculadoraUsada: false,
          score: 2,
          percentual: 29,
          statusEngajamento: "CADASTROU_E_SAIU",
        },
        subCnpjEncontrado: {
          id: "tnt_sub_2",
          cnpj: "22.222.222/0001-22",
          razaoSocial: "FILIAL BUSCADA LTDA",
        },
      };

      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          new Response(JSON.stringify([contaItem]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      );

      const cliView = render(<ClientesScreen />);
      await waitFor(() => expect(screen.getByText("FILIAL BUSCADA LTDA")).toBeInTheDocument());
      expect(screen.getAllByText("Pendente de configuração").length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText("+2 CNPJ(s)")).toBeInTheDocument();
      expect(screen.getByText(/Pertencente à conta de Mariana/i)).toBeInTheDocument();
      const link360 = screen.getByRole("link", { name: /Abrir 360º/i });
      expect(link360).toHaveAttribute("href", "/admin/clientes/tnt_sub_2");
      cliView.unmount();
    });
  });

  describe("Tarefa 5 — Cliente 360º (/admin/clientes/[id]): Seletor no Topo, Isolamento Aba 4, Paginação 5x5 e Resumo Global", () => {
    it("5.1 obterDossieCliente360SuperAdmin retorna porEmpresa, cotasPorEmpresa e contaGlobal; Espelho filtra pelo CNPJ", async () => {
      const conta = await seedContaMultiCnpj({ suffix: "5001", plano: "ENTERPRISE", billingStatus: "ATIVO", maxCnpjs: 5 });

      const l1 = insertInMemoryLicitacao({
        idPncp: "PNCP-5001-01",
        numeroEdital: "PE 001/2026",
        orgaoNome: "Órgão Matriz",
        orgaoCnpj: "00.000.000/0001-01",
        uf: "SP",
        municipio: "São Paulo",
        esfera: null,
        poder: null,
        modalidade: "Pregão Eletrônico",
        portalDisputa: null,
        miniResumo: "Licitação Matriz",
        resumo: "Objeto Matriz",
        valorEstimado: 100000,
        dataAbertura: new Date(),
        dataEncerramentoProposta: null,
        dataPublicacaoPncp: new Date(),
        dataUltimaAtualizacao: new Date(),
        status: "PENDENTE",
        parecerIA: "GO",
        justificativaIA: null,
        tipoSistemaCodigo: null,
        atestadosExigidos: null,
        motivoRecusa: null,
        quantidadeLotes: 1,
        loteUnico: true,
        precoPorLote: false,
        isPresencial: false,
        distanciaGoianiaKm: null,
        linkPncp: null,
        linkSistemaOrigem: null,
        hashCritico: null,
        valorArrematado: null,
        responsavelId: null,
        modalidadeCodigo: null,
        numeroControlePNCP: null,
        segmentoMacro: null,
        subcategorias: null,
      });
      const l2 = insertInMemoryLicitacao({
        idPncp: "PNCP-5001-02",
        numeroEdital: "PE 002/2026",
        orgaoNome: "Órgão Filial",
        orgaoCnpj: "00.000.000/0001-02",
        uf: "MG",
        municipio: "Belo Horizonte",
        esfera: null,
        poder: null,
        modalidade: "Pregão Eletrônico",
        portalDisputa: null,
        miniResumo: "Licitação Filial",
        resumo: "Objeto Filial",
        valorEstimado: 200000,
        dataAbertura: new Date(),
        dataEncerramentoProposta: null,
        dataPublicacaoPncp: new Date(),
        dataUltimaAtualizacao: new Date(),
        status: "PENDENTE",
        parecerIA: "GO",
        justificativaIA: null,
        tipoSistemaCodigo: null,
        atestadosExigidos: null,
        motivoRecusa: null,
        quantidadeLotes: 1,
        loteUnico: true,
        precoPorLote: false,
        isPresencial: false,
        distanciaGoianiaKm: null,
        linkPncp: null,
        linkSistemaOrigem: null,
        hashCritico: null,
        valorArrematado: null,
        responsavelId: null,
        modalidadeCodigo: null,
        numeroControlePNCP: null,
        segmentoMacro: null,
        subcategorias: null,
      });

      setInMemoryTenantLicitacao(conta.t1Id, l1.id, { statusKanban: "ACEITA" });
      setInMemoryTenantLicitacao(conta.t2Id, l2.id, { statusKanban: "ENVIADA" });

      insertInMemoryDocumento({ id: "doc_m1", tenantId: conta.t1Id, nome: "Certidao Matriz.pdf", categoria: "OUTROS", arquivoTamanho: 1024 * 1024 });
      insertInMemoryDocumento({ id: "doc_f1", tenantId: conta.t2Id, nome: "Certidao Filial.pdf", categoria: "OUTROS", arquivoTamanho: 2 * 1024 * 1024 });
      insertInMemoryPortal({ id: "port_f1", tenantId: conta.t2Id, nome: "ComprasNet", url: "https://compras.gov.br" });

      const dossieRaw = await obterDossieCliente360SuperAdmin(conta.t2Id);
      const dossie = dossieRaw as unknown as {
        tenantId: string;
        porEmpresa?: Record<
          string,
          {
            patrimonioOperacional: {
              licitacoes: Array<{ numeroEdital: string }>;
              documentos: { lista: Array<{ nome: string; tenantId?: string }> };
              portais: number;
            };
          }
        >;
        cotasPorEmpresa?: Record<string, { storageUsadoMb: number }>;
        contaGlobal?: {
          totalLicitacoes: number;
          totalDocumentos: number;
          totalPortais: number;
          valorMensalidade: number;
        };
      };

      expect(dossie.tenantId).toBe(conta.t2Id);
      expect(dossie.porEmpresa?.[conta.t1Id]?.patrimonioOperacional.licitacoes.map((x) => x.numeroEdital)).toEqual(["PE 001/2026"]);
      expect(dossie.porEmpresa?.[conta.t2Id]?.patrimonioOperacional.licitacoes.map((x) => x.numeroEdital)).toEqual(["PE 002/2026"]);
      expect(dossie.porEmpresa?.[conta.t2Id]?.patrimonioOperacional.documentos.lista.map((x) => x.nome)).toEqual(["Certidao Filial.pdf"]);
      expect(dossie.cotasPorEmpresa?.[conta.t2Id]?.storageUsadoMb).toBe(2);
      expect(dossie.contaGlobal?.totalLicitacoes).toBe(2);
      expect(dossie.contaGlobal?.totalDocumentos).toBe(2);
      expect(dossie.contaGlobal?.totalPortais).toBe(1);
      expect(dossie.contaGlobal?.valorMensalidade).toBe(997);

      const espelho = await obterEspelhamentoClienteSuperAdmin(conta.t2Id);
      expect(espelho.licitacoesKanban.map((x) => x.numeroEdital)).toEqual(["PE 002/2026"]);
    });

    it("5.2 Cliente360Screen seleciona CNPJ inicial, troca CNPJs no topo, destaca Aba 2, pagina Aba 4 5x5 e exibe faixa global minimalista", async () => {
      const empresasMock = [1, 2, 3, 4, 5].map((n) => ({
        id: `tnt_c360_${n}`,
        cnpj: gerarCnpjValido(`5000000${n}`),
        razaoSocial: `Empresa 360 ${n} Ltda`,
        nomeFantasia: `Unidade ${n}`,
        uf: "SP",
        cidade: "São Paulo",
        plano: "ENTERPRISE",
        billingStatus: "ATIVO",
        ativo: true,
      }));

      const dossieMock = {
        tenantId: "tnt_c360_2",
        tenant: {
          razaoSocial: "Empresa 360 2 Ltda",
          nomeFantasia: "Unidade 2",
          cnpj: empresasMock[1].cnpj,
          plano: "ENTERPRISE",
          billingStatus: "ATIVO",
          ativo: true,
          diasRestantesTrial: 0,
          valorMensalidade: 997,
        },
        titular: {
          id: "usr_c360",
          name: "Carla 360",
          email: "carla@360.com.br",
          cpf: null,
          telefone: "62999990000",
          cidade: "Goiânia",
          uf: "GO",
          ativo: true,
          sessionVersion: 1,
          ultimoLoginEm: new Date().toISOString(),
        },
        onboarding: {
          contaCriada: true,
          cnpjCadastrado: true,
          filtrosConfigurados: true,
          empresaPreenchida: true,
          documentoCofreEnviado: true,
          licitacaoNoKanban: true,
          iaOuCalculadoraUsada: false,
          score: 6,
          percentual: 86,
          statusEngajamento: "ENGAJADO",
        },
        empresas: empresasMock,
        usuarios: [],
        patrimonioOperacional: {
          licitacoes: [],
          kanbanPorColuna: {},
          documentos: { total: 0, vencidos: 0, bytes: 0, lista: [] },
          portais: 0,
          impugnacoes: 0,
          precosSalvos: 0,
        },
        porEmpresa: {
          tnt_c360_1: {
            patrimonioOperacional: {
              licitacoes: [
                {
                  id: "l_emp1",
                  tenantId: "tnt_c360_1",
                  tenantNome: "Unidade 1",
                  licitacaoId: "lic1",
                  numeroEdital: "EDITAL-EMP1",
                  orgaoNome: "Órgão Emp 1",
                  statusKanban: "PENDENTE",
                  valorEstimado: 1000,
                  dataAbertura: null,
                },
              ],
              kanbanPorColuna: { PENDENTE: 1 },
              documentos: {
                total: 1,
                vencidos: 0,
                bytes: 1024,
                lista: [
                  {
                    id: "d_emp1",
                    tenantId: "tnt_c360_1",
                    nome: "Doc Emp 1",
                    categoria: "OUTROS",
                    dataVencimento: null,
                    vencido: false,
                  },
                ],
              },
              portais: 1,
              impugnacoes: 0,
              precosSalvos: 0,
            },
          },
          tnt_c360_2: {
            patrimonioOperacional: {
              licitacoes: Array.from({ length: 6 }, (_, i) => ({
                id: `l_emp2_${i + 1}`,
                tenantId: "tnt_c360_2",
                tenantNome: "Unidade 2",
                licitacaoId: `lic2_${i + 1}`,
                numeroEdital: `EDITAL-EMP2-${i + 1}`,
                orgaoNome: `Órgão Emp 2 #${i + 1}`,
                statusKanban: "ACEITA",
                valorEstimado: 5000,
                dataAbertura: null,
              })),
              kanbanPorColuna: { ACEITA: 6 },
              documentos: {
                total: 6,
                vencidos: 0,
                bytes: 2048,
                lista: Array.from({ length: 6 }, (_, i) => ({
                  id: `d_emp2_${i + 1}`,
                  tenantId: "tnt_c360_2",
                  nome: `Certidão Emp2 #${i + 1}`,
                  categoria: "FISCAL_TRABALHISTA",
                  dataVencimento: null,
                  vencido: false,
                })),
              },
              portais: 2,
              impugnacoes: 0,
              precosSalvos: 0,
            },
          },
        },
        cotas: {
          maxCnpjs: 5,
          maxUsers: 10,
          storageBaseMb: 10240,
          storageExtraQuotaMb: 0,
          storageTotalMb: 10240,
          storageUsadoMb: 10,
          aiExtraQuotaMes: 0,
          aiUsadasMes: 2,
        },
        contaGlobal: {
          valorMensalidade: 997,
          diasRestantesTrial: 0,
          storageUsadoMb: 30,
          storageTotalMb: 51200,
          aiUsadasMes: 4,
          aiExtraQuotaMes: 2,
          totalLicitacoes: 7,
          totalDocumentos: 7,
          totalPortais: 3,
        },
        notasInternasAdm: null,
        disputas: [],
      };

      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("espelho=1")) {
          return new Response(
            JSON.stringify({ ok: true, licitacoesKanban: [], kanbanPorColuna: {} }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(JSON.stringify(dossieMock), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });
      vi.stubGlobal("fetch", fetchMock);

      const view = render(<Cliente360Screen tenantId="tnt_c360_2" />);
      await waitFor(() => expect(screen.getByTestId("cnpj-selector")).toBeInTheDocument());

      // Aba 1: botões alinhados em linha única (flexWrap: nowrap)
      const acoesConta = screen.getByTestId("conta-principal-acoes");
      expect(acoesConta.style.flexWrap).toBe("nowrap");

      // Faixa inferior minimalista Conta Global
      expect(screen.getByTestId("conta-global-resumo")).toBeInTheDocument();

      // Aba 4: paginação 5 em 5 no CNPJ 2 inicialmente selecionado
      fireEvent.click(screen.getByRole("tab", { name: /4 · Licitações & Cofre/i }));
      await waitFor(() => expect(screen.getByText("EDITAL-EMP2-1")).toBeInTheDocument());
      expect(screen.getByText("EDITAL-EMP2-5")).toBeInTheDocument();
      expect(screen.queryByText("EDITAL-EMP2-6")).not.toBeInTheDocument();
      expect(screen.queryByText("EDITAL-EMP1")).not.toBeInTheDocument();

      // Troca para CNPJ 1 no seletor de cards do topo
      fireEvent.click(screen.getByTestId("cnpj-card-tnt_c360_1"));
      await waitFor(() => expect(screen.getByText("EDITAL-EMP1")).toBeInTheDocument());
      expect(screen.queryByText("EDITAL-EMP2-1")).not.toBeInTheDocument();

      // Espelhar visão do cliente consulta o CNPJ selecionado (tnt_c360_1)
      fireEvent.click(screen.getByRole("button", { name: /Espelhar visão do cliente/i }));
      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/admin/clientes/tnt_c360_1?espelho=1",
          expect.any(Object),
        ),
      );

      // Aba 2 destaca o CNPJ selecionado (tnt_c360_1) com Visualizando
      fireEvent.click(screen.getByRole("tab", { name: /2 · Empresas/i }));
      expect(screen.getByText("Visualizando")).toBeInTheDocument();

      view.unmount();
    });
  });

  describe("Tarefa 6 — Financeiro (/admin/financeiro): Consolidação, 7 Colunas, Paginação 10x10 e Modal Unificado", () => {
    it("6.1 Exibe 7 colunas exatas, pagina 10 em 10 e abre modal Acessar Faturamento do cliente com explicação Dar Baixa", async () => {
      const clientesMock: SuperAdminTenantItem[] = Array.from({ length: 12 }, (_, idx) => ({
        id: `tnt_fin_${idx + 1}`,
        cnpj: gerarCnpjValido(`600000${String(idx + 1).padStart(2, "0")}`),
        razaoSocial: `Financeiro Cliente ${idx + 1} Ltda`,
        nomeFantasia: `FinCliente ${String(idx + 1).padStart(2, "0")}`,
        plano: idx === 0 ? "ENTERPRISE" : "PRO",
        billingStatus: idx % 2 === 0 ? "ATIVO" : "TRIAL",
        diasRestantesTrial: idx % 2 === 0 ? 0 : 7,
        diasAtraso: 0,
        cotaBaseMb: 2048,
        cotaExtraMb: 0,
        cotaTotalMb: 2048,
        espacoUsadoMb: 50,
        percentualUsado: 2,
        volumeArrematado: 0,
        totalContempladas: 0,
        qtdCnpjs: idx === 0 ? 3 : 1,
        cnpjsAdicionaisCount: idx === 0 ? 2 : 0,
        titularNome: `Titular Fin ${idx + 1}`,
        titularEmail: `fin${idx + 1}@empresa.com.br`,
        valorMensalidade: idx === 0 ? 997 : 497,
        cupomCodigo: idx === 0 ? "VIP20" : null,
        trialFim: idx % 2 === 0 ? null : new Date(Date.now() + 7 * 86400000),
        vencimentoAssinatura: idx % 2 === 0 ? new Date(Date.now() + 20 * 86400000) : null,
        criadoEm: new Date(),
      }));

      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          new Response(JSON.stringify({ clientes: clientesMock, cupons: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      );

      const view = render(<FinanceiroScreen />);
      await waitFor(() => expect(screen.getByText("FinCliente 01")).toBeInTheDocument());

      // Exatamente as 7 colunas solicitadas
      for (const col of [
        "Cliente / E-mail",
        "Qtd de CNPJ",
        "Plano",
        "Status Financeiro",
        "Vencimento / Trial",
        "Cupom",
        "Faturamento",
      ]) {
        expect(screen.getByRole("columnheader", { name: col })).toBeInTheDocument();
      }
      expect(screen.queryByRole("columnheader", { name: "Mensalidade" })).not.toBeInTheDocument();
      expect(screen.queryByRole("columnheader", { name: "Ações Rápidas" })).not.toBeInTheDocument();

      // Paginação 10 em 10: item 11 não está na página 1
      expect(screen.getByText("3 CNPJ(s)")).toBeInTheDocument();
      expect(screen.queryByText("FinCliente 11")).not.toBeInTheDocument();

      // Apenas 1 botão "Acessar Faturamento do cliente" por linha (sem +7d Trial / Dar baixa na linha)
      const btnsFaturamento = screen.getAllByRole("button", {
        name: /Acessar Faturamento do cliente/i,
      });
      expect(btnsFaturamento).toHaveLength(10);

      // Abre o Modal unificado e verifica explicação clara de Dar Baixa (+30 dias)
      fireEvent.click(btnsFaturamento[0]);
      await waitFor(() =>
        expect(
          screen.getByText(/Registrar Pagamento Manual \(Dar Baixa \+30 dias\)/i),
        ).toBeInTheDocument(),
      );
      expect(screen.getByRole("button", { name: /\+7d Trial/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /\+14d Trial/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Dar Baixa \(\+30d\)/i })).toBeInTheDocument();

      const finSrc = fs.readFileSync(
        path.resolve(process.cwd(), "src/components/admin/screens/FinanceiroScreen.tsx"),
        "utf-8",
      );
      expect(finSrc).not.toContain('type="purple"');
      view.unmount();
    });
  });

  describe("Regressão & Hardening Code Review Issue #50 (B1, B2, B3, S1, S2, S7)", () => {
    it("B1.1 Dossiê 360º, listagem, ação financeira e criação de empresa exigem vínculo TITULAR ativo (zero vazamento via MEMBRO)", async () => {
      const contaA = await seedContaMultiCnpj({ suffix: "8101", plano: "PRO", billingStatus: "TRIAL" });
      const contaB = await seedContaMultiCnpj({ suffix: "8102", plano: "ENTERPRISE", billingStatus: "ATIVO" });

      // Titular da conta A também atua apenas como MEMBRO na conta B (de outro titular)
      inMemoryTenantUsers.push({
        id: "tu_cross_membro_a_b",
        tenantId: contaB.t1Id,
        userId: contaA.userId,
        userEmail: contaA.email,
        userName: "Membro Cruzado",
        role: "MEMBRO",
        ativo: true,
        criadoEm: new Date(),
      });

      const dossieA = await obterDossieCliente360SuperAdmin(contaA.t1Id);
      const empresasA = dossieA.empresas.map((e) => e.id);
      expect(empresasA).toContain(contaA.t1Id);
      expect(empresasA).toContain(contaA.t2Id);
      expect(empresasA).not.toContain(contaB.t1Id);
      expect(empresasA).not.toContain(contaB.t2Id);

      // Ação financeira em conta A não pode alterar conta B
      await executarAcaoFinanceiraSuperAdmin({
        tenantId: contaA.t1Id,
        action: "ALTERAR_PLANO",
        plano: "ENTERPRISE",
      });
      expect(inMemoryTenants.get(contaB.t1Id)?.billingStatus).toBe("ATIVO");

      // Membro puro (sem nenhum TITULAR) cadastrando nova empresa não herda plano/status da conta B
      const pureMemberId = "usr_pure_member_b";
      memUsers.set(pureMemberId, {
        id: pureMemberId,
        name: "Membro Puro",
        email: "membro.puro@outro.com.br",
        role: "OPERADOR",
        ativo: true,
        sessionVersion: 1,
        criadoEm: new Date(),
      });
      inMemoryTenantUsers.push({
        id: "tu_pure_member_b",
        tenantId: contaB.t1Id,
        userId: pureMemberId,
        userEmail: "membro.puro@outro.com.br",
        userName: "Membro Puro",
        role: "MEMBRO",
        ativo: true,
        criadoEm: new Date(),
      });

      const novaEmp = await salvarEmpresaClienteSuperAdmin({
        ownerUserId: pureMemberId,
        cnpj: gerarCnpjValido("88112233"),
        razaoSocial: "NOVA EMPRESA PROPRIA LTDA",
      });
      expect(novaEmp.empresa.plano).toBe("BASICO");
      expect(novaEmp.empresa.billingStatus).toBe("TRIAL");
    });

    it("B1.2–B1.3 Edição cadastral preserva Trial 14d; mudança financeira e cotas propagam entre irmãos; leitura determinística de primaryRaw", async () => {
      const trialOriginal = new Date(Date.now() + 12 * 86400000);
      const conta = await seedContaMultiCnpj({
        suffix: "8103",
        plano: "PRO",
        billingStatus: "TRIAL",
        trialFim: trialOriginal,
        maxCnpjs: 3,
      });

      // Edição apenas cadastral na Aba 2 (mesmo enviando plano/status atuais no payload) NÃO reseta trialFim para +7d
      await salvarEmpresaClienteSuperAdmin({
        tenantId: conta.t1Id,
        ownerUserId: conta.userId,
        cnpj: conta.cnpj1,
        razaoSocial: "EMPRESA MATRIZ 8103 EDITADA LTDA",
        plano: "PRO",
        billingStatus: "TRIAL",
      });
      expect(inMemoryTenants.get(conta.t1Id)?.trialFim?.getTime()).toBe(trialOriginal.getTime());

      // Mudança real de plano em uma filial propaga para matriz e demais filiais
      await salvarEmpresaClienteSuperAdmin({
        tenantId: conta.t2Id,
        ownerUserId: conta.userId,
        cnpj: conta.cnpj2,
        razaoSocial: "EMPRESA FILIAL 8103 LTDA",
        plano: "ENTERPRISE",
      });
      expect(inMemoryTenants.get(conta.t1Id)?.plano).toBe("ENTERPRISE");
      expect(inMemoryTenants.get(conta.t2Id)?.plano).toBe("ENTERPRISE");

      // atualizarCotasClienteSuperAdmin em t2Id sincroniza maxCnpjs/maxUsers no CNPJ primário t1Id
      await atualizarCotasClienteSuperAdmin({
        tenantId: conta.t2Id,
        maxCnpjs: 8,
        maxUsers: 20,
      });
      expect(inMemoryTenants.get(conta.t1Id)?.maxCnpjs).toBe(8);
      expect(inMemoryTenants.get(conta.t1Id)?.maxUsers).toBe(20);
      expect(inMemoryTenants.get(conta.t2Id)?.maxCnpjs).toBe(8);

      // Notas gravadas via atualizarContaPrincipalSuperAdmin persistem e são lidas no primaryRaw mesmo abrindo dossiê pela filial
      await atualizarContaPrincipalSuperAdmin({
        userId: conta.userId,
        notasInternasAdm: "Cliente VIP conta consolidada",
      });
      const dossieViaFilial = await obterDossieCliente360SuperAdmin(conta.t2Id);
      expect(dossieViaFilial.notasInternasAdm).toBe("Cliente VIP conta consolidada");
      expect(dossieViaFilial.contaGlobal?.valorMensalidade).toBe(997);
    });

    it("S1 Webhook Asaas propaga status/plano para CNPJs irmãos e limpa trialFim", async () => {
      const conta = await seedContaMultiCnpj({ suffix: "8104", plano: "PRO", billingStatus: "TRIAL" });

      await processarWebhookAsaas({
        id: `evt_asaas_${Date.now()}`,
        event: "PAYMENT_CONFIRMED",
        payment: {
          id: `pay_${Date.now()}`,
          customer: "cus_test_1",
          subscription: "sub_test_1",
          value: 997,
          description: "Assinatura Plano ENTERPRISE",
          externalReference: conta.t1Id,
        },
      });

      expect(inMemoryTenants.get(conta.t1Id)?.billingStatus).toBe("ATIVO");
      expect(inMemoryTenants.get(conta.t1Id)?.trialFim).toBeNull();
      expect(inMemoryTenants.get(conta.t1Id)?.plano).toBe("ENTERPRISE");
      expect(inMemoryTenants.get(conta.t2Id)?.billingStatus).toBe("ATIVO");
      expect(inMemoryTenants.get(conta.t2Id)?.trialFim).toBeNull();
      expect(inMemoryTenants.get(conta.t2Id)?.plano).toBe("ENTERPRISE");
    });

    it("S2 & S7 Auditoria registra snapshot `antes` em Conta/Empresa/Usuário e Espelho + /api/audit respeitam isolamento", async () => {
      const conta = await seedContaMultiCnpj({ suffix: "8105", plano: "PRO", billingStatus: "ATIVO" });
      const rawBefore = inMemoryTenants.get(conta.t1Id)!;
      rawBefore.segmentos = [];
      inMemoryTenants.set(conta.t1Id, rawBefore);

      // Espelho sem segmentos retorna configuracaoPendente = true e catálogo vazio
      insertInMemoryLicitacao({
        idPncp: "PNCP-8105-01",
        numeroEdital: "PE 8105/2026",
        orgaoNome: "Órgão 8105",
        orgaoCnpj: "00.000.000/0001-85",
        uf: "SP",
        municipio: "São Paulo",
        esfera: null,
        poder: null,
        modalidade: "Pregão",
        portalDisputa: null,
        miniResumo: "Edital",
        resumo: "Objeto",
        valorEstimado: 1000,
        dataAbertura: new Date(),
        dataEncerramentoProposta: null,
        dataPublicacaoPncp: new Date(),
        dataUltimaAtualizacao: new Date(),
        status: "PENDENTE",
        parecerIA: "GO",
        justificativaIA: null,
        tipoSistemaCodigo: null,
        atestadosExigidos: null,
        motivoRecusa: null,
        quantidadeLotes: 1,
        loteUnico: true,
        precoPorLote: false,
        isPresencial: false,
        distanciaGoianiaKm: null,
        linkPncp: null,
        linkSistemaOrigem: null,
        hashCritico: null,
        valorArrematado: null,
        responsavelId: null,
        modalidadeCodigo: null,
        numeroControlePNCP: null,
        segmentoMacro: "TECNOLOGIA_INFORMATICA",
        subcategorias: null,
      });

      const espelhoPendente = await obterEspelhamentoClienteSuperAdmin(conta.t1Id);
      expect(espelhoPendente.configuracaoPendente).toBe(true);
      expect(espelhoPendente.oportunidadesCatalogo).toEqual([]);

      // Mutações gravam `antes` em audit_log
      const logsBefore = getInMemoryAuditLogs().length;
      await atualizarContaPrincipalSuperAdmin({ userId: conta.userId, name: "Nome Novo 8105" });
      await salvarEmpresaClienteSuperAdmin({
        tenantId: conta.t1Id,
        ownerUserId: conta.userId,
        cnpj: conta.cnpj1,
        razaoSocial: "NOVA RAZAO 8105 LTDA",
      });
      await salvarUsuarioClienteSuperAdmin({
        tenantId: conta.t1Id,
        userId: conta.userId,
        name: "Nome Usuário 8105",
        email: conta.email,
        role: "DIRETORIA",
        tenantRole: "TITULAR",
        ativo: true,
      });
      const newLogs = getInMemoryAuditLogs().slice(logsBefore);
      expect(newLogs.some((l) => l.acao === "ADMIN_EDITAR_CONTA_PRINCIPAL" && l.antes?.name === "Titular 8105")).toBe(true);
      expect(newLogs.some((l) => l.acao === "ADMIN_EDITAR_EMPRESA_CLIENTE" && l.antes?.razaoSocial === "EMPRESA MATRIZ 8105 LTDA")).toBe(true);
      expect(newLogs.some((l) => l.acao === "ADMIN_EDITAR_USUARIO_CLIENTE" && l.antes?.name === "Nome Novo 8105")).toBe(true);

      // /api/audit e /api/audit/export-csv retornam 401 sem sessão e 403 para SuperAdmin
      mockGetServerSession.mockResolvedValueOnce(null);
      expect((await auditGET(new Request("http://localhost:3011/api/audit"))).status).toBe(401);
      mockGetServerSession.mockResolvedValueOnce(null);
      expect((await auditExportGET(new Request("http://localhost:3011/api/audit/export-csv"))).status).toBe(401);

      const superSession = {
        user: {
          id: "usr_super",
          email: "vitorhenrique018@gmail.com",
          role: "SUPERADMIN",
          isSuperAdmin: true,
          adminRole: "SUPERADMIN_MASTER",
          ativo: true,
        },
      };
      mockGetServerSession.mockResolvedValue(superSession);
      expect((await auditGET(new Request("http://localhost:3011/api/audit"))).status).toBe(403);
      expect((await auditExportGET(new Request("http://localhost:3011/api/audit/export-csv"))).status).toBe(403);
    });

    it("B2.1 Middleware e rotas /api/* do cliente bloqueiam SuperAdmin com 403 e liberam /api/admin, /api/auth, /api/webhooks e /api/cron", async () => {
      // Middleware para SuperAdmin
      vi.spyOn(nextAuthJwt, "getToken").mockResolvedValue({
        email: "vitorhenrique018@gmail.com",
        role: "SUPERADMIN",
        isSuperAdmin: true,
        adminRole: "SUPERADMIN_MASTER",
        ativo: true,
      } as never);

      const resApiTenantsMw = await middleware(
        new NextRequest("http://localhost:3011/api/tenants", {
          headers: { cookie: "__Secure-next-auth.session-token=valid-adm" },
        }),
      );
      expect(resApiTenantsMw.status).toBe(403);

      const resApiAdminMw = await middleware(
        new NextRequest("http://localhost:3011/api/admin/metricas", {
          headers: { cookie: "__Secure-next-auth.session-token=valid-adm" },
        }),
      );
      expect(resApiAdminMw.status).toBe(200);

      // Rota /api/tenants sem sessão NÃO redireciona para /login no middleware
      vi.spyOn(nextAuthJwt, "getToken").mockResolvedValueOnce(null);
      const resApiUnauthMw = await middleware(new NextRequest("http://localhost:3011/api/tenants"));
      expect(resApiUnauthMw.status).toBe(200);

      // Guards diretos nas rotas do cliente
      mockGetServerSession.mockResolvedValue({
        user: {
          id: "usr_super_1",
          email: "vitorhenrique018@gmail.com",
          name: "Vítor Henrique",
          role: "SUPERADMIN",
          isSuperAdmin: true,
          adminRole: "SUPERADMIN_MASTER",
          ativo: true,
        },
      });

      expect((await tenantsRouteGET()).status).toBe(403);
      expect(
        (
          await tenantsRoutePOST(
            new Request("http://localhost:3011/api/tenants", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({}),
            }),
          )
        ).status,
      ).toBe(403);
      expect((await configEmpresaGET(new Request("http://localhost:3011/api/configuracoes/empresa"))).status).toBe(403);
      expect(
        (
          await configEmpresaPUT(
            new Request("http://localhost:3011/api/configuracoes/empresa", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({}),
            }),
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await planosCheckoutPOST(
            new NextRequest("http://localhost:3011/api/planos/checkout", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ plano: "PRO" }),
            }),
          )
        ).status,
      ).toBe(403);
      expect((await oportunidadesGET(new Request("http://localhost:3011/api/oportunidades"))).status).toBe(403);
      expect(
        (
          await oportunidadesPOST(
            new Request("http://localhost:3011/api/oportunidades", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({}),
            }),
          )
        ).status,
      ).toBe(403);
      expect((await dashboardGET(new Request("http://localhost:3011/api/dashboard"))).status).toBe(403);
      expect((await faturamentoGET(new NextRequest("http://localhost:3011/api/faturamento"))).status).toBe(403);
      expect((await suporteTicketsGET(new Request("http://localhost:3011/api/suporte/tickets"))).status).toBe(403);

      // /api/configuracoes/empresa também exige autenticação (401) sem sessão
      mockGetServerSession.mockResolvedValueOnce(null);
      expect((await configEmpresaGET(new Request("http://localhost:3011/api/configuracoes/empresa"))).status).toBe(401);

      // createTenantForUser bloqueia SuperAdmin na camada de serviço
      upsertInMemoryAuthUser({
        id: "usr_super_block",
        name: "Super Bloqueado",
        email: "super.bloqueado@portal.internal",
        role: "SUPERADMIN",
        ativo: true,
        isSuperAdmin: true,
        adminRole: "ADMIN_OPERACIONAL",
        sessionVersion: 1,
        passwordHash: "",
        activeTenantId: null,
        cnpj: null,
        plano: null,
        tenantRole: null,
      });
      await expect(
        createTenantForUser({
          userId: "usr_super_block",
          userEmail: "super.bloqueado@portal.internal",
          userName: "Super Bloqueado",
          userPlan: "PRO",
          input: {
            cnpj: gerarCnpjValido("99887766"),
            razaoSocial: "NAO DEVE CRIAR LTDA",
            uf: "SP",
            plano: "PRO",
          },
        }),
      ).rejects.toThrow(/Portal ADM/i);
    });

    it("B2.2–B2.3 Invariante master normaliza linha legada do banco e docker-entrypoint restringe '123456' fora de produção", async () => {
      const bcryptMod = await import("bcryptjs");
      const hashMaster = await bcryptMod.default.hash("SenhaForteProd@2026", 10);
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: "usr_vitor_legacy_db",
        name: "Vítor Henrique",
        email: "vitorhenrique018@gmail.com",
        role: "DIRETORIA",
        isSuperAdmin: false,
        adminRole: null,
        ativo: true,
        sessionVersion: 1,
        passwordHash: hashMaster,
        tenantMemberships: [{ tenantId: "tnt_legado", role: "TITULAR", tenant: { telefone: "62999990000" } }],
      } as never);

      const otpLookup = await findAuthUserForOtp("vitorhenrique018@gmail.com");
      expect(otpLookup?.isSuperAdmin).toBe(true);
      expect(otpLookup?.adminRole).toBe("SUPERADMIN_MASTER");
      expect(otpLookup?.telefone).toBeNull();

      const authClientAttempt = await authorizeCredentials({
        email: "vitorhenrique018@gmail.com",
        password: "SenhaForteProd@2026",
        realm: "client",
      });
      expect(authClientAttempt).toBeNull();

      const authAdminAttempt = await authorizeCredentials({
        email: "vitorhenrique018@gmail.com",
        password: "SenhaForteProd@2026",
        realm: "admin",
      });
      expect(authAdminAttempt?.role).toBe("SUPERADMIN");
      expect(authAdminAttempt?.isSuperAdmin).toBe(true);
      expect(authAdminAttempt?.adminRole).toBe("SUPERADMIN_MASTER");
      expect(authAdminAttempt?.activeTenantId).toBeNull();
      expect(
        getInMemoryAuditLogs().some(
          (l) => l.acao === "ADMIN_LOGIN" && l.entidadeId === "usr_vitor_legacy_db",
        ),
      ).toBe(true);

      const entrypointSrc = fs.readFileSync(
        path.resolve(process.cwd(), "scripts/docker-entrypoint.cjs"),
        "utf-8",
      );
      expect(entrypointSrc).toContain('process.env.NODE_ENV === "production"');
      expect(entrypointSrc).toContain('!isProdRuntime ? "123456" : randomBytes(32).toString("hex")');
    });

    it("B3 Lockout de OTP após 5 tentativas, realm default 'client', sem devCode em produção mesmo com STAGING=true, e rate-limit 429", async () => {
      // 1. Lockout de OTP após 5 erros
      const validCode = generateAndStoreOtp("lockout.test@portal.internal", "EMAIL_OTP");
      for (let i = 0; i < 5; i += 1) {
        expect(verifyOtpCode("lockout.test@portal.internal", "000000")).toBe(false);
      }
      // 6ª tentativa com o código correto já foi invalidada
      expect(verifyOtpCode("lockout.test@portal.internal", validCode)).toBe(false);

      // 2. Omissão de realm no POST /api/auth/otp assume 'client' -> bloqueia SuperAdmin (403)
      const resOmittedRealm = await otpPostRoute(
        new Request("http://localhost:3011/api/auth/otp", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-forwarded-for": "10.0.0.1" },
          body: JSON.stringify({
            email: "vitorhenrique018@gmail.com",
            method: "EMAIL_OTP",
          }),
        }),
      );
      expect(resOmittedRealm.status).toBe(403);

      // 3. CredentialsProvider.authorize sem realm assume 'client' -> bloqueia SuperAdmin
      const credProvider = authOptions.providers[0] as unknown as {
        options?: { authorize?: (c: Record<string, string>) => Promise<unknown> };
        authorize?: (c: Record<string, string>) => Promise<unknown>;
      };
      const fnAuthorize = credProvider.authorize ?? credProvider.options?.authorize;
      expect(typeof fnAuthorize).toBe("function");
      const viaProviderNoRealm = await fnAuthorize!({
        email: "vitorhenrique018@gmail.com",
        password: "123456",
      });
      expect(viaProviderNoRealm).toBeNull();

      // 4. STAGING=true em NODE_ENV=production NUNCA expõe devCode
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("STAGING", "true");
      upsertInMemoryAuthUser({
        id: "cli_prod_otp",
        name: "Cliente Prod",
        email: "cliente.prod@empresa.com.br",
        role: "DIRETORIA",
        ativo: true,
        isSuperAdmin: false,
        adminRole: null,
        sessionVersion: 1,
        passwordHash: "",
        activeTenantId: "tnt_prod",
        cnpj: null,
        plano: "PRO",
        tenantRole: "TITULAR",
      });
      const resProdStaging = await otpPostRoute(
        new Request("http://localhost:3011/api/auth/otp", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-forwarded-for": "10.0.0.2" },
          body: JSON.stringify({
            email: "cliente.prod@empresa.com.br",
            method: "EMAIL_OTP",
            realm: "client",
          }),
        }),
      );
      expect(resProdStaging.status).toBe(200);
      const bodyProdStaging = (await resProdStaging.json()) as { ok: boolean; devCode?: string };
      expect(bodyProdStaging.ok).toBe(true);
      expect(bodyProdStaging.devCode).toBeUndefined();
      vi.unstubAllEnvs();

      // 5. Rate-limit por e-mail retorna 429 após 5 requisições
      _resetOtpRateLimitForTesting();
      for (let i = 0; i < 5; i += 1) {
        const okRes = await otpPostRoute(
          new Request("http://localhost:3011/api/auth/otp", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-forwarded-for": `10.1.0.${i}` },
            body: JSON.stringify({
              email: "cliente.prod@empresa.com.br",
              method: "EMAIL_OTP",
              realm: "client",
            }),
          }),
        );
        expect(okRes.status).toBe(200);
      }
      const rateLimitedRes = await otpPostRoute(
        new Request("http://localhost:3011/api/auth/otp", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-forwarded-for": "10.1.0.99" },
          body: JSON.stringify({
            email: "cliente.prod@empresa.com.br",
            method: "EMAIL_OTP",
            realm: "client",
          }),
        }),
      );
      expect(rateLimitedRes.status).toBe(429);
      expect(rateLimitedRes.headers.get("Retry-After")).toBeTruthy();
    });
  });
});

import { describe, it, expect } from "vitest";
import { can, RbacUser } from "@/lib/rbac";
import {
  obterMetricasSuperAdmin,
  expandirCotaStorageTenant,
  listarTenantsSuperAdmin,
} from "@/server/services/superadmin.service";
import { verificarAcessoPaywall } from "@/server/services/paywall.service";

describe("Sprint SaaS 4 — Portal SuperAdmin, RBAC, Expansão R2 em 1 Clique & Paywall", () => {
  describe("Governança RBAC Centralizada para SuperAdmin", () => {
    it("deve autorizar SUPERADMIN para todas as ações administrativas", () => {
      const superAdminUser: RbacUser = {
        id: "usr_admin_1",
        email: "diretoria@portal.internal",
        role: "SUPERADMIN",
        ativo: true,
      };

      expect(can(superAdminUser, "superadmin:view", "admin")).toBe(true);
      expect(can(superAdminUser, "superadmin:manage", "admin")).toBe(true);
      expect(can(superAdminUser, "view", "dashboard")).toBe(true);
      expect(can(superAdminUser, "delete", "licitacao")).toBe(true);
    });

    it("deve bloquear usuários com papel DIRETORIA de gerenciar o SuperAdmin da plataforma", () => {
      const diretoriaUser: RbacUser = {
        id: "usr_dir_1",
        email: "socio@cliente.com.br",
        role: "DIRETORIA",
        ativo: true,
      };

      expect(can(diretoriaUser, "superadmin:view", "admin")).toBe(false);
      expect(can(diretoriaUser, "superadmin:manage", "admin")).toBe(false);
      // Mas continua podendo gerenciar suas próprias licitações e equipe
      expect(can(diretoriaUser, "view", "dashboard")).toBe(true);
      expect(can(diretoriaUser, "decide_go_nogo", "licitacao")).toBe(true);
    });

    it("deve bloquear OPERADOR de qualquer acesso ao SuperAdmin", () => {
      const operadorUser: RbacUser = {
        id: "usr_op_1",
        email: "operador@cliente.com.br",
        role: "OPERADOR",
        ativo: true,
      };

      expect(can(operadorUser, "superadmin:view", "admin")).toBe(false);
      expect(can(operadorUser, "superadmin:manage", "admin")).toBe(false);
    });
  });

  describe("Serviço SuperAdmin — Métricas Executivas & Gestão de Tenants", () => {
    it("deve calcular métricas consolidadas com MRR, tenants e volume arrematado", async () => {
      const metricas = await obterMetricasSuperAdmin();

      expect(metricas).toBeDefined();
      expect(typeof metricas.mrrEstimado).toBe("number");
      expect(typeof metricas.totalTenants).toBe("number");
      expect(typeof metricas.totalVolumeArrematado).toBe("number");
      expect(typeof metricas.r2StorageTotalMb).toBe("number");
    });

    it("deve expandir cota de armazenamento R2 de um tenant com 1 clique (+1024 MB)", async () => {
      const res = await expandirCotaStorageTenant({
        tenantId: "tnt_test_mock",
        adicionarMb: 1024,
        motivo: "Expansão de cortesia solicitada via WhatsApp",
      });

      expect(res.ok).toBe(true);
      expect(res.novaCotaExtraMb).toBeGreaterThanOrEqual(1024);
      expect(res.cotaTotalMb).toBeGreaterThanOrEqual(1024);
    });

    it("deve listar tenants com informações de uso de cota e faturamento", async () => {
      const tenants = await listarTenantsSuperAdmin();
      expect(Array.isArray(tenants)).toBe(true);
    });
  });

  describe("Mecanismo de Paywall Suave & Whitelist de Rotas", () => {
    it("deve liberar rotas públicas e de pagamento mesmo com status BLOQUEADO", () => {
      const rotasPublicas = [
        "/",
        "/login",
        "/checkout",
        "/faturamento",
        "/api/auth/session",
        "/api/webhooks/asaas",
      ];

      for (const rota of rotasPublicas) {
        const decisao = verificarAcessoPaywall({
          pathname: rota,
          billingStatus: "BLOQUEADO",
        });
        expect(decisao.permitido).toBe(true);
      }
    });

    it("deve liberar rotas operacionais durante GRACE_PERIOD com indicação de aviso", () => {
      const decisao = verificarAcessoPaywall({
        pathname: "/oportunidades",
        billingStatus: "GRACE_PERIOD",
      });

      expect(decisao.permitido).toBe(true);
      expect(decisao.exibirBannerAviso).toBe(true);
    });

    it("deve bloquear rotas operacionais e sugerir redirecionamento quando BLOQUEADO", () => {
      const decisao = verificarAcessoPaywall({
        pathname: "/oportunidades",
        billingStatus: "BLOQUEADO",
      });

      expect(decisao.permitido).toBe(false);
      expect(decisao.redirecionarPara).toBe("/faturamento");
    });
  });
});

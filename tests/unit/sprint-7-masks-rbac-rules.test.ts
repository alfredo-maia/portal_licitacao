import { describe, expect, it } from "vitest";
import {
  maskCnpj,
  maskCpf,
  maskNumericOnly,
  isValidEmail,
  sanitizeEmail,
  FAIXAS_VALOR_SPRINT7,
} from "@/lib/masks";
import {
  canManageTeamMember,
  getVisibleConfigTabs,
  getRoleHierarchyLevel,
} from "@/lib/rbac";

describe("Sprint 7 — Máscaras, Faixas de Valor & Governança RBAC", () => {
  describe("1. Máscaras e Formatações Globais", () => {
    it("deve aplicar máscara de CNPJ corretamente", () => {
      expect(maskCnpj("12345678000190")).toBe("12.345.678/0001-90");
      expect(maskCnpj("12.345.678/0001-90")).toBe("12.345.678/0001-90");
      expect(maskCnpj("1234567")).toBe("12.345.67");
    });

    it("deve aplicar máscara de CPF corretamente", () => {
      expect(maskCpf("12345678900")).toBe("123.456.789-00");
      expect(maskCpf("123.456.789-00")).toBe("123.456.789-00");
    });

    it("deve extrair estritamente números para inputs monetários", () => {
      expect(maskNumericOnly("R$ 1.500.000,00")).toBe("150000000");
      expect(maskNumericOnly("abc123xyz456")).toBe("123456");
      expect(maskNumericOnly("007")).toBe("007");
    });

    it("deve validar formato sintático de e-mails", () => {
      expect(isValidEmail("vitor@aponta.cloud")).toBe(true);
      expect(isValidEmail("contato@empresa.com.br")).toBe(true);
      expect(isValidEmail("invalido")).toBe(false);
      expect(isValidEmail("sem_arroba.com")).toBe(false);
      expect(isValidEmail("com espaco@dominio.com")).toBe(false);
    });

    it("deve higienizar e-mail em lowercase sem espaços", () => {
      expect(sanitizeEmail("  Vitor@Aponta.Cloud  ")).toBe("vitor@aponta.cloud");
    });
  });

  describe("2. Faixas de Valor de Licitações (Item 2.9)", () => {
    it("deve conter as 6 faixas de valor exatas solicitadas na Sprint 7", () => {
      const ids = FAIXAS_VALOR_SPRINT7.map((f) => f.id);
      expect(ids).toContain("ATE_100K");
      expect(ids).toContain("100K_A_200K");
      expect(ids).toContain("200K_A_500K");
      expect(ids).toContain("500K_A_1M");
      expect(ids).toContain("1M_A_2M");
      expect(ids).toContain("ACIMA_2M");

      const faixa100k = FAIXAS_VALOR_SPRINT7.find((f) => f.id === "ATE_100K");
      expect(faixa100k?.max).toBe(100000);

      const faixaAcima2M = FAIXAS_VALOR_SPRINT7.find((f) => f.id === "ACIMA_2M");
      expect(faixaAcima2M?.min).toBe(2000000);
      expect(faixaAcima2M?.max).toBeUndefined();
    });
  });

  describe("3. Governança RBAC da Gestão da Equipe (Item 11.2)", () => {
    const usrDiretoria = { id: "usr_dir_1", role: "DIRETORIA", ativo: true };
    const usrAnalista1 = { id: "usr_ana_1", role: "ANALISTA_COMERCIAL", ativo: true };
    const usrAnalista2 = { id: "usr_ana_2", role: "ANALISTA_COMERCIAL", ativo: true };
    const usrOperador = { id: "usr_op_1", role: "OPERADOR", ativo: true };

    it("o próprio usuário NÃO pode se inativar", () => {
      const res = canManageTeamMember({
        actor: usrDiretoria,
        targetUser: usrDiretoria,
        action: "toggle_ativo",
        newAtivo: false,
      });
      expect(res.allowed).toBe(false);
      expect(res.reason).toMatch(/próprio usuário não pode inativar sua própria conta/i);
    });

    it("o próprio usuário NÃO pode alterar seu próprio cargo", () => {
      const res = canManageTeamMember({
        actor: usrAnalista1,
        targetUser: usrAnalista1,
        action: "update_role",
        newRole: "DIRETORIA",
      });
      expect(res.allowed).toBe(false);
      expect(res.reason).toMatch(/próprio usuário não pode alterar seu próprio cargo/i);
    });

    it("ANALISTA COMERCIAL NÃO pode cadastrar usuário de nível DIRETORIA", () => {
      const res = canManageTeamMember({
        actor: usrAnalista1,
        action: "create",
        newRole: "DIRETORIA",
      });
      expect(res.allowed).toBe(false);
      expect(res.reason).toMatch(/não pode cadastrar um usuário com perfil de Diretoria/i);
    });

    it("ANALISTA COMERCIAL pode cadastrar OPERADOR ou outro ANALISTA COMERCIAL", () => {
      const res = canManageTeamMember({
        actor: usrAnalista1,
        action: "create",
        newRole: "OPERADOR",
      });
      expect(res.allowed).toBe(true);
    });

    it("ANALISTA COMERCIAL NÃO pode alterar cargo de DIRETORIA nem inativar DIRETORIA", () => {
      const resUpdate = canManageTeamMember({
        actor: usrAnalista1,
        targetUser: usrDiretoria,
        action: "update_role",
        newRole: "ANALISTA_COMERCIAL",
      });
      expect(resUpdate.allowed).toBe(false);

      const resInativar = canManageTeamMember({
        actor: usrAnalista1,
        targetUser: usrDiretoria,
        action: "toggle_ativo",
        newAtivo: false,
      });
      expect(resInativar.allowed).toBe(false);
    });

    it("ANALISTA COMERCIAL NÃO pode inativar nem alterar cargo de outro ANALISTA COMERCIAL", () => {
      const resInativar = canManageTeamMember({
        actor: usrAnalista1,
        targetUser: usrAnalista2,
        action: "toggle_ativo",
        newAtivo: false,
      });
      expect(resInativar.allowed).toBe(false);

      const resUpdate = canManageTeamMember({
        actor: usrAnalista1,
        targetUser: usrAnalista2,
        action: "update_role",
        newRole: "OPERADOR",
      });
      expect(resUpdate.allowed).toBe(false);
    });

    it("ANALISTA COMERCIAL NÃO pode inativar nem alterar cargo de OPERADOR (Item 11.3)", () => {
      const resInativar = canManageTeamMember({
        actor: usrAnalista1,
        targetUser: usrOperador,
        action: "toggle_ativo",
        newAtivo: false,
      });
      expect(resInativar.allowed).toBe(false);
      expect(resInativar.reason).toMatch(/exclusivo Diretoria/i);

      const resUpdate = canManageTeamMember({
        actor: usrAnalista1,
        targetUser: usrOperador,
        action: "update_role",
        newRole: "ANALISTA_COMERCIAL",
      });
      expect(resUpdate.allowed).toBe(false);
      expect(resUpdate.reason).toMatch(/exclusivo Diretoria/i);
    });

    it("OPERADOR TÉCNICO não pode criar, editar ou inativar ninguém", () => {
      const resCreate = canManageTeamMember({
        actor: usrOperador,
        action: "create",
        newRole: "OPERADOR",
      });
      expect(resCreate.allowed).toBe(false);

      const resInativar = canManageTeamMember({
        actor: usrOperador,
        targetUser: usrAnalista1,
        action: "toggle_ativo",
        newAtivo: false,
      });
      expect(resInativar.allowed).toBe(false);
    });

    it("DIRETORIA pode alterar cargos e status de níveis inferiores", () => {
      const res = canManageTeamMember({
        actor: usrDiretoria,
        targetUser: usrAnalista1,
        action: "update_role",
        newRole: "OPERADOR",
      });
      expect(res.allowed).toBe(true);
    });
  });

  describe("4. Visibilidade de Abas em /configuracoes (Item 11.2)", () => {
    it("DIRETORIA deve ter acesso a ver todas as 4 abas", () => {
      expect(getVisibleConfigTabs("DIRETORIA")).toEqual([0, 1, 2, 3]);
    });

    it("ANALISTA COMERCIAL deve ter acesso a Meu Perfil (0) e Gestão de Equipe (2)", () => {
      expect(getVisibleConfigTabs("ANALISTA_COMERCIAL")).toEqual([0, 2]);
    });

    it("OPERADOR TÉCNICO deve ter acesso apenas a Meu Perfil (0)", () => {
      expect(getVisibleConfigTabs("OPERADOR")).toEqual([0]);
    });
  });
});

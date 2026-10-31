import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { authorizeCredentials } from "@/server/auth";
import { realizarCadastroConta } from "@/server/services/cadastro.service";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

describe("Sprint SaaS — Persistência Multi-Tenant Real no PostgreSQL & Docker Entrypoint (#17)", () => {
  describe("1. Validação de DDL SaaS no docker-entrypoint.cjs", () => {
    it("deve conter todos os ENUMs e tabelas multi-tenant necessários para PostgreSQL em produção", () => {
      const entrypointPath = path.join(process.cwd(), "scripts", "docker-entrypoint.cjs");
      expect(fs.existsSync(entrypointPath)).toBe(true);

      const content = fs.readFileSync(entrypointPath, "utf-8");

      // Verificação de ENUMs
      expect(content).toContain("PlanoAssinatura");
      expect(content).toContain("TenantRole");
      expect(content).toContain("TenantBillingStatus");
      expect(content).toContain("WhatsAppStatus");

      // Verificação de Tabelas SaaS
      expect(content).toContain('CREATE TABLE IF NOT EXISTS "tenant"');
      expect(content).toContain('CREATE TABLE IF NOT EXISTS "tenant_user"');
      expect(content).toContain('CREATE TABLE IF NOT EXISTS "tenant_licitacao"');
      expect(content).toContain('CREATE TABLE IF NOT EXISTS "tenant_convite"');
      expect(content).toContain('CREATE TABLE IF NOT EXISTS "whatsapp_mensagem"');
      expect(content).toContain('CREATE TABLE IF NOT EXISTS "asaas_webhook_event"');

      // Verificação de Colunas Multi-Tenant em tabelas existentes
      expect(content).toContain('"configuracao_empresa" ADD COLUMN IF NOT EXISTS "tenantId"');
      expect(content).toContain('"documento" ADD COLUMN IF NOT EXISTS "tenantId"');
      expect(content).toContain('"audit_log" ADD COLUMN IF NOT EXISTS "tenantId"');
      expect(content).toContain('"User" ADD COLUMN IF NOT EXISTS "isSuperAdmin"');
    });
  });

  describe("2. Cadastro de Clientes e Validações de Banco", () => {
    it("deve bloquear tentativa de cadastro quando o e-mail já existe", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValueOnce({
        id: "usr_existente",
        email: "padaria@gmail.com",
      } as any);

      await expect(
        realizarCadastroConta({
          nomeResponsavel: "Carlos Padaria",
          nome: "Carlos Padaria",
          email: "padaria@gmail.com",
          cnpj: "64.631.308/0001-18",
          razaoSocial: "PADARIA DO CARLOS LTDA",
          whatsapp: "62999998888",
          senha: "SenhaSegura@2026",
          segmentos: ["ALIMENTOS_MERENDA_ESCOLAR"],
          subsegmentos: [],
          ufs: ["GO"],
          brasilInteiro: true,
        }),
      ).rejects.toThrow(/já está cadastrado/i);
    });

    it("deve bloquear tentativa de cadastro quando o CNPJ já possui conta cadastrada", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValueOnce(null);
      vi.spyOn(prisma.tenant, "findUnique").mockResolvedValueOnce({
        id: "tnt_existente",
        cnpj: "64.631.308/0001-18",
      } as any);

      await expect(
        realizarCadastroConta({
          nomeResponsavel: "Outro Responsável",
          nome: "Outro Responsável",
          email: "outro_email@gmail.com",
          cnpj: "64.631.308/0001-18",
          razaoSocial: "PADARIA DO CARLOS LTDA",
          whatsapp: "62999998888",
          senha: "SenhaSegura@2026",
          segmentos: ["ALIMENTOS_MERENDA_ESCOLAR"],
          subsegmentos: [],
          ufs: ["GO"],
          brasilInteiro: true,
        }),
      ).rejects.toThrow(/CNPJ já possui uma conta/i);
    });
  });

  describe("3. Autenticação e Resiliência do authorizeCredentials", () => {
    it("deve autenticar cliente com sucesso mesmo se include de tenantMemberships falhar no primeiro momento", async () => {
      const senhaPlana = "SenhaPadaria@2026";
      const hash = await bcrypt.hash(senhaPlana, 10);

      // Primeiro findUnique com include falha (simulando erro de join)
      // Segundo findUnique sem include sucede
      vi.spyOn(prisma.user, "findUnique")
        .mockRejectedValueOnce(new Error('relation "tenant_user" does not exist'))
        .mockResolvedValueOnce({
          id: "usr_cliente_1",
          name: "Cliente Padaria",
          email: "padaria_cliente@gmail.com",
          passwordHash: hash,
          role: "DIRETORIA",
          ativo: true,
        } as any);

      const sessionUser = await authorizeCredentials({
        email: "padaria_cliente@gmail.com",
        password: senhaPlana,
      });

      expect(sessionUser).not.toBeNull();
      expect(sessionUser?.email).toBe("padaria_cliente@gmail.com");
      expect(sessionUser?.name).toBe("Cliente Padaria");
      expect(sessionUser?.role).toBe("DIRETORIA");
    });
  });
});


import { describe, expect, it } from "vitest";
import {
  isValidCnpj,
  formatCnpj,
  cleanCnpj,
} from "@/lib/validations/cnpj";
import {
  sanitizeEmail,
  isValidEmailFormat,
  isDisposableEmail,
  validateCorporateEmail,
} from "@/lib/validations/email";
import {
  PLAN_LIMITS,
  PlanoAssinaturaEnum,
  TenantRoleEnum,
  cnpjSchema,
  corporateEmailSchema,
  createTenantSchema,
  inviteMemberSchema,
} from "@/server/schemas/tenant.schema";
import {
  SESSION_MAX_AGE_SECONDS,
  authMethodSchema,
  loginCredentialsSchema,
  requestOtpSchema,
  verifyOtpSchema,
  sessionUserSchema,
} from "@/server/schemas/auth.schema";
import { getTenantPrisma } from "@/server/db/tenant-prisma";

describe("Sprint SaaS 1 — Schemas, Validações de CNPJ/E-mail, Multi-Tenant e Sessão (Issue #9)", () => {
  describe("1. Algoritmo Oficial de Módulo 11 da Receita Federal para CNPJ", () => {
    it("deve validar CNPJs matematicamente autênticos com pontuação e sem pontuação", () => {
      // CNPJ de teste padrão com dígitos verificadores válidos (ex: Banco do Brasil e Receita Federal)
      expect(isValidCnpj("00.000.000/0001-91")).toBe(true);
      expect(isValidCnpj("00000000000191")).toBe(true);
      expect(isValidCnpj("33.000.167/0001-01")).toBe(true); // Petrobras
      expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    });

    it("deve rejeitar CNPJs com dígitos verificadores matematicamente incorretos", () => {
      expect(isValidCnpj("00.000.000/0001-00")).toBe(false);
      expect(isValidCnpj("12.345.678/0001-99")).toBe(false);
      expect(isValidCnpj("11.222.333/0001-00")).toBe(false);
    });

    it("deve rejeitar sequências de dígitos idênticos mesmo que o tamanho seja 14", () => {
      expect(isValidCnpj("00.000.000/0000-00")).toBe(false);
      expect(isValidCnpj("11.111.111/1111-11")).toBe(false);
      expect(isValidCnpj("22.222.222/2222-22")).toBe(false);
      expect(isValidCnpj("99.999.999/9999-99")).toBe(false);
    });

    it("deve limpar e formatar CNPJ corretamente", () => {
      expect(cleanCnpj("00.000.000/0001-91")).toBe("00000000000191");
      expect(formatCnpj("00000000000191")).toBe("00.000.000/0001-91");
    });
  });

  describe("2. Validação de E-mail Corporativo e Bloqueio de Descartáveis", () => {
    it("deve sanitizar o e-mail em minúsculas e sem espaços externos", () => {
      expect(sanitizeEmail("  Gestor@Empresa.COM.br  ")).toBe("gestor@empresa.com.br");
    });

    it("deve aceitar e-mails corporativos e válidos", () => {
      const valid = validateCorporateEmail("licitacoes@empresa.com.br");
      expect(valid.isValid).toBe(true);
      expect(valid.sanitized).toBe("licitacoes@empresa.com.br");
    });

    it("deve rejeitar e-mails com formatos RFC sintaticamente inválidos", () => {
      expect(isValidEmailFormat("invalido")).toBe(false);
      expect(isValidEmailFormat("usuario@semdominio")).toBe(false);
      expect(isValidEmailFormat("@dominio.com")).toBe(false);
    });

    it("deve bloquear sumariamente e-mails descartáveis e temporários", () => {
      expect(isDisposableEmail("teste@mailinator.com")).toBe(true);
      expect(isDisposableEmail("fake@tempmail.com")).toBe(true);
      expect(isDisposableEmail("anon@guerrillamail.com")).toBe(true);
      expect(isDisposableEmail("fake@sharklasers.com")).toBe(true);

      const result = validateCorporateEmail("fraude@mailinator.com");
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("E-mails temporários ou descartáveis não são permitidos");
    });
  });

  describe("3. Schemas Zod de Criação de Tenant & Limites de Planos", () => {
    it("deve validar input completo de criação de Tenant com CNPJ válido", () => {
      const input = {
        cnpj: "33.000.167/0001-01",
        razaoSocial: "Petróleo Brasileiro S.A.",
        nomeFantasia: "Petrobras",
        cnaePrincipal: "06.00-0-01",
        endereco: "Av. República do Chile, 65",
        cidade: "Rio de Janeiro",
        uf: "RJ",
        plano: "PRO",
      };

      const parsed = createTenantSchema.safeParse(input);
      expect(parsed.success).toBe(true);
    });

    it("deve falhar a validação Zod se o CNPJ for matematicamente falso", () => {
      const input = {
        cnpj: "11.111.111/1111-11",
        razaoSocial: "Empresa Falsa LTDA",
        plano: "BASICO",
      };

      const parsed = createTenantSchema.safeParse(input);
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.errors[0].message).toContain("CNPJ inválido");
      }
    });

    it("deve garantir a escada de valor correta de limites nos planos Básico, Pro e Enterprise", () => {
      expect(PLAN_LIMITS.BASICO.maxCnpjs).toBe(1);
      expect(PLAN_LIMITS.BASICO.maxUsers).toBe(1);
      expect(PLAN_LIMITS.BASICO.maxMacroSegmentos).toBe(1);

      expect(PLAN_LIMITS.PRO.maxCnpjs).toBe(2);
      expect(PLAN_LIMITS.PRO.maxUsers).toBe(2);
      expect(PLAN_LIMITS.PRO.maxMacroSegmentos).toBe(3);

      expect(PLAN_LIMITS.ENTERPRISE.maxCnpjs).toBe(5);
      expect(PLAN_LIMITS.ENTERPRISE.maxUsers).toBe(5);
      expect(PLAN_LIMITS.ENTERPRISE.maxMacroSegmentos).toBe(7);
      expect(PLAN_LIMITS.ENTERPRISE.temRelatoriosDiretoria).toBe(true);
      expect(PLAN_LIMITS.ENTERPRISE.temChatPregoeiro).toBe(true);
    });
  });

  describe("4. Gestão de Convites da Equipe (TenantConvite)", () => {
    it("deve validar convite com e-mail corporativo válido e papel permitido", () => {
      const valid = inviteMemberSchema.safeParse({
        email: "operador.licitacao@empresa.com.br",
        role: "MEMBRO",
      });
      expect(valid.success).toBe(true);
      if (valid.success) {
        expect(valid.data.email).toBe("operador.licitacao@empresa.com.br");
        expect(valid.data.role).toBe("MEMBRO");
      }
    });

    it("deve rejeitar convite com e-mail temporário", () => {
      const invalid = inviteMemberSchema.safeParse({
        email: "spammer@tempmail.com",
        role: "MEMBRO",
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe("5. Autenticação Multicanal & Duração da Sessão (30 Dias)", () => {
    it("deve garantir a duração oficial de 30 dias de persistência da sessão JWT", () => {
      expect(SESSION_MAX_AGE_SECONDS).toBe(30 * 24 * 60 * 60);
      expect(SESSION_MAX_AGE_SECONDS).toBe(2592000);
    });

    it("deve suportar os 3 métodos de entrada multicanal", () => {
      expect(authMethodSchema.options).toContain("PASSWORD");
      expect(authMethodSchema.options).toContain("WHATSAPP_OTP");
      expect(authMethodSchema.options).toContain("EMAIL_OTP");
    });

    it("deve validar requisição de OTP via WhatsApp e E-mail", () => {
      const reqWpp = requestOtpSchema.safeParse({
        email: "gestor@empresa.com.br",
        method: "WHATSAPP_OTP",
      });
      expect(reqWpp.success).toBe(true);

      const reqEmail = requestOtpSchema.safeParse({
        email: "gestor@empresa.com.br",
        method: "EMAIL_OTP",
      });
      expect(reqEmail.success).toBe(true);
    });

    it("deve validar código de verificação OTP estritamente com 6 dígitos", () => {
      expect(
        verifyOtpSchema.safeParse({ email: "gestor@empresa.com.br", code: "123456" }).success,
      ).toBe(true);
      expect(
        verifyOtpSchema.safeParse({ email: "gestor@empresa.com.br", code: "12345" }).success,
      ).toBe(false);
      expect(
        verifyOtpSchema.safeParse({ email: "gestor@empresa.com.br", code: "1234567" }).success,
      ).toBe(false);
    });

    it("deve conter campos do tenant ativo no contrato da sessão do usuário", () => {
      const session = sessionUserSchema.parse({
        id: "usr_123",
        name: "Carlos Gestor",
        email: "gestor@empresa.com.br",
        role: "OPERADOR",
        ativo: true,
        activeTenantId: "tnt_999",
        cnpj: "33.000.167/0001-01",
        plano: "PRO",
        tenantRole: "TITULAR",
      });

      expect(session.activeTenantId).toBe("tnt_999");
      expect(session.cnpj).toBe("33.000.167/0001-01");
      expect(session.plano).toBe("PRO");
      expect(session.tenantRole).toBe("TITULAR");
    });
  });

  describe("6. Isolamento do Prisma Client Extension (getTenantPrisma)", () => {
    it("deve lançar erro caso getTenantPrisma seja invocado sem tenantId ou com string vazia", () => {
      expect(() => getTenantPrisma("")).toThrow("tenantId é obrigatório");
      expect(() => getTenantPrisma("   ")).toThrow("tenantId é obrigatório");
      // @ts-expect-error teste proposital de runtime
      expect(() => getTenantPrisma(undefined)).toThrow("tenantId é obrigatório");
    });

    it("deve retornar uma extensão Prisma configurada com o nome do escopo do tenant", () => {
      const extended = getTenantPrisma("tenant_abc_123");
      expect(extended).toBeDefined();
      expect(typeof extended).toBe("object");
    });
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { cadastroContaSchema } from "@/server/schemas/cadastro.schema";
import { realizarCadastroConta } from "@/server/services/cadastro.service";
import {
  authorizeCredentials,
  generateAndStoreOtp,
  upsertInMemoryAuthUser,
} from "@/server/auth";

describe("Sprint 6 - Task 1: Auth and Cadastro Backend Resilience", () => {
  beforeEach(() => {
    // Reset ou preparação de estado se necessário
  });

  describe("Contrato Zod - cadastroContaSchema", () => {
    it("deve rejeitar cadastro sem segmentos selecionados", () => {
      const payloadInvalido = {
        cnpj: "00.000.000/0001-91",
        razaoSocial: "O Pão Nosso Panificadora Ltda",
        nomeResponsavel: "João Silva",
        email: "opaonossopanificadora@gmail.com",
        whatsapp: "(62) 98888-7777",
        senha: "123456",
        segmentos: [],
      };

      const result = cadastroContaSchema.safeParse(payloadInvalido);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errorMsg = result.error.errors.map((e) => e.message).join("; ");
        expect(errorMsg).toMatch(/pelo menos um segmento/i);
      }
    });

    it("deve aceitar payload válido com segmentos, subsegmentos e UFs", () => {
      const payloadValido = {
        cnpj: "00.000.000/0001-91",
        razaoSocial: "O Pão Nosso Panificadora Ltda",
        nomeResponsavel: "João Silva",
        email: "opaonossopanificadora@gmail.com",
        whatsapp: "(62) 98888-7777",
        senha: "123456",
        segmentos: ["ALIMENTOS_MERENDA_ESCOLAR"],
        subsegmentos: ["PANIFICACAO_LANCHES"],
        ufs: ["GO", "DF"],
        brasilInteiro: false,
      };

      const result = cadastroContaSchema.safeParse(payloadValido);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.segmentos).toContain("ALIMENTOS_MERENDA_ESCOLAR");
        expect(result.data.subsegmentos).toContain("PANIFICACAO_LANCHES");
        expect(result.data.ufs).toEqual(["GO", "DF"]);
        expect(result.data.brasilInteiro).toBe(false);
      }
    });
  });

  describe("Cadastro e Autenticação Imediata de opaonossopanificadora@gmail.com", () => {
    it("deve cadastrar a conta e permitir login imediato por senha", async () => {
      const res = await realizarCadastroConta({
        cnpj: "00.000.000/0001-91",
        razaoSocial: "O Pão Nosso Panificadora Ltda",
        nomeResponsavel: "João Silva",
        email: "opaonossopanificadora@gmail.com",
        whatsapp: "62988887777",
        senha: "123456",
        segmentos: ["ALIMENTOS_MERENDA_ESCOLAR"],
        subsegmentos: ["PANIFICACAO_LANCHES"],
        ufs: ["GO"],
        brasilInteiro: true,
      });

      expect(res.ok).toBe(true);
      expect(res.email).toBe("opaonossopanificadora@gmail.com");

      // Testar autenticação imediata com authorizeCredentials
      const user = await authorizeCredentials({
        email: "opaonossopanificadora@gmail.com",
        password: "123456",
      });

      expect(user).not.toBeNull();
      expect(user?.email).toBe("opaonossopanificadora@gmail.com");
      expect(user?.name).toBe("João Silva");
    });
  });

  describe("Autenticação OTP Multi-Step", () => {
    it("deve autenticar usuário utilizando código OTP gerado para e-mail", async () => {
      const email = "teste.otp@empresa.com";
      upsertInMemoryAuthUser({
        id: "user_test_otp",
        name: "Usuário OTP Teste",
        email,
        role: "OPERADOR",
        ativo: true,
        passwordHash: "hash_placeholder",
        activeTenantId: "tenant_otp",
        cnpj: "11222333000144",
        plano: "BASICO",
        tenantRole: "TITULAR",
      });

      const otp = generateAndStoreOtp(email, "EMAIL_OTP");
      expect(otp).toHaveLength(6);

      const authenticated = await authorizeCredentials({
        email,
        code: otp,
      });

      expect(authenticated).not.toBeNull();
      expect(authenticated?.email).toBe(email);
    });

    it("deve autenticar usuário utilizando código OTP gerado para WhatsApp", async () => {
      const email = "teste.whatsapp@empresa.com";
      upsertInMemoryAuthUser({
        id: "user_test_wpp",
        name: "Usuário WhatsApp Teste",
        email,
        role: "OPERADOR",
        ativo: true,
        passwordHash: "hash_placeholder",
        activeTenantId: "tenant_wpp",
        cnpj: "99888777000155",
        plano: "PRO",
        tenantRole: "TITULAR",
      });

      const otp = generateAndStoreOtp(email, "WHATSAPP_OTP");
      expect(otp).toHaveLength(6);

      const authenticated = await authorizeCredentials({
        email,
        code: otp,
      });

      expect(authenticated).not.toBeNull();
      expect(authenticated?.email).toBe(email);
    });

    it("deve rejeitar código OTP inválido ou incorreto", async () => {
      const email = "teste.otp.errado@empresa.com";
      upsertInMemoryAuthUser({
        id: "user_test_err",
        name: "Usuário OTP Erro",
        email,
        role: "OPERADOR",
        ativo: true,
        passwordHash: "hash_placeholder",
        activeTenantId: null,
        cnpj: null,
        plano: null,
        tenantRole: null,
      });

      generateAndStoreOtp(email, "EMAIL_OTP");

      const authenticated = await authorizeCredentials({
        email,
        code: "000000", // Código propositalmente incorreto
      });

      expect(authenticated).toBeNull();
    });
  });
});

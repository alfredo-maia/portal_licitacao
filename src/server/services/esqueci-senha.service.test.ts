import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  solicitarRecuperacaoSenha,
  _resetRateLimit,
} from "./esqueci-senha.service";

describe("Task 1 - Serviço de Esqueci Senha (esqueci-senha.service)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    _resetRateLimit();
  });

  describe("Anti-enumeração de e-mails", () => {
    it("deve retornar mensagem de sucesso idêntica quando o e-mail NÃO existe no banco de dados", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue(null);

      const resultado = await solicitarRecuperacaoSenha(
        "inexistente@empresa.com.br",
        "192.168.1.10",
      );

      expect(resultado).toEqual({
        ok: true,
        message:
          "Enviamos as instruções de recuperação para o seu e-mail. Verifique sua caixa de entrada e spam.",
      });
    });

    it("deve retornar mensagem de sucesso quando o e-mail existe no banco de dados", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: "user-123",
        email: "existente@empresa.com.br",
        name: "Licitante Teste",
      } as any);

      const resultado = await solicitarRecuperacaoSenha(
        "existente@empresa.com.br",
        "192.168.1.10",
      );

      expect(resultado).toEqual({
        ok: true,
        message:
          "Enviamos as instruções de recuperação para o seu e-mail. Verifique sua caixa de entrada e spam.",
      });
    });
  });

  describe("Rate Limit (Máximo 2 tentativas a cada 15 minutos)", () => {
    it("deve permitir as 2 primeiras tentativas dentro da janela de 15 minutos", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue(null);

      const res1 = await solicitarRecuperacaoSenha(
        "usuario@empresa.com.br",
        "10.0.0.1",
      );
      expect(res1.ok).toBe(true);

      const res2 = await solicitarRecuperacaoSenha(
        "usuario@empresa.com.br",
        "10.0.0.1",
      );
      expect(res2.ok).toBe(true);
    });

    it("deve bloquear a 3ª tentativa na janela de 15 minutos com código RATE_LIMIT_EXCEEDED", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue(null);

      // Tentativa 1
      await solicitarRecuperacaoSenha("limite@empresa.com.br", "10.0.0.2");
      // Tentativa 2
      await solicitarRecuperacaoSenha("limite@empresa.com.br", "10.0.0.2");

      // Tentativa 3 (deve ser bloqueada)
      const res3 = await solicitarRecuperacaoSenha(
        "limite@empresa.com.br",
        "10.0.0.2",
      );

      expect(res3.ok).toBe(false);
      expect(res3.code).toBe("RATE_LIMIT_EXCEEDED");
      expect(res3.message).toMatch(/2 tentativas a cada 15 minutos/i);
    });

    it("deve isolar rate limit por e-mail ou IP diferente", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue(null);

      // 2 tentativas para userA
      await solicitarRecuperacaoSenha("userA@empresa.com.br", "10.0.0.3");
      await solicitarRecuperacaoSenha("userA@empresa.com.br", "10.0.0.3");

      // userB com outro IP deve ser liberado
      const resB = await solicitarRecuperacaoSenha(
        "userB@empresa.com.br",
        "10.0.0.4",
      );
      expect(resB.ok).toBe(true);
    });
  });
});

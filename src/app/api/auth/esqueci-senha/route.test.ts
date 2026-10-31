import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import * as esqueciSenhaService from "@/server/services/esqueci-senha.service";

describe("POST /api/auth/esqueci-senha", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("deve retornar 400 se o e-mail não for informado ou for inválido", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/esqueci-senha", {
      method: "POST",
      body: JSON.stringify({ email: "invalido" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.message).toMatch(/e-mail válido/i);
  });

  it("deve retornar 200 com mensagem de sucesso padrão", async () => {
    vi.spyOn(esqueciSenhaService, "solicitarRecuperacaoSenha").mockResolvedValue({
      ok: true,
      message:
        "Enviamos as instruções de recuperação para o seu e-mail. Verifique sua caixa de entrada e spam.",
    });

    const req = new NextRequest("http://localhost:3000/api/auth/esqueci-senha", {
      method: "POST",
      body: JSON.stringify({ email: "usuario@empresa.com.br" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.message).toContain("Enviamos as instruções");
  });

  it("deve retornar 429 se exceder o rate limit", async () => {
    vi.spyOn(esqueciSenhaService, "solicitarRecuperacaoSenha").mockResolvedValue({
      ok: false,
      code: "RATE_LIMIT_EXCEEDED",
      message:
        "Limite de 2 tentativas a cada 15 minutos atingido. Aguarde alguns minutos antes de tentar novamente.",
    });

    const req = new NextRequest("http://localhost:3000/api/auth/esqueci-senha", {
      method: "POST",
      body: JSON.stringify({ email: "usuario@empresa.com.br" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("RATE_LIMIT_EXCEEDED");
  });
});

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { prisma } from "@/lib/prisma";
import { authorizeCredentials, upsertInMemoryAuthUser } from "@/server/auth";
import { _resetRateLimit, solicitarRecuperacaoSenha } from "@/server/services/esqueci-senha.service";
import { sanitizarHtmlDocumento } from "@/lib/sanitize-html";
import { GET as recuperarSenhaGET, POST as recuperarSenhaPOST } from "@/app/api/auth/recuperar-senha/route";
import RecuperarSenhaPage from "@/app/recuperar-senha/page";

const mockSearchParams = new URLSearchParams("token=token_valido_ui_123");

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => "/recuperar-senha",
}));

describe("Issue #42 [Hardening] — Sanitizador HTML Anti-XSS & Fluxo Completo /recuperar-senha", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    _resetRateLimit();
  });

  describe("1. Sanitizador HTML (sanitizarHtmlDocumento)", () => {
    it("deve remover <script>, handlers on*, <iframe>, <svg onload> e links javascript:", () => {
      const payloadMalicioso = `
        <div class="a4-folha">
          <h2>Declaração Oficial</h2>
          <script>alert('xss-script')</script>
          <p onclick="alert('xss-click')" onmouseover="evil()">Texto legítimo.</p>
          <img src="x" onerror="fetch('https://evil.com')">
          <svg onload="alert(1)"><circle /></svg>
          <iframe src="https://evil.com/phish"></iframe>
          <a href="javascript:alert('xss-href')">Clique</a>
          <a href="https://pncp.gov.br" target="_blank">Link PNCP</a>
          <table><thead><tr><th>Item</th></tr></thead><tbody><tr><td>Notebook</td></tr></tbody></table>
        </div>
      `;

      const limpo = sanitizarHtmlDocumento(payloadMalicioso);
      expect(limpo).toContain("Declaração Oficial");
      expect(limpo).toContain("Texto legítimo.");
      expect(limpo).toContain("<table>");
      expect(limpo).toContain('href="https://pncp.gov.br"');
      expect(limpo).not.toContain("<script");
      expect(limpo).not.toContain("xss-script");
      expect(limpo).not.toContain("onclick");
      expect(limpo).not.toContain("onmouseover");
      expect(limpo).not.toContain("onerror");
      expect(limpo).not.toContain("<svg");
      expect(limpo).not.toContain("<iframe");
      expect(limpo).not.toContain("javascript:");
    });
  });

  describe("2. Fluxo Completo End-to-End de Recuperação de Senha (/api/auth/recuperar-senha)", () => {
    it("deve validar token via GET, redefinir senha via POST, bloquear reuso e permitir login com nova senha", async () => {
      vi.stubEnv("RESEND_API_KEY", "re_key_e2e_reset");
      const email = "reset.e2e@empresa.com.br";

      upsertInMemoryAuthUser({
        id: "usr_reset_e2e_1",
        name: "Usuário Reset",
        email,
        role: "DIRETORIA",
        ativo: true,
        passwordHash: "$2a$10$hashAntigoFakeNaoImporta",
      });

      vi.spyOn(prisma.user, "findUnique").mockResolvedValueOnce({
        id: "usr_reset_e2e_1",
        name: "Usuário Reset",
        email,
        role: "DIRETORIA",
        ativo: true,
      } as any);

      const auditSpy = vi.spyOn(prisma.auditLog, "create").mockResolvedValue({ id: "audit_1" } as any);

      let capturedHtml = "";
      vi.spyOn(global, "fetch").mockImplementation(async (_url, init) => {
        const body = JSON.parse(String(init?.body || "{}"));
        capturedHtml = String(body.html || "");
        return new Response(JSON.stringify({ id: "email_e2e_1" }), { status: 200 });
      });

      const solRes = await solicitarRecuperacaoSenha(email, "10.10.10.20");
      expect(solRes.ok).toBe(true);

      const tokenMatch = capturedHtml.match(/recuperar-senha\?token=([A-Za-z0-9_-]+)/);
      expect(tokenMatch?.[1]).toBeTruthy();
      const rawToken = decodeURIComponent(tokenMatch![1]);

      // GET valida token antes de exibir o formulário
      const getValidRes = await recuperarSenhaGET(
        new Request(`http://localhost:3010/api/auth/recuperar-senha?token=${encodeURIComponent(rawToken)}`),
      );
      expect(getValidRes.status).toBe(200);
      const getValidJson = await getValidRes.json();
      expect(getValidJson.valid).toBe(true);

      // POST com senhas divergentes deve falhar com 400
      const mismatchRes = await recuperarSenhaPOST(
        new Request("http://localhost:3010/api/auth/recuperar-senha", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: rawToken,
            novaSenha: "NovaSenha@2026",
            confirmarSenha: "OutraSenha@2026",
          }),
        }),
      );
      expect(mismatchRes.status).toBe(400);

      // POST válido redefine a senha
      const postOkRes = await recuperarSenhaPOST(
        new Request("http://localhost:3010/api/auth/recuperar-senha", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: rawToken,
            novaSenha: "NovaSenha@2026",
            confirmarSenha: "NovaSenha@2026",
          }),
        }),
      );
      expect(postOkRes.status).toBe(200);

      expect(
        auditSpy.mock.calls.some(
          (call) => (call[0] as any)?.data?.acao === "AUTH_PASSWORD_RESET_COMPLETED",
        ),
      ).toBe(true);

      // Login com a nova senha deve funcionar
      const authUser = await authorizeCredentials({ email, password: "NovaSenha@2026" });
      expect(authUser).not.toBeNull();
      expect(authUser?.email).toBe(email);

      // Reuso do mesmo token deve ser recusado com 400
      const replayRes = await recuperarSenhaPOST(
        new Request("http://localhost:3010/api/auth/recuperar-senha", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: rawToken,
            novaSenha: "TerceiraSenha@2026",
            confirmarSenha: "TerceiraSenha@2026",
          }),
        }),
      );
      expect(replayRes.status).toBe(400);

      vi.unstubAllEnvs();
    });

    it("deve rejeitar token inválido ou inexistente", async () => {
      const res = await recuperarSenhaGET(
        new Request("http://localhost:3010/api/auth/recuperar-senha?token=TOKEN_INEXISTENTE_XYZ"),
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.valid).toBe(false);
    });
  });

  describe("3. Interface Carbon /recuperar-senha", () => {
    it("deve validar o token na carga, renderizar campos Carbon de nova senha e submeter POST /api/auth/recuperar-senha", async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/auth/recuperar-senha") && (!init?.method || init.method === "GET")) {
          return new Response(
            JSON.stringify({ ok: true, valid: true, emailMasked: "r***@empresa.com.br" }),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify({ ok: true, message: "Senha redefinida com sucesso." }),
          { status: 200 },
        );
      });
      global.fetch = fetchMock as any;

      render(<RecuperarSenhaPage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/^Nova Senha$/i)).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText(/^Nova Senha$/i), {
        target: { value: "NovaSenhaForte@2026" },
      });
      fireEvent.change(screen.getByLabelText(/^Confirmar Nova Senha$/i), {
        target: { value: "NovaSenhaForte@2026" },
      });

      fireEvent.click(screen.getByRole("button", { name: /Salvar Nova Senha|Redefinir Senha/i }));

      await waitFor(() => {
        expect(screen.getByText(/Senha redefinida com sucesso/i)).toBeInTheDocument();
      });
    });
  });
});

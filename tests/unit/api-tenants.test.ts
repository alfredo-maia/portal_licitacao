import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getTenants, POST as postTenants } from "@/app/api/tenants/route";
import { POST as postConvites } from "@/app/api/tenants/[id]/convites/route";
import { POST as postDispute } from "@/app/api/tenants/dispute/route";
import { resetInMemoryTenantStorage } from "@/server/services/tenant.service";

let mockSessionUser: {
  id: string;
  name: string;
  email: string;
  role: string;
  ativo: boolean;
  plano?: string;
} | null = null;

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(async () => {
    if (!mockSessionUser) return null;
    return {
      user: mockSessionUser,
    };
  }),
}));

describe("Sprint SaaS 1 — API Routes /api/tenants & Governança (Issue #9)", () => {
  beforeEach(() => {
    resetInMemoryTenantStorage();
    mockSessionUser = {
      id: "usr_alice",
      name: "Alice Diretora",
      email: "alice@empresa.com.br",
      role: "DIRETORIA",
      ativo: true,
      plano: "BASICO",
    };
  });

  describe("1. GET /api/tenants", () => {
    it("deve retornar 401 para requisições não autenticadas", async () => {
      mockSessionUser = null;
      const res = await getTenants();
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error).toBe("UNAUTHORIZED");
    });

    it("deve retornar 200 com array de tenants do usuário autenticado", async () => {
      const res = await getTenants();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(Array.isArray(json.tenants)).toBe(true);
    });
  });

  describe("2. POST /api/tenants (Criação, Unicidade e Cotas)", () => {
    it("deve retornar 400 se o CNPJ for matematicamente inválido (módulo 11)", async () => {
      const req = new Request("http://localhost/api/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cnpj: "00.000.000/0001-00", // Dígito inválido
          razaoSocial: "Empresa Falsa",
          plano: "BASICO",
        }),
      });

      const res = await postTenants(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error).toBe("VALIDATION_ERROR");
      expect(json.message).toContain("CNPJ inválido");
    });

    it("deve criar um tenant com sucesso (201) para CNPJ autêntico", async () => {
      const req = new Request("http://localhost/api/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cnpj: "00.000.000/0001-91",
          razaoSocial: "Empresa Alfa LTDA",
          plano: "BASICO",
        }),
      });

      const res = await postTenants(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.tenant.id).toBeDefined();
      expect(json.tenant.cnpj).toBe("00000000000191");
    });

    it("deve responder 409 Conflict se outra conta tentar registrar o mesmo CNPJ", async () => {
      // 1ª conta cadastra o CNPJ
      const req1 = new Request("http://localhost/api/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cnpj: "33.000.167/0001-01",
          razaoSocial: "Petrobras",
          plano: "BASICO",
        }),
      });
      const res1 = await postTenants(req1);
      expect(res1.status).toBe(201);

      // 2ª conta (outro usuário) tenta cadastrar o mesmo CNPJ
      mockSessionUser = {
        id: "usr_bob",
        name: "Bob Concorrente",
        email: "bob@concorrente.com.br",
        role: "OPERADOR",
        ativo: true,
        plano: "PRO",
      };

      const req2 = new Request("http://localhost/api/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cnpj: "33.000.167/0001-01", // Mesmo CNPJ
          razaoSocial: "Petrobras Concorrente",
          plano: "PRO",
        }),
      });

      const res2 = await postTenants(req2);
      expect(res2.status).toBe(409);
      const json2 = await res2.json();
      expect(json2.ok).toBe(false);
      expect(json2.error).toBe("CNPJ_ALREADY_REGISTERED");
      expect(json2.message).toContain("já possui uma conta ativa no Portal");
    });

    it("deve responder 403 se o usuário exceder o limite de CNPJs do plano", async () => {
      // 1º CNPJ (limite do Básico atingido)
      const req1 = new Request("http://localhost/api/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cnpj: "00.000.000/0001-91",
          razaoSocial: "Empresa Um",
          plano: "BASICO",
        }),
      });
      await postTenants(req1);

      // Tentativa do 2º CNPJ sob o plano Básico
      const req2 = new Request("http://localhost/api/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cnpj: "11.222.333/0001-81",
          razaoSocial: "Empresa Dois",
          plano: "BASICO",
        }),
      });

      const res2 = await postTenants(req2);
      expect(res2.status).toBe(403);
      const json2 = await res2.json();
      expect(json2.ok).toBe(false);
      expect(json2.error).toBe("PLAN_CNPJ_LIMIT_REACHED");
    });
  });

  describe("3. POST /api/tenants/[id]/convites", () => {
    it("deve responder 403 se o plano não permitir mais assentos de usuário", async () => {
      // Cria empresa no plano Básico (maxUsers: 1)
      const req = new Request("http://localhost/api/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cnpj: "00.000.000/0001-91",
          razaoSocial: "Empresa Básico",
          plano: "BASICO",
        }),
      });
      const res = await postTenants(req);
      const { tenant } = await res.json();

      // Convida segundo membro
      const inviteReq = new Request(`http://localhost/api/tenants/${tenant.id}/convites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "operador@empresa.com.br",
          role: "MEMBRO",
        }),
      });

      const inviteRes = await postConvites(inviteReq, {
        params: Promise.resolve({ id: tenant.id }),
      });

      expect(inviteRes.status).toBe(403);
      const inviteJson = await inviteRes.json();
      expect(inviteJson.error).toBe("TEAM_SEAT_LIMIT_REACHED");
    });
  });

  describe("4. POST /api/tenants/dispute (Contestação de CNPJ)", () => {
    it("deve registrar contestação e retornar protocolo 200", async () => {
      const req = new Request("http://localhost/api/tenants/dispute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cnpj: "33.000.167/0001-01",
          motivo: "Reivindicando titularidade legítima do CNPJ da nossa empresa.",
          metodo: "EMAIL_RECEITA",
        }),
      });

      const res = await postDispute(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.dispute.protocolo).toContain("DISP-");
      expect(json.dispute.mensagem).toContain("Cartão CNPJ da Receita Federal");
    });
  });
});

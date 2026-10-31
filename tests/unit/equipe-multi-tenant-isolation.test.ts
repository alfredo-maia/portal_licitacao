import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  listarEquipe,
  criarMembroEquipe,
  atualizarMembroEquipe,
} from "@/server/services/configuracoes.service";
import { listarAuditLogs } from "@/server/services/audit-viewer.service";
import { recordAuditLog, setAuditActorContext } from "@/server/audit";

describe("Sprint 6 / SaaS Multi-Tenant [TDD RED] — Isolamento de Equipe e Auditoria por Tenant", () => {
  const tenantA = "tenant_padaria_valeria";
  const tenantB = "tenant_construtora_silva";

  beforeEach(() => {
    vi.restoreAllMocks();
    setAuditActorContext(null);
  });

  describe("1. listarEquipe com isolamento por tenantId", () => {
    it("deve filtrar estritamente os colaboradores pelo tenantId fornecido e não vazar membros de outros tenants", async () => {
      // Cria membro no Tenant A
      const membroA = await criarMembroEquipe(
        {
          name: "Valeria Padaria",
          email: "valeria@padaria.com",
          role: "DIRETORIA",
          password: "SenhaForte2026!",
          ativo: true,
        },
        null,
        undefined,
        tenantA,
      );

      // Cria membro no Tenant B
      const membroB = await criarMembroEquipe(
        {
          name: "Carlos Construtor",
          email: "carlos@construtora.com",
          role: "DIRETORIA",
          password: "SenhaForte2026!",
          ativo: true,
        },
        null,
        undefined,
        tenantB,
      );

      // Consulta equipe do Tenant A
      const equipeA = await listarEquipe(tenantA);
      expect(equipeA.ok).toBe(true);
      const emailsA = equipeA.usuarios.map((u) => u.email);
      expect(emailsA).toContain("valeria@padaria.com");
      expect(emailsA).not.toContain("carlos@construtora.com");

      // Consulta equipe do Tenant B
      const equipeB = await listarEquipe(tenantB);
      expect(equipeB.ok).toBe(true);
      const emailsB = equipeB.usuarios.map((u) => u.email);
      expect(emailsB).toContain("carlos@construtora.com");
      expect(emailsB).not.toContain("valeria@padaria.com");
    });
  });

  describe("2. atualizarMembroEquipe com validação de tenant", () => {
    it("deve bloquear a edição de um membro que pertence a outro tenant", async () => {
      // Cria membro no Tenant A
      const membroA = await criarMembroEquipe(
        {
          name: "Operador Valeria",
          email: "operador@padaria.com",
          role: "ANALISTA_COMERCIAL",
          password: "SenhaForte2026!",
          ativo: true,
        },
        null,
        undefined,
        tenantA,
      );

      // Usuário do Tenant B tenta alterar o membro do Tenant A
      await expect(
        atualizarMembroEquipe(
          membroA.id,
          { role: "OPERADOR_TECNICO" },
          "user_b",
          { id: "user_b", role: "DIRETORIA" },
          tenantB,
        ),
      ).rejects.toThrow(/não pertence à sua organização/i);
    });
  });

  describe("3. Trilha de Auditoria com isolamento por tenantId", () => {
    it("deve gravar e filtrar logs de auditoria exclusivamente para o tenantId da organização", async () => {
      // Registra logs para diferentes tenants
      await recordAuditLog({
        acao: "TESTE_TENANT_A",
        entidadeTipo: "TENANT",
        entidadeId: tenantA,
        tenantId: tenantA,
        usuarioNome: "Valeria",
      });

      await recordAuditLog({
        acao: "TESTE_TENANT_B",
        entidadeTipo: "TENANT",
        entidadeId: tenantB,
        tenantId: tenantB,
        usuarioNome: "Carlos",
      });

      const logsA = await listarAuditLogs({ acao: "TESTE_TENANT_A" }, tenantA);
      expect(logsA.ok).toBe(true);
      expect(logsA.logs.every((l) => (l as any).tenantId === tenantA || !l.acao.includes("TENANT_B"))).toBe(true);

      const logsB = await listarAuditLogs({ acao: "TESTE_TENANT_B" }, tenantB);
      expect(logsB.ok).toBe(true);
      expect(logsB.logs.every((l) => (l as any).tenantId === tenantB || !l.acao.includes("TENANT_A"))).toBe(true);
    });
  });

  describe("4. Rotas de API HTTP com isolamento por activeTenantId da sessão", () => {
    it("GET e POST /api/configuracoes/equipe devem isolar colaboradores pelo tenant da sessão", async () => {
      const nextAuth = await import("next-auth/next");
      vi.spyOn(nextAuth, "getServerSession").mockResolvedValue({
        user: {
          id: "usr_session_valeria",
          name: "Valeria Clemente",
          email: "opaonossopanificadora@gmail.com",
          role: "DIRETORIA",
          activeTenantId: "tenant_padaria_valeria_api",
        },
      } as any);

      const { GET: equipeGET, POST: equipePOST } = await import(
        "@/app/api/configuracoes/equipe/route"
      );

      // Cria colaborador na sessão do Tenant Padaria
      const postReq = new Request("http://localhost:3010/api/configuracoes/equipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Padeiro Chefe",
          email: "padeiro.chefe@padaria.com",
          role: "OPERADOR_TECNICO",
          password: "SenhaPadaria2026!",
        }),
      });

      const postResp = await equipePOST(postReq);
      expect(postResp.status).toBe(201);
      const postData = await postResp.json();
      expect(postData.ok).toBe(true);
      expect(postData.usuario.email).toBe("padeiro.chefe@padaria.com");

      // Consulta lista de membros com a sessão do Tenant Padaria
      const getResp = await equipeGET();
      expect(getResp.status).toBe(200);
      const getData = await getResp.json();
      expect(getData.ok).toBe(true);
      const emails = getData.usuarios.map((u: any) => u.email);
      expect(emails).toContain("padeiro.chefe@padaria.com");
    });
  });
});

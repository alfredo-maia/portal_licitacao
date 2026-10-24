import { describe, expect, it } from "vitest";
import {
  ROLE_PERMISSIONS_CONTRACT,
  can,
  type RbacAction,
  type RbacUser,
} from "@/lib/rbac";
import { recordAuditLog } from "@/server/audit";
import {
  DIRECTORS_SEED,
  authOptions,
  authorizeCredentials,
} from "@/server/auth";
import { auditLogRecordSchema } from "@/server/schemas/audit.schema";
import { seedDirectorSchema } from "@/server/schemas/auth.schema";
import { seedDirectors } from "../../prisma/seed";

describe("Sprint 0 — RBAC can(user, action, resource) (src/lib/rbac.ts)", () => {
  const diretoriaUser: RbacUser = {
    id: "user-dir-1",
    name: "Vítor Henrique",
    email: "vitorhenrique018@gmail.com",
    role: "DIRETORIA",
    ativo: true,
  };

  const analistaUser: RbacUser = {
    id: "user-ana-1",
    name: "Analista Comercial",
    email: "analista@empresa.com.br",
    role: "ANALISTA_COMERCIAL",
    ativo: true,
  };

  const operadorUser: RbacUser = {
    id: "user-ope-1",
    name: "Operador Licitações",
    email: "operador@empresa.com.br",
    role: "OPERADOR",
    ativo: true,
  };

  it("deve conceder acesso irrestrito ao perfil DIRETORIA ativo para todas as ações", () => {
    for (const action of ROLE_PERMISSIONS_CONTRACT.DIRETORIA) {
      expect(
        can(diretoriaUser, action, "oportunidades"),
        `DIRETORIA deveria ter permissão para a ação '${action}'`,
      ).toBe(true);
    }
    expect(can(diretoriaUser, "decide_go_nogo", "licitacao")).toBe(true);
    expect(can(diretoriaUser, "approve_price", "licitacao")).toBe(true);
    expect(can(diretoriaUser, "manage_team", "equipe")).toBe(true);
    expect(can(diretoriaUser, "audit", "audit_log")).toBe(true);
  });

  it("deve restringir ANALISTA_COMERCIAL apenas às ações operacionais permitidas", () => {
    const allowedActions: RbacAction[] = [
      "view",
      "read",
      "create",
      "update",
      "upload",
      "generate_declaration",
      "impugnar",
      "export",
    ];
    const deniedActions: RbacAction[] = [
      "delete",
      "decide_go_nogo",
      "approve_price",
      "discard",
      "manage_team",
      "audit",
    ];

    for (const action of allowedActions) {
      expect(
        can(analistaUser, action, "minhas-licitacoes"),
        `ANALISTA_COMERCIAL deveria poder executar '${action}'`,
      ).toBe(true);
    }

    for (const action of deniedActions) {
      expect(
        can(analistaUser, action, "oportunidades"),
        `ANALISTA_COMERCIAL NÃO deveria poder executar '${action}'`,
      ).toBe(false);
    }
  });

  it("deve restringir OPERADOR exclusivamente a leitura, visualização e exportação", () => {
    expect(can(operadorUser, "view", "calendario")).toBe(true);
    expect(can(operadorUser, "read", "documentacao")).toBe(true);
    expect(can(operadorUser, "export", "declaracoes")).toBe(true);

    expect(can(operadorUser, "create", "oportunidades")).toBe(false);
    expect(can(operadorUser, "update", "minhas-licitacoes")).toBe(false);
    expect(can(operadorUser, "decide_go_nogo", "oportunidades")).toBe(false);
    expect(can(operadorUser, "manage_team", "configuracoes")).toBe(false);
    expect(can(operadorUser, "audit", "audit_log")).toBe(false);
  });

  it("deve negar qualquer permissão para usuário nulo, indefinido ou inativo (ativo: false)", () => {
    expect(can(null, "view", "dashboard")).toBe(false);
    expect(can(undefined, "view", "dashboard")).toBe(false);
    expect(
      can({ ...diretoriaUser, ativo: false }, "decide_go_nogo", "licitacao"),
    ).toBe(false);
  });
});

describe("Sprint 0 — Auth.js & Seed dos 2 Diretores (prisma/seed.ts & src/server/auth)", () => {
  it("deve definir exatamente os 2 diretores no contrato DIRECTORS_SEED", () => {
    expect(DIRECTORS_SEED).toHaveLength(2);

    const emails = DIRECTORS_SEED.map((d) => d.email);
    expect(emails).toContain("vitorhenrique018@gmail.com");
    expect(emails).toContain("alfredosouza100@gmail.com");

    for (const director of DIRECTORS_SEED) {
      const parsed = seedDirectorSchema.safeParse(director);
      expect(parsed.success).toBe(true);
      expect(director.role).toBe("DIRETORIA");
      expect(director.ativo).toBe(true);
    }
  });

  it("deve executar seedDirectors() de forma idempotente provisionando Vítor e Alfredo", async () => {
    process.env.SEED_DIRECTOR_PASSWORD =
      process.env.SEED_DIRECTOR_PASSWORD || "Pncp@2026!Diretoria";

    const seeded = await seedDirectors();
    expect(seeded).toHaveLength(2);
    expect(seeded.map((d) => d.email)).toEqual(
      expect.arrayContaining([
        "vitorhenrique018@gmail.com",
        "alfredosouza100@gmail.com",
      ]),
    );
  });

  it("deve autenticar credenciais válidas dos diretores via authorizeCredentials e rejeitar senha inválida", async () => {
    const testPassword =
      process.env.SEED_DIRECTOR_PASSWORD || "Pncp@2026!Diretoria";
    process.env.SEED_DIRECTOR_PASSWORD = testPassword;

    await seedDirectors();

    const authenticatedVitor = await authorizeCredentials({
      email: "vitorhenrique018@gmail.com",
      password: testPassword,
    });

    expect(authenticatedVitor).not.toBeNull();
    expect(authenticatedVitor?.email).toBe("vitorhenrique018@gmail.com");
    expect(authenticatedVitor?.role).toBe("DIRETORIA");
    expect(authenticatedVitor?.ativo).toBe(true);

    const invalidPasswordResult = await authorizeCredentials({
      email: "vitorhenrique018@gmail.com",
      password: "SenhaIncorreta999",
    });
    expect(invalidPasswordResult).toBeNull();

    const unknownUserResult = await authorizeCredentials({
      email: "inexistente@portal.com.br",
      password: testPassword,
    });
    expect(unknownUserResult).toBeNull();
  });

  it("deve configurar NextAuth com estratégia JWT e provider Credentials ativo", () => {
    expect(authOptions.session?.strategy).toBe("jwt");
    expect(authOptions.providers.length).toBeGreaterThanOrEqual(1);
  });
});

describe("Sprint 0 — Trilha de Auditoria Imutável (src/server/audit.ts)", () => {
  it("deve gravar registro em audit_log via recordAuditLog retornando formato válido", async () => {
    const record = await recordAuditLog({
      usuarioId: "user-dir-1",
      usuarioNome: "Vítor Henrique",
      ip: "127.0.0.1",
      acao: "DECIDE_GO_NOGO",
      entidadeTipo: "Licitacao",
      entidadeId: "lic-2026-001",
      antes: { status: "PENDENTE" },
      depois: { status: "ACEITA" },
    });

    const parsed = auditLogRecordSchema.safeParse(record);
    expect(parsed.success).toBe(true);
    expect(record.id).toBeTruthy();
    expect(record.ocorridoEm).toBeInstanceOf(Date);
    expect(record.usuarioId).toBe("user-dir-1");
    expect(record.usuarioNome).toBe("Vítor Henrique");
    expect(record.acao).toBe("DECIDE_GO_NOGO");
    expect(record.entidadeTipo).toBe("Licitacao");
    expect(record.entidadeId).toBe("lic-2026-001");
    expect(record.antes).toEqual({ status: "PENDENTE" });
    expect(record.depois).toEqual({ status: "ACEITA" });
  });
});

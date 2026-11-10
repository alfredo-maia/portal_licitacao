// @vitest-environment node
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
  })),
}));

import { getServerSession } from "next-auth/next";
import { GET } from "@/app/uploads/[...path]/route";
import {
  insertInMemoryDocumento,
  resetInMemoryLicitacoes,
} from "@/server/services/licitacoes-store";

const mockedGetServerSession = vi.mocked(getServerSession);

describe("Uploads Route Handler — GET /uploads/[...path] (Hardening Multi-Tenant Issue #42)", () => {
  const testDir = join(process.cwd(), "public", "uploads", "test-edital-123");
  const testFile = join(testDir, "documento-edital.pdf");
  const docsDir = join(process.cwd(), "public", "uploads", "documentos");
  const docTenantBFile = join(docsDir, "certidao-secreta-tenant-b.pdf");

  beforeEach(async () => {
    resetInMemoryLicitacoes();
    mockedGetServerSession.mockReset();
    mockedGetServerSession.mockResolvedValue({
      user: {
        id: "usr_tenant_a",
        name: "Usuário Tenant A",
        email: "tenant.a@empresa.com.br",
        role: "DIRETORIA",
        activeTenantId: "tenant_a",
      },
      expires: "2999-01-01",
    } as any);

    await mkdir(testDir, { recursive: true });
    await writeFile(testFile, Buffer.from("%PDF-1.4 test content"));
    await mkdir(docsDir, { recursive: true });
    await writeFile(docTenantBFile, Buffer.from("%PDF-1.4 confidencial tenant B"));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true }).catch(() => {});
    await rm(docTenantBFile, { force: true }).catch(() => {});
  });

  it("deve retornar 401 UNAUTHORIZED quando usuário não estiver autenticado", async () => {
    mockedGetServerSession.mockResolvedValue(null);
    const req = new Request("http://localhost:3010/uploads/test-edital-123/documento-edital.pdf");
    const res = await GET(req, {
      params: Promise.resolve({ path: ["test-edital-123", "documento-edital.pdf"] }),
    });

    expect(res.status).toBe(401);
  });

  it("deve servir o arquivo existente com status 200 e headers privados seguros", async () => {
    const req = new Request("http://localhost:3010/uploads/test-edital-123/documento-edital.pdf");
    const res = await GET(req, {
      params: Promise.resolve({ path: ["test-edital-123", "documento-edital.pdf"] }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("inline");
    expect(res.headers.get("Cache-Control")).toContain("private");
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");

    const text = await res.text();
    expect(text).toContain("%PDF-1.4 test content");
  });

  it("deve bloquear download cross-tenant de documento em /uploads/documentos com HTTP 403", async () => {
    insertInMemoryDocumento({
      id: "doc_b_secreto",
      nome: "Certidão Tenant B",
      categoria: "FISCAL_TRABALHISTA",
      semValidade: true,
      versao: 1,
      status: "ATIVO",
      tenantId: "tenant_b",
      arquivoUrl: "/uploads/documentos/certidao-secreta-tenant-b.pdf",
      arquivoNome: "certidao-secreta-tenant-b.pdf",
    });

    const req = new Request(
      "http://localhost:3010/uploads/documentos/certidao-secreta-tenant-b.pdf",
    );
    const res = await GET(req, {
      params: Promise.resolve({ path: ["documentos", "certidao-secreta-tenant-b.pdf"] }),
    });

    expect(res.status).toBe(403);
  });

  it("deve retornar 404 para arquivos inexistentes", async () => {
    const req = new Request("http://localhost:3010/uploads/inexistente/arquivo-nao-existe.pdf");
    const res = await GET(req, {
      params: Promise.resolve({ path: ["inexistente", "arquivo-nao-existe.pdf"] }),
    });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toBe("ARQUIVO_NAO_ENCONTRADO");
  });

  it("deve sanitizar tentativas de path traversal (..)", async () => {
    const req = new Request("http://localhost:3010/uploads/../../etc/passwd");
    const res = await GET(req, {
      params: Promise.resolve({ path: ["..", "..", "etc", "passwd"] }),
    });

    expect(res.status).toBe(403);
  });
});

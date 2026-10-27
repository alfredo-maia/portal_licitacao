// @vitest-environment node
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { GET } from "@/app/uploads/[...path]/route";

describe("Uploads Route Handler — GET /uploads/[...path]", () => {
  const testDir = join(process.cwd(), "public", "uploads", "test-edital-123");
  const testFile = join(testDir, "documento-edital.pdf");

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true });
    await writeFile(testFile, Buffer.from("%PDF-1.4 test content"));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true }).catch(() => {});
  });

  it("deve servir o arquivo existente com status 200 e Content-Type correto", async () => {
    const req = new Request("http://localhost:3010/uploads/test-edital-123/documento-edital.pdf");
    const res = await GET(req, {
      params: Promise.resolve({ path: ["test-edital-123", "documento-edital.pdf"] }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("inline");

    const text = await res.text();
    expect(text).toContain("%PDF-1.4 test content");
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

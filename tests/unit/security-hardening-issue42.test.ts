// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
  })),
}));

import { getServerSession } from "next-auth/next";
import { GET as calendarioGET } from "@/app/api/calendario/route";
import { GET as dashboardGET } from "@/app/api/dashboard/route";
import { POST as oportunidadesPOST } from "@/app/api/oportunidades/route";
import {
  GET as oportunidadeByIdGET,
  PATCH as oportunidadeByIdPATCH,
} from "@/app/api/oportunidades/[id]/route";
import { POST as decisaoPOST } from "@/app/api/oportunidades/[id]/decisao/route";
import { PATCH as statusPATCH } from "@/app/api/oportunidades/[id]/status/route";
import {
  GET as analiseIaGET,
  POST as analiseIaPOST,
} from "@/app/api/oportunidades/[id]/analise-ia/route";
import { GET as analiseIaPdfGET } from "@/app/api/oportunidades/[id]/analise-ia/[analiseId]/pdf/route";
import {
  GET as itensCertameGET,
  POST as itensCertamePOST,
} from "@/app/api/oportunidades/[id]/itens-certame/route";
import {
  GET as notasGET,
  POST as notasPOST,
} from "@/app/api/oportunidades/[id]/notas/route";
import {
  PATCH as notaPATCH,
  DELETE as notaDELETE,
} from "@/app/api/oportunidades/[id]/notas/[notaId]/route";
import { GET as impugnacaoPdfGET } from "@/app/api/impugnacoes/[id]/pdf/route";
import { GET as documentoDownloadGET } from "@/app/api/documentos/[id]/download/route";
import { enviarEmailRecuperacaoSenha } from "@/server/services/email.service";
import { insertInMemoryDocumento, resetInMemoryLicitacoes } from "@/server/services/licitacoes-store";

const mockedGetServerSession = vi.mocked(getServerSession);

function req(url: string, method = "GET", body?: unknown): Request {
  return new Request(url, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe("Issue #42 [Hardening] — Auth Estrita em 12 Rotas API, XSS Escape & Reset Link", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetInMemoryLicitacoes();
    mockedGetServerSession.mockReset();
    mockedGetServerSession.mockResolvedValue(null);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VITEST", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("1. Todas as 12 rotas devem retornar HTTP 401 UNAUTHORIZED sem sessão (inclusive em produção)", async () => {
    const idCtx = { params: Promise.resolve({ id: "lic_1" }) };
    const analiseCtx = { params: Promise.resolve({ id: "lic_1", analiseId: "ana_1" }) };
    const notaCtx = { params: Promise.resolve({ id: "lic_1", notaId: "nota_1" }) };

    const responses = await Promise.all([
      calendarioGET(req("http://localhost:3010/api/calendario")),
      dashboardGET(req("http://localhost:3010/api/dashboard")),
      oportunidadesPOST(req("http://localhost:3010/api/oportunidades", "POST", {})),
      oportunidadeByIdGET(req("http://localhost:3010/api/oportunidades/lic_1"), idCtx),
      oportunidadeByIdPATCH(req("http://localhost:3010/api/oportunidades/lic_1", "PATCH", {}), idCtx),
      decisaoPOST(req("http://localhost:3010/api/oportunidades/lic_1/decisao", "POST", { decisao: "GO" }), idCtx),
      statusPATCH(req("http://localhost:3010/api/oportunidades/lic_1/status", "PATCH", { status: "ACEITA" }), idCtx),
      analiseIaGET(req("http://localhost:3010/api/oportunidades/lic_1/analise-ia"), idCtx),
      analiseIaPOST(req("http://localhost:3010/api/oportunidades/lic_1/analise-ia", "POST", {}), idCtx),
      analiseIaPdfGET(req("http://localhost:3010/api/oportunidades/lic_1/analise-ia/ana_1/pdf"), analiseCtx),
      itensCertameGET(req("http://localhost:3010/api/oportunidades/lic_1/itens-certame"), idCtx),
      itensCertamePOST(req("http://localhost:3010/api/oportunidades/lic_1/itens-certame", "POST", {}), idCtx),
      notasGET(req("http://localhost:3010/api/oportunidades/lic_1/notas"), idCtx),
      notasPOST(req("http://localhost:3010/api/oportunidades/lic_1/notas", "POST", { conteudo: "Teste" }), idCtx),
      notaPATCH(req("http://localhost:3010/api/oportunidades/lic_1/notas/nota_1", "PATCH", { conteudo: "Edit" }), notaCtx),
      notaDELETE(req("http://localhost:3010/api/oportunidades/lic_1/notas/nota_1", "DELETE"), notaCtx),
      impugnacaoPdfGET(req("http://localhost:3010/api/impugnacoes/imp_1/pdf"), { params: Promise.resolve({ id: "imp_1" }) }),
    ]);

    const statuses = responses.map((r) => r.status);
    expect(statuses).toEqual(Array(17).fill(401));
  });

  it("2. Nenhuma rota em src/app/api/** deve importar ou usar DIRECTORS_SEED como fallback", () => {
    const apiRoot = path.resolve(process.cwd(), "src/app/api");
    const files: string[] = [];

    function walk(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name === "route.ts") files.push(full);
      }
    }
    walk(apiRoot);

    const offending = files.filter((f) => fs.readFileSync(f, "utf-8").includes("DIRECTORS_SEED"));
    expect(offending).toEqual([]);
  });

  it("3. Os 4 pontos dangerouslySetInnerHTML em documentos devem estar protegidos com sanitizarHtmlDocumento", () => {
    const arquivos = [
      "src/app/impugnacoes/page.tsx",
      "src/app/declaracoes/page.tsx",
      "src/app/oportunidades/[id]/page.tsx",
    ];

    for (const rel of arquivos) {
      const content = fs.readFileSync(path.resolve(process.cwd(), rel), "utf-8");
      expect(content).toContain("sanitizarHtmlDocumento(");
    }

    const oppContent = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/oportunidades/[id]/page.tsx"),
      "utf-8",
    );
    const sanitizedCount = (oppContent.match(/sanitizarHtmlDocumento\(/g) || []).length;
    expect(sanitizedCount).toBeGreaterThanOrEqual(2);
  });

  it("4. GET /api/documentos/[id]/download deve escapar HTML malicioso e não emitir <script> bruto", async () => {
    mockedGetServerSession.mockResolvedValue({
      user: {
        id: "usr_doc_xss",
        name: "Usuário Teste",
        email: "xss@empresa.com.br",
        role: "DIRETORIA",
        activeTenantId: "tenant_doc_xss",
      },
      expires: "2999-01-01",
    } as any);

    insertInMemoryDocumento({
      id: "doc_xss_1",
      nome: "Certidão <script>alert('xss')</script>",
      categoria: "FISCAL_TRABALHISTA",
      orgaoEmissor: "<img src=x onerror=alert(1)>",
      semValidade: true,
      versao: 1,
      status: "ATIVO",
      tenantId: "tenant_doc_xss",
      arquivoNome: "cert<svg onload=alert(1)>.txt",
    });

    const res = await documentoDownloadGET(
      req("http://localhost:3010/api/documentos/doc_xss_1/download"),
      { params: Promise.resolve({ id: "doc_xss_1" }) },
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("5. enviarEmailRecuperacaoSenha deve gerar CTA apontando para /recuperar-senha?token=...", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_issue42");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://portal.exemplo.com.br");

    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ id: "mail_reset_1" }), { status: 200 }));

    await enviarEmailRecuperacaoSenha({
      nome: "Maria",
      email: "maria@exemplo.com.br",
      token: "TOKEN_SEGURO_ABC123",
    });

    expect(fetchSpy).toHaveBeenCalled();
    const body = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body || "{}"));
    expect(body.html).toContain("https://portal.exemplo.com.br/recuperar-senha?token=TOKEN_SEGURO_ABC123");
    expect(body.html).not.toContain("/esqueci-senha?token=");
  });
});


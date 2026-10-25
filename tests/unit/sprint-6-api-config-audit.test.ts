import { beforeEach, describe, expect, it, vi } from "vitest";

function jsonRequest(url: string, body?: any, method = "GET", headers?: Record<string, string>): Request {
  return new Request(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(headers ?? {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function routeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn().mockResolvedValue({
    user: { id: "usr_dir_1", name: "Vítor Henrique", email: "vitor@empresa.com", role: "DIRETORIA" },
  }),
}));

describe("Sprint 6 [TDD RED] — APIs de Configurações, Gestão de Equipe & Trilha de Auditoria", () => {
  describe("1. Configurações da Empresa Licitante (/api/configuracoes/empresa)", () => {
    it("deve obter as configurações da empresa e atualizá-las com perfil de Diretoria", async () => {
      const { GET: empresaGET, PUT: empresaPUT } = await import(
        "@/app/api/configuracoes/empresa/route"
      );

      const getReq = jsonRequest("http://localhost:3010/api/configuracoes/empresa");
      const getResp = await empresaGET(getReq);
      expect(getResp.status).toBe(200);
      const getData = await getResp.json();
      expect(getData.ok).toBe(true);
      expect(getData.empresa.razaoSocial).toBeDefined();

      const putReq = jsonRequest("http://localhost:3010/api/configuracoes/empresa", {
        razaoSocial: "APONTA TECNOLOGIA GOIAS LTDA",
        cnpj: "12.345.678/0001-90",
        endereco: "Av. T-63, 500, Bueno",
        cidade: "Goiânia",
        uf: "GO",
        cep: "74230-100",
        representanteNome: "Vítor Henrique de Souza",
        representanteCpf: "123.456.789-00",
        representanteCargo: "Diretor Executivo",
      }, "PUT");

      const putResp = await empresaPUT(putReq);
      expect(putResp.status).toBe(200);
      const putData = await putResp.json();
      expect(putData.ok).toBe(true);
      expect(putData.empresa.razaoSocial).toBe("APONTA TECNOLOGIA GOIAS LTDA");
    });
  });

  describe("2. Gestão de Equipe & RBAC (/api/configuracoes/equipe)", () => {
    it("deve listar colaboradores e criar novo analista comercial", async () => {
      const { GET: equipeGET, POST: equipePOST } = await import(
        "@/app/api/configuracoes/equipe/route"
      );

      const postReq = jsonRequest("http://localhost:3010/api/configuracoes/equipe", {
        name: "Juliana Mendes",
        email: "juliana@aponta.cloud",
        role: "ANALISTA_COMERCIAL",
        password: "TempPassword2026!",
      }, "POST");

      const postResp = await equipePOST(postReq);
      expect(postResp.status).toBe(201);
      const postData = await postResp.json();
      expect(postData.ok).toBe(true);
      expect(postData.usuario.name).toBe("Juliana Mendes");
      expect(postData.usuario.role).toBe("ANALISTA_COMERCIAL");

      const getReq = jsonRequest("http://localhost:3010/api/configuracoes/equipe");
      const getResp = await equipeGET(getReq);
      expect(getResp.status).toBe(200);
      const getData = await getResp.json();
      expect(getData.ok).toBe(true);
      expect(getData.usuarios.some((u: any) => u.email === "juliana@aponta.cloud")).toBe(true);
    });
  });

  describe("3. Trilha de Auditoria e Exportação (/api/audit)", () => {
    it("deve consultar registros de auditoria com filtros", async () => {
      const { GET: auditGET } = await import("@/app/api/audit/route");

      const req = jsonRequest("http://localhost:3010/api/audit?page=1&pageSize=10");
      const resp = await auditGET(req);
      expect(resp.status).toBe(200);
      const data = await resp.json();
      expect(data.ok).toBe(true);
      expect(Array.isArray(data.logs)).toBe(true);
    });

    it("deve exportar relatório CSV de auditoria com cabeçalhos sanitizados", async () => {
      const { GET: exportCsvGET } = await import("@/app/api/audit/export-csv/route");

      const req = jsonRequest("http://localhost:3010/api/audit/export-csv");
      const resp = await exportCsvGET(req);
      expect(resp.status).toBe(200);
      const contentType = resp.headers.get("content-type");
      expect(contentType).toContain("text/csv");
      const csvText = await resp.text();
      expect(csvText).toContain("ID,DATA_HORA,USUARIO,ACAO,ENTIDADE_TIPO,ENTIDADE_ID");
    });
  });
});

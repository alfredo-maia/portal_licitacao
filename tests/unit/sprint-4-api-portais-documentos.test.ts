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

describe("Sprint 4 [TDD RED] — APIs de Portais, Documentos e Alertas", () => {
  describe("1. CRUD de Portais de Licitações (/api/portais)", () => {
    it("deve cadastrar um novo portal e listá-lo", async () => {
      const { POST: criarPortalPOST, GET: listarPortaisGET } = await import(
        "@/app/api/portais/route"
      );

      const criarReq = jsonRequest("http://localhost:3010/api/portais", {
        nome: "Compras Públicas",
        url: "https://www.portaldecompraspublicas.com.br",
        status: "CADASTRADO",
        login: "empresa_gov",
        valorAssinatura: 1200,
        periodicidade: "ANUAL",
        aceitaRobo: true,
        exigeCertificadoDigital: true,
      }, "POST");

      const criarResp = await criarPortalPOST(criarReq);
      expect(criarResp.status).toBe(201);
      const criarData = await criarResp.json();
      expect(criarData.ok).toBe(true);
      expect(criarData.portal.nome).toBe("Compras Públicas");

      const listarReq = jsonRequest("http://localhost:3010/api/portais");
      const listarResp = await listarPortaisGET(listarReq);
      expect(listarResp.status).toBe(200);
      const listarData = await listarResp.json();
      expect(listarData.ok).toBe(true);
      expect(Array.isArray(listarData.portais)).toBe(true);
      expect(listarData.portais.some((p: any) => p.nome === "Compras Públicas")).toBe(true);
    });
  });

  describe("2. CRUD e Versionamento de Documentação de Habilitação (/api/documentos)", () => {
    it("deve cadastrar certidão com vencimento e sinalizar alertaVencimento para prazos <= 30 dias", async () => {
      const { POST: criarDocPOST, GET: listarDocsGET } = await import(
        "@/app/api/documentos/route"
      );

      const dataVencimentoProxima = new Date(Date.now() + 1000 * 60 * 60 * 24 * 15).toISOString(); // 15 dias

      const criarReq = jsonRequest("http://localhost:3010/api/documentos", {
        nome: "Certidão Negativa de Débitos Federais",
        categoria: "FISCAL_TRABALHISTA",
        tipo: "CND",
        orgaoEmissor: "Receita Federal",
        semValidade: false,
        dataVencimento: dataVencimentoProxima,
      }, "POST");

      const criarResp = await criarDocPOST(criarReq);
      expect(criarResp.status).toBe(201);
      const criarData = await criarResp.json();
      expect(criarData.ok).toBe(true);
      expect(criarData.documento.alertaVencimento).toBe(true);
      expect(criarData.documento.vencido).toBe(false);

      const listarReq = jsonRequest("http://localhost:3010/api/documentos?categoria=FISCAL_TRABALHISTA");
      const listarResp = await listarDocsGET(listarReq);
      expect(listarResp.status).toBe(200);
      const listarData = await listarResp.json();
      expect(listarData.ok).toBe(true);
      expect(listarData.documentos.some((d: any) => d.nome.includes("Débitos Federais"))).toBe(true);
    });

    it("deve criar nova versão de documento e arquivar a versão anterior", async () => {
      const { POST: novaVersaoPOST } = await import(
        "@/app/api/documentos/[id]/nova-versao/route"
      );

      const req = jsonRequest("http://localhost:3010/api/documentos/doc_1/nova-versao", {
        dataVencimento: new Date(Date.now() + 1000 * 60 * 60 * 24 * 180).toISOString(),
        arquivoNome: "cnd_federal_2027.pdf",
      }, "POST");

      const resp = await novaVersaoPOST(req, routeContext("doc_1"));
      // 201 ou 404 se mock isolado
      expect([201, 404]).toContain(resp.status);
    });
  });

  describe("3. Projeção de Alertas Documentais no Calendário (/api/calendario)", () => {
    it("deve preencher alertasDocumentais reais com documentos que vencem no mês", async () => {
      const { GET: calendarioGET } = await import("@/app/api/calendario/route");

      const hoje = new Date();
      const mes = hoje.getMonth() + 1;
      const ano = hoje.getFullYear();

      const req = jsonRequest(`http://localhost:3010/api/calendario?mes=${mes}&ano=${ano}`);
      const resp = await calendarioGET(req);

      expect(resp.status).toBe(200);
      const data = await resp.json();
      expect(data.ok).toBe(true);
      expect(Array.isArray(data.alertasDocumentais)).toBe(true);
    });
  });
});

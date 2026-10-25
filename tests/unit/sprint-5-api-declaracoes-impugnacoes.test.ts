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

describe("Sprint 5 [TDD RED] — APIs de Declarações Oficiais e Impugnações", () => {
  describe("1. Modelos de Declaração (/api/declaracoes/templates)", () => {
    it("deve retornar a lista dos 8 modelos oficiais com metadados e fundamentação jurídica", async () => {
      const { GET: templatesGET } = await import("@/app/api/declaracoes/templates/route");

      const req = jsonRequest("http://localhost:3010/api/declaracoes/templates");
      const resp = await templatesGET(req);

      expect(resp.status).toBe(200);
      const data = await resp.json();
      expect(data.ok).toBe(true);
      expect(Array.isArray(data.templates)).toBe(true);
      expect(data.templates).toHaveLength(8);

      const carta = data.templates.find((t: any) => t.codigo === "CARTA_CREDENCIAMENTO");
      expect(carta).toBeDefined();
      expect(carta.titulo).toContain("Carta de Credenciamento");
      expect(carta.fundamentoLegal).toContain("Art. 12 da Lei nº 14.133/2021");
    });
  });

  describe("2. Geração Dinâmica de Declaração (/api/declaracoes/gerar)", () => {
    it("deve validar payload e gerar o HTML estruturado para impressão A4 com dados interpolados", async () => {
      const { POST: gerarPOST } = await import("@/app/api/declaracoes/gerar/route");

      const req = jsonRequest("http://localhost:3010/api/declaracoes/gerar", {
        tipo: "NAO_EMPREGA_MENOR",
        numeroEdital: "PE 102/2026",
        orgaoNome: "Tribunal Regional Federal",
        objetoLicitacao: "Aquisição de estações de trabalho e monitores",
        empresaRazaoSocial: "Tech Gov Soluções LTDA",
        empresaCnpj: "11.222.333/0001-44",
        empresaEndereco: "Av. Goiás, 1000, Goiânia - GO",
        representanteNome: "Mariana Souza",
        representanteCpf: "123.456.789-00",
        representanteCargo: "Sócia-Administradora",
        cidade: "Goiânia",
        uf: "GO",
      }, "POST");

      const resp = await gerarPOST(req);
      expect(resp.status).toBe(200);
      const data = await resp.json();
      expect(data.ok).toBe(true);
      expect(data.tipo).toBe("NAO_EMPREGA_MENOR");
      expect(data.fundamentoLegal).toContain("Art. 7º, XXXIII da CF/88");
      expect(data.conteudoHtml).toContain("Tech Gov Soluções LTDA");
      expect(data.conteudoHtml).toContain("11.222.333/0001-44");
      expect(data.conteudoHtml).toContain("Mariana Souza");
      expect(data.conteudoHtml).toContain("PE 102/2026");
      expect(data.conteudoTexto.toLowerCase()).toContain("não emprega menor de dezoito anos");
    });

    it("deve rejeitar payload inválido ou sem campos obrigatórios com status 400", async () => {
      const { POST: gerarPOST } = await import("@/app/api/declaracoes/gerar/route");

      const req = jsonRequest("http://localhost:3010/api/declaracoes/gerar", {
        tipo: "CARTA_CREDENCIAMENTO",
        // Faltam campos obrigatórios
      }, "POST");

      const resp = await gerarPOST(req);
      expect(resp.status).toBe(400);
      const data = await resp.json();
      expect(data.ok).toBe(false);
      expect(data.error).toBeDefined();
    });
  });

  describe("3. Gestão e Pipeline de Impugnações (/api/impugnacoes)", () => {
    it("deve criar uma impugnação com cálculo automático do prazo fatal legal (Art. 164)", async () => {
      const { POST: criarImpugnacaoPOST, GET: listarImpugnacoesGET } = await import(
        "@/app/api/impugnacoes/route"
      );

      // Sessão em uma sexta-feira: 2026-11-20T09:00:00Z
      // 3 dias úteis antes: Quinta (19), Quarta (18), Terça (17) ➔ 2026-11-17T18:00:00
      const dataAbertura = "2026-11-20T09:00:00.000Z";

      const criarReq = jsonRequest("http://localhost:3010/api/impugnacoes", {
        numeroEdital: "PE 55/2026-MEC",
        orgaoNome: "Ministério da Educação",
        objeto: "Contratação de links dedicados de internet",
        motivoLegal: "Cláusula restritiva exigindo certificação proprietária sem previsão em lei",
        dataAberturaSessao: dataAbertura,
        fundamentacao: "A exigência do item 8.4 colide com a Súmula 273 do TCU e viola a isonomia do Art. 9º da Lei 14.133.",
        pedidos: "Requer a anulação da cláusula 8.4 e a reabertura do prazo legal.",
      }, "POST");

      const criarResp = await criarImpugnacaoPOST(criarReq);
      expect(criarResp.status).toBe(201);
      const criarData = await criarResp.json();
      expect(criarData.ok).toBe(true);
      expect(criarData.impugnacao.status).toBe("RASCUNHO");
      expect(criarData.impugnacao.prazoFatal).toBeDefined();

      const prazo = new Date(criarData.impugnacao.prazoFatal);
      expect(prazo.getDate()).toBe(17);
      expect(prazo.getMonth()).toBe(10); // Novembro (mês 10 em base 0)

      // Testar listagem com cálculo de status/horas
      const listarReq = jsonRequest("http://localhost:3010/api/impugnacoes");
      const listarResp = await listarImpugnacoesGET(listarReq);
      expect(listarResp.status).toBe(200);
      const listarData = await listarResp.json();
      expect(listarData.ok).toBe(true);
      expect(Array.isArray(listarData.impugnacoes)).toBe(true);
      expect(listarData.impugnacoes.some((i: any) => i.numeroEdital === "PE 55/2026-MEC")).toBe(true);
    });

    it("deve atualizar status de RASCUNHO para PROTOCOLADA e registrar protocolo", async () => {
      const { POST: criarImpugnacaoPOST } = await import("@/app/api/impugnacoes/route");
      const { PATCH: atualizarImpugnacaoPATCH, GET: obterImpugnacaoGET } = await import(
        "@/app/api/impugnacoes/[id]/route"
      );

      const criarReq = jsonRequest("http://localhost:3010/api/impugnacoes", {
        numeroEdital: "PE 99/2026-GO",
        orgaoNome: "Governo do Estado de Goiás",
        motivoLegal: "Prazo exíguo de entrega",
        dataAberturaSessao: "2026-12-01T10:00:00.000Z",
        fundamentacao: "O prazo de 2 dias úteis para instalação física é materialmente impossível.",
        pedidos: "Requer a dilação para 15 dias corridos.",
      }, "POST");

      const criarResp = await criarImpugnacaoPOST(criarReq);
      const criarData = await criarResp.json();
      const impId = criarData.impugnacao.id;

      const patchReq = jsonRequest(`http://localhost:3010/api/impugnacoes/${impId}`, {
        status: "PROTOCOLADA",
        numeroProtocolo: "PROT-2026-009988",
        dataProtocolo: new Date().toISOString(),
      }, "PATCH");

      const patchResp = await atualizarImpugnacaoPATCH(patchReq, routeContext(impId));
      expect(patchResp.status).toBe(200);
      const patchData = await patchResp.json();
      expect(patchData.ok).toBe(true);
      expect(patchData.impugnacao.status).toBe("PROTOCOLADA");
      expect(patchData.impugnacao.numeroProtocolo).toBe("PROT-2026-009988");

      // Obter detalhes
      const getReq = jsonRequest(`http://localhost:3010/api/impugnacoes/${impId}`);
      const getResp = await obterImpugnacaoGET(getReq, routeContext(impId));
      expect(getResp.status).toBe(200);
      const getData = await getResp.json();
      expect(getData.impugnacao.status).toBe("PROTOCOLADA");
    });
  });
});

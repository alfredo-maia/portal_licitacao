// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

import { getServerSession } from "next-auth/next";
import { POST as ingestaoPOST } from "@/app/api/ingestao/route";
import {
  GET as oportunidadesGET,
  POST as oportunidadesPOST,
} from "@/app/api/oportunidades/route";
import { GET as oportunidadeByIdGET } from "@/app/api/oportunidades/[id]/route";
import { POST as decisaoPOST } from "@/app/api/oportunidades/[id]/decisao/route";
import { resetInMemoryLicitacoes } from "@/server/services/licitacoes-store";
import { criarOportunidadeManual } from "@/server/services/oportunidades.service";
import {
  DIRETORIA_USER,
  OPERADOR_USER,
  buildCriarManualInput,
  buildIngestaoItem,
  buildIngestaoPayload,
} from "./factories";

const mockedGetServerSession = vi.mocked(getServerSession);

function sessionDe(user: typeof DIRETORIA_USER | null) {
  return user ? ({ user, expires: "2999-01-01" } as never) : null;
}

function jsonRequest(url: string, body?: unknown, method?: string) {
  return new Request(url, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function routeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  resetInMemoryLicitacoes();
  mockedGetServerSession.mockReset();
  mockedGetServerSession.mockResolvedValue(sessionDe(DIRETORIA_USER));
});

describe("AV-36 — POST /api/ingestao (contrato v2)", () => {
  it("deve responder 200 com o resumo do lote para payload válido", async () => {
    const payload = buildIngestaoPayload([buildIngestaoItem()]);
    const response = await ingestaoPOST(
      jsonRequest("http://localhost/api/ingestao", payload),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.versaoContrato).toBe(2);
    expect(body.criados).toBe(1);
    expect(body.registros).toHaveLength(1);
  });

  it("deve responder 400 VALIDATION_ERROR para contrato inválido", async () => {
    const response = await ingestaoPOST(
      jsonRequest("http://localhost/api/ingestao", {
        versaoContrato: 1,
        licitacoes: [],
      }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("VALIDATION_ERROR");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("deve responder 400 INVALID_JSON para corpo malformado", async () => {
    const response = await ingestaoPOST(
      new Request("http://localhost/api/ingestao", {
        method: "POST",
        body: "{json quebrado",
      }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("INVALID_JSON");
  });
});

describe("AV-36 — GET /api/oportunidades (listagem e filtros)", () => {
  it("deve responder 200 ordenado por dataAbertura ASC", async () => {
    const response = await oportunidadesGET(
      jsonRequest("http://localhost/api/oportunidades"),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.total).toBe(body.oportunidades.length);

    const datas = body.oportunidades.map((l: { dataAbertura: string }) =>
      new Date(l.dataAbertura).getTime(),
    );
    expect(datas).toEqual([...datas].sort((a, b) => a - b));
  });

  it("deve aplicar query params do Dashboard (uf, tipoSistema, status)", async () => {
    const response = await oportunidadesGET(
      jsonRequest(
        "http://localhost/api/oportunidades?uf=GO&tipoSistema=EDUCACAO_PORTAL&status=PENDENTE",
      ),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    for (const lic of body.oportunidades) {
      expect(lic.uf).toBe("GO");
      expect(lic.tipoSistemaCodigo).toBe("EDUCACAO_PORTAL");
      expect(lic.status).toBe("PENDENTE");
    }
  });

  it("deve responder 400 para filtro inválido (uf com 3 letras)", async () => {
    const response = await oportunidadesGET(
      jsonRequest("http://localhost/api/oportunidades?uf=GOX"),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("VALIDATION_ERROR");
  });
});

describe("AV-36 — GET /api/oportunidades/[id]", () => {
  it("deve responder 200 com a licitação encontrada", async () => {
    const criada = await criarOportunidadeManual(
      buildCriarManualInput(),
      DIRETORIA_USER,
    );

    const response = await oportunidadeByIdGET(
      jsonRequest(`http://localhost/api/oportunidades/${criada.id}`),
      routeContext(criada.id),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.oportunidade.id).toBe(criada.id);
  });

  it("deve responder 404 para id inexistente", async () => {
    const response = await oportunidadeByIdGET(
      jsonRequest("http://localhost/api/oportunidades/nao-existe"),
      routeContext("nao-existe"),
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("OPORTUNIDADE_NAO_ENCONTRADA");
  });
});

describe("AV-36 — POST /api/oportunidades (cadastro manual com RBAC)", () => {
  it("deve responder 401 sem sessão", async () => {
    mockedGetServerSession.mockResolvedValue(null);

    const response = await oportunidadesPOST(
      jsonRequest("http://localhost/api/oportunidades", buildCriarManualInput()),
    );
    expect(response.status).toBe(401);
  });

  it("deve responder 403 para perfil OPERADOR", async () => {
    mockedGetServerSession.mockResolvedValue(sessionDe(OPERADOR_USER));

    const response = await oportunidadesPOST(
      jsonRequest("http://localhost/api/oportunidades", buildCriarManualInput()),
    );
    expect(response.status).toBe(403);
  });

  it("deve responder 201 para DIRETORIA com payload válido", async () => {
    const response = await oportunidadesPOST(
      jsonRequest("http://localhost/api/oportunidades", buildCriarManualInput()),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.oportunidade.status).toBe("PENDENTE");
  });

  it("deve responder 400 VALIDATION_ERROR para payload inválido", async () => {
    const response = await oportunidadesPOST(
      jsonRequest("http://localhost/api/oportunidades", {
        ...buildCriarManualInput(),
        miniResumo: "Sóumapalavra",
      }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("VALIDATION_ERROR");
  });
});

describe("AV-36 — POST /api/oportunidades/[id]/decisao (GO/No-GO com RBAC)", () => {
  it("deve responder 401 sem sessão", async () => {
    mockedGetServerSession.mockResolvedValue(null);

    const response = await decisaoPOST(
      jsonRequest("http://localhost/api/oportunidades/x/decisao", {
        decisao: "GO",
      }),
      routeContext("x"),
    );
    expect(response.status).toBe(401);
  });

  it("deve responder 403 para perfil OPERADOR", async () => {
    mockedGetServerSession.mockResolvedValue(sessionDe(OPERADOR_USER));
    const criada = await criarOportunidadeManual(buildCriarManualInput());

    const response = await decisaoPOST(
      jsonRequest(`http://localhost/api/oportunidades/${criada.id}/decisao`, {
        decisao: "GO",
      }),
      routeContext(criada.id),
    );
    expect(response.status).toBe(403);
  });

  it("deve responder 200 e mover status para ACEITA na decisão GO (DIRETORIA)", async () => {
    const criada = await criarOportunidadeManual(buildCriarManualInput());

    const response = await decisaoPOST(
      jsonRequest(`http://localhost/api/oportunidades/${criada.id}/decisao`, {
        decisao: "GO",
      }),
      routeContext(criada.id),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.oportunidade.status).toBe("ACEITA");
  });

  it("deve responder 200 e registrar motivoRecusa na decisão NO_GO", async () => {
    const criada = await criarOportunidadeManual(buildCriarManualInput());

    const response = await decisaoPOST(
      jsonRequest(`http://localhost/api/oportunidades/${criada.id}/decisao`, {
        decisao: "NO_GO",
        motivoRecusa: "Atestados incompatíveis com o edital.",
      }),
      routeContext(criada.id),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.oportunidade.status).toBe("RECUSADA");
    expect(body.oportunidade.motivoRecusa).toContain("Atestados");
  });

  it("deve responder 404 ao deliberar licitação inexistente", async () => {
    const response = await decisaoPOST(
      jsonRequest("http://localhost/api/oportunidades/nao-existe/decisao", {
        decisao: "GO",
      }),
      routeContext("nao-existe"),
    );
    expect(response.status).toBe(404);
  });
});

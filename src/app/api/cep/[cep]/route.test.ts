import { describe, expect, it, vi, beforeEach } from "vitest";

describe("API /api/cep/[cep] — Consulta de CEP ViaCEP & BrasilAPI Fallback", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("deve retornar 400 se o CEP não possuir 8 dígitos", async () => {
    const { GET } = await import("./route");
    const req = new Request("http://localhost:3000/api/cep/123");
    const res = await GET(req, { params: Promise.resolve({ cep: "123" }) });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toMatch(/8 dígitos/i);
  });

  it("deve consultar ViaCEP e retornar os dados estruturados do endereço", async () => {
    const mockViaCepResponse = {
      cep: "74115-030",
      logradouro: "Avenida República do Líbano",
      bairro: "Setor Oeste",
      localidade: "Goiânia",
      uf: "GO",
      erro: false,
    };

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("viacep.com.br")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockViaCepResponse),
        });
      }
      return Promise.reject(new Error("Unknown URL"));
    });

    const { GET } = await import("./route");
    const req = new Request("http://localhost:3000/api/cep/74115030");
    const res = await GET(req, { params: Promise.resolve({ cep: "74115030" }) });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.logradouro).toBe("Avenida República do Líbano");
    expect(data.bairro).toBe("Setor Oeste");
    expect(data.cidade).toBe("Goiânia");
    expect(data.uf).toBe("GO");
  });

  it("deve usar o fallback BrasilAPI quando ViaCEP falhar", async () => {
    const mockBrasilApiResponse = {
      cep: "74115030",
      state: "GO",
      city: "Goiânia",
      neighborhood: "Setor Oeste",
      street: "Avenida República do Líbano",
    };

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("viacep.com.br")) {
        return Promise.resolve({
          ok: false,
          status: 500,
        });
      }
      if (url.includes("brasilapi.com.br")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockBrasilApiResponse),
        });
      }
      return Promise.reject(new Error("Unknown URL"));
    });

    const { GET } = await import("./route");
    const req = new Request("http://localhost:3000/api/cep/74115-030");
    const res = await GET(req, { params: Promise.resolve({ cep: "74115-030" }) });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.cidade).toBe("Goiânia");
    expect(data.uf).toBe("GO");
    expect(data.logradouro).toBe("Avenida República do Líbano");
  });

  it("deve retornar 404 quando o CEP não for encontrado em nenhum dos provedores", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("viacep.com.br")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ erro: true }),
        });
      }
      if (url.includes("brasilapi.com.br")) {
        return Promise.resolve({
          ok: false,
          status: 404,
        });
      }
      return Promise.reject(new Error("CEP not found"));
    });

    const { GET } = await import("./route");
    const req = new Request("http://localhost:3000/api/cep/99999999");
    const res = await GET(req, { params: Promise.resolve({ cep: "99999999" }) });

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toMatch(/não encontrado/i);
  });
});

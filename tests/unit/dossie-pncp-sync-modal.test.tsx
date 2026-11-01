import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buscarESincronizarArquivosEditalPncp } from "@/server/services/oportunidades.service";
import { insertInMemoryLicitacao } from "@/server/services/licitacoes-store";

describe("Tarefa 5 — Sincronização PNCP Resiliente e Modal (#26)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("buscarESincronizarArquivosEditalPncp deve retornar mensagem amigável quando nenhum arquivo for encontrado", async () => {
    insertInMemoryLicitacao({
      id: "lic_sync_test",
      idPncp: "12345678000199-1-000001/2026",
      numeroEdital: "PE 99/2026",
      orgaoNome: "Tribunal de Contas",
      orgaoCnpj: "12345678000199",
      uf: "DF",
      valorEstimado: 100000,
      dataAbertura: new Date("2026-11-20T10:00:00Z"),
      miniResumo: "Licitação Teste",
      resumo: "Objeto teste",
      status: "PENDENTE",
      parecerIA: "AVALIAR",
    } as any);

    // Mock fetch para retornar array vazio
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    } as any);

    const resultado = await buscarESincronizarArquivosEditalPncp("lic_sync_test");
    expect(resultado.ok).toBe(true);
    expect(resultado.sincronizados).toBe(0);
    expect(resultado.mensagem).toBe(
      "Nenhum arquivo disponibilizado pelo órgão no PNCP para esta contratação.",
    );
  });

  it("buscarESincronizarArquivosEditalPncp deve tratar erro de conexão / timeout sem quebrar a aplicação", async () => {
    insertInMemoryLicitacao({
      id: "lic_sync_err",
      idPncp: "12345678000199-1-000002/2026",
      numeroEdital: "PE 100/2026",
      orgaoNome: "Tribunal de Contas",
      orgaoCnpj: "12345678000199",
      uf: "DF",
      valorEstimado: 100000,
      dataAbertura: new Date("2026-11-20T10:00:00Z"),
      miniResumo: "Licitação Teste",
      resumo: "Objeto teste",
      status: "PENDENTE",
      parecerIA: "AVALIAR",
    } as any);

    // Mock fetch para simular timeout/abort
    global.fetch = vi.fn().mockRejectedValue(new Error("Timeout de 8s excedido"));

    const resultado = await buscarESincronizarArquivosEditalPncp("lic_sync_err");
    expect(resultado.ok).toBe(false);
    expect(resultado.erroConexao).toBe(true);
    expect(resultado.mensagem).toBe(
      "Não foi possível conectar ao portal do PNCP no momento.",
    );
  });
});

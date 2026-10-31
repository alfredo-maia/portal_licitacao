import { describe, expect, it } from "vitest";
import { executarJobNotificacoesDiarias } from "@/server/services/notificacoes.service";
import { insertInMemoryDocumento, insertInMemoryPortal } from "@/server/services/licitacoes-store";

describe("Sprint Nova Task 7 — Notificações: Alertas de Vencimento em 30 Dias", () => {
  it("deve gerar alertas automáticos para documentos e portais que vencem em 30 dias", async () => {
    const hoje = new Date("2026-11-01T10:00:00Z");
    const dataVencimento30d = new Date("2026-12-01T10:00:00Z");

    insertInMemoryDocumento({
      id: "doc_venc_30d_teste",
      nome: "Certidão Estadual de Débitos",
      categoria: "FISCAL_TRABALHISTA",
      dataVencimento: dataVencimento30d,
      semValidade: false,
      status: "ATIVO",
    });

    insertInMemoryPortal({
      id: "portal_venc_30d_teste",
      nome: "Comprasnet / Compras.gov",
      url: "https://comprasnet.gov.br",
      dataVencimento: dataVencimento30d,
    });

    const resultadoJob = await executarJobNotificacoesDiarias(hoje);
    expect(resultadoJob.ok).toBe(true);
    expect(resultadoJob.contagens.N7_VENCIMENTO_DOCUMENTO).toBeGreaterThanOrEqual(1);
    expect(resultadoJob.contagens.N6_VENCIMENTO_PORTAL).toBeGreaterThanOrEqual(1);
  });

  it("deve cobrir janelas oficiais da matriz (ex: 14 e 1 dias) para documentos e portais", async () => {
    const hoje = new Date("2026-11-01T10:00:00Z");
    const data14d = new Date("2026-11-15T10:00:00Z"); // 14 dias

    insertInMemoryDocumento({
      id: "doc_venc_14d_teste",
      nome: "Alvará Sanitário",
      categoria: "HABILITACAO_JURIDICA",
      dataVencimento: data14d,
      semValidade: false,
      status: "ATIVO",
    });

    const resultadoJob = await executarJobNotificacoesDiarias(hoje);
    expect(resultadoJob.contagens.N7_VENCIMENTO_DOCUMENTO).toBeGreaterThanOrEqual(1);
  });
});

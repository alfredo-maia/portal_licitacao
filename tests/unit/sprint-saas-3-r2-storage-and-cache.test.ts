import { describe, expect, it } from "vitest";
import {
  fazerUploadStreamingR2,
  obterObjetoR2,
  sincronizarDocumentosLicitacaoPncp,
} from "@/server/storage/r2-storage.service";
import { TTL_CACHE_EDITAIS_MS } from "@/server/schemas/storage-r2.schema";

describe("Sprint SaaS 3 — Streaming Cloudflare R2, Princípio Zero-PDF & Cache Diário (TTL 24h)", () => {
  it("deve fazer upload em streaming para o R2 sem salvar no disco local", async () => {
    const conteudoFake = Buffer.from("%PDF-1.4 Mock do edital de licitação em streaming R2");
    const chave = "editais/teste-lic-123/edital-completo.pdf";

    const upload = await fazerUploadStreamingR2({
      chave,
      buffer: conteudoFake,
      mimeType: "application/pdf",
      tamanho: conteudoFake.length,
      metadata: {
        numeroEdital: "PE 12/2026",
        licitacaoId: "lic_123",
      },
    });

    expect(upload.ok).toBe(true);
    expect(upload.chave).toBe(chave);
    expect(upload.tamanho).toBe(conteudoFake.length);
    expect(upload.url).toContain(chave);

    // Recupera objeto direto do storage em memória / R2
    const obj = await obterObjetoR2(chave);
    expect(obj).toBeDefined();
    expect(obj?.buffer.toString()).toBe(conteudoFake.toString());
    expect(obj?.mimeType).toBe("application/pdf");
  });

  describe("Sincronização e Lazy Caching de Editais PNCP (TTL 24h)", () => {
    const licitacaoId = "lic_pncp_teste_456";

    it("1ª chamada (Cache Miss): deve sincronizar e persistir no R2", async () => {
      const res = await sincronizarDocumentosLicitacaoPncp(licitacaoId);

      expect(res.ok).toBe(true);
      expect(res.licitacaoId).toBe(licitacaoId);
      expect(res.origem).toBe("PNCP_SYNC");
      expect(res.arquivos.length).toBeGreaterThanOrEqual(1);

      const edital = res.arquivos[0];
      expect(edital.statusCache).toBe("SINCRONIZADO");
      expect(edital.r2Key).toContain(licitacaoId);
      expect(edital.urlDownload).toBeDefined();
    });

    it("2ª chamada imediata (Cache Hit): deve servir diretamente do cache R2 com TTL de 24h", async () => {
      const res = await sincronizarDocumentosLicitacaoPncp(licitacaoId);

      expect(res.ok).toBe(true);
      expect(res.origem).toBe("R2_CACHE");
      expect(res.arquivos.length).toBeGreaterThanOrEqual(1);

      const edital = res.arquivos[0];
      expect(edital.statusCache).toBe("CACHE_HIT");
    });

    it("deve respeitar expiração do TTL de 24 horas", () => {
      expect(TTL_CACHE_EDITAIS_MS).toBe(86400000); // 24 * 60 * 60 * 1000
    });
  });
});

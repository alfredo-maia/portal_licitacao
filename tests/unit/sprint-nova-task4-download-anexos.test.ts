import { describe, expect, it } from "vitest";
import { GET as downloadRoute } from "@/app/api/oportunidades/[id]/arquivos/[arquivoId]/download/route";
import { insertInMemoryLicitacaoArquivo } from "@/server/services/licitacoes-store";

describe("Sprint Nova Task 4 — Rota de Download Streaming de Anexos do Dossiê", () => {
  it("deve responder com status 200, headers de anexo e stream de bytes para download", async () => {
    const licitacaoId = "lic_test_dossie_1";
    const arquivoId = "arq_anexo_1";

    insertInMemoryLicitacaoArquivo(licitacaoId, {
      id: arquivoId,
      nome: "edital_completo_anexo.pdf",
      mimeType: "application/pdf",
      tamanho: 1024,
      caminho: "https://docs.licitacao.internal/editais/lic_test_dossie_1/edital_completo_anexo.pdf",
      r2Key: "editais/lic_test_dossie_1/edital_completo_anexo.pdf",
    });

    const mockRequest = new Request(
      `http://localhost:3000/api/oportunidades/${licitacaoId}/arquivos/${arquivoId}/download`,
    );
    const mockContext = {
      params: Promise.resolve({ id: licitacaoId, arquivoId }),
    };

    const response = await downloadRoute(mockRequest, mockContext);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("attachment;");
    expect(response.headers.get("content-disposition")).toContain("edital_completo_anexo.pdf");
    expect(response.headers.get("content-type")).toBe("application/pdf");
  });
});

import { describe, expect, it } from "vitest";
import { formatarDataSemOffset } from "@/lib/date-utils";
import {
  atualizarDocumento,
  criarDocumento,
  listarDocumentos,
} from "@/server/services/documentos.service";

describe("Sprint Nova Task 5 — Documentação: Timezone e Substituição sem Duplicação", () => {
  it("deve formatar a data sem subtrair 1 dia independente do fuso horário local", () => {
    const dataString1 = "2026-10-27";
    const dataString2 = "2026-10-27T00:00:00.000Z";

    expect(formatarDataSemOffset(dataString1)).toBe("27/10/2026");
    expect(formatarDataSemOffset(dataString2)).toBe("27/10/2026");
  });

  it("ao atualizar documento, deve substituir o existente sem criar novo registro duplicado na listagem", async () => {
    const docCriado = await criarDocumento({
      nome: "Certidão Negativa de Débitos",
      categoria: "FISCAL_TRABALHISTA",
      dataVencimento: new Date("2026-10-27"),
      semValidade: false,
    });

    const resInicial = await listarDocumentos();
    const countInicial = resInicial.documentos.length;

    // Atualização com nova data e novo arquivo (substituição in-place)
    await atualizarDocumento(docCriado.id, {
      dataVencimento: new Date("2027-10-27"),
      arquivoNome: "cnd_nova.pdf",
    });

    const resFinal = await listarDocumentos();
    expect(resFinal.documentos.length).toBe(countInicial); // Não duplicou
    const docAtualizado = resFinal.documentos.find((d) => d.id === docCriado.id);
    expect(docAtualizado?.arquivoNome).toBe("cnd_nova.pdf");
  });
});

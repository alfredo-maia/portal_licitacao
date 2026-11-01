import { describe, expect, it } from "vitest";
import { formatarDataSemOffset, parseDataCivil, extrairDiaCivil } from "@/lib/date-utils";
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

  it("parseDataCivil e extrairDiaCivil devem preservar o dia civil imune a fusos horários", () => {
    const dataParsed = parseDataCivil("2026-10-27");
    expect(dataParsed).toBeInstanceOf(Date);
    expect(dataParsed?.toISOString()).toBe("2026-10-27T12:00:00.000Z");

    const diaExtraido = extrairDiaCivil("2026-10-27");
    expect(diaExtraido).toBe(27);

    const diaDeDateIso = extrairDiaCivil(dataParsed);
    expect(diaDeDateIso).toBe(27);
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

  it("deve permitir editar dados do documento (nome, orgao emissor, categoria) via atualizarDocumento", async () => {
    const doc = await criarDocumento({
      nome: "Contrato Social Provisório",
      categoria: "JURIDICA",
      semValidade: true,
    });

    const atualizado = await atualizarDocumento(doc.id, {
      nome: "Contrato Social Consolidado 2026",
      orgaoEmissor: "Junta Comercial JUCESP",
      categoria: "JURIDICA",
    });

    expect(atualizado?.nome).toBe("Contrato Social Consolidado 2026");
    expect(atualizado?.orgaoEmissor).toBe("Junta Comercial JUCESP");
  });
});

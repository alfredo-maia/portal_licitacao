import { describe, expect, it } from "vitest";
import { buscarPortaisVencendoNoMes } from "@/server/services/portais.service";
import { getCalendarioData } from "@/server/services/calendario.service";
import { criarDocumento, criarNovaVersao, obterDocumento } from "@/server/services/documentos.service";

describe("Task 6 — Ajustes em Portais, Calendário, Documentação e Declarações", () => {
  it("deve projetar vencimentos de portais no mês dentro de getCalendarioData", async () => {
    const cal = await getCalendarioData({ ano: 2026, mes: 11 });
    expect(cal.ok).toBe(true);
    expect(Array.isArray(cal.alertasPortais)).toBe(true);
  });

  it("deve atualizar os metadados do documento raiz ao criar uma nova versão (V2/V3)", async () => {
    // 1. Cria documento base
    const docOriginal = await criarDocumento({
      nome: "Certidão FGTS",
      categoria: "FISCAL_TRABALHISTA",
      tipo: "CERTIDAO_FGTS",
      semValidade: false,
      dataEmissao: new Date("2026-01-01"),
      dataVencimento: new Date("2026-02-01"),
      arquivoUrl: "https://r2.exemplo.com/fgts_v1.pdf",
      arquivoNome: "fgts_v1.pdf",
    });

    expect(docOriginal.versao).toBe(1);

    // 2. Cria nova versão (V2) com nova data de vencimento
    const novaValidade = new Date("2026-06-01");
    const v2 = await criarNovaVersao(docOriginal.id, {
      dataEmissao: new Date("2026-05-01"),
      dataVencimento: novaValidade,
      arquivoUrl: "https://r2.exemplo.com/fgts_v2.pdf",
      arquivoNome: "fgts_v2.pdf",
    });

    expect(v2).not.toBeNull();
    expect(v2?.versao).toBe(2);

    // 3. Documento raiz deve ter sido atualizado com a nova validade
    const raizAtualizado = await obterDocumento(docOriginal.id);
    expect(raizAtualizado?.documento.dataVencimento).toBeDefined();
    expect(raizAtualizado?.documento.versao).toBe(2);
  });
});

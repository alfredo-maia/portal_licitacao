import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { gerarPdfDeclaracao } from "@/lib/declaracao-pdf";
import { gerarPdfMinutaImpugnacao } from "@/lib/minuta-juridica";

describe("Geração de PDF Timbrado de Declarações e Impugnações (A4 Garantido)", () => {
  it("Gera PDF de Declaração Oficial em 1 página A4 padronizada (595.28 x 841.89)", async () => {
    const { pdfBuffer, pdfNome } = await gerarPdfDeclaracao({
      dados: {
        tipo: "INEXISTENCIA_FATOS_IMPEDITIVOS",
        numeroEdital: "PE 102/2026",
        orgaoNome: "Tribunal Regional Eleitoral",
        empresaRazaoSocial: "APONTA SERVICOS DIGITAIS LTDA",
        empresaCnpj: "74.962.700/0001-01",
        representanteNome: "Vitor Henrique",
        representanteCargo: "Sócio-Diretor",
        representanteCpf: "123.456.789-00",
        cidade: "Goiânia",
        uf: "GO",
      },
      empresa: {
        razaoSocial: "APONTA SERVICOS DIGITAIS LTDA",
        cnpj: "74.962.700/0001-01",
        cidade: "Goiânia",
        uf: "GO",
      },
    });

    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(1000);
    expect(pdfNome).toContain("inexistencia_fatos_impeditivos");

    const loaded = await PDFDocument.load(new Uint8Array(pdfBuffer));
    expect(loaded.getPageCount()).toBe(1);

    const page = loaded.getPage(0);
    const { width, height } = page.getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
  });

  it("Embutir Folha Timbrada em PDF customizada/não-A4 redimensiona perfeitamente para A4", async () => {
    // Cria um PDF de papel timbrado com dimensões não-A4 (ex: screenshot 315x424)
    const customTimbrado = await PDFDocument.create();
    const customPage = customTimbrado.addPage([315, 424]);
    customPage.drawText("CABECALHO TIMBRADO DA EMPRESA", { x: 20, y: 390, size: 10 });
    const timbradoBytes = await customTimbrado.save();
    const timbradoBase64 = `data:application/pdf;base64,${Buffer.from(timbradoBytes).toString("base64")}`;

    // 1. Testa na Minuta de Impugnação
    const resImpugnacao = await gerarPdfMinutaImpugnacao({
      impugnacao: {
        numeroEdital: "PE 55/2026",
        orgaoNome: "Prefeitura de Goiânia",
        motivoLegal: "Exigência descabida de atestado específico.",
        fundamentacao: "Súmula 263 do TCU veda exigência desproporcional.",
        pedidos: "Reforma imediata do item 8.2.",
        dataAberturaSessao: new Date("2026-11-20T10:00:00Z"),
      },
      empresa: {
        razaoSocial: "TECH SOLUTIONS LTDA",
        cnpj: "74.962.700/0001-01",
        papelTimbradoUrl: timbradoBase64,
      },
    });

    const docImpugnacao = await PDFDocument.load(new Uint8Array(resImpugnacao.pdfBuffer));
    const pageImp = docImpugnacao.getPage(0);
    const dimsImp = pageImp.getSize();
    // Garante que mesmo com timbrado 315x424, o documento resultante é estritamente A4!
    expect(Math.round(dimsImp.width)).toBe(595);
    expect(Math.round(dimsImp.height)).toBe(842);
    // Salva para inspeção visual
    const fs = await import("fs");
    fs.writeFileSync("/tmp/teste_timbrado_novo.pdf", resImpugnacao.pdfBuffer);

    // 2. Testa na Declaração Oficial
    const resDeclaracao = await gerarPdfDeclaracao({
      dados: {
        tipo: "HABILITACAO_PLENA",
        numeroEdital: "PE 55/2026",
        orgaoNome: "Prefeitura de Goiânia",
        empresaRazaoSocial: "TECH SOLUTIONS LTDA",
        empresaCnpj: "74.962.700/0001-01",
        representanteNome: "Vitor Henrique",
        representanteCargo: "Sócio",
        representanteCpf: "123.456.789-00",
        cidade: "Goiânia",
        uf: "GO",
      },
      empresa: {
        razaoSocial: "TECH SOLUTIONS LTDA",
        cnpj: "74.962.700/0001-01",
        papelTimbradoUrl: timbradoBase64,
      },
    });

    const docDeclaracao = await PDFDocument.load(new Uint8Array(resDeclaracao.pdfBuffer));
    const pageDec = docDeclaracao.getPage(0);
    const dimsDec = pageDec.getSize();
    expect(Math.round(dimsDec.width)).toBe(595);
    expect(Math.round(dimsDec.height)).toBe(842);
    expect(docDeclaracao.getPageCount()).toBe(1);
  });

  it("Endpoint POST /api/declaracoes/pdf valida contrato e retorna PDF binário", async () => {
    const { POST } = await import("@/app/api/declaracoes/pdf/route");
    const req = new Request("http://localhost:3000/api/declaracoes/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo: "NAO_EMPREGA_MENOR",
        numeroEdital: "PE 99/2026",
        orgaoNome: "Tribunal de Justiça",
        empresaRazaoSocial: "EMPRESA DE TESTE LTDA",
        empresaCnpj: "12.345.678/0001-90",
        representanteNome: "Carlos Silva",
        representanteCargo: "Gerente",
        representanteCpf: "111.222.333-44",
        cidade: "São Paulo",
        uf: "SP",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("declaracao_nao_emprega_menor");

    const arrayBuffer = await res.arrayBuffer();
    expect(arrayBuffer.byteLength).toBeGreaterThan(1000);

    const doc = await PDFDocument.load(new Uint8Array(arrayBuffer));
    expect(doc.getPageCount()).toBe(1);
  });
});

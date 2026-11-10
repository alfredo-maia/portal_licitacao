import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  gerarConteudoPedidoCotacao,
  type GerarPedidoCotacaoParams,
} from "./pedido-cotacao-template";

function extrairBytesBase64(input?: string | null): Uint8Array | null {
  if (!input || typeof input !== "string") return null;
  const match = input.match(/^data:[^;]+;base64,(.+)$/);
  const base64Str = match ? match[1] : input.replace(/\s+/g, "");
  try {
    const buf = Buffer.from(base64Str, "base64");
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  } catch {
    return null;
  }
}

function isPdfBytes(buf: Uint8Array | null): boolean {
  return Boolean(
    buf &&
    buf.length > 4 &&
    buf[0] === 0x25 &&
    buf[1] === 0x50 &&
    buf[2] === 0x44 &&
    buf[3] === 0x46,
  );
}

function sanitizarTextoParaPdf(texto: string, font: any): string {
  if (!texto) return "";
  const cleaned = texto
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2022\u00B7]/g, "*")
    .replace(/\r/g, "");

  let res = "";
  for (const ch of cleaned) {
    try {
      font.encodeText(ch);
      res += ch;
    } catch {
      const norm = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      try {
        font.encodeText(norm);
        res += norm;
      } catch {
        res += " ";
      }
    }
  }
  return res;
}

function quebrarTextoEmLinhas(
  texto: string,
  maxLargura: number,
  font: any,
  fontSize: number,
): string[] {
  if (!texto) return [];
  const paragrafos = texto.split("\n");
  const linhas: string[] = [];

  for (const p of paragrafos) {
    if (!p.trim()) {
      linhas.push("");
      continue;
    }
    const palavras = p.trim().split(/\s+/);
    let linhaAtual = "";

    for (const pal of palavras) {
      const tentativa = linhaAtual ? `${linhaAtual} ${pal}` : pal;
      const w = font.widthOfTextAtSize(tentativa, fontSize);
      if (w <= maxLargura) {
        linhaAtual = tentativa;
      } else {
        if (linhaAtual) linhas.push(linhaAtual);
        linhaAtual = pal;
      }
    }
    if (linhaAtual) linhas.push(linhaAtual);
  }
  return linhas;
}

export async function gerarPdfPedidoCotacao(params: GerarPedidoCotacaoParams): Promise<{
  pdfBuffer: Buffer;
  pdfNome: string;
}> {
  const { orgaoNome, numeroEdital, itens, configuracao, empresa } = params;

  const doc = await PDFDocument.create();
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  // Papel timbrado da empresa (se houver)
  let timbradoDoc: PDFDocument | null = null;
  const timbradoBytes = extrairBytesBase64(empresa?.papelTimbradoUrl);
  if (timbradoBytes && isPdfBytes(timbradoBytes)) {
    try {
      timbradoDoc = await PDFDocument.load(timbradoBytes, { ignoreEncryption: true });
    } catch {}
  }
  const hasTimbrado = Boolean(timbradoDoc);

  const marginX = 42;
  const contentWidth = 595.28 - marginX * 2;
  const bottomY = hasTimbrado ? 80 : 55;

  let pageIndex = 0;
  let currentPage: any = null;
  let currentY = 0;

  const criarPagina = async () => {
    const p = doc.addPage([595.28, 841.89]);
    if (hasTimbrado && timbradoDoc) {
      const tIdx = Math.min(pageIndex, timbradoDoc.getPageCount() - 1);
      try {
        const [embedded] = await doc.embedPdf(timbradoDoc, [tIdx]);
        p.drawPage(embedded, { x: 0, y: 0, width: 595.28, height: 841.89 });
      } catch {}
    }

    if (pageIndex === 0) {
      currentY = hasTimbrado ? 660 : 780;
    } else {
      currentY = hasTimbrado ? 730 : 790;
    }
    currentPage = p;
    pageIndex++;
    return p;
  };

  await criarPagina();

  const cfg = configuracao || {};
  const ocultarOrgaoEdital =
    (cfg as { ocultarOrgaoEdital?: boolean }).ocultarOrgaoEdital ?? true;
  const razaoSocial = sanitizarTextoParaPdf(empresa?.razaoSocial || "EMPRESA SOLICITANTE LTDA", fontBold);
  const cnpj = sanitizarTextoParaPdf(empresa?.cnpj || "00.000.000/0001-00", fontRegular);
  const localEntrega = sanitizarTextoParaPdf(
    `${cfg.localEntregaCidade || empresa?.cidade || "Goiânia"}/${cfg.localEntregaUf || empresa?.uf || "GO"}`,
    fontBold,
  );
  const prazoResposta = sanitizarTextoParaPdf(cfg.prazoResposta || "Até 3 dias úteis", fontBold);
  const frete = cfg.modalidadeFrete === "FOB" ? "FOB" : "CIF (Incluso no valor cotado até o destino)";

  // Título e Header (Apenas na página 1)
  if (!hasTimbrado) {
    currentPage.drawText(razaoSocial, {
      x: marginX,
      y: currentY,
      size: 11,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    });
    currentY -= 14;
    currentPage.drawText(`CNPJ: ${cnpj}`, {
      x: marginX,
      y: currentY,
      size: 8.5,
      font: fontRegular,
      color: rgb(0.35, 0.35, 0.35),
    });
    currentY -= 16;
  }

  // Título do documento
  currentPage.drawText("SOLICITACAO DE COTACAO DE PRECOS (RFQ)", {
    x: marginX,
    y: currentY,
    size: 12,
    font: fontBold,
    color: rgb(0.06, 0.38, 0.99), // Blue
  });
  currentY -= 6;

  // Linha divisória
  currentPage.drawLine({
    start: { x: marginX, y: currentY },
    end: { x: marginX + contentWidth, y: currentY },
    thickness: 1.5,
    color: rgb(0.06, 0.38, 0.99),
  });
  currentY -= 16;

  // Bloco de Dados do Pedido (com altura dinâmica para comportar Referência/Sigilo, Condições e Observações)
  const orgaoTrim = (orgaoNome || "").trim();
  const editalTrim = (numeroEdital || "").trim();
  const orgaoVisivel = Boolean(
    !ocultarOrgaoEdital &&
      orgaoTrim &&
      !orgaoTrim.toLowerCase().includes("sigilo comercial"),
  );

  const infoLinhas: Array<{ texto: string; bold?: boolean }> = [];
  infoLinhas.push({
    texto: sanitizarTextoParaPdf(
      cfg.fornecedorNome
        ? `Destinatario: ${cfg.fornecedorNome}`
        : "Destinatario: Ao Departamento Comercial / Vendas",
      fontBold,
    ),
    bold: true,
  });
  infoLinhas.push({
    texto: sanitizarTextoParaPdf(`Local de Entrega: ${localEntrega} • Frete: ${frete}`, fontRegular),
  });
  infoLinhas.push({
    texto: sanitizarTextoParaPdf(
      `Prazo Limite Resposta: ${prazoResposta} • Garantia: ${cfg.prazoGarantia || "12 meses"}`,
      fontRegular,
    ),
  });
  if (cfg.condicoesPagamento && cfg.condicoesPagamento.trim()) {
    for (const l of quebrarTextoEmLinhas(
      sanitizarTextoParaPdf(`Condicoes de Pagamento: ${cfg.condicoesPagamento.trim()}`, fontRegular),
      contentWidth - 20,
      fontRegular,
      8,
    )) {
      infoLinhas.push({ texto: l });
    }
  }
  if (orgaoVisivel) {
    const refStr =
      editalTrim && !editalTrim.toLowerCase().includes("sigilo comercial")
        ? `Referencia do Certame: ${orgaoTrim} - Edital ${editalTrim}`
        : `Referencia do Certame: ${orgaoTrim}`;
    for (const l of quebrarTextoEmLinhas(
      sanitizarTextoParaPdf(refStr, fontBold),
      contentWidth - 20,
      fontBold,
      8,
    )) {
      infoLinhas.push({ texto: l, bold: true });
    }
  }
  if (cfg.observacoes && cfg.observacoes.trim()) {
    for (const l of quebrarTextoEmLinhas(
      sanitizarTextoParaPdf(`Observacoes: ${cfg.observacoes.trim()}`, fontRegular),
      contentWidth - 20,
      fontRegular,
      8,
    )) {
      infoLinhas.push({ texto: l });
    }
  }

  const lineHeightInfo = 12;
  const boxH = Math.max(46, infoLinhas.length * lineHeightInfo + 14);
  currentPage.drawRectangle({
    x: marginX,
    y: currentY - boxH + 12,
    width: contentWidth,
    height: boxH,
    color: rgb(0.96, 0.96, 0.96),
    borderColor: rgb(0.85, 0.85, 0.85),
    borderWidth: 1,
  });

  let infoY = currentY - 2;
  for (let i = 0; i < infoLinhas.length; i++) {
    const itemInfo = infoLinhas[i]!;
    currentPage.drawText(itemInfo.texto, {
      x: marginX + 10,
      y: infoY,
      size: i === 0 ? 8.5 : 8,
      font: itemInfo.bold ? fontBold : fontRegular,
      color: i === 0 ? rgb(0.1, 0.1, 0.1) : rgb(0.2, 0.2, 0.2),
    });
    infoY -= lineHeightInfo;
  }

  currentY -= boxH + 10;

  // Cabeçalho da Tabela
  const colW = {
    item: 35,
    desc: 235,
    qtd: 40,
    und: 35,
    marcaCotada: 85,
    unit: 40,
    tot: 41,
  };

  const drawTableHeader = () => {
    currentPage.drawRectangle({
      x: marginX,
      y: currentY - 14,
      width: contentWidth,
      height: 18,
      color: rgb(0.06, 0.38, 0.99),
    });

    let curX = marginX;
    currentPage.drawText("Item", { x: curX + 6, y: currentY - 10, size: 8, font: fontBold, color: rgb(1, 1, 1) });
    curX += colW.item;
    currentPage.drawText("Descricao / Especificacao", { x: curX + 6, y: currentY - 10, size: 8, font: fontBold, color: rgb(1, 1, 1) });
    curX += colW.desc;
    currentPage.drawText("Qtd", { x: curX + 6, y: currentY - 10, size: 8, font: fontBold, color: rgb(1, 1, 1) });
    curX += colW.qtd;
    currentPage.drawText("Unid", { x: curX + 6, y: currentY - 10, size: 8, font: fontBold, color: rgb(1, 1, 1) });
    curX += colW.und;
    currentPage.drawText("Marca Ofertada", { x: curX + 6, y: currentY - 10, size: 8, font: fontBold, color: rgb(1, 1, 1) });
    curX += colW.marcaCotada;
    currentPage.drawText("V. Unit.", { x: curX + 4, y: currentY - 10, size: 8, font: fontBold, color: rgb(1, 1, 1) });
    curX += colW.unit;
    currentPage.drawText("V. Total", { x: curX + 4, y: currentY - 10, size: 8, font: fontBold, color: rgb(1, 1, 1) });

    currentY -= 20;
  };

  drawTableHeader();

  // Linhas de Itens
  for (let idx = 0; idx < itens.length; idx++) {
    const it = itens[idx]!;
    const numStr = String(it.numeroItem ?? idx + 1);
    const descSanitizada = sanitizarTextoParaPdf(it.descricao, fontBold);
    const especSanitizada = it.especificacaoDetalhada && it.especificacaoDetalhada !== it.descricao
      ? sanitizarTextoParaPdf(it.especificacaoDetalhada, fontRegular)
      : "";

    const linhasDesc = quebrarTextoEmLinhas(descSanitizada, colW.desc - 10, fontBold, 8);
    const linhasEspec = especSanitizada ? quebrarTextoEmLinhas(especSanitizada, colW.desc - 10, fontRegular, 7) : [];
    const totLinhas = linhasDesc.length + linhasEspec.length + (it.marcaSugerida ? 1 : 0);
    const rowHeight = Math.max(26, totLinhas * 9 + 8);

    if (currentY - rowHeight < bottomY) {
      await criarPagina();
      drawTableHeader();
    }

    // Fundo zebrado
    if (idx % 2 === 1) {
      currentPage.drawRectangle({
        x: marginX,
        y: currentY - rowHeight + 4,
        width: contentWidth,
        height: rowHeight,
        color: rgb(0.98, 0.98, 0.98),
      });
    }

    // Linha inferior
    currentPage.drawLine({
      start: { x: marginX, y: currentY - rowHeight + 4 },
      end: { x: marginX + contentWidth, y: currentY - rowHeight + 4 },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.85),
    });

    let curX = marginX;
    currentPage.drawText(numStr, { x: curX + 10, y: currentY - 8, size: 8, font: fontBold, color: rgb(0.1, 0.1, 0.1) });

    curX += colW.item;
    let textY = currentY - 8;
    for (const l of linhasDesc) {
      currentPage.drawText(l, { x: curX + 4, y: textY, size: 8, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
      textY -= 9;
    }
    for (const l of linhasEspec.slice(0, 3)) {
      currentPage.drawText(l, { x: curX + 4, y: textY, size: 7, font: fontRegular, color: rgb(0.35, 0.35, 0.35) });
      textY -= 8;
    }
    if (it.marcaSugerida) {
      currentPage.drawText(sanitizarTextoParaPdf(`Ref: ${it.marcaSugerida}`, fontRegular), {
        x: curX + 4,
        y: textY,
        size: 7,
        font: fontRegular,
        color: rgb(0.06, 0.38, 0.99),
      });
    }

    curX += colW.desc;
    currentPage.drawText(String(it.quantidade), { x: curX + 8, y: currentY - 8, size: 8, font: fontBold, color: rgb(0.1, 0.1, 0.1) });

    curX += colW.qtd;
    currentPage.drawText(sanitizarTextoParaPdf(it.unidadeMedida, fontRegular), {
      x: curX + 6,
      y: currentY - 8,
      size: 8,
      font: fontRegular,
      color: rgb(0.1, 0.1, 0.1),
    });

    // Campos pontilhados para preenchimento pelo fornecedor
    curX += colW.und;
    currentPage.drawLine({
      start: { x: curX + 4, y: currentY - 14 },
      end: { x: curX + colW.marcaCotada - 4, y: currentY - 14 },
      thickness: 0.5,
      color: rgb(0.6, 0.6, 0.6),
    });

    curX += colW.marcaCotada;
    currentPage.drawLine({
      start: { x: curX + 4, y: currentY - 14 },
      end: { x: curX + colW.unit - 4, y: currentY - 14 },
      thickness: 0.5,
      color: rgb(0.6, 0.6, 0.6),
    });

    curX += colW.unit;
    currentPage.drawLine({
      start: { x: curX + 4, y: currentY - 14 },
      end: { x: curX + colW.tot - 4, y: currentY - 14 },
      thickness: 0.5,
      color: rgb(0.6, 0.6, 0.6),
    });

    currentY -= rowHeight;
  }

  // Rodapé com data e assinatura
  currentY -= 15;
  if (currentY < bottomY + 30) {
    await criarPagina();
  }
  currentPage.drawText(sanitizarTextoParaPdf(empresa?.razaoSocial || "Empresa Licitante", fontBold), {
    x: marginX,
    y: currentY,
    size: 8,
    font: fontBold,
    color: rgb(0.2, 0.2, 0.2),
  });
  currentPage.drawText("Departamento de Suprimentos & Cotacoes", {
    x: marginX,
    y: currentY - 10,
    size: 7.5,
    font: fontRegular,
    color: rgb(0.4, 0.4, 0.4),
  });

  const pdfBytes = await doc.save();
  const slug = ocultarOrgaoEdital
    ? "sigilo"
    : ((numeroEdital || "cotacao").replace(/[^a-zA-Z0-9]/g, "_") || "cotacao");
  const pdfNome = `pedido_cotacao_${slug}.pdf`;

  return {
    pdfBuffer: Buffer.from(pdfBytes),
    pdfNome,
  };
}


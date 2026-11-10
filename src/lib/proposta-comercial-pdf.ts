import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  consolidarCalculadoraProposta,
  formatarMoedaBrl,
  type ConfiguracaoPropostaInput,
  type ItemCalculadoraInput,
} from "@/server/schemas/proposta-calculadora.schema";
import {
  formatarDataExtensoProposta,
  formatarValidadeDiasExtenso,
  gerarConteudoPropostaComercial,
  type GerarPropostaParams,
} from "@/lib/proposta-comercial-template";
import type { DadosEmpresaMinuta } from "@/lib/minuta-juridica";

export {
  gerarConteudoPropostaComercial,
  formatarDataExtensoProposta,
  type GerarPropostaParams,
};

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

function isPngBytes(buf: Uint8Array | null): boolean {
  return Boolean(
    buf &&
    buf.length > 4 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47,
  );
}

function isJpgBytes(buf: Uint8Array | null): boolean {
  return Boolean(
    buf &&
    buf.length > 3 &&
    buf[0] === 0xff &&
    buf[1] === 0xd8 &&
    buf[2] === 0xff,
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

  for (const par of paragrafos) {
    const trimmed = par.trim();
    if (!trimmed) {
      linhas.push("");
      continue;
    }
    const palavras = trimmed.split(/\s+/);
    let linhaAtual = "";
    for (const p of palavras) {
      const candidato = linhaAtual ? `${linhaAtual} ${p}` : p;
      const largura = font.widthOfTextAtSize(candidato, fontSize);
      if (largura <= maxLargura) {
        linhaAtual = candidato;
      } else {
        if (linhaAtual) linhas.push(linhaAtual);
        linhaAtual = p;
      }
    }
    if (linhaAtual) linhas.push(linhaAtual);
  }
  return linhas;
}

export async function gerarPdfPropostaComercial(params: GerarPropostaParams): Promise<{
  pdfBuffer: Buffer;
  pdfNome: string;
}> {
  const { orgaoNome, numeroEdital, objetoLicitacao, itens: itensRaw, configuracao, empresa: empresaInput } = params;
  const consolidado = consolidarCalculadoraProposta(itensRaw, configuracao);
  const cfg = consolidado.propostaConfig;

  const empresa = {
    razaoSocial: (empresaInput?.razaoSocial || "EMPRESA LICITANTE LTDA").trim(),
    cnpj: (empresaInput?.cnpj || "00.000.000/0001-00").trim(),
    cidade: (empresaInput?.cidade || "").trim(),
    uf: (empresaInput?.uf || "").trim(),
    endereco: (empresaInput?.endereco || "").trim(),
    representanteNome: (empresaInput?.representanteNome || "Representante Legal").trim(),
    representanteCargo: (empresaInput?.representanteCargo || "Sócio-Administrador").trim(),
    representanteCpf: (empresaInput?.representanteCpf || "").trim(),
    bancoNome: (cfg.dadosBancariosPersonalizados?.bancoNome ?? empresaInput?.bancoNome ?? "").trim(),
    agencia: (cfg.dadosBancariosPersonalizados?.agencia ?? empresaInput?.agencia ?? "").trim(),
    contaCorrente: (cfg.dadosBancariosPersonalizados?.contaCorrente ?? empresaInput?.contaCorrente ?? "").trim(),
    chavePix: (cfg.dadosBancariosPersonalizados?.chavePix ?? empresaInput?.chavePix ?? "").trim(),
    logoUrl: empresaInput?.logoUrl?.trim() || null,
    papelTimbradoUrl: empresaInput?.papelTimbradoUrl?.trim() || null,
  };

  const isReadequada = cfg.tipoTabelaProposta === "PROPOSTA_READEQUADA";
  const tituloDocumento = isReadequada
    ? "PROPOSTA COMERCIAL DE PREÇOS READEQUADA"
    : "PROPOSTA COMERCIAL DE PREÇOS";

  let valorTotalNumero = 0;
  if (cfg.modoEmissao === "VALOR_GLOBAL") {
    valorTotalNumero = cfg.valorGlobalManual && cfg.valorGlobalManual > 0
      ? cfg.valorGlobalManual
      : isReadequada ? consolidado.readequadaTotalGeral : consolidado.propostaTotalGeral;
  } else {
    valorTotalNumero = isReadequada ? consolidado.readequadaTotalGeral : consolidado.propostaTotalGeral;
  }
  const valorTotalFormatado = formatarMoedaBrl(valorTotalNumero);

  const dataExtenso = formatarDataExtensoProposta(
    cfg.dataEmissao || undefined,
    empresa.cidade,
    empresa.uf,
  );

  // Carrega e valida Papel Timbrado em PDF
  const timbradoBytes = extrairBytesBase64(empresa.papelTimbradoUrl);
  let timbradoDoc: PDFDocument | null = null;
  let hasTimbradoPdf = false;
  if (timbradoBytes && isPdfBytes(timbradoBytes)) {
    try {
      timbradoDoc = await PDFDocument.load(timbradoBytes);
      if (timbradoDoc.getPageCount() > 0) {
        hasTimbradoPdf = true;
      }
    } catch (e) {
      console.warn("Não foi possível carregar PDF de papel timbrado:", e);
    }
  }

  const doc = await PDFDocument.create();
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await doc.embedFont(StandardFonts.HelveticaOblique);

  // Logo institucional caso não haja papel timbrado em PDF
  let embeddedLogo: any = null;
  let logoDims = { width: 0, height: 0 };
  if (!hasTimbradoPdf && empresa.logoUrl) {
    const logoBytes = extrairBytesBase64(empresa.logoUrl);
    if (logoBytes) {
      try {
        if (isPngBytes(logoBytes)) {
          embeddedLogo = await doc.embedPng(logoBytes);
        } else if (isJpgBytes(logoBytes)) {
          embeddedLogo = await doc.embedJpg(logoBytes);
        } else {
          try {
            embeddedLogo = await doc.embedPng(logoBytes);
          } catch {
            embeddedLogo = await doc.embedJpg(logoBytes);
          }
        }
      } catch (errLogo) {
        console.warn("Erro ao incorporar logotipo no PDF da proposta:", errLogo);
      }
    }
    if (embeddedLogo) {
      const orig = embeddedLogo.scale(1);
      const maxW = 160;
      const maxH = 42; // Altura máxima estrita a 42px
      const ratio = Math.min(maxW / orig.width, maxH / orig.height, 1);
      logoDims = { width: orig.width * ratio, height: orig.height * ratio };
    }
  }

  const marginX = 48;
  const contentWidth = 595.28 - marginX * 2;
  const bottomY = hasTimbradoPdf ? 85 : 65;

  let currentPage: any = null;
  let pageIndex = 0;
  let currentY = 0;

  const criarPagina = async (): Promise<any> => {
    const p = doc.addPage([595.28, 841.89]);

    if (hasTimbradoPdf && timbradoDoc) {
      const templateIdx = Math.min(pageIndex, timbradoDoc.getPageCount() - 1);
      try {
        const [embedded] = await doc.embedPdf(timbradoDoc, [templateIdx]);
        p.drawPage(embedded, {
          x: 0,
          y: 0,
          width: 595.28,
          height: 841.89,
        });
      } catch (errEmbed) {
        console.warn("Falha ao embutir papel timbrado via embedPdf na proposta:", errEmbed);
      }
    }

    if (pageIndex === 0) {
      if (hasTimbradoPdf) {
        currentY = 650;
      } else if (embeddedLogo) {
        const logoTop = 800;
        const logoY = logoTop - logoDims.height;
        const logoX = (595.28 - logoDims.width) / 2;

        p.drawImage(embeddedLogo, {
          x: logoX,
          y: logoY,
          width: logoDims.width,
          height: logoDims.height,
        });

        // Espaçamento exato de 1.25 cm (35.4 pt) da logo com os dados da empresa
        const espacamentoLogoDados = 35.4;
        const dadosTopY = logoY - espacamentoLogoDados;
        const textoRazao = sanitizarTextoParaPdf(empresa.razaoSocial.toUpperCase(), fontBold);
        const razaoW = fontBold.widthOfTextAtSize(textoRazao, 10);
        const razaoX = Math.max(marginX, (595.28 - razaoW) / 2);
        p.drawText(textoRazao, {
          x: razaoX,
          y: dadosTopY,
          size: 10,
          font: fontBold,
          color: rgb(0.1, 0.1, 0.1),
        });

        const localEmpresa =
          empresa.cidade && empresa.uf
            ? `${empresa.cidade}/${empresa.uf}`
            : empresa.cidade || empresa.uf || "";
        const enderecoLocal = [empresa.endereco, localEmpresa].filter(Boolean).join(" - ");
        const metaText = sanitizarTextoParaPdf(
          enderecoLocal ? `CNPJ: ${empresa.cnpj} | ${enderecoLocal}` : `CNPJ: ${empresa.cnpj}`,
          fontRegular,
        );
        const metaW = fontRegular.widthOfTextAtSize(metaText, 8);
        const metaX = Math.max(marginX, (595.28 - metaW) / 2);
        p.drawText(metaText, {
          x: metaX,
          y: dadosTopY - 11,
          size: 8,
          font: fontRegular,
          color: rgb(0.35, 0.35, 0.35),
        });

        const dividerY = dadosTopY - 18;
        p.drawLine({
          start: { x: marginX, y: dividerY },
          end: { x: marginX + contentWidth, y: dividerY },
          thickness: 0.75,
          color: rgb(0.8, 0.8, 0.8),
        });
        currentY = dividerY - 14;
      } else {
        const headerTop = 800;
        const textoRazao = sanitizarTextoParaPdf(empresa.razaoSocial.toUpperCase(), fontBold);
        const razaoW = fontBold.widthOfTextAtSize(textoRazao, 10.5);
        const razaoX = Math.max(marginX, (595.28 - razaoW) / 2);
        p.drawText(textoRazao, {
          x: razaoX,
          y: headerTop - 12,
          size: 10.5,
          font: fontBold,
          color: rgb(0.1, 0.1, 0.1),
        });

        const localEmpresa =
          empresa.cidade && empresa.uf
            ? `${empresa.cidade}/${empresa.uf}`
            : empresa.cidade || empresa.uf || "";
        const enderecoLocal = [empresa.endereco, localEmpresa].filter(Boolean).join(" - ");
        const metaText = sanitizarTextoParaPdf(
          enderecoLocal ? `CNPJ: ${empresa.cnpj} | ${enderecoLocal}` : `CNPJ: ${empresa.cnpj}`,
          fontRegular,
        );
        const metaW = fontRegular.widthOfTextAtSize(metaText, 8);
        const metaX = Math.max(marginX, (595.28 - metaW) / 2);
        p.drawText(metaText, {
          x: metaX,
          y: headerTop - 24,
          size: 8,
          font: fontRegular,
          color: rgb(0.35, 0.35, 0.35),
        });

        const dividerY = headerTop - 32;
        p.drawLine({
          start: { x: marginX, y: dividerY },
          end: { x: marginX + contentWidth, y: dividerY },
          thickness: 0.75,
          color: rgb(0.8, 0.8, 0.8),
        });
        currentY = dividerY - 14;
      }
    } else {
      currentY = hasTimbradoPdf ? 665 : 765;
    }

    pageIndex++;
    return p;
  };

  currentPage = await criarPagina();

  // Resolução resiliente do Objeto da Licitação (NUNCA fica em branco no PDF / Anexo I)
  const objetoResolvido = (
    cfg.descricaoGlobal?.trim() ||
    objetoLicitacao?.trim() ||
    itensRaw?.[0]?.descricao?.trim() ||
    "Fornecimento de materiais e/ou serviços especializados conforme especificações do Edital e seus anexos."
  );

  // 1. Box de Identificação do Certame
  const boxLinhas = [
    `Órgão Licitante: ${orgaoNome.toUpperCase()}`,
    `Processo / Edital: ${numeroEdital}`,
    `Objeto: ${objetoResolvido}`,
  ];
  const boxFontSize = 8;
  const boxLineHeight = boxFontSize + 3;
  let boxLinhasFormatadas: string[] = [];
  for (const bl of boxLinhas) {
    const lQuebradas = quebrarTextoEmLinhas(bl, contentWidth - 20, fontRegular, boxFontSize);
    boxLinhasFormatadas.push(...lQuebradas);
  }
  const boxHeight = boxLinhasFormatadas.length * boxLineHeight + 12;

  currentPage.drawRectangle({
    x: marginX,
    y: currentY - boxHeight,
    width: contentWidth,
    height: boxHeight,
    color: rgb(0.96, 0.97, 0.99),
  });
  currentPage.drawRectangle({
    x: marginX,
    y: currentY - boxHeight,
    width: 3.5,
    height: boxHeight,
    color: rgb(0.06, 0.38, 0.99),
  });

  let textY = currentY - 10;
  for (const l of boxLinhasFormatadas) {
    currentPage.drawText(sanitizarTextoParaPdf(l, fontRegular), {
      x: marginX + 10,
      y: textY,
      size: boxFontSize,
      font: fontRegular,
      color: rgb(0.2, 0.2, 0.2),
    });
    textY -= boxLineHeight;
  }
  currentY -= boxHeight + 14;

  // 2. Título do Documento
  const titSanitizado = sanitizarTextoParaPdf(tituloDocumento, fontBold);
  const titW = fontBold.widthOfTextAtSize(titSanitizado, 11);
  currentPage.drawText(titSanitizado, {
    x: marginX + (contentWidth - titW) / 2,
    y: currentY,
    size: 11,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  currentY -= 12;

  const legSanitizado = sanitizarTextoParaPdf("(Fundamento Legal: Lei Federal nº 14.133/2021)", fontOblique);
  const legW = fontOblique.widthOfTextAtSize(legSanitizado, 8);
  currentPage.drawText(legSanitizado, {
    x: marginX + (contentWidth - legW) / 2,
    y: currentY,
    size: 8,
    font: fontOblique,
    color: rgb(0.4, 0.4, 0.4),
  });
  currentY -= 14;

  // 3. Declaração Legal
  const declaracaoTexto = "Apresentamos a nossa proposta comercial para o fornecimento dos materiais/serviços objeto do certame referenciado, declarando expressamente, nos termos do Art. 63, §1º da Lei Federal nº 14.133/2021, que nos preços cotados estão inclusos todos os custos operacionais, tributos, fretes, seguros, encargos sociais e trabalhistas incidentes, garantindo a plena exequibilidade da proposta.";
  const linhasDeclaracao = quebrarTextoEmLinhas(declaracaoTexto, contentWidth - 20, fontRegular, 8.5);
  for (let i = 0; i < linhasDeclaracao.length; i++) {
    const l = linhasDeclaracao[i];
    currentPage.drawText(sanitizarTextoParaPdf(l, fontRegular), {
      x: marginX + (i === 0 ? 16 : 0),
      y: currentY,
      size: 8.5,
      font: fontRegular,
      color: rgb(0.15, 0.15, 0.15),
    });
    currentY -= 11.5;
  }
  currentY -= 8;

  // 4. Modalidade de Itens / Valor Global
  if (cfg.modoEmissao === "VALOR_GLOBAL") {
    const rotuloGlobal = cfg.tipoAgrupamentoGlobal === "PRECO_GLOBAL" ? "Preço Global Único" : (cfg.tituloGlobalCustomizado || "Lote 01");
    const descGlobal = objetoResolvido;
    const descLinhas = quebrarTextoEmLinhas(`Objeto: ${descGlobal}`, contentWidth - 20, fontRegular, 8);
    const boxGHeight = descLinhas.length * 11 + 24;

    if (currentY - boxGHeight < bottomY) {
      currentPage = await criarPagina();
    }

    currentPage.drawRectangle({
      x: marginX,
      y: currentY - boxGHeight,
      width: contentWidth,
      height: boxGHeight,
      color: rgb(0.98, 0.98, 0.98),
      borderColor: rgb(0.8, 0.8, 0.8),
      borderWidth: 0.5,
    });

    currentPage.drawText(sanitizarTextoParaPdf(rotuloGlobal, fontBold), {
      x: marginX + 10,
      y: currentY - 14,
      size: 9.5,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    });

    const vGlobSanit = sanitizarTextoParaPdf(valorTotalFormatado, fontBold);
    const vGlobW = fontBold.widthOfTextAtSize(vGlobSanit, 10.5);
    currentPage.drawText(vGlobSanit, {
      x: marginX + contentWidth - vGlobW - 10,
      y: currentY - 14,
      size: 10.5,
      font: fontBold,
      color: rgb(0.06, 0.38, 0.99),
    });

    let gTextY = currentY - 26;
    for (const dl of descLinhas) {
      currentPage.drawText(sanitizarTextoParaPdf(dl, fontRegular), {
        x: marginX + 10,
        y: gTextY,
        size: 8,
        font: fontRegular,
        color: rgb(0.25, 0.25, 0.25),
      });
      gTextY -= 11;
    }

    currentY -= boxGHeight + 12;
  } else {
    // Tabela Detalhada de Itens
    const colunas = [
      { id: "item", label: "Item", width: 36, align: "center" },
      { id: "desc", label: "Especificação / Marca", width: 235, align: "left" },
      { id: "unid", label: "Unid.", width: 40, align: "center" },
      { id: "qtd", label: "Qtd.", width: 44, align: "center" },
      { id: "unit", label: "Vlr. Unitário", width: 72, align: "right" },
      { id: "total", label: "Vlr. Total", width: 72, align: "right" },
    ];

    const desenharCabecalhoTabela = () => {
      currentPage.drawRectangle({
        x: marginX,
        y: currentY - 16,
        width: contentWidth,
        height: 16,
        color: rgb(0.92, 0.93, 0.95),
      });

      let curColX = marginX;
      for (const col of colunas) {
        const text = sanitizarTextoParaPdf(col.label, fontBold);
        const tw = fontBold.widthOfTextAtSize(text, 7.5);
        let x = curColX + 3;
        if (col.align === "center") x = curColX + (col.width - tw) / 2;
        if (col.align === "right") x = curColX + col.width - tw - 3;
        currentPage.drawText(text, {
          x,
          y: currentY - 11,
          size: 7.5,
          font: fontBold,
          color: rgb(0.15, 0.15, 0.15),
        });
        curColX += col.width;
      }
      currentY -= 16;
    };

    desenharCabecalhoTabela();

    for (const it of consolidado.itens) {
      const vUnit = isReadequada ? it.valorUnitarioReadequado : it.propostaUnitaria;
      const vTotal = isReadequada ? it.valorTotalReadequado : it.propostaTotal;

      const descComMarca = it.marcaModelo
        ? `${it.descricao}\n(Marca/Modelo: ${it.marcaModelo})`
        : it.descricao;

      const descLinhas = quebrarTextoEmLinhas(descComMarca, colunas[1].width - 6, fontRegular, 7.5);
      const rowHeight = Math.max(descLinhas.length * 9.5 + 5, 16);

      if (currentY - rowHeight < bottomY + 40) {
        currentPage = await criarPagina();
        desenharCabecalhoTabela();
      }

      // Linha zebra
      currentPage.drawRectangle({
        x: marginX,
        y: currentY - rowHeight,
        width: contentWidth,
        height: rowHeight,
        color: rgb(0.99, 0.99, 0.99),
        borderColor: rgb(0.88, 0.88, 0.88),
        borderWidth: 0.4,
      });

      let curColX = marginX;

      // Item
      const itTxt = sanitizarTextoParaPdf(it.numeroItem, fontBold);
      const itW = fontBold.widthOfTextAtSize(itTxt, 7.5);
      currentPage.drawText(itTxt, {
        x: curColX + (colunas[0].width - itW) / 2,
        y: currentY - 11,
        size: 7.5,
        font: fontBold,
        color: rgb(0.15, 0.15, 0.15),
      });
      curColX += colunas[0].width;

      // Descrição
      let dY = currentY - 9;
      for (const dl of descLinhas) {
        currentPage.drawText(sanitizarTextoParaPdf(dl, fontRegular), {
          x: curColX + 3,
          y: dY,
          size: 7.5,
          font: fontRegular,
          color: rgb(0.2, 0.2, 0.2),
        });
        dY -= 9.5;
      }
      curColX += colunas[1].width;

      // Unidade
      const unTxt = sanitizarTextoParaPdf(it.unidade, fontRegular);
      const unW = fontRegular.widthOfTextAtSize(unTxt, 7.5);
      currentPage.drawText(unTxt, {
        x: curColX + (colunas[2].width - unW) / 2,
        y: currentY - 11,
        size: 7.5,
        font: fontRegular,
        color: rgb(0.2, 0.2, 0.2),
      });
      curColX += colunas[2].width;

      // Quantidade
      const qtdTxt = sanitizarTextoParaPdf(String(it.quantidade), fontRegular);
      const qtdW = fontRegular.widthOfTextAtSize(qtdTxt, 7.5);
      currentPage.drawText(qtdTxt, {
        x: curColX + (colunas[3].width - qtdW) / 2,
        y: currentY - 11,
        size: 7.5,
        font: fontRegular,
        color: rgb(0.2, 0.2, 0.2),
      });
      curColX += colunas[3].width;

      // Valor Unitário
      const vuTxt = sanitizarTextoParaPdf(formatarMoedaBrl(vUnit), fontRegular);
      const vuW = fontRegular.widthOfTextAtSize(vuTxt, 7.5);
      currentPage.drawText(vuTxt, {
        x: curColX + colunas[4].width - vuW - 3,
        y: currentY - 11,
        size: 7.5,
        font: fontRegular,
        color: rgb(0.2, 0.2, 0.2),
      });
      curColX += colunas[4].width;

      // Valor Total
      const vtTxt = sanitizarTextoParaPdf(formatarMoedaBrl(vTotal), fontBold);
      const vtW = fontBold.widthOfTextAtSize(vtTxt, 7.5);
      currentPage.drawText(vtTxt, {
        x: curColX + colunas[5].width - vtW - 3,
        y: currentY - 11,
        size: 7.5,
        font: fontBold,
        color: rgb(0.1, 0.1, 0.1),
      });

      currentY -= rowHeight;
    }

    // Linha de Total Geral
    if (currentY - 18 < bottomY + 30) {
      currentPage = await criarPagina();
    }
    currentPage.drawRectangle({
      x: marginX,
      y: currentY - 18,
      width: contentWidth,
      height: 18,
      color: rgb(0.95, 0.96, 0.98),
      borderColor: rgb(0.85, 0.85, 0.85),
      borderWidth: 0.5,
    });
    const labelTot = sanitizarTextoParaPdf("VALOR GLOBAL TOTAL DA PROPOSTA:", fontBold);
    currentPage.drawText(labelTot, {
      x: marginX + 10,
      y: currentY - 12,
      size: 8,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    });
    const totValTxt = sanitizarTextoParaPdf(valorTotalFormatado, fontBold);
    const totValW = fontBold.widthOfTextAtSize(totValTxt, 9);
    currentPage.drawText(totValTxt, {
      x: marginX + contentWidth - totValW - 10,
      y: currentY - 12,
      size: 9,
      font: fontBold,
      color: rgb(0.06, 0.38, 0.99),
    });
    currentY -= 26;
  }

  // 5. Condições Comerciais
  const condicoes = [
    `Validade da Proposta: ${cfg.validadeDias}${formatarValidadeDiasExtenso(cfg.validadeDias)} dias contados da apresentação`,
    `Prazo de Entrega / Início da Execução: ${cfg.prazoEntrega}`,
    `Condições de Pagamento: ${cfg.condicoesPagamento}`,
  ];
  if (cfg.garantiaObservacoes) {
    condicoes.push(`Garantia e Observações: ${cfg.garantiaObservacoes}`);
  }
  const temDadosBancarios = Boolean(empresa.bancoNome || empresa.agencia || empresa.contaCorrente || empresa.chavePix);
  if (temDadosBancarios) {
    const bp = [
      empresa.bancoNome ? `Banco: ${empresa.bancoNome}` : "",
      empresa.agencia ? `Agência: ${empresa.agencia}` : "",
      empresa.contaCorrente ? `Conta: ${empresa.contaCorrente}` : "",
      empresa.chavePix ? `PIX: ${empresa.chavePix}` : "",
    ].filter(Boolean).join(" | ");
    condicoes.push(`Dados Bancários para Liquidação: ${bp}`);
  }

  const alturaEstimadaCondicoes = condicoes.length * 11 + 16;
  if (currentY - alturaEstimadaCondicoes < bottomY + 60) {
    currentPage = await criarPagina();
  }

  currentPage.drawText(sanitizarTextoParaPdf("CONDIÇÕES COMERCIAIS:", fontBold), {
    x: marginX,
    y: currentY,
    size: 8,
    font: fontBold,
    color: rgb(0.2, 0.2, 0.2),
  });
  currentY -= 12;

  for (const c of condicoes) {
    const cLinhas = quebrarTextoEmLinhas(`* ${c}`, contentWidth - 10, fontRegular, 7.5);
    for (const cl of cLinhas) {
      currentPage.drawText(sanitizarTextoParaPdf(cl, fontRegular), {
        x: marginX + 4,
        y: currentY,
        size: 7.5,
        font: fontRegular,
        color: rgb(0.25, 0.25, 0.25),
      });
      currentY -= 10;
    }
  }
  currentY -= 10;

  // 6. Bloco de Assinatura Indivisível
  const alturaBlocoAssinatura = 75;
  if (currentY - alturaBlocoAssinatura < bottomY) {
    currentPage = await criarPagina();
  }

  // Data e Local
  const dataTxt = sanitizarTextoParaPdf(dataExtenso, fontRegular);
  const dataW = fontRegular.widthOfTextAtSize(dataTxt, 8);
  currentPage.drawText(dataTxt, {
    x: marginX + contentWidth - dataW,
    y: currentY,
    size: 8,
    font: fontRegular,
    color: rgb(0.25, 0.25, 0.25),
  });
  currentY -= 28;

  // Linha e Representante Legal
  const linhaAssinatura = "_________________________________________________________";
  const lW = fontRegular.widthOfTextAtSize(linhaAssinatura, 8.5);
  currentPage.drawText(linhaAssinatura, {
    x: marginX + (contentWidth - lW) / 2,
    y: currentY,
    size: 8.5,
    font: fontRegular,
    color: rgb(0.4, 0.4, 0.4),
  });
  currentY -= 11;

  const repNomeTxt = sanitizarTextoParaPdf(empresa.representanteNome, fontBold);
  const repNomeW = fontBold.widthOfTextAtSize(repNomeTxt, 9);
  currentPage.drawText(repNomeTxt, {
    x: marginX + (contentWidth - repNomeW) / 2,
    y: currentY,
    size: 9,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  currentY -= 10;

  const repCargoTxt = sanitizarTextoParaPdf(empresa.representanteCargo, fontRegular);
  const repCargoW = fontRegular.widthOfTextAtSize(repCargoTxt, 8);
  currentPage.drawText(repCargoTxt, {
    x: marginX + (contentWidth - repCargoW) / 2,
    y: currentY,
    size: 8,
    font: fontRegular,
    color: rgb(0.3, 0.3, 0.3),
  });
  currentY -= 9;

  if (empresa.representanteCpf) {
    const cpfTxt = sanitizarTextoParaPdf(`CPF: ${empresa.representanteCpf}`, fontRegular);
    const cpfW = fontRegular.widthOfTextAtSize(cpfTxt, 7.5);
    currentPage.drawText(cpfTxt, {
      x: marginX + (contentWidth - cpfW) / 2,
      y: currentY,
      size: 7.5,
      font: fontRegular,
      color: rgb(0.4, 0.4, 0.4),
    });
    currentY -= 9;
  }

  const empRazaoTxt = sanitizarTextoParaPdf(empresa.razaoSocial, fontRegular);
  const empRazaoW = fontRegular.widthOfTextAtSize(empRazaoTxt, 7.5);
  currentPage.drawText(empRazaoTxt, {
    x: marginX + (contentWidth - empRazaoW) / 2,
    y: currentY,
    size: 7.5,
    font: fontRegular,
    color: rgb(0.4, 0.4, 0.4),
  });

  const pdfBytes = await doc.save();
  const pdfBuffer = Buffer.from(pdfBytes);
  const slugEdital = (numeroEdital || "edital").replace(/[^a-zA-Z0-9_-]/g, "_");
  const tipoSlug = isReadequada ? "proposta_readequada" : "proposta_comercial";
  const pdfNome = `${tipoSlug}_${slugEdital}_timbrada.pdf`;

  return { pdfBuffer, pdfNome };
}

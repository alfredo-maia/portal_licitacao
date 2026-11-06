import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  DECLARACAO_METADATA,
  type DeclaracaoGerarInput,
  type DeclaracaoTipo,
} from "@/server/schemas/declaracao.schema";
import {
  formatarDataExtenso,
  gerarTextoEspecifico,
} from "@/server/services/declaracoes.service";
import type { DadosEmpresaMinuta } from "@/lib/minuta-juridica";

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

export async function gerarPdfDeclaracao(params: {
  dados: DeclaracaoGerarInput;
  empresa?: DadosEmpresaMinuta | null;
  geradoEm?: Date;
}): Promise<{ pdfBuffer: Buffer; pdfNome: string }> {
  const { dados, empresa: empresaInput } = params;

  const empresa = {
    razaoSocial: (empresaInput?.razaoSocial || dados.empresaRazaoSocial || "EMPRESA LICITANTE LTDA").trim(),
    cnpj: (empresaInput?.cnpj || dados.empresaCnpj || "00.000.000/0001-00").trim(),
    cidade: (empresaInput?.cidade || dados.cidade || "Goiânia").trim(),
    uf: (empresaInput?.uf || dados.uf || "GO").trim(),
    endereco: (empresaInput?.endereco || dados.empresaEndereco || "").trim(),
    representanteNome: (empresaInput?.representanteNome || dados.representanteNome || "Representante Legal").trim(),
    representanteCargo: (empresaInput?.representanteCargo || dados.representanteCargo || "Representante Legal").trim(),
    representanteCpf: (empresaInput?.representanteCpf || dados.representanteCpf || "").trim(),
    logoUrl: empresaInput?.logoUrl?.trim() || null,
    papelTimbradoUrl: empresaInput?.papelTimbradoUrl?.trim() || null,
  };

  const meta = DECLARACAO_METADATA[dados.tipo];
  const { corpoTexto } = gerarTextoEspecifico(dados.tipo, {
    ...dados,
    empresaRazaoSocial: empresa.razaoSocial,
    empresaCnpj: empresa.cnpj,
    empresaEndereco: empresa.endereco,
    representanteNome: empresa.representanteNome,
    representanteCargo: empresa.representanteCargo,
    representanteCpf: empresa.representanteCpf,
  });

  const dataExtenso = formatarDataExtenso(dados.dataDeclaracao, empresa.cidade, empresa.uf);

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
        console.warn("Erro ao incorporar logotipo no PDF da declaração:", errLogo);
      }
    }
    if (embeddedLogo) {
      const orig = embeddedLogo.scale(1);
      const maxW = 160;
      const maxH = 42; // Proporção áurea vertical restrita a 42px para cabeçalho
      const ratio = Math.min(maxW / orig.width, maxH / orig.height, 1);
      logoDims = { width: orig.width * ratio, height: orig.height * ratio };
    }
  }

  const marginX = 54;
  const contentWidth = 595.28 - marginX * 2;
  const bottomY = hasTimbradoPdf ? 85 : 65;

  type BlocoDeclaracao = {
    texto: string;
    bold?: boolean;
    oblique?: boolean;
    size?: number;
    align?: "left" | "center" | "right";
    indent?: number;
    spacingBefore?: number;
    spacingAfter?: number;
    isBox?: boolean;
  };

  const blocos: BlocoDeclaracao[] = [];

  // 1. Box de Identificação do Certame
  const boxLinhas = [
    `Órgão Licitante: ${dados.orgaoNome.toUpperCase()}`,
    `Processo / Edital: ${dados.numeroEdital}`,
  ];
  if (dados.objetoLicitacao) {
    boxLinhas.push(`Objeto: ${dados.objetoLicitacao}`);
  }

  blocos.push({
    texto: boxLinhas.join("\n"),
    bold: false,
    size: 8.5,
    isBox: true,
    spacingAfter: 18,
  });

  // 2. Título da Declaração
  blocos.push({
    texto: meta.titulo.toUpperCase(),
    bold: true,
    size: 11.5,
    align: "center",
    spacingBefore: 4,
  });

  blocos.push({
    texto: `(Fundamento Legal: ${meta.fundamentoLegal})`,
    bold: false,
    oblique: true,
    size: 8.5,
    align: "center",
    spacingAfter: 16,
  });

  // 3. Corpo da Declaração
  const paragrafosCorpo = corpoTexto.split("\n\n").filter(Boolean);
  for (const par of paragrafosCorpo) {
    blocos.push({
      texto: par.trim(),
      bold: false,
      size: 9.5,
      indent: 24,
      spacingAfter: 10,
    });
  }

  // 4. Data e Local
  blocos.push({
    texto: dataExtenso,
    bold: false,
    size: 9,
    align: "right",
    spacingBefore: 10,
    spacingAfter: 18,
  });

  // 5. Bloco de Assinatura
  blocos.push({
    texto: "_________________________________________________________",
    bold: false,
    size: 9,
    align: "center",
  });
  blocos.push({
    texto: empresa.representanteNome,
    bold: true,
    size: 10,
    align: "center",
  });
  blocos.push({
    texto: empresa.representanteCargo,
    bold: false,
    size: 8.5,
    align: "center",
  });
  if (empresa.representanteCpf) {
    blocos.push({
      texto: `CPF: ${empresa.representanteCpf}`,
      bold: false,
      size: 8,
      align: "center",
    });
  }
  blocos.push({
    texto: empresa.razaoSocial,
    bold: false,
    size: 8,
    align: "center",
  });

  // Estimativa de linhas para garantir apresentação em 1 página
  let estimativaLinhas = 0;
  for (const b of blocos) {
    if (b.isBox) {
      estimativaLinhas += boxLinhas.length + 1;
      continue;
    }
    const font = b.bold ? fontBold : b.oblique ? fontOblique : fontRegular;
    const size = b.size ?? 9.5;
    const indent = b.indent ?? 0;
    const maxWidth = contentWidth - indent;
    const linhas = quebrarTextoEmLinhas(b.texto, maxWidth, font, size);
    estimativaLinhas += Math.max(linhas.length, 1);
  }

  const cabeEmUmaPagina = estimativaLinhas <= 46;
  const escalaGeral = cabeEmUmaPagina ? (estimativaLinhas > 36 ? 0.90 : 0.94) : 1.0;
  const spacingMultiplier = cabeEmUmaPagina ? (estimativaLinhas > 36 ? 0.55 : 0.68) : 1.0;

  let currentPage: any = null;
  let pageIndex = 0;
  let currentY = 0;

  const criarPagina = async (): Promise<any> => {
    // Sempre cria página padrão A4 (595.28 x 841.89)
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
        console.warn("Falha ao embutir papel timbrado via embedPdf na declaração:", errEmbed);
      }
    }

    if (pageIndex === 0) {
      if (hasTimbradoPdf) {
        // Respiro superior ampliado (~1.2cm extra) para não aproximar do logotipo da folha timbrada
        currentY = cabeEmUmaPagina ? 655 : 645;
      } else if (embeddedLogo) {
        // Logo centralizada no topo e dados corporativos centralizados logo abaixo da logo
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

        const metaText = sanitizarTextoParaPdf(
          `CNPJ: ${empresa.cnpj} | ${empresa.endereco ? `${empresa.endereco} - ` : ""}${empresa.cidade}/${empresa.uf}`,
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
        currentY = dividerY - (cabeEmUmaPagina ? 12 : 18);
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

        const metaText = sanitizarTextoParaPdf(
          `CNPJ: ${empresa.cnpj} | ${empresa.endereco ? `${empresa.endereco} - ` : ""}${empresa.cidade}/${empresa.uf}`,
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
        currentY = dividerY - (cabeEmUmaPagina ? 12 : 18);
      }
    } else {
      currentY = hasTimbradoPdf ? 665 : 765;
    }

    pageIndex++;
    return p;
  };

  currentPage = await criarPagina();

  for (const b of blocos) {
    if (!b.texto.trim()) continue;

    // Renderização especial do box do certame
    if (b.isBox) {
      const boxFontSize = 8.5 * escalaGeral;
      const boxLineHeight = boxFontSize + 3.5;
      const boxLinhasTexto = quebrarTextoEmLinhas(b.texto, contentWidth - 24, fontRegular, boxFontSize);
      const boxHeight = boxLinhasTexto.length * boxLineHeight + 14;

      if (currentY - boxHeight < bottomY) {
        currentPage = await criarPagina();
      }

      const boxY = currentY - boxHeight;

      // Fundo suave e borda azul esquerda
      currentPage.drawRectangle({
        x: marginX,
        y: boxY,
        width: contentWidth,
        height: boxHeight,
        color: rgb(0.96, 0.96, 0.97),
      });

      currentPage.drawRectangle({
        x: marginX,
        y: boxY,
        width: 3.5,
        height: boxHeight,
        color: rgb(0.06, 0.38, 0.99), // IBM Blue / Carbon
      });

      let textY = boxY + boxHeight - 12;
      for (const l of boxLinhasTexto) {
        const [label, ...rest] = l.split(":");
        const valor = rest.join(":");
        if (valor) {
          const lbl = sanitizarTextoParaPdf(`${label}:`, fontBold);
          currentPage.drawText(lbl, {
            x: marginX + 12,
            y: textY,
            size: boxFontSize,
            font: fontBold,
            color: rgb(0.15, 0.15, 0.15),
          });
          const lblW = fontBold.widthOfTextAtSize(lbl, boxFontSize);
          currentPage.drawText(sanitizarTextoParaPdf(valor, fontRegular), {
            x: marginX + 12 + lblW + 3,
            y: textY,
            size: boxFontSize,
            font: fontRegular,
            color: rgb(0.2, 0.2, 0.2),
          });
        } else {
          currentPage.drawText(sanitizarTextoParaPdf(l, fontRegular), {
            x: marginX + 12,
            y: textY,
            size: boxFontSize,
            font: fontRegular,
            color: rgb(0.2, 0.2, 0.2),
          });
        }
        textY -= boxLineHeight;
      }

      currentY = boxY - (b.spacingAfter || 12) * spacingMultiplier;
      continue;
    }

    const font = b.bold ? fontBold : b.oblique ? fontOblique : fontRegular;
    const fontSize = (b.size ?? 9.5) * escalaGeral;
    const lineHeight = fontSize + (cabeEmUmaPagina ? (estimativaLinhas > 36 ? 2.2 : 2.8) : 3.8);
    const indent = (b.indent ?? 0) * (cabeEmUmaPagina ? 0.75 : 1.0);
    const maxWidthBloco = contentWidth - indent;

    if (b.spacingBefore) {
      currentY -= b.spacingBefore * spacingMultiplier;
    }

    const linhas = quebrarTextoEmLinhas(b.texto, maxWidthBloco, font, fontSize);

    for (let i = 0; i < linhas.length; i++) {
      const linha = linhas[i];
      if (linha === "") {
        currentY -= lineHeight * 0.4;
        continue;
      }

      if (currentY - lineHeight < bottomY) {
        currentPage = await criarPagina();
      }

      const textoSanitizado = sanitizarTextoParaPdf(linha, font);
      const textWidth = font.widthOfTextAtSize(textoSanitizado, fontSize);

      let xPos = marginX;
      if (b.align === "center") {
        xPos = marginX + (contentWidth - textWidth) / 2;
      } else if (b.align === "right") {
        xPos = marginX + contentWidth - textWidth;
      } else {
        xPos = marginX + (i === 0 ? indent : 0);
      }

      currentPage.drawText(textoSanitizado, {
        x: Math.max(marginX, xPos),
        y: currentY,
        size: fontSize,
        font,
        color: rgb(0.12, 0.12, 0.12),
      });

      currentY -= lineHeight;
    }

    if (b.spacingAfter) {
      currentY -= b.spacingAfter * spacingMultiplier;
    }
  }

  // Numeração e integridade no rodapé (apenas se não houver papel timbrado institucional)
  if (!hasTimbradoPdf) {
    const totalPages = doc.getPageCount();
    for (let i = 0; i < totalPages; i++) {
      const page = doc.getPage(i);
      const editalLimpo = sanitizarTextoParaPdf(dados.numeroEdital, fontRegular);
      const rodapeText = sanitizarTextoParaPdf(
        totalPages === 1
          ? `Documento Oficial — Lei nº 14.133/2021 • Edital ${editalLimpo}`
          : `Página ${i + 1} de ${totalPages} — Declaração Oficial Edital ${editalLimpo}`,
        fontRegular,
      );
      const textWidth = fontRegular.widthOfTextAtSize(rodapeText, 8);
      page.drawText(rodapeText, {
        x: (595.28 - textWidth) / 2,
        y: 28,
        size: 7.5,
        font: fontRegular,
        color: rgb(0.5, 0.5, 0.5),
      });
    }
  }

  const pdfBytes = await doc.save();
  const pdfBuffer = Buffer.from(pdfBytes);
  const slugTipo = dados.tipo.toLowerCase();
  const slugEdital = (dados.numeroEdital || "edital").replace(/[^a-zA-Z0-9_-]/g, "_");
  const pdfNome = `declaracao_${slugTipo}_${slugEdital}_timbrada.pdf`;

  return { pdfBuffer, pdfNome };
}


import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ImpugnacaoItem } from "@/server/schemas/impugnacao.schema";

export interface DadosEmpresaMinuta {
  razaoSocial?: string | null;
  nomeFantasia?: string | null;
  cnpj?: string | null;
  cidade?: string | null;
  uf?: string | null;
  endereco?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cep?: string | null;
  representanteNome?: string | null;
  representanteCpf?: string | null;
  representanteCargo?: string | null;
  logoUrl?: string | null;
  papelTimbradoUrl?: string | null;
}

export type DadosImpugnacaoMinuta = {
  numeroEdital: string;
  orgaoNome?: string | null;
  motivoLegal: string;
  fundamentacao: string;
  pedidos: string;
  objeto?: string | null;
  dataAberturaSessao: Date | string;
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

export function gerarMinutaJuridica(
  impugnacao: DadosImpugnacaoMinuta | ImpugnacaoItem,
  empresaInput?: DadosEmpresaMinuta | null,
  opcoes?: { apenasTextoFormal?: boolean },
): { minutaHtml: string; minutaTexto: string } {
  const empresa = {
    razaoSocial: empresaInput?.razaoSocial?.trim() || "EMPRESA LICITANTE LTDA",
    cnpj: empresaInput?.cnpj?.trim() || "00.000.000/0001-00",
    cidade: empresaInput?.cidade?.trim() || "Goiânia",
    uf: empresaInput?.uf?.trim() || "GO",
    endereco: empresaInput?.endereco?.trim() || "",
    representanteNome: empresaInput?.representanteNome?.trim() || "Representante Legal",
    representanteCargo: empresaInput?.representanteCargo?.trim() || "Sócio-Administrador",
    representanteCpf: empresaInput?.representanteCpf?.trim() || "",
    logoUrl: opcoes?.apenasTextoFormal ? "" : empresaInput?.logoUrl?.trim() || "",
    papelTimbradoUrl: opcoes?.apenasTextoFormal ? "" : empresaInput?.papelTimbradoUrl?.trim() || "",
  };

  const dataHoje = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const dataAberturaStr =
    impugnacao.dataAberturaSessao instanceof Date
      ? impugnacao.dataAberturaSessao.toLocaleDateString("pt-BR")
      : new Date(impugnacao.dataAberturaSessao).toLocaleDateString("pt-BR");

  const minutaTexto = `
ILUSTRÍSSIMO(A) SENHOR(A) PREGOEIRO(A) / AGENTE DE CONTRATAÇÃO
${(impugnacao.orgaoNome || "ÓRGÃO LICITANTE").toUpperCase()}
PROCESSO / EDITAL: ${impugnacao.numeroEdital}
DATA DA SESSÃO PÚBLICA: ${dataAberturaStr}

${empresa.razaoSocial}, pessoa jurídica de direito privado inscrita no CNPJ sob o nº ${empresa.cnpj}, com sede em ${empresa.cidade} - ${empresa.uf}${empresa.endereco ? ` (${empresa.endereco})` : ""}, vem mui respeitosamente, perante Vossa Senhoria, com fulcro no Art. 164 da Lei Federal nº 14.133/2021, interpor a presente

IMPUGNAÇÃO AO EDITAL DE LICITAÇÃO

em face das cláusulas e exigências editalícias a seguir delineadas, pelas razões fáticas e jurídicas que passa a expor:

1. DA TEMPESTIVIDADE
A presente impugnação é tempestiva, visto que apresentada dentro do prazo legal de até 3 (três) dias úteis anteriores à data de abertura da sessão pública, em estrita obediência ao Art. 164 da Lei nº 14.133/2021.

2. DA SÍNTESE DO OBJETO
O presente certame tem por objeto: ${impugnacao.objeto || "Contratação descrita no instrumento convocatório"}.

3. DAS IRREGULARIDADES APONTADAS E DO MOTIVO LEGAL
${impugnacao.motivoLegal}

4. DA FUNDAMENTAÇÃO JURÍDICA E JURISPRUDÊNCIA DO TCU
${impugnacao.fundamentacao}
Conforme remansosa jurisprudência do Tribunal de Contas da União e os princípios insculpidos no Art. 5º e 11 da Lei nº 14.133/2021, é vedado à Administração estabelecer exigências que frustrem o caráter competitivo do certame, devendo prevalecer a isonomia e a proposta mais vantajosa.

5. DOS PEDIDOS
Ante o exposto, REQUER-SE a Vossa Senhoria:
${impugnacao.pedidos}
Requer-se, ainda, a suspensão do certame até o efetivo julgamento desta impugnação e, caso acatada, a consequente republicação do edital com reabertura dos prazos legais (Art. 55, § 1º da Lei 14.133/2021).

Nestes termos,
Pede Deferimento.

${empresa.cidade} - ${empresa.uf}, ${dataHoje}.

___________________________________________________
${empresa.razaoSocial}
CNPJ: ${empresa.cnpj}
${empresa.representanteNome ? `${empresa.representanteNome} - ${empresa.representanteCargo}` : ""}
`.trim();

  const avisoTimbradoHtml = (!opcoes?.apenasTextoFormal && empresa.papelTimbradoUrl)
    ? `<div class="minuta-aviso-timbrado" style="background: #edf5ff; border-left: 4px solid #0f62fe; padding: 12px 16px; margin-bottom: 24px; border-radius: 2px;">
        <div style="font-weight: 600; font-size: 10pt; color: #0043ce; display: flex; align-items: center; gap: 6px;">
          <span>📄 Folha de Papel Timbrado Oficial Anexada</span>
        </div>
        <p style="margin: 4px 0 0 0; font-size: 9pt; color: #393939;">
          Esta empresa possui papel timbrado institucional (PDF) configurado. Ao clicar em <strong>"Imprimir PDF Timbrado"</strong>, o documento será diagramado diretamente sobre a folha timbrada oficial da empresa.
        </p>
      </div>`
    : "";

  const headerHtml = !empresa.papelTimbradoUrl
    ? `<header class="minuta-header-empresa" style="border-bottom: 2px solid #161616; padding-bottom: 12px; margin-bottom: 24px; text-align: center;">
        ${
          !opcoes?.apenasTextoFormal && empresa.logoUrl
            ? `<div class="minuta-header-logo" style="margin-bottom: 10px;">
                <img src="${empresa.logoUrl}" alt="${empresa.razaoSocial}" style="max-height: 42px; max-width: 180px; object-fit: contain; margin: 0 auto; display: block;" />
              </div>`
            : ""
        }
        <h2 style="font-size: 13pt; margin: 0; text-transform: uppercase; font-weight: bold; letter-spacing: 0.5px;">
          ${empresa.razaoSocial}
        </h2>
        <p style="font-size: 9.5pt; margin: 4px 0 0 0; color: #525252;">
          CNPJ: ${empresa.cnpj} • ${empresa.endereco ? `${empresa.endereco} - ` : ""}${empresa.cidade} / ${empresa.uf}
        </p>
      </header>`
    : "";

  const minutaHtml = `
<div class="minuta-impugnacao" style="font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.6; color: #161616; padding: 2cm; background: #ffffff;">
  ${avisoTimbradoHtml}
  ${headerHtml}

  <p style="text-align: center; font-weight: bold; margin-bottom: 24px;">
    ILMO(A). SR(A). PREGOEIRO(A) / AGENTE DE CONTRATAÇÃO<br>
    ${(impugnacao.orgaoNome || "ÓRGÃO LICITANTE").toUpperCase()}<br>
    EDITAL: ${impugnacao.numeroEdital} | DATA DA SESSÃO: ${dataAberturaStr}
  </p>

  <p style="text-align: justify; text-indent: 2cm;">
    <strong>${empresa.razaoSocial}</strong>, pessoa jurídica de direito privado inscrita no CNPJ sob o nº <strong>${empresa.cnpj}</strong>, com sede em ${empresa.cidade}/${empresa.uf}, vem respeitosamente, com fundamento no Art. 164 da Lei Federal nº 14.133/2021, interpor
  </p>

  <h2 style="text-align: center; font-size: 14pt; margin: 20px 0; font-weight: bold;">IMPUGNAÇÃO AO EDITAL DE LICITAÇÃO</h2>

  <h3 style="font-size: 12pt; font-weight: bold; margin-top: 16px;">1. DA TEMPESTIVIDADE</h3>
  <p style="text-align: justify; text-indent: 2cm;">
    A presente impugnação é manifestamente tempestiva, eis que submetida em prazo superior a 3 (três) dias úteis que antecedem a abertura do certame, nos termos do Art. 164 da Lei Federal nº 14.133/2021.
  </p>

  <h3 style="font-size: 12pt; font-weight: bold; margin-top: 16px;">2. DA SÍNTESE DO OBJETO</h3>
  <p style="text-align: justify; text-indent: 2cm;">
    O presente certame tem por objeto: ${impugnacao.objeto || "Fornecimento de bens ou prestação de serviços conforme especificações do Termo de Referência"}.
  </p>

  <h3 style="font-size: 12pt; font-weight: bold; margin-top: 16px;">3. DAS IRREGULARIDADES APONTADAS E DO MOTIVO LEGAL</h3>
  <p style="text-align: justify; text-indent: 2cm;">
    ${impugnacao.motivoLegal}
  </p>

  <h3 style="font-size: 12pt; font-weight: bold; margin-top: 16px;">4. DA FUNDAMENTAÇÃO JURÍDICA E SÚMULAS DO TCU</h3>
  <p style="text-align: justify; text-indent: 2cm;">
    ${impugnacao.fundamentacao}
  </p>

  <h3 style="font-size: 12pt; font-weight: bold; margin-top: 16px;">5. DOS PEDIDOS</h3>
  <p style="text-align: justify; text-indent: 2cm;">
    ${impugnacao.pedidos}
  </p>

  <p style="text-align: right; margin-top: 36px;">
    ${empresa.cidade} - ${empresa.uf}, ${dataHoje}.
  </p>

  <div style="text-align: center; margin-top: 48px;">
    <div style="border-top: 1px solid #000; display: inline-block; min-width: 320px; padding-top: 4px;">
      <strong>${empresa.razaoSocial}</strong><br>
      CNPJ: ${empresa.cnpj}<br>
      ${empresa.representanteNome ? `<span style="font-size: 10pt; color: #525252;">${empresa.representanteNome} (${empresa.representanteCargo})</span>` : ""}
    </div>
  </div>
</div>
`.trim();

  return { minutaHtml, minutaTexto };
}

export async function gerarPdfMinutaImpugnacao(params: {
  impugnacao: DadosImpugnacaoMinuta | ImpugnacaoItem;
  empresa?: DadosEmpresaMinuta | null;
  geradoEm?: Date;
}): Promise<{ pdfBuffer: Buffer; pdfNome: string }> {
  const { impugnacao, empresa: empresaInput, geradoEm } = params;
  const empresa = {
    razaoSocial: empresaInput?.razaoSocial?.trim() || "EMPRESA LICITANTE LTDA",
    cnpj: empresaInput?.cnpj?.trim() || "00.000.000/0001-00",
    cidade: empresaInput?.cidade?.trim() || "Goiânia",
    uf: empresaInput?.uf?.trim() || "GO",
    endereco: empresaInput?.endereco?.trim() || "",
    representanteNome: empresaInput?.representanteNome?.trim() || "Representante Legal",
    representanteCargo: empresaInput?.representanteCargo?.trim() || "Sócio-Administrador",
    representanteCpf: empresaInput?.representanteCpf?.trim() || "",
    logoUrl: empresaInput?.logoUrl?.trim() || null,
    papelTimbradoUrl: empresaInput?.papelTimbradoUrl?.trim() || null,
  };

  const dataAberturaStr =
    impugnacao.dataAberturaSessao instanceof Date
      ? impugnacao.dataAberturaSessao.toLocaleDateString("pt-BR")
      : new Date(impugnacao.dataAberturaSessao).toLocaleDateString("pt-BR");

  const dataGeracao = (geradoEm ?? new Date()).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

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

  // Se não houver papel timbrado em PDF mas houver logo, incorpora a imagem no cabeçalho
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
        console.warn("Erro ao incorporar logotipo no PDF:", errLogo);
      }
    }
    if (embeddedLogo) {
      const orig = embeddedLogo.scale(1);
      const maxW = 160;
      const maxH = 42; // Limite vertical harmônico de 42px para cabeçalho
      const ratio = Math.min(maxW / orig.width, maxH / orig.height, 1);
      logoDims = { width: orig.width * ratio, height: orig.height * ratio };
    }
  }

  const marginX = 54;
  const contentWidth = 595.28 - marginX * 2;
  const bottomY = hasTimbradoPdf ? 85 : 65;

  type Bloco = {
    texto: string;
    bold?: boolean;
    size?: number;
    align?: "left" | "center" | "right";
    indent?: number;
    spacingBefore?: number;
    spacingAfter?: number;
  };

  const blocos: Bloco[] = [
    {
      texto: "ILUSTRÍSSIMO(A) SENHOR(A) PREGOEIRO(A) / AGENTE DE CONTRATAÇÃO",
      bold: true,
      size: 9.5,
      align: "center",
    },
    {
      texto: (impugnacao.orgaoNome || "ÓRGÃO LICITANTE").toUpperCase(),
      bold: true,
      size: 9.5,
      align: "center",
    },
    {
      texto: `PROCESSO / EDITAL: ${impugnacao.numeroEdital} | SESSÃO PÚBLICA: ${dataAberturaStr}`,
      bold: false,
      size: 8.5,
      align: "center",
      spacingAfter: 12,
    },
    {
      texto: "IMPUGNAÇÃO AO EDITAL DE LICITAÇÃO",
      bold: true,
      size: 11.5,
      align: "center",
    },
    {
      texto: "(Art. 164 da Lei Federal nº 14.133/2021)",
      bold: false,
      size: 8.5,
      align: "center",
      spacingAfter: 12,
    },
    {
      texto: `${empresa.razaoSocial}, pessoa jurídica de direito privado inscrita no CNPJ sob o nº ${empresa.cnpj}, com sede em ${empresa.cidade} - ${empresa.uf}${empresa.endereco ? ` (${empresa.endereco})` : ""}, vem mui respeitosamente, perante Vossa Senhoria, com fulcro no Art. 164 da Lei Federal nº 14.133/2021, interpor a presente IMPUGNAÇÃO AO EDITAL, pelas razões fáticas e jurídicas que passa a expor:`,
      bold: false,
      size: 9.5,
      indent: 24,
      spacingAfter: 10,
    },
    {
      texto: "1. DA TEMPESTIVIDADE",
      bold: true,
      size: 9.5,
      spacingBefore: 4,
    },
    {
      texto: "A presente impugnação é manifestamente tempestiva, visto que protocolada dentro do prazo legal de até 3 (três) dias úteis que antecedem a data de abertura da sessão pública, em estrita obediência ao Art. 164 da Lei Federal nº 14.133/2021.",
      bold: false,
      size: 9,
      indent: 24,
      spacingAfter: 8,
    },
    {
      texto: "2. DA SÍNTESE DO OBJETO",
      bold: true,
      size: 9.5,
      spacingBefore: 4,
    },
    {
      texto: impugnacao.objeto || "Fornecimento de bens ou prestação de serviços conforme especificações e anexos do Termo de Referência.",
      bold: false,
      size: 9,
      indent: 24,
      spacingAfter: 8,
    },
    {
      texto: "3. DAS IRREGULARIDADES APONTADAS E DO MOTIVO LEGAL",
      bold: true,
      size: 9.5,
      spacingBefore: 4,
    },
    {
      texto: impugnacao.motivoLegal,
      bold: false,
      size: 9,
      indent: 24,
      spacingAfter: 8,
    },
    {
      texto: "4. DA FUNDAMENTAÇÃO JURÍDICA E SÚMULAS DO TCU",
      bold: true,
      size: 9.5,
      spacingBefore: 4,
    },
    {
      texto: impugnacao.fundamentacao,
      bold: false,
      size: 9,
      indent: 24,
      spacingAfter: 6,
    },
    {
      texto: "Conforme remansosa jurisprudência do Tribunal de Contas da União e os princípios insculpidos no Art. 5º e 11 da Lei nº 14.133/2021, é vedado à Administração estabelecer exigências que frustrem o caráter competitivo do certame, devendo prevalecer a isonomia e a proposta mais vantajosa.",
      bold: false,
      size: 9,
      indent: 24,
      spacingAfter: 8,
    },
    {
      texto: "5. DOS PEDIDOS FORMAIS",
      bold: true,
      size: 9.5,
      spacingBefore: 4,
    },
    {
      texto: impugnacao.pedidos,
      bold: false,
      size: 9,
      indent: 24,
      spacingAfter: 6,
    },
    {
      texto: "Requer-se, outrossim, a suspensão cautelar do certame até o julgamento definitivo e a republicação do edital com a devida reabertura dos prazos legais (Art. 55, § 1º da Lei 14.133/2021).",
      bold: false,
      size: 9,
      indent: 24,
      spacingAfter: 12,
    },
    {
      texto: "Nestes termos, pede e espera deferimento.",
      bold: false,
      size: 9,
      align: "right",
      spacingAfter: 4,
    },
    {
      texto: `${empresa.cidade} - ${empresa.uf}, ${dataGeracao}.`,
      bold: false,
      size: 9,
      align: "right",
      spacingAfter: 20,
    },
    {
      texto: "_________________________________________________________",
      bold: false,
      size: 9,
      align: "center",
    },
    {
      texto: empresa.razaoSocial,
      bold: true,
      size: 9.5,
      align: "center",
    },
    {
      texto: `CNPJ: ${empresa.cnpj}`,
      bold: false,
      size: 8.5,
      align: "center",
    },
    {
      texto: empresa.representanteNome
        ? `${empresa.representanteNome} (${empresa.representanteCargo})`
        : "",
      bold: false,
      size: 8,
      align: "center",
    },
  ];

  // Avaliação dinâmica de altura para priorizar encaixe perfeito em 1 página
  // caso o conteúdo seja curto, ou 2 páginas se for longo.
  let estimativaLinhas = 0;
  for (const b of blocos) {
    if (!b.texto.trim()) continue;
    const font = b.bold ? fontBold : fontRegular;
    const size = b.size ?? 9;
    const indent = b.indent ?? 0;
    const maxWidth = contentWidth - indent;
    const linhas = quebrarTextoEmLinhas(b.texto, maxWidth, font, size);
    estimativaLinhas += Math.max(linhas.length, 1);
  }

  const cabeEmUmaPagina = estimativaLinhas <= 44;
  const escalaGeral = cabeEmUmaPagina ? (estimativaLinhas > 36 ? 0.88 : 0.92) : 1.0;
  const spacingMultiplier = cabeEmUmaPagina ? (estimativaLinhas > 36 ? 0.52 : 0.65) : 1.0;

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
        console.warn("Falha ao embutir página do timbrado, utilizando fallback:", errEmbed);
      }
    }

    // Configuração inicial do cursor Y
    if (pageIndex === 0) {
      if (hasTimbradoPdf) {
        // Margem de respiro superior ampliada (~1.2cm a mais) para nunca colar no logo do timbrado da empresa
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

        const dadosTopY = logoY - 8;
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
        // Sem timbrado e sem logo: cabeçalho formal em texto centralizado
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

    const font = b.bold ? fontBold : fontRegular;
    const fontSize = (b.size ?? 9.5) * escalaGeral;
    const lineHeight = fontSize + (cabeEmUmaPagina ? (estimativaLinhas > 36 ? 2.0 : 2.6) : 3.6);
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

  // Estampa numeração de página no rodapé apenas se NÃO for papel timbrado oficial
  // (Folhas timbradas da empresa já possuem cabeçalho e rodapé corporativos próprios)
  if (!hasTimbradoPdf) {
    const totalPages = doc.getPageCount();
    for (let i = 0; i < totalPages; i++) {
      const page = doc.getPage(i);
      const editalLimpo = sanitizarTextoParaPdf(impugnacao.numeroEdital, fontRegular);
      const numText = sanitizarTextoParaPdf(
        `Página ${i + 1} de ${totalPages} — Impugnação Edital ${editalLimpo}`,
        fontRegular,
      );
      const textWidth = fontRegular.widthOfTextAtSize(numText, 8);
      page.drawText(numText, {
        x: (595.28 - textWidth) / 2,
        y: 32,
        size: 8,
        font: fontRegular,
        color: rgb(0.45, 0.45, 0.45),
      });
    }
  }

  const pdfBytes = await doc.save();
  const pdfBuffer = Buffer.from(pdfBytes);
  const slugEdital = (impugnacao.numeroEdital || "edital").replace(/[^a-zA-Z0-9_-]/g, "_");
  const pdfNome = `impugnacao_${slugEdital}_timbrada.pdf`;

  return { pdfBuffer, pdfNome };
}

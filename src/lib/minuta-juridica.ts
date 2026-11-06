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

function escaparLiteralPdf(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\r/g, "");
}

function normalizarParaPdf(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/—/g, "-")
    .replace(/–/g, "-")
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[•·]/g, "*")
    .replace(/§/g, "Art.")
    .replace(/[^\x20-\x7E\n]/g, " ");
}

function quebrarLinhasPdf(texto: string, maxChars = 84): string[] {
  const limpo = normalizarParaPdf(texto || "").trim();
  if (!limpo) return [];
  const paragrafos = limpo.split("\n");
  const linhas: string[] = [];

  for (const par of paragrafos) {
    const trimmed = par.trim();
    if (!trimmed) {
      linhas.push("");
      continue;
    }
    const palavras = trimmed.split(/\s+/);
    let atual = "";
    for (const p of palavras) {
      if (!atual) {
        atual = p;
      } else if (atual.length + 1 + p.length <= maxChars) {
        atual += " " + p;
      } else {
        linhas.push(atual);
        atual = p;
      }
    }
    if (atual) linhas.push(atual);
  }
  return linhas;
}

export function gerarMinutaJuridica(
  impugnacao: ImpugnacaoItem,
  empresaInput?: DadosEmpresaMinuta | null,
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
    logoUrl: empresaInput?.logoUrl?.trim() || "",
    papelTimbradoUrl: empresaInput?.papelTimbradoUrl?.trim() || "",
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

  const logoHtml = empresa.logoUrl
    ? `<div style="text-align: center; margin-bottom: 20px;">
        <img src="${empresa.logoUrl}" alt="${empresa.razaoSocial}" style="max-height: 70px; max-width: 240px; object-fit: contain;" />
      </div>`
    : "";

  const minutaHtml = `
<div class="minuta-impugnacao" style="font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.6; color: #161616; padding: 2cm; background: #ffffff;">
  ${logoHtml}
  <header style="border-bottom: 2px solid #161616; padding-bottom: 12px; margin-bottom: 24px; text-align: center;">
    <h2 style="font-size: 13pt; margin: 0; text-transform: uppercase; font-weight: bold; letter-spacing: 0.5px;">
      ${empresa.razaoSocial}
    </h2>
    <p style="font-size: 9.5pt; margin: 4px 0 0 0; color: #525252;">
      CNPJ: ${empresa.cnpj} • ${empresa.endereco ? `${empresa.endereco} - ` : ""}${empresa.cidade} / ${empresa.uf}
    </p>
  </header>

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

export function gerarPdfMinutaImpugnacao(params: {
  impugnacao: ImpugnacaoItem;
  empresa?: DadosEmpresaMinuta | null;
  geradoEm?: Date;
}): { pdfBuffer: Buffer; pdfNome: string } {
  const { impugnacao, empresa: empresaInput, geradoEm } = params;
  const empresa = {
    razaoSocial: empresaInput?.razaoSocial?.trim() || "EMPRESA LICITANTE LTDA",
    cnpj: empresaInput?.cnpj?.trim() || "00.000.000/0001-00",
    cidade: empresaInput?.cidade?.trim() || "Goiania",
    uf: empresaInput?.uf?.trim() || "GO",
    endereco: empresaInput?.endereco?.trim() || "",
    representanteNome: empresaInput?.representanteNome?.trim() || "Representante Legal",
    representanteCargo: empresaInput?.representanteCargo?.trim() || "Socio-Administrador",
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

  type LinhaEstruturada = { bold?: boolean; size?: number; text: string };
  const blocos: LinhaEstruturada[] = [
    { bold: true, size: 12, text: normalizarParaPdf(empresa.razaoSocial.toUpperCase()) },
    {
      bold: false,
      size: 8.5,
      text: normalizarParaPdf(`CNPJ: ${empresa.cnpj} | ${empresa.endereco ? `${empresa.endereco} - ` : ""}${empresa.cidade}/${empresa.uf}`),
    },
    { text: "----------------------------------------------------------------------------------------" },
    {
      bold: true,
      size: 10,
      text: `AO(A) ILUSTRISSIMO(A) PREGOEIRO(A) / AGENTE DE CONTRATACAO - ${normalizarParaPdf((impugnacao.orgaoNome || "ORGAO").toUpperCase())}`,
    },
    { text: `Processo / Edital: ${normalizarParaPdf(impugnacao.numeroEdital)} | Data Abertura: ${dataAberturaStr}` },
    { text: "" },
    {
      bold: true,
      size: 11,
      text: "IMPUGNACAO AO EDITAL DE LICITACAO - ART. 164 DA LEI FEDERAL No 14.133/2021",
    },
    { text: "" },
    { bold: true, size: 9.5, text: "1. DA TEMPESTIVIDADE" },
    {
      text: "A presente impugnacao e tempestiva, visto que protocolada dentro do prazo legal de ate 3 (tres) dias uteis antes da abertura da sessao publica, em estrita observancia ao Art. 164 da Lei 14.133/2021.",
    },
    { text: "" },
    { bold: true, size: 9.5, text: "2. DA SINTESE DO OBJETO" },
    ...quebrarLinhasPdf(
      impugnacao.objeto || "Fornecimento de bens ou prestacao de servicos conforme termo de referencia.",
      84,
    ).map((t) => ({ text: t })),
    { text: "" },
    { bold: true, size: 9.5, text: "3. DAS IRREGULARIDADES APONTADAS E MOTIVO LEGAL" },
    ...quebrarLinhasPdf(impugnacao.motivoLegal, 84).map((t) => ({ text: t })),
    { text: "" },
    { bold: true, size: 9.5, text: "4. DA FUNDAMENTACAO JURIDICA E JURISPRUDENCIA DO TCU" },
    ...quebrarLinhasPdf(impugnacao.fundamentacao, 84).map((t) => ({ text: t })),
    { text: "" },
    { bold: true, size: 9.5, text: "5. DOS PEDIDOS FORMAIS" },
    ...quebrarLinhasPdf(impugnacao.pedidos, 84).map((t) => ({ text: t })),
    {
      text: "Requer-se, outrossim, a suspensao cautelar do certame e a republicacao do edital com reabertura de prazos nos termos do Art. 55, paragrafo 1o da Lei 14.133/2021.",
    },
    { text: "" },
    {
      text: normalizarParaPdf(`Nestes termos, pede e espera deferimento. ${empresa.cidade}/${empresa.uf}, ${dataGeracao}.`),
    },
    { text: "" },
    { text: "_________________________________________________________" },
    { bold: true, size: 9.5, text: normalizarParaPdf(empresa.razaoSocial) },
    { text: `CNPJ: ${empresa.cnpj}` },
    { text: normalizarParaPdf(`${empresa.representanteNome} (${empresa.representanteCargo})`) },
  ];

  const LINHAS_POR_PAGINA = 46;
  const paginas: LinhaEstruturada[][] = [];
  for (let i = 0; i < blocos.length; i += LINHAS_POR_PAGINA) {
    paginas.push(blocos.slice(i, i + LINHAS_POR_PAGINA));
  }
  if (paginas.length === 0) {
    paginas.push([{ text: "Minuta de Impugnacao" }]);
  }

  const objetos: string[] = [];
  const pageObjNums: number[] = [];
  for (let p = 0; p < paginas.length; p++) {
    pageObjNums.push(5 + p * 2);
  }

  objetos.push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj`);
  objetos.push(
    `2 0 obj\n<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(" ")}] /Count ${paginas.length} >>\nendobj`,
  );
  objetos.push(
    `3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj`,
  );
  objetos.push(
    `4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj`,
  );

  for (let p = 0; p < paginas.length; p++) {
    const pageObjId = 5 + p * 2;
    const contentObjId = 6 + p * 2;
    const linhasPagina = paginas[p];

    const streamLines: string[] = ["BT", "42 795 Td", "14 TL"];
    for (const linha of linhasPagina) {
      const font = linha.bold ? "/F2" : "/F1";
      const size = linha.size ?? 9.5;
      streamLines.push(`${font} ${size} Tf`);
      streamLines.push(`(${escaparLiteralPdf(linha.text)}) Tj`);
      streamLines.push("T*");
    }
    streamLines.push(
      `/F1 8 Tf`,
      `(Pagina ${p + 1} de ${paginas.length} - Impugnacao Edital ${escaparLiteralPdf(normalizarParaPdf(impugnacao.numeroEdital))}) Tj`,
      "ET",
    );

    const streamContent = streamLines.join("\n");
    const streamLength = Buffer.byteLength(streamContent, "ascii");

    objetos.push(
      `${pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjId} 0 R >>\nendobj`,
    );
    objetos.push(
      `${contentObjId} 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamContent}\nendstream\nendobj`,
    );
  }

  let pdfStr = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const obj of objetos) {
    offsets.push(Buffer.byteLength(pdfStr, "ascii"));
    pdfStr += `${obj}\n`;
  }

  const xrefOffset = Buffer.byteLength(pdfStr, "ascii");
  pdfStr += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objetos.length; i++) {
    const off = String(offsets[i]).padStart(10, "0");
    pdfStr += `${off} 00000 n \n`;
  }
  pdfStr += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  const pdfBuffer = Buffer.from(pdfStr, "ascii");
  const slugEdital = (impugnacao.numeroEdital || "edital").replace(/[^a-zA-Z0-9_-]/g, "_");
  const pdfNome = `impugnacao_${slugEdital}_timbrada.pdf`;

  return { pdfBuffer, pdfNome };
}

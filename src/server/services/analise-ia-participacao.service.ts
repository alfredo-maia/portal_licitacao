import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { RbacUser } from "@/lib/rbac";
import { recordAuditLog } from "@/server/audit";
import {
  type CotaMensalAnaliseIA,
  type RelatorioParticipacao,
  type SolicitarAnaliseInput,
  calcularCotaAnaliseIA,
  inicioMesCivilBRT,
  proximoMesCivilBRT,
  solicitarAnaliseInputSchema,
} from "@/server/schemas/analise-ia.schema";
import {
  CATALOGO_MACRO_SEGMENTOS,
  type MacroSegmento,
} from "@/server/schemas/segmentos.schema";
import type { PlanoAssinatura } from "@/server/schemas/tenant.schema";
import { obterConfiguracaoEmpresa } from "./configuracoes.service";
import { listarDocumentos } from "./documentos.service";
import {
  getInMemoryConfiguracaoEmpresa,
  getInMemoryLicitacaoAnaliseIA,
  insertInMemoryLicitacaoAnaliseIA,
  listAllInMemoryAnalisesIA,
  listInMemoryLicitacaoAnalisesIA,
  updateInMemoryLicitacaoAnaliseIA,
} from "./licitacoes-store";
import { notificarRelatorioIAPronto } from "./notificacoes.service";
import {
  getOportunidadeById,
  type OportunidadesActorContext,
} from "./oportunidades.service";
import { listarPortais } from "./portais.service";
import { inMemoryTenants } from "./tenant.service";

export class AnaliseIAParticipacaoError extends Error {
  readonly code: string;
  readonly status: number;
  readonly cota?: CotaMensalAnaliseIA;

  constructor(
    code: string,
    message: string,
    status: number,
    cota?: CotaMensalAnaliseIA,
  ) {
    super(message);
    this.name = "AnaliseIAParticipacaoError";
    this.code = code;
    this.status = status;
    this.cota = cota;
  }
}

const pendingBackgroundJobs = new Map<string, Promise<any>>();

async function ensureAnaliseIAColumns(): Promise<void> {
  const queries = [
    `ALTER TABLE "analise_status_participacao" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;`,
    `ALTER TABLE "analise_status_participacao" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'CONCLUIDO';`,
    `ALTER TABLE "analise_status_participacao" ADD COLUMN IF NOT EXISTS "origem" TEXT NOT NULL DEFAULT 'IA_HIBRIDA';`,
    `ALTER TABLE "analise_status_participacao" ADD COLUMN IF NOT EXISTS "parecer" TEXT;`,
    `ALTER TABLE "analise_status_participacao" ADD COLUMN IF NOT EXISTS "relatorioJson" JSONB;`,
    `ALTER TABLE "analise_status_participacao" ADD COLUMN IF NOT EXISTS "pdfBase64" TEXT;`,
    `ALTER TABLE "analise_status_participacao" ADD COLUMN IF NOT EXISTS "pdfNome" TEXT;`,
    `ALTER TABLE "analise_status_participacao" ADD COLUMN IF NOT EXISTS "erroMensagem" TEXT;`,
    `ALTER TABLE "analise_status_participacao" ADD COLUMN IF NOT EXISTS "concluidoEm" TIMESTAMP(3);`,
  ];
  for (const sql of queries) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch {
      // Silencioso se offline
    }
  }
}

/**
 * Resolve o plano ativo do Tenant (`BASICO` = 5, `PRO` / `TRIAL` = 10, `ENTERPRISE` = 20).
 */
export async function resolverPlanoTenant(
  tenantId?: string | null,
): Promise<PlanoAssinatura> {
  if (!tenantId) {
    return "PRO";
  }

  const mem = inMemoryTenants.get(tenantId);
  if (mem?.plano && ["BASICO", "PRO", "ENTERPRISE"].includes(String(mem.plano))) {
    return mem.plano as PlanoAssinatura;
  }

  try {
    const dbTenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plano: true, billingStatus: true },
    });
    if (
      dbTenant?.plano &&
      ["BASICO", "PRO", "ENTERPRISE"].includes(String(dbTenant.plano))
    ) {
      return dbTenant.plano as PlanoAssinatura;
    }
  } catch {
    // Fallback em memória
  }

  return "PRO";
}

/**
 * Calcula a cota mensal de análises de IA do Tenant no mês civil vigente (America/Sao_Paulo).
 * Quando o mês vira, a janela `[inicioMes, proximoMes)` muda automaticamente e a contagem
 * volta para `0/5`, `0/10` ou `0/20`.
 */
export async function obterStatusCotaAnaliseIA(
  tenantId?: string | null,
  referencia: Date = new Date(),
): Promise<CotaMensalAnaliseIA> {
  const plano = await resolverPlanoTenant(tenantId);
  const inicioMes = inicioMesCivilBRT(referencia);
  const fimMes = proximoMesCivilBRT(referencia);

  const idsContabilizados = new Set<string>();

  // 1. Store em memória
  const memList = listAllInMemoryAnalisesIA(tenantId);
  for (const item of memList) {
    if (!item || item.status === "ERRO") continue;
    if (tenantId && item.tenantId !== tenantId) continue;
    const criadoEm = item.criadoEm ? new Date(item.criadoEm) : new Date();
    if (
      criadoEm.getTime() >= inicioMes.getTime() &&
      criadoEm.getTime() < fimMes.getTime()
    ) {
      idsContabilizados.add(String(item.id));
    }
  }

  // 2. Banco de dados PostgreSQL
  try {
    await ensureAnaliseIAColumns();
    const dbList = await prisma.analiseStatusParticipacao.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        status: { not: "ERRO" },
        criadoEm: {
          gte: inicioMes,
          lt: fimMes,
        },
      },
      select: { id: true },
    });
    for (const row of dbList) {
      idsContabilizados.add(row.id);
    }
  } catch {
    // Em modo offline/teste usa apenas memória
  }

  return calcularCotaAnaliseIA({
    plano,
    usadas: idsContabilizados.size,
    referencia,
  });
}

/* =========================================================================
   Gerador de PDF Válido (PDF 1.4 Corporativo sem dependências binárias)
========================================================================= */

function removerAcentosParaPdfAnsi(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, " ");
}

function escaparLiteralPdf(str: string): string {
  return removerAcentosParaPdfAnsi(str)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function quebrarLinhasPdf(texto: string, maxChars: number = 88): string[] {
  const limpo = texto.replace(/\r\n/g, "\n").trim();
  if (!limpo) return [""];
  const paragrafos = limpo.split("\n");
  const linhas: string[] = [];

  for (const p of paragrafos) {
    const palavras = p.trim().split(/\s+/);
    let atual = "";
    for (const palavra of palavras) {
      if (!atual) {
        atual = palavra;
      } else if (atual.length + 1 + palavra.length <= maxChars) {
        atual += ` ${palavra}`;
      } else {
        linhas.push(atual);
        atual = palavra;
      }
    }
    if (atual) linhas.push(atual);
  }
  return linhas;
}

export function gerarPdfRelatorioParticipacao(params: {
  numeroEdital: string;
  orgaoNome: string;
  modalidade: string;
  uf: string;
  municipio?: string | null;
  valorEstimado: number;
  dataAbertura: Date | string;
  empresaNome: string;
  empresaCnpj: string;
  relatorio: RelatorioParticipacao;
  geradoEm?: Date;
}): { pdfBase64: string; pdfBuffer: Buffer; pdfNome: string } {
  const dataGeracao = (params.geradoEm ?? new Date()).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
  const valorFormatado = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(params.valorEstimado || 0);
  const aberturaFormatada = new Date(params.dataAbertura).toLocaleString(
    "pt-BR",
    { timeZone: "America/Sao_Paulo" },
  );

  const r = params.relatorio;
  const labelParecer =
    r.parecer === "APTO"
      ? "APTO PARA PARTICIPAR (GO)"
      : r.parecer === "APTO_COM_RESSALVAS"
        ? "APTO COM RESSALVAS (ATENCAO)"
        : "INAPTO / IMPEDIMENTO IDENTIFICADO (NO-GO)";

  type LinhaEstruturada = { bold?: boolean; size?: number; text: string };
  const blocos: LinhaEstruturada[] = [
    {
      bold: true,
      size: 14,
      text: "RELATORIO EXECUTIVO DE PARTICIPACAO E VIABILIDADE (IA)",
    },
    {
      bold: false,
      size: 9,
      text: `Gerado em: ${dataGeracao} (America/Sao_Paulo) | Portal de Licitacoes`,
    },
    { text: "----------------------------------------------------------------------------------------" },
    { bold: true, size: 11, text: "1. IDENTIFICACAO DO CERTAME E DA EMPRESA LICITANTE" },
    { text: `Edital: ${params.numeroEdital} | Modalidade: ${params.modalidade}` },
    {
      text: `Orgao Comprador: ${params.orgaoNome} (${params.municipio ? `${params.municipio}/` : ""}${params.uf})`,
    },
    {
      text: `Valor Estimado: ${valorFormatado} | Abertura/Disputa: ${aberturaFormatada}`,
    },
    {
      text: `Empresa Licitante: ${params.empresaNome || "Empresa Configurada no Tenant"} | CNPJ: ${params.empresaCnpj || "N/I"}`,
    },
    {
      text: `Segmento Identificado: ${r.segmentoIdentificado} | Margem/Lance Ref.: ${r.viabilidadeFinanceira.lanceMinimoReferencia || "Sob calculo comercial"}`,
    },
    { text: "----------------------------------------------------------------------------------------" },
    {
      bold: true,
      size: 12,
      text: `2. PARECER FINAL: ${labelParecer} — SCORE: ${r.scoreAderencia}/100`,
    },
    ...quebrarLinhasPdf(r.resumoExecutivo, 86).map((t) => ({ text: t })),
    { text: "----------------------------------------------------------------------------------------" },
    {
      bold: true,
      size: 11,
      text: `3. ADERENCIA DE ESCOPO E CNAE (${r.aderenciaEscopo.compativel ? "COMPATIVEL" : "REQUER REVISAO"})`,
    },
    ...quebrarLinhasPdf(
      `Segmento Empresa: ${r.aderenciaEscopo.segmentoEmpresa} | Segmento Edital: ${r.aderenciaEscopo.segmentoEdital}`,
      86,
    ).map((t) => ({ text: t })),
    ...quebrarLinhasPdf(`Analise: ${r.aderenciaEscopo.observacao}`, 86).map(
      (t) => ({ text: t }),
    ),
    { text: "----------------------------------------------------------------------------------------" },
    { bold: true, size: 11, text: "4. CHECKLIST DOCUMENTAL E HABILITACAO (/documentacao)" },
  ];

  for (const item of r.checklistDocumental) {
    const linhasItem = quebrarLinhasPdf(
      `[${item.status}] ${item.documento} (${item.categoria}): ${item.detalhe}`,
      86,
    );
    for (const l of linhasItem) blocos.push({ text: l });
  }

  blocos.push(
    { text: "----------------------------------------------------------------------------------------" },
    {
      bold: true,
      size: 11,
      text: `5. PORTAL DE DISPUTA: ${r.statusPortalDisputa.portalNome} (${r.statusPortalDisputa.status})`,
    },
    ...quebrarLinhasPdf(r.statusPortalDisputa.detalhe, 86).map((t) => ({
      text: t,
    })),
    { text: "----------------------------------------------------------------------------------------" },
    { bold: true, size: 11, text: "6. EXIGENCIAS TECNICAS, ATESTADOS E CAPACIDADE" },
  );

  for (const ex of r.exigenciasTecnicas) {
    for (const l of quebrarLinhasPdf(
      `• [${ex.atendido}] ${ex.exigencia}: ${ex.observacao}`,
      86,
    )) {
      blocos.push({ text: l });
    }
  }

  blocos.push(
    { text: "----------------------------------------------------------------------------------------" },
    { bold: true, size: 11, text: "7. VIABILIDADE FINANCEIRA E RISCOS IDENTIFICADOS" },
    ...quebrarLinhasPdf(r.viabilidadeFinanceira.observacoesCustos, 86).map(
      (t) => ({ text: t }),
    ),
  );

  for (const risco of r.riscosIdentificados) {
    for (const l of quebrarLinhasPdf(
      `• [${risco.severidade}] ${risco.titulo}: ${risco.mitigacao}`,
      86,
    )) {
      blocos.push({ text: l });
    }
  }

  blocos.push(
    { text: "----------------------------------------------------------------------------------------" },
    { bold: true, size: 11, text: "8. RECOMENDACOES PRATICAS PARA A EQUIPE" },
  );

  for (const rec of r.recomendacoesPraticas) {
    for (const l of quebrarLinhasPdf(`• ${rec}`, 86)) {
      blocos.push({ text: l });
    }
  }

  // Paginação (48 linhas por página A4)
  const LINHAS_POR_PAGINA = 48;
  const paginas: LinhaEstruturada[][] = [];
  for (let i = 0; i < blocos.length; i += LINHAS_POR_PAGINA) {
    paginas.push(blocos.slice(i, i + LINHAS_POR_PAGINA));
  }
  if (paginas.length === 0) {
    paginas.push([{ text: "Relatorio de Participacao" }]);
  }

  // Montagem de objetos PDF 1.4
  // 1: Catalog, 2: Pages, 3: Font Regular (F1), 4: Font Bold (F2)
  // Para cada página p (0..N-1): PageObj = 5 + p*2, ContentObj = 6 + p*2
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
      `(Pagina ${p + 1} de ${paginas.length} - Edital ${escaparLiteralPdf(params.numeroEdital)}) Tj`,
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
  pdfStr += `xref\n0 ${objetos.length + 1}\n`;
  pdfStr += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i++) {
    pdfStr += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdfStr += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  const pdfBuffer = Buffer.from(pdfStr, "ascii");
  const safeEdital = params.numeroEdital
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 40);
  const pdfNome = `Relatorio_IA_Edital_${safeEdital}.pdf`;

  return {
    pdfBase64: pdfBuffer.toString("base64"),
    pdfBuffer,
    pdfNome,
  };
}

/* =========================================================================
   Motor Híbrido de Cruzamento Multi-Segmento + LLM (OpenAI / Gemini)
========================================================================= */

async function tentarEnriquecerComLLM(promptContexto: string): Promise<{
  resumoExecutivo?: string;
  recomendacoesExtras?: string[];
  observacoesCustos?: string;
} | null> {
  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!openaiKey && !geminiKey) {
    return null;
  }

  try {
    if (openaiKey) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || "gpt-4o-mini",
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "Você é um Especialista Sênior em Licitações Públicas (Lei 14.133/2021) multi-segmento. Retorne exclusivamente um JSON com os campos: resumoExecutivo (string), observacoesCustos (string) e recomendacoesExtras (array de strings).",
            },
            { role: "user", content: promptContexto },
          ],
        }),
        signal: AbortSignal.timeout(12000),
      });
      if (res.ok) {
        const json: any = await res.json();
        const content = json?.choices?.[0]?.message?.content;
        if (content) {
          return JSON.parse(content);
        }
      }
    } else if (geminiKey) {
      const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `Você é um Especialista Sênior em Licitações Públicas (Lei 14.133/2021). Analise os dados abaixo e retorne apenas um JSON válido com {"resumoExecutivo": "...", "observacoesCustos": "...", "recomendacoesExtras": ["..."]}:\n\n${promptContexto}`,
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.2,
              responseMimeType: "application/json",
            },
          }),
          signal: AbortSignal.timeout(12000),
        },
      );
      if (res.ok) {
        const json: any = await res.json();
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          return JSON.parse(text);
        }
      }
    }
  } catch {
    // Fallback silencioso para o motor determinístico híbrido
  }

  return null;
}

export async function construirRelatorioParticipacaoHibrido(
  licitacaoId: string,
  input: SolicitarAnaliseInput,
  tenantId?: string | null,
): Promise<{
  oportunidade: any;
  empresa: any;
  relatorio: RelatorioParticipacao;
  relatorioTexto: string;
  impedimentosTexto: string;
  viabilidadeTexto: string;
  custosTexto: string;
  precoSugerido: number;
}> {
  const oportunidade = await getOportunidadeById(licitacaoId, tenantId);

  let empresa: any;
  try {
    empresa = await obterConfiguracaoEmpresa(tenantId);
  } catch {
    empresa = getInMemoryConfiguracaoEmpresa(tenantId);
  }

  const [docsResp, portaisResp] = await Promise.all([
    listarDocumentos({ tenantId: tenantId || undefined, pageSize: 100 }).catch(
      () => ({ documentos: [] as any[] }),
    ),
    listarPortais({ tenantId: tenantId || undefined, pageSize: 100 }).catch(
      () => ({ portais: [] as any[] }),
    ),
  ]);

  const documentos = docsResp.documentos || [];
  const portais = portaisResp.portais || [];

  // 1. Identificação do Segmento do Edital vs Segmento da Empresa
  const macroCodigo = (oportunidade.segmentoMacro || "OUTROS") as MacroSegmento;
  const macroDef = CATALOGO_MACRO_SEGMENTOS[macroCodigo];
  const nomeSegmentoEdital =
    macroDef?.nome ||
    oportunidade.segmentoMacro ||
    oportunidade.tipoSistemaCodigo ||
    "Fornecimento de Bens e Serviços";

  const segmentosEmpresaCodigos: string[] = Array.isArray(empresa?.segmentos)
    ? empresa.segmentos
    : [];
  const nomesSegmentosEmpresa = segmentosEmpresaCodigos.map(
    (c) => CATALOGO_MACRO_SEGMENTOS[c as MacroSegmento]?.nome || c,
  );
  const labelSegmentoEmpresa =
    nomesSegmentosEmpresa.length > 0
      ? nomesSegmentosEmpresa.join(", ")
      : empresa?.cnae || "Escopo Geral Configurado";

  const escopoCompativel =
    segmentosEmpresaCodigos.length === 0 ||
    !oportunidade.segmentoMacro ||
    segmentosEmpresaCodigos.includes(oportunidade.segmentoMacro);

  const ufsEmpresa: string[] = Array.isArray(empresa?.ufs) ? empresa.ufs : [];
  const atuaNaUf =
    empresa?.brasilInteiro !== false ||
    ufsEmpresa.length === 0 ||
    ufsEmpresa.includes(String(oportunidade.uf || "").toUpperCase());

  // 2. Cruzamento Documental (/documentacao)
  const categoriasEssenciais: Array<{
    codigos: string[];
    codigo: string;
    label: string;
  }> = [
    {
      codigos: ["JURIDICA", "HABILITACAO_JURIDICA"],
      codigo: "JURIDICA",
      label: "Habilitação Jurídica (Contrato Social / Cartão CNPJ)",
    },
    {
      codigos: ["FISCAL_TRABALHISTA", "REGULARIDADE_FISCAL_TRABALHISTA"],
      codigo: "FISCAL_TRABALHISTA",
      label: "Regularidade Fiscal e Trabalhista (CNDs Federal/Estadual/Municipal/FGTS/CNDT)",
    },
    {
      codigos: ["QUALIFICACAO_ECONOMICA", "QUALIFICACAO_ECONOMICO_FINANCEIRA"],
      codigo: "QUALIFICACAO_ECONOMICA",
      label: "Qualificação Econômico-Financeira (Balanço / Certidão Falência)",
    },
    {
      codigos: ["QUALIFICACAO_TECNICA"],
      codigo: "QUALIFICACAO_TECNICA",
      label: "Qualificação Técnica (Atestados de Capacidade Técnica)",
    },
  ];

  const checklistDocumental: RelatorioParticipacao["checklistDocumental"] = [];
  let qtdDocsVencidos = 0;
  let qtdDocsVencendo = 0;
  let qtdCategoriasAusentes = 0;

  for (const cat of categoriasEssenciais) {
    const docsDaCat = documentos.filter(
      (d: any) => cat.codigos.includes(String(d.categoria)) && d.status === "ATIVO",
    );
    if (docsDaCat.length === 0) {
      qtdCategoriasAusentes++;
      checklistDocumental.push({
        documento: cat.label,
        categoria: cat.codigo,
        status: "AUSENTE",
        diasParaVencer: null,
        detalhe: "Nenhum documento ativo cadastrado nesta categoria em /documentacao.",
      });
    } else {
      for (const d of docsDaCat) {
        if (d.vencido) {
          qtdDocsVencidos++;
          checklistDocumental.push({
            documento: d.nome,
            categoria: cat.codigo,
            status: "VENCIDO",
            diasParaVencer: d.diasParaVencer ?? -1,
            detalhe: `Documento vencido há ${Math.abs(d.diasParaVencer ?? 1)} dia(s). Renovação obrigatória antes da sessão.`,
          });
        } else if (d.alertaVencimento && d.diasParaVencer !== null) {
          qtdDocsVencendo++;
          checklistDocumental.push({
            documento: d.nome,
            categoria: cat.codigo,
            status: "VENCENDO",
            diasParaVencer: d.diasParaVencer,
            detalhe: `Vence em ${d.diasParaVencer} dia(s). Atenção caso a habilitação ocorra após essa data.`,
          });
        } else {
          checklistDocumental.push({
            documento: d.nome,
            categoria: cat.codigo,
            status: "REGULAR",
            diasParaVencer: d.diasParaVencer ?? null,
            detalhe: d.semValidade
              ? "Documento vigente (validade indeterminada)."
              : `Documento vigente (${d.diasParaVencer ?? 60}+ dias de validade).`,
          });
        }
      }
    }
  }

  // 3. Cruzamento do Portal de Disputa (/portais)
  const nomePortalEdital = oportunidade.portalDisputa || "Compras.gov.br / PNCP";
  const portalMatch = portais.find(
    (p: any) =>
      p.nome.toLowerCase().includes(nomePortalEdital.toLowerCase()) ||
      nomePortalEdital.toLowerCase().includes(p.nome.toLowerCase()),
  );

  let statusPortalDisputa: RelatorioParticipacao["statusPortalDisputa"];
  let penalidadePortal = 0;

  if (!portalMatch) {
    penalidadePortal = 5;
    statusPortalDisputa = {
      portalNome: nomePortalEdital,
      status: "NAO_CADASTRADO",
      dataVencimento: null,
      detalhe: `O portal "${nomePortalEdital}" ainda não consta cadastrado em /portais. Verifique credenciais de acesso antes do envio da proposta.`,
    };
  } else if (
    ["VENCIDO", "INATIVO", "SUSPENSO", "REJEITADO", "NAO_CADASTRADO"].includes(
      String(portalMatch.status),
    ) ||
    (portalMatch.dataVencimento &&
      new Date(portalMatch.dataVencimento).getTime() < Date.now())
  ) {
    penalidadePortal = 15;
    statusPortalDisputa = {
      portalNome: portalMatch.nome,
      status: "VENCIDO",
      dataVencimento: portalMatch.dataVencimento
        ? new Date(portalMatch.dataVencimento).toLocaleDateString("pt-BR")
        : null,
      detalhe: `O cadastro no portal "${portalMatch.nome}" encontra-se ${portalMatch.status}. Regularize imediatamente para habilitar o envio de lances.`,
    };
  } else {
    statusPortalDisputa = {
      portalNome: portalMatch.nome,
      status: "ATIVO",
      dataVencimento: portalMatch.dataVencimento
        ? new Date(portalMatch.dataVencimento).toLocaleDateString("pt-BR")
        : null,
      detalhe: `Credenciamento ativo no portal "${portalMatch.nome}". Pronto para cadastro de proposta e disputa.`,
    };
  }

  // 4. Exigências Técnicas e Atestados do Edital
  const atestadosEdital: string[] = Array.isArray(oportunidade.atestadosExigidos)
    ? oportunidade.atestadosExigidos
    : [];
  const temDocQualificacaoTecnica = documentos.some(
    (d: any) => d.categoria === "QUALIFICACAO_TECNICA" && d.status === "ATIVO" && !d.vencido,
  );

  const exigenciasTecnicas: RelatorioParticipacao["exigenciasTecnicas"] = [];
  if (atestadosEdital.length > 0) {
    for (const atestado of atestadosEdital) {
      exigenciasTecnicas.push({
        exigencia: String(atestado),
        atendido: temDocQualificacaoTecnica ? "SIM" : "VERIFICAR",
        observacao: temDocQualificacaoTecnica
          ? "Atestado técnico ativo localizado em /documentacao; validar quantitativo mínimo (50%) do item."
          : "Exigência identificada no edital; vincular atestado de capacidade técnica compatível antes da sessão.",
      });
    }
  } else {
    exigenciasTecnicas.push({
      exigencia: `Comprovação de aptidão para fornecimento/execução em ${nomeSegmentoEdital} (Art. 67 da Lei 14.133/2021)`,
      atendido: temDocQualificacaoTecnica ? "SIM" : "VERIFICAR",
      observacao: temDocQualificacaoTecnica
        ? "Acervo de qualificação técnica ativo em /documentacao."
        : "Recomenda-se anexar ao menos 1 Atestado de Capacidade Técnica compatível com o objeto.",
    });
  }

  if (oportunidade.isPresencial) {
    exigenciasTecnicas.push({
      exigencia: `Sessão Presencial em ${oportunidade.municipio || oportunidade.uf}`,
      atendido: atuaNaUf ? "SIM" : "VERIFICAR",
      observacao: "Certame presencial exige representante credenciado no local ou procuração específica.",
    });
  }

  // 5. Cálculo de Score e Parecer
  let score = 92;
  if (!escopoCompativel) score -= 28;
  if (!atuaNaUf) score -= 12;
  score -= qtdDocsVencidos * 18;
  score -= qtdDocsVencendo * 5;
  score -= qtdCategoriasAusentes * 6;
  score -= penalidadePortal;
  score = Math.max(15, Math.min(100, score));

  const parecer: RelatorioParticipacao["parecer"] =
    score >= 75 && qtdDocsVencidos === 0 && escopoCompativel
      ? "APTO"
      : score >= 48
        ? "APTO_COM_RESSALVAS"
        : "INAPTO";

  // 6. Viabilidade Financeira e Preço Sugerido
  const valorEstimado = Number(oportunidade.valorEstimado || 0);
  const precoSugerido = Math.round(valorEstimado * 0.88 * 100) / 100;
  const lanceMinimoRef = Math.round(valorEstimado * 0.78 * 100) / 100;
  const fmtBRL = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  // 7. Riscos Identificados
  const riscosIdentificados: RelatorioParticipacao["riscosIdentificados"] = [];
  if (qtdDocsVencidos > 0) {
    riscosIdentificados.push({
      severidade: "ALTA",
      titulo: `${qtdDocsVencidos} documento(s) vencido(s) em /documentacao`,
      mitigacao: "Emitir novas certidões negativas e atualizar na aba Documentação antes da abertura.",
    });
  }
  if (!escopoCompativel) {
    riscosIdentificados.push({
      severidade: "ALTA",
      titulo: "Divergência entre o segmento macro do edital e os segmentos configurados",
      mitigacao: "Verificar se o CNAE secundário do Contrato Social contempla o objeto licitado.",
    });
  }
  if (statusPortalDisputa.status !== "ATIVO") {
    riscosIdentificados.push({
      severidade: statusPortalDisputa.status === "VENCIDO" ? "ALTA" : "MEDIA",
      titulo: `Portal de disputa (${statusPortalDisputa.portalNome}) com status ${statusPortalDisputa.status}`,
      mitigacao: "Validar login, senha e certificado digital no portal com no mínimo 24h de antecedência.",
    });
  }
  if (riscosIdentificados.length === 0) {
    riscosIdentificados.push({
      severidade: "BAIXA",
      titulo: "Risco operacional controlado",
      mitigacao: "Monitorar esclarecimentos e eventuais retificações do edital no PNCP até a data da sessão.",
    });
  }

  let resumoExecutivo =
    parecer === "APTO"
      ? `A empresa apresenta alta aderência técnica e documental (Score ${score}/100) para participar do Edital ${oportunidade.numeroEdital} (${oportunidade.orgaoNome}) no segmento de ${nomeSegmentoEdital}.`
      : parecer === "APTO_COM_RESSALVAS"
        ? `A participação no Edital ${oportunidade.numeroEdital} (${oportunidade.orgaoNome}) é viável com ressalvas (Score ${score}/100). Recomenda-se sanar as pendências apontadas no checklist antes da abertura da sessão.`
        : `Foram identificados impedimentos críticos (Score ${score}/100) para o Edital ${oportunidade.numeroEdital}. Revise os documentos vencidos e a compatibilidade de CNAE/escopo antes de deliberar.`;

  let observacoesCustos = `Valor estimado pelo órgão: ${fmtBRL(valorEstimado)}. Proposta inicial recomendada (deságio tático de 12%): ${fmtBRL(precoSugerido)}. Piso operacional sugerido para fase de lances (margem preservada): ${fmtBRL(lanceMinimoRef)} (${oportunidade.quantidadeLotes || 1} lote(s)).`;

  const recomendacoesPraticas: string[] = [
    `Revisar integralmente os ${Array.isArray(oportunidade.arquivos) ? oportunidade.arquivos.length : 0} anexo(s) do edital e validar especificações de marca/modelo ou SLA de execução.`,
    `Confirmar vigência das certidões em /documentacao na véspera da disputa (${new Date(oportunidade.dataAbertura).toLocaleDateString("pt-BR")}).`,
    `Registrar proposta inicial em ${fmtBRL(precoSugerido)} e definir limite de lance automático em ${fmtBRL(lanceMinimoRef)}.`,
  ];
  const obsUsuario = input.observacoes || input.observacoesExtras;
  if (obsUsuario) {
    recomendacoesPraticas.push(
      `Consideração específica solicitada pela equipe: ${obsUsuario}`,
    );
  }

  // 8. Enriquecimento opcional com LLM (OpenAI / Gemini) se chave configurada
  const enriquecidoLLM = await tentarEnriquecerComLLM(
    JSON.stringify({
      edital: oportunidade.numeroEdital,
      orgao: oportunidade.orgaoNome,
      uf: oportunidade.uf,
      modalidade: oportunidade.modalidade,
      segmentoEdital: nomeSegmentoEdital,
      objeto: oportunidade.resumo,
      valorEstimado,
      arquivosEdital: (oportunidade.arquivos || []).map((a: any) => a.nome),
      empresaSegmentos: labelSegmentoEmpresa,
      empresaCnae: empresa?.cnae,
      parecerPreliminar: parecer,
      score,
      observacoesUsuario: obsUsuario || null,
    }),
  );

  if (enriquecidoLLM?.resumoExecutivo) {
    resumoExecutivo = enriquecidoLLM.resumoExecutivo;
  }
  if (enriquecidoLLM?.observacoesCustos) {
    observacoesCustos = enriquecidoLLM.observacoesCustos;
  }
  if (Array.isArray(enriquecidoLLM?.recomendacoesExtras)) {
    for (const rec of enriquecidoLLM.recomendacoesExtras.slice(0, 3)) {
      if (rec && typeof rec === "string") {
        recomendacoesPraticas.push(rec);
      }
    }
  }

  const relatorio: RelatorioParticipacao = {
    parecer,
    scoreAderencia: score,
    segmentoIdentificado: nomeSegmentoEdital,
    resumoExecutivo,
    aderenciaEscopo: {
      compativel: escopoCompativel && atuaNaUf,
      segmentoEmpresa: labelSegmentoEmpresa,
      segmentoEdital: nomeSegmentoEdital,
      observacao:
        escopoCompativel && atuaNaUf
          ? `O objeto licitado (${nomeSegmentoEdital}) e a localidade (${oportunidade.uf}) estão alinhados ao escopo operacional configurado pela empresa.`
          : `Atenção: verifique a compatibilidade entre o escopo configurado (${labelSegmentoEmpresa}) e o segmento do edital (${nomeSegmentoEdital} - ${oportunidade.uf}).`,
    },
    checklistDocumental,
    statusPortalDisputa,
    exigenciasTecnicas,
    viabilidadeFinanceira: {
      valorEstimadoEdital: valorEstimado,
      lanceMinimoReferencia: fmtBRL(lanceMinimoRef),
      margemSegurancaSugerida: "12% a 22% de deságio máximo sobre o valor de referência",
      observacoesCustos,
    },
    riscosIdentificados,
    recomendacoesPraticas,
  };

  const impedimentosTexto =
    riscosIdentificados
      .filter((r) => r.severidade === "ALTA")
      .map((r) => `${r.titulo}: ${r.mitigacao}`)
      .join(" | ") ||
    "Nenhum impedimento eliminatório crítico detectado nos cadastros ativos.";

  const viabilidadeTexto = `${resumoExecutivo} Aderência de Escopo: ${relatorio.aderenciaEscopo.observacao}`;
  const custosTexto = observacoesCustos;

  const relatorioTexto = [
    `PARECER EXECUTIVO: ${parecer} (Score ${score}/100)`,
    `Segmento: ${nomeSegmentoEdital}`,
    "",
    `1. RESUMO EXECUTIVO`,
    resumoExecutivo,
    "",
    `2. ADERÊNCIA DE ESCOPO E CNAE`,
    relatorio.aderenciaEscopo.observacao,
    "",
    `3. CHECKLIST DOCUMENTAL (/documentacao)`,
    ...checklistDocumental.map(
      (c) => `- [${c.status}] ${c.documento}: ${c.detalhe}`,
    ),
    "",
    `4. PORTAL DE DISPUTA (/portais)`,
    `- [${statusPortalDisputa.status}] ${statusPortalDisputa.portalNome}: ${statusPortalDisputa.detalhe}`,
    "",
    `5. VIABILIDADE FINANCEIRA`,
    observacoesCustos,
    "",
    `6. RECOMENDAÇÕES PRÁTICAS`,
    ...recomendacoesPraticas.map((rec) => `- ${rec}`),
  ].join("\n");

  return {
    oportunidade,
    empresa,
    relatorio,
    relatorioTexto,
    impedimentosTexto,
    viabilidadeTexto,
    custosTexto,
    precoSugerido,
  };
}

/**
 * Inicia uma análise de participação com IA em background (assíncrona),
 * validando e incrementando imediatamente a cota mensal do plano do Tenant (`0/5` -> `1/5`, etc.),
 * gerando o relatório em PDF e disparando a notificação `N11_RELATORIO_IA_PRONTO`
 * para todos os usuários assignados no projeto quando concluída.
 */
export async function iniciarAnaliseParticipacaoAssincrona(
  licitacaoId: string,
  rawInput: unknown,
  user?: RbacUser | null,
  actorContext?: OportunidadesActorContext,
  tenantId?: string | null,
  options?: {
    referencia?: Date;
    aguardarConclusao?: boolean;
  },
): Promise<{
  ok: true;
  status: "PROCESSANDO" | "CONCLUIDO";
  analiseId: string;
  mensagem: string;
  cota: CotaMensalAnaliseIA;
  analise: any;
}> {
  const input = solicitarAnaliseInputSchema.parse(rawInput ?? {});
  const referencia = options?.referencia ?? new Date();
  const oportunidade = await getOportunidadeById(licitacaoId, tenantId);
  const realId = oportunidade.id;

  // 1. Verifica limite mensal do plano antes de criar
  const cotaAntes = await obterStatusCotaAnaliseIA(tenantId, referencia);
  if (cotaAntes.atingiuLimite) {
    throw new AnaliseIAParticipacaoError(
      "COTA_MENSAL_IA_ATINGIDA",
      cotaAntes.mensagemBloqueio ||
        `Limite mensal de análises de IA atingido (${cotaAntes.usadas}/${cotaAntes.limite}).`,
      403,
      cotaAntes,
    );
  }

  // 2. Cria registro imediato com status PROCESSANDO (incrementando a cota 0/X -> 1/X)
  const analiseId = `ia_${randomUUID()}`;
  const obsInicial = input.observacoes || input.observacoesExtras;
  const registroInicial: any = {
    id: analiseId,
    licitacaoId: realId,
    tenantId: tenantId ?? null,
    status: "PROCESSANDO",
    origem: "IA_HIBRIDA",
    parecer: null,
    scriptPrompt:
      obsInicial ||
      `Análise multi-segmento automática — Edital ${oportunidade.numeroEdital}`,
    relatorioTexto:
      "Relatório de participação sendo processado em segundo plano pela IA...",
    impedimentos: null,
    viabilidade: null,
    custos: null,
    precoSugerido: null,
    relatorioJson: null,
    pdfBase64: null,
    pdfNome: null,
    erroMensagem: null,
    concluidoEm: null,
    executadoPorId: user?.id ?? actorContext?.usuarioId ?? null,
    criadoEm: referencia,
  };

  insertInMemoryLicitacaoAnaliseIA(realId, registroInicial);

  try {
    await ensureAnaliseIAColumns();
    await prisma.analiseStatusParticipacao.create({
      data: {
        id: analiseId,
        licitacaoId: realId,
        tenantId: tenantId ?? null,
        status: "PROCESSANDO",
        origem: "IA_HIBRIDA",
        scriptPrompt: registroInicial.scriptPrompt,
        relatorioTexto: registroInicial.relatorioTexto,
        executadoPorId: registroInicial.executadoPorId,
        criadoEm: referencia,
      },
    });
  } catch {
    // Store em memória já registrou
  }

  // Calcula cota atualizada (já refletindo +1 no mês)
  const cotaAtualizada = await obterStatusCotaAnaliseIA(tenantId, referencia);

  // 3. Dispara o processamento em background
  const jobPromise = (async () => {
    try {
      const resultado = await construirRelatorioParticipacaoHibrido(
        realId,
        input,
        tenantId,
      );

      const concluidoEm = new Date();
      const { pdfBase64, pdfNome } = gerarPdfRelatorioParticipacao({
        numeroEdital: resultado.oportunidade.numeroEdital,
        orgaoNome: resultado.oportunidade.orgaoNome,
        modalidade: resultado.oportunidade.modalidade,
        uf: resultado.oportunidade.uf,
        municipio: resultado.oportunidade.municipio,
        valorEstimado: resultado.oportunidade.valorEstimado,
        dataAbertura: resultado.oportunidade.dataAbertura,
        empresaNome:
          resultado.empresa?.razaoSocial ||
          resultado.empresa?.nomeFantasia ||
          "Empresa Licitante",
        empresaCnpj: resultado.empresa?.cnpj || "Não informado",
        relatorio: resultado.relatorio,
        geradoEm: concluidoEm,
      });

      const patchConcluido = {
        status: "CONCLUIDO",
        parecer: resultado.relatorio.parecer,
        relatorioTexto: resultado.relatorioTexto,
        impedimentos: resultado.impedimentosTexto,
        viabilidade: resultado.viabilidadeTexto,
        custos: resultado.custosTexto,
        precoSugerido: resultado.precoSugerido,
        relatorioJson: resultado.relatorio,
        pdfBase64,
        pdfNome,
        concluidoEm,
      };

      const memFinal = updateInMemoryLicitacaoAnaliseIA(
        realId,
        analiseId,
        patchConcluido,
      );

      try {
        await prisma.analiseStatusParticipacao.update({
          where: { id: analiseId },
          data: {
            status: "CONCLUIDO",
            parecer: resultado.relatorio.parecer,
            relatorioTexto: resultado.relatorioTexto,
            impedimentos: resultado.impedimentosTexto,
            viabilidade: resultado.viabilidadeTexto,
            custos: resultado.custosTexto,
            precoSugerido: resultado.precoSugerido,
            relatorioJson: resultado.relatorio as any,
            pdfBase64,
            pdfNome,
            concluidoEm,
          },
        });
      } catch {
        // Fallback em memória já atualizado
      }

      await recordAuditLog({
        acao: "ANALISE_IA_CONCLUIDA",
        entidadeTipo: "ANALISE_STATUS_PARTICIPACAO",
        entidadeId: analiseId,
        tenantId: tenantId ?? null,
        antes: { status: "PROCESSANDO" },
        depois: {
          status: "CONCLUIDO",
          licitacaoId: realId,
          parecer: resultado.relatorio.parecer,
          scoreAderencia: resultado.relatorio.scoreAderencia,
          pdfNome,
        },
        usuarioId: user?.id ?? actorContext?.usuarioId ?? null,
        usuarioNome: user?.name ?? actorContext?.usuarioNome ?? null,
        ip: actorContext?.ip ?? null,
      });

      // 4. Notifica todos os usuários assignados no projeto (+ solicitante)
      await notificarRelatorioIAPronto({
        licitacaoId: realId,
        analiseId,
        numeroEdital: resultado.oportunidade.numeroEdital,
        orgaoNome: resultado.oportunidade.orgaoNome,
        parecer: resultado.relatorio.parecer,
        score: resultado.relatorio.scoreAderencia,
        solicitanteId: user?.id ?? actorContext?.usuarioId ?? null,
        tenantId,
      }).catch(() => undefined);

      return memFinal ?? { ...registroInicial, ...patchConcluido };
    } catch (err: any) {
      const msgErro =
        err instanceof Error ? err.message : "Erro ao processar análise de IA";
      updateInMemoryLicitacaoAnaliseIA(realId, analiseId, {
        status: "ERRO",
        erroMensagem: msgErro,
      });
      try {
        await prisma.analiseStatusParticipacao.update({
          where: { id: analiseId },
          data: { status: "ERRO", erroMensagem: msgErro },
        });
      } catch {}
      return null;
    } finally {
      pendingBackgroundJobs.delete(analiseId);
    }
  })();

  pendingBackgroundJobs.set(analiseId, jobPromise);

  if (options?.aguardarConclusao) {
    const concluida = await jobPromise;
    return {
      ok: true,
      status: "CONCLUIDO",
      analiseId,
      mensagem:
        "Relatório de participação gerado com sucesso e salvo na aba Histórico Análise IA.",
      cota: cotaAtualizada,
      analise: concluida ?? getInMemoryLicitacaoAnaliseIA(realId, analiseId),
    };
  }

  return {
    ok: true,
    status: "PROCESSANDO",
    analiseId,
    mensagem:
      "O relatório de participação está sendo gerado em segundo plano. Você e os membros atribuídos ao projeto serão notificados assim que o PDF estiver disponível na aba Histórico Análise IA.",
    cota: cotaAtualizada,
    analise: registroInicial,
  };
}

/**
 * Permite aguardar a conclusão de um job assíncrono em andamento (útil em testes e webhooks).
 */
export async function aguardarProcessamentoAnaliseIA(
  analiseId: string,
): Promise<any | null> {
  const job = pendingBackgroundJobs.get(analiseId);
  if (job) {
    return await job;
  }
  return null;
}

/**
 * Busca uma análise de participação específica (incluindo `pdfBase64` para download).
 */
export async function obterAnaliseIAPorId(
  licitacaoId: string,
  analiseId: string,
  tenantId?: string | null,
): Promise<any | null> {
  const oportunidade = await getOportunidadeById(licitacaoId, tenantId);
  const realId = oportunidade.id;

  // Se ainda estiver processando em background, aguarda finalizar antes de servir o PDF
  await aguardarProcessamentoAnaliseIA(analiseId);

  const mem = getInMemoryLicitacaoAnaliseIA(realId, analiseId);
  if (mem) {
    if (tenantId && mem.tenantId && mem.tenantId !== tenantId) {
      return null;
    }
    return mem;
  }

  try {
    const db = await prisma.analiseStatusParticipacao.findFirst({
      where: {
        id: analiseId,
        licitacaoId: realId,
        ...(tenantId ? { OR: [{ tenantId }, { tenantId: null }] } : {}),
      },
    });
    if (db) return db;
  } catch {
    // ignore
  }

  const todas = listInMemoryLicitacaoAnalisesIA(realId, tenantId);
  return todas.find((a) => a.id === analiseId) || null;
}

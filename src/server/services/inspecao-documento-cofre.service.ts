import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { obterObjetoR2 } from "@/server/storage/r2-storage.service";
import type { DocumentoValidacaoStatus } from "@/server/schemas/documento.schema";
import {
  detectarTipoRealPorBuffer,
  extrairTextoDocx,
  extrairTextoPdf,
} from "./leitor-documentos-certame.service";
import {
  chamarLlmJsonMultimodal,
  type LlmTelemetryContext,
} from "./llm-multimodal.service";

export interface ResultadoInspecaoDocumentoCofre {
  validacaoStatus: DocumentoValidacaoStatus;
  validacaoResumo: string;
  cnpjExtraido: string | null;
  emissaoExtraida: string | null;
  vencimentoExtraido: string | null;
  tipoDetectado: string | null;
  validadoEm: Date;
}

export function normalizarDigitosCnpj(raw?: string | null): string {
  return String(raw || "").replace(/\D/g, "");
}

export function formatarCnpjMascara(digitos: string): string {
  const d = normalizarDigitosCnpj(digitos);
  if (d.length !== 14) return d;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
}

export function extrairCnpjsDoTexto(texto: string): string[] {
  const encontrados = new Set<string>();
  const maskRegex = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g;
  const plainRegex = /(?:cnpj|cpf\/cnpj|inscri[çc][aã]o)\s*[:nº°.\-]*\s*(\d{14})\b/gi;

  let m: RegExpExecArray | null;
  while ((m = maskRegex.exec(texto)) !== null) {
    const digits = normalizarDigitosCnpj(m[0]);
    if (digits.length === 14) encontrados.add(digits);
  }
  while ((m = plainRegex.exec(texto)) !== null) {
    const digits = normalizarDigitosCnpj(m[1]);
    if (digits.length === 14) encontrados.add(digits);
  }

  return Array.from(encontrados);
}

function normalizarDataPtBrParaIso(raw?: string | null): string | null {
  if (!raw) return null;
  const limpo = raw.trim();
  const isoMatch = limpo.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }
  const brMatch = limpo.match(/^(\d{2})[\/.\-](\d{2})[\/.\-](\d{4})$/);
  if (brMatch) {
    const [, d, m, y] = brMatch;
    return `${y}-${m}-${d}`;
  }
  return null;
}

export function extrairDatasContextualizadas(texto: string): {
  emissaoIso: string | null;
  vencimentoIso: string | null;
} {
  let emissaoIso: string | null = null;
  let vencimentoIso: string | null = null;

  const regexVenc =
    /(?:v[áa]lid[oa]\s+at[ée]|validade(?:\s+at[ée])?|vencimento|expira\s+em)\s*[:\-]?\s*(\d{2}[\/.\-]\d{2}[\/.\-]\d{4})/i;
  const matchVenc = texto.match(regexVenc);
  if (matchVenc?.[1]) {
    vencimentoIso = normalizarDataPtBrParaIso(matchVenc[1]);
  }

  const regexEmiss =
    /(?:emitid[oa]\s+em|data\s+de\s+emiss[aã]o|emiss[aã]o|expedid[oa]\s+em)\s*[:\-]?\s*(\d{2}[\/.\-]\d{2}[\/.\-]\d{4})/i;
  const matchEmiss = texto.match(regexEmiss);
  if (matchEmiss?.[1]) {
    emissaoIso = normalizarDataPtBrParaIso(matchEmiss[1]);
  }

  return { emissaoIso, vencimentoIso };
}

export function detectarTipoDocumentoPorTexto(texto: string): string | null {
  const norm = texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (/falencia|concordata|recuperacao\s+judicial|distribuidor\s+civel/.test(norm)) {
    return "Certidão de Falência e Concordata";
  }
  if (/fgts|\bcrf\b|fundo\s+de\s+garantia|caixa\s+economica\s+federal/.test(norm)) {
    return "CRF / Regularidade do FGTS";
  }
  if (/debitos\s+trabalhistas|\bcndt\b|justica\s+do\s+trabalho/.test(norm)) {
    return "Certidão Negativa de Débitos Trabalhistas (CNDT)";
  }
  if (/receita\s+federal|pgfn|divida\s+ativa\s+da\s+uniao|tributos\s+federais/.test(norm)) {
    return "CND Federal (RFB/PGFN)";
  }
  if (/atestado\s+de\s+capacidade|atestamos|aptidao\s+para\s+desempenho/.test(norm)) {
    return "Atestado de Capacidade Técnica";
  }
  if (/balanco\s+patrimonial|demonstrac[a-z]+\s+contab|ativo\s+circulante/.test(norm)) {
    return "Balanço Patrimonial / Qualificação Econômica";
  }
  if (/contrato\s+social|junta\s+comercial|alteracao\s+contratual/.test(norm)) {
    return "Contrato Social / Ato Constitutivo";
  }
  if (/cartao\s+cnpj|cadastro\s+nacional\s+da\s+pessoa\s+juridica|comprovante\s+de\s+inscricao/.test(norm)) {
    return "Cartão CNPJ";
  }
  if (/fazenda\s+estadual|sefaz|icms|tributos\s+estaduais/.test(norm)) {
    return "CND Estadual";
  }
  if (/tributos\s+municipais|prefeitura\s+municipal|issqn|fazenda\s+municipal/.test(norm)) {
    return "CND Municipal";
  }

  return null;
}

export async function carregarBufferDocumentoCofre(
  arquivoUrl?: string | null,
): Promise<Buffer | null> {
  if (!arquivoUrl) return null;
  const limpo = arquivoUrl.replace(/^\/+/, "");
  const relativosSemUploads = limpo.replace(/^uploads\//, "");

  const candidatos = [
    path.resolve("/data/uploads", relativosSemUploads),
    path.resolve("/data/uploads", limpo),
    path.resolve(process.cwd(), "public", limpo),
    path.resolve(process.cwd(), limpo),
  ];

  const basesPermitidas = [
    path.resolve("/data/uploads"),
    path.resolve(process.cwd(), "public"),
    path.resolve(process.cwd()),
  ];

  for (const candidato of candidatos) {
    const seguro = basesPermitidas.some((b) => candidato.startsWith(b));
    if (!seguro) continue;
    if (existsSync(candidato)) {
      try {
        return await readFile(candidato);
      } catch {
        // continua
      }
    }
  }

  // Tentativa Cloudflare R2 caso arquivoUrl seja chave
  try {
    const r2 = await obterObjetoR2(limpo);
    if (r2?.buffer && r2.buffer.length > 0) {
      return r2.buffer;
    }
  } catch {
    // R2 indisponível
  }

  return null;
}

function diffDiasIso(isoA: string, isoB: string): number {
  const msA = Date.parse(`${isoA}T12:00:00Z`);
  const msB = Date.parse(`${isoB}T12:00:00Z`);
  if (Number.isNaN(msA) || Number.isNaN(msB)) return 0;
  return Math.round(Math.abs(msA - msB) / (1000 * 60 * 60 * 24));
}

function formatIsoParaPtBr(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/**
 * Inspeciona o conteúdo real de um arquivo anexado em `/documentacao`
 * (PDF, DOCX ou Imagem JPG/PNG/WEBP), extraindo CNPJ titular, datas e tipo
 * e confrontando com o CNPJ da empresa ativa e validade informada.
 */
export async function inspecionarArquivoDocumentoCofre(params: {
  buffer: Buffer;
  nomeArquivo?: string | null;
  mimeType?: string | null;
  nomeInformado?: string | null;
  dataVencimentoInformada?: Date | null;
  semValidade?: boolean;
  tenantCnpj?: string | null;
  telemetryContext?: Partial<LlmTelemetryContext>;
}): Promise<ResultadoInspecaoDocumentoCofre> {
  const agora = new Date();
  const mimeReal = detectarTipoRealPorBuffer(
    params.buffer,
    params.nomeArquivo,
    params.mimeType,
  );

  let textoExtraido = "";
  let pareceEscaneadoOuImagem = false;

  if (mimeReal === "application/pdf") {
    try {
      const pdfRes = await extrairTextoPdf(params.buffer);
      textoExtraido = pdfRes.texto;
      const charsLimpos = textoExtraido.replace(/\s+/g, "").length;
      if (charsLimpos / Math.max(1, pdfRes.totalPages) < 100) {
        pareceEscaneadoOuImagem = true;
      }
    } catch {
      pareceEscaneadoOuImagem = true;
    }
  } else if (mimeReal.includes("wordprocessingml")) {
    textoExtraido = await extrairTextoDocx(params.buffer);
  } else if (mimeReal.startsWith("image/")) {
    pareceEscaneadoOuImagem = true;
  } else if (mimeReal.startsWith("text/")) {
    textoExtraido = params.buffer.toString("utf-8");
  }

  let cnpjsEncontrados = extrairCnpjsDoTexto(textoExtraido);
  let { emissaoIso, vencimentoIso } = extrairDatasContextualizadas(textoExtraido);
  let tipoDetectado = detectarTipoDocumentoPorTexto(textoExtraido);
  let ocrLegivel = textoExtraido.replace(/\s+/g, "").length >= 25;
  let resumoLlm: string | null = null;

  // OCR / Interpretação Multimodal via Gemini/OpenAI quando é imagem, PDF escaneado ou faltaram dados-chave
  const precisaOcrOuEnriquecimento =
    pareceEscaneadoOuImagem ||
    !ocrLegivel ||
    cnpjsEncontrados.length === 0 ||
    (!vencimentoIso && !params.semValidade);

  if (
    precisaOcrOuEnriquecimento &&
    params.buffer.length <= 14 * 1024 * 1024 &&
    (mimeReal === "application/pdf" || mimeReal.startsWith("image/"))
  ) {
    const llmResp = await chamarLlmJsonMultimodal<{
      legivel?: boolean;
      tipoDocumento?: string | null;
      cnpjs?: string[];
      cnpjTitular?: string | null;
      dataEmissao?: string | null;
      dataVencimento?: string | null;
      resumo?: string | null;
    }>({
      systemPrompt:
        "Você é um auditor documental de licitações públicas (Lei 14.133/2021). Leia o documento/imagem em anexo com precisão (OCR) e extraia:\n" +
        '- "legivel": true/false\n' +
        '- "tipoDocumento": nome técnico identificado (ex: CRF/FGTS, Certidão de Falência, Atestado de Capacidade Técnica, CND Federal, etc.)\n' +
        '- "cnpjTitular": CNPJ principal do titular/favorecido no formato XX.XXX.XXX/XXXX-XX ou null\n' +
        '- "cnpjs": array com todos os CNPJs legíveis encontrados no documento\n' +
        '- "dataEmissao": YYYY-MM-DD ou null\n' +
        '- "dataVencimento": YYYY-MM-DD ou null\n' +
        '- "resumo": breve descrição em 1 frase do que foi lido no documento.\n' +
        "Retorne estritamente JSON válido.",
      userPrompt: JSON.stringify({
        nomeInformadoPeloUsuario: params.nomeInformado || params.nomeArquivo,
        textoDigitalPreliminar: textoExtraido.slice(0, 6000) || null,
      }),
      inlineParts: [
        {
          mimeType: mimeReal,
          dataBase64: params.buffer.toString("base64"),
          label: params.nomeArquivo || "documento",
        },
      ],
      timeoutMs: process.env.VITEST === "true" ? 3000 : 60000,
      telemetryContext: {
        ...(params.telemetryContext ?? {}),
        feature: "INSPECAO_COFRE",
      },
    });

    if (llmResp?.data) {
      if (llmResp.data.legivel !== false) {
        ocrLegivel = true;
      }
      if (!tipoDetectado && llmResp.data.tipoDocumento) {
        tipoDetectado = String(llmResp.data.tipoDocumento).trim();
      }
      const cnpjsLlm = [
        llmResp.data.cnpjTitular,
        ...(Array.isArray(llmResp.data.cnpjs) ? llmResp.data.cnpjs : []),
      ]
        .map((c) => normalizarDigitosCnpj(c))
        .filter((d) => d.length === 14);
      if (cnpjsLlm.length > 0) {
        cnpjsEncontrados = Array.from(new Set([...cnpjsLlm, ...cnpjsEncontrados]));
      }
      if (!emissaoIso && llmResp.data.dataEmissao) {
        emissaoIso = normalizarDataPtBrParaIso(llmResp.data.dataEmissao);
      }
      if (!vencimentoIso && llmResp.data.dataVencimento) {
        vencimentoIso = normalizarDataPtBrParaIso(llmResp.data.dataVencimento);
      }
      if (llmResp.data.resumo) {
        resumoLlm = String(llmResp.data.resumo).trim();
      }
    }
  }

  if (!ocrLegivel) {
    return {
      validacaoStatus: "ILEGIVEL",
      validacaoResumo:
        "Arquivo ilegível ou sem camada de texto selecionável (imagem/PDF escaneado sem OCR disponível no momento). Recomenda-se reenviar PDF original pesquisável.",
      cnpjExtraido: null,
      emissaoExtraida: null,
      vencimentoExtraido: null,
      tipoDetectado,
      validadoEm: agora,
    };
  }

  const tenantCnpjDigitos = normalizarDigitosCnpj(params.tenantCnpj);
  const cnpjMatched =
    tenantCnpjDigitos.length === 14 && cnpjsEncontrados.includes(tenantCnpjDigitos)
      ? tenantCnpjDigitos
      : cnpjsEncontrados[0] || null;
  const cnpjExtraidoFormatado = cnpjMatched ? formatarCnpjMascara(cnpjMatched) : null;

  const divergencias: string[] = [];

  // 1. Verificação de titularidade (CNPJ do anexo vs empresa ativa)
  if (
    tenantCnpjDigitos.length === 14 &&
    cnpjsEncontrados.length > 0 &&
    !cnpjsEncontrados.includes(tenantCnpjDigitos)
  ) {
    divergencias.push(
      `CNPJ no anexo (${formatarCnpjMascara(cnpjsEncontrados[0])}) diverge da empresa ativa (${formatarCnpjMascara(tenantCnpjDigitos)}).`,
    );
  }

  // 2. Verificação de validade declarada vs validade lida no anexo
  if (!params.semValidade && vencimentoIso && params.dataVencimentoInformada) {
    const informadaIso = new Date(params.dataVencimentoInformada)
      .toISOString()
      .slice(0, 10);
    if (diffDiasIso(vencimentoIso, informadaIso) > 2) {
      divergencias.push(
        `Validade lida no anexo (${formatIsoParaPtBr(vencimentoIso)}) diverge da data cadastrada (${formatIsoParaPtBr(informadaIso)}).`,
      );
    }
  }

  // 3. Verificação se o documento físico já consta vencido
  if (!params.semValidade && vencimentoIso) {
    const hojeIso = agora.toISOString().slice(0, 10);
    if (vencimentoIso < hojeIso) {
      divergencias.push(
        `O documento anexo indica vencimento expirado em ${formatIsoParaPtBr(vencimentoIso)}.`,
      );
    }
  }

  if (divergencias.length > 0) {
    return {
      validacaoStatus: "DIVERGENTE",
      validacaoResumo: divergencias.join(" "),
      cnpjExtraido: cnpjExtraidoFormatado,
      emissaoExtraida: emissaoIso,
      vencimentoExtraido: vencimentoIso,
      tipoDetectado,
      validadoEm: agora,
    };
  }

  const partesResumo: string[] = [
    tipoDetectado
      ? `Anexo validado (${tipoDetectado})`
      : "Conteúdo do anexo lido e validado",
  ];
  if (cnpjExtraidoFormatado) {
    partesResumo.push(`CNPJ ${cnpjExtraidoFormatado}`);
  }
  if (vencimentoIso) {
    partesResumo.push(`validade ${formatIsoParaPtBr(vencimentoIso)}`);
  } else if (resumoLlm) {
    partesResumo.push(resumoLlm);
  }

  return {
    validacaoStatus: "VALIDADO",
    validacaoResumo: `${partesResumo.join(" • ")}.`,
    cnpjExtraido: cnpjExtraidoFormatado,
    emissaoExtraida: emissaoIso,
    vencimentoExtraido: vencimentoIso,
    tipoDetectado,
    validadoEm: agora,
  };
}


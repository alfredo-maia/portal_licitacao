import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { prisma } from "@/lib/prisma";
import { obterObjetoR2 } from "@/server/storage/r2-storage.service";
import { listInMemoryLicitacaoArquivos } from "./licitacoes-store";
import { buscarESincronizarArquivosEditalPncp } from "./oportunidades.service";
import type { LlmInlinePart } from "./llm-multimodal.service";

export interface PlanilhaExtraida {
  arquivoNome: string;
  aba: string;
  linhas: string[][];
}

export interface DocumentoLidoResumo {
  nome: string;
  origem: "BANCO" | "PNCP" | "R2" | "UPLOAD_LOCAL" | "ZIP_INTERNO";
  mimeType: string;
  prioridade: number;
  tamanhoBytes: number;
  totalPaginas?: number;
  charsTexto: number;
  escaneadoOuImagem: boolean;
  aviso?: string;
}

export interface ResultadoLeituraDocumentosCertame {
  documentosLidos: DocumentoLidoResumo[];
  textoConsolidado: string;
  planilhas: PlanilhaExtraida[];
  anexosBinariosMultimodais: LlmInlinePart[];
  avisos: string[];
}

const MAX_BYTES_ARQUIVO = 25 * 1024 * 1024;
const MAX_BYTES_MULTIMODAL = 14 * 1024 * 1024;
const MAX_TOTAL_MULTIMODAL_BYTES = 28 * 1024 * 1024;
const MAX_ENTRADAS_ZIP = 25;
const MAX_BYTES_ZIP_DESCOMPACTADO = 50 * 1024 * 1024;
const MAX_CHARS_TEXTO_CONSOLIDADO = 160_000;

export function classificarPrioridadeDocumento(nome: string): number {
  const n = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (
    /termo.?de.?referencia|\btr\b|planilha|relacao.*itens|lista.*itens|anexo.?i\b|orcamento|cotacao|especificac|quantitativo/.test(
      n,
    )
  ) {
    return 100;
  }
  if (/edital|pregao|concorrencia|dispensa|chamamento|tomada/.test(n)) {
    return 75;
  }
  if (/anexo|etp|estudo.?tecnico|minuta|projeto|memorial/.test(n)) {
    return 60;
  }
  return 40;
}

export function detectarTipoRealPorBuffer(
  buffer: Buffer,
  nomeArquivo?: string | null,
  mimeHint?: string | null,
): string {
  if (buffer.length >= 4) {
    if (
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46
    ) {
      return "application/pdf";
    }
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return "image/jpeg";
    }
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    ) {
      return "image/png";
    }
    if (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP"
    ) {
      return "image/webp";
    }
    if (
      buffer[0] === 0xd0 &&
      buffer[1] === 0xcf &&
      buffer[2] === 0x11 &&
      buffer[3] === 0xe0
    ) {
      const lower = (nomeArquivo || "").toLowerCase();
      return lower.endsWith(".doc")
        ? "application/msword"
        : "application/vnd.ms-excel";
    }
    if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
      const lower = (nomeArquivo || "").toLowerCase();
      if (lower.endsWith(".xlsx")) {
        return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      }
      if (lower.endsWith(".docx")) {
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      }
      if (lower.endsWith(".zip")) {
        return "application/zip";
      }
      return "application/zip-or-office";
    }
  }

  const lower = (nomeArquivo || "").toLowerCase();
  if (lower.endsWith(".csv")) return "text/csv";
  if (lower.endsWith(".txt")) return "text/plain";
  if (lower.endsWith(".xml")) return "application/xml";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html";
  if (lower.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".zip")) return "application/zip";

  if (mimeHint && mimeHint !== "application/octet-stream") {
    return mimeHint;
  }

  const head = buffer
    .subarray(0, 512)
    .toString("utf-8")
    .replace(/^\uFEFF/, "")
    .trimStart();
  if (
    head &&
    !head.toLowerCase().startsWith("<html") &&
    !head.toLowerCase().startsWith("<!doctype html") &&
    (/^<\?xml\b/i.test(head) || /^<[a-zA-Z_][\w:-]*(?:\s|>)/.test(head))
  ) {
    return "application/xml";
  }
  if ((head.startsWith("{") || head.startsWith("[")) && buffer.length <= 2 * 1024 * 1024) {
    try {
      JSON.parse(buffer.toString("utf-8").replace(/^\uFEFF/, ""));
      return "application/json";
    } catch {}
  }

  return mimeHint || "application/octet-stream";
}

async function resolverMimeOfficeOuZip(
  buffer: Buffer,
  nomeArquivo: string,
  mimeDetectado: string,
): Promise<string> {
  if (mimeDetectado !== "application/zip-or-office") return mimeDetectado;
  try {
    const zip = await JSZip.loadAsync(buffer);
    if (zip.file(/^xl\//i).length > 0) {
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    }
    if (zip.file(/^word\//i).length > 0) {
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }
    return "application/zip";
  } catch {
    return nomeArquivo.toLowerCase().endsWith(".xlsx")
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : "application/zip";
  }
}

export async function extrairTextoPdf(
  buffer: Buffer,
): Promise<{ paginas: string[]; texto: string; totalPages: number }> {
  const { extractText } = await import("unpdf");
  const res = await extractText(new Uint8Array(buffer), { mergePages: false });
  const paginas = Array.isArray(res.text)
    ? res.text.map((p) => String(p || "").trim())
    : [String(res.text || "").trim()];
  const texto = paginas
    .map((p, idx) => (p ? `[Página ${idx + 1}]\n${p}` : ""))
    .filter(Boolean)
    .join("\n\n");
  return {
    paginas,
    texto,
    totalPages: res.totalPages || paginas.length,
  };
}

export async function extrairTextoDocx(buffer: Buffer): Promise<string> {
  try {
    const mammoth = await import("mammoth");
    const res = await mammoth.extractRawText({ buffer });
    if (res?.value && res.value.trim()) {
      return res.value.trim();
    }
  } catch {
    // segue para fallback XML
  }

  try {
    const zip = await JSZip.loadAsync(buffer);
    const xmlFile = zip.file("word/document.xml");
    if (!xmlFile) return "";
    const xml = await xmlFile.async("string");
    return xml
      .replace(/<\/w:p>/g, "\n")
      .replace(/<\/w:tc>/g, " | ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return "";
  }
}

export async function extrairPlanilhaBuffer(
  buffer: Buffer,
  arquivoNome: string,
): Promise<{ texto: string; planilhas: PlanilhaExtraida[] }> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "buffer", raw: false });
  const planilhas: PlanilhaExtraida[] = [];
  const blocos: string[] = [];

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const rawRows = XLSX.utils.sheet_to_json<any[]>(sheet, {
      header: 1,
      defval: "",
      blankrows: false,
    });
    const linhas = rawRows
      .map((row) =>
        Array.isArray(row) ? row.map((c) => String(c ?? "").trim()) : [],
      )
      .filter((row) => row.some((c) => c.length > 0));

    if (linhas.length === 0) continue;

    planilhas.push({ arquivoNome, aba: sheetName, linhas });
    const textoAba = linhas
      .slice(0, 600)
      .map((row) => row.join(" | "))
      .join("\n");
    blocos.push(`=== PLANILHA: ${arquivoNome} [Aba: ${sheetName}] ===\n${textoAba}`);
  }

  return {
    texto: blocos.join("\n\n"),
    planilhas,
  };
}

function selecionarTrechosRelevantesTexto(
  textoCompleto: string,
  limiteChars: number,
): string {
  if (textoCompleto.length <= limiteChars) {
    return textoCompleto;
  }

  const paginas = textoCompleto.split(/(?=\[Página \d+\])/);
  if (paginas.length <= 1) {
    const head = Math.floor(limiteChars * 0.45);
    const tail = limiteChars - head;
    return `${textoCompleto.slice(0, head)}\n\n[... trecho intermediário omitido ...]\n\n${textoCompleto.slice(-tail)}`;
  }

  const regexItemizado =
    /termo\s+de\s+refer[eê]ncia|especifica[çc][aã]o|descri[çc][aã]o|quant(?:idade|\.)?|unid(?:ade)?\.?|valor\s+(?:unit|est|ref|total)|lote|item|catmat|catser|habilita[çc][aã]o|atestado|qualifica[çc][aã]o|certid[aã]o|entrega|prazo|garantia|amostra|pagamento|multa|san[çc][aã]o/i;

  const escolhidas = new Set<number>();
  let charsAcumulados = 0;

  // 1. Primeiras páginas (cabeçalho/objeto)
  for (let i = 0; i < Math.min(4, paginas.length); i++) {
    if (charsAcumulados + paginas[i].length > limiteChars * 0.25) break;
    escolhidas.add(i);
    charsAcumulados += paginas[i].length;
  }

  // 2. Páginas contendo tabelas de itens, TR ou regras de habilitação
  for (let i = 0; i < paginas.length; i++) {
    if (escolhidas.has(i)) continue;
    if (regexItemizado.test(paginas[i])) {
      if (charsAcumulados + paginas[i].length > limiteChars) continue;
      escolhidas.add(i);
      charsAcumulados += paginas[i].length;
    }
  }

  // 3. Preenche eventual folga com páginas restantes em ordem
  for (let i = 0; i < paginas.length; i++) {
    if (escolhidas.has(i)) continue;
    if (charsAcumulados + paginas[i].length > limiteChars) continue;
    escolhidas.add(i);
    charsAcumulados += paginas[i].length;
  }

  const indicesOrdenados = Array.from(escolhidas).sort((a, b) => a - b);
  return indicesOrdenados.map((idx) => paginas[idx]).join("\n\n");
}

function resolverCaminhoLocalSeguro(caminhoRaw?: string | null): string | null {
  if (!caminhoRaw || caminhoRaw.startsWith("http")) return null;
  const limpo = caminhoRaw.replace(/^\/+/, "");
  const bases = [
    "/data/uploads",
    path.join(process.cwd(), "public"),
    process.cwd(),
  ];

  for (const base of bases) {
    const candidato = path.resolve(base, limpo);
    if (!candidato.startsWith(path.resolve(base))) continue;
    if (existsSync(candidato)) return candidato;
  }
  return null;
}

async function carregarBufferArquivo(
  licitacaoId: string,
  arquivo: any,
): Promise<{ buffer: Buffer; origem: DocumentoLidoResumo["origem"] } | null> {
  // 1. Cloudflare R2
  const chavesR2 = Array.from(
    new Set(
      [
        arquivo.r2Key,
        arquivo.caminho && !String(arquivo.caminho).startsWith("http")
          ? String(arquivo.caminho)
          : null,
        `editais/${licitacaoId}/${arquivo.nome}`,
      ].filter(Boolean) as string[],
    ),
  );

  for (const chave of chavesR2) {
    try {
      const r2 = await obterObjetoR2(chave);
      if (r2?.buffer && r2.buffer.length > 0 && r2.buffer.length <= MAX_BYTES_ARQUIVO) {
        return { buffer: r2.buffer, origem: "R2" };
      }
    } catch {
      // continua para próxima fonte
    }
  }

  // 2. Disco local (/data/uploads ou public/uploads)
  const caminhoLocal = resolverCaminhoLocalSeguro(arquivo.caminho || arquivo.arquivoUrl);
  if (caminhoLocal) {
    try {
      const buf = await readFile(caminhoLocal);
      if (buf.length > 0 && buf.length <= MAX_BYTES_ARQUIVO) {
        return { buffer: buf, origem: "UPLOAD_LOCAL" };
      }
    } catch {
      // continua
    }
  }

  // 3. URL pública remota (PNCP / portal de compras)
  const urlRemota = [arquivo.r2Url, arquivo.caminho].find(
    (u) =>
      typeof u === "string" &&
      u.startsWith("http") &&
      !u.includes("docs.licitacao.internal") &&
      !u.includes("localhost"),
  );

  if (urlRemota) {
    const isTest = process.env.VITEST === "true" || process.env.NODE_ENV === "test";
    const timeout = isTest ? 1200 : 25000;
    try {
      const res = await fetch(urlRemota, {
        headers: { accept: "*/*" },
        redirect: "follow",
        signal: AbortSignal.timeout(timeout),
      });
      if (!res?.ok) return null;

      const contentType = res.headers?.get?.("content-type") || "";
      const ab = await res.arrayBuffer();
      const buf = Buffer.from(ab);
      if (buf.length === 0 || buf.length > MAX_BYTES_ARQUIVO) return null;

      // Evita interpretar página de erro HTML como arquivo binário esperado
      if (
        contentType.includes("text/html") &&
        /\.(pdf|xlsx?|docx?|zip|png|jpe?g|xml|json)$/i.test(String(arquivo.nome || ""))
      ) {
        const snippet = buf.subarray(0, 300).toString("utf-8").toLowerCase();
        if (snippet.includes("<html") && !snippet.includes("termo") && !snippet.includes("item")) {
          return null;
        }
      }

      return { buffer: buf, origem: "PNCP" };
    } catch {
      return null;
    }
  }

  return null;
}

async function processarBufferRecursivo(
  params: {
    buffer: Buffer;
    nome: string;
    mimeHint?: string | null;
    origem: DocumentoLidoResumo["origem"];
    profundidade?: number;
  },
  acumulador: {
    documentosLidos: DocumentoLidoResumo[];
    blocosTexto: Array<{ prioridade: number; nome: string; texto: string }>;
    planilhas: PlanilhaExtraida[];
    anexosBinariosMultimodais: Array<{ part: LlmInlinePart; bytes: number; prioridade: number }>;
    avisos: string[];
  },
): Promise<void> {
  const { buffer, nome, mimeHint, origem, profundidade = 0 } = params;
  const detectadoInicial = detectarTipoRealPorBuffer(buffer, nome, mimeHint);
  const mimeType = await resolverMimeOfficeOuZip(buffer, nome, detectadoInicial);
  const prioridade = classificarPrioridadeDocumento(nome);

  // 1. Arquivo ZIP — descompacta recursivamente
  if (mimeType === "application/zip") {
    if (profundidade >= 2) {
      acumulador.avisos.push(`ZIP aninhado excedeu profundidade máxima: ${nome}`);
      return;
    }
    try {
      const zip = await JSZip.loadAsync(buffer);
      const entries = Object.values(zip.files).filter(
        (entry) =>
          !entry.dir &&
          !entry.name.startsWith("__MACOSX/") &&
          !path.basename(entry.name).startsWith("~$"),
      );

      let totalDescompactado = 0;
      const entradasValidas = entries.slice(0, MAX_ENTRADAS_ZIP);
      if (entries.length > MAX_ENTRADAS_ZIP) {
        acumulador.avisos.push(
          `O pacote ${nome} continha ${entries.length} arquivos; foram processados os primeiros ${MAX_ENTRADAS_ZIP}.`,
        );
      }

      for (const entry of entradasValidas) {
        try {
          const entryBuf = await entry.async("nodebuffer");
          totalDescompactado += entryBuf.length;
          if (totalDescompactado > MAX_BYTES_ZIP_DESCOMPACTADO) {
            acumulador.avisos.push(`Limite de descompactação (50 MB) atingido em ${nome}.`);
            break;
          }
          await processarBufferRecursivo(
            {
              buffer: entryBuf,
              nome: `${nome}/${path.basename(entry.name)}`,
              origem: "ZIP_INTERNO",
              profundidade: profundidade + 1,
            },
            acumulador,
          );
        } catch {
          // ignora entrada corrompida individual
        }
      }
      return;
    } catch {
      acumulador.avisos.push(`Não foi possível abrir o arquivo ZIP ${nome}.`);
      return;
    }
  }

  // 2. Planilhas Excel / CSV
  if (
    mimeType.includes("spreadsheet") ||
    mimeType.includes("ms-excel") ||
    mimeType === "text/csv"
  ) {
    try {
      const { texto, planilhas } = await extrairPlanilhaBuffer(buffer, nome);
      acumulador.planilhas.push(...planilhas);
      if (texto) {
        acumulador.blocosTexto.push({ prioridade: prioridade + 25, nome, texto });
      }
      acumulador.documentosLidos.push({
        nome,
        origem,
        mimeType,
        prioridade: prioridade + 25,
        tamanhoBytes: buffer.length,
        charsTexto: texto.length,
        escaneadoOuImagem: false,
      });
    } catch {
      acumulador.avisos.push(`Falha ao ler planilha ${nome}.`);
    }
    return;
  }

  // 3. Documento Word (.docx)
  if (mimeType.includes("wordprocessingml")) {
    try {
      const texto = await extrairTextoDocx(buffer);
      if (texto) {
        acumulador.blocosTexto.push({
          prioridade,
          nome,
          texto: `=== DOCUMENTO WORD: ${nome} ===\n${texto}`,
        });
      }
      acumulador.documentosLidos.push({
        nome,
        origem,
        mimeType,
        prioridade,
        tamanhoBytes: buffer.length,
        charsTexto: texto.length,
        escaneadoOuImagem: false,
      });
    } catch {
      acumulador.avisos.push(`Falha ao ler arquivo Word ${nome}.`);
    }
    return;
  }

  // 4. PDF (texto nativo + detecção de PDF escaneado)
  if (mimeType === "application/pdf") {
    let texto = "";
    let totalPages = 1;
    try {
      const resPdf = await extrairTextoPdf(buffer);
      texto = resPdf.texto;
      totalPages = resPdf.totalPages || 1;
    } catch {
      // PDF protegido ou baseado apenas em imagem -> tenta multimodal
    }

    const charsSemEspaco = texto.replace(/\s+/g, "").length;
    const mediaPorPagina = charsSemEspaco / Math.max(1, totalPages);
    const pareceEscaneado = mediaPorPagina < 120;

    if (texto.trim()) {
      acumulador.blocosTexto.push({
        prioridade,
        nome,
        texto: `=== DOCUMENTO PDF: ${nome} (${totalPages} página(s)) ===\n${texto}`,
      });
    }

    if (pareceEscaneado && buffer.length <= MAX_BYTES_MULTIMODAL) {
      acumulador.anexosBinariosMultimodais.push({
        prioridade,
        bytes: buffer.length,
        part: {
          mimeType: "application/pdf",
          dataBase64: buffer.toString("base64"),
          label: nome,
        },
      });
    } else if (pareceEscaneado && buffer.length > MAX_BYTES_MULTIMODAL) {
      acumulador.avisos.push(
        `O PDF ${nome} parece escaneado e excede 14 MB (${(buffer.length / (1024 * 1024)).toFixed(1)} MB) para OCR multimodal direto.`,
      );
    }

    acumulador.documentosLidos.push({
      nome,
      origem,
      mimeType,
      prioridade,
      tamanhoBytes: buffer.length,
      totalPaginas: totalPages,
      charsTexto: texto.length,
      escaneadoOuImagem: pareceEscaneado,
    });
    return;
  }

  // 5. Imagens (JPG, PNG, WEBP) -> envio multimodal para OCR/Visão
  if (mimeType.startsWith("image/")) {
    if (buffer.length <= MAX_BYTES_MULTIMODAL) {
      acumulador.anexosBinariosMultimodais.push({
        prioridade,
        bytes: buffer.length,
        part: {
          mimeType,
          dataBase64: buffer.toString("base64"),
          label: nome,
        },
      });
    } else {
      acumulador.avisos.push(`A imagem ${nome} excede 14 MB e não foi enviada para OCR.`);
    }
    acumulador.documentosLidos.push({
      nome,
      origem,
      mimeType,
      prioridade,
      tamanhoBytes: buffer.length,
      charsTexto: 0,
      escaneadoOuImagem: true,
    });
    return;
  }

  // 6. Arquivos estruturados XML e JSON (atas, catálogos PNCP, relações de itens)
  if (mimeType === "application/xml" || mimeType === "text/xml") {
    const raw = buffer.toString("utf-8").replace(/^\uFEFF/, "");
    const limpo = raw
      .replace(/<\?[\s\S]*?\?>/g, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, " $1 ")
      .replace(/<\/(?:item|row|registro|produto|lote|tr|li|p)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s+/g, "\n")
      .trim();
    if (limpo) {
      acumulador.blocosTexto.push({
        prioridade,
        nome,
        texto: `=== DOCUMENTO XML: ${nome} ===\n${limpo}`,
      });
    }
    acumulador.documentosLidos.push({
      nome,
      origem,
      mimeType,
      prioridade,
      tamanhoBytes: buffer.length,
      charsTexto: limpo.length,
      escaneadoOuImagem: false,
    });
    return;
  }

  if (mimeType === "application/json") {
    const raw = buffer.toString("utf-8").replace(/^\uFEFF/, "").trim();
    let textoJson = raw;
    try {
      const parsed = JSON.parse(raw);
      textoJson = JSON.stringify(parsed, null, 2);
    } catch {
      // mantém texto bruto se JSON for parcial
    }
    if (textoJson) {
      acumulador.blocosTexto.push({
        prioridade,
        nome,
        texto: `=== DOCUMENTO JSON: ${nome} ===\n${textoJson}`,
      });
    }
    acumulador.documentosLidos.push({
      nome,
      origem,
      mimeType,
      prioridade,
      tamanhoBytes: buffer.length,
      charsTexto: textoJson.length,
      escaneadoOuImagem: false,
    });
    return;
  }

  // 7. Texto puro / HTML
  if (mimeType.startsWith("text/")) {
    const raw = buffer.toString("utf-8");
    const limpo = mimeType === "text/html"
      ? raw.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
      : raw.trim();
    if (limpo) {
      acumulador.blocosTexto.push({
        prioridade,
        nome,
        texto: `=== DOCUMENTO TEXTO: ${nome} ===\n${limpo}`,
      });
    }
    acumulador.documentosLidos.push({
      nome,
      origem,
      mimeType,
      prioridade,
      tamanhoBytes: buffer.length,
      charsTexto: limpo.length,
      escaneadoOuImagem: false,
    });
  }
}

export async function listarArquivosDaLicitacao(
  licitacaoId: string,
  sincronizarPncpSeVazio = true,
): Promise<any[]> {
  let arquivosDb: any[] = [];
  try {
    arquivosDb = await prisma.arquivo.findMany({
      where: { licitacaoId },
      orderBy: { criadoEm: "asc" },
    });
  } catch {
    arquivosDb = [];
  }

  const memoria = listInMemoryLicitacaoArquivos(licitacaoId);
  const mapa = new Map<string, any>();

  for (const arq of [...arquivosDb, ...memoria]) {
    const chave = String(arq.r2Url || arq.caminho || arq.id || arq.nome);
    if (!mapa.has(chave)) {
      mapa.set(chave, arq);
    }
  }

  let lista = Array.from(mapa.values());

  if (lista.length === 0 && sincronizarPncpSeVazio) {
    try {
      const sync = await buscarESincronizarArquivosEditalPncp(licitacaoId);
      if (Array.isArray(sync.arquivos) && sync.arquivos.length > 0) {
        lista = sync.arquivos;
      }
    } catch {
      // PNCP indisponível ou licitação sem idPncp
    }
  }

  return lista;
}

/**
 * Baixa, descompacta e extrai texto/tabelas/anexos multimodais de TODOS os arquivos
 * vinculados a uma licitação (Edital, Termo de Referência, Anexos, Planilhas e ZIPs).
 */
export async function lerDocumentosCertame(
  licitacaoId: string,
  options?: {
    sincronizarPncpSeVazio?: boolean;
    maxCharsConsolidado?: number;
  },
): Promise<ResultadoLeituraDocumentosCertame> {
  const arquivos = await listarArquivosDaLicitacao(
    licitacaoId,
    options?.sincronizarPncpSeVazio ?? true,
  );

  const acumulador = {
    documentosLidos: [] as DocumentoLidoResumo[],
    blocosTexto: [] as Array<{ prioridade: number; nome: string; texto: string }>,
    planilhas: [] as PlanilhaExtraida[],
    anexosBinariosMultimodais: [] as Array<{ part: LlmInlinePart; bytes: number; prioridade: number }>,
    avisos: [] as string[],
  };

  if (arquivos.length === 0) {
    return {
      documentosLidos: [],
      textoConsolidado: "",
      planilhas: [],
      anexosBinariosMultimodais: [],
      avisos: ["Nenhum arquivo anexado ou disponível no PNCP para este certame."],
    };
  }

  // Ordena para baixar os arquivos mais relevantes primeiro e processa em lotes de 4
  const ordenados = [...arquivos].sort(
    (a, b) => classificarPrioridadeDocumento(String(b.nome || "")) - classificarPrioridadeDocumento(String(a.nome || "")),
  );

  const TAMANHO_LOTE = 4;
  for (let i = 0; i < ordenados.length; i += TAMANHO_LOTE) {
    const lote = ordenados.slice(i, i + TAMANHO_LOTE);
    await Promise.all(
      lote.map(async (arq) => {
        const carregado = await carregarBufferArquivo(licitacaoId, arq);
        if (!carregado) {
          acumulador.avisos.push(`Não foi possível obter os bytes do arquivo "${arq.nome}".`);
          return;
        }
        await processarBufferRecursivo(
          {
            buffer: carregado.buffer,
            nome: String(arq.nome || "documento.pdf"),
            mimeHint: arq.mimeType,
            origem: carregado.origem,
          },
          acumulador,
        );
      }),
    );
  }

  // Consolida texto respeitando prioridade (TR / Planilhas > Edital > Outros) e limite
  const limiteTotal = options?.maxCharsConsolidado ?? MAX_CHARS_TEXTO_CONSOLIDADO;
  const blocosOrdenados = [...acumulador.blocosTexto].sort(
    (a, b) => b.prioridade - a.prioridade,
  );

  let charsRestantes = limiteTotal;
  const textosFinais: string[] = [];
  for (let i = 0; i < blocosOrdenados.length; i++) {
    const bloco = blocosOrdenados[i];
    if (charsRestantes <= 500) break;
    const docsRestantes = Math.max(1, blocosOrdenados.length - i);
    const quotaSugerida =
      i === 0
        ? Math.min(charsRestantes, Math.max(Math.floor(limiteTotal * 0.65), Math.floor(charsRestantes / docsRestantes)))
        : Math.min(charsRestantes, Math.max(25_000, Math.floor(charsRestantes / docsRestantes)));
    const trecho = selecionarTrechosRelevantesTexto(bloco.texto, quotaSugerida);
    textosFinais.push(trecho);
    charsRestantes -= trecho.length;
  }

  // Limita anexos multimodais totais a 28 MB priorizando TR/Anexos/Imagens relevantes
  const multimodaisOrdenados = [...acumulador.anexosBinariosMultimodais].sort(
    (a, b) => b.prioridade - a.prioridade,
  );
  const partsFinais: LlmInlinePart[] = [];
  let bytesMultimodais = 0;
  for (const item of multimodaisOrdenados) {
    if (bytesMultimodais + item.bytes > MAX_TOTAL_MULTIMODAL_BYTES) continue;
    partsFinais.push(item.part);
    bytesMultimodais += item.bytes;
  }

  return {
    documentosLidos: acumulador.documentosLidos,
    textoConsolidado: textosFinais.join("\n\n"),
    planilhas: acumulador.planilhas,
    anexosBinariosMultimodais: partsFinais,
    avisos: acumulador.avisos,
  };
}


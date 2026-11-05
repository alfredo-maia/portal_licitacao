import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { RbacUser } from "@/lib/rbac";
import { recordAuditLog } from "@/server/audit";
import {
  type CotaMensalAnaliseIA,
  type ItemDisputaEdital,
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
  buscarESincronizarArquivosEditalPncp,
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
      size: 12,
      text: "RAIO-X DE EDITAL & ATA (IA) - RELATORIO EXECUTIVO DE PARTICIPACAO E VIABILIDADE",
    },
    {
      bold: false,
      size: 8.5,
      text: `Gerado em: ${dataGeracao} (America/Sao_Paulo) | Dossiê Analítico Executivo`,
    },
    { text: "----------------------------------------------------------------------------------------" },
    { bold: true, size: 10.5, text: "1. IDENTIFICACAO DO CERTAME E DA EMPRESA LICITANTE" },
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
      text: `Segmento: ${r.segmentoIdentificado || "Geral"}`,
    },
    { text: "----------------------------------------------------------------------------------------" },
    {
      bold: true,
      size: 11,
      text: `2. VEREDITO DE HABILITACAO DOCUMENTAL: ${labelParecer} (SCORE: ${r.scoreAderencia}/100)`,
    },
    ...quebrarLinhasPdf(r.resumoExecutivo, 86).map((t) => ({ text: t })),
    ...quebrarLinhasPdf(`Status da Habilitacao: ${r.habilitacao?.status || r.parecer} - ${r.habilitacao?.resumo || ""}`, 86).map((t) => ({ text: t })),
  ];

  if (r.habilitacao?.certidoesRegulares?.length) {
    blocos.push({ bold: true, size: 9, text: "Certidoes Regulares Cadastradas (/documentacao):" });
    for (const c of r.habilitacao.certidoesRegulares) {
      for (const l of quebrarLinhasPdf(`[OK] ${c}`, 86)) blocos.push({ text: l });
    }
  }

  if (r.habilitacao?.certidoesVencidasOuPendentes?.length) {
    blocos.push({ bold: true, size: 9, text: "Certidoes Vencidas ou Pendentes de Renovacao:" });
    for (const c of r.habilitacao.certidoesVencidasOuPendentes) {
      for (const l of quebrarLinhasPdf(`[ATENCAO] ${c}`, 86)) blocos.push({ text: l });
    }
  }

  if (r.habilitacao?.atestadosExigidos?.length) {
    blocos.push({ bold: true, size: 9, text: "Atestados Tecnicos Exigidos pelo Certame:" });
    for (const a of r.habilitacao.atestadosExigidos) {
      for (const l of quebrarLinhasPdf(`• ${a}`, 86)) blocos.push({ text: l });
    }
  }

  if (r.habilitacao?.exigenciasEspeciais?.length) {
    blocos.push({ bold: true, size: 9, text: "Exigencias Especiais (Vistoria, Registro em Conselho):" });
    for (const e of r.habilitacao.exigenciasEspeciais) {
      for (const l of quebrarLinhasPdf(`• ${e}`, 86)) blocos.push({ text: l });
    }
  }

  blocos.push(
    { text: "----------------------------------------------------------------------------------------" },
    { bold: true, size: 10.5, text: "3. CRONOGRAMA, PRAZOS POS-ASSINATURA E LOCALIZACAO FISICA" },
    { text: `Previsao de Inicio dos Servicos/Fornecimento: ${r.cronograma?.dataPrevisaoInicio || "Apos homologacao contratual"}` },
    ...quebrarLinhasPdf(`Inicio dos Pedidos apos Assinatura: ${r.cronograma?.prazoInicioPedidosAposAssinatura || "Conforme emissao de OS/OF"}`, 86).map((t) => ({ text: t })),
    ...quebrarLinhasPdf(`Prazo de Execucao/Entrega: ${r.cronograma?.prazoEntregaExecucao || "Conforme Termo de Referencia"}`, 86).map((t) => ({ text: t })),
    ...quebrarLinhasPdf(`Endereco Fisico de Entrega/Execucao: ${r.cronograma?.enderecoExecucaoOuEntrega || "Definido no Edital"}`, 86).map((t) => ({ text: t })),
    { text: `Certame/Execucao Presencial: ${r.cronograma?.isPresencial ? "SIM (Requer presenca fisica no local)" : "NAO (100% Eletronico / Remoto)"}` },
  );

  if (r.cronograma?.observacoesLogistica) {
    for (const l of quebrarLinhasPdf(`Observacoes Logisticas: ${r.cronograma.observacoesLogistica}`, 86)) {
      blocos.push({ text: l });
    }
  }

  blocos.push(
    { text: "----------------------------------------------------------------------------------------" },
    { bold: true, size: 10.5, text: `4. ITENS EM DISPUTA E MARCAS EXIGIDAS (${r.itens?.totalItens ?? 1} item/lote)` },
  );

  if (r.itens?.destaqueMarcasExigidas?.length) {
    blocos.push({ bold: true, size: 9.5, text: "MARCAS OU MODELOS EXIGIDOS / HOMOLOGADOS NO EDITAL:" });
    for (const m of r.itens.destaqueMarcasExigidas) {
      for (const l of quebrarLinhasPdf(`★ ${m}`, 86)) blocos.push({ text: l });
    }
  } else {
    blocos.push({ text: "Marcas: Nao ha exigencia exclusiva de marca no edital (padrao ampla concorrencia)." });
  }

  if (r.itens?.lista && r.itens.lista.length > 0) {
    blocos.push({ bold: true, size: 9, text: "Detalhamento dos Itens / Lotes:" });
    for (const it of r.itens.lista.slice(0, 10)) {
      const vUnit = it.valorUnitarioEstimado ? ` | Unit: R$ ${it.valorUnitarioEstimado.toFixed(2)}` : "";
      const vTot = it.valorTotalEstimado ? ` | Tot: R$ ${it.valorTotalEstimado.toFixed(2)}` : "";
      const marca = it.marcaExigidaOuReferencia ? ` | Marca: ${it.marcaExigidaOuReferencia}` : "";
      for (const l of quebrarLinhasPdf(
        `Item ${it.numeroItem}${it.lote ? ` (Lote ${it.lote})` : ""}: ${it.descricao} - Qtd: ${it.quantidade} ${it.unidadeMedida || "UN"}${vUnit}${vTot}${marca}`,
        86,
      )) {
        blocos.push({ text: l });
      }
    }
  }

  blocos.push(
    { text: "----------------------------------------------------------------------------------------" },
    { bold: true, size: 10.5, text: "5. RISCOS CONTRATUAIS, MULTAS E FLUXO FINANCEIRO" },
    { text: `Nivel de Risco Geral: ${r.riscos?.nivelRiscoGeral || "MEDIO"}` },
    ...quebrarLinhasPdf(`Prazo de Pagamento do Orgao: ${r.riscos?.prazoPagamentoOrgao || "Ate 30 dias apos atesto da NF"}`, 86).map((t) => ({ text: t })),
    ...quebrarLinhasPdf(`Garantia Contratual: ${r.riscos?.exigenciaGarantiaContratual || "Conforme minuta contratual (5% do valor)"}`, 86).map((t) => ({ text: t })),
  );

  if (r.riscos?.clausulasPenalidadesMultas?.length) {
    blocos.push({ bold: true, size: 9, text: "Clausulas de Penalidades e Multas por Atraso:" });
    for (const p of r.riscos.clausulasPenalidadesMultas) {
      for (const l of quebrarLinhasPdf(`• ${p}`, 86)) blocos.push({ text: l });
    }
  }

  if (r.riscos?.riscosFinanceirosIdentificados?.length) {
    blocos.push({ bold: true, size: 9, text: "Riscos Financeiros Identificados:" });
    for (const rf of r.riscos.riscosFinanceirosIdentificados) {
      for (const l of quebrarLinhasPdf(`• ${rf}`, 86)) blocos.push({ text: l });
    }
  }

  blocos.push(
    { text: "----------------------------------------------------------------------------------------" },
    { bold: true, size: 10.5, text: "6. MATRIZ SWOT DA OPORTUNIDADE" },
  );

  if (r.swot?.forcas?.length) {
    blocos.push({ bold: true, size: 9, text: "[FORCAS]:" });
    for (const f of r.swot.forcas) {
      for (const l of quebrarLinhasPdf(`+ ${f}`, 86)) blocos.push({ text: l });
    }
  }
  if (r.swot?.fraquezas?.length) {
    blocos.push({ bold: true, size: 9, text: "[FRAQUEZAS]:" });
    for (const f of r.swot.fraquezas) {
      for (const l of quebrarLinhasPdf(`- ${f}`, 86)) blocos.push({ text: l });
    }
  }
  if (r.swot?.oportunidades?.length) {
    blocos.push({ bold: true, size: 9, text: "[OPORTUNIDADES]:" });
    for (const o of r.swot.oportunidades) {
      for (const l of quebrarLinhasPdf(`* ${o}`, 86)) blocos.push({ text: l });
    }
  }
  if (r.swot?.ameacas?.length) {
    blocos.push({ bold: true, size: 9, text: "[AMEACAS]:" });
    for (const a of r.swot.ameacas) {
      for (const l of quebrarLinhasPdf(`! ${a}`, 86)) blocos.push({ text: l });
    }
  }

  if (r.checklistDocumental?.length || r.statusPortalDisputa) {
    blocos.push(
      { text: "----------------------------------------------------------------------------------------" },
      { bold: true, size: 10.5, text: "7. PORTAL DE DISPUTA E AUDITORIA DOCUMENTAL" },
    );
    if (r.statusPortalDisputa) {
      blocos.push({
        text: `Portal: ${r.statusPortalDisputa.portalNome} (${r.statusPortalDisputa.status}) - ${r.statusPortalDisputa.detalhe}`,
      });
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
  habilitacao?: Partial<RelatorioParticipacao["habilitacao"]>;
  cronograma?: Partial<RelatorioParticipacao["cronograma"]>;
  itens?: {
    totalItens?: number;
    valorTotalEstimado?: number;
    destaqueMarcasExigidas?: string[];
    lista?: ItemDisputaEdital[];
  };
  riscos?: Partial<RelatorioParticipacao["riscos"]>;
  swot?: Partial<RelatorioParticipacao["swot"]>;
  recomendacoesExtras?: string[];
  observacoesCustos?: string;
} | null> {
  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!openaiKey && !geminiKey) {
    return null;
  }

  const systemPrompt =
    "Você é um Especialista Sênior em Licitações Públicas e Análise de Editais/ATAs (Lei 14.133/2021). " +
    "Sua função é gerar um Raio-X Executivo direto e mastigado para que o licitante não precise ler 100+ páginas de edital. " +
    "NÃO gere sugestões de preço de lance sem cotação de insumos. Retorne estritamente um JSON com a seguinte estrutura:\n" +
    "{\n" +
    '  "resumoExecutivo": "string com resumo em até 3 parágrafos claros",\n' +
    '  "habilitacao": {\n' +
    '    "status": "APTO" | "APTO_COM_RESSALVAS" | "INAPTO",\n' +
    '    "scoreConformidade": 85,\n' +
    '    "resumo": "string explicativa da habilitação",\n' +
    '    "certidoesRegulares": ["string"],\n' +
    '    "certidoesVencidasOuPendentes": ["string"],\n' +
    '    "atestadosExigidos": ["string"],\n' +
    '    "exigenciasEspeciais": ["vistoria presencial, registro no CREA/CRF, etc."]\n' +
    "  },\n" +
    '  "cronograma": {\n' +
    '    "dataPrevisaoInicio": "data ou prazo previsto para início dos serviços/fornecimento",\n' +
    '    "prazoInicioPedidosAposAssinatura": "prazo após assinatura da Ata/Contrato para início das ordens",\n' +
    '    "prazoEntregaExecucao": "prazo de entrega ou execução das remessas",\n' +
    '    "enderecoExecucaoOuEntrega": "endereço físico exato de entrega/execução",\n' +
    '    "isPresencial": false,\n' +
    '    "observacoesLogistica": "orientações sobre frete, presença ou deslocamento"\n' +
    "  },\n" +
    '  "itens": {\n' +
    '    "totalItens": 1,\n' +
    '    "valorTotalEstimado": 100000,\n' +
    '    "destaqueMarcasExigidas": ["Ex: Computador Macbook Pro M4, TV Samsung 55 QLED, Dipirona 50mg"],\n' +
    '    "lista": [\n' +
    '      {\n' +
    '        "numeroItem": 1,\n' +
    '        "lote": 1,\n' +
    '        "descricao": "string",\n' +
    '        "especificacaoDetalhada": "string",\n' +
    '        "quantidade": 10,\n' +
    '        "unidadeMedida": "UN",\n' +
    '        "valorUnitarioEstimado": 1000,\n' +
    '        "valorTotalEstimado": 10000,\n' +
    '        "marcaExigidaOuReferencia": "Marca X ou null"\n' +
    "      }\n" +
    "    ]\n" +
    "  },\n" +
    '  "riscos": {\n' +
    '    "prazoPagamentoOrgao": "Ex: Até 30 dias após atesto da Nota Fiscal",\n' +
    '    "exigenciaGarantiaContratual": "Ex: 5% sobre o valor adjudicado",\n' +
    '    "clausulasPenalidadesMultas": ["Multa moratória de 0,5% ao dia", "Multa de 10% por inexecução"],\n' +
    '    "riscosFinanceirosIdentificados": ["Risco de demora no empenho", "Descasamento de fluxo de caixa"],\n' +
    '    "nivelRiscoGeral": "BAIXO" | "MEDIO" | "ALTO"\n' +
    "  },\n" +
    '  "swot": {\n' +
    '    "forcas": ["string"],\n' +
    '    "fraquezas": ["string"],\n' +
    '    "oportunidades": ["string"],\n' +
    '    "ameacas": ["string"]\n' +
    "  }\n" +
    "}";

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
            { role: "system", content: systemPrompt },
            { role: "user", content: promptContexto },
          ],
        }),
        signal: AbortSignal.timeout(14000),
      });
      if (res.ok) {
        const json: any = await res.json();
        const content = json?.choices?.[0]?.message?.content;
        if (content) {
          return JSON.parse(content);
        }
      }
    } else if (geminiKey) {
      const candidateModels = Array.from(
        new Set([
          process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
          "gemini-3.5-flash-lite",
          "gemini-flash-lite-latest",
          "gemini-3.1-flash-lite",
          "gemini-3.5-flash",
        ]),
      );

      for (const model of candidateModels) {
        try {
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
                        text: `${systemPrompt}\n\nAnalise os seguintes dados do certame e da empresa e gere o Raio-X em JSON:\n\n${promptContexto}`,
                      },
                    ],
                  },
                ],
                generationConfig: {
                  temperature: 0.2,
                  responseMimeType: "application/json",
                },
              }),
              signal: AbortSignal.timeout(8000),
            },
          );
          if (res.ok) {
            const json: any = await res.json();
            const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              return JSON.parse(text);
            }
          }
        } catch {
          // Em caso de 503 (high demand) ou timeout do modelo, avança para o próximo candidato do pool
          continue;
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

  // 8. Extração e Modelagem do Raio-X de Edital & ATA (Issue #37)
  const dtAbertura = new Date(oportunidade.dataAbertura);
  const dtPrevisaoInicio = new Date(dtAbertura.getTime() + 25 * 24 * 60 * 60 * 1000);
  const dataPrevisaoInicioStr = `Previsão: ${dtPrevisaoInicio.toLocaleDateString("pt-BR")} (aproximadamente 25 dias corridos após a sessão)`;

  const enderecoEntrega = `${oportunidade.municipio ? `${oportunidade.municipio} - ` : ""}${oportunidade.uf || "UF"} (${oportunidade.orgaoNome}) - Conforme Termo de Referência`;

  // Detecção de marcas e modelos de referência no objeto/resumo
  const textoCompletoCertame = `${oportunidade.resumo || ""} ${oportunidade.miniResumo || ""} ${oportunidade.numeroEdital || ""}`;
  const marcasDetectadas = new Set<string>();
  const padroesMarcasConhecidas = [
    /\b(MacBook(?:\s+Pro|\s+Air)?(?:\s+M\d+)?)\b/i,
    /\b(Dell(?:\s+Latitude|\s+Optiplex|\s+PowerEdge)?)\b/i,
    /\b(Samsung(?:\s+Galaxy|\s+QLED|\s+Crystal)?)\b/i,
    /\b(Apple(?:\s+iPad|\s+iPhone)?)\b/i,
    /\b(Lenovo(?:\s+ThinkPad)?)\b/i,
    /\b(HP(?:\s+ProBook|\s+LaserJet)?)\b/i,
    /\b(LG(?:\s+OLED|\s+UltraGear)?)\b/i,
    /\b(Toyota(?:\s+Hilux|\s+Corolla)?)\b/i,
    /\b(Chevrolet(?:\s+Onix|\s+S10)?)\b/i,
    /\b(Dipirona(?:\s+\d+\s*mg)?)\b/i,
    /\b(Paracetamol(?:\s+\d+\s*mg)?)\b/i,
    /\b(Amoxicilina(?:\s+\d+\s*mg)?)\b/i,
    /\b(Cisco(?:\s+Catalyst)?)\b/i,
    /\b(Hikvision|Intelbras)\b/i,
  ];
  for (const regex of padroesMarcasConhecidas) {
    const m = textoCompletoCertame.match(regex);
    if (m && m[1]) marcasDetectadas.add(m[1].trim());
  }
  const regexMarcaGenerica = /(?:marca(?:\s+de\s+refer[êe]ncia)?|modelo|fabricante)\s*[:=]\s*([a-zA-Z0-9\s\.\-\+]{3,35})/gi;
  let matchGen;
  while ((matchGen = regexMarcaGenerica.exec(textoCompletoCertame)) !== null) {
    if (matchGen[1]) marcasDetectadas.add(matchGen[1].trim());
  }

  const listaItensBase: ItemDisputaEdital[] = [];
  if (Array.isArray(oportunidade.itens) && oportunidade.itens.length > 0) {
    for (const [idx, it] of (oportunidade.itens as any[]).entries()) {
      listaItensBase.push({
        numeroItem: it.numeroItem ?? idx + 1,
        lote: it.lote ?? 1,
        descricao: it.descricao || `Item ${idx + 1}`,
        especificacaoDetalhada: it.especificacao || it.descricao,
        quantidade: Number(it.quantidade) || 1,
        unidadeMedida: it.unidadeMedida || "UN",
        valorUnitarioEstimado: it.valorUnitario ? Number(it.valorUnitario) : null,
        valorTotalEstimado: it.valorTotal ? Number(it.valorTotal) : null,
        marcaExigidaOuReferencia: it.marca || Array.from(marcasDetectadas)[0] || null,
      });
    }
  } else {
    listaItensBase.push({
      numeroItem: 1,
      lote: 1,
      descricao: oportunidade.resumo || oportunidade.miniResumo || "Fornecimento de bens e serviços conforme edital",
      especificacaoDetalhada: oportunidade.resumo,
      quantidade: 1,
      unidadeMedida: "UN/LOTE",
      valorUnitarioEstimado: valorEstimado,
      valorTotalEstimado: valorEstimado,
      marcaExigidaOuReferencia: Array.from(marcasDetectadas)[0] || null,
    });
  }

  // 9. Enriquecimento opcional com LLM (OpenAI / Gemini) se chave configurada
  const obsUsuario = input.observacoes || input.observacoesExtras;
  const enriquecidoLLM = await tentarEnriquecerComLLM(
    JSON.stringify({
      edital: oportunidade.numeroEdital,
      orgao: oportunidade.orgaoNome,
      uf: oportunidade.uf,
      municipio: oportunidade.municipio,
      modalidade: oportunidade.modalidade,
      segmentoEdital: nomeSegmentoEdital,
      objeto: oportunidade.resumo,
      valorEstimado,
      isPresencial: oportunidade.isPresencial,
      arquivosEdital: (oportunidade.arquivos || []).map((a: any) => a.nome),
      empresaSegmentos: labelSegmentoEmpresa,
      empresaCnae: empresa?.cnae,
      parecerPreliminar: parecer,
      score,
      observacoesUsuario: obsUsuario || null,
    }),
  );

  let resumoExecutivo =
    enriquecidoLLM?.resumoExecutivo ||
    (parecer === "APTO"
      ? `A empresa apresenta alta aderência técnica e documental (Score ${score}/100) para participar do Edital ${oportunidade.numeroEdital} (${oportunidade.orgaoNome}) no segmento de ${nomeSegmentoEdital}.`
      : parecer === "APTO_COM_RESSALVAS"
        ? `A participação no Edital ${oportunidade.numeroEdital} (${oportunidade.orgaoNome}) é viável com ressalvas (Score ${score}/100). Recomenda-se sanar as pendências apontadas antes da abertura da sessão.`
        : `Foram identificados impedimentos críticos (Score ${score}/100) para o Edital ${oportunidade.numeroEdital}. Revise os documentos vencidos e a compatibilidade de escopo antes de deliberar.`);

  let observacoesCustos =
    enriquecidoLLM?.observacoesCustos ||
    `Valor total de referência estipulado pelo órgão: ${fmtBRL(valorEstimado)} (${listaItensBase.length} item/lote). Proposta comercial preliminar estimada em ${fmtBRL(precoSugerido)}.`;

  const recomendacoesPraticas: string[] = [
    `Validar vigência e autenticidade das certidões em /documentacao na véspera da sessão (${new Date(oportunidade.dataAbertura).toLocaleDateString("pt-BR")}).`,
    `Verificar especificações de marca/modelo e prazos de garantia exigidos no Termo de Referência.`,
  ];
  if (obsUsuario) {
    recomendacoesPraticas.push(`Observação solicitada pela equipe: ${obsUsuario}`);
  }
  if (Array.isArray(enriquecidoLLM?.recomendacoesExtras)) {
    for (const rec of enriquecidoLLM.recomendacoesExtras.slice(0, 3)) {
      if (rec && typeof rec === "string") recomendacoesPraticas.push(rec);
    }
  }

  // Montagem estruturada do Raio-X
  const certidoesRegulares = documentos
    .filter((d: any) => d.status === "ATIVO" && !d.vencido)
    .map((d: any) => `${d.nome} (${d.categoria})`);

  const certidoesVencidasOuPendentes = [
    ...documentos.filter((d: any) => d.vencido).map((d: any) => `${d.nome} (Vencido há ${Math.abs(d.diasParaVencer ?? 1)} dias)`),
    ...checklistDocumental.filter((c) => c.status === "AUSENTE").map((c) => `${c.documento} (Não cadastrado em /documentacao)`),
  ];

  const atestadosExigidos = atestadosEdital.length > 0
    ? atestadosEdital
    : [`Atestado de Capacidade Técnica de fornecimento similar ao objeto (Art. 67 da Lei 14.133/2021)`];

  const exigenciasEspeciais: string[] = [];
  if (oportunidade.isPresencial) {
    exigenciasEspeciais.push(`Sessão/Execução Presencial no município de ${oportunidade.municipio || oportunidade.uf}`);
  }
  if (oportunidade.segmentoMacro === "ENGENHARIA_E_OBRAS") {
    exigenciasEspeciais.push("Registro e regularidade da empresa e responsável técnico junto ao CREA/CAU");
  }
  if (oportunidade.segmentoMacro === "SAUDE_MEDICAMENTOS") {
    exigenciasEspeciais.push("Alvará Sanitário e Autorização de Funcionamento de Empresa (AFE/ANVISA)");
  }

  const destaqueMarcasFinal = Array.from(
    new Set([
      ...marcasDetectadas,
      ...(enriquecidoLLM?.itens?.destaqueMarcasExigidas || []),
    ]),
  );

  const relatorio: RelatorioParticipacao = {
    parecer: enriquecidoLLM?.habilitacao?.status || parecer,
    scoreAderencia: enriquecidoLLM?.habilitacao?.scoreConformidade ?? score,
    segmentoIdentificado: nomeSegmentoEdital,
    resumoExecutivo,

    // 1. Habilitação Documental Real
    habilitacao: {
      status: enriquecidoLLM?.habilitacao?.status || parecer,
      scoreConformidade: enriquecidoLLM?.habilitacao?.scoreConformidade ?? score,
      resumo:
        enriquecidoLLM?.habilitacao?.resumo ||
        (parecer === "APTO"
          ? `A empresa possui documentação regularizada (${certidoesRegulares.length} documento(s) ativo(s)) e atende às exigências preliminares do edital.`
          : parecer === "APTO_COM_RESSALVAS"
            ? `Identificadas pendências documentais ou categorias ausentes em /documentacao que exigem saneamento antes da sessão.`
            : `Impedimento documental crítico detectado: certidões vencidas impedem a habilitação jurídica/fiscal.`),
      certidoesRegulares: enriquecidoLLM?.habilitacao?.certidoesRegulares?.length
        ? enriquecidoLLM.habilitacao.certidoesRegulares
        : certidoesRegulares,
      certidoesVencidasOuPendentes: enriquecidoLLM?.habilitacao?.certidoesVencidasOuPendentes?.length
        ? enriquecidoLLM.habilitacao.certidoesVencidasOuPendentes
        : certidoesVencidasOuPendentes,
      atestadosExigidos: enriquecidoLLM?.habilitacao?.atestadosExigidos?.length
        ? enriquecidoLLM.habilitacao.atestadosExigidos
        : atestadosExigidos,
      exigenciasEspeciais: enriquecidoLLM?.habilitacao?.exigenciasEspeciais?.length
        ? enriquecidoLLM.habilitacao.exigenciasEspeciais
        : exigenciasEspeciais,
    },

    // 2. Cronograma & Localização Física
    cronograma: {
      dataPrevisaoInicio:
        enriquecidoLLM?.cronograma?.dataPrevisaoInicio || dataPrevisaoInicioStr,
      prazoInicioPedidosAposAssinatura:
        enriquecidoLLM?.cronograma?.prazoInicioPedidosAposAssinatura ||
        "Até 5 a 10 dias úteis após assinatura da Ata/Contrato e emissão da 1ª Ordem de Fornecimento",
      prazoEntregaExecucao:
        enriquecidoLLM?.cronograma?.prazoEntregaExecucao ||
        "Entrega parcelada em até 15 a 30 dias corridos conforme Ordem de Fornecimento",
      enderecoExecucaoOuEntrega:
        enriquecidoLLM?.cronograma?.enderecoExecucaoOuEntrega || enderecoEntrega,
      isPresencial:
        enriquecidoLLM?.cronograma?.isPresencial ?? Boolean(oportunidade.isPresencial),
      observacoesLogistica:
        enriquecidoLLM?.cronograma?.observacoesLogistica ||
        (oportunidade.isPresencial
          ? `Certame/Execução com etapa presencial em ${oportunidade.municipio || oportunidade.uf}. Planejar logística ou representação legal local.`
          : "Certame e entrega sem necessidade de comparecimento presencial na fase de disputa."),
    },

    // 3. Itens, Quantidades & Marcas Exigidas
    itens: {
      totalItens: enriquecidoLLM?.itens?.totalItens ?? listaItensBase.length,
      valorTotalEstimado:
        enriquecidoLLM?.itens?.valorTotalEstimado ?? valorEstimado,
      destaqueMarcasExigidas: destaqueMarcasFinal,
      lista: enriquecidoLLM?.itens?.lista && enriquecidoLLM.itens.lista.length > 0
        ? enriquecidoLLM.itens.lista
        : listaItensBase,
    },

    // 4. Riscos Contratuais & Financeiros
    riscos: {
      prazoPagamentoOrgao:
        enriquecidoLLM?.riscos?.prazoPagamentoOrgao ||
        "Até 30 dias após liquidação e atesto da Nota Fiscal pelo fiscal do contrato",
      exigenciaGarantiaContratual:
        enriquecidoLLM?.riscos?.exigenciaGarantiaContratual ||
        "Garantia de execução contratual de 5% sobre o valor adjudicado (Art. 96 a 102 da Lei 14.133/2021)",
      clausulasPenalidadesMultas:
        enriquecidoLLM?.riscos?.clausulasPenalidadesMultas?.length
          ? enriquecidoLLM.riscos.clausulasPenalidadesMultas
          : [
              "Multa moratória de 0,5% por dia de atraso injustificado na entrega, limitada a 10%",
              "Multa compensatória de até 10% sobre o saldo contratual em caso de inexecução total ou parcial",
              "Impedimento de licitar e contratar com a Administração Pública por prazo de até 3 anos",
            ],
      riscosFinanceirosIdentificados:
        enriquecidoLLM?.riscos?.riscosFinanceirosIdentificados?.length
          ? enriquecidoLLM.riscos.riscosFinanceirosIdentificados
          : [
              "Risco de descasamento no fluxo de caixa (ciclo entre entrega e pagamento público de 30 a 60 dias)",
              "Flutuação de custos de insumos durante os 12 meses de vigência da Ata de Registro de Preços",
              "Possibilidade de empenhos fracionados com volume mensal inferior ao estimado inicialmente",
            ],
      nivelRiscoGeral:
        enriquecidoLLM?.riscos?.nivelRiscoGeral ||
        (qtdDocsVencidos > 0 ? "ALTO" : !escopoCompativel ? "MEDIO" : "BAIXO"),
    },

    // 5. Matriz SWOT
    swot: {
      forcas:
        enriquecidoLLM?.swot?.forcas?.length
          ? enriquecidoLLM.swot.forcas
          : [
              ...(certidoesRegulares.length > 0
                ? [
                    `Regularidade cadastral ativa em /documentacao (${certidoesRegulares.length} documento(s) válido(s))`,
                  ]
                : []),
              `Aderência de atuação territorial no Estado de ${oportunidade.uf}`,
              `Experiência comercial no segmento de ${nomeSegmentoEdital}`,
              ...(oportunidade.isPresencial
                ? []
                : [
                    "Disputa em modalidade eletrônica sem custos de deslocamento inicial",
                  ]),
            ],
      fraquezas:
        enriquecidoLLM?.swot?.fraquezas?.length
          ? enriquecidoLLM.swot.fraquezas
          : [
              ...(qtdDocsVencidos > 0
                ? [`${qtdDocsVencidos} documento(s) vencido(s) que exigem renovação imediata.`]
                : []),
              ...(statusPortalDisputa.status !== "ATIVO"
                ? [`Portal de disputa (${statusPortalDisputa.portalNome}) pendente de credenciamento ou renovação.`]
                : []),
              "Necessidade de cotação prévia com distribuidores para assegurar disponibilidade em estoque",
            ],
      oportunidades:
        enriquecidoLLM?.swot?.oportunidades?.length
          ? enriquecidoLLM.swot.oportunidades
          : [
              `Valor de referência total estimado em ${fmtBRL(valorEstimado)}`,
              "Potencial de fornecimento contínuo via Ata de Registro de Preços pelo período de 12 meses",
              "Possibilidade de adesão à Ata ('carona') por outros órgãos públicos participantes",
            ],
      ameacas:
        enriquecidoLLM?.swot?.ameacas?.length
          ? enriquecidoLLM.swot.ameacas
          : [
              "Disputa predatória na fase de lances no portal com risco de preços inexequíveis por concorrentes",
              "Possível morosidade burocrática na emissão das ordens de fornecimento ou empenhos pelo órgão",
            ],
    },

    // Compatibilidade Legada
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
    relatorio.habilitacao.certidoesVencidasOuPendentes.length > 0
      ? `Pendências documentais: ${relatorio.habilitacao.certidoesVencidasOuPendentes.join(" | ")}`
      : "Nenhum impedimento documental eliminatório detectado.";

  const viabilidadeTexto = `${resumoExecutivo} Prazos: ${relatorio.cronograma.prazoInicioPedidosAposAssinatura}.`;
  const custosTexto = observacoesCustos;

  const relatorioTexto = [
    `RAIO-X DE EDITAL & ATA DE REGISTRO DE PREÇOS: ${parecer} (Score ${score}/100)`,
    `Segmento: ${nomeSegmentoEdital}`,
    "",
    `1. RESUMO EXECUTIVO`,
    resumoExecutivo,
    "",
    `2. HABILITAÇÃO DOCUMENTAL (/documentacao)`,
    relatorio.habilitacao.resumo,
    `Certidões Regulares: ${relatorio.habilitacao.certidoesRegulares.length}`,
    `Pendências: ${relatorio.habilitacao.certidoesVencidasOuPendentes.length > 0 ? relatorio.habilitacao.certidoesVencidasOuPendentes.join(", ") : "Nenhuma"}`,
    "",
    `3. CRONOGRAMA, PRAZOS PÓS-ASSINATURA E ENDEREÇO`,
    `- Previsão de Início: ${relatorio.cronograma.dataPrevisaoInicio}`,
    `- Início dos Pedidos: ${relatorio.cronograma.prazoInicioPedidosAposAssinatura}`,
    `- Prazo de Entrega: ${relatorio.cronograma.prazoEntregaExecucao}`,
    `- Endereço de Entrega/Execução: ${relatorio.cronograma.enderecoExecucaoOuEntrega}`,
    `- Presencial: ${relatorio.cronograma.isPresencial ? "SIM" : "NÃO"}`,
    "",
    `4. ITENS E MARCAS EXIGIDAS`,
    `Total de Itens: ${relatorio.itens.totalItens} | Valor: ${fmtBRL(relatorio.itens.valorTotalEstimado)}`,
    relatorio.itens.destaqueMarcasExigidas.length > 0
      ? `Marcas Homologadas/Exigidas: ${relatorio.itens.destaqueMarcasExigidas.join(", ")}`
      : "Sem exigência restritiva de marcas específicas.",
    "",
    `5. RISCOS CONTRATUAIS & FINANCEIROS`,
    `- Prazo de Pagamento: ${relatorio.riscos.prazoPagamentoOrgao}`,
    `- Garantia Contratual: ${relatorio.riscos.exigenciaGarantiaContratual}`,
    `- Risco Geral: ${relatorio.riscos.nivelRiscoGeral}`,
    "",
    `6. MATRIZ SWOT`,
    `[Forças]: ${relatorio.swot.forcas.join(" | ")}`,
    `[Fraquezas]: ${relatorio.swot.fraquezas.join(" | ")}`,
    `[Oportunidades]: ${relatorio.swot.oportunidades.join(" | ")}`,
    `[Ameaças]: ${relatorio.swot.ameacas.join(" | ")}`,
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
    permitirSemArquivos?: boolean;
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

  // 1. Pre-flight de arquivos de Edital: se a oportunidade não possui arquivos baixados no dossiê,
  // tenta sincronizar automaticamente da API pública do PNCP.
  let arquivosAtuais = Array.isArray(oportunidade.arquivos) ? oportunidade.arquivos : [];
  if (arquivosAtuais.length === 0) {
    try {
      await buscarESincronizarArquivosEditalPncp(realId, user, actorContext);
      const recarregada = await getOportunidadeById(realId, tenantId);
      arquivosAtuais = Array.isArray(recarregada.arquivos) ? recarregada.arquivos : [];
    } catch {
      // Silencioso se PNCP offline/indisponível
    }
  }

  // Se mesmo após a busca pública não houver nenhum arquivo de edital,
  // encerra a solicitação ANTES de consumir a cota mensal
  if (arquivosAtuais.length === 0 && !options?.permitirSemArquivos) {
    throw new AnaliseIAParticipacaoError(
      "SEM_ARQUIVOS_EDITAL",
      "Nenhum arquivo de edital ou termo de referência foi localizado para este certame no portal público (PNCP). Faça o upload manual dos documentos na aba 'Arquivos do Edital' ou aguarde a disponibilização pública pelo órgão antes de gerar o Raio-X com IA.",
      400,
    );
  }

  // 2. Verifica limite mensal do plano antes de criar (preservando a cota se sem arquivos)
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

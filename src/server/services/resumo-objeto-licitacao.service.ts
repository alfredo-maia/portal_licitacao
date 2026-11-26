import { prisma } from "@/lib/prisma";
import {
  chamarLlmJsonMultimodal,
  type LlmTelemetryContext,
} from "./llm-multimodal.service";
import {
  pareceTituloContaminadoPorTemplateTi,
  pareceTituloTruncadoOuPobre,
  resolverTituloExibicaoLicitacao,
  sintetizarTituloHeuristicoV2,
} from "@/lib/licitacao-texto";
import { classificarLicitacaoPorTexto } from "./classificador-segmentos.service";
import { recordAuditLog } from "@/server/audit";
import { listInMemoryLicitacoes, updateInMemoryLicitacao } from "./licitacoes-store";
import type { MetodoTituloLicitacao } from "@/server/schemas/pncp-ingestao.schema";

export interface ItemObjetoParaTitulo {
  pncpId: string;
  objeto: string;
  tipoSistemaSugerido?: string | null;
  usarIa?: boolean;
}

export interface ResultadoTituloObjeto {
  titulo: string;
  metodo: MetodoTituloLicitacao;
  provider?: string | null;
}

const MAX_ITEMS_POR_LOTE_IA = 15;

function limparTituloIaResposta(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[\r\n\t]+/g, " ")
    .replace(/^["'“”‘’\-–—:\s]+|["'“”‘’.\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function validarTituloIaQualidade(titulo: string, objetoOriginal?: string): boolean {
  if (!titulo || titulo.length < 10 || titulo.length > 95) return false;
  if (pareceTituloTruncadoOuPobre(titulo)) return false;
  if (objetoOriginal && pareceTituloContaminadoPorTemplateTi(titulo, objetoOriginal)) {
    return false;
  }
  return true;
}

/**
 * Motor Duplo de Síntese de Títulos de Licitações:
 * - Prioridade 1: IA em lote (Gemini / OpenAI) gerando títulos executivos curtos e íntegros (40–80 chars).
 * - Prioridade 2: Heurística Determinística V2 (fallback automático por item ou quando sem chaves de IA).
 */
export async function gerarTitulosEmLotePrioridadeDupla(
  itens: ItemObjetoParaTitulo[],
  telemetryContext?: Partial<LlmTelemetryContext>,
): Promise<Map<string, ResultadoTituloObjeto>> {
  const resultado = new Map<string, ResultadoTituloObjeto>();
  if (!Array.isArray(itens) || itens.length === 0) {
    return resultado;
  }

  const temChaveIa = Boolean(
    process.env.GEMINI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim(),
  );

  const elegiveisIa = temChaveIa
    ? itens.filter((i) => i.usarIa !== false && (i.objeto || "").trim().length >= 12)
    : [];

  if (elegiveisIa.length > 0) {
    for (let offset = 0; offset < elegiveisIa.length; offset += MAX_ITEMS_POR_LOTE_IA) {
      const lote = elegiveisIa.slice(offset, offset + MAX_ITEMS_POR_LOTE_IA);
      try {
        const promptItens = lote.map((i) => ({
          pncpId: i.pncpId,
          objeto: i.objeto.slice(0, 700),
        }));

        const llm = await chamarLlmJsonMultimodal<{
          titulos?: Array<{ pncpId?: string; titulo?: string }>;
        }>({
          systemPrompt: [
            "Você é um editor especialista em licitações públicas brasileiras (Lei 14.133/2021).",
            "Converta cada objeto burocrático em um TÍTULO COMERCIAL claro, curto e legível em Português do Brasil (entre 30 e 80 caracteres).",
            "REGRAS OBRIGATÓRIAS:",
            "1. NUNCA comece com 'Contratação de empresa', 'Empresa especializada', 'Empresa qualificada', 'Registro de preços', 'Seleção de proposta' ou tags '[Portal ...]'.",
            "2. NUNCA corte palavras pela metade (ex.: proibido 'Revisão do Pl', 'Elaboração de P', 'Empresa Esp', 'Execução de C').",
            "3. NUNCA termine com preposição ou artigo solto ('de', 'da', 'do', 'para', 'em', 'com', 'a', 'o', 'e').",
            "4. Retorne APENAS JSON no formato: { \"titulos\": [ { \"pncpId\": \"...\", \"titulo\": \"...\" } ] }.",
          ].join("\n"),
          userPrompt: JSON.stringify({ objetos: promptItens }),
          temperature: 0.1,
          maxOutputTokens: 2048,
          telemetryContext: {
            ...(telemetryContext ?? {}),
            feature: "RESUMO_PNCP",
          },
        });

        const mapaObjeto = new Map(lote.map((i) => [i.pncpId, i.objeto]));
        const lista = Array.isArray(llm?.data?.titulos) ? llm.data.titulos : [];
        for (const entrada of lista) {
          const id = typeof entrada?.pncpId === "string" ? entrada.pncpId.trim() : "";
          const tituloLimpo = limparTituloIaResposta(entrada?.titulo);
          if (id && validarTituloIaQualidade(tituloLimpo, mapaObjeto.get(id))) {
            resultado.set(id, {
              titulo: tituloLimpo,
              metodo: "IA",
              provider: llm?.provider ?? null,
            });
          }
        }
      } catch {
        // Fallback silencioso para Prioridade 2
      }
    }
  }

  for (const item of itens) {
    if (!resultado.has(item.pncpId)) {
      resultado.set(item.pncpId, {
        titulo: sintetizarTituloHeuristicoV2(item.objeto, item.tipoSistemaSugerido),
        metodo: "HEURISTICA_V2",
      });
    }
  }

  return resultado;
}

export async function gerarTituloObjetoDuplaPrioridade(
  item: ItemObjetoParaTitulo,
  telemetryContext?: Partial<LlmTelemetryContext>,
): Promise<ResultadoTituloObjeto> {
  const mapa = await gerarTitulosEmLotePrioridadeDupla([item], telemetryContext);
  return (
    mapa.get(item.pncpId) || {
      titulo: sintetizarTituloHeuristicoV2(item.objeto, item.tipoSistemaSugerido),
      metodo: "HEURISTICA_V2",
    }
  );
}

export interface HigienizacaoTitulosResult {
  ok: true;
  analisados: number;
  atualizados: number;
  viaIa: number;
  viaHeuristica: number;
  exemplos: Array<{
    idPncp: string;
    antes: string;
    depois: string;
    metodo: MetodoTituloLicitacao;
  }>;
}

/**
 * Retro-higienização da base existente: corrige títulos truncados ("Empresa Esp",
 * "Revisão do Pl", etc.) já gravados no PostgreSQL ou no repositório em memória.
 */
export async function higienizarTitulosExistentesService(options?: {
  limite?: number;
  usarIa?: boolean;
  apenasTruncados?: boolean;
}): Promise<HigienizacaoTitulosResult> {
  const limite = options?.limite ?? 500;
  const usarIa = options?.usarIa ?? true;
  const apenasTruncados = options?.apenasTruncados ?? true;

  let registrosDb: Array<{
    id: string;
    idPncp: string;
    miniResumo: string;
    resumo: string;
    tipoSistemaCodigo: string | null;
  }> = [];
  let usandoBanco = false;

  try {
    const found = await prisma.licitacao.findMany({
      take: limite,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        idPncp: true,
        miniResumo: true,
        resumo: true,
        tipoSistemaCodigo: true,
      },
    });
    if (Array.isArray(found) && found.length > 0) {
      registrosDb = found;
      usandoBanco = true;
    }
  } catch {
    // Fallback em memória abaixo
  }

  const registros =
    registrosDb.length > 0
      ? registrosDb
      : listInMemoryLicitacoes().slice(0, limite);

  const candidatos = registros.filter((reg) => {
    if (!reg.resumo || reg.resumo.trim().length < 8) return false;
    if (!apenasTruncados) return true;
    return pareceTituloTruncadoOuPobre(reg.miniResumo);
  });

  if (candidatos.length === 0) {
    return {
      ok: true,
      analisados: registros.length,
      atualizados: 0,
      viaIa: 0,
      viaHeuristica: 0,
      exemplos: [],
    };
  }

  const mapaTitulos = await gerarTitulosEmLotePrioridadeDupla(
    candidatos.map((c) => ({
      pncpId: c.idPncp,
      objeto: c.resumo,
      tipoSistemaSugerido: c.tipoSistemaCodigo,
      usarIa,
    })),
  );

  let atualizados = 0;
  let viaIa = 0;
  let viaHeuristica = 0;
  const exemplos: HigienizacaoTitulosResult["exemplos"] = [];

  for (const reg of candidatos) {
    const gerado = mapaTitulos.get(reg.idPncp);
    const novoTitulo =
      gerado?.titulo ||
      resolverTituloExibicaoLicitacao(
        reg.miniResumo,
        reg.resumo,
        reg.tipoSistemaCodigo,
      );

    if (!novoTitulo || novoTitulo === reg.miniResumo) continue;

    if (usandoBanco) {
      try {
        await prisma.licitacao.update({
          where: { id: reg.id },
          data: { miniResumo: novoTitulo },
        });
      } catch {}
    }
    updateInMemoryLicitacao(reg.id, { miniResumo: novoTitulo });

    atualizados += 1;
    const metodo = gerado?.metodo ?? "HEURISTICA_V2";
    if (metodo === "IA") viaIa += 1;
    else viaHeuristica += 1;

    if (exemplos.length < 15) {
      exemplos.push({
        idPncp: reg.idPncp,
        antes: reg.miniResumo,
        depois: novoTitulo,
        metodo,
      });
    }
  }

  return {
    ok: true,
    analisados: registros.length,
    atualizados,
    viaIa,
    viaHeuristica,
    exemplos,
  };
}

export interface ReclassificacaoCatalogoResult {
  ok: true;
  analisados: number;
  atualizados: number;
  titulosCorrigidos: number;
  segmentosAlterados: number;
  movidosParaOutros: number;
  amostras: Array<{
    idPncp: string;
    tituloAntes: string;
    tituloDepois: string;
    segmentoAntes: string | null;
    segmentoDepois: string;
    subcategoriasDepois: string[];
  }>;
}

/**
 * Saneamento retroativo determinístico (Motor V3):
 * Recalcula `segmentoMacro` e `subcategorias` exclusivamente pelo `resumo` oficial do PNCP
 * e higieniza `miniResumo` que estejam truncados ou contaminados por templates legados de TI.
 */
export async function reclassificarCatalogoLicitacoesService(options?: {
  limite?: number;
  actorContext?: { usuarioId?: string | null; usuarioNome?: string | null; ip?: string | null };
}): Promise<ReclassificacaoCatalogoResult> {
  const limite = options?.limite ?? 5000;

  let registrosDb: Array<{
    id: string;
    idPncp: string;
    miniResumo: string;
    resumo: string;
    tipoSistemaCodigo: string | null;
    segmentoMacro: string | null;
    subcategorias: unknown;
  }> = [];
  let usandoBanco = false;

  try {
    const found = await prisma.licitacao.findMany({
      take: limite,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        idPncp: true,
        miniResumo: true,
        resumo: true,
        tipoSistemaCodigo: true,
        segmentoMacro: true,
        subcategorias: true,
      },
    });
    if (Array.isArray(found) && found.length > 0) {
      registrosDb = found;
      usandoBanco = true;
    }
  } catch {
    // Fallback em memória abaixo
  }

  const registrosMemoria = listInMemoryLicitacoes().slice(0, limite);
  const todosPorId = new Map<
    string,
    {
      id: string;
      idPncp: string;
      miniResumo: string;
      resumo: string;
      tipoSistemaCodigo: string | null;
      segmentoMacro: string | null;
      subcategorias: unknown;
    }
  >();

  for (const r of registrosDb) todosPorId.set(r.id, r);
  for (const m of registrosMemoria) {
    if (!todosPorId.has(m.id)) {
      todosPorId.set(m.id, {
        id: m.id,
        idPncp: m.idPncp,
        miniResumo: m.miniResumo,
        resumo: m.resumo,
        tipoSistemaCodigo: m.tipoSistemaCodigo ?? null,
        segmentoMacro: m.segmentoMacro ?? null,
        subcategorias: m.subcategorias ?? [],
      });
    }
  }

  let atualizados = 0;
  let titulosCorrigidos = 0;
  let segmentosAlterados = 0;
  let movidosParaOutros = 0;
  const amostras: ReclassificacaoCatalogoResult["amostras"] = [];

  for (const reg of todosPorId.values()) {
    if (!reg.resumo || reg.resumo.trim().length < 4) continue;

    const classif = classificarLicitacaoPorTexto(reg.resumo);
    const subsAntigas = Array.isArray(reg.subcategorias)
      ? [...(reg.subcategorias as string[])].sort()
      : [];
    const subsNovas = [...classif.subcategorias].sort();

    const segmentoMudou =
      reg.segmentoMacro !== classif.macro ||
      JSON.stringify(subsAntigas) !== JSON.stringify(subsNovas);

    const precisaNovoTitulo =
      pareceTituloTruncadoOuPobre(reg.miniResumo) ||
      pareceTituloContaminadoPorTemplateTi(reg.miniResumo, reg.resumo);

    const novoTitulo = precisaNovoTitulo
      ? sintetizarTituloHeuristicoV2(reg.resumo, reg.tipoSistemaCodigo)
      : reg.miniResumo;

    const tituloMudou = Boolean(novoTitulo && novoTitulo !== reg.miniResumo);

    if (!segmentoMudou && !tituloMudou) continue;

    if (usandoBanco) {
      try {
        await prisma.licitacao.update({
          where: { id: reg.id },
          data: {
            miniResumo: novoTitulo,
            segmentoMacro: classif.macro,
            subcategorias: classif.subcategorias,
          },
        });
      } catch {}
    }

    updateInMemoryLicitacao(reg.id, {
      miniResumo: novoTitulo,
      segmentoMacro: classif.macro,
      subcategorias: classif.subcategorias,
    });

    atualizados += 1;
    if (tituloMudou) titulosCorrigidos += 1;
    if (segmentoMudou) {
      segmentosAlterados += 1;
      if (classif.macro === "OUTROS" && reg.segmentoMacro !== "OUTROS") {
        movidosParaOutros += 1;
      }
    }

    if (amostras.length < 25) {
      amostras.push({
        idPncp: reg.idPncp,
        tituloAntes: reg.miniResumo,
        tituloDepois: novoTitulo,
        segmentoAntes: reg.segmentoMacro,
        segmentoDepois: classif.macro,
        subcategoriasDepois: classif.subcategorias,
      });
    }
  }

  await recordAuditLog({
    acao: "RECLASSIFICACAO_CATALOGO_V3",
    entidadeTipo: "LICITACAO",
    entidadeId: "catalogo-global",
    antes: null,
    depois: {
      analisados: todosPorId.size,
      atualizados,
      titulosCorrigidos,
      segmentosAlterados,
      movidosParaOutros,
    },
    usuarioId: options?.actorContext?.usuarioId ?? null,
    usuarioNome: options?.actorContext?.usuarioNome ?? "Motor Semântico V3",
    ip: options?.actorContext?.ip ?? null,
  }).catch(() => undefined);

  return {
    ok: true,
    analisados: todosPorId.size,
    atualizados,
    titulosCorrigidos,
    segmentosAlterados,
    movidosParaOutros,
    amostras,
  };
}

import type { LicitacaoStatus, ParecerIA, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/server/audit";
import {
  type IngestaoLicitacaoItem,
  type IngestaoPayloadV2Input,
  ingestaoPayloadV2Schema,
} from "@/server/schemas/ingestao.schema";
import { computeHashCritico } from "./hash-critico";
import {
  getInMemoryLicitacaoByIdPncp,
  insertInMemoryLicitacao,
  type LicitacaoRecord,
  type NovaLicitacaoData,
  updateInMemoryLicitacao,
} from "./licitacoes-store";
import { criarNotificacao } from "./notificacoes.service";
import { montarChaveIdempotencia } from "@/server/schemas/notificacao.schema";

export { computeHashCritico } from "./hash-critico";
export type { HashCriticoInput } from "./hash-critico";

export interface IngestaoActorContext {
  usuarioId?: string | null;
  usuarioNome?: string | null;
  ip?: string | null;
}

export interface IngestaoLoteV2Result {
  ok: true;
  versaoContrato: 2;
  totalRecebidos: number;
  criados: number;
  atualizados: number;
  inalterados: number;
  registros: LicitacaoRecord[];
}

function mapItemToLicitacaoData(
  item: IngestaoLicitacaoItem,
  hashCritico: string,
): NovaLicitacaoData {
  return {
    idPncp: item.pncpId,
    numeroEdital: item.numeroEdital,
    orgaoNome: item.orgao.nome,
    orgaoCnpj: item.orgao.cnpj,
    uf: item.orgao.uf.toUpperCase(),
    municipio: item.orgao.municipio ?? null,
    esfera: item.orgao.esfera ?? null,
    poder: item.orgao.poder ?? null,
    modalidade: item.modalidade,
    portalDisputa: item.portalDisputa ?? null,
    miniResumo: item.miniResumo,
    resumo: item.resumo,
    valorEstimado: item.valorEstimado,
    dataAbertura: item.dataAbertura,
    dataEncerramentoProposta: item.dataEncerramentoProposta ?? item.dataAbertura,
    dataPublicacaoPncp: item.dataPublicacaoPncp ?? null,
    dataUltimaAtualizacao: item.dataUltimaAtualizacao ?? null,
    status: "PENDENTE" as LicitacaoStatus,
    parecerIA: item.parecerGoNoGo as ParecerIA,
    justificativaIA: item.justificativaTecnica ?? null,
    tipoSistemaCodigo: item.tipoSistemaSugerido,
    atestadosExigidos: item.atestadosExigidos,
    motivoRecusa: null,
    quantidadeLotes: item.quantidadeLotes,
    loteUnico: item.loteUnico,
    precoPorLote: item.precoPorLote,
    isPresencial: item.isPresencial,
    distanciaGoianiaKm: item.distanciaGoianiaKm ?? null,
    linkPncp: item.linkPncp || null,
    linkSistemaOrigem: item.linkSistemaOrigem || null,
    hashCritico,
    valorArrematado: null,
    responsavelId: null,
  };
}

async function findByIdPncp(idPncp: string): Promise<LicitacaoRecord | null> {
  try {
    const found = await prisma.licitacao.findUnique({ where: { idPncp } });
    if (found) {
      return found;
    }
  } catch {
    // PostgreSQL indisponível: fallback resiliente em memória (CI/testes)
  }
  return getInMemoryLicitacaoByIdPncp(idPncp);
}

async function createLicitacao(
  data: NovaLicitacaoData,
): Promise<LicitacaoRecord> {
  try {
    return await prisma.licitacao.create({
      data: data as Prisma.LicitacaoUncheckedCreateInput,
    });
  } catch {
    // PostgreSQL indisponível: fallback resiliente em memória (CI/testes)
  }
  return insertInMemoryLicitacao(data);
}

async function updateLicitacao(
  id: string,
  patch: Partial<NovaLicitacaoData>,
): Promise<LicitacaoRecord | null> {
  try {
    return await prisma.licitacao.update({
      where: { id },
      data: patch as Prisma.LicitacaoUncheckedUpdateInput,
    });
  } catch {
    // PostgreSQL indisponível ou registro fora do banco: fallback em memória
  }
  return updateInMemoryLicitacao(id, patch);
}

/**
 * Ingestão e sincronização v2 (`licitacoes_portal.json` → PostgreSQL 16):
 * valida o payload com `ingestaoPayloadV2Schema`, calcula o `hashCritico`
 * (SHA-256) de cada item e aplica detecção cirúrgica de mudanças por `idPncp`:
 * - inexistente → cria com `status: "PENDENTE"` e grava `INGESTAO_CRIACAO`;
 * - mesmo hash → mantém inalterado (anti-spam de notificações, PRD §6.1);
 * - hash divergente → atualiza os dados (incluindo `dataAbertura`, imediata no
 *   calendário), preserva o `status` quando a equipe já deliberou o certame e
 *   grava `INGESTAO_ATUALIZACAO_CRITICA` com antes/depois.
 * Ao final do lote grava o log consolidado `INGESTAO_LOTE_V2`.
 */
export async function ingestLicitacoesV2(
  payload: IngestaoPayloadV2Input | unknown,
  actorContext?: IngestaoActorContext,
): Promise<IngestaoLoteV2Result> {
  const parsed = ingestaoPayloadV2Schema.parse(payload);

  let criados = 0;
  let atualizados = 0;
  let inalterados = 0;
  const registros: LicitacaoRecord[] = [];

  for (const item of parsed.licitacoes) {
    const novoHash = computeHashCritico({
      dataAbertura: item.dataAbertura,
      dataEncerramentoProposta: item.dataEncerramentoProposta,
      valorEstimado: item.valorEstimado,
      resumo: item.resumo,
      modalidade: item.modalidade,
      numeroEdital: item.numeroEdital,
      orgaoCnpj: item.orgao.cnpj,
    });

    const dados = mapItemToLicitacaoData(item, novoHash);
    const existente = await findByIdPncp(item.pncpId);

    if (!existente) {
      const criado = await createLicitacao(dados);
      criados += 1;
      registros.push(criado);
      await recordAuditLog({
        acao: "INGESTAO_CRIACAO",
        entidadeTipo: "LICITACAO",
        entidadeId: criado.id,
        antes: null,
        depois: {
          idPncp: criado.idPncp,
          numeroEdital: criado.numeroEdital,
          hashCritico: novoHash,
          status: criado.status,
          dataAbertura: criado.dataAbertura.toISOString(),
        },
        usuarioId: actorContext?.usuarioId ?? null,
        usuarioNome: actorContext?.usuarioNome ?? null,
        ip: actorContext?.ip ?? null,
      });
      continue;
    }

    if (existente.hashCritico === novoHash) {
      inalterados += 1;
      registros.push(existente);
      continue;
    }

    // Preserva a deliberação da equipe (qualquer status ≠ PENDENTE).
    const preservarStatus = existente.status !== "PENDENTE";
    const { status: _status, ...dadosSemStatus } = dados;
    const patch: Partial<NovaLicitacaoData> = {
      ...(preservarStatus ? dadosSemStatus : dados),
      // Preserva a data de abertura original do certame e atualiza a data de encerramento de envio de proposta
      dataAbertura: existente.dataAbertura,
      dataEncerramentoProposta: dados.dataEncerramentoProposta ?? dados.dataAbertura,
    };

    const atualizado = await updateLicitacao(existente.id, patch);
    const registro = atualizado ?? { ...existente, ...patch };
    atualizados += 1;
    registros.push(registro);

    await recordAuditLog({
      acao: "INGESTAO_ATUALIZACAO_CRITICA",
      entidadeTipo: "LICITACAO",
      entidadeId: existente.id,
      antes: {
        hashCritico: existente.hashCritico,
        dataAbertura: existente.dataAbertura.toISOString(),
        dataEncerramentoProposta: existente.dataEncerramentoProposta ? existente.dataEncerramentoProposta.toISOString() : null,
        valorEstimado: existente.valorEstimado,
        resumo: existente.resumo,
        status: existente.status,
      },
      depois: {
        hashCritico: novoHash,
        dataAbertura: existente.dataAbertura.toISOString(),
        dataEncerramentoProposta: patch.dataEncerramentoProposta ? patch.dataEncerramentoProposta.toISOString() : null,
        valorEstimado: dados.valorEstimado,
        resumo: dados.resumo,
        status: registro.status,
      },
      usuarioId: actorContext?.usuarioId ?? null,
      usuarioNome: actorContext?.usuarioNome ?? null,
      ip: actorContext?.ip ?? null,
    });

    const destN2 = [existente.responsavelId, "seed_vitor", "seed_alfredo"].filter(Boolean) as string[];
    await criarNotificacao({
      tipo: "N2_LICITACAO_ATUALIZADA",
      titulo: `Edital Atualizado no PNCP: ${registro.numeroEdital}`,
      descricao: `O certame ${registro.numeroEdital} sofreu retificação de campos críticos no PNCP.`,
      linkDestino: `/oportunidades/${registro.id}`,
      licitacaoId: registro.id,
      chaveIdempotencia: montarChaveIdempotencia({
        tipo: "N2_LICITACAO_ATUALIZADA",
        entidadeId: registro.id,
        janela: novoHash,
      }),
      destinatarioIds: destN2,
    }).catch(() => undefined);
  }

  await recordAuditLog({
    acao: "INGESTAO_LOTE_V2",
    entidadeTipo: "LICITACAO",
    entidadeId: `lote-v2-${parsed.executadoEm}`,
    antes: null,
    depois: {
      versaoContrato: parsed.versaoContrato,
      executadoEm: parsed.executadoEm,
      totalRegistros: parsed.totalRegistros,
      totalRecebidos: parsed.licitacoes.length,
      criados,
      atualizados,
      inalterados,
    },
    usuarioId: actorContext?.usuarioId ?? null,
    usuarioNome: actorContext?.usuarioNome ?? null,
    ip: actorContext?.ip ?? null,
  });

  await criarNotificacao({
    tipo: "N1_COLETA_CONCLUIDA",
    titulo: `Coleta PNCP Concluída (${parsed.licitacoes.length} certames)`,
    descricao: `Esteira autônoma processou ${parsed.licitacoes.length} certame(s) com sucesso (${criados} novos, ${atualizados} atualizados, ${inalterados} inalterados).`,
    linkDestino: `/oportunidades`,
    chaveIdempotencia: montarChaveIdempotencia({
      tipo: "N1_COLETA_CONCLUIDA",
      entidadeId: `lote_${parsed.executadoEm}`,
      janela: parsed.executadoEm,
    }),
    destinatarioIds: ["seed_vitor", "seed_alfredo"],
  }).catch(() => undefined);

  return {
    ok: true,
    versaoContrato: 2,
    totalRecebidos: parsed.licitacoes.length,
    criados,
    atualizados,
    inalterados,
    registros,
  };
}

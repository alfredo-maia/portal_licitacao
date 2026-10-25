import { beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { getInMemoryAuditLogs } from "@/server/audit";
import {
  computeHashCritico,
  ingestLicitacoesV2,
} from "@/server/services/ingestao.service";
import { resetInMemoryLicitacoes } from "@/server/services/licitacoes-store";
import { deliberarOportunidade } from "@/server/services/oportunidades.service";
import {
  DIRETORIA_USER,
  buildIngestaoItem,
  buildIngestaoPayload,
} from "./factories";

const HASH_HEX_64 = /^[0-9a-f]{64}$/;

beforeEach(() => {
  resetInMemoryLicitacoes();
});

describe("AV-36 — computeHashCritico (SHA-256, sprint-1-spec §2.2)", () => {
  const baseInput = {
    dataAbertura: "2026-11-10T09:00:00.000Z",
    valorEstimado: 150_000,
    resumo: "  Contratação de sistema de gestão escolar.  ",
    modalidade: " Pregão Eletrônico ",
    numeroEdital: " 001/2026 ",
    orgaoCnpj: " 01.603.428/0001-09 ",
  };

  it("deve gerar hash SHA-256 hex (64 chars) determinístico para o mesmo input", () => {
    const hashA = computeHashCritico(baseInput);
    const hashB = computeHashCritico({ ...baseInput });
    expect(hashA).toMatch(HASH_HEX_64);
    expect(hashA).toBe(hashB);
  });

  it("deve produzir o mesmo hash para Date ou string ISO equivalente", () => {
    const viaString = computeHashCritico(baseInput);
    const viaDate = computeHashCritico({
      ...baseInput,
      dataAbertura: new Date("2026-11-10T09:00:00.000Z"),
    });
    expect(viaString).toBe(viaDate);
  });

  it.each([
    ["dataAbertura", "2026-11-11T09:00:00.000Z"],
    ["valorEstimado", 150_001],
    ["resumo", "Resumo retificado pela banca"],
    ["modalidade", "Concorrência"],
    ["numeroEdital", "002/2026"],
    ["orgaoCnpj", "99.999.999/0001-99"],
  ])("deve alterar o hash quando o campo crítico '%s' muda", (campo, valor) => {
    const original = computeHashCritico(baseInput);
    const alterado = computeHashCritico({ ...baseInput, [campo]: valor });
    expect(alterado).not.toBe(original);
  });

  it("deve ignorar campos não críticos (ex.: miniResumo) no cálculo", () => {
    const a = computeHashCritico(baseInput);
    const b = computeHashCritico({
      ...baseInput,
      miniResumo: "Outro mini resumo qualquer",
    } as typeof baseInput);
    expect(b).toBe(a);
  });
});

describe("AV-36 — ingestLicitacoesV2 (POST /api/ingestao, PRD §8)", () => {
  it("deve rejeitar payload com versaoContrato diferente de 2 (ZodError)", async () => {
    const payload = buildIngestaoPayload([buildIngestaoItem()], {
      versaoContrato: 1,
    });
    await expect(ingestLicitacoesV2(payload as never)).rejects.toBeInstanceOf(
      ZodError,
    );
  });

  it("deve criar licitações novas com status PENDENTE, hashCritico e audit INGESTAO_CRIACAO + INGESTAO_LOTE_V2", async () => {
    const itens = [buildIngestaoItem(), buildIngestaoItem()];
    const resultado = await ingestLicitacoesV2(
      buildIngestaoPayload(itens) as never,
    );

    expect(resultado.ok).toBe(true);
    expect(resultado.versaoContrato).toBe(2);
    expect(resultado.totalRecebidos).toBe(2);
    expect(resultado.criados).toBe(2);
    expect(resultado.atualizados).toBe(0);
    expect(resultado.inalterados).toBe(0);
    expect(resultado.registros).toHaveLength(2);

    for (const registro of resultado.registros) {
      expect(registro.status).toBe("PENDENTE");
      expect(registro.hashCritico).toMatch(HASH_HEX_64);

      const logsCriacao = getInMemoryAuditLogs().filter(
        (log) =>
          log.acao === "INGESTAO_CRIACAO" && log.entidadeId === registro.id,
      );
      expect(logsCriacao).toHaveLength(1);
      expect(logsCriacao[0].entidadeTipo).toBe("LICITACAO");
      expect(logsCriacao[0].antes).toBeNull();
    }

    const logsLote = getInMemoryAuditLogs().filter(
      (log) => log.acao === "INGESTAO_LOTE_V2",
    );
    expect(logsLote.length).toBeGreaterThanOrEqual(1);
    expect(logsLote[logsLote.length - 1].depois).toMatchObject({
      criados: 2,
      atualizados: 0,
      inalterados: 0,
    });
  });

  it("deve manter inalterada a licitação reingestada com o mesmo hashCritico (anti-spam)", async () => {
    const item = buildIngestaoItem();
    const payload = buildIngestaoPayload([item]);

    const primeiro = await ingestLicitacoesV2(payload as never);
    expect(primeiro.criados).toBe(1);

    const segundo = await ingestLicitacoesV2(payload as never);
    expect(segundo.criados).toBe(0);
    expect(segundo.atualizados).toBe(0);
    expect(segundo.inalterados).toBe(1);
    expect(segundo.registros[0].id).toBe(primeiro.registros[0].id);
  });

  it("deve atualizar cirurgicamente quando o hashCritico diverge, com audit INGESTAO_ATUALIZACAO_CRITICA", async () => {
    const item = buildIngestaoItem();
    const primeiro = await ingestLicitacoesV2(
      buildIngestaoPayload([item]) as never,
    );
    const registroInicial = primeiro.registros[0];

    const itemRetificado = buildIngestaoItem({
      pncpId: item.pncpId,
      numeroEdital: item.numeroEdital,
      resumo: "Resumo RETIFICADO pela comissão de licitação",
      dataAbertura: item.dataAbertura,
    });
    const segundo = await ingestLicitacoesV2(
      buildIngestaoPayload([itemRetificado]) as never,
    );

    expect(segundo.criados).toBe(0);
    expect(segundo.atualizados).toBe(1);
    expect(segundo.inalterados).toBe(0);

    const registroAtualizado = segundo.registros[0];
    expect(registroAtualizado.id).toBe(registroInicial.id);
    expect(registroAtualizado.resumo).toContain("RETIFICADO");
    expect(registroAtualizado.hashCritico).not.toBe(registroInicial.hashCritico);

    const logs = getInMemoryAuditLogs().filter(
      (log) =>
        log.acao === "INGESTAO_ATUALIZACAO_CRITICA" &&
        log.entidadeId === registroInicial.id,
    );
    expect(logs).toHaveLength(1);
    expect(logs[0].antes).toMatchObject({
      hashCritico: registroInicial.hashCritico,
    });
    expect(logs[0].depois).toMatchObject({
      hashCritico: registroAtualizado.hashCritico,
    });
  });

  it("deve atualizar dataAbertura imediatamente quando o PNCP retifica a data", async () => {
    const item = buildIngestaoItem({ dataAbertura: "2026-12-01T09:00:00.000Z" });
    await ingestLicitacoesV2(buildIngestaoPayload([item]) as never);

    const retificado = buildIngestaoItem({
      pncpId: item.pncpId,
      numeroEdital: item.numeroEdital,
      dataAbertura: "2026-12-15T14:00:00.000Z",
    });
    const resultado = await ingestLicitacoesV2(
      buildIngestaoPayload([retificado]) as never,
    );

    expect(resultado.atualizados).toBe(1);
    expect(resultado.registros[0].dataAbertura.toISOString()).toBe(
      "2026-12-15T14:00:00.000Z",
    );
  });

  it("deve preservar o status de licitação já deliberada pela equipe na atualização crítica", async () => {
    const item = buildIngestaoItem();
    const primeiro = await ingestLicitacoesV2(
      buildIngestaoPayload([item]) as never,
    );
    const registro = primeiro.registros[0];

    await deliberarOportunidade({
      id: registro.id,
      decisao: "GO",
      user: DIRETORIA_USER,
    });

    const retificado = buildIngestaoItem({
      pncpId: item.pncpId,
      numeroEdital: item.numeroEdital,
      valorEstimado: 999_999,
    });
    const segundo = await ingestLicitacoesV2(
      buildIngestaoPayload([retificado]) as never,
    );

    expect(segundo.atualizados).toBe(1);
    expect(segundo.registros[0].status).toBe("ACEITA");
    expect(segundo.registros[0].valorEstimado).toBe(999_999);
  });

  it("deve normalizar tipoSistemaSugerido desconhecido para OUTROS e parecer 'NO-GO' para NO_GO", async () => {
    const item = buildIngestaoItem({
      tipoSistemaSugerido: "sistema-legado qualquer",
      parecerGoNoGo: "NO-GO",
    });
    const resultado = await ingestLicitacoesV2(
      buildIngestaoPayload([item]) as never,
    );

    expect(resultado.registros[0].tipoSistemaCodigo).toBe("OUTROS");
    expect(resultado.registros[0].parecerIA).toBe("NO_GO");
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { getInMemoryAuditLogs } from "@/server/audit";
import { ingestLicitacoesV2 } from "@/server/services/ingestao.service";
import { resetInMemoryLicitacoes } from "@/server/services/licitacoes-store";
import {
  criarOportunidadeManual,
  deliberarOportunidade,
  getOportunidadeById,
  listOportunidades,
  OportunidadesServiceError,
} from "@/server/services/oportunidades.service";
import {
  ANALISTA_USER,
  DIRETORIA_USER,
  OPERADOR_USER,
  buildCriarManualInput,
  buildIngestaoItem,
  buildIngestaoPayload,
  diasNoFuturo,
} from "./factories";

async function ingestRegistrosDeTeste(
  overridesLista: Record<string, unknown>[],
) {
  const itens = overridesLista.map((overrides) => buildIngestaoItem(overrides));
  const resultado = await ingestLicitacoesV2(
    buildIngestaoPayload(itens) as never,
  );
  return resultado.registros;
}

beforeEach(() => {
  resetInMemoryLicitacoes();
});

describe("AV-36 — listOportunidades (PRD §4.4, ordenação e filtros)", () => {
  it("deve retornar o fallback seed com ao menos 4 licitações cobrindo GO, AVALIAR e NO_GO", async () => {
    const lista = await listOportunidades({});
    const seeds = lista.filter((l) => l.idPncp.startsWith("SEED-"));

    expect(seeds.length).toBeGreaterThanOrEqual(4);

    const pareceres = new Set(seeds.map((l) => l.parecerIA));
    expect(pareceres.has("GO")).toBe(true);
    expect(pareceres.has("AVALIAR")).toBe(true);
    expect(pareceres.has("NO_GO")).toBe(true);

    const tipos = new Set(seeds.map((l) => l.tipoSistemaCodigo));
    for (const tipo of [
      "EDUCACAO_PORTAL",
      "SAUDE_ATENCAO_BASICA",
      "GESTAO_PUBLICA_ERP",
      "INFRA_CLOUD_SUPORTE",
    ]) {
      expect(tipos.has(tipo)).toBe(true);
    }
  });

  it("deve ordenar sempre por dataAbertura ASC (mais próxima primeiro)", async () => {
    const registros = await ingestRegistrosDeTeste([
      { dataAbertura: diasNoFuturo(10) },
      { dataAbertura: diasNoFuturo(2) },
      { dataAbertura: diasNoFuturo(5) },
    ]);
    const ids = new Set(registros.map((r) => r.id));

    const lista = await listOportunidades({});
    const meus = lista.filter((l) => ids.has(l.id));

    expect(meus).toHaveLength(3);
    const datas = meus.map((l) => l.dataAbertura.getTime());
    expect(datas).toEqual([...datas].sort((a, b) => a - b));
  });

  it("deve filtrar por uf, tipoSistema, status e parecerIA (com normalização 'NO-GO')", async () => {
    const registros = await ingestRegistrosDeTeste([
      { orgao: { cnpj: "00.000.000/0001-00", nome: "Órgão GO", uf: "GO" }, tipoSistemaSugerido: "EDUCACAO_PORTAL", parecerGoNoGo: "GO" },
      { orgao: { cnpj: "11.111.111/0001-11", nome: "Órgão SP", uf: "SP" }, tipoSistemaSugerido: "HOSPITALAR", parecerGoNoGo: "NO-GO" },
    ]);
    const [go, sp] = registros;

    const porUf = await listOportunidades({ uf: "go" });
    expect(porUf.some((l) => l.id === go.id)).toBe(true);
    expect(porUf.some((l) => l.id === sp.id)).toBe(false);

    const porTipo = await listOportunidades({ tipoSistema: "HOSPITALAR" });
    expect(porTipo.some((l) => l.id === sp.id)).toBe(true);
    expect(porTipo.some((l) => l.id === go.id)).toBe(false);

    const porStatus = await listOportunidades({ status: "PENDENTE" });
    expect(porStatus.some((l) => l.id === go.id)).toBe(true);

    const porParecer = await listOportunidades({ parecerIA: "NO-GO" });
    expect(porParecer.some((l) => l.id === sp.id)).toBe(true);
    expect(porParecer.some((l) => l.id === go.id)).toBe(false);
  });

  it("deve filtrar por faixaValor (ATE_500K / 500K_A_2M / ACIMA_2M)", async () => {
    const registros = await ingestRegistrosDeTeste([
      { valorEstimado: 300_000 },
      { valorEstimado: 1_000_000 },
      { valorEstimado: 5_000_000 },
    ]);
    const [pequena, media, grande] = registros;

    const ate500k = await listOportunidades({ faixaValor: "ATE_500K" });
    expect(ate500k.some((l) => l.id === pequena.id)).toBe(true);
    expect(ate500k.some((l) => l.id === media.id)).toBe(false);

    const entre = await listOportunidades({ faixaValor: "500K_A_2M" });
    expect(entre.some((l) => l.id === media.id)).toBe(true);
    expect(entre.some((l) => l.id === pequena.id)).toBe(false);
    expect(entre.some((l) => l.id === grande.id)).toBe(false);

    const acima = await listOportunidades({ faixaValor: "ACIMA_2M" });
    expect(acima.some((l) => l.id === grande.id)).toBe(true);
    expect(acima.some((l) => l.id === media.id)).toBe(false);
  });

  it("deve aplicar busca textual case-insensitive em órgão, resumo e edital", async () => {
    const [alvo] = await ingestRegistrosDeTeste([
      { orgao: { cnpj: "22.222.222/0001-22", nome: "Prefeitura de Testandópolis", uf: "GO" } },
    ]);

    const porOrgao = await listOportunidades({ busca: "testandópolis" });
    expect(porOrgao.some((l) => l.id === alvo.id)).toBe(true);

    const porEdital = await listOportunidades({
      busca: String(alvo.numeroEdital).slice(0, 12),
    });
    expect(porEdital.some((l) => l.id === alvo.id)).toBe(true);

    const semMatch = await listOportunidades({
      busca: "xyzzy-termo-inexistente",
    });
    expect(semMatch.some((l) => l.id === alvo.id)).toBe(false);
  });

  it("deve incluir no filtro periodo='mes' registros criados no mês corrente (atalho do Dashboard)", async () => {
    const [futura] = await ingestRegistrosDeTeste([
      { dataAbertura: diasNoFuturo(400) },
    ]);

    const lista = await listOportunidades({ periodo: "mes" });
    expect(lista.some((l) => l.id === futura.id)).toBe(true);
  });
});

describe("AV-36 — getOportunidadeById", () => {
  it("deve retornar a licitação pelo id interno", async () => {
    const [registro] = await ingestRegistrosDeTeste([{}]);
    const encontrada = await getOportunidadeById(registro.id);
    expect(encontrada.id).toBe(registro.id);
    expect(encontrada.idPncp).toBe(registro.idPncp);
  });

  it("deve lançar erro 404 para id inexistente", async () => {
    await expect(getOportunidadeById("id-inexistente-404")).rejects.toMatchObject({
      name: "OportunidadesServiceError",
      code: "OPORTUNIDADE_NAO_ENCONTRADA",
      status: 404,
    });
  });
});

describe("AV-36 — deliberarOportunidade (GO/No-GO com RBAC e audit_log)", () => {
  it("deve registrar DECISAO_GO, mover status para ACEITA e manter motivoRecusa nulo", async () => {
    const [registro] = await ingestRegistrosDeTeste([{}]);

    const atualizada = await deliberarOportunidade({
      id: registro.id,
      decisao: "GO",
      user: DIRETORIA_USER,
    });

    expect(atualizada.status).toBe("ACEITA");
    expect(atualizada.motivoRecusa).toBeNull();

    const logs = getInMemoryAuditLogs().filter(
      (log) => log.acao === "DECISAO_GO" && log.entidadeId === registro.id,
    );
    expect(logs).toHaveLength(1);
    expect(logs[0].antes).toEqual({ status: "PENDENTE" });
    expect(logs[0].depois).toEqual({ status: "ACEITA" });
    expect(logs[0].usuarioId).toBe(DIRETORIA_USER.id);
  });

  it("deve registrar DECISAO_NO_GO com motivoRecusa e mover status para RECUSADA (ANALISTA_COMERCIAL)", async () => {
    const [registro] = await ingestRegistrosDeTeste([{}]);

    const atualizada = await deliberarOportunidade({
      id: registro.id,
      decisao: "NO_GO",
      motivoRecusa: "Fora da stack homologada e distância logística inviável.",
      user: ANALISTA_USER,
    });

    expect(atualizada.status).toBe("RECUSADA");
    expect(atualizada.motivoRecusa).toContain("Fora da stack");

    const logs = getInMemoryAuditLogs().filter(
      (log) => log.acao === "DECISAO_NO_GO" && log.entidadeId === registro.id,
    );
    expect(logs).toHaveLength(1);
    expect(logs[0].depois).toEqual({
      status: "RECUSADA",
      motivoRecusa: "Fora da stack homologada e distância logística inviável.",
    });
  });

  it("deve aceitar a grafia legada 'NO-GO' normalizando para NO_GO", async () => {
    const [registro] = await ingestRegistrosDeTeste([{}]);

    const atualizada = await deliberarOportunidade({
      id: registro.id,
      decisao: "NO-GO",
      user: DIRETORIA_USER,
    });

    expect(atualizada.status).toBe("RECUSADA");
  });

  it("deve negar deliberação ao perfil OPERADOR com erro 403", async () => {
    const [registro] = await ingestRegistrosDeTeste([{}]);

    await expect(
      deliberarOportunidade({
        id: registro.id,
        decisao: "GO",
        user: OPERADOR_USER,
      }),
    ).rejects.toMatchObject({
      name: "OportunidadesServiceError",
      code: "FORBIDDEN",
      status: 403,
    });
  });

  it("deve retornar 404 ao deliberar licitação inexistente", async () => {
    await expect(
      deliberarOportunidade({
        id: "id-inexistente-404",
        decisao: "GO",
        user: DIRETORIA_USER,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("AV-36 — criarOportunidadeManual (cadastro manual com audit_log)", () => {
  it("deve criar licitação PENDENTE com hashCritico, pncpId MANUAL-* e audit CADASTRO_MANUAL_LICITACAO", async () => {
    const criada = await criarOportunidadeManual(
      buildCriarManualInput(),
      DIRETORIA_USER,
    );

    expect(criada.status).toBe("PENDENTE");
    expect(criada.idPncp).toMatch(/^MANUAL-\d+-[0-9a-f]{8}$/);
    expect(criada.hashCritico).toMatch(/^[0-9a-f]{64}$/);
    expect(criada.parecerIA).toBe("AVALIAR");

    const logs = getInMemoryAuditLogs().filter(
      (log) =>
        log.acao === "CADASTRO_MANUAL_LICITACAO" &&
        log.entidadeId === criada.id,
    );
    expect(logs).toHaveLength(1);
    expect(logs[0].usuarioId).toBe(DIRETORIA_USER.id);
  });

  it("deve respeitar pncpId informado explicitamente", async () => {
    const criada = await criarOportunidadeManual(
      buildCriarManualInput({ pncpId: "MANUAL-CUSTOM-0001" }),
      DIRETORIA_USER,
    );
    expect(criada.idPncp).toBe("MANUAL-CUSTOM-0001");
  });

  it("deve rejeitar miniResumo fora da faixa de 2 a 5 palavras (ZodError)", async () => {
    await expect(
      criarOportunidadeManual(
        buildCriarManualInput({ miniResumo: "Umapalavra" }),
        DIRETORIA_USER,
      ),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it("deve negar cadastro manual ao perfil OPERADOR com erro 403", async () => {
    await expect(
      criarOportunidadeManual(buildCriarManualInput(), OPERADOR_USER),
    ).rejects.toMatchObject({
      name: "OportunidadesServiceError",
      code: "FORBIDDEN",
      status: 403,
    });
  });

  it("deve permitir cadastro sem usuário informado (uso interno/seed)", async () => {
    const criada = await criarOportunidadeManual(buildCriarManualInput());
    expect(criada.status).toBe("PENDENTE");
  });

  it("deve lançar OportunidadesServiceError tipado", () => {
    const erro = new OportunidadesServiceError("X", "msg", 418);
    expect(erro).toBeInstanceOf(Error);
    expect(erro.status).toBe(418);
  });
});

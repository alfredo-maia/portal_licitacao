import { beforeEach, describe, expect, it } from "vitest";
import {
  clearInMemoryLicitacoes,
  insertInMemoryLicitacao,
  setInMemoryTenantLicitacao,
} from "@/server/services/licitacoes-store";
import { getDashboardData } from "@/server/services/dashboard.service";

function buildDashboardLic(
  overrides: Partial<Parameters<typeof insertInMemoryLicitacao>[0]> = {},
) {
  const id = `PNCP-T3-${Math.random().toString(36).slice(2, 10)}`;
  const futuro = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
  return insertInMemoryLicitacao({
    idPncp: id,
    numeroControlePNCP: id,
    numeroEdital: `PE-${id.slice(-5)}`,
    orgaoNome: "Órgão Dashboard Teste",
    orgaoCnpj: "02.000.000/0001-00",
    uf: "GO",
    municipio: "Goiânia",
    esfera: "MUNICIPAL",
    poder: "EXECUTIVO",
    modalidade: "Pregão Eletrônico",
    modalidadeCodigo: 6,
    portalDisputa: "ComprasNet",
    miniResumo: "Compra de medicamentos",
    resumo: "Aquisição de medicamentos hospitalares para unidade de saúde.",
    valorEstimado: 250_000,
    dataAbertura: futuro,
    dataEncerramentoProposta: futuro,
    dataPublicacaoPncp: new Date(),
    dataUltimaAtualizacao: new Date(),
    status: "PENDENTE",
    parecerIA: "GO",
    justificativaIA: null,
    tipoSistemaCodigo: "OUTROS",
    segmentoMacro: "SAUDE",
    subcategorias: ["1401"],
    atestadosExigidos: [],
    motivoRecusa: null,
    quantidadeLotes: 1,
    loteUnico: true,
    precoPorLote: false,
    isPresencial: false,
    distanciaGoianiaKm: null,
    linkPncp: null,
    linkSistemaOrigem: null,
    hashCritico: null,
    valorArrematado: null,
    responsavelId: null,
    ...overrides,
  });
}

beforeEach(() => {
  clearInMemoryLicitacoes();
});

describe("Issue #59 (Task 3) — Dashboard agregado com vigência, dataPublicacaoPncp, perfil completo e resgatados", () => {
  it("contabiliza edital publicado no mês mesmo já encerrado em recebidas, mas exclui vencidos de aguardandoDecisao", async () => {
    const agora = new Date();
    const mes = agora.getMonth() + 1;
    const ano = agora.getFullYear();
    const inicioDoMes = new Date(Date.UTC(ano, mes - 1, 2, 12, 0, 0));
    const ontem = new Date(agora.getTime() - 24 * 60 * 60 * 1000);
    const amanha = new Date(agora.getTime() + 48 * 60 * 60 * 1000);

    // Publicado neste mês, já vencido
    buildDashboardLic({
      dataPublicacaoPncp: inicioDoMes,
      dataAbertura: ontem,
      dataEncerramentoProposta: ontem,
      miniResumo: "Vencido no mês",
    });

    // Publicado neste mês, ainda vigente
    buildDashboardLic({
      dataPublicacaoPncp: inicioDoMes,
      dataAbertura: amanha,
      dataEncerramentoProposta: amanha,
      miniResumo: "Vigente no mês",
    });

    const dash = await getDashboardData({
      mes,
      ano,
      tenantId: "tenant_dash_1",
      segmentosTenantAtivo: ["SAUDE"],
      subsegmentosTenantAtivo: ["1401"],
      ufsTenantAtivo: ["GO"],
    });

    expect(dash.cards.recebidas.total).toBe(2);
    expect(dash.cards.aguardandoDecisao.total).toBe(1);
    expect(dash.cards.aguardandoDecisao.recebidasNoMes).toBe(1);
  });

  it("não infla o mês atual com editais antigos ingeridos hoje via carga histórica (usa dataPublicacaoPncp)", async () => {
    const agora = new Date();
    const mesAtual = agora.getMonth() + 1;
    const anoAtual = agora.getFullYear();
    const jan2026 = new Date("2026-01-15T12:00:00.000Z");

    buildDashboardLic({
      dataPublicacaoPncp: jan2026,
      dataAbertura: new Date("2026-01-25T12:00:00.000Z"),
      dataEncerramentoProposta: new Date("2026-01-25T12:00:00.000Z"),
      miniResumo: "Edital histórico de janeiro",
    });

    const dashMesAtual = await getDashboardData({
      mes: mesAtual,
      ano: anoAtual,
      tenantId: "tenant_dash_hist",
      segmentosTenantAtivo: ["SAUDE"],
      ufsTenantAtivo: ["GO"],
    });
    const dashJan = await getDashboardData({
      mes: 1,
      ano: 2026,
      tenantId: "tenant_dash_hist",
      segmentosTenantAtivo: ["SAUDE"],
      ufsTenantAtivo: ["GO"],
    });

    expect(dashMesAtual.cards.recebidas.total).toBe(0);
    expect(dashMesAtual.cards.aguardandoDecisao.total).toBe(0);
    expect(dashJan.cards.recebidas.total).toBe(1);
  });

  it("filtra subsegmentos e UFs do tenant, mas sempre preserva editais OUTROS/outra UF resgatados no Kanban", async () => {
    const agora = new Date();
    const mes = agora.getMonth() + 1;
    const ano = agora.getFullYear();
    const passado = new Date(agora.getTime() - 5 * 24 * 60 * 60 * 1000);

    // Fora da UF e subsegmento diferente — deve ser excluído
    buildDashboardLic({
      uf: "SP",
      segmentoMacro: "SAUDE",
      subcategorias: ["1402"],
      miniResumo: "Fora do perfil SP",
    });

    // Edital OUTROS de outra UF (RJ), já encerrado, mas ACEITO pelo cliente via Histórico
    const resgatado = buildDashboardLic({
      uf: "RJ",
      segmentoMacro: "OUTROS",
      subcategorias: [],
      valorEstimado: 500_000,
      dataAbertura: passado,
      dataEncerramentoProposta: passado,
      miniResumo: "Resgatado via Histórico",
    });
    setInMemoryTenantLicitacao("tenant_resgate", resgatado.id, {
      statusKanban: "ACEITA",
      dataDecisao: agora,
    });

    const dash = await getDashboardData({
      mes,
      ano,
      tenantId: "tenant_resgate",
      segmentosTenantAtivo: ["SAUDE"],
      subsegmentosTenantAtivo: ["1401"],
      ufsTenantAtivo: ["GO"],
    });

    expect(dash.cards.recebidas.total).toBe(0);
    expect(dash.cards.aguardandoDecisao.total).toBe(0);
    expect(dash.cards.emPrecificacao.total).toBe(1);
    expect(dash.indicadores.volumeEmDisputa).toBe(500_000);
  });
});

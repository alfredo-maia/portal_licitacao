import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  deliberarOportunidade,
  listOportunidades,
  atualizarKanbanStatus,
} from "@/server/services/oportunidades.service";
import { getCalendarioData } from "@/server/services/calendario.service";
import {
  setInMemoryTenantLicitacao,
  listInMemoryTenantLicitacoes,
  insertInMemoryLicitacao,
  resetInMemoryLicitacoes,
} from "@/server/services/licitacoes-store";
import { inMemoryTenantUsers } from "@/server/services/tenant.service";

describe("Issue #28 — Isolamento Multi-Tenant do Funil Kanban (Minhas Licitações) e Calendário", () => {
  const tenantNovo = "tenant_novo_teste10";
  const userNovo = "usr_teste10";

  const tenantOutro = "tenant_outro_antigo";
  const userOutro = "usr_outro_antigo";

  beforeEach(() => {
    resetInMemoryLicitacoes();
    inMemoryTenantUsers.length = 0;

    // Registra membros
    inMemoryTenantUsers.push(
      {
        id: "tu_novo",
        tenantId: tenantNovo,
        userId: userNovo,
        userEmail: "teste10@gmail.com",
        userName: "Usuário Teste 10",
        role: "TITULAR",
        ativo: true,
        criadoEm: new Date(),
      },
      {
        id: "tu_outro",
        tenantId: tenantOutro,
        userId: userOutro,
        userEmail: "outro@aponta.cloud",
        userName: "Usuário Antigo",
        role: "TITULAR",
        ativo: true,
        criadoEm: new Date(),
      },
    );
  });

  it("1. Para um novo tenant sem deliberações, Minhas Licitações (status=TODOS) deve vir 100% zerada", async () => {
    // Insere licitação que no seed global tem status ACEITA
    insertInMemoryLicitacao({
      idPncp: "12345678000199-1-000001/2026",
      numeroEdital: "001/2026",
      orgaoNome: "PARANAVAI CONSORCIO INTERMUNICIPAL DE SAUDE",
      orgaoCnpj: "12345678000199",
      uf: "PR",
      municipio: "Paranavaí",
      esfera: "MUNICIPAL",
      poder: "EXECUTIVO",
      modalidade: "PREGAO_ELETRONICO",
      portalDisputa: "ComprasNet",
      miniResumo: "Empresa Especializada para o Fornecimento",
      resumo: "Fornecimento de medicamentos e insumos de saúde",
      valorEstimado: 18077.02,
      dataAbertura: new Date("2026-11-04T05:00:00.000Z"),
      dataEncerramentoProposta: new Date("2026-11-04T05:00:00.000Z"),
      dataPublicacaoPncp: new Date("2026-10-20T00:00:00.000Z"),
      status: "ACEITA", // Status global residual
      parecerIA: "GO",
      justificativaIA: "Dentro do ramo",
      tipoSistemaCodigo: "SAUDE",
      quantidadeLotes: 1,
      loteUnico: true,
      precoPorLote: true,
      isPresencial: false,
      distanciaGoianiaKm: 800,
      linkPncp: "https://pncp.gov.br",
    } as any);

    // Consulta Minhas Licitações com o tenant novo
    const minhasLicitacoes = await listOportunidades(
      { status: "TODOS" },
      tenantNovo,
    );

    // Deve retornar 0 licitações para o tenant novo, pois ele nunca deliberou esse certame
    expect(minhasLicitacoes.length).toBe(0);
  });

  it("2. Para um novo tenant sem deliberações, Calendário deve vir 100% limpo de certames", async () => {
    // Insere certames de novembro no store
    insertInMemoryLicitacao({
      idPncp: "22345678000199-1-000002/2026",
      numeroEdital: "002/2026",
      orgaoNome: "MUNICIPIO DE SIMOES",
      orgaoCnpj: "22345678000199",
      uf: "PI",
      municipio: "Simões",
      esfera: "MUNICIPAL",
      poder: "EXECUTIVO",
      modalidade: "PREGAO_ELETRONICO",
      portalDisputa: "ComprasNet",
      miniResumo: "Aquisição de Peças",
      resumo: "Peças para manutenção",
      valorEstimado: 50000,
      dataAbertura: new Date("2026-11-03T05:59:00.000Z"),
      dataEncerramentoProposta: new Date("2026-11-03T05:59:00.000Z"),
      dataPublicacaoPncp: new Date("2026-10-20T00:00:00.000Z"),
      status: "ACEITA",
      parecerIA: "GO",
      justificativaIA: "OK",
      tipoSistemaCodigo: "PECAS",
      quantidadeLotes: 1,
      loteUnico: true,
      precoPorLote: true,
      isPresencial: false,
      distanciaGoianiaKm: 1200,
      linkPncp: "https://pncp.gov.br",
    } as any);

    const calData = await getCalendarioData(
      { mes: 11, ano: 2026 },
      tenantNovo,
    );

    // O novo tenant não aceitou nenhuma licitação, então seu calendário deve conter 0 chips
    expect(calData.chips.length).toBe(0);
  });

  it("3. Quando tenantOutro aceita uma licitação, ela deve aparecer no seu Kanban e Calendário, mas continuar zerada para tenantNovo", async () => {
    const lic = insertInMemoryLicitacao({
      idPncp: "33345678000199-1-000003/2026",
      numeroEdital: "003/2026",
      orgaoNome: "MUNICIPIO DE CANDIDO DE ABREU",
      orgaoCnpj: "33345678000199",
      uf: "PR",
      municipio: "Cândido de Abreu",
      esfera: "MUNICIPAL",
      poder: "EXECUTIVO",
      modalidade: "PREGAO_ELETRONICO",
      portalDisputa: "ComprasNet",
      miniResumo: "Serviços Gerais",
      resumo: "Contratação de serviços",
      valorEstimado: 35000,
      dataAbertura: new Date("2026-11-04T05:00:00.000Z"),
      dataEncerramentoProposta: new Date("2026-11-04T05:00:00.000Z"),
      dataPublicacaoPncp: new Date("2026-10-20T00:00:00.000Z"),
      status: "PENDENTE",
      parecerIA: "GO",
      justificativaIA: "OK",
      tipoSistemaCodigo: "SERVICOS",
      quantidadeLotes: 1,
      loteUnico: true,
      precoPorLote: true,
      isPresencial: false,
      distanciaGoianiaKm: 900,
      linkPncp: "https://pncp.gov.br",
    } as any);

    // tenantOutro delibera 'GO' (ACEITA)
    await deliberarOportunidade({
      id: lic.id,
      decisao: "GO",
      user: { id: userOutro, role: "DIRETORIA", name: "Usuário Antigo", email: "outro@aponta.cloud" } as any,
      tenantId: tenantOutro,
    });

    // Para tenantOutro: deve aparecer em Minhas Licitações e no Calendário
    const minhasOutro = await listOportunidades({ status: "TODOS" }, tenantOutro);
    expect(minhasOutro.some((l) => l.id === lic.id)).toBe(true);

    const calOutro = await getCalendarioData({ mes: 11, ano: 2026 }, tenantOutro);
    expect(calOutro.chips.some((c) => c.id === lic.id)).toBe(true);

    // Para tenantNovo: DEVE CONTINUAR 100% ZERADO
    const minhasNovo = await listOportunidades({ status: "TODOS" }, tenantNovo);
    expect(minhasNovo.some((l) => l.id === lic.id)).toBe(false);

    const calNovo = await getCalendarioData({ mes: 11, ano: 2026 }, tenantNovo);
    expect(calNovo.chips.some((c) => c.id === lic.id)).toBe(false);
  });

  it("4. atualizarKanbanStatus deve persistir o status exclusivamente para o tenant informado", async () => {
    const lic = insertInMemoryLicitacao({
      idPncp: "44445678000199-1-000004/2026",
      numeroEdital: "004/2026",
      orgaoNome: "PREFEITURA DE TESTE",
      orgaoCnpj: "44445678000199",
      uf: "GO",
      municipio: "Goiânia",
      esfera: "MUNICIPAL",
      poder: "EXECUTIVO",
      modalidade: "PREGAO_ELETRONICO",
      portalDisputa: "ComprasNet",
      miniResumo: "Teste Kanban",
      resumo: "Resumo",
      valorEstimado: 100000,
      dataAbertura: new Date("2026-11-10T10:00:00.000Z"),
      dataEncerramentoProposta: new Date("2026-11-10T10:00:00.000Z"),
      dataPublicacaoPncp: new Date("2026-10-20T00:00:00.000Z"),
      status: "PENDENTE",
      parecerIA: "GO",
      justificativaIA: "OK",
      tipoSistemaCodigo: "TESTE",
      quantidadeLotes: 1,
      loteUnico: true,
      precoPorLote: true,
      isPresencial: false,
      distanciaGoianiaKm: 10,
      linkPncp: "https://pncp.gov.br",
    } as any);

    // tenantOutro move para ANALISE_TECNICA
    await atualizarKanbanStatus(
      lic.id,
      { status: "ANALISE_TECNICA" },
      { id: userOutro, role: "DIRETORIA", name: "Usuário Antigo", email: "outro@aponta.cloud" } as any,
      undefined,
      tenantOutro,
    );

    const minhasOutro = await listOportunidades({ status: "ANALISE_TECNICA" }, tenantOutro);
    expect(minhasOutro.some((l) => l.id === lic.id)).toBe(true);

    const minhasNovo = await listOportunidades({ status: "ANALISE_TECNICA" }, tenantNovo);
    expect(minhasNovo.some((l) => l.id === lic.id)).toBe(false);
  });
});

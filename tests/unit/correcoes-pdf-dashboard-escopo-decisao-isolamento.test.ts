import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import {
  atualizarConfiguracaoEmpresa,
  obterConfiguracaoEmpresa,
} from "@/server/services/configuracoes.service";
import { getDashboardData } from "@/server/services/dashboard.service";
import {
  deliberarOportunidade,
  listOportunidades,
} from "@/server/services/oportunidades.service";
import {
  criarDocumento,
  listarDocumentos,
} from "@/server/services/documentos.service";
import {
  criarPortal,
  listarPortais,
} from "@/server/services/portais.service";
import {
  insertInMemoryLicitacao,
  resetInMemoryLicitacoes,
} from "@/server/services/licitacoes-store";
import {
  inMemoryTenants,
  inMemoryTenantUsers,
} from "@/server/services/tenant.service";

describe("Issue #29 — Correções de Correcoes.pdf", () => {
  const tenant1 = "tenant_cnpj_1";
  const user1 = "user_titular_1";

  const tenant2 = "tenant_cnpj_2";
  const user2 = "user_titular_2";

  beforeEach(() => {
    resetInMemoryLicitacoes();
    inMemoryTenants.clear();
    inMemoryTenantUsers.length = 0;

    // Registra Tenant 1
    inMemoryTenants.set(tenant1, {
      id: tenant1,
      cnpj: "11111111000111",
      razaoSocial: "Empresa 1 LTDA",
      nomeFantasia: "Empresa Um",
      plano: "PRO",
      billingStatus: "ATIVO",
      maxCnpjs: 2,
      maxUsers: 5,
      ativo: true,
      segmentos: ["ENGENHARIA_OBRAS"],
      subsegmentos: ["PAVIMENTACAO"],
      ufs: ["GO"],
      brasilInteiro: false,
      criadoEm: new Date(),
      updatedAt: new Date(),
    });

    // Registra Tenant 2 (Sem segmentos inicialmente)
    inMemoryTenants.set(tenant2, {
      id: tenant2,
      cnpj: "22222222000122",
      razaoSocial: "Empresa 2 LTDA",
      nomeFantasia: "Empresa Dois",
      plano: "PRO",
      billingStatus: "ATIVO",
      maxCnpjs: 2,
      maxUsers: 5,
      ativo: true,
      segmentos: [],
      subsegmentos: [],
      ufs: [],
      brasilInteiro: false,
      criadoEm: new Date(),
      updatedAt: new Date(),
    });

    inMemoryTenantUsers.push(
      {
        id: "tu_1",
        tenantId: tenant1,
        userId: user1,
        userEmail: "titular1@empresa.com",
        userName: "Titular Empresa 1",
        role: "TITULAR",
        ativo: true,
        criadoEm: new Date(),
      },
      {
        id: "tu_2",
        tenantId: tenant2,
        userId: user2,
        userEmail: "titular2@empresa.com",
        userName: "Titular Empresa 2",
        role: "TITULAR",
        ativo: true,
        criadoEm: new Date(),
      },
    );
  });

  it("1. Dashboard: Quando tenant não possui segmentos, estrutura de cards e gráficos deve vir compatível (sem undefined)", async () => {
    // Busca dados do dashboard para o tenant2 sem segmentos
    const cfg = await obterConfiguracaoEmpresa(tenant2);
    expect(cfg.segmentos.length).toBe(0);

    // Valida getDashboardData para tenant sem segmentos
    const dados = await getDashboardData({
      mes: 11,
      ano: 2026,
      tenantId: tenant2,
      segmentosTenantAtivo: cfg.segmentos,
    });

    // A estrutura necessária pelo frontend NÃO pode ser undefined
    expect(dados).toBeDefined();
    expect(dados.cards).toBeDefined();
    expect(dados.cards.recebidas).toBeDefined();
    expect(dados.cards.recebidas.total).toBe(0);
    expect(dados.cards.aguardandoDecisao).toBeDefined();
    expect(dados.cards.aguardandoDecisao.total).toBe(0);
    expect(dados.cards.emPrecificacao).toBeDefined();
    expect(dados.cards.emPrecificacao.total).toBe(0);
    expect(dados.cards.recusadas).toBeDefined();
    expect(dados.cards.recusadas.total).toBe(0);

    expect(dados.resultados).toBeDefined();
    expect(dados.resultados.contempladas.total).toBe(0);
    expect(dados.indicadores).toBeDefined();
    expect(dados.indicadores.volumeEmDisputa).toBe(0);
    expect(Array.isArray(dados.indicadores.criticas72h)).toBe(true);
    expect(dados.indicadores.criticas72h.length).toBe(0);
    expect(Array.isArray(dados.topTipos)).toBe(true);
  });

  it("2. Configurações: Salvar Seção 5 (Segmentos, Subsegmentos e UF) deve persistir e refletir na leitura", async () => {
    // Altera os segmentos do tenant2
    const novosSegmentos = ["ALIMENTACAO_MERENDA", "SAUDE_MEDICAMENTOS"];
    const novosSubsegmentos = ["HORTIFRUTI", "CORRELATOS"];
    const novasUfs = ["SP", "RJ"];

    const atualizado = await atualizarConfiguracaoEmpresa(
      {
        razaoSocial: "Empresa 2 LTDA",
        cnpj: "22222222000122",
        segmentos: novosSegmentos,
        subsegmentos: novosSubsegmentos,
        ufs: novasUfs,
        brasilInteiro: false,
      },
      user2,
      tenant2,
    );

    expect(atualizado.segmentos).toEqual(novosSegmentos);
    expect(atualizado.subsegmentos).toEqual(novosSubsegmentos);
    expect(atualizado.ufs).toEqual(novasUfs);

    // Lê novamente a configuração do tenant2
    const lido = await obterConfiguracaoEmpresa(tenant2);
    expect(lido.segmentos).toEqual(novosSegmentos);
    expect(lido.subsegmentos).toEqual(novosSubsegmentos);
    expect(lido.ufs).toEqual(novasUfs);
    expect(lido.brasilInteiro).toBe(false);
  });

  it("3. Oportunidades: Usuário com perfil TITULAR deve poder deliberar GO e NO_GO", async () => {
    // Permissão RBAC deve conceder licitacao:decide para TITULAR
    const usuarioTitular = {
      id: user1,
      role: "TITULAR",
      tenantRole: "TITULAR",
      ativo: true,
    };
    expect(can(usuarioTitular as any, "licitacao:decide", "licitacao")).toBe(true);

    const lic = insertInMemoryLicitacao({
      idPncp: "99945678000199-1-000001/2026",
      numeroEdital: "PE 10/2026",
      orgaoNome: "Prefeitura Teste",
      orgaoCnpj: "99945678000199",
      uf: "GO",
      municipio: "Goiânia",
      esfera: "MUNICIPAL",
      poder: "EXECUTIVO",
      modalidade: "PREGAO_ELETRONICO",
      portalDisputa: "ComprasNet",
      miniResumo: "Obras e Pavimentação",
      resumo: "Pavimentação asfáltica",
      valorEstimado: 250000,
      dataAbertura: new Date("2026-11-20T10:00:00Z"),
      dataEncerramentoProposta: new Date("2026-11-20T10:00:00Z"),
      dataPublicacaoPncp: new Date("2026-10-20T00:00:00Z"),
      status: "PENDENTE",
      parecerIA: "GO",
      justificativaIA: "Dentro do ramo",
      tipoSistemaCodigo: "OBRAS",
      quantidadeLotes: 1,
      loteUnico: true,
      precoPorLote: true,
      isPresencial: false,
      distanciaGoianiaKm: 10,
      linkPncp: "https://pncp.gov.br",
    } as any);

    // Delibera GO
    const goResult = await deliberarOportunidade({
      id: lic.id,
      decisao: "GO",
      user: usuarioTitular as any,
      tenantId: tenant1,
    });
    expect(goResult.status).toBe("ACEITA");

    // Delibera NO_GO
    const noGoResult = await deliberarOportunidade({
      id: lic.id,
      decisao: "NO_GO",
      motivoRecusa: "Preço inexequível",
      user: usuarioTitular as any,
      tenantId: tenant1,
    });
    expect(noGoResult.status).toBe("RECUSADA");
  });

  it("4. Isolamento Multi-Tenant Estrito: Documentos, Portais e Licitações não devem se misturar entre CNPJs", async () => {
    // 1. Tenant 1 cadastra documento e portal
    const doc1 = await criarDocumento(
      {
        nome: "Contrato Social Tenant 1",
        categoria: "JURIDICA",
        semValidade: true,
      },
      user1,
      tenant1,
    );

    const portal1 = await criarPortal(
      {
        nome: "ComprasNet Tenant 1",
        url: "https://comprasnet.gov.br",
        login: "login_t1",
        status: "CADASTRADO",
        periodicidade: "GRATUITO",
        aceitaRobo: false,
        exigeCertificadoDigital: false,
      },
      user1,
      tenant1,
    );

    // Tenant 2 lista documentos e portais: NÃO deve ver nada do Tenant 1
    const docsT2 = await listarDocumentos({ tenantId: tenant2 });
    expect(docsT2.documentos.some((d) => d.id === doc1.id)).toBe(false);

    const portaisT2 = await listarPortais({ tenantId: tenant2 });
    expect(portaisT2.portais.some((p) => p.id === portal1.id)).toBe(false);

    // Tenant 1 lista: deve ver seus próprios registros
    const docsT1 = await listarDocumentos({ tenantId: tenant1 });
    expect(docsT1.documentos.some((d) => d.id === doc1.id)).toBe(true);

    const portaisT1 = await listarPortais({ tenantId: tenant1 });
    expect(portaisT1.portais.some((p) => p.id === portal1.id)).toBe(true);
  });
});

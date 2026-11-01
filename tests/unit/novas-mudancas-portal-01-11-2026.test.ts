import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  criarMembroEquipe,
  listarEquipe,
} from "@/server/services/configuracoes.service";
import {
  atualizarEquipe,
  buscarESincronizarArquivosEditalPncp,
  deliberarOportunidade,
  getOportunidadeById,
} from "@/server/services/oportunidades.service";
import { sintetizarMiniResumo } from "@/lib/resumo-licitacao";
import {
  insertInMemoryLicitacao,
  resetInMemoryLicitacoes,
  setInMemoryTenantLicitacao,
} from "@/server/services/licitacoes-store";
import {
  inMemoryTenants,
  inMemoryTenantUsers,
} from "@/server/services/tenant.service";

describe("Issue #30 — Novas Mudanças Portal (01/11/2026)", () => {
  const titularId = "usr_titular_principal";
  const tenant1 = "tenant_company_1";
  const tenant2 = "tenant_company_2";

  beforeEach(() => {
    resetInMemoryLicitacoes();
    inMemoryTenants.clear();
    inMemoryTenantUsers.length = 0;

    // Cadastra 2 CNPJs pertencentes ao mesmo titular
    inMemoryTenants.set(tenant1, {
      id: tenant1,
      cnpj: "97836341000133",
      razaoSocial: "NEW COMPANY LTDA",
      nomeFantasia: "New Company 1",
      plano: "PRO",
      billingStatus: "ATIVO",
      maxCnpjs: 2,
      maxUsers: 5,
      ativo: true,
      segmentos: ["OUTROS"],
      subsegmentos: [],
      ufs: ["PR", "GO"],
      brasilInteiro: true,
      criadoEm: new Date(),
      updatedAt: new Date(),
    });

    inMemoryTenants.set(tenant2, {
      id: tenant2,
      cnpj: "02279026000146",
      razaoSocial: "NEW COMPANY 2 LTDA",
      nomeFantasia: "New Company 2",
      plano: "PRO",
      billingStatus: "ATIVO",
      maxCnpjs: 2,
      maxUsers: 5,
      ativo: true,
      segmentos: ["OUTROS"],
      subsegmentos: [],
      ufs: ["PR", "GO"],
      brasilInteiro: true,
      criadoEm: new Date(),
      updatedAt: new Date(),
    });

    // O Titular é TITULAR de ambos os tenants
    inMemoryTenantUsers.push(
      {
        id: "tu_titular_1",
        tenantId: tenant1,
        userId: titularId,
        userEmail: "titular@newcompany.com",
        userName: "Titular New Company",
        role: "TITULAR",
        ativo: true,
        criadoEm: new Date(),
      },
      {
        id: "tu_titular_2",
        tenantId: tenant2,
        userId: titularId,
        userEmail: "titular@newcompany.com",
        userName: "Titular New Company",
        role: "TITULAR",
        ativo: true,
        criadoEm: new Date(),
      },
    );
  });

  it("1. Gestão de Equipe Multi-CNPJ: Colaborador adicionado deve aparecer em todos os CNPJs do titular", async () => {
    // Titular adiciona nova51@gmail.com com tenant1 ativo
    const novoMembro = await criarMembroEquipe(
      {
        name: "Colaborador Nova 51",
        email: "nova51@gmail.com",
        password: "Senha@Segura123",
        role: "ANALISTA_COMERCIAL",
        ativo: true,
      },
      titularId,
      { id: titularId, role: "DIRETORIA" },
      tenant1,
    );

    expect(novoMembro.email).toBe("nova51@gmail.com");

    // Consulta a equipe passando o CNPJ 1 (New Company 1)
    const equipeCnpj1 = await listarEquipe(tenant1, {
      id: titularId,
      email: "titular@newcompany.com",
      role: "DIRETORIA",
    });
    expect(equipeCnpj1.usuarios.some((u) => u.email === "nova51@gmail.com")).toBe(true);

    // Consulta a equipe passando o CNPJ 2 (New Company 2)
    const equipeCnpj2 = await listarEquipe(tenant2, {
      id: titularId,
      email: "titular@newcompany.com",
      role: "DIRETORIA",
    });
    // DEVE aparecer na aba Gestão da Equipe independente do CNPJ selecionado
    expect(equipeCnpj2.usuarios.some((u) => u.email === "nova51@gmail.com")).toBe(true);
  });

  it("2. Higienização do Objeto: Não forçar rótulo genérico de software em certames de outros segmentos", () => {
    // Caso real do PDF: Município de Peabiru (aquisição de óleos lubrificantes, graxas, fluidos de freio)
    const objetoPeabiru =
      "REGISTRO DE PREÇOS PARA AQUISIÇÃO DE ÓLEOS LUBRIFICANTES DIVERSOS, GRAXAS, ADITIVOS, ARLA 32 E FLUIDOS DE FREIO, DESTINADOS À MANUTENÇÃO DE VEÍCULOS, MÁQUINAS E EQUIPAMENTOS DA FROTA DO MUNICÍPIO DE PEABIRU - PR.";
    const resumoPeabiru = sintetizarMiniResumo(objetoPeabiru, "OUTROS");

    // NÃO pode ser "Solução de Tecnologia da Informação e Software"
    expect(resumoPeabiru).not.toContain("Solução de Tecnologia da Informação");
    expect(resumoPeabiru.toLowerCase()).toMatch(/óleo|lubrificante|graxa|veículo/i);

    // Caso de Alimentação / Merenda Escolar
    const objetoMerenda =
      "CONTRATAÇÃO DE EMPRESA ESPECIALIZADA PARA FORNECIMENTO DE GÊNEROS ALIMENTÍCIOS PERECÍVEIS E NÃO PERECÍVEIS PARA A MERENDA ESCOLAR DA REDE MUNICIPAL";
    const resumoMerenda = sintetizarMiniResumo(objetoMerenda, "OUTROS");
    expect(resumoMerenda).not.toContain("Solução de Tecnologia da Informação");
    expect(resumoMerenda.toLowerCase()).toMatch(/gênero|alimento|merenda/i);

    // Caso legítimo de TI / Software
    const objetoTI = "CONTRATAÇÃO DE SOFTWARE COMO SERVIÇO (SAAS) PARA GESTÃO DA ASSISTÊNCIA SOCIAL (SUAS)";
    const resumoTI = sintetizarMiniResumo(objetoTI, "SUAS");
    expect(resumoTI).toContain("SaaS");
    expect(resumoTI).toContain("SUAS");
  });

  it("3. Dossiê /oportunidades/[id]: Deliberação e Equipe Operacional devem ser 100% isoladas por CNPJ", async () => {
    const licitacaoId = "lic_peabiru_001";
    insertInMemoryLicitacao({
      id: licitacaoId,
      idPncp: "98765432000188-1-000001/2026",
      numeroEdital: "001/2026",
      orgaoNome: "MUNICÍPIO DE PEABIRU",
      orgaoCnpj: "98765432000188",
      uf: "PR",
      objeto: "Aquisição de óleos lubrificantes e graxas",
      resumo: "Aquisição de óleos lubrificantes e graxas para frota municipal",
      valorEstimado: 85000,
      status: "PENDENTE",
      dataAbertura: new Date(Date.now() + 5 * 24 * 3600 * 1000),
    } as any);

    // Inicialmente, para ambos os tenants, a oportunidade é PENDENTE e sem equipe
    const inicialT1 = await getOportunidadeById(licitacaoId, tenant1);
    expect(inicialT1.status).toBe("PENDENTE");
    expect(inicialT1.responsavelId).toBeNull();
    expect(inicialT1.atribuidos.length).toBe(0);

    const inicialT2 = await getOportunidadeById(licitacaoId, tenant2);
    expect(inicialT2.status).toBe("PENDENTE");

    // CNPJ 1 (New Company 1) delibera como GO (Participar)
    await deliberarOportunidade({
      id: licitacaoId,
      decisao: "GO",
      tenantId: tenant1,
      user: { id: titularId, role: "DIRETORIA" },
    });

    // CNPJ 1 atribui coordenador e membro à equipe
    await atualizarEquipe(
      licitacaoId,
      {
        responsavelId: "usr_coordenador_t1",
        atribuidoIds: ["usr_membro_t1_a", "usr_membro_t1_b"],
      },
      { id: titularId, role: "DIRETORIA" },
      { usuarioId: titularId, usuarioNome: "Titular" },
      tenant1,
    );

    // Consulta sob o contexto do CNPJ 1: deve vir ACEITA com a equipe do CNPJ 1
    const aposT1 = await getOportunidadeById(licitacaoId, tenant1);
    expect(aposT1.status).toBe("ACEITA");
    expect(aposT1.responsavelId).toBe("usr_coordenador_t1");
    expect(aposT1.atribuidos.length).toBe(2);

    // Consulta sob o contexto do CNPJ 2: deve continuar PENDENTE e SEM equipe
    const aposT2 = await getOportunidadeById(licitacaoId, tenant2);
    expect(aposT2.status).toBe("PENDENTE");
    expect(aposT2.responsavelId).toBeNull();
    expect(aposT2.atribuidos.length).toBe(0);
  });

  it("4. Sincronização PNCP: Refletir com precisão quando não há anexos no PNCP", async () => {
    const licitacaoSemArquivos = "lic_sem_arquivos_001";
    insertInMemoryLicitacao({
      id: licitacaoSemArquivos,
      idPncp: "11223344000155-1-000099/2026",
      numeroEdital: "099/2026",
      orgaoNome: "CÂMARA DE TESTE",
      orgaoCnpj: "11223344000155",
      uf: "GO",
      objeto: "Serviço sem arquivos",
      resumo: "Serviço sem arquivos",
      valorEstimado: 15000,
      status: "PENDENTE",
      dataAbertura: new Date(Date.now() + 10 * 24 * 3600 * 1000),
    } as any);

    // Mock do fetch da API do PNCP retornando resposta 200 OK com array vazio de anexos
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("pncp.gov.br")) {
        return {
          ok: true,
          status: 200,
          json: async () => [],
        } as any;
      }
      return originalFetch(url);
    });

    try {
      const res = await buscarESincronizarArquivosEditalPncp(licitacaoSemArquivos);

      // Deve retornar contagem 0 e mensagem fidedigna sem falso positivo de sucesso com arquivos
      expect(res.sincronizados).toBe(0);
      expect(res.mensagem).toMatch(/nenhum arquivo/i);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

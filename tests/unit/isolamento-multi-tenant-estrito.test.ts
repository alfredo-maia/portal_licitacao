import { describe, expect, it, beforeEach } from "vitest";
import {
  resolveUserActiveTenantId,
  inMemoryTenants,
  inMemoryTenantUsers,
  resetInMemoryTenantStorage,
} from "@/server/services/tenant.service";
import { listarEquipe } from "@/server/services/configuracoes.service";
import {
  criarDocumento,
  listarDocumentos,
} from "@/server/services/documentos.service";
import {
  criarPortal,
  listarPortais,
} from "@/server/services/portais.service";

describe("Tarefa 2 — Isolamento Multi-Tenant Estrito (#26)", () => {
  beforeEach(() => {
    resetInMemoryTenantStorage();
  });

  it("resolveUserActiveTenantId não deve permitir acesso a tenant de terceiro via cookie forjado", async () => {
    // Registra Tenant 1 (Empresa Alfa) do Usuário 1
    inMemoryTenants.set("tenant_alfa", {
      id: "tenant_alfa",
      cnpj: "11111111000111",
      razaoSocial: "Empresa Alfa LTDA",
      plano: "PRO",
      maxCnpjs: 1,
      maxUsers: 5,
      ativo: true,
      criadoEm: new Date(),
      updatedAt: new Date(),
    });
    inMemoryTenantUsers.push({
      id: "tu_1",
      tenantId: "tenant_alfa",
      userId: "usr_alfa",
      userEmail: "alfa@empresa.com",
      userName: "Dono Alfa",
      role: "TITULAR",
      ativo: true,
      criadoEm: new Date(),
    });

    // Registra Tenant 2 (Empresa Beta) do Usuário 2
    inMemoryTenants.set("tenant_beta", {
      id: "tenant_beta",
      cnpj: "22222222000122",
      razaoSocial: "Empresa Beta LTDA",
      plano: "PRO",
      maxCnpjs: 1,
      maxUsers: 5,
      ativo: true,
      criadoEm: new Date(),
      updatedAt: new Date(),
    });
    inMemoryTenantUsers.push({
      id: "tu_2",
      tenantId: "tenant_beta",
      userId: "usr_beta",
      userEmail: "beta@empresa.com",
      userName: "Dono Beta",
      role: "TITULAR",
      ativo: true,
      criadoEm: new Date(),
    });

    // Se usr_beta tentar passar tenant_alfa no cookie, deve descartar e retornar seu próprio tenant_beta
    const resolvedTenant = await resolveUserActiveTenantId("usr_beta", "tenant_alfa");
    expect(resolvedTenant).toBe("tenant_beta");

    // Novo usuário sem nenhum tenant cadastrado passando cookie forjado deve retornar null
    const resolvedNovo = await resolveUserActiveTenantId("usr_novo", "tenant_alfa");
    expect(resolvedNovo).toBeNull();
  });

  it("listarEquipe deve exibir estritamente colaboradores do tenant ativo e nunca vazar dados de outro tenant", async () => {
    inMemoryTenantUsers.push(
      {
        id: "tu_alfa_1",
        tenantId: "tenant_alfa",
        userId: "usr_alfa_1",
        userEmail: "alfa1@empresa.com",
        userName: "Dono Alfa",
        role: "TITULAR",
        ativo: true,
        criadoEm: new Date(),
      },
      {
        id: "tu_alfa_2",
        tenantId: "tenant_alfa",
        userId: "usr_alfa_2",
        userEmail: "colab_alfa@empresa.com",
        userName: "Colaborador Alfa",
        role: "MEMBRO",
        ativo: true,
        criadoEm: new Date(),
      },
      {
        id: "tu_beta_1",
        tenantId: "tenant_beta",
        userId: "usr_beta_1",
        userEmail: "beta@empresa.com",
        userName: "Dono Beta",
        role: "TITULAR",
        ativo: true,
        criadoEm: new Date(),
      },
    );

    // Listar equipe para tenant_beta
    const equipeBeta = await listarEquipe("tenant_beta", {
      id: "usr_beta_1",
      name: "Dono Beta",
      email: "beta@empresa.com",
      role: "DIRETORIA",
    });

    const emailsBeta = equipeBeta.usuarios.map((u) => u.email);
    expect(emailsBeta).toContain("beta@empresa.com");
    expect(emailsBeta).not.toContain("alfa1@empresa.com");
    expect(emailsBeta).not.toContain("colab_alfa@empresa.com");
  });

  it("listarDocumentos e criarDocumento devem isolar dados estritamente por tenantId", async () => {
    await criarDocumento(
      {
        nome: "Contrato Social Alfa",
        categoria: "JURIDICA",
        semValidade: true,
      },
      "usr_alfa",
      "tenant_alfa",
    );

    await criarDocumento(
      {
        nome: "Contrato Social Beta",
        categoria: "JURIDICA",
        semValidade: true,
      },
      "usr_beta",
      "tenant_beta",
    );

    const docsAlfa = await listarDocumentos({ tenantId: "tenant_alfa" });
    const nomesAlfa = docsAlfa.documentos.map((d) => d.nome);
    expect(nomesAlfa).toContain("Contrato Social Alfa");
    expect(nomesAlfa).not.toContain("Contrato Social Beta");

    const docsBeta = await listarDocumentos({ tenantId: "tenant_beta" });
    const nomesBeta = docsBeta.documentos.map((d) => d.nome);
    expect(nomesBeta).toContain("Contrato Social Beta");
    expect(nomesBeta).not.toContain("Contrato Social Alfa");
  });

  it("listarPortais e criarPortal devem isolar dados estritamente por tenantId", async () => {
    await criarPortal(
      {
        nome: "ComprasNet Alfa",
        url: "https://comprasnet.gov.br",
        status: "CADASTRADO",
        periodicidade: "ANUAL",
        aceitaRobo: false,
        exigeCertificadoDigital: true,
      },
      "usr_alfa",
      "tenant_alfa",
    );

    await criarPortal(
      {
        nome: "LicitaNet Beta",
        url: "https://licitanet.com.br",
        status: "CADASTRADO",
        periodicidade: "ANUAL",
        aceitaRobo: true,
        exigeCertificadoDigital: false,
      },
      "usr_beta",
      "tenant_beta",
    );

    const portaisAlfa = await listarPortais({ tenantId: "tenant_alfa" });
    const nomesAlfa = portaisAlfa.portais.map((p) => p.nome);
    expect(nomesAlfa).toContain("ComprasNet Alfa");
    expect(nomesAlfa).not.toContain("LicitaNet Beta");

    const portaisBeta = await listarPortais({ tenantId: "tenant_beta" });
    const nomesBeta = portaisBeta.portais.map((p) => p.nome);
    expect(nomesBeta).toContain("LicitaNet Beta");
    expect(nomesBeta).not.toContain("ComprasNet Alfa");
  });
});


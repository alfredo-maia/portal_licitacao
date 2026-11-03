import { describe, it, expect, beforeEach, vi } from "vitest";
import { realizarCadastroConta } from "@/server/services/cadastro.service";
import { obterMeuPerfil, atualizarConfiguracaoEmpresa, atualizarMembroEquipe } from "@/server/services/configuracoes.service";
import { listOportunidades, buscarESincronizarArquivosEditalPncp, atualizarKanbanStatus } from "@/server/services/oportunidades.service";
import { clearInMemoryLicitacoes, insertInMemoryLicitacao, setInMemoryTenantLicitacao } from "@/server/services/licitacoes-store";
import { inMemoryTenants } from "@/server/services/tenant.service";
import { CATALOGO_MACRO_SEGMENTOS } from "@/server/schemas/segmentos.schema";

describe("Sprint Semana 02 - Pacote de Regras de Negócio e Melhorias (Issue #32)", () => {
  beforeEach(() => {
    clearInMemoryLicitacoes();
  });

  // =========================================================================
  // 1. Tela de Cadastro ➔ Sincronização de Telefone / WhatsApp
  // =========================================================================
  it("Item 1: deve persistir o whatsapp no telefone do User e retornar em obterMeuPerfil", async () => {
    const res = await realizarCadastroConta({
      nomeResponsavel: "Diretor Responsável",
      razaoSocial: "Semana 02 Tech Ltda",
      cnpj: "33.000.167/0001-01",
      whatsapp: "(62) 98888-7777",
      email: "diretor.semana2@empresa.com.br",
      senha: "SenhaForte@2026",
      segmentos: ["INFORMATICA"],
      subsegmentos: ["SOFTWARES_SAAS_LICENCAS"],
      ufs: ["GO"],
      brasilInteiro: false,
    });

    expect(res.ok).toBe(true);
    expect(res.userId).toBeDefined();

    const perfil = await obterMeuPerfil(res.userId, { email: "diretor.semana2@empresa.com.br" });
    expect(perfil.telefone).toContain("62988887777");
  });

  // =========================================================================
  // 2. Tela de Configurações ➔ Trava de 30 dias para Plano Básico
  // =========================================================================
  describe("Item 2: Trava de 30 dias para Plano Básico ao alterar Segmentos/UFs", () => {
    it("deve permitir a primeira alteração e registrar preferenciasUpdatedAt", async () => {
      const tenantId = "tenant_basico_1";
      inMemoryTenants.set(tenantId, {
        id: tenantId,
        cnpj: "11.222.333/0001-44",
        razaoSocial: "Cliente Basico Teste",
        plano: "BASICO",
        billingStatus: "ACTIVE",
        ativo: true,
        segmentos: ["ALIMENTACAO"],
        ufs: ["GO"],
        preferenciasUpdatedAt: null,
      } as any);

      const res = await atualizarConfiguracaoEmpresa(
        {
          razaoSocial: "Cliente Basico Teste",
          cnpj: "11.222.333/0001-44",
          segmentos: ["SAUDE"],
          subsegmentos: [],
          ufs: ["SP"],
          brasilInteiro: false,
        },
        "usr_123",
        tenantId,
      );

      expect(res.segmentos).toContain("SAUDE");
      const tenant = inMemoryTenants.get(tenantId);
      expect(tenant?.preferenciasUpdatedAt).toBeDefined();
    });

    it("deve bloquear alteração se decorridos menos de 30 dias no Plano Básico", async () => {
      const tenantId = "tenant_basico_bloqueado";
      const dezDiasAtras = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      inMemoryTenants.set(tenantId, {
        id: tenantId,
        cnpj: "11.222.333/0001-55",
        razaoSocial: "Cliente Basico Bloqueado",
        plano: "BASICO",
        billingStatus: "ACTIVE",
        ativo: true,
        segmentos: ["ALIMENTACAO"],
        ufs: ["GO"],
        preferenciasUpdatedAt: dezDiasAtras,
      } as any);

      await expect(
        atualizarConfiguracaoEmpresa(
          {
            razaoSocial: "Cliente Basico Bloqueado",
            cnpj: "11.222.333/0001-55",
            segmentos: ["INFORMATICA"],
            subsegmentos: [],
            ufs: ["DF"],
            brasilInteiro: false,
          },
          "usr_123",
          tenantId,
        ),
      ).rejects.toThrow(/30 dias/i);
    });

    it("deve permitir alterações ilimitadas para planos PRO ou ENTERPRISE", async () => {
      const tenantId = "tenant_pro_livre";
      const umDiaAtras = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
      inMemoryTenants.set(tenantId, {
        id: tenantId,
        cnpj: "11.222.333/0001-66",
        razaoSocial: "Cliente Pro Livre",
        plano: "PRO",
        billingStatus: "ACTIVE",
        ativo: true,
        segmentos: ["ALIMENTACAO"],
        ufs: ["GO"],
        preferenciasUpdatedAt: umDiaAtras,
      } as any);

      const res = await atualizarConfiguracaoEmpresa(
        {
          razaoSocial: "Cliente Pro Livre",
          cnpj: "11.222.333/0001-66",
          segmentos: ["INFORMATICA"],
          subsegmentos: [],
          ufs: ["DF", "GO", "SP"],
          brasilInteiro: false,
        },
        "usr_123",
        tenantId,
      );

      expect(res.segmentos).toContain("INFORMATICA");
    });
  });

  // =========================================================================
  // 3. Gestão de Equipe ➔ Bloqueio de auto-alteração de permissões do Diretor
  // =========================================================================
  describe("Item 3: Proteção do Próprio Cadastro do Diretor", () => {
    it("deve impedir que o próprio usuário altere seu cargo/permissões", async () => {
      await expect(
        atualizarMembroEquipe(
          "usr_diretor_1",
          { role: "ANALISTA_COMERCIAL" },
          "usr_diretor_1",
          { id: "usr_diretor_1", role: "DIRETORIA" },
          "tenant_1",
        ),
      ).rejects.toThrow(/não pode alterar seu próprio cargo/i);
    });
  });

  // =========================================================================
  // 4. Tela de Oportunidades ➔ Ordenação padrão (proposalDeadline DESC) e Filtro de Período
  // =========================================================================
  describe("Item 4: Ordenação padrão por Data Limite DESC e Filtro de Período", () => {
    it("deve ordenar da data limite mais distante para a mais próxima por padrão", async () => {
      const hoje = new Date();
      const em10Dias = new Date(hoje.getTime() + 10 * 24 * 60 * 60 * 1000);
      const em30Dias = new Date(hoje.getTime() + 30 * 24 * 60 * 60 * 1000);
      const em5Dias = new Date(hoje.getTime() + 5 * 24 * 60 * 60 * 1000);

      insertInMemoryLicitacao({
        id: "lic_10d",
        idPncp: "PNCP-10D",
        numeroEdital: "PE 10/2026",
        orgaoNome: "Órgão A",
        orgaoCnpj: "00.000.000/0001-01",
        uf: "GO",
        modalidade: "Pregão Eletrônico",
        valorEstimado: 100000,
        dataAbertura: em10Dias,
        dataEncerramentoProposta: em10Dias,
      } as any);

      insertInMemoryLicitacao({
        id: "lic_30d",
        idPncp: "PNCP-30D",
        numeroEdital: "PE 30/2026",
        orgaoNome: "Órgão B",
        orgaoCnpj: "00.000.000/0001-02",
        uf: "GO",
        modalidade: "Pregão Eletrônico",
        valorEstimado: 200000,
        dataAbertura: em30Dias,
        dataEncerramentoProposta: em30Dias,
      } as any);

      insertInMemoryLicitacao({
        id: "lic_5d",
        idPncp: "PNCP-5D",
        numeroEdital: "PE 5/2026",
        orgaoNome: "Órgão C",
        orgaoCnpj: "00.000.000/0001-03",
        uf: "GO",
        modalidade: "Pregão Eletrônico",
        valorEstimado: 50000,
        dataAbertura: em5Dias,
        dataEncerramentoProposta: em5Dias,
      } as any);

      const lista = await listOportunidades({ ordenacao: "dataLimiteDesc" });
      expect(lista.length).toBeGreaterThanOrEqual(3);

      const indices = {
        lic_30d: lista.findIndex((l) => l.id === "lic_30d"),
        lic_10d: lista.findIndex((l) => l.id === "lic_10d"),
        lic_5d: lista.findIndex((l) => l.id === "lic_5d"),
      };

      // 30 dias (mais distante) deve vir antes de 10 dias, que deve vir antes de 5 dias
      expect(indices.lic_30d).toBeLessThan(indices.lic_10d);
      expect(indices.lic_10d).toBeLessThan(indices.lic_5d);
    });

    it("deve filtrar por data limite inicial e final", async () => {
      const d1 = "2026-11-10T10:00:00Z";
      const d2 = "2026-11-20T10:00:00Z";
      const d3 = "2026-12-01T10:00:00Z";

      insertInMemoryLicitacao({
        id: "lic_filtro_1",
        idPncp: "PNCP-F1",
        numeroEdital: "PE 01/2026",
        orgaoNome: "Órgão 1",
        orgaoCnpj: "00.000.000/0001-11",
        uf: "GO",
        modalidade: "Pregão Eletrônico",
        valorEstimado: 100000,
        dataAbertura: new Date(d1),
        dataEncerramentoProposta: new Date(d1),
      } as any);

      insertInMemoryLicitacao({
        id: "lic_filtro_2",
        idPncp: "PNCP-F2",
        numeroEdital: "PE 02/2026",
        orgaoNome: "Órgão 2",
        orgaoCnpj: "00.000.000/0001-22",
        uf: "GO",
        modalidade: "Pregão Eletrônico",
        valorEstimado: 100000,
        dataAbertura: new Date(d2),
        dataEncerramentoProposta: new Date(d2),
      } as any);

      insertInMemoryLicitacao({
        id: "lic_filtro_3",
        idPncp: "PNCP-F3",
        numeroEdital: "PE 03/2026",
        orgaoNome: "Órgão 3",
        orgaoCnpj: "00.000.000/0001-33",
        uf: "GO",
        modalidade: "Pregão Eletrônico",
        valorEstimado: 100000,
        dataAbertura: new Date(d3),
        dataEncerramentoProposta: new Date(d3),
      } as any);

      const filtradas = await listOportunidades({
        dataLimiteInicio: "2026-11-15",
        dataLimiteFim: "2026-11-25",
      });

      const ids = filtradas.map((l) => l.id);
      expect(ids).toContain("lic_filtro_2");
      expect(ids).not.toContain("lic_filtro_1");
      expect(ids).not.toContain("lic_filtro_3");
    });
  });

  // =========================================================================
  // 5. Tela Oportunidades/[id] ➔ Persistência de Valores da Proposta
  // =========================================================================
  describe("Item 5: Valores da Proposta no Dossiê", () => {
    it("deve persistir valorProposta, lanceMinimo e valorHomologado no TenantLicitacao", async () => {
      insertInMemoryLicitacao({
        id: "lic_proposta_1",
        idPncp: "PNCP-PROP-1",
        numeroEdital: "PE 99/2026",
        orgaoNome: "Órgão Proposta",
        orgaoCnpj: "00.000.000/0001-99",
        uf: "GO",
        modalidade: "Pregão Eletrônico",
        valorEstimado: 500000,
        dataAbertura: new Date(),
      } as any);

      const atualizado = await atualizarKanbanStatus(
        "lic_proposta_1",
        {
          status: "CONTEMPLADA",
          valorArrematado: 450000,
          valorProposta: 480000,
          valorMinimo: 420000,
          valorHomologado: 450000,
        },
        { id: "usr_1", role: "DIRETORIA" } as any,
        undefined,
        "tenant_prop_1",
      );

      expect(atualizado.status).toBe("CONTEMPLADA");
      expect(atualizado.lanceMinimo).toBe(420000);
      expect(atualizado.valorProposta).toBe(480000);
      expect(atualizado.valorHomologado).toBe(450000);
    });
  });

  // =========================================================================
  // 6. Aba Arquivos de Edital ➔ Sincronização Resiliente PNCP
  // =========================================================================
  describe("Item 6: Sincronização Resiliente do Edital PNCP", () => {
    it("deve sincronizar arquivos quando PNCP retornar documentos encapsulados e sequencial com zeros à esquerda", async () => {
      insertInMemoryLicitacao({
        id: "lic_anexo_1",
        idPncp: "12345678000199-1-000001/2026",
        numeroEdital: "PE 01/2026",
        orgaoNome: "Prefeitura Municipal",
        orgaoCnpj: "12.345.678/0001-99",
        uf: "GO",
        modalidade: "Pregão Eletrônico",
        valorEstimado: 300000,
        dataAbertura: new Date(),
        linkPncp: "https://pncp.gov.br/app/editais/12345678000199-1-000001/2026",
      } as any);

      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          documentos: [
            { titulo: "Edital_Oficial_PE01.pdf", url: "https://pncp.gov.br/arquivo1.pdf", tamanho: 2048 },
          ],
        }),
      } as any);

      const res = await buscarESincronizarArquivosEditalPncp("lic_anexo_1");
      expect(res.ok).toBe(true);
      expect(res.sincronizados).toBe(1);
      expect(res.arquivos.length).toBe(1);
      expect(res.arquivos[0].nome).toBe("Edital_Oficial_PE01.pdf");
    });
  });

  // =========================================================================
  // 7. Expansão de Segmentos e Subsegmentos
  // =========================================================================
  describe("Item 7: Expansão do Catálogo de Segmentos e Subsegmentos", () => {
    it("deve conter catálogo com os macro-segmentos e subsegmentos expandidos", () => {
      expect(Object.keys(CATALOGO_MACRO_SEGMENTOS).length).toBeGreaterThanOrEqual(7);
      expect(CATALOGO_MACRO_SEGMENTOS.ALIMENTACAO).toBeDefined();
      expect(CATALOGO_MACRO_SEGMENTOS.SAUDE).toBeDefined();
      expect(CATALOGO_MACRO_SEGMENTOS.INFORMATICA).toBeDefined();
    });
  });

  // =========================================================================
  // 8. Regra de Visibilidade Temporal para Novos Clientes (Janela 30 dias + Vigentes)
  // =========================================================================
  describe("Item 8: Janela de 30 dias retroativos + Licitações Vigentes", () => {
    it("não deve exibir licitações vencidas criadas há mais de 30 dias do cadastro do cliente", async () => {
      const clienteCriadoEm = new Date("2026-11-01T00:00:00Z");
      const tenantId = "tenant_novo_cliente_1";
      inMemoryTenants.set(tenantId, {
        id: tenantId,
        cnpj: "99.888.777/0001-22",
        razaoSocial: "Novo Cliente 01/11",
        plano: "PRO",
        billingStatus: "ACTIVE",
        ativo: true,
        segmentos: ["ALIMENTACAO"],
        ufs: ["GO"],
        criadoEm: clienteCriadoEm,
      } as any);

      // 1. Licitação criada há 60 dias (01/09) e vencida há 50 dias (11/09) -> NÃO DEVE APARECER
      insertInMemoryLicitacao({
        id: "lic_antiga_vencida",
        idPncp: "PNCP-ANTIGA-VENCIDA",
        numeroEdital: "PE 01/ANTIGO",
        orgaoNome: "Órgão Antigo",
        orgaoCnpj: "00.000.000/0001-99",
        uf: "GO",
        modalidade: "Pregão Eletrônico",
        valorEstimado: 100000,
        criadoEm: new Date("2026-09-01T00:00:00Z"),
        dataAbertura: new Date("2026-09-11T10:00:00Z"),
        dataEncerramentoProposta: new Date("2026-09-11T10:00:00Z"),
        segmentoMacro: "ALIMENTACAO",
      } as any);

      // 2. Licitação criada há 20 dias do cadastro (12/10) mesmo vencida em 20/10 -> DEVE APARECER (Janela 30 dias)
      insertInMemoryLicitacao({
        id: "lic_janela_30d",
        idPncp: "PNCP-JANELA-30D",
        numeroEdital: "PE 02/JANELA",
        orgaoNome: "Órgão Janela",
        orgaoCnpj: "00.000.000/0001-88",
        uf: "GO",
        modalidade: "Pregão Eletrônico",
        valorEstimado: 200000,
        criadoEm: new Date("2026-10-12T00:00:00Z"),
        dataAbertura: new Date("2026-10-20T10:00:00Z"),
        dataEncerramentoProposta: new Date("2026-10-20T10:00:00Z"),
        segmentoMacro: "ALIMENTACAO",
      } as any);

      // 3. Licitação antiga criada há 60 dias (01/09) mas com proposta vigente em 15/11 -> DEVE APARECER
      insertInMemoryLicitacao({
        id: "lic_antiga_vigente",
        idPncp: "PNCP-ANTIGA-VIGENTE",
        numeroEdital: "PE 03/VIGENTE",
        orgaoNome: "Órgão Vigente",
        orgaoCnpj: "00.000.000/0001-77",
        uf: "GO",
        modalidade: "Pregão Eletrônico",
        valorEstimado: 300000,
        criadoEm: new Date("2026-09-01T00:00:00Z"),
        dataAbertura: new Date("2026-11-15T10:00:00Z"),
        dataEncerramentoProposta: new Date("2026-11-15T10:00:00Z"),
        segmentoMacro: "ALIMENTACAO",
      } as any);

      const lista = await listOportunidades({}, tenantId);
      const ids = lista.map((l) => l.id);

      expect(ids).toContain("lic_janela_30d");
      expect(ids).toContain("lic_antiga_vigente");
      expect(ids).not.toContain("lic_antiga_vencida");
    });
  });
});

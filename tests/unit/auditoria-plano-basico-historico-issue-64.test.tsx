import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { listHistoricoLicitacoesPaginado } from "@/server/services/historico-licitacoes.service";
import {
  clearInMemoryLicitacoes,
  insertInMemoryLicitacao,
} from "@/server/services/licitacoes-store";
import {
  resetTenantSubscriptionCache,
  syncTenantSubscriptionState,
} from "@/hooks/use-tenant-subscription";

describe("Issue #64 — Trava do Histórico no Plano Básico (exceto Outros) + 8 Correções de Auditoria", () => {
  beforeEach(() => {
    clearInMemoryLicitacoes();
  });

  describe("1. Histórico de Licitações no Plano Básico — Encerradas liberadas e Abertas somente em OUTROS", () => {
    function seedHistoricoMix() {
      const agora = Date.now();
      const doisDiasAtras = new Date(agora - 2 * 24 * 60 * 60 * 1000);
      const tresDiasFrente = new Date(agora + 3 * 24 * 60 * 60 * 1000);

      // 1. Encerrada em SC / TECNOLOGIA (deve aparecer no Básico)
      insertInMemoryLicitacao({
        id: "hist_enc_sc_ti",
        idPncp: "pncp-enc-sc-ti",
        numeroEdital: "PE-001/2026",
        orgaoNome: "Prefeitura de Florianópolis",
        uf: "SC",
        municipio: "Florianópolis",
        modalidade: "PREGAO_ELETRONICO",
        segmentoMacro: "TECNOLOGIA",
        subcategorias: [],
        valorEstimado: 150000,
        dataAbertura: doisDiasAtras,
        dataEncerramentoProposta: doisDiasAtras,
        miniResumo: "Aquisição de computadores",
        resumo: "Aquisição de computadores e servidores",
        status: "PENDENTE",
      } as any);

      // 2. Aberta em SC / TECNOLOGIA (NÃO deve aparecer no Básico!)
      insertInMemoryLicitacao({
        id: "hist_aberta_sc_ti",
        idPncp: "pncp-aberta-sc-ti",
        numeroEdital: "PE-002/2026",
        orgaoNome: "Governo de Santa Catarina",
        uf: "SC",
        municipio: "Florianópolis",
        modalidade: "PREGAO_ELETRONICO",
        segmentoMacro: "TECNOLOGIA",
        subcategorias: [],
        valorEstimado: 300000,
        dataAbertura: tresDiasFrente,
        dataEncerramentoProposta: tresDiasFrente,
        miniResumo: "Compra de notebooks corporativos",
        resumo: "Compra de notebooks corporativos",
        status: "PENDENTE",
      } as any);

      // 3. Aberta em SC / OUTROS (DEVE aparecer no Básico!)
      insertInMemoryLicitacao({
        id: "hist_aberta_sc_outros",
        idPncp: "pncp-aberta-sc-outros",
        numeroEdital: "PE-003/2026",
        orgaoNome: "Prefeitura de Joinville",
        uf: "SC",
        municipio: "Joinville",
        modalidade: "PREGAO_ELETRONICO",
        segmentoMacro: "OUTROS",
        subcategorias: [],
        valorEstimado: 80000,
        dataAbertura: tresDiasFrente,
        dataEncerramentoProposta: tresDiasFrente,
        miniResumo: "Serviços diversos culturais",
        resumo: "Serviços diversos culturais",
        status: "PENDENTE",
      } as any);

      // 4. Aberta em PR / segmentoMacro null (tratada como OUTROS -> DEVE aparecer no Básico!)
      insertInMemoryLicitacao({
        id: "hist_aberta_pr_null",
        idPncp: "pncp-aberta-pr-null",
        numeroEdital: "PE-004/2026",
        orgaoNome: "Prefeitura de Curitiba",
        uf: "PR",
        municipio: "Curitiba",
        modalidade: "PREGAO_ELETRONICO",
        segmentoMacro: null,
        subcategorias: [],
        valorEstimado: 90000,
        dataAbertura: tresDiasFrente,
        dataEncerramentoProposta: tresDiasFrente,
        miniResumo: "Objeto legado sem macro",
        resumo: "Objeto legado sem macro",
        status: "PENDENTE",
      } as any);
    }

    it("bloqueia licitações ABERTAS de segmentos != OUTROS no Básico, mas libera ABERTAS de OUTROS e ENCERRADAS de qualquer segmento/UF", async () => {
      seedHistoricoMix();
      const hoje = new Date();
      const inicio = new Date(hoje.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const fim = new Date(hoje.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      // Básico buscando TODAS sem filtro de segmento -> vê encerrada TI + abertas OUTROS/null, NUNCA aberta TI!
      const todasBasico = await listHistoricoLicitacoesPaginado(
        { dataInicio: inicio, dataFim: fim, situacaoPrazo: "TODAS" },
        "tnt_basico_64",
        { restringirAbertasApenasOutros: true },
      );
      const idsTodas = todasBasico.itens.map((i) => i.id);
      expect(idsTodas).toContain("hist_enc_sc_ti");
      expect(idsTodas).toContain("hist_aberta_sc_outros");
      expect(idsTodas).toContain("hist_aberta_pr_null");
      expect(idsTodas).not.toContain("hist_aberta_sc_ti");

      // Básico tentando buscar ABERTAS + TECNOLOGIA + SC -> 0 resultados!
      const abertasTiBasico = await listHistoricoLicitacoesPaginado(
        {
          dataInicio: inicio,
          dataFim: fim,
          situacaoPrazo: "ABERTAS",
          segmento: "TECNOLOGIA",
          uf: "SC",
        },
        "tnt_basico_64",
        { restringirAbertasApenasOutros: true },
      );
      expect(abertasTiBasico.total).toBe(0);

      // Básico buscando ABERTAS + OUTROS -> retorna OUTROS e null em qualquer UF!
      const abertasOutrosBasico = await listHistoricoLicitacoesPaginado(
        {
          dataInicio: inicio,
          dataFim: fim,
          situacaoPrazo: "ABERTAS",
          segmento: "OUTROS",
        },
        "tnt_basico_64",
        { restringirAbertasApenasOutros: true },
      );
      expect(abertasOutrosBasico.itens.map((i) => i.id).sort()).toEqual([
        "hist_aberta_pr_null",
        "hist_aberta_sc_outros",
      ]);

      // Básico buscando ENCERRADAS + TECNOLOGIA + SC -> liberado!
      const encerradasTiBasico = await listHistoricoLicitacoesPaginado(
        {
          dataInicio: inicio,
          dataFim: fim,
          situacaoPrazo: "ENCERRADAS",
          segmento: "TECNOLOGIA",
          uf: "SC",
        },
        "tnt_basico_64",
        { restringirAbertasApenasOutros: true },
      );
      expect(encerradasTiBasico.itens.map((i) => i.id)).toEqual(["hist_enc_sc_ti"]);

      // Pro (sem restrição) buscando ABERTAS + TECNOLOGIA + SC -> liberado!
      const abertasTiPro = await listHistoricoLicitacoesPaginado(
        {
          dataInicio: inicio,
          dataFim: fim,
          situacaoPrazo: "ABERTAS",
          segmento: "TECNOLOGIA",
          uf: "SC",
        },
        "tnt_pro_64",
      );
      expect(abertasTiPro.itens.map((i) => i.id)).toEqual(["hist_aberta_sc_ti"]);
    });
  });

  describe("2. Auditoria — Cache no Logout, Modal 50 IA, Anti-Bypass Disputa, Hover ADM e Limpeza /configuracoes", () => {
    it("exporta resetTenantSubscriptionCache e syncTenantSubscriptionState e limpa cache no logout do AppShell", () => {
      expect(typeof resetTenantSubscriptionCache).toBe("function");
      expect(typeof syncTenantSubscriptionState).toBe("function");

      const appShellSrc = fs.readFileSync(
        path.join(process.cwd(), "src/components/shell/app-shell.tsx"),
        "utf8",
      );
      expect(appShellSrc).toContain("resetTenantSubscriptionCache");
      expect(appShellSrc).toContain("syncTenantSubscriptionState");
    });

    it("modal de cota IA em /oportunidades/[id] exibe 50 análises para Enterprise (zero menções a 30 análises)", () => {
      const dossieSrc = fs.readFileSync(
        path.join(process.cwd(), "src/app/oportunidades/[id]/page.tsx"),
        "utf8",
      );
      expect(dossieSrc).toContain("Enterprise (50 análises/mês)");
      expect(dossieSrc).toContain("teto mensal de 50 análises do plano Enterprise");
      expect(dossieSrc).not.toContain("30 análises/mês");
      expect(dossieSrc).not.toContain("teto mensal de 30 análises");
    });

    it("PATCH /api/oportunidades/[id] bloqueia disputaConfig no plano Básico com verificarPlanoMinimoNaRota", () => {
      const patchRouteSrc = fs.readFileSync(
        path.join(process.cwd(), "src/app/api/oportunidades/[id]/route.ts"),
        "utf8",
      );
      expect(patchRouteSrc).toContain("verificarPlanoMinimoNaRota");
      expect(patchRouteSrc).toContain("disputaConfig");
    });

    it("cards de Clientes 360° possuem classe CSS hover em globals.scss e dropzones de fachada foram removidos de /configuracoes", () => {
      const cssSrc = fs.readFileSync(
        path.join(process.cwd(), "src/app/globals.scss"),
        "utf8",
      );
      expect(cssSrc).toContain(".pncp-admin-cliente-card:hover");

      const clientesSrc = fs.readFileSync(
        path.join(process.cwd(), "src/components/admin/screens/ClientesScreen.tsx"),
        "utf8",
      );
      expect(clientesSrc).toContain("pncp-admin-cliente-card");

      const cfgSrc = fs.readFileSync(
        path.join(process.cwd(), "src/app/configuracoes/page.tsx"),
        "utf8",
      );
      expect(cfgSrc).not.toContain("dropzone-assinatura-digital");
      expect(cfgSrc).not.toContain("dropzone-csv-precos");
      expect(cfgSrc).toContain("dropzone-logo-empresa");
      expect(cfgSrc).toContain("dropzone-timbrado-empresa");
      expect(cfgSrc).toContain("aviso-timbrado-plano-basico");
    });
  });
});

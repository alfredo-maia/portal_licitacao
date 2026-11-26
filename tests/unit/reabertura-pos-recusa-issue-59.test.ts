import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearInMemoryLicitacoes,
  listInMemoryNotificacoesUsuario,
  resetInMemoryLicitacoes,
  setInMemoryTenantLicitacao,
} from "@/server/services/licitacoes-store";
import { ingestLicitacoesV2 } from "@/server/services/ingestao.service";
import {
  deliberarOportunidade,
  getOportunidadeById,
} from "@/server/services/oportunidades.service";
import { executarIngestaoDiariaPncp } from "@/server/services/pncp-ingestao-diaria.service";
import { REABERTA_POS_RECUSA_TAG } from "@/server/schemas/oportunidades.schema";
import { DIRETORIA_USER, buildIngestaoItem, buildIngestaoPayload } from "./factories";

beforeEach(() => {
  resetInMemoryLicitacoes();
  clearInMemoryLicitacoes();
  vi.restoreAllMocks();
});

describe("Issue #59 (Task 5) — Reabertura pós-recusa, silenciarNotificacoes e coleta /contratacoes/proposta", () => {
  it("reativa automaticamente TenantLicitacao RECUSADA para PENDENTE com tag REABERTA_POS_RECUSA sem alterar Kanban ACEITA", async () => {
    const prazoAntigo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const prazoProrrogado = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
    const pncpId = "99887766000100-1-000123/2026";

    const inicial = await ingestLicitacoesV2(
      buildIngestaoPayload([
        buildIngestaoItem({
          pncpId,
          dataAbertura: prazoAntigo,
          dataEncerramentoProposta: prazoAntigo,
        }),
      ]) as never,
    );
    const licId = inicial.registros[0].id;

    // Tenant A recusou o edital; Tenant B aceitou (está no Kanban)
    setInMemoryTenantLicitacao("tenant_recusou", licId, {
      statusKanban: "RECUSADA",
      motivoRecusa: "Prazo inicial inviável para cotação",
      tags: [],
    });
    setInMemoryTenantLicitacao("tenant_kanban", licId, {
      statusKanban: "ACEITA",
      tags: [],
    });

    // PNCP republica o edital com data de proposta prorrogada no futuro
    await ingestLicitacoesV2(
      buildIngestaoPayload([
        buildIngestaoItem({
          pncpId,
          dataAbertura: prazoAntigo,
          dataEncerramentoProposta: prazoProrrogado,
        }),
      ]) as never,
    );

    const dossieRecusou = await getOportunidadeById(licId, "tenant_recusou");
    expect(dossieRecusou.status).toBe("PENDENTE");
    expect(dossieRecusou.reabertaPosRecusa).toBe(true);
    expect(dossieRecusou.tags).toContain(REABERTA_POS_RECUSA_TAG);
    expect(dossieRecusou.motivoRecusa).toBe("Prazo inicial inviável para cotação");

    const dossieKanban = await getOportunidadeById(licId, "tenant_kanban");
    expect(dossieKanban.status).toBe("ACEITA");
    expect(dossieKanban.reabertaPosRecusa).toBe(false);

    // Quando o Tenant A delibera novamente, a flag reabertaPosRecusa é limpa
    await deliberarOportunidade({
      id: licId,
      decisao: "GO",
      user: DIRETORIA_USER,
      tenantId: "tenant_recusou",
    });
    const aposNovaDecisao = await getOportunidadeById(licId, "tenant_recusou");
    expect(aposNovaDecisao.status).toBe("ACEITA");
    expect(aposNovaDecisao.reabertaPosRecusa).toBe(false);
  });

  it("suprime notificação N1_COLETA_CONCLUIDA quando silenciarNotificacoes=true", async () => {
    await ingestLicitacoesV2({
      versaoContrato: 2,
      executadoEm: "2026-11-26T10:00:00Z",
      silenciarNotificacoes: true,
      usarIaTitulos: false,
      licitacoes: [buildIngestaoItem({ pncpId: "11223344000100-1-000001/2026" })],
    });

    const notifs = listInMemoryNotificacoesUsuario("seed_vitor");
    expect(notifs.some((n) => n.notificacao.tipo === "N1_COLETA_CONCLUIDA")).toBe(
      false,
    );
  });

  it("executarIngestaoDiariaPncp consulta também fase 2 /contratacoes/proposta quando incluirPropostasAbertas=true", async () => {
    const urlsChamadas: string[] = [];
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);
        urlsChamadas.push(url);
        return new Response(
          JSON.stringify({ data: [], totalPaginas: 1 }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

    await executarIngestaoDiariaPncp({
      origem: "SCRIPT",
      modalidades: [6],
      maxPaginasPorModalidade: 1,
      usarIa: false,
      incluirPropostasAbertas: true,
      maxPaginasPropostas: 1,
    });

    expect(fetchSpy).toHaveBeenCalled();
    expect(
      urlsChamadas.some((u) => u.includes("/api/consulta/v1/contratacoes/publicacao")),
    ).toBe(true);
    expect(
      urlsChamadas.some((u) => u.includes("/api/consulta/v1/contratacoes/atualizacao")),
    ).toBe(true);
  });
});

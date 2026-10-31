import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import DashboardPage from "@/app/dashboard/page";
import CalendarioPage from "@/app/calendario/page";
import NotificacoesPage from "@/app/notificacoes/page";
import { NotificationsBell } from "@/components/shell/notifications-bell";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("Sprint 3 — Frontend Dashboard, Calendário & Notificações (AV-54)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Dashboard Executivo (/dashboard)", () => {
    it("deve renderizar os 4 cards principais clicáveis, painel de desfechos, indicadores 72h e Top 4 sem mini-calendário", async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/dashboard")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              ok: true,
              periodo: {
                mes: 11,
                ano: 2026,
                inicioUtc: "2026-11-01T03:00:00.000Z",
                fimUtc: "2026-12-01T02:59:59.999Z",
              },
              cards: {
                recebidas: { total: 42 },
                aguardandoDecisao: { total: 15, recebidasNoMes: 12 },
                emPrecificacao: { total: 8 },
                recusadas: { total: 5 },
              },
              resultados: {
                contempladas: { total: 3, valorTotal: 3450000 },
                perdidasPreco: { total: 2 },
                perdidasDocumentacao: { total: 1 },
                desistencias: { total: 1 },
                impugnadas: { total: 1 },
                taxaConversaoPercentual: 50.0,
              },
              indicadores: {
                volumeEmDisputa: 12800000,
                viabilidadeIA: {
                  totalAnalisadas: 30,
                  goPercentual: 80.0,
                  noGoPercentual: 20.0,
                },
                criticas72h: [
                  {
                    id: "lic-critica-1",
                    numeroEdital: "099/2026",
                    orgaoNome: "Prefeitura de Goiânia",
                    dataAbertura: "2026-11-05T10:00:00.000Z",
                    segundosRestantes: 7200,
                    status: "ACEITA",
                  },
                ],
              },
              topTipos: [
                {
                  posicao: 1,
                  tipoSistemaCodigo: "EDUCACAO_PORTAL",
                  nome: "Portal de Educação",
                  total: 80,
                },
                {
                  posicao: 2,
                  tipoSistemaCodigo: "SAUDE_ATENCAO_BASICA",
                  nome: "Saúde / Atenção Básica",
                  total: 60,
                },
              ],
            }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByTestId("kpi-card-recebidas")).toBeInTheDocument();
        expect(screen.getByTestId("kpi-card-pendentes")).toBeInTheDocument();
        expect(screen.getByTestId("kpi-card-precificacao")).toBeInTheDocument();
        expect(screen.getByTestId("kpi-card-recusadas")).toBeInTheDocument();
      });

      // Validar links dos 4 cards principais
      expect(screen.getByTestId("kpi-card-recebidas").closest("a")).toHaveAttribute(
        "href",
        "/oportunidades?periodo=mes",
      );
      expect(screen.getByTestId("kpi-card-pendentes").closest("a")).toHaveAttribute(
        "href",
        "/oportunidades?status=PENDENTE",
      );
      expect(screen.getByTestId("kpi-card-precificacao").closest("a")).toHaveAttribute(
        "href",
        "/minhas-licitacoes",
      );
      expect(screen.getByTestId("kpi-card-recusadas").closest("a")).toHaveAttribute(
        "href",
        "/oportunidades?status=RECUSADA",
      );

      // Validar painel de desfecho e taxa de conversão
      expect(screen.getByTestId("painel-desfecho")).toBeInTheDocument();
      expect(screen.getByText("50%")).toBeInTheDocument();

      // Validar indicadores e contagem regressiva crítica
      expect(screen.getByTestId("indicadores-operacionais")).toBeInTheDocument();
      expect(screen.getByTestId("criticas-72h-panel")).toBeInTheDocument();
      expect(screen.getByText(/099\/2026 — Prefeitura de Goiânia/i)).toBeInTheDocument();

      // Sprint 6: Top 4 categorias removido para dar foco aos indicadores operacionais
      expect(screen.queryByTestId("top-tipos-panel")).toBeNull();

      // Regra explícita do PRD §4.1: SEM mini-calendário nesta tela
      expect(screen.queryByTestId("calendario-grid")).not.toBeInTheDocument();
      expect(screen.queryByText(/mini-calendário/i)).not.toBeInTheDocument();
    });
  });

  describe("2. Calendário de Certames (/calendario)", () => {
    it("deve renderizar a grade mensal com chips normais e opacos a 40%, e navegação", async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/calendario")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              ok: true,
              mes: 11,
              ano: 2026,
              chips: [
                {
                  id: "lic-cal-1",
                  numeroEdital: "010/2026",
                  orgaoNome: "Tribunal de Contas",
                  dataAbertura: "2026-11-10T14:00:00.000Z",
                  dia: 10,
                  status: "ACEITA",
                  opaco: false,
                  linkDestino: "/oportunidades/lic-cal-1",
                },
                {
                  id: "lic-cal-2",
                  numeroEdital: "020/2026",
                  orgaoNome: "Câmara Municipal",
                  dataAbertura: "2026-11-15T09:00:00.000Z",
                  dia: 15,
                  status: "NAO_CONTEMPLADA_PRECO",
                  opaco: true,
                  linkDestino: "/oportunidades/lic-cal-2",
                },
              ],
              alertasDocumentais: [],
            }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      render(<CalendarioPage />);

      await waitFor(() => {
        expect(screen.getByTestId("calendario-grid")).toBeInTheDocument();
      });

      const chips = screen.getAllByTestId("calendario-chip");
      expect(chips.length).toBe(2);

      // Chip normal
      expect(chips[0]).toHaveStyle({ opacity: "1" });
      expect(chips[0]).toHaveTextContent("Tribunal de Contas");
      expect(chips[0]).toHaveTextContent("ACEITA");

      // Chip opaco a 40% (perda/desistência/anulada)
      expect(chips[1]).toHaveStyle({ opacity: "0.4" });
      expect(chips[1]).toHaveTextContent("Câmara Municipal");

      // Clique no chip redireciona para detalhes
      fireEvent.click(chips[0]);
      expect(mockPush).toHaveBeenCalledWith("/oportunidades/lic-cal-1");
    });

    it("deve renderizar alertas documentais dentro da célula do dia correspondente e abaixo das licitações", async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/calendario")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              ok: true,
              mes: 11,
              ano: 2026,
              chips: [
                {
                  id: "lic-cal-26",
                  numeroEdital: "026/2026",
                  orgaoNome: "Prefeitura de Campinas",
                  titulo: "Serviço de Nuvem",
                  dataAbertura: "2026-11-26T10:00:00.000Z",
                  dataEncerramentoProposta: "2026-11-26T10:00:00.000Z",
                  dia: 26,
                  status: "ACEITA",
                  opaco: false,
                  linkDestino: "/oportunidades/lic-cal-26",
                },
              ],
              alertasDocumentais: [
                {
                  documentoId: "doc-venc-1",
                  titulo: "Certidão FGTS",
                  dia: 26,
                  mensagem: "⚠️ Certidão FGTS — Vencimento no dia 26/11 (Atualizar)",
                  linkDestino: "/documentacao",
                },
              ],
            }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      render(<CalendarioPage />);

      await waitFor(() => {
        expect(screen.getByTestId("calendario-grid")).toBeInTheDocument();
      });

      // 1. Não deve haver faixa de alerta no topo acima do calendário
      expect(screen.queryByTestId("alertas-documentais-banner")).not.toBeInTheDocument();

      // 2. O alerta deve estar presente dentro da célula do dia correspondente com o texto minimalista exato
      const alertaItem = screen.getByTestId("calendario-alerta-doc-venc-1");
      expect(alertaItem).toBeInTheDocument();
      expect(alertaItem).toHaveTextContent("Documento - Certidão FGTS (Atualizar)");
      // Sem ícone SVG
      expect(alertaItem.querySelector("svg")).toBeNull();

      // 3. O alerta deve estar posicionado abaixo do chip de licitação na célula
      const dia26Container = alertaItem.parentElement;
      const chipLic = screen.getByText("Prefeitura de Campinas").closest("[data-testid='calendario-chip']");
      expect(chipLic).toBeInTheDocument();
      expect(dia26Container).toContainElement(chipLic as HTMLElement);
      expect(dia26Container).toContainElement(alertaItem);

      // Verificar ordem dos nós no container (chip antes do alerta)
      const children = Array.from(dia26Container?.children || []);
      const chipIndex = children.indexOf(chipLic as HTMLElement);
      const alertaIndex = children.indexOf(alertaItem);
      expect(chipIndex).toBeLessThan(alertaIndex);

      // 4. Clicar no alerta redireciona para a página de documentação
      fireEvent.click(alertaItem);
      expect(mockPush).toHaveBeenCalledWith(expect.stringMatching(/\/documentacao/));
    });
  });

  describe("3. Motor de Notificações e Sino Global", () => {
    it("deve renderizar o sino global com contagem de não lidas e dropdown de avisos recentes", async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/notificacoes/resumo")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              ok: true,
              naoLidas: 2,
              recentes: [
                {
                  id: "notif-1",
                  tipo: "N1_COLETA_CONCLUIDA",
                  titulo: "Nova varredura PNCP concluída",
                  descricao: "15 editais capturados",
                  severidade: "INFO",
                  linkDestino: "/oportunidades?periodo=mes",
                  criadaEm: new Date().toISOString(),
                  lida: false,
                  lidaEm: null,
                },
              ],
            }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      render(<NotificationsBell />);

      await waitFor(() => {
        expect(screen.getByTestId("notifications-badge")).toHaveTextContent("2");
      });

      // Abrir dropdown
      fireEvent.click(screen.getByTestId("notifications-bell"));

      await waitFor(() => {
        expect(screen.getByTestId("notifications-dropdown")).toBeInTheDocument();
        expect(screen.getByText("Nova varredura PNCP concluída")).toBeInTheDocument();
      });
    });

    it("deve renderizar a tela de Notificações (/notificacoes) com botão de marcar todas e ponto azul", async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/notificacoes")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              ok: true,
              total: 1,
              naoLidas: 1,
              page: 1,
              pageSize: 10,
              totalPages: 1,
              notificacoes: [
                {
                  id: "notif-tela-1",
                  tipo: "N3_ABERTURA_AMANHA",
                  titulo: "Abertura amanhã: Pregão 001/2026",
                  descricao: "Abertura da sessão pública em menos de 24h",
                  severidade: "ATENCAO",
                  linkDestino: "/oportunidades/lic-1",
                  criadaEm: new Date().toISOString(),
                  lida: false,
                  lidaEm: null,
                },
              ],
            }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      render(<NotificacoesPage />);

      await waitFor(() => {
        expect(screen.getByTestId("btn-marcar-todas")).toBeInTheDocument();
        expect(screen.getByTestId("notification-card-notif-tela-1")).toBeInTheDocument();
        expect(screen.getByTestId("unread-dot")).toBeInTheDocument();
      });

      expect(screen.getByText("Abertura amanhã: Pregão 001/2026")).toBeInTheDocument();
      expect(screen.getByTestId("btn-marcar-lida")).toBeInTheDocument();
    });
  });
});

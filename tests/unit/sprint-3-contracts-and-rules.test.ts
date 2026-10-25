import { describe, it, expect } from "vitest";
import { ZodError } from "zod";
import {
  STATUS_CALENDARIO_NORMAL,
  STATUS_CALENDARIO_OPACO,
  STATUS_FORA_DO_CALENDARIO,
  STATUS_PIPELINE_ATIVO,
  STATUS_EM_PRECIFICACAO,
  STATUS_PERDA_COMPETITIVA,
  CALENDARIO_OPACIDADE_ENCERRADO,
  statusHistoricoInputSchema,
} from "@/server/schemas/status-grupos.schema";
import {
  dashboardQuerySchema,
  dashboardResponseSchema,
} from "@/server/schemas/dashboard.schema";
import {
  calendarioQuerySchema,
  calendarioResponseSchema,
} from "@/server/schemas/calendario.schema";
import {
  NOTIFICACAO_TIPOS,
  NOTIFICACAO_MATRIZ,
  NOTIFICACAO_TIPOS_SPRINT_3,
  NOTIFICACAO_N5_JANELA_HORAS,
  montarChaveIdempotencia,
  notificacaoCriarInputSchema,
  notificacoesListQuerySchema,
  notificacoesJobHeaderSchema,
  notificacoesResumoResponseSchema,
  notificacoesListResponseSchema,
  notificacaoMarcarLidasResponseSchema,
} from "@/server/schemas/notificacao.schema";
import { licitacaoStatusSchema } from "@/server/schemas/licitacao.schema";

describe("Sprint 3 [TDD RED/GREEN] — Contratos Arquiteturais e Regras de Negócio", () => {
  describe("1. Agrupamentos Canônicos de Status (status-grupos.schema.ts)", () => {
    it("deve cobrir exatamente os 15 status do enum LicitacaoStatus sem duplicidade no Calendário", () => {
      const todosStatus = licitacaoStatusSchema.options;
      expect(todosStatus).toHaveLength(15);

      const gruposCalendario = [
        ...STATUS_CALENDARIO_NORMAL,
        ...STATUS_CALENDARIO_OPACO,
        ...STATUS_FORA_DO_CALENDARIO,
      ];

      expect(gruposCalendario).toHaveLength(15);
      const conjunto = new Set(gruposCalendario);
      expect(conjunto.size).toBe(15);

      for (const status of todosStatus) {
        expect(conjunto.has(status)).toBe(true);
      }
    });

    it("deve definir IMPUGNADA como pertencente ao pipeline ativo e chips normais", () => {
      expect((STATUS_PIPELINE_ATIVO as readonly string[]).includes("IMPUGNADA")).toBe(true);
      expect((STATUS_CALENDARIO_NORMAL as readonly string[]).includes("IMPUGNADA")).toBe(true);
      expect((STATUS_CALENDARIO_OPACO as readonly string[]).includes("IMPUGNADA")).toBe(false);
    });

    it("deve definir PENDENTE e RECUSADA como expressamente fora do Calendário", () => {
      expect(STATUS_FORA_DO_CALENDARIO).toContain("PENDENTE");
      expect(STATUS_FORA_DO_CALENDARIO).toContain("RECUSADA");
      expect((STATUS_CALENDARIO_NORMAL as readonly string[]).includes("PENDENTE")).toBe(false);
      expect((STATUS_CALENDARIO_NORMAL as readonly string[]).includes("RECUSADA")).toBe(false);
    });

    it("deve validar opacidade padrão de 40% (0.4) para certames não contemplados/revogados", () => {
      expect(CALENDARIO_OPACIDADE_ENCERRADO).toBe(0.4);
    });

    it("deve validar o schema de registro de histórico de status", () => {
      const entradaValida = {
        licitacaoId: "lic_123",
        statusAnterior: "PENDENTE",
        statusNovo: "ACEITA",
        motivo: "Edital dentro do escopo comercial",
        usuarioId: "usr_456",
      };
      const res = statusHistoricoInputSchema.parse(entradaValida);
      expect(res.statusNovo).toBe("ACEITA");

      // Falha se faltar statusNovo
      expect(() =>
        statusHistoricoInputSchema.parse({
          licitacaoId: "lic_123",
        }),
      ).toThrow(ZodError);
    });
  });

  describe("2. Contratos e Validações do Dashboard (dashboard.schema.ts)", () => {
    it("deve validar query params opcionais de mês e ano com limites coerentes", () => {
      expect(dashboardQuerySchema.parse({})).toEqual({});
      expect(dashboardQuerySchema.parse({ mes: "10", ano: "2026" })).toEqual({
        mes: 10,
        ano: 2026,
      });

      // Mês inválido
      expect(() => dashboardQuerySchema.parse({ mes: "13" })).toThrow();
      expect(() => dashboardQuerySchema.parse({ mes: "0" })).toThrow();
      // Ano fora do range
      expect(() => dashboardQuerySchema.parse({ ano: "2020" })).toThrow();
    });

    it("deve aceitar resposta de dashboard com taxa de conversão nula quando denominador for 0", () => {
      const mockPayload = {
        ok: true,
        periodo: {
          mes: 10,
          ano: 2026,
          inicioUtc: new Date("2026-10-01T03:00:00.000Z"),
          fimUtc: new Date("2026-11-01T03:00:00.000Z"),
        },
        cards: {
          recebidas: { total: 10 },
          aguardandoDecisao: { total: 4, recebidasNoMes: 3 },
          emPrecificacao: { total: 5 },
          recusadas: { total: 2 },
        },
        resultados: {
          contempladas: { total: 0, valorTotal: 0 },
          perdidasPreco: { total: 0 },
          perdidasDocumentacao: { total: 0 },
          desistencias: { total: 0 },
          impugnadas: { total: 0 },
          taxaConversaoPercentual: null, // Sem disputas encerradas = null
        },
        indicadores: {
          volumeEmDisputa: 1500000,
          viabilidadeIA: {
            totalAnalisadas: 8,
            goPercentual: 75.0,
            noGoPercentual: 25.0,
          },
          criticas72h: [
            {
              id: "lic_crit_1",
              numeroEdital: "PE 12/2026",
              orgaoNome: "Prefeitura de Goiânia",
              dataAbertura: new Date("2026-10-26T14:00:00.000Z"),
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
            total: 25,
          },
        ],
      };

      const validado = dashboardResponseSchema.parse(mockPayload);
      expect(validado.ok).toBe(true);
      expect(validado.resultados.taxaConversaoPercentual).toBeNull();
      expect(validado.topTipos).toHaveLength(1);
    });

    it("deve rejeitar taxa de conversão superior a 100% ou negativa", () => {
      const basePayload = {
        ok: true,
        periodo: {
          mes: 10,
          ano: 2026,
          inicioUtc: new Date(),
          fimUtc: new Date(),
        },
        cards: {
          recebidas: { total: 0 },
          aguardandoDecisao: { total: 0, recebidasNoMes: 0 },
          emPrecificacao: { total: 0 },
          recusadas: { total: 0 },
        },
        resultados: {
          contempladas: { total: 1, valorTotal: 100 },
          perdidasPreco: { total: 0 },
          perdidasDocumentacao: { total: 0 },
          desistencias: { total: 0 },
          impugnadas: { total: 0 },
          taxaConversaoPercentual: 105.0, // Inválido (> 100)
        },
        indicadores: {
          volumeEmDisputa: 0,
          viabilidadeIA: { totalAnalisadas: 0, goPercentual: null, noGoPercentual: null },
          criticas72h: [],
        },
        topTipos: [],
      };

      expect(() => dashboardResponseSchema.parse(basePayload)).toThrow();
    });
  });

  describe("3. Contratos e Validações do Calendário (calendario.schema.ts)", () => {
    it("deve validar query params de mês e ano para o Calendário", () => {
      const parsed = calendarioQuerySchema.parse({ mes: "11", ano: "2026" });
      expect(parsed.mes).toBe(11);
      expect(parsed.ano).toBe(2026);
    });

    it("deve validar chips e alertas documentais no payload do Calendário", () => {
      const mockCalendario = {
        ok: true,
        mes: 11,
        ano: 2026,
        chips: [
          {
            id: "lic_cal_1",
            numeroEdital: "PE 99/2026",
            orgaoNome: "Tribunal de Justiça",
            dataAbertura: new Date("2026-11-10T12:00:00.000Z"),
            dia: 10,
            status: "EM_DISPUTA",
            opaco: false,
            linkDestino: "/oportunidades/lic_cal_1",
          },
          {
            id: "lic_cal_2",
            numeroEdital: "PE 101/2026",
            orgaoNome: "Secretaria de Saúde",
            dataAbertura: new Date("2026-11-15T12:00:00.000Z"),
            dia: 15,
            status: "NAO_CONTEMPLADA_PRECO",
            opaco: true,
            linkDestino: "/oportunidades/lic_cal_2",
          },
        ],
        alertasDocumentais: [],
      };

      const validado = calendarioResponseSchema.parse(mockCalendario);
      expect(validado.chips).toHaveLength(2);
      expect(validado.chips[0].opaco).toBe(false);
      expect(validado.chips[1].opaco).toBe(true);
      expect(validado.alertasDocumentais).toEqual([]);
    });
  });

  describe("4. Matriz do Motor de Notificações (notificacao.schema.ts)", () => {
    it("deve conter regras estritas para todos os 8 tipos de notificações N1 a N8", () => {
      for (const tipo of NOTIFICACAO_TIPOS) {
        expect(NOTIFICACAO_MATRIZ[tipo]).toBeDefined();
        expect(NOTIFICACAO_MATRIZ[tipo].destinatarios).toBeDefined();
        expect(NOTIFICACAO_MATRIZ[tipo].severidade).toBeDefined();
      }
    });

    it("deve definir N1 para TODOS e N2/N3/N4 para RESPONSAVEL_E_ATRIBUIDOS", () => {
      expect(NOTIFICACAO_MATRIZ.N1_COLETA_CONCLUIDA.destinatarios).toBe("TODOS");
      expect(NOTIFICACAO_MATRIZ.N2_LICITACAO_ATUALIZADA.destinatarios).toBe(
        "RESPONSAVEL_E_ATRIBUIDOS",
      );
      expect(NOTIFICACAO_MATRIZ.N3_ABERTURA_AMANHA.destinatarios).toBe(
        "RESPONSAVEL_E_ATRIBUIDOS",
      );
      expect(NOTIFICACAO_MATRIZ.N4_PRESENCIAL_PROXIMA.destinatarios).toBe(
        "RESPONSAVEL_E_ATRIBUIDOS",
      );
    });

    it("deve definir N5 para DIRETORIA_E_COMERCIAL e severidade CRITICA com janela de 72h", () => {
      expect(NOTIFICACAO_MATRIZ.N5_PENDENTE_CRITICA.destinatarios).toBe(
        "DIRETORIA_E_COMERCIAL",
      );
      expect(NOTIFICACAO_MATRIZ.N5_PENDENTE_CRITICA.severidade).toBe("CRITICA");
      expect(NOTIFICACAO_N5_JANELA_HORAS).toBe(72);
    });

    it("deve gerar chaves de idempotência determinísticas", () => {
      const chave1 = montarChaveIdempotencia({
        tipo: "N3_ABERTURA_AMANHA",
        entidadeId: "lic_999",
        janela: "2026-11-04",
      });
      const chave2 = montarChaveIdempotencia({
        tipo: "N3_ABERTURA_AMANHA",
        entidadeId: "lic_999",
        janela: "2026-11-04",
      });
      expect(chave1).toBe("N3_ABERTURA_AMANHA:lic_999:2026-11-04");
      expect(chave1).toBe(chave2);
    });

    it("deve validar filtro booleano apenasNaoLidas sem falha de coerção Zod", () => {
      const qFalse = notificacoesListQuerySchema.parse({ apenasNaoLidas: "false" });
      expect(qFalse.apenasNaoLidas).toBe(false);

      const qTrue = notificacoesListQuerySchema.parse({ apenasNaoLidas: "true" });
      expect(qTrue.apenasNaoLidas).toBe(true);

      expect(() =>
        notificacoesListQuerySchema.parse({ apenasNaoLidas: "invalid" }),
      ).toThrow();
    });

    it("deve exigir x-cron-secret com pelo menos 16 caracteres para o job de notificações", () => {
      expect(() =>
        notificacoesJobHeaderSchema.parse({ "x-cron-secret": "curto" }),
      ).toThrow();

      expect(
        notificacoesJobHeaderSchema.parse({
          "x-cron-secret": "segredo-forte-com-mais-de-16-chars",
        })["x-cron-secret"],
      ).toBe("segredo-forte-com-mais-de-16-chars");
    });
  });
});

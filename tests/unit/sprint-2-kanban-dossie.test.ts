import { describe, it, expect, vi } from "vitest";
import { ZodError } from "zod";
import {
  kanbanStatusUpdateSchema,
  STATUS_PERDA,
} from "@/server/schemas/kanban.schema";
import { equipeUpdateSchema } from "@/server/schemas/equipe.schema";
import { criarRepositorioSchema } from "@/server/schemas/repositorio.schema";
import { salvarAnaliseIASchema } from "@/server/schemas/analise-ia.schema";
import { oportunidadesFilterSchema } from "@/server/schemas/oportunidades.schema";

describe("Sprint 2 — TDD RED / GREEN Contratos & Regras de Negócio", () => {
  describe("1. Regras do Funil Kanban e Justificativa de Perda (PRD §4.3)", () => {
    it("deve permitir mover card para status ativo sem motivo de perda", () => {
      const payload = {
        status: "ANALISE_TECNICA",
      };
      const result = kanbanStatusUpdateSchema.parse(payload);
      expect(result.status).toBe("ANALISE_TECNICA");
      expect(result.motivoPerda).toBeUndefined();
    });

    it("deve exigir motivoPerda ao mover para status de perda por preço", () => {
      const payloadInvalido = {
        status: "NAO_CONTEMPLADA_PRECO",
      };
      expect(() => kanbanStatusUpdateSchema.parse(payloadInvalido)).toThrow(
        ZodError,
      );

      const payloadValido = {
        status: "NAO_CONTEMPLADA_PRECO",
        motivoPerda: "Concorrente ofertou lance 15% menor com margem agressiva",
      };
      const result = kanbanStatusUpdateSchema.parse(payloadValido);
      expect(result.status).toBe("NAO_CONTEMPLADA_PRECO");
      expect(result.motivoPerda).toContain("15% menor");
    });

    it("deve exigir motivoPerda para todos os status da lista STATUS_PERDA", () => {
      for (const status of STATUS_PERDA) {
        expect(() => kanbanStatusUpdateSchema.parse({ status })).toThrow();
        expect(() =>
          kanbanStatusUpdateSchema.parse({
            status,
            motivoPerda: "Justificativa obrigatória registrada",
          }),
        ).not.toThrow();
      }
    });
  });

  describe("2. Gestão de Equipe (Responsável Único + Atribuídos Múltiplos — PRD §4.4.1 B)", () => {
    it("deve validar payload de equipe com 1 responsável e múltiplos atribuídos", () => {
      const payload = {
        responsavelId: "user-diretor-1",
        atribuidoIds: ["user-analista-1", "user-dev-1", "user-dev-2"],
      };
      const result = equipeUpdateSchema.parse(payload);
      expect(result.responsavelId).toBe("user-diretor-1");
      expect(result.atribuidoIds).toHaveLength(3);
    });

    it("deve permitir desvincular o responsável com null", () => {
      const payload = {
        responsavelId: null,
        atribuidoIds: [],
      };
      const result = equipeUpdateSchema.parse(payload);
      expect(result.responsavelId).toBeNull();
      expect(result.atribuidoIds).toEqual([]);
    });
  });

  describe("3. Repositórios Similares para Benchmarking (PRD §4.4.1 E)", () => {
    it("deve validar repositório com nome e URL válidos", () => {
      const payload = {
        nome: "Sistema Escolar Open Source",
        url: "https://github.com/exemplo/gestao-escolar",
      };
      const result = criarRepositorioSchema.parse(payload);
      expect(result.nome).toBe("Sistema Escolar Open Source");
      expect(result.url).toBe("https://github.com/exemplo/gestao-escolar");
    });

    it("deve rejeitar URLs inválidas", () => {
      const payload = {
        nome: "Invalido",
        url: "not-a-valid-url",
      };
      expect(() => criarRepositorioSchema.parse(payload)).toThrow(ZodError);
    });
  });

  describe("4. Ferramenta IA: Verificar Status de Participação (PRD §4.4.1 F)", () => {
    it("deve validar payload completo do relatório gerado pela IA", () => {
      const payload = {
        scriptPrompt: "Analise a viabilidade técnica da licitação PE 42/2026...",
        relatorioTexto: "### Parecer de Viabilidade\n\nObjeto viável...",
        impedimentos: { ausencias: [], alertas: ["Certidão vence em 45 dias"] },
        viabilidade: { prazoEstimadoDias: 60, complexidade: "MEDIA" },
        custos: { infraMensal: 1200, totalEstimado: 14400 },
        precoSugerido: { valorMinimo: 850000, valorAlvo: 920000 },
      };
      const result = salvarAnaliseIASchema.parse(payload);
      expect(result.scriptPrompt).toContain("PE 42/2026");
      expect(result.precoSugerido.valorAlvo).toBe(920000);
    });

    it("deve exigir campos obrigatórios de scriptPrompt e relatorioTexto", () => {
      expect(() =>
        salvarAnaliseIASchema.parse({
          scriptPrompt: "",
          relatorioTexto: "",
        }),
      ).toThrow(ZodError);
    });
  });

  describe("5. Paginação na Listagem de Oportunidades (PRD §10 e sprint-2-spec §2.2)", () => {
    it("deve aceitar parâmetros page e pageSize e aplicar defaults", () => {
      const filtroVazio = oportunidadesFilterSchema.parse({});
      expect(filtroVazio.page).toBe(1);
      expect(filtroVazio.pageSize).toBe(10);

      const filtroCustom = oportunidadesFilterSchema.parse({
        page: "3",
        pageSize: "25",
        uf: "go",
      });
      expect(filtroCustom.page).toBe(3);
      expect(filtroCustom.pageSize).toBe(25);
      expect(filtroCustom.uf).toBe("GO");
    });
  });
});

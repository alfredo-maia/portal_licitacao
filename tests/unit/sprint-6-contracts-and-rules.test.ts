import { describe, expect, it } from "vitest";
import {
  configuracaoEmpresaAtualizarInputSchema,
  configuracaoEmpresaSchema,
  usuarioEquipeCriarInputSchema,
  usuarioRoleSchema,
} from "@/server/schemas/configuracao.schema";
import {
  auditViewerQuerySchema,
} from "@/server/schemas/audit-viewer.schema";

describe("Sprint 6 [TDD RED] — Contratos e Regras de Negócio (Configurações, Auditoria & RBAC)", () => {
  describe("1. Contrato de Dados Corporativos da Empresa Licitante", () => {
    it("deve validar dados válidos da empresa com valores padrão", () => {
      const empresaValida = {
        razaoSocial: "APONTA TECNOLOGIA E SERVICOS LTDA",
        cnpj: "12.345.678/0001-90",
        inscricaoEstadual: "10.123.456-7",
        cnae: "62.01-5-01 - Desenvolvimento de programas de computador",
        endereco: "Av. República do Líbano, 1200, Setor Oeste",
        cidade: "Goiânia",
        uf: "GO",
        cep: "74115-030",
        representanteNome: "Vítor Henrique de Souza",
        representanteCpf: "123.456.789-00",
        representanteCargo: "Sócio-Administrador",
        bancoNome: "Banco do Brasil",
        agencia: "1234-5",
        contaCorrente: "98765-4",
        chavePix: "12.345.678/0001-90",
      };

      const parsed = configuracaoEmpresaSchema.parse(empresaValida);
      expect(parsed.id).toBe("default");
      expect(parsed.razaoSocial).toBe("APONTA TECNOLOGIA E SERVICOS LTDA");
      expect(parsed.uf).toBe("GO");
    });

    it("deve rejeitar UF com tamanho diferente de 2 ou CNPJ inválido", () => {
      expect(() =>
        configuracaoEmpresaAtualizarInputSchema.parse({
          razaoSocial: "Empresa Teste",
          cnpj: "123", // curto demais
          endereco: "Rua 1",
          cidade: "Goiânia",
          uf: "GOIAS", // inválido, deve ter 2 caracteres
          cep: "74000-000",
          representanteNome: "Admin",
          representanteCpf: "12345678900",
          representanteCargo: "Diretor",
        }),
      ).toThrow();
    });
  });

  describe("2. Contratos de Gestão de Equipe & RBAC (Anexo 4)", () => {
    it("deve validar papéis permitidos no sistema", () => {
      expect(usuarioRoleSchema.parse("DIRETORIA")).toBe("DIRETORIA");
      expect(usuarioRoleSchema.parse("ANALISTA_COMERCIAL")).toBe("ANALISTA_COMERCIAL");
      expect(usuarioRoleSchema.parse("OPERADOR")).toBe("OPERADOR");
      expect(usuarioRoleSchema.parse("OPERADOR_TECNICO")).toBe("OPERADOR_TECNICO");
      expect(() => usuarioRoleSchema.parse("SUPER_ADMIN")).toThrow();
    });

    it("deve validar payload de criação de novo membro da equipe", () => {
      const payload = {
        name: "Carlos Ferreira",
        email: "carlos@aponta.cloud",
        role: "ANALISTA_COMERCIAL",
        password: "TempPassword123!",
      };

      const parsed = usuarioEquipeCriarInputSchema.parse(payload);
      expect(parsed.name).toBe("Carlos Ferreira");
      expect(parsed.role).toBe("ANALISTA_COMERCIAL");
      expect(parsed.ativo).toBe(true);

      // Email inválido deve falhar
      expect(() =>
        usuarioEquipeCriarInputSchema.parse({
          ...payload,
          email: "email-invalido",
        }),
      ).toThrow();
    });
  });

  describe("3. Contratos de Trilha de Auditoria (Audit Viewer)", () => {
    it("deve validar parâmetros de query com paginação padrão", () => {
      const query = auditViewerQuerySchema.parse({});
      expect(query.page).toBe(1);
      expect(query.pageSize).toBe(15);

      const queryFiltro = auditViewerQuerySchema.parse({
        entidadeTipo: "LICITACAO",
        acao: "MOVE_KANBAN",
        page: "2",
        pageSize: "30",
      });
      expect(queryFiltro.entidadeTipo).toBe("LICITACAO");
      expect(queryFiltro.acao).toBe("MOVE_KANBAN");
      expect(queryFiltro.page).toBe(2);
      expect(queryFiltro.pageSize).toBe(30);
    });
  });
});

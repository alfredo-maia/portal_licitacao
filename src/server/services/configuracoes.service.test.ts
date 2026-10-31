import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  atualizarMeuPerfil,
  obterMeuPerfil,
  criarMembroEquipe,
  atualizarMembroEquipe,
  normalizarEscopoPlano,
} from "./configuracoes.service";

describe("Task 2 — Configurações Service (Meu Perfil, Multi-CNPJ, Planos & Equipe)", () => {
  describe("1. Meu Perfil (Dados Pessoais, Endereço & Senha)", () => {
    it("deve obter perfil do usuário com campos de CPF, telefone e endereço", async () => {
      const perfil = await obterMeuPerfil("usr_test_1");
      expect(perfil).toBeDefined();
      expect(perfil).toHaveProperty("name");
      expect(perfil).toHaveProperty("email");
      expect(perfil).toHaveProperty("cpf");
      expect(perfil).toHaveProperty("telefone");
      expect(perfil).toHaveProperty("cep");
      expect(perfil).toHaveProperty("logradouro");
      expect(perfil).toHaveProperty("numero");
      expect(perfil).toHaveProperty("bairro");
      expect(perfil).toHaveProperty("cidade");
      expect(perfil).toHaveProperty("uf");
    });

    it("deve atualizar dados cadastrais e endereço em Meu Perfil", async () => {
      const atualizado = await atualizarMeuPerfil("usr_test_1", {
        name: "Carlos Eduardo Silva",
        cpf: "529.982.247-25",
        telefone: "(62) 98888-7777",
        cep: "74000-000",
        logradouro: "Rua 10",
        numero: "100",
        complemento: "Apto 302",
        bairro: "Setor Sul",
        cidade: "Goiânia",
        uf: "GO",
      });

      expect(atualizado.name).toBe("Carlos Eduardo Silva");
      expect(atualizado.cpf).toBe("529.982.247-25");
      expect(atualizado.telefone).toBe("(62) 98888-7777");
      expect(atualizado.cep).toBe("74000-000");
      expect(atualizado.logradouro).toBe("Rua 10");
      expect(atualizado.numero).toBe("100");
      expect(atualizado.bairro).toBe("Setor Sul");
      expect(atualizado.cidade).toBe("Goiânia");
      expect(atualizado.uf).toBe("GO");
    });

    it("deve permitir alteração de senha se coincidir confirmação e tiver pelo menos 6 caracteres", async () => {
      const res = await atualizarMeuPerfil("usr_test_1", {
        novaSenha: "NovaSenhaForte2026!",
        confirmarNovaSenha: "NovaSenhaForte2026!",
      });
      expect(res.ok).toBe(true);
    });

    it("deve rejeitar alteração de senha se a confirmação for divergente", async () => {
      await expect(
        atualizarMeuPerfil("usr_test_1", {
          novaSenha: "NovaSenhaForte2026!",
          confirmarNovaSenha: "Diferente123!",
        }),
      ).rejects.toThrow(/não coincidem/i);
    });

    it("deve rejeitar nova senha com menos de 6 caracteres", async () => {
      await expect(
        atualizarMeuPerfil("usr_test_1", {
          novaSenha: "12345",
          confirmarNovaSenha: "12345",
        }),
      ).rejects.toThrow(/mínimo .*6 caracteres/i);
    });
  });

  describe("2. Regras de Escopo por Plano (1 UF / 1 Segmento no Básico)", () => {
    it("deve permitir todas as UFs e múltiplos segmentos no plano TRIAL", () => {
      const res = normalizarEscopoPlano({
        plano: "BASICO",
        billingStatus: "TRIAL",
        segmentos: ["saude", "tecnologia", "obras"],
        ufs: ["GO", "SP", "RJ", "MG"],
        brasilInteiro: true,
      });

      expect(res.segmentos).toEqual(["saude", "tecnologia", "obras"]);
      expect(res.ufs).toEqual(["GO", "SP", "RJ", "MG"]);
      expect(res.brasilInteiro).toBe(true);
      expect(res.precisaAvisoAjuste).toBe(false);
    });

    it("deve restringir a 1 UF e 1 Segmento no plano BASICO ativo e sinalizar aviso se exceder", () => {
      const res = normalizarEscopoPlano({
        plano: "BASICO",
        billingStatus: "ATIVO",
        segmentos: ["saude", "tecnologia"],
        ufs: ["SP", "RJ"],
        ufSede: "GO",
        brasilInteiro: true,
      });

      expect(res.segmentos).toEqual(["saude"]);
      expect(res.ufs).toEqual(["GO"]);
      expect(res.brasilInteiro).toBe(false);
      expect(res.precisaAvisoAjuste).toBe(true);
    });

    it("não deve sinalizar aviso no BASICO ativo se já estiver com exatamente 1 UF e 1 Segmento", () => {
      const res = normalizarEscopoPlano({
        plano: "BASICO",
        billingStatus: "ATIVO",
        segmentos: ["saude"],
        ufs: ["GO"],
        ufSede: "GO",
        brasilInteiro: false,
      });

      expect(res.segmentos).toEqual(["saude"]);
      expect(res.ufs).toEqual(["GO"]);
      expect(res.brasilInteiro).toBe(false);
      expect(res.precisaAvisoAjuste).toBe(false);
    });

    it("deve permitir múltiplos segmentos e todas as UFs nos planos PRO e ENTERPRISE", () => {
      const resPro = normalizarEscopoPlano({
        plano: "PRO",
        billingStatus: "ATIVO",
        segmentos: ["saude", "alimentacao", "engenharia"],
        ufs: ["GO", "DF", "TO"],
        brasilInteiro: true,
      });
      expect(resPro.segmentos.length).toBe(3);
      expect(resPro.brasilInteiro).toBe(true);
      expect(resPro.precisaAvisoAjuste).toBe(false);

      const resEnt = normalizarEscopoPlano({
        plano: "ENTERPRISE",
        billingStatus: "ATIVO",
        segmentos: ["saude", "alimentacao", "engenharia", "ti"],
        ufs: ["GO", "DF", "TO", "SP", "RJ"],
        brasilInteiro: true,
      });
      expect(resEnt.segmentos.length).toBe(4);
      expect(resEnt.brasilInteiro).toBe(true);
      expect(resEnt.precisaAvisoAjuste).toBe(false);
    });
  });

  describe("3. Governança de Equipe & RBAC Restrito", () => {
    it("o titular da conta não pode ser alterado por nenhum outro usuário", async () => {
      await expect(
        atualizarMembroEquipe(
          "usr_titular_1",
          { name: "Nome Modificado por Outro" },
          "usr_analista_1",
          { id: "usr_analista_1", role: "ANALISTA_COMERCIAL" },
          "tenant_1",
          { titularUserId: "usr_titular_1" },
        ),
      ).rejects.toThrow(/titular da conta não pode ser alterado por outros colaboradores/i);
    });

    it("nenhum usuário pode se auto-inativar", async () => {
      await expect(
        atualizarMembroEquipe(
          "usr_analista_1",
          { ativo: false },
          "usr_analista_1",
          { id: "usr_analista_1", role: "ANALISTA_COMERCIAL" },
          "tenant_1",
        ),
      ).rejects.toThrow(/não pode inativar sua própria conta/i);
    });

    it("apenas o usuário principal (Titular) pode inativar colaboradores", async () => {
      await expect(
        atualizarMembroEquipe(
          "usr_analista_2",
          { ativo: false },
          "usr_analista_1",
          { id: "usr_analista_1", role: "ANALISTA_COMERCIAL" },
          "tenant_1",
          { actorTenantRole: "MEMBRO" },
        ),
      ).rejects.toThrow(/apenas o usuário principal|exclusivo/i);
    });

    it("deve impedir criação de novo colaborador se o limite de usuários do plano for atingido", async () => {
      await expect(
        criarMembroEquipe(
          {
            name: "Novo Colaborador Excedente",
            email: "excedente@empresa.com",
            role: "ANALISTA_COMERCIAL",
            password: "SenhaTemp2026!",
          },
          "usr_titular_1",
          { id: "usr_titular_1", role: "DIRETORIA" },
          "tenant_limite_atingido",
        ),
      ).rejects.toThrow(/limite de colaboradores|PLAN_USER_LIMIT_REACHED|atingido/i);
    });

    it("não deve permitir a criação de colaborador com perfil Operador Técnico (OPERADOR)", async () => {
      await expect(
        criarMembroEquipe(
          {
            name: "Operador Não Permitido",
            email: "operador@empresa.com",
            role: "OPERADOR_TECNICO" as any,
            password: "SenhaTemp2026!",
          },
          "usr_titular_1",
          { id: "usr_titular_1", role: "DIRETORIA" },
          "tenant_1",
        ),
      ).rejects.toThrow(/perfil inválido|não permitido|analista comercial/i);
    });
  });
});

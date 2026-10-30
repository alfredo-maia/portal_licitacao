import { beforeEach, describe, expect, it } from "vitest";
import {
  createTenantForUser,
  listTenantsForUser,
  inviteTeamMember,
  revokeTeamMember,
  disputeClaimCnpj,
  resetInMemoryTenantStorage,
  TenantCollisionError,
  PlanQuotaExceededError,
  TeamSeatLimitExceededError,
  UnauthorizedTenantActionError,
} from "@/server/services/tenant.service";

describe("Sprint SaaS 1 — Tenant Domain Service & Regras de Negócio (Issue #9)", () => {
  beforeEach(() => {
    resetInMemoryTenantStorage();
  });

  describe("1. Criação de Tenant & Proibição Estrita de Duplicidade de CNPJ", () => {
    it("deve criar um tenant com sucesso e vincular o criador como TITULAR", async () => {
      const tenant = await createTenantForUser({
        userId: "usr_alice",
        userEmail: "alice@empresa.com.br",
        userName: "Alice Diretora",
        userPlan: "BASICO",
        input: {
          cnpj: "00.000.000/0001-91",
          razaoSocial: "Empresa Alfa LTDA",
          plano: "BASICO",
        },
      });

      expect(tenant.id).toBeDefined();
      expect(tenant.cnpj).toBe("00000000000191");
      expect(tenant.razaoSocial).toBe("Empresa Alfa LTDA");
      expect(tenant.plano).toBe("BASICO");

      const list = await listTenantsForUser("usr_alice");
      expect(list).toHaveLength(1);
      expect(list[0].role).toBe("TITULAR");
      expect(list[0].tenant.id).toBe(tenant.id);
    });

    it("deve proibir que duas contas distintas cadastrem o mesmo CNPJ (TenantCollisionError)", async () => {
      // Conta 1 cadastra o CNPJ
      await createTenantForUser({
        userId: "usr_alice",
        userEmail: "alice@empresa.com.br",
        userName: "Alice",
        userPlan: "BASICO",
        input: {
          cnpj: "33.000.167/0001-01",
          razaoSocial: "Petrobras Distribuidora",
          plano: "BASICO",
        },
      });

      // Conta 2 (outro usuário) tenta cadastrar exatamente o mesmo CNPJ
      await expect(
        createTenantForUser({
          userId: "usr_bob",
          userEmail: "bob@concorrente.com.br",
          userName: "Bob Concorrente",
          userPlan: "PRO",
          input: {
            cnpj: "33.000.167/0001-01", // Mesmo CNPJ
            razaoSocial: "Tentativa Duplicada",
            plano: "PRO",
          },
        }),
      ).rejects.toThrow(TenantCollisionError);
    });

    it("deve conter código 409 e mensagem amigável no erro de colisão de CNPJ", async () => {
      await createTenantForUser({
        userId: "usr_alice",
        userEmail: "alice@empresa.com.br",
        userName: "Alice",
        userPlan: "BASICO",
        input: {
          cnpj: "00.000.000/0001-91",
          razaoSocial: "Empresa Alfa LTDA",
          plano: "BASICO",
        },
      });

      try {
        await createTenantForUser({
          userId: "usr_bob",
          userEmail: "bob@empresa.com.br",
          userName: "Bob",
          userPlan: "BASICO",
          input: {
            cnpj: "00.000.000/0001-91",
            razaoSocial: "Empresa Alfa",
            plano: "BASICO",
          },
        });
        expect.unreachable("Deveria ter lançado TenantCollisionError");
      } catch (err) {
        expect(err).toBeInstanceOf(TenantCollisionError);
        const collisionErr = err as TenantCollisionError;
        expect(collisionErr.statusCode).toBe(409);
        expect(collisionErr.code).toBe("CNPJ_ALREADY_REGISTERED");
        expect(collisionErr.message).toContain("já possui uma conta ativa no Portal");
        expect(collisionErr.message).toContain("solicite ao titular da conta o envio de um convite");
      }
    });
  });

  describe("2. Validação de Cotas de CNPJ por Plano de Assinatura", () => {
    it("deve bloquear criação do 2º CNPJ para usuários no Plano Básico (limite 1)", async () => {
      // 1º CNPJ criado com sucesso
      await createTenantForUser({
        userId: "usr_basico",
        userEmail: "cliente@basico.com.br",
        userName: "Cliente Básico",
        userPlan: "BASICO",
        input: {
          cnpj: "00.000.000/0001-91",
          razaoSocial: "Empresa Um",
          plano: "BASICO",
        },
      });

      // Tentativa do 2º CNPJ sob o mesmo plano Básico
      await expect(
        createTenantForUser({
          userId: "usr_basico",
          userEmail: "cliente@basico.com.br",
          userName: "Cliente Básico",
          userPlan: "BASICO",
          input: {
            cnpj: "11.222.333/0001-81",
            razaoSocial: "Empresa Dois",
            plano: "BASICO",
          },
        }),
      ).rejects.toThrow(PlanQuotaExceededError);
    });

    it("deve permitir até 2 CNPJs no Plano Pro e bloquear o 3º CNPJ", async () => {
      // 1º CNPJ
      await createTenantForUser({
        userId: "usr_pro",
        userEmail: "gestor@holding.com.br",
        userName: "Gestor Pro",
        userPlan: "PRO",
        input: {
          cnpj: "00.000.000/0001-91",
          razaoSocial: "Holding Matriz",
          plano: "PRO",
        },
      });

      // 2º CNPJ (Permitido no Pro)
      const secondTenant = await createTenantForUser({
        userId: "usr_pro",
        userEmail: "gestor@holding.com.br",
        userName: "Gestor Pro",
        userPlan: "PRO",
        input: {
          cnpj: "11.222.333/0001-81",
          razaoSocial: "Holding Filial",
          plano: "PRO",
        },
      });
      expect(secondTenant).toBeDefined();

      // 3º CNPJ (Excede limite de 2 do Pro)
      await expect(
        createTenantForUser({
          userId: "usr_pro",
          userEmail: "gestor@holding.com.br",
          userName: "Gestor Pro",
          userPlan: "PRO",
          input: {
            cnpj: "33.000.167/0001-01",
            razaoSocial: "Holding Terceira",
            plano: "PRO",
          },
        }),
      ).rejects.toThrow(PlanQuotaExceededError);
    });
  });

  describe("3. Gestão de Convites da Equipe & Limites de Usuários", () => {
    it("deve bloquear convite se o limite de usuários do plano for atingido", async () => {
      // Cria empresa no Plano Básico (maxUsers: 1)
      const tenant = await createTenantForUser({
        userId: "usr_titular",
        userEmail: "titular@empresa.com.br",
        userName: "Titular",
        userPlan: "BASICO",
        input: {
          cnpj: "00.000.000/0001-91",
          razaoSocial: "Empresa Básico",
          plano: "BASICO",
        },
      });

      // O titular já consome o único assento do plano Básico
      await expect(
        inviteTeamMember({
          tenantId: tenant.id,
          senderUserId: "usr_titular",
          input: {
            email: "operador@empresa.com.br",
            role: "MEMBRO",
          },
        }),
      ).rejects.toThrow(TeamSeatLimitExceededError);
    });

    it("deve permitir convite no Plano Pro (até 2 usuários) e gerar token de 7 dias", async () => {
      const tenant = await createTenantForUser({
        userId: "usr_titular_pro",
        userEmail: "titular@pro.com.br",
        userName: "Titular Pro",
        userPlan: "PRO",
        input: {
          cnpj: "00.000.000/0001-91",
          razaoSocial: "Empresa Pro",
          plano: "PRO",
        },
      });

      const invite = await inviteTeamMember({
        tenantId: tenant.id,
        senderUserId: "usr_titular_pro",
        input: {
          email: "membro@pro.com.br",
          role: "MEMBRO",
        },
      });

      expect(invite.id).toBeDefined();
      expect(invite.token).toContain("token_");
      expect(invite.email).toBe("membro@pro.com.br");
      expect(invite.expiraEm.getTime()).toBeGreaterThan(Date.now());
    });

    it("deve impedir que o titular convide seu próprio e-mail", async () => {
      const tenant = await createTenantForUser({
        userId: "usr_titular_pro",
        userEmail: "titular@pro.com.br",
        userName: "Titular Pro",
        userPlan: "PRO",
        input: {
          cnpj: "00.000.000/0001-91",
          razaoSocial: "Empresa Pro",
          plano: "PRO",
        },
      });

      await expect(
        inviteTeamMember({
          tenantId: tenant.id,
          senderUserId: "usr_titular_pro",
          input: {
            email: "titular@pro.com.br",
            role: "MEMBRO",
          },
        }),
      ).rejects.toThrow("Você não pode convidar seu próprio e-mail");
    });

    it("deve impedir que o titular revogue seu próprio acesso", async () => {
      const tenant = await createTenantForUser({
        userId: "usr_titular",
        userEmail: "titular@empresa.com.br",
        userName: "Titular",
        userPlan: "BASICO",
        input: {
          cnpj: "00.000.000/0001-91",
          razaoSocial: "Empresa Teste",
          plano: "BASICO",
        },
      });

      await expect(
        revokeTeamMember({
          tenantId: tenant.id,
          senderUserId: "usr_titular",
          targetUserId: "usr_titular",
        }),
      ).rejects.toThrow(UnauthorizedTenantActionError);
    });
  });

  describe("4. Contestação e Reivindicação de Titularidade de CNPJ (Dispute Flow)", () => {
    it("deve registrar protocolo de contestação via e-mail oficial da Receita Federal", async () => {
      const result = await disputeClaimCnpj({
        userId: "usr_requerente",
        userEmail: "socio@empresa.com.br",
        input: {
          cnpj: "33.000.167/0001-01",
          motivo: "Este CNPJ pertence à minha empresa e foi cadastrado indevidamente.",
          metodo: "EMAIL_RECEITA",
        },
      });

      expect(result.protocolo).toContain("DISP-");
      expect(result.metodo).toBe("EMAIL_RECEITA");
      expect(result.mensagem).toContain("e-mail oficial constante no Cartão CNPJ da Receita Federal");
    });

    it("deve registrar protocolo de contestação documental para auditoria em 24h", async () => {
      const result = await disputeClaimCnpj({
        userId: "usr_requerente",
        userEmail: "socio@empresa.com.br",
        input: {
          cnpj: "33.000.167/0001-01",
          motivo: "Não temos mais acesso ao e-mail antigo da Receita Federal.",
          metodo: "SUPORTE_DOCUMENTAL",
        },
      });

      expect(result.protocolo).toContain("DISP-");
      expect(result.metodo).toBe("SUPORTE_DOCUMENTAL");
      expect(result.mensagem).toContain("em até 24h úteis");
    });
  });
});

import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { APP_CONFIG } from "@/config/brand";
import { prisma } from "@/lib/prisma";
import { cleanCnpj, formatCnpj } from "@/lib/validations/cnpj";
import { recordAuditLog } from "@/server/audit";
import { CadastroInput, cadastroContaSchema } from "@/server/schemas/cadastro.schema";
import { enviarEmailBoasVindas } from "@/server/services/email.service";
import { criarNotificacaoAdmin } from "@/server/services/superadmin/notificacoes";
import { enviarNotificacaoWhatsApp } from "@/server/services/whatsapp.service";
import { upsertInMemoryAuthUser } from "@/server/auth";
import { inMemoryTenants, inMemoryTenantUsers } from "@/server/services/tenant.service";
import {
  updateInMemoryConfiguracaoEmpresa,
  insertInMemoryUsuario,
} from "@/server/services/licitacoes-store";

export interface ResultadoCadastro {
  ok: boolean;
  userId: string;
  tenantId: string;
  email: string;
  cnpj: string;
  trialFim: Date;
  mensagem: string;
}

/**
 * Realiza o cadastro de uma nova conta de usuário e sua empresa (Tenant) com 14 dias de Trial gratuito (Sprint 6 / Issue #15).
 */
export async function realizarCadastroConta(
  rawInput: CadastroInput,
): Promise<ResultadoCadastro> {
  const input = cadastroContaSchema.parse(rawInput);
  const normalizedEmail = input.email.trim().toLowerCase();
  const digitsCnpj = cleanCnpj(input.cnpj);
  const formattedCnpj = formatCnpj(digitsCnpj);
  const cnpjCandidates = Array.from(new Set([input.cnpj.trim(), digitsCnpj, formattedCnpj]));
  const nomeFinal = input.nomeResponsavel || input.nome || "Responsável";

  // 1. Verifica se e-mail já existe no banco
  const usuarioExistente = await prisma.user
    .findUnique({
      where: { email: normalizedEmail },
    })
    .catch(() => null);

  if (usuarioExistente) {
    throw new Error("Este e-mail já está cadastrado no sistema.");
  }

  // 2. Verifica se CNPJ já existe (Postgres + cache em memória)
  const memTenantExistente = Array.from(inMemoryTenants.values()).some(
    (t) => cleanCnpj(t.cnpj) === digitsCnpj,
  );
  if (memTenantExistente) {
    throw new Error("Este CNPJ já possui uma conta cadastrada no Portal.");
  }

  const tenantExistente =
    (await prisma.tenant
      .findUnique({
        where: { cnpj: input.cnpj },
        select: { id: true },
      })
      .catch(() => null)) ||
    (cnpjCandidates.length > 1
      ? await prisma.tenant
          .findFirst({
            where: { cnpj: { in: cnpjCandidates } },
            select: { id: true },
          })
          .catch(() => null)
      : null);

  if (tenantExistente) {
    throw new Error("Este CNPJ já possui uma conta cadastrada no Portal.");
  }

  // 3. Calcula período de 14 dias de Trial + bônus de afiliado/cupom se houver
  const agora = new Date();
  let diasTrial = 14;
  let affiliateId: string | null = null;
  let cupomCodigoFinal: string | null = null;

  if (input.affiliateCodigo) {
    const codAff = input.affiliateCodigo.trim().toUpperCase();
    let aff = await prisma.affiliate
      .findUnique({ where: { codigo: codAff } })
      .catch(() => null);
    if (!aff) {
      const sa = await import("@/server/services/superadmin.service").catch(() => null);
      const lista = sa ? await sa.listarAfiliadosSuperAdmin().catch(() => null) : null;
      const foundMem = lista?.afiliados.find((a) => a.codigo === codAff);
      if (foundMem) {
        aff = foundMem as unknown as typeof aff;
      }
    }
    if (aff && aff.ativo) {
      affiliateId = aff.id;
      if (aff.diasExtrasTrial > 0) diasTrial += Number(aff.diasExtrasTrial) || 0;
    }
  }

  if (input.cupomCodigo) {
    const codCup = input.cupomCodigo.trim().toUpperCase();
    let fromDb = true;
    let cupom = await prisma.coupon
      .findUnique({ where: { codigo: codCup } })
      .catch(() => null);
    if (!cupom) {
      fromDb = false;
      const sa = await import("@/server/services/superadmin.service").catch(() => null);
      const lista = sa ? await sa.listarCuponsSuperAdmin().catch(() => []) : [];
      const foundMem = lista.find((c) => c.codigo === codCup);
      if (foundMem) {
        cupom = foundMem as unknown as typeof cupom;
      }
    }

    const naoExpirado =
      Boolean(cupom) &&
      (!cupom!.expiraEm || new Date(cupom!.expiraEm).getTime() >= agora.getTime());
    const dentroDoLimite =
      Boolean(cupom) &&
      (cupom!.maxUsos === null ||
        cupom!.maxUsos === undefined ||
        cupom!.usosAtuais < cupom!.maxUsos);

    if (cupom && cupom.ativo && naoExpirado && dentroDoLimite) {
      let consumoConfirmado = true;
      if (fromDb) {
        const resUpdate = await prisma.coupon
          .updateMany({
            where: {
              id: cupom.id,
              ativo: true,
              OR: [{ expiraEm: null }, { expiraEm: { gte: agora } }],
              ...(cupom.maxUsos !== null && cupom.maxUsos !== undefined
                ? { usosAtuais: { lt: cupom.maxUsos } }
                : {}),
            },
            data: { usosAtuais: { increment: 1 } },
          })
          .catch(() => ({ count: 0 }));
        if (resUpdate.count === 0) {
          consumoConfirmado = false;
        }
      } else {
        const sa = await import("@/server/services/superadmin.service").catch(() => null);
        if (sa?.consumirCupomMemoriaSuperAdmin) {
          consumoConfirmado = sa.consumirCupomMemoriaSuperAdmin(codCup);
        }
      }

      if (consumoConfirmado) {
        cupomCodigoFinal = codCup;
        if (cupom.diasExtrasTrial > 0) diasTrial += Number(cupom.diasExtrasTrial) || 0;
        if (!affiliateId && cupom.affiliateId) affiliateId = cupom.affiliateId;
      }
    }
  }

  const trialFim = new Date(agora);
  trialFim.setDate(trialFim.getDate() + diasTrial);

  // 4. Criptografa senha
  const passwordHash = await bcrypt.hash(input.senha, 10);
  const userId = `usr_${randomUUID().slice(0, 12)}`;
  const tenantId = `tnt_${randomUUID().slice(0, 12)}`;

  // 5. Auto-healing de colunas SaaS no PostgreSQL caso ainda não existam
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "telefone" TEXT;`).catch(() => undefined);
    await prisma.$executeRawUnsafe(`ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "segmentos" TEXT[] DEFAULT ARRAY[]::TEXT[];`).catch(() => undefined);
    await prisma.$executeRawUnsafe(`ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "subsegmentos" TEXT[] DEFAULT ARRAY[]::TEXT[];`).catch(() => undefined);
    await prisma.$executeRawUnsafe(`ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "ufs" TEXT[] DEFAULT ARRAY[]::TEXT[];`).catch(() => undefined);
    await prisma.$executeRawUnsafe(`ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "brasilInteiro" BOOLEAN DEFAULT TRUE;`).catch(() => undefined);
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isSuperAdmin" BOOLEAN DEFAULT FALSE;`).catch(() => undefined);
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "cpf" TEXT;`).catch(() => undefined);
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "telefone" TEXT;`).catch(() => undefined);
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "cep" TEXT;`).catch(() => undefined);
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "logradouro" TEXT;`).catch(() => undefined);
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "numero" TEXT;`).catch(() => undefined);
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "complemento" TEXT;`).catch(() => undefined);
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "bairro" TEXT;`).catch(() => undefined);
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "cidade" TEXT;`).catch(() => undefined);
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "uf" TEXT;`).catch(() => undefined);
    await prisma.$executeRawUnsafe(`ALTER TABLE "configuracao_empresa" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;`).catch(() => undefined);
    await prisma.$executeRawUnsafe(`ALTER TABLE "configuracao_empresa" ADD COLUMN IF NOT EXISTS "inscricaoMunicipal" TEXT;`).catch(() => undefined);
    await prisma.$executeRawUnsafe(`ALTER TABLE "configuracao_empresa" ADD COLUMN IF NOT EXISTS "numero" TEXT;`).catch(() => undefined);
    await prisma.$executeRawUnsafe(`ALTER TABLE "configuracao_empresa" ADD COLUMN IF NOT EXISTS "complemento" TEXT;`).catch(() => undefined);
    await prisma.$executeRawUnsafe(`ALTER TABLE "configuracao_empresa" ADD COLUMN IF NOT EXISTS "bairro" TEXT;`).catch(() => undefined);
  } catch {
    // Ignora se não for PostgreSQL
  }

  // 6. Criação no banco de dados (User + Tenant + TenantUser)
  try {
    await prisma.$transaction(async (tx) => {
      await tx.tenant.create({
        data: {
          id: tenantId,
          cnpj: input.cnpj,
          razaoSocial: input.razaoSocial,
          plano: "PRO",
          billingStatus: "TRIAL",
          trialFim,
          maxCnpjs: 2,
          maxUsers: 2,
          ativo: true,
          telefone: input.whatsapp,
          segmentos: input.segmentos,
          subsegmentos: input.subsegmentos,
          ufs: input.ufs,
          brasilInteiro: input.brasilInteiro,
          affiliateId,
          cupomCodigo: cupomCodigoFinal,
        },
      });

      await tx.user.create({
        data: {
          id: userId,
          name: nomeFinal,
          email: normalizedEmail,
          passwordHash,
          role: "DIRETORIA",
          ativo: true,
          telefone: input.whatsapp,
        },
      });

      await tx.tenantUser.create({
        data: {
          tenantId,
          userId,
          role: "TITULAR",
          ativo: true,
        },
      });

      await tx.configuracaoEmpresa.create({
        data: {
          id: `cfg_${tenantId}`,
          tenantId,
          razaoSocial: input.razaoSocial,
          cnpj: input.cnpj,
          representanteNome: nomeFinal,
          endereco: "",
          cidade: "",
          uf: input.ufs && input.ufs.length > 0 ? input.ufs[0] : "",
          cep: "",
        },
      });
    });

    await recordAuditLog({
      usuarioId: userId,
      usuarioNome: nomeFinal,
      acao: "CADASTRO_NOVA_CONTA_TRIAL",
      entidadeTipo: "TENANT",
      entidadeId: tenantId,
      depois: {
        cnpj: input.cnpj,
        razaoSocial: input.razaoSocial,
        email: normalizedEmail,
        trialFim,
        segmentos: input.segmentos,
      },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : "Erro de banco de dados";
    if (process.env.VITEST || process.env.NODE_ENV === "test") {
      console.warn("[Cadastro Service] Fallback em memória para teste:", errMsg);
      inMemoryTenants.set(tenantId, {
        id: tenantId,
        cnpj: input.cnpj,
        razaoSocial: input.razaoSocial,
        nomeFantasia: null,
        plano: "PRO",
        billingStatus: "TRIAL",
        trialFim,
        maxCnpjs: 2,
        maxUsers: 2,
        ativo: true,
        segmentos: input.segmentos,
        subsegmentos: input.subsegmentos,
        ufs: input.ufs,
        brasilInteiro: input.brasilInteiro,
        affiliateId,
        cupomCodigo: cupomCodigoFinal,
        criadoEm: agora,
        updatedAt: agora,
      });

      inMemoryTenantUsers.push({
        id: `tu_${randomUUID().slice(0, 8)}`,
        tenantId,
        userId,
        userEmail: normalizedEmail,
        userName: nomeFinal,
        role: "TITULAR",
        ativo: true,
        criadoEm: agora,
      });

      updateInMemoryConfiguracaoEmpresa(
        {
          id: `cfg_${tenantId}`,
          tenantId,
          razaoSocial: input.razaoSocial,
          cnpj: input.cnpj,
          representanteNome: nomeFinal,
          endereco: "",
          cidade: "",
          uf: input.ufs && input.ufs.length > 0 ? input.ufs[0] : "",
          cep: "",
          segmentos: input.segmentos,
          subsegmentos: input.subsegmentos,
          ufs: input.ufs,
          brasilInteiro: input.brasilInteiro,
        },
        tenantId,
      );
    } else {
      console.error("[Cadastro Service] Erro crítico ao persistir no PostgreSQL:", err);
      throw new Error(`Falha ao registrar conta no banco de dados: ${errMsg}`);
    }
  }

  // 7. Sincronização imediata no cache in-memory de autenticação para login instantâneo
  upsertInMemoryAuthUser({
    id: userId,
    name: nomeFinal,
    email: normalizedEmail,
    role: "DIRETORIA",
    ativo: true,
    passwordHash,
    activeTenantId: tenantId,
    cnpj: input.cnpj,
    plano: "PRO",
    tenantRole: "TITULAR",
  });

  insertInMemoryUsuario({
    id: userId,
    name: nomeFinal,
    email: normalizedEmail,
    role: "DIRETORIA",
    ativo: true,
    tenantId,
    telefone: input.whatsapp,
  });

  // 8. Dispara boas-vindas via E-mail (Resend) e WhatsApp (Evolution API) sem travar cadastro
  try {
    await enviarEmailBoasVindas({
      nome: nomeFinal,
      email: normalizedEmail,
      razaoSocial: input.razaoSocial,
      cnpj: input.cnpj,
      diasTrial,
      tenantId,
      userId,
    });
  } catch {}

  try {
    await enviarNotificacaoWhatsApp({
      destinatario: input.whatsapp,
      mensagem: `Olá, ${nomeFinal}! Bem-vindo ao ${APP_CONFIG.brandName}. Seu período Grátis - Pro (${diasTrial} dias) para a empresa ${input.razaoSocial} foi iniciado com sucesso!`,
      tipo: "BOAS_VINDAS",
      evento: "BOAS_VINDAS",
      tenantId,
      userId,
    });
  } catch {
    // Ignora falha de WhatsApp no cadastro
  }

  // Notificação automática para o Portal ADM: novo cadastro Trial (1º CNPJ da conta)
  await criarNotificacaoAdmin({
    categoria: "NOVO_CLIENTE_TRIAL",
    titulo: `Novo cliente em Teste Grátis: ${input.razaoSocial}`,
    descricao: `Cadastro inicial de ${nomeFinal} (${normalizedEmail}) • ${diasTrial} dias de trial.`,
    severidade: "INFO",
    tenantId,
    linkDestino: `/admin/clientes/${tenantId}`,
    atorNome: nomeFinal,
    metadados: { cnpj: input.cnpj, email: normalizedEmail, diasTrial },
  }).catch(() => undefined);

  return {
    ok: true,
    userId,
    tenantId,
    email: normalizedEmail,
    cnpj: input.cnpj,
    trialFim,
    mensagem: "Cadastro realizado com sucesso! Seus 14 dias de teste gratuito estão ativos.",
  };
}

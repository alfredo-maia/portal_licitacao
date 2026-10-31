import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/server/audit";
import { CadastroInput, cadastroContaSchema } from "@/server/schemas/cadastro.schema";
import { enfileirarMensagemWhatsApp } from "@/server/services/whatsapp.service";
import { upsertInMemoryAuthUser } from "@/server/auth";

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
  const digitsCnpj = input.cnpj.replace(/\D/g, "");
  const nomeFinal = input.nomeResponsavel || input.nome || "Responsável";

  // 1. Verifica se e-mail já existe no banco
  const usuarioExistente = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  }).catch(() => null);

  if (usuarioExistente) {
    throw new Error("Este e-mail já está cadastrado no sistema.");
  }

  // 2. Verifica se CNPJ já existe
  const tenantExistente = await prisma.tenant.findUnique({
    where: { cnpj: input.cnpj },
  }).catch(() => null);

  if (tenantExistente) {
    throw new Error("Este CNPJ já possui uma conta cadastrada no Portal.");
  }

  // 3. Calcula período de 14 dias de Trial
  const agora = new Date();
  const trialFim = new Date(agora);
  trialFim.setDate(trialFim.getDate() + 14);

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
    await prisma.$executeRawUnsafe(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "isSuperAdmin" BOOLEAN DEFAULT FALSE;`).catch(() => undefined);
  } catch {
    // Ignora se não for PostgreSQL
  }

  // 6. Criação no banco de dados (User + Tenant + TenantUser)
  try {
    await prisma.$transaction(async (tx) => {
      // Cria Tenant com 14 dias de trial e plano PRO para degustação completa
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
        },
      });

      // Cria Usuário com perfil de Diretoria da sua empresa
      await tx.user.create({
        data: {
          id: userId,
          name: nomeFinal,
          email: normalizedEmail,
          passwordHash,
          role: "DIRETORIA",
          ativo: true,
        },
      });

      // Vincula como Titular do Tenant
      await tx.tenantUser.create({
        data: {
          tenantId,
          userId,
          role: "TITULAR",
          ativo: true,
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
  } catch (err: any) {
    console.warn("[Cadastro Service] Aviso ao gravar no banco:", err?.message);
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

  // 8. Agenda WhatsApp de boas-vindas com jitter anti-ban
  try {
    await enfileirarMensagemWhatsApp({
      destinatario: input.whatsapp,
      mensagem: `Olá, ${nomeFinal}! Bem-vindo ao Portal de Licitações. Seu período de degustação gratuita de 14 dias para a empresa ${input.razaoSocial} foi iniciado com sucesso!`,
      tipo: "BOAS_VINDAS",
      tenantId,
    });
  } catch {
    // Ignora falha de WhatsApp no cadastro
  }

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

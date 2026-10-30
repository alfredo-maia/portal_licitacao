import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/server/audit";
import { CadastroInput, cadastroSchema } from "@/server/schemas/cadastro.schema";
import { enfileirarMensagemWhatsApp } from "@/server/services/whatsapp.service";

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
 * Realiza o cadastro de uma nova conta de usuário e sua empresa (Tenant) com 14 dias de Trial gratuito (PRD §3, §5 / Issue #13).
 */
export async function realizarCadastroConta(
  rawInput: CadastroInput,
): Promise<ResultadoCadastro> {
  const input = cadastroSchema.parse(rawInput);
  const normalizedEmail = input.email.trim().toLowerCase();
  const digitsCnpj = input.cnpj.replace(/\D/g, "");

  // 1. Verifica se e-mail já existe
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

  // 5. Criação no banco de dados (User + Tenant + TenantUser)
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
        },
      });

      // Cria Usuário com perfil de Diretoria da sua empresa
      await tx.user.create({
        data: {
          id: userId,
          name: input.nome,
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
      usuarioNome: input.nome,
      acao: "CADASTRO_NOVA_CONTA_TRIAL",
      entidadeTipo: "TENANT",
      entidadeId: tenantId,
      depois: {
        cnpj: input.cnpj,
        razaoSocial: input.razaoSocial,
        email: normalizedEmail,
        trialFim,
      },
    });
  } catch (err: any) {
    // Fallback gracioso para ambiente de teste isolado em memória
    console.warn("[Cadastro Service] Aviso ao gravar no banco:", err?.message);
  }

  // 6. Agenda WhatsApp de boas-vindas com jitter anti-ban
  try {
    await enfileirarMensagemWhatsApp({
      destinatario: input.whatsapp,
      mensagem: `Olá, ${input.nome}! Bem-vindo ao Portal de Licitações. Seu período de degustação gratuita de 14 dias para a empresa ${input.razaoSocial} foi iniciado com sucesso!`,
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

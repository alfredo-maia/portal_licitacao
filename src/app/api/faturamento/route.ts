import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/server/auth";
import {
  exigirClienteEmApi,
  type SessionActorClaims,
} from "@/server/auth/client-guard";
import { prisma } from "@/lib/prisma";
import { calcularStatusFaturamento } from "@/server/schemas/asaas.schema";
import { PLAN_STORAGE_QUOTAS_MB } from "@/server/schemas/storage-r2.schema";

/**
 * Informações de faturamento e status da assinatura do Tenant ativo.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions).catch(() => null);
  const guard = exigirClienteEmApi(session?.user as SessionActorClaims | undefined);
  if (!guard.ok) return guard.response;

  const activeTenantId = guard.user.activeTenantId;

  if (!activeTenantId) {
    // Retorno de fallback para usuário sem tenant
    return NextResponse.json({
      status: "TRIAL",
      diasRestantesTrial: 14,
      diasAtraso: 0,
      plano: "PRO",
      emPeriodoDeGraca: false,
      bloqueado: false,
      cotaTotalMb: 2000,
      espacoUsadoMb: 0,
    });
  }

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: activeTenantId },
      include: {
        documentos: {
          select: { arquivoTamanho: true },
        },
      },
    });

    if (!tenant) {
      return NextResponse.json({ error: "Tenant não encontrado" }, { status: 404 });
    }

    const calc = calcularStatusFaturamento({
      plano: tenant.plano,
      trialFim: tenant.trialFim,
      vencimentoAssinatura: tenant.vencimentoAssinatura,
      ultimoPagamentoEm: tenant.ultimoPagamentoEm,
    });

    // Consolida armazenamento R2 em todos os CNPJs ativos do mesmo Titular (evita multiplicação por CNPJ)
    let cotaBaseMb =
      PLAN_STORAGE_QUOTAS_MB[tenant.plano as keyof typeof PLAN_STORAGE_QUOTAS_MB] || 500;
    let cotaExtraMb = tenant.storageExtraQuotaMb || 0;
    let espacoBytes = tenant.documentos.reduce(
      (acc, d) => acc + (d.arquivoTamanho || 0),
      0,
    );

    try {
      const titularLink = await prisma.tenantUser.findFirst({
        where: { tenantId: tenant.id, role: "TITULAR", ativo: true },
        select: { userId: true },
      });
      if (titularLink?.userId) {
        const ownerLinks = await prisma.tenantUser.findMany({
          where: { userId: titularLink.userId, role: "TITULAR", ativo: true },
          select: { tenantId: true },
        });
        const siblingIds = Array.from(new Set(ownerLinks.map((l) => l.tenantId)));
        if (siblingIds.length > 1) {
          const siblingTenants = await prisma.tenant.findMany({
            where: { id: { in: siblingIds } },
            include: {
              documentos: { select: { arquivoTamanho: true } },
            },
            orderBy: { criadoEm: "asc" },
          });
          if (siblingTenants.length > 0) {
            const primary = siblingTenants[0];
            cotaBaseMb =
              PLAN_STORAGE_QUOTAS_MB[
                primary.plano as keyof typeof PLAN_STORAGE_QUOTAS_MB
              ] || cotaBaseMb;
            cotaExtraMb = Math.max(
              0,
              ...siblingTenants.map((s) => s.storageExtraQuotaMb || 0),
            );
            espacoBytes = siblingTenants.reduce(
              (acc, s) =>
                acc +
                s.documentos.reduce((ds, d) => ds + (d.arquivoTamanho || 0), 0),
              0,
            );
          }
        }
      }
    } catch {
      // Fallback seguro para tenant único caso relação auxiliar não esteja disponível
    }

    const cotaTotalMb = cotaBaseMb + cotaExtraMb;
    const espacoUsadoMb = Math.round((espacoBytes / (1024 * 1024)) * 10) / 10;

    return NextResponse.json({
      status: calc.status,
      diasRestantesTrial: calc.diasRestantesTrial,
      diasAtraso: calc.diasAtraso,
      plano: tenant.plano,
      emPeriodoDeGraca: calc.emPeriodoDeGraca,
      bloqueado: calc.bloqueado,
      cotaTotalMb,
      espacoUsadoMb,
      vencimentoAssinatura: tenant.vencimentoAssinatura,
      asaasCustomerId: tenant.asaasCustomerId,
    });
  } catch (error: unknown) {
    console.error("[Faturamento API Error]:", error);
    return NextResponse.json(
      { error: "Erro ao obter informações de faturamento" },
      { status: 500 },
    );
  }
}

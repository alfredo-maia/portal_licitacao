import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/server/auth";
import { prisma } from "@/lib/prisma";
import { calcularStatusFaturamento } from "@/server/schemas/asaas.schema";
import { PLAN_STORAGE_QUOTAS_MB } from "@/server/schemas/storage-r2.schema";

/**
 * Informações de faturamento e status da assinatura do Tenant ativo.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions).catch(() => null);

  if (!session?.user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const activeTenantId = (session.user as any).activeTenantId;

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

    const cotaBaseMb =
      PLAN_STORAGE_QUOTAS_MB[tenant.plano as keyof typeof PLAN_STORAGE_QUOTAS_MB] || 500;
    const cotaTotalMb = cotaBaseMb + (tenant.storageExtraQuotaMb || 0);

    let espacoBytes = 0;
    for (const d of tenant.documentos) {
      if (d.arquivoTamanho) espacoBytes += d.arquivoTamanho;
    }
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
  } catch (error: any) {
    console.error("[Faturamento API Error]:", error);
    return NextResponse.json(
      { error: "Erro ao obter informações de faturamento" },
      { status: 500 },
    );
  }
}

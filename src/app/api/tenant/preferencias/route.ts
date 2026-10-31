import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { prisma } from "@/lib/prisma";
import { CATALOGO_MACRO_SEGMENTOS } from "@/server/schemas/segmentos.schema";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const tenantId = (session?.user as any)?.activeTenantId;

    if (tenantId) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          segmentos: true,
          subsegmentos: true,
          ufs: true,
          brasilInteiro: true,
        },
      }).catch(() => null);

      if (tenant && tenant.segmentos.length > 0) {
        return NextResponse.json({
          ok: true,
          segmentos: tenant.segmentos,
          subsegmentos: tenant.subsegmentos,
          ufs: tenant.ufs,
          brasilInteiro: tenant.brasilInteiro,
        });
      }
    }

    // Default para SuperAdmin, Diretoria sem tenant específico ou fallback
    const todosSegmentos = Object.keys(CATALOGO_MACRO_SEGMENTOS);
    return NextResponse.json({
      ok: true,
      segmentos: todosSegmentos,
      subsegmentos: [],
      ufs: [],
      brasilInteiro: true,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: "Erro ao buscar preferências do tenant" },
      { status: 500 },
    );
  }
}

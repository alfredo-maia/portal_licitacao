import { NextResponse } from "next/server";
import { runWithAuditActorContext } from "@/server/audit";
import { exigirAdmin, respostaErroAdmin } from "@/server/auth/admin-guard";
import { AdminMetricasQuerySchema } from "@/server/schemas/superadmin.schema";
import { obterMetricasSuperAdmin } from "@/server/services/superadmin.service";

export const dynamic = "force-dynamic";

/** Métricas executivas do Dashboard ADM. Retorna 404 para não administradores. */
export async function GET(req?: Request) {
  const g = await exigirAdmin("dashboard");
  if (!g.ok) return g.response;
  return runWithAuditActorContext(
    {
      usuarioId: g.actor.id,
      usuarioNome: g.actor.name,
      ip: req?.headers.get("x-forwarded-for") ?? null,
    },
    async () => {
      try {
        const url = req?.url ? new URL(req.url) : null;
        const query = AdminMetricasQuerySchema.parse({
          mes: url?.searchParams.get("mes")?.trim() || undefined,
          ano: url?.searchParams.get("ano")?.trim() || undefined,
        });
        return NextResponse.json(await obterMetricasSuperAdmin(query), { status: 200 });
      } catch (error) {
        return respostaErroAdmin(error, "metricas");
      }
    },
  );
}

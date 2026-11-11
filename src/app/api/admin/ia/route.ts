import { NextResponse } from "next/server";
import { runWithAuditActorContext } from "@/server/audit";
import { exigirAdmin, respostaErroAdmin } from "@/server/auth/admin-guard";
import { obterPainelConsumoIaSuperAdmin } from "@/server/services/superadmin.service";

export const dynamic = "force-dynamic";

/** Painel de consumo e custos de IA (diário/mensal por cliente, usuário, função e modelo). */
export async function GET(req?: Request) {
  const g = await exigirAdmin("ia");
  if (!g.ok) return g.response;
  return runWithAuditActorContext(
    {
      usuarioId: g.actor.id,
      usuarioNome: g.actor.name,
      ip: req?.headers.get("x-forwarded-for") ?? null,
    },
    async () => {
      try {
        return NextResponse.json(await obterPainelConsumoIaSuperAdmin());
      } catch (error) {
        return respostaErroAdmin(error, "ia");
      }
    },
  );
}

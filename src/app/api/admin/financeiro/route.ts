import { NextRequest, NextResponse } from "next/server";
import { runWithAuditActorContext } from "@/server/audit";
import { exigirAdmin, respostaErroAdmin } from "@/server/auth/admin-guard";
import { AdminFinanceiroPostSchema } from "@/server/schemas/superadmin.schema";
import {
  executarAcaoFinanceiraSuperAdmin,
  listarCuponsSuperAdmin,
  listarTenantsSuperAdmin,
  salvarCupomSuperAdmin,
} from "@/server/services/superadmin.service";

export const dynamic = "force-dynamic";

/** GET: carteira financeira (filtro `?status=`) + cupons. */
export async function GET(req: NextRequest) {
  const g = await exigirAdmin("financeiro");
  if (!g.ok) return g.response;
  return runWithAuditActorContext(
    {
      usuarioId: g.actor.id,
      usuarioNome: g.actor.name,
      ip: req.headers.get("x-forwarded-for") ?? null,
    },
    async () => {
      try {
        const status = req.nextUrl.searchParams.get("status") || undefined;
        const [clientes, cupons] = await Promise.all([
          listarTenantsSuperAdmin({ statusFiltro: status }),
          listarCuponsSuperAdmin(),
        ]);
        return NextResponse.json({ clientes, cupons });
      } catch (error) {
        return respostaErroAdmin(error, "financeiro");
      }
    },
  );
}

/** POST `{ tipo: "acao" | "cupom", ... }`. */
export async function POST(req: NextRequest) {
  const g = await exigirAdmin("financeiro", "escrever");
  if (!g.ok) return g.response;
  return runWithAuditActorContext(
    {
      usuarioId: g.actor.id,
      usuarioNome: g.actor.name,
      ip: req.headers.get("x-forwarded-for") ?? null,
    },
    async () => {
      try {
        const parsed = AdminFinanceiroPostSchema.parse(await req.json());
        if (parsed.tipo === "cupom") {
          const { tipo: _tipo, ...dadosCupom } = parsed;
          return NextResponse.json(await salvarCupomSuperAdmin(dadosCupom));
        }
        const { tipo: _tipo, ...dadosAcao } = parsed;
        return NextResponse.json(await executarAcaoFinanceiraSuperAdmin(dadosAcao));
      } catch (error) {
        return respostaErroAdmin(error, "financeiro-post");
      }
    },
  );
}

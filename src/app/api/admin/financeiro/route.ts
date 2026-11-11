import { NextRequest, NextResponse } from "next/server";
import { runWithAuditActorContext } from "@/server/audit";
import { exigirAdmin, respostaErroAdmin } from "@/server/auth/admin-guard";
import {
  AdminFinanceiroPostSchema,
  AdminFinanceiroQuerySchema,
} from "@/server/schemas/superadmin.schema";
import {
  executarAcaoFinanceiraSuperAdmin,
  listarCuponsSuperAdmin,
  listarHistoricoFaturasClienteSuperAdmin,
  listarTenantsSuperAdmin,
  salvarCupomSuperAdmin,
} from "@/server/services/superadmin.service";

export const dynamic = "force-dynamic";

/** GET: carteira financeira (filtro `?status=`) + cupons + histórico de faturas (`?faturasTenantId=`). */
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
        const query = AdminFinanceiroQuerySchema.parse({
          status: req.nextUrl.searchParams.get("status")?.trim() || undefined,
          faturasTenantId:
            req.nextUrl.searchParams.get("faturasTenantId")?.trim() || undefined,
        });
        const [clientes, cupons, faturas] = await Promise.all([
          listarTenantsSuperAdmin({ statusFiltro: query.status }),
          listarCuponsSuperAdmin(),
          query.faturasTenantId
            ? listarHistoricoFaturasClienteSuperAdmin(query.faturasTenantId)
            : Promise.resolve(undefined),
        ]);
        return NextResponse.json(
          faturas !== undefined ? { clientes, cupons, faturas } : { clientes, cupons },
        );
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

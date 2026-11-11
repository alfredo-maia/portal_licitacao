import { NextRequest, NextResponse } from "next/server";
import { runWithAuditActorContext } from "@/server/audit";
import { exigirAdmin, respostaErroAdmin } from "@/server/auth/admin-guard";
import { AdminAfiliadosPostSchema } from "@/server/schemas/superadmin.schema";
import {
  atualizarStatusComissaoAfiliadoSuperAdmin,
  listarAfiliadosSuperAdmin,
  salvarAfiliadoSuperAdmin,
  vincularClienteAfiliadoSuperAdmin,
} from "@/server/services/superadmin.service";

export const dynamic = "force-dynamic";

export async function GET(req?: Request) {
  const g = await exigirAdmin("afiliados");
  if (!g.ok) return g.response;
  return runWithAuditActorContext(
    {
      usuarioId: g.actor.id,
      usuarioNome: g.actor.name,
      ip: req?.headers.get("x-forwarded-for") ?? null,
    },
    async () => {
      try {
        return NextResponse.json(await listarAfiliadosSuperAdmin());
      } catch (error) {
        return respostaErroAdmin(error, "afiliados");
      }
    },
  );
}

/** POST `{ tipo: "afiliado" | "vincular" | "comissao", ... }`. */
export async function POST(req: NextRequest) {
  const g = await exigirAdmin("afiliados", "escrever");
  if (!g.ok) return g.response;
  return runWithAuditActorContext(
    {
      usuarioId: g.actor.id,
      usuarioNome: g.actor.name,
      ip: req.headers.get("x-forwarded-for") ?? null,
    },
    async () => {
      try {
        const parsed = AdminAfiliadosPostSchema.parse(await req.json());
        if (parsed.tipo === "afiliado") {
          const { tipo: _tipo, ...dadosAfiliado } = parsed;
          return NextResponse.json(await salvarAfiliadoSuperAdmin(dadosAfiliado));
        }
        if (parsed.tipo === "vincular") {
          return NextResponse.json(
            await vincularClienteAfiliadoSuperAdmin({
              tenantId: parsed.tenantId,
              affiliateId: parsed.affiliateId,
            }),
          );
        }
        return NextResponse.json(
          await atualizarStatusComissaoAfiliadoSuperAdmin({
            commissionId: parsed.commissionId,
            status: parsed.status,
            comprovanteObs: parsed.comprovanteObs,
          }),
        );
      } catch (error) {
        return respostaErroAdmin(error, "afiliados-post");
      }
    },
  );
}

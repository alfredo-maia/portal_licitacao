import { NextRequest, NextResponse } from "next/server";
import { runWithAuditActorContext } from "@/server/audit";
import { exigirAdmin, respostaErroAdmin } from "@/server/auth/admin-guard";
import {
  AdminNotificationsPatchSchema,
  AdminNotificacoesQuerySchema,
} from "@/server/schemas/superadmin.schema";
import {
  listarNotificacoesAdminSuperAdmin,
  marcarNotificacaoAdminLidaSuperAdmin,
  marcarTodasNotificacoesAdminLidasSuperAdmin,
} from "@/server/services/superadmin.service";

export const dynamic = "force-dynamic";

/** GET: lista notificações operacionais do Portal ADM filtradas pelo papel (`adminRole`). */
export async function GET(req: NextRequest) {
  const g = await exigirAdmin("notificacoes");
  if (!g.ok) return g.response;

  return runWithAuditActorContext(
    {
      usuarioId: g.actor.id,
      usuarioNome: g.actor.name,
      ip: req.headers.get("x-forwarded-for") ?? null,
    },
    async () => {
      try {
        const query = AdminNotificacoesQuerySchema.parse({
          categoria: req.nextUrl.searchParams.get("categoria")?.trim() || undefined,
          naoLidas: req.nextUrl.searchParams.get("naoLidas")?.trim() || undefined,
          limite: req.nextUrl.searchParams.get("limite")?.trim() || undefined,
        });
        const somenteNaoLidas =
          query.naoLidas === "true" || query.naoLidas === "1";

        const data = await listarNotificacoesAdminSuperAdmin({
          adminRole: g.actor.adminRole,
          userId: g.actor.id || g.actor.email || g.actor.adminRole,
          categoria: query.categoria,
          somenteNaoLidas,
          limite: query.limite,
        });
        return NextResponse.json(data, { status: 200 });
      } catch (error) {
        return respostaErroAdmin(error, "notificacoes-get");
      }
    },
  );
}

/** PATCH: marca uma notificação ou todas como lidas para o operador atual. */
export async function PATCH(req: NextRequest) {
  const g = await exigirAdmin("notificacoes", "escrever");
  if (!g.ok) return g.response;

  return runWithAuditActorContext(
    {
      usuarioId: g.actor.id,
      usuarioNome: g.actor.name,
      ip: req.headers.get("x-forwarded-for") ?? null,
    },
    async () => {
      try {
        const body = AdminNotificationsPatchSchema.parse(await req.json());
        const userKey = g.actor.id || g.actor.email || g.actor.adminRole;
        if (body.acao === "marcar_lida") {
          return NextResponse.json(
            await marcarNotificacaoAdminLidaSuperAdmin(body.id, userKey, g.actor.adminRole),
          );
        }
        return NextResponse.json(
          await marcarTodasNotificacoesAdminLidasSuperAdmin(userKey, g.actor.adminRole),
        );
      } catch (error) {
        return respostaErroAdmin(error, "notificacoes-patch");
      }
    },
  );
}


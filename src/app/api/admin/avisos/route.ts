import { NextRequest, NextResponse } from "next/server";
import { runWithAuditActorContext } from "@/server/audit";
import { exigirAdmin, respostaErroAdmin } from "@/server/auth/admin-guard";
import { AdminAvisosPostSchema } from "@/server/schemas/superadmin.schema";
import {
  criarAvisoEmMassaSuperAdmin,
  desativarAvisoEmMassaSuperAdmin,
  listarAvisosEmMassaSuperAdmin,
} from "@/server/services/superadmin.service";

export const dynamic = "force-dynamic";

export async function GET(req?: Request) {
  const g = await exigirAdmin("avisos");
  if (!g.ok) return g.response;
  return runWithAuditActorContext(
    {
      usuarioId: g.actor.id,
      usuarioNome: g.actor.name,
      ip: req?.headers.get("x-forwarded-for") ?? null,
    },
    async () => {
      try {
        return NextResponse.json({ avisos: await listarAvisosEmMassaSuperAdmin() });
      } catch (error) {
        return respostaErroAdmin(error, "avisos");
      }
    },
  );
}

/** POST `{ acao: "criar", ... }` ou `{ acao: "desativar", id }`. */
export async function POST(req: NextRequest) {
  const g = await exigirAdmin("avisos", "escrever");
  if (!g.ok) return g.response;
  return runWithAuditActorContext(
    {
      usuarioId: g.actor.id,
      usuarioNome: g.actor.name,
      ip: req.headers.get("x-forwarded-for") ?? null,
    },
    async () => {
      try {
        const parsed = AdminAvisosPostSchema.parse(await req.json());
        if ("acao" in parsed && parsed.acao === "desativar") {
          return NextResponse.json(await desativarAvisoEmMassaSuperAdmin(parsed.id));
        }
        return NextResponse.json(await criarAvisoEmMassaSuperAdmin(parsed), {
          status: 201,
        });
      } catch (error) {
        return respostaErroAdmin(error, "avisos-post");
      }
    },
  );
}

import { NextRequest, NextResponse } from "next/server";
import { runWithAuditActorContext } from "@/server/audit";
import { exigirAdmin, respostaErroAdmin } from "@/server/auth/admin-guard";
import { AdminUpsertAdminUserSchema } from "@/server/schemas/superadmin.schema";
import {
  listarLogsAdministrativosSuperAdmin,
  listarUsuariosAdminSuperAdmin,
  salvarUsuarioAdminSuperAdmin,
} from "@/server/services/superadmin.service";

export const dynamic = "force-dynamic";

export async function GET(req?: Request) {
  const g = await exigirAdmin("sistema");
  if (!g.ok) return g.response;
  return runWithAuditActorContext(
    {
      usuarioId: g.actor.id,
      usuarioNome: g.actor.name,
      ip: req?.headers.get("x-forwarded-for") ?? null,
    },
    async () => {
      try {
        const [usuarios, logs] = await Promise.all([
          listarUsuariosAdminSuperAdmin(),
          listarLogsAdministrativosSuperAdmin(150),
        ]);
        return NextResponse.json({ usuarios, logs });
      } catch (error) {
        return respostaErroAdmin(error, "sistema");
      }
    },
  );
}

/** Somente `SUPERADMIN_MASTER` altera a equipe ADM. */
export async function POST(req: NextRequest) {
  const g = await exigirAdmin("sistema", "escrever");
  if (!g.ok) return g.response;
  return runWithAuditActorContext(
    {
      usuarioId: g.actor.id,
      usuarioNome: g.actor.name,
      ip: req.headers.get("x-forwarded-for") ?? null,
    },
    async () => {
      try {
        const payload = AdminUpsertAdminUserSchema.parse(await req.json());
        return NextResponse.json(await salvarUsuarioAdminSuperAdmin(payload), {
          status: 201,
        });
      } catch (error) {
        return respostaErroAdmin(error, "sistema-post");
      }
    },
  );
}

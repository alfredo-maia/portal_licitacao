import { notFound } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/server/auth";
import { prisma } from "@/lib/prisma";
import { can, type AdminArea, type RbacUser } from "@/lib/rbac";

/** Barreira de invisibilidade das páginas `/admin/*`: não-admin ou sem adminRole recebe 404. */
export async function exigirPaginaAdmin(area: AdminArea): Promise<void> {
  const session = await getServerSession(authOptions).catch(() => null);
  const user = session?.user as
    | (RbacUser & { adminRole?: string | null; sessionVersion?: number })
    | undefined;
  if (!user || !user.adminRole) notFound();

  let effectiveUser: RbacUser = user;
  if (user.id && process.env.VITEST !== "true") {
    try {
      const dbRow = await prisma.user.findUnique({
        where: { id: user.id },
        select: { ativo: true, role: true, isSuperAdmin: true, adminRole: true, sessionVersion: true },
      });
      if (dbRow) {
        if (
          !dbRow.ativo ||
          (typeof user.sessionVersion === "number" && dbRow.sessionVersion !== user.sessionVersion)
        ) {
          notFound();
        }
        effectiveUser = {
          ...user,
          ativo: dbRow.ativo,
          role: dbRow.role,
          isSuperAdmin: dbRow.isSuperAdmin,
          adminRole: dbRow.adminRole,
        };
      }
    } catch {
      // Fallback para claims da sessão em caso de falha transitória
    }
  }

  if (!can(effectiveUser, "superadmin:view", `admin:${area}`)) notFound();
}

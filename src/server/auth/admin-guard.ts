import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/server/auth";
import { prisma } from "@/lib/prisma";
import { can, type AdminArea, type RbacUser } from "@/lib/rbac";
import { setAuditActorContext } from "@/server/audit";

export interface AdminActor {
  id: string | null;
  name: string;
  email: string | null;
  adminRole: string;
}

type GuardResult =
  | { ok: true; actor: AdminActor }
  | { ok: false; response: NextResponse };

/**
 * Barreira de invisibilidade do Portal ADM: qualquer não-admin (ou papel ADM sem permissão
 * na área, ou com adminRole ausente) recebe `404`, nunca `401/403`, para não revelar `/api/admin/*`.
 */
export async function exigirAdmin(
  area: AdminArea,
  modo: "ler" | "escrever" = "ler",
): Promise<GuardResult> {
  const naoEncontrado = NextResponse.json({ error: "Página não encontrada" }, { status: 404 });
  const session = await getServerSession(authOptions).catch(() => null);
  const user = session?.user as
    | (RbacUser & { name?: string | null; adminRole?: string | null; sessionVersion?: number })
    | undefined;

  if (!user || !user.adminRole) return { ok: false, response: naoEncontrado };

  let effectiveUser: RbacUser & { name?: string | null; adminRole?: string | null } = user;

  // Valida killswitch ativo/sessionVersion em tempo real quando o registro existe no Postgres
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
          return { ok: false, response: naoEncontrado };
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
      // Em falha transitória de banco, segue validação estrita com claims da sessão assinada
    }
  }

  const permitido = can(
    effectiveUser,
    modo === "ler" ? "superadmin:view" : "superadmin:manage",
    `admin:${area}`,
  );
  if (!permitido || !effectiveUser.adminRole) {
    return { ok: false, response: naoEncontrado };
  }

  const actor: AdminActor = {
    id: effectiveUser.id ?? null,
    name: effectiveUser.name || effectiveUser.email || "SuperAdmin",
    email: effectiveUser.email ?? null,
    adminRole: effectiveUser.adminRole,
  };
  setAuditActorContext({ usuarioId: actor.id, usuarioNome: actor.name });
  return { ok: true, actor };
}

export function respostaErroAdmin(error: unknown, contexto: string): NextResponse {
  const e = error as {
    name?: string;
    code?: string;
    issues?: unknown;
    message?: string;
    statusCode?: number;
  };
  if (e?.name === "ZodError") {
    return NextResponse.json({ error: "Dados inválidos", issues: e.issues }, { status: 400 });
  }
  if (e?.code === "P2002") {
    return NextResponse.json(
      { error: "Registro já existente (conflito de identificador único)." },
      { status: 409 },
    );
  }
  if (e?.code === "P2025") {
    return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 });
  }
  if (e?.code === "P2003") {
    return NextResponse.json(
      { error: "Referência inválida para registro relacionado." },
      { status: 400 },
    );
  }
  const msg = e?.message || `Erro em ${contexto}`;
  if (typeof e?.statusCode === "number" && e.statusCode >= 400 && e.statusCode < 500) {
    return NextResponse.json({ error: msg }, { status: e.statusCode });
  }
  if (/não encontrad|inexistent/i.test(msg)) {
    return NextResponse.json({ error: msg }, { status: 404 });
  }
  if (/já existe|duplicad|cadastrad|proibido|não é possível|inválid|expirad|esgotad/i.test(msg)) {
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  console.error(`[Admin ${contexto}]:`, error);
  return NextResponse.json({ error: msg }, { status: 500 });
}


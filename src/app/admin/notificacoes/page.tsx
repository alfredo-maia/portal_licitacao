import { getServerSession } from "next-auth/next";
import { authOptions } from "@/server/auth";
import { exigirPaginaAdmin } from "@/server/auth/admin-page-guard";
import { NotificacoesAdminScreen } from "@/components/admin/screens/NotificacoesAdminScreen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Portal ADM — Notificações" };

export default async function NotificacoesAdminPage() {
  await exigirPaginaAdmin("notificacoes");
  const session = await getServerSession(authOptions).catch(() => null);
  const adminRole =
    (session?.user as { adminRole?: string | null } | undefined)?.adminRole ?? null;
  return <NotificacoesAdminScreen adminRole={adminRole} />;
}


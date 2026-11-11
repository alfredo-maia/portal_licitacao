import { SuporteAdminScreen } from "@/components/admin/screens/SuporteAdminScreen";
import { exigirPaginaAdmin } from "@/server/auth/admin-page-guard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Portal ADM — Suporte (Lista & Kanban)" };

export default async function SuporteAdminPage() {
  await exigirPaginaAdmin("suporte");
  return <SuporteAdminScreen />;
}


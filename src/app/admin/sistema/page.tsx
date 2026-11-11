import { SistemaAdminScreen } from "@/components/admin/screens/SistemaAdminScreen";
import { exigirPaginaAdmin } from "@/server/auth/admin-page-guard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Portal ADM — Equipe ADM & Logs" };

export default async function SistemaAdminPage() {
  await exigirPaginaAdmin("sistema");
  return <SistemaAdminScreen />;
}


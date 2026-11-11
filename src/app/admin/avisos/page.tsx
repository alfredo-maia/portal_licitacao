import { AvisosScreen } from "@/components/admin/screens/AvisosScreen";
import { exigirPaginaAdmin } from "@/server/auth/admin-page-guard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Portal ADM — Avisos em Massa" };

export default async function AvisosPage() {
  await exigirPaginaAdmin("avisos");
  return <AvisosScreen />;
}


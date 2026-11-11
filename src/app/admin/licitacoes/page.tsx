import { LicitacoesAdminScreen } from "@/components/admin/screens/LicitacoesAdminScreen";
import { exigirPaginaAdmin } from "@/server/auth/admin-page-guard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Portal ADM — Licitações & PNCP" };

export default async function LicitacoesAdminPage() {
  await exigirPaginaAdmin("licitacoes");
  return <LicitacoesAdminScreen />;
}


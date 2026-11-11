import { AfiliadosScreen } from "@/components/admin/screens/AfiliadosScreen";
import { exigirPaginaAdmin } from "@/server/auth/admin-page-guard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Portal ADM — Afiliados & Comissões" };

export default async function AfiliadosPage() {
  await exigirPaginaAdmin("afiliados");
  return <AfiliadosScreen />;
}


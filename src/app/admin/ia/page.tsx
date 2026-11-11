import { IaConsumoScreen } from "@/components/admin/screens/IaConsumoScreen";
import { exigirPaginaAdmin } from "@/server/auth/admin-page-guard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Portal ADM — Consumo & Custos IA" };

export default async function IaConsumoPage() {
  await exigirPaginaAdmin("ia");
  return <IaConsumoScreen />;
}


import { FinanceiroScreen } from "@/components/admin/screens/FinanceiroScreen";
import { exigirPaginaAdmin } from "@/server/auth/admin-page-guard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Portal ADM — Financeiro & Planos" };

export default async function FinanceiroPage() {
  await exigirPaginaAdmin("financeiro");
  return <FinanceiroScreen />;
}


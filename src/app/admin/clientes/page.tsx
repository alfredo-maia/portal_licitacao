import { ClientesScreen } from "@/components/admin/screens/ClientesScreen";
import { exigirPaginaAdmin } from "@/server/auth/admin-page-guard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Portal ADM — Clientes 360º" };

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string }>;
}) {
  await exigirPaginaAdmin("clientes");
  const { busca } = await searchParams;
  return <ClientesScreen buscaInicial={busca || ""} />;
}

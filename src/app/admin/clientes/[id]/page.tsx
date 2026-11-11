import { Cliente360Screen } from "@/components/admin/screens/Cliente360Screen";
import { exigirPaginaAdmin } from "@/server/auth/admin-page-guard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Portal ADM — Cliente 360º" };

export default async function Cliente360Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigirPaginaAdmin("clientes");
  const { id } = await params;
  return <Cliente360Screen tenantId={id} />;
}


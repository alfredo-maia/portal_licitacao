import { exigirPaginaAdmin } from "@/server/auth/admin-page-guard";
import {
  obterMetricasSuperAdmin,
  listarTenantsSuperAdmin,
} from "@/server/services/superadmin.service";
import { SuperAdminDashboard } from "@/components/admin/SuperAdminDashboard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Portal ADM — Dashboard Executivo",
  description: "Backoffice executivo e gestão de clientes da plataforma.",
};

export default async function AdminPage() {
  // Barreira de invisibilidade: se não for admin autorizado na área dashboard, retorna 404 Not Found
  await exigirPaginaAdmin("dashboard");

  const [metrics, tenants] = await Promise.all([
    obterMetricasSuperAdmin(),
    listarTenantsSuperAdmin(),
  ]);

  return <SuperAdminDashboard initialMetrics={metrics} initialTenants={tenants} />;
}

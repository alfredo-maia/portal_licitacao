import { notFound } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/server/auth";
import { can } from "@/lib/rbac";
import {
  obterMetricasSuperAdmin,
  listarTenantsSuperAdmin,
} from "@/server/services/superadmin.service";
import { SuperAdminDashboard } from "@/components/admin/SuperAdminDashboard";

export const metadata = {
  title: "SuperAdmin — Gestão da Plataforma",
  description: "Backoffice executivo e gestão de tenants da plataforma.",
};

export default async function AdminPage() {
  const session = await getServerSession(authOptions).catch(() => null);

  // Barreira de invisibilidade: se não for SUPERADMIN, retorna 404 Not Found imediatamente
  if (!session?.user || !can(session.user as any, "superadmin:view", "admin")) {
    notFound();
  }

  const [metrics, tenants] = await Promise.all([
    obterMetricasSuperAdmin(),
    listarTenantsSuperAdmin(),
  ]);

  return <SuperAdminDashboard initialMetrics={metrics} initialTenants={tenants} />;
}

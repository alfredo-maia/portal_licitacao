import type { ReactNode } from "react";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/server/auth";
import { AdminShell } from "@/components/admin/AdminShell";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions).catch(() => null);
  const user = session?.user as
    | { name?: string | null; email?: string | null; adminRole?: string | null }
    | undefined;
  const adminRole = user?.adminRole ?? null;
  const adminName = user?.name ?? null;
  const adminEmail = user?.email ?? null;
  return (
    <AdminShell adminRole={adminRole} adminName={adminName} adminEmail={adminEmail}>
      {children}
    </AdminShell>
  );
}

import type { ReactNode } from "react";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/server/auth";
import { AdminShell } from "@/components/admin/AdminShell";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions).catch(() => null);
  const adminRole =
    (session?.user as { adminRole?: string | null } | undefined)?.adminRole ?? null;
  return <AdminShell adminRole={adminRole}>{children}</AdminShell>;
}

"use client";

import React, { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Header,
  HeaderGlobalAction,
  HeaderGlobalBar,
  HeaderMenuButton,
  HeaderName,
  SideNav,
  SideNavItems,
  SideNavLink,
  SkipToContent,
  Tag,
} from "@carbon/react";
import {
  Asleep,
  Analytics,
  Chat,
  Dashboard,
  Light,
  Logout,
  Money,
  Settings,
  Share,
  Switcher,
  UserAvatar,
  UserMultiple,
  Bullhorn,
  Catalog,
  type CarbonIconType,
} from "@carbon/icons-react";
import { APP_CONFIG } from "@/config/brand";
import { adminPodeAcessar, type AdminArea } from "@/lib/rbac";
import { ADMIN_ROUTES } from "@/server/schemas/superadmin.schema";
import { useAppTheme } from "@/providers/theme-provider";
import { AdminNotificationsBell } from "./AdminNotificationsBell";

const ADMIN_ICONS: Record<string, CarbonIconType> = {
  dashboard: Dashboard,
  clientes: UserMultiple,
  financeiro: Money,
  afiliados: Share,
  suporte: Switcher,
  avisos: Bullhorn,
  whatsapp: Chat,
  ia: Analytics,
  licitacoes: Catalog,
  sistema: Settings,
};

function formatarPrimeiroSegundoNome(
  nome?: string | null,
  email?: string | null,
): string {
  const limpo = (nome || "").trim();
  if (limpo) {
    const partes = limpo.split(/\s+/).filter(Boolean);
    return partes.slice(0, 2).join(" ");
  }
  const emailPref = (email || "").split("@")[0]?.trim();
  if (emailPref) {
    const partesEmail = emailPref.replace(/[._-]+/g, " ").split(/\s+/).filter(Boolean);
    if (partesEmail.length > 0) {
      return partesEmail
        .slice(0, 2)
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
        .join(" ");
    }
  }
  return "Administrador ADM";
}

function obterTagPapelAdmin(role?: string | null): {
  label: string;
  type: "red" | "purple" | "teal";
} {
  if (role === "ADMIN_OPERACIONAL") {
    return { label: "Admin Operacional", type: "purple" };
  }
  if (role === "SUPORTE_N1") {
    return { label: "Suporte N1", type: "teal" };
  }
  return { label: "SuperAdmin Master", type: "red" };
}

/**
 * Shell Carbon exclusivo do Portal ADM ("Deus ex Machina"): completamente desacoplado do `AppShell`
 * do cliente (sem Suporte FAB, sem seletor de CNPJ, sem menu de licitações).
 */
export function AdminShell({
  children,
  adminRole,
  adminName,
  adminEmail,
}: {
  children: ReactNode;
  adminRole?: string | null;
  adminName?: string | null;
  adminEmail?: string | null;
}) {
  const pathname = usePathname() || "/admin";
  const router = useRouter();
  const { isDark, toggleTheme } = useAppTheme();
  const [expandido, setExpandido] = useState(true);

  if (pathname === "/admin/login") {
    return (
      <main id="main-content" style={{ minHeight: "100vh", width: "100%" }}>
        {children}
      </main>
    );
  }

  const rotasVisiveis =
    adminRole === undefined
      ? ADMIN_ROUTES
      : ADMIN_ROUTES.filter((route) =>
          adminPodeAcessar(adminRole, route.id as AdminArea, "ler"),
        );

  const nomeExibicao = formatarPrimeiroSegundoNome(adminName, adminEmail);
  const papelInfo = obterTagPapelAdmin(adminRole);

  const sair = () => {
    void signOut({ callbackUrl: "/admin/login" });
  };

  return (
    <div data-testid="admin-carbon-shell">
      <Header aria-label={`${APP_CONFIG.brandName} — Portal ADM`}>
        <SkipToContent href="#main-content" />
        <HeaderMenuButton
          aria-label={expandido ? "Recolher menu lateral" : "Expandir menu lateral"}
          onClick={() => setExpandido((p) => !p)}
          isActive={expandido}
          isCollapsible
        />
        <HeaderName as={Link} href="/admin" prefix="">
          <span>{APP_CONFIG.brandName}</span>
        </HeaderName>

        <HeaderGlobalBar>
          <div
            data-testid="admin-header-user-info"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0 0.75rem",
              height: "3rem",
              whiteSpace: "nowrap",
            }}
          >
            <span
              data-testid="admin-header-user-name"
              style={{
                fontSize: "0.85rem",
                fontWeight: 600,
                color: "var(--cds-text-primary, #f4f4f4)",
              }}
            >
              {nomeExibicao}
            </span>
            <Tag
              data-testid="admin-header-user-role"
              type={papelInfo.type}
              size="sm"
            >
              {papelInfo.label}
            </Tag>
          </div>
          <AdminNotificationsBell />
          <HeaderGlobalAction
            aria-label={isDark ? "Alternar para Tema Claro" : "Alternar para Tema Escuro"}
            data-testid="admin-theme-toggle"
            onClick={toggleTheme}
          >
            {isDark ? <Light size={20} /> : <Asleep size={20} />}
          </HeaderGlobalAction>
          <HeaderGlobalAction
            aria-label="Perfil ADM e Configurações"
            data-testid="admin-profile-action"
            onClick={() => router.push("/admin/sistema")}
          >
            <UserAvatar size={20} />
          </HeaderGlobalAction>
          <HeaderGlobalAction
            aria-label="Sair do Portal ADM"
            data-testid="admin-logout-btn"
            onClick={sair}
          >
            <Logout size={20} />
          </HeaderGlobalAction>
        </HeaderGlobalBar>

        <SideNav aria-label="Menu Lateral do Portal ADM" expanded={expandido} isFixedNav>
          <SideNavItems>
            {rotasVisiveis.map((route) => {
              const Icon = ADMIN_ICONS[route.id] ?? Dashboard;
              const ativo =
                route.path === "/admin"
                  ? pathname === "/admin"
                  : pathname === route.path || pathname.startsWith(`${route.path}/`);
              return (
                <SideNavLink
                  key={route.id}
                  as={Link}
                  href={route.path}
                  renderIcon={Icon}
                  isActive={ativo}
                  aria-current={ativo ? "page" : undefined}
                >
                  {route.label}
                </SideNavLink>
              );
            })}
          </SideNavItems>
        </SideNav>
      </Header>

      {expandido && (
        <div
          className="pncp-sidenav-backdrop"
          onClick={() => setExpandido(false)}
          aria-hidden="true"
          data-testid="admin-sidenav-backdrop"
        />
      )}

      <main
        id="main-content"
        className={`pncp-shell-content ${expandido ? "pncp-shell-content--expanded" : ""}`}
      >
        {children}
      </main>
    </div>
  );
}

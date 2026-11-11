"use client";

import React, { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  UserMultiple,
  Bullhorn,
  Catalog,
  type CarbonIconType,
} from "@carbon/icons-react";
import { APP_CONFIG } from "@/config/brand";
import { adminPodeAcessar, type AdminArea } from "@/lib/rbac";
import { ADMIN_ROUTES } from "@/server/schemas/superadmin.schema";
import { useAppTheme } from "@/providers/theme-provider";

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

/**
 * Shell Carbon exclusivo do Portal ADM ("Deus ex Machina"): completamente desacoplado do `AppShell`
 * do cliente (sem Suporte FAB, sem seletor de CNPJ, sem menu de licitações).
 */
export function AdminShell({
  children,
  adminRole,
}: {
  children: ReactNode;
  adminRole?: string | null;
}) {
  const pathname = usePathname() || "/admin";
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
          <Tag type="red" size="sm" style={{ marginLeft: "0.5rem" }}>
            SUPERADMIN
          </Tag>
        </HeaderName>

        <HeaderGlobalBar>
          <HeaderGlobalAction
            aria-label={isDark ? "Alternar para Tema Claro" : "Alternar para Tema Escuro"}
            data-testid="admin-theme-toggle"
            onClick={toggleTheme}
          >
            {isDark ? <Light size={20} /> : <Asleep size={20} />}
          </HeaderGlobalAction>
          <HeaderGlobalAction aria-label="Sair do Portal ADM" onClick={sair}>
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

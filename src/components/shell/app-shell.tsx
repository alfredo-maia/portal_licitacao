"use client";

import React, { useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Button,
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
  Bot,
  Calendar,
  Certificate,
  Close,
  Dashboard,
  Document,
  Earth,
  Light,
  Notification,
  Rule,
  Search,
  Settings,
  Task,
  UserAvatar,
  type CarbonIconType,
} from "@carbon/icons-react";
import { NotificationsBell } from "./notifications-bell";
import { APP_CONFIG } from "@/config/brand";
import { APP_ROUTES } from "@/config/routes";
import { useAppTheme } from "@/providers/theme-provider";

const ROUTE_ICONS: Record<string, CarbonIconType> = {
  dashboard: Dashboard,
  oportunidades: Search,
  "minhas-licitacoes": Task,
  calendario: Calendar,
  portais: Earth,
  documentacao: Document,
  declaracoes: Certificate,
  impugnacoes: Rule,
  "robo-de-lances": Bot,
  notificacoes: Notification,
  configuracoes: Settings,
};

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/dashboard";
  const router = useRouter();
  const { isDark, toggleTheme } = useAppTheme();
  const [isSideNavExpanded, setIsSideNavExpanded] = useState(true);

  React.useEffect(() => {
    if (typeof window !== "undefined" && pathname && !pathname.startsWith("/oportunidades/")) {
      try {
        sessionStorage.setItem("portal_nav_origin", pathname);
      } catch {
        // Ignora erros de storage (ex: modo restrito)
      }
    }
  }, [pathname]);

  const handleToggleSideNav = () => {
    setIsSideNavExpanded((prev) => !prev);
  };

  return (
    <div data-testid="carbon-ui-shell">
      <Header aria-label={APP_CONFIG.brandName}>
        <SkipToContent href="#main-content" />
        <HeaderMenuButton
          aria-label={
            isSideNavExpanded ? "Recolher menu lateral" : "Expandir menu lateral"
          }
          onClick={handleToggleSideNav}
          isActive={isSideNavExpanded}
          isCollapsible
        />
        <HeaderName href="/dashboard" prefix="">
          <span>{APP_CONFIG.brandName}</span>
        </HeaderName>

        <HeaderGlobalBar>
          <NotificationsBell />

          <HeaderGlobalAction
            aria-label={
              isDark
                ? "Alternar para Tema Claro (white/g10)"
                : "Alternar para Tema Escuro (g90/g100)"
            }
            data-testid="theme-toggle"
            onClick={toggleTheme}
          >
            {isDark ? <Light size={20} /> : <Asleep size={20} />}
          </HeaderGlobalAction>

          <HeaderGlobalAction
            aria-label="Perfil do Usuário e Configurações"
            data-testid="user-profile-action"
            onClick={() => router.push("/configuracoes")}
          >
            <UserAvatar size={20} />
          </HeaderGlobalAction>
        </HeaderGlobalBar>

        <SideNav
          aria-label="Menu Lateral de Módulos"
          expanded={isSideNavExpanded}
          isFixedNav
        >
          {/* Top header do menu lateral com botão X alinhado à direita (Sprint 7) */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              padding: "0.25rem 0.5rem",
              borderBottom: "1px solid var(--cds-border-subtle)",
            }}
          >
            <Button
              kind="ghost"
              size="sm"
              hasIconOnly
              renderIcon={Close}
              iconDescription="Recolher menu lateral"
              onClick={() => setIsSideNavExpanded(false)}
              id="btn-close-navbar-right"
              aria-label="Fechar menu lateral"
            />
          </div>

          <SideNavItems>
            {APP_ROUTES.map((route) => {
              const IconComponent = ROUTE_ICONS[route.id] ?? Document;
              const isActive =
                pathname === route.path ||
                pathname.startsWith(`${route.path}/`);

              return (
                <SideNavLink
                  key={route.id}
                  href={route.path}
                  renderIcon={IconComponent}
                  isActive={isActive}
                  aria-current={isActive ? "page" : undefined}
                >
                  <span>{route.label}</span>
                  {route.badge ? (
                    <Tag
                      size="sm"
                      type="cool-gray"
                      style={{ marginLeft: "0.5rem" }}
                    >
                      {route.badge}
                    </Tag>
                  ) : null}
                </SideNavLink>
              );
            })}
          </SideNavItems>
        </SideNav>
      </Header>

      {/* Backdrop opaco desativando o fundo quando a navbar estiver expandida em telas responsivas (Sprint 7) */}
      {isSideNavExpanded && (
        <div
          className="pncp-sidenav-backdrop"
          onClick={() => setIsSideNavExpanded(false)}
          aria-hidden="true"
          data-testid="sidenav-backdrop"
        />
      )}

      <main
        id="main-content"
        className={`pncp-shell-content ${
          isSideNavExpanded ? "pncp-shell-content--expanded" : ""
        }`}
      >
        {children}
      </main>
    </div>
  );
}

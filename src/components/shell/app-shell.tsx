"use client";

import React, { useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
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
  Bot,
  Calendar,
  Certificate,
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
          <HeaderGlobalAction
            aria-label="Notificações (3 não lidas)"
            data-testid="notifications-bell"
            onClick={() => router.push("/notificacoes")}
          >
            <span
              style={{
                position: "relative",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Notification size={20} />
              <span
                data-testid="notifications-badge"
                className="pncp-mono"
                style={{
                  position: "absolute",
                  top: "-6px",
                  right: "-8px",
                  backgroundColor: "#da1e28",
                  color: "#ffffff",
                  borderRadius: "9999px",
                  fontSize: "0.625rem",
                  fontWeight: 600,
                  minWidth: "1rem",
                  height: "1rem",
                  padding: "0 0.25rem",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  lineHeight: 1,
                }}
              >
                3
              </span>
            </span>
          </HeaderGlobalAction>

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

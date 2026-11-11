"use client";

import React, { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Button,
  Header,
  HeaderGlobalAction,
  HeaderGlobalBar,
  HeaderMenuButton,
  HeaderName,
  InlineNotification,
  NotificationActionButton,
  SideNav,
  SideNavItems,
  SideNavLink,
  SideNavMenu,
  SideNavMenuItem,
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
  Headset,
  Light,
  Logout,
  Notification,
  Rule,
  Search,
  Settings,
  Task,
  Upgrade,
  UserAvatar,
  type CarbonIconType,
} from "@carbon/icons-react";
import { NotificationsBell } from "./notifications-bell";
import { TenantHeaderSelector } from "./tenant-header-selector";
import { SystemBroadcastBanner } from "./system-broadcast-banner";
import { SuporteModal } from "@/components/suporte/suporte-modal";
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
  planos: Upgrade,
  configuracoes: Settings,
};

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/dashboard";
  const router = useRouter();
  const { isDark, toggleTheme } = useAppTheme();
  const [isSideNavExpanded, setIsSideNavExpanded] = useState(true);
  const [suporteModalOpen, setSuporteModalOpen] = useState(false);
  const [subStatus, setSubStatus] = useState<{
    billingStatus?: string;
    plano?: string;
    diasRestantesTrial?: number;
    isReadOnly?: boolean;
    inGracePeriod?: boolean;
    mensagemStatus?: string;
  } | null>(null);

  React.useEffect(() => {
    if (typeof fetch !== "function") return;
    fetch("/api/planos/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.ok !== false) {
          setSubStatus(data);
        } else {
          setSubStatus(null);
        }
      })
      .catch(() => {});
  }, [pathname]);

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

  const handleLogout = () => {
    if (typeof window !== "undefined") {
      try {
        localStorage.clear();
        sessionStorage.clear();
        document.cookie = "portal_licitacao_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
        document.cookie = "portal_licitacao_active_tenant=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
        document.cookie = "next-auth.session-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
        document.cookie = "__Secure-next-auth.session-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      } catch {
        // Ignora erros de storage
      }
      try {
        fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
      } catch {
        // Ignora falhas de rede no logout
      }
    }
    signOut({ callbackUrl: "/login" });
  };

  const isAuthRoute =
    pathname === "/login" ||
    pathname === "/cadastro" ||
    pathname === "/esqueci-senha" ||
    pathname === "/recuperar-senha";

  // Portal ADM possui Shell Carbon próprio (AdminShell) com <main id="main-content"> dedicado
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");

  if (isAdminRoute) {
    return <>{children}</>;
  }

  if (isAuthRoute) {
    return (
      <main id="main-content" style={{ minHeight: "100vh", width: "100%" }}>
        {children}
      </main>
    );
  }

  const trialDias =
    typeof subStatus?.diasRestantesTrial === "number"
      ? Math.max(0, subStatus.diasRestantesTrial)
      : 14;
  const trialSeverity: "safe" | "warning" | "danger" =
    trialDias >= 6 ? "safe" : trialDias >= 1 ? "warning" : "danger";
  const trialBadgeColors =
    trialSeverity === "safe"
      ? { bg: "#0f62fe", fg: "#ffffff", border: "#4589ff" }
      : trialSeverity === "warning"
        ? { bg: "#f1c21b", fg: "#161616", border: "#d2a106" }
        : { bg: "#da1e28", fg: "#ffffff", border: "#fa4d56" };

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
        <HeaderName as={Link} href="/dashboard" prefix="">
          <span>{APP_CONFIG.brandName}</span>
        </HeaderName>

        <HeaderGlobalBar>
          {subStatus?.billingStatus === "TRIAL" && (
            <button
              type="button"
              data-testid="header-trial-badge"
              data-severity={trialSeverity}
              onClick={() => router.push("/planos")}
              title="Ver detalhes da assinatura ou escolher um plano"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                alignSelf: "center",
                marginRight: "0.5rem",
                padding: "0.25rem 0.625rem",
                borderRadius: "9999px",
                border: `1px solid ${trialBadgeColors.border}`,
                backgroundColor: trialBadgeColors.bg,
                color: trialBadgeColors.fg,
                fontSize: "0.75rem",
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
                lineHeight: 1.2,
              }}
            >
              <span>
                Grátis - Pro • {trialDias} {trialDias === 1 ? "dia" : "dias"} de teste
              </span>
            </button>
          )}
          <TenantHeaderSelector />
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

          <HeaderGlobalAction
            aria-label="Sair da Conta (Logout)"
            data-testid="header-logout-btn"
            onClick={handleLogout}
          >
            <Logout size={20} />
          </HeaderGlobalAction>
        </HeaderGlobalBar>

        <SideNav
          aria-label="Menu Lateral de Módulos"
          expanded={isSideNavExpanded}
          isFixedNav
        >
          <SideNavItems>
            {APP_ROUTES.map((route) => {
              if (route.id === "robo-de-lances") {
                const isArsenalActive =
                  pathname === "/robo-de-lances" ||
                  pathname.startsWith("/robo-de-lances/") ||
                  pathname === "/inteligencia-precos" ||
                  pathname.startsWith("/inteligencia-precos/");

                return (
                  <SideNavMenu
                    key="arsenal-de-disputa"
                    title="Arsenal de Disputa"
                    renderIcon={Bot}
                    isActive={isArsenalActive}
                    defaultExpanded={true}
                  >
                    <SideNavMenuItem
                      as={Link}
                      href="/robo-de-lances"
                      isActive={
                        pathname === "/robo-de-lances" ||
                        pathname.startsWith("/robo-de-lances/")
                      }
                      aria-current={
                        pathname === "/robo-de-lances" ? "page" : undefined
                      }
                    >
                      <span>Robô de Lances</span>
                      {route.badge ? (
                        <Tag
                          size="sm"
                          type="cool-gray"
                          style={{ marginLeft: "0.5rem" }}
                        >
                          {route.badge}
                        </Tag>
                      ) : null}
                    </SideNavMenuItem>
                    <SideNavMenuItem
                      as={Link}
                      href="/inteligencia-precos"
                      isActive={
                        pathname === "/inteligencia-precos" ||
                        pathname.startsWith("/inteligencia-precos/")
                      }
                      aria-current={
                        pathname === "/inteligencia-precos" ? "page" : undefined
                      }
                    >
                      <span>Inteligência de Preços</span>
                    </SideNavMenuItem>
                  </SideNavMenu>
                );
              }

              const IconComponent = ROUTE_ICONS[route.id] ?? Document;
              const isActive =
                pathname === route.path ||
                pathname.startsWith(`${route.path}/`);

              return (
                <SideNavLink
                  key={route.id}
                  as={Link}
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
        {subStatus?.isReadOnly && pathname !== "/planos" && (
          <div style={{ marginBottom: "1rem" }} data-testid="banner-bloqueio-planos">
            <InlineNotification
              kind="error"
              title="Acesso Somente-Leitura:"
              subtitle={
                subStatus.mensagemStatus ||
                "Seu período de teste expirou. Escolha um plano para reativar as ações."
              }
              hideCloseButton
            >
              <div style={{ marginTop: "0.5rem" }}>
                <NotificationActionButton onClick={() => router.push("/planos")}>
                  Ver Planos
                </NotificationActionButton>
              </div>
            </InlineNotification>
          </div>
        )}
        {subStatus?.inGracePeriod && pathname !== "/planos" && (
          <div style={{ marginBottom: "1rem" }} data-testid="banner-carencia-planos">
            <InlineNotification
              kind="warning"
              title="Período de Carência:"
              subtitle={
                subStatus.mensagemStatus ||
                "Seu período de teste terminou. Você tem alguns dias de carência antes do bloqueio das ações."
              }
              hideCloseButton
            >
              <div style={{ marginTop: "0.5rem" }}>
                <NotificationActionButton onClick={() => router.push("/planos")}>
                  Regularizar Plano
                </NotificationActionButton>
              </div>
            </InlineNotification>
          </div>
        )}
        <SystemBroadcastBanner />
        {children}
      </main>

      <Button
        kind="primary"
        size="md"
        renderIcon={Headset}
        data-testid="support-fab-btn"
        aria-label="Abrir Suporte"
        onClick={() => setSuporteModalOpen(true)}
        style={{
          position: "fixed",
          bottom: "1.5rem",
          right: "1.5rem",
          zIndex: 9000,
          borderRadius: "9999px",
          boxShadow: "0 4px 16px rgba(0, 0, 0, 0.28)",
        }}
      >
        Suporte
      </Button>

      <SuporteModal
        open={suporteModalOpen}
        onClose={() => setSuporteModalOpen(false)}
      />
    </div>
  );
}

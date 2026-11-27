"use client";

import React, { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  ActionableNotification,
  Button,
  Header,
  HeaderGlobalAction,
  HeaderGlobalBar,
  HeaderMenuButton,
  HeaderName,
  InlineLoading,
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
  Catalog,
  Certificate,
  Close,
  Dashboard,
  Document,
  Earth,
  Headset,
  Light,
  Locked,
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
import {
  isRouteAllowedWhenSubscriptionBlocked,
  isSubscriptionLocked,
} from "@/lib/subscription-guard";
import { useAppTheme } from "@/providers/theme-provider";

const ROUTE_ICONS: Record<string, CarbonIconType> = {
  dashboard: Dashboard,
  oportunidades: Search,
  "minhas-licitacoes": Task,
  "historico-licitacoes": Catalog,
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
  const [suporteNaoLidas, setSuporteNaoLidas] = useState(0);
  const [subStatus, setSubStatus] = useState<{
    billingStatus?: string;
    plano?: string;
    diasRestantesTrial?: number;
    diasRestantesCarencia?: number;
    isReadOnly?: boolean;
    isBlocked?: boolean;
    inGracePeriod?: boolean;
    mensagemStatus?: string;
  } | null>(null);
  const [cachedLockedHint, setCachedLockedHint] = useState(false);

  const carregarStatusAssinatura = React.useCallback(() => {
    if (typeof fetch !== "function") return;
    fetch("/api/planos/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.ok !== false) {
          setSubStatus(data);
          const lockedNow = Boolean(data.isBlocked || data.isReadOnly);
          setCachedLockedHint(lockedNow);
          if (typeof window !== "undefined") {
            try {
              if (lockedNow) {
                sessionStorage.setItem("portal_subscription_locked", "1");
              } else {
                sessionStorage.removeItem("portal_subscription_locked");
              }
            } catch {}
          }
        } else {
          setSubStatus(null);
        }
      })
      .catch(() => {});
  }, []);

  const carregarSuporteResumo = React.useCallback(async () => {
    if (typeof fetch !== "function") return;
    try {
      const res = await fetch("/api/suporte/tickets?resumo=1");
      if (res.ok) {
        const data = await res.json();
        if (data.ok) {
          setSuporteNaoLidas(Number(data.totalMensagensNaoLidas) || 0);
        }
      }
    } catch {
      // Falha silenciosa
    }
  }, []);

  React.useEffect(() => {
    void carregarSuporteResumo();
    const handleUpdated = () => void carregarSuporteResumo();
    if (typeof window !== "undefined") {
      window.addEventListener("suporte-tickets-updated", handleUpdated);
      return () => window.removeEventListener("suporte-tickets-updated", handleUpdated);
    }
  }, [carregarSuporteResumo, pathname]);

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        setCachedLockedHint(
          sessionStorage.getItem("portal_subscription_locked") === "1",
        );
      } catch {}
    }
    carregarStatusAssinatura();

    const handleRefreshSubscription = () => {
      carregarStatusAssinatura();
    };
    if (typeof window !== "undefined") {
      window.addEventListener("tenant-changed", handleRefreshSubscription);
      window.addEventListener("subscription-updated", handleRefreshSubscription);
      return () => {
        window.removeEventListener("tenant-changed", handleRefreshSubscription);
        window.removeEventListener(
          "subscription-updated",
          handleRefreshSubscription,
        );
      };
    }
  }, [carregarStatusAssinatura, pathname]);

  const isAuthRouteCheck =
    pathname === "/login" ||
    pathname === "/cadastro" ||
    pathname === "/esqueci-senha" ||
    pathname === "/recuperar-senha";
  const isAdminRouteCheck =
    pathname === "/admin" || pathname.startsWith("/admin/");
  const isSubscriptionLockedNow =
    subStatus !== null
      ? isSubscriptionLocked({
          isBlocked: Boolean(subStatus.isBlocked),
          isReadOnly: Boolean(subStatus.isReadOnly),
        })
      : cachedLockedHint;
  const isCurrentRouteBlockedByPaywall =
    !isAuthRouteCheck &&
    !isAdminRouteCheck &&
    isSubscriptionLockedNow &&
    !isRouteAllowedWhenSubscriptionBlocked(pathname);

  React.useEffect(() => {
    if (isCurrentRouteBlockedByPaywall) {
      router.replace("/planos?bloqueado=1");
    }
  }, [isCurrentRouteBlockedByPaywall, router]);

  React.useEffect(() => {
    if (typeof window !== "undefined" && pathname) {
      try {
        if (!pathname.startsWith("/oportunidades/")) {
          sessionStorage.setItem("portal_nav_origin", pathname);
        }
        // Limpa flag de retorno do Dossiê se o usuário navegar para outro módulo pelo menu
        if (
          pathname !== "/historico-licitacoes" &&
          !pathname.startsWith("/oportunidades/")
        ) {
          const rawHist = sessionStorage.getItem("portal_historico_last_state");
          if (rawHist) {
            const parsed = JSON.parse(rawHist) as Record<string, unknown>;
            if (parsed && parsed.returningFromDossie) {
              sessionStorage.setItem(
                "portal_historico_last_state",
                JSON.stringify({ ...parsed, returningFromDossie: false }),
              );
            }
          }
        }
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
                const isRoboLocked =
                  isSubscriptionLockedNow &&
                  !isRouteAllowedWhenSubscriptionBlocked("/robo-de-lances");
                const isInteligenciaLocked =
                  isSubscriptionLockedNow &&
                  !isRouteAllowedWhenSubscriptionBlocked("/inteligencia-precos");

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
                      href={isRoboLocked ? "/planos?bloqueado=1" : "/robo-de-lances"}
                      title={
                        isRoboLocked
                          ? "Assine um plano para desbloquear este módulo"
                          : undefined
                      }
                      isActive={
                        !isRoboLocked &&
                        (pathname === "/robo-de-lances" ||
                          pathname.startsWith("/robo-de-lances/"))
                      }
                      aria-current={
                        !isRoboLocked && pathname === "/robo-de-lances"
                          ? "page"
                          : undefined
                      }
                      style={isRoboLocked ? { opacity: 0.72 } : undefined}
                    >
                      <span>Robô de Lances</span>
                      {isRoboLocked ? (
                        <Locked
                          size={14}
                          aria-label="Módulo bloqueado"
                          data-testid="nav-locked-robo-de-lances"
                          style={{ marginLeft: "0.5rem" }}
                        />
                      ) : route.badge ? (
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
                      href={
                        isInteligenciaLocked
                          ? "/planos?bloqueado=1"
                          : "/inteligencia-precos"
                      }
                      title={
                        isInteligenciaLocked
                          ? "Assine um plano para desbloquear este módulo"
                          : undefined
                      }
                      isActive={
                        !isInteligenciaLocked &&
                        (pathname === "/inteligencia-precos" ||
                          pathname.startsWith("/inteligencia-precos/"))
                      }
                      aria-current={
                        !isInteligenciaLocked && pathname === "/inteligencia-precos"
                          ? "page"
                          : undefined
                      }
                      style={isInteligenciaLocked ? { opacity: 0.72 } : undefined}
                    >
                      <span>Inteligência de Preços</span>
                      {isInteligenciaLocked ? (
                        <Locked
                          size={14}
                          aria-label="Módulo bloqueado"
                          data-testid="nav-locked-inteligencia-precos"
                          style={{ marginLeft: "0.5rem" }}
                        />
                      ) : null}
                    </SideNavMenuItem>
                  </SideNavMenu>
                );
              }

              const IconComponent = ROUTE_ICONS[route.id] ?? Document;
              const isItemLocked =
                isSubscriptionLockedNow &&
                !isRouteAllowedWhenSubscriptionBlocked(route.path);
              const isActive =
                !isItemLocked &&
                (pathname === route.path ||
                  pathname.startsWith(`${route.path}/`));

              return (
                <SideNavLink
                  key={route.id}
                  as={Link}
                  href={isItemLocked ? "/planos?bloqueado=1" : route.path}
                  title={
                    isItemLocked
                      ? "Assine um plano para desbloquear este módulo"
                      : undefined
                  }
                  renderIcon={IconComponent}
                  isActive={isActive}
                  aria-current={isActive ? "page" : undefined}
                  style={isItemLocked ? { opacity: 0.72 } : undefined}
                >
                  <span>{route.label}</span>
                  {isItemLocked ? (
                    <Locked
                      size={14}
                      aria-label="Módulo bloqueado"
                      data-testid={`nav-locked-${route.id}`}
                      style={{ marginLeft: "0.5rem" }}
                    />
                  ) : route.badge ? (
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
        {(subStatus?.isReadOnly || subStatus?.isBlocked) &&
          pathname !== "/planos" && (
          <div style={{ marginBottom: "1rem" }} data-testid="banner-bloqueio-planos">
            <ActionableNotification
              inline
              kind="error"
              title="Acesso Somente-Leitura:"
              subtitle={
                subStatus.mensagemStatus ||
                "Seu período de teste expirou. Os módulos operacionais estão bloqueados — escolha um plano para liberar o acesso completo."
              }
              actionButtonLabel="Ver Planos"
              onActionButtonClick={() => router.push("/planos")}
              hideCloseButton
              style={{ maxWidth: "100%" }}
            />
          </div>
        )}
        {subStatus?.inGracePeriod && pathname !== "/planos" && (
          <div style={{ marginBottom: "1rem" }} data-testid="banner-carencia-planos">
            <ActionableNotification
              inline
              kind="warning"
              title="Período de Carência:"
              subtitle={
                subStatus.mensagemStatus ||
                "Seu período de teste terminou. Você tem alguns dias de carência antes do bloqueio das ações."
              }
              actionButtonLabel="Regularizar Plano"
              onActionButtonClick={() => router.push("/planos")}
              hideCloseButton
              style={{ maxWidth: "100%" }}
            />
          </div>
        )}
        <SystemBroadcastBanner />
        {isCurrentRouteBlockedByPaywall ? (
          <div
            data-testid="paywall-redirect-guard"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "40vh",
              padding: "2rem",
            }}
          >
            <InlineLoading
              status="active"
              description="Seu período de teste expirou. Redirecionando para Planos & Assinatura..."
            />
          </div>
        ) : (
          children
        )}
      </main>

      <Button
        kind="primary"
        size="md"
        renderIcon={Headset}
        data-testid="support-fab-btn"
        aria-label={`Abrir Suporte${suporteNaoLidas > 0 ? ` (${suporteNaoLidas} novas mensagens)` : ""}`}
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
        <span>Suporte</span>
        {suporteNaoLidas > 0 ? (
          <span
            data-testid="suporte-unread-badge"
            className="pncp-mono"
            style={{
              position: "absolute",
              top: "-6px",
              right: "-6px",
              backgroundColor: "var(--cds-support-error, #da1e28)",
              color: "#ffffff",
              borderRadius: "9999px",
              fontSize: "0.625rem",
              fontWeight: 700,
              minWidth: "1.1rem",
              height: "1.1rem",
              padding: "0 0.25rem",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
              boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
            }}
          >
            {suporteNaoLidas > 99 ? "99+" : suporteNaoLidas}
          </span>
        ) : null}
      </Button>

      <SuporteModal
        open={suporteModalOpen}
        onClose={() => {
          setSuporteModalOpen(false);
          void carregarSuporteResumo();
        }}
      />
    </div>
  );
}

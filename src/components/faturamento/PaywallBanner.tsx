"use client";

import React, { useEffect, useState } from "react";
import { InlineNotification } from "@carbon/react";

export interface PaywallBannerProps {
  initialStatus?: string;
}

export function PaywallBanner({ initialStatus }: PaywallBannerProps) {
  const [billing, setBilling] = useState<{
    status: string;
    diasAtraso: number;
    emPeriodoDeGraca: boolean;
    bloqueado: boolean;
  } | null>(null);

  useEffect(() => {
    fetch("/api/faturamento")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setBilling({
            status: data.status,
            diasAtraso: data.diasAtraso,
            emPeriodoDeGraca: data.emPeriodoDeGraca,
            bloqueado: data.bloqueado,
          });
        }
      })
      .catch(() => undefined);
  }, []);

  const status = billing?.status || initialStatus;

  if (status === "GRACE_PERIOD") {
    return (
      <div style={{ margin: "1rem 0" }} data-testid="paywall-grace-period-banner">
        <InlineNotification
          kind="warning"
          title="Período de Tolerância Ativo (3 Dias de Graça)"
          subtitle={`Sua assinatura venceu há ${billing?.diasAtraso || 1} dia(s). Seu acesso a todas as oportunidades continua 100% liberado, mas regularize para evitar interrupções.`}
          lowContrast
        />
        <div style={{ marginTop: "0.5rem" }}>
          <a
            href="/faturamento"
            style={{
              fontWeight: 600,
              color: "inherit",
              textDecoration: "underline",
              cursor: "pointer",
            }}
          >
            Regularizar Pagamento (PIX / Cartão) &rarr;
          </a>
        </div>
      </div>
    );
  }

  if (status === "BLOQUEADO" || status === "CANCELADO") {
    return (
      <div style={{ margin: "1rem 0" }} data-testid="paywall-blocked-banner">
        <InlineNotification
          kind="error"
          title="Assinatura Pendente de Regularização"
          subtitle="O período de tolerância de 3 dias expirou. Conclua o pagamento para reativar o acesso total à plataforma e continuar recebendo alertas matinais."
          lowContrast
        />
        <div style={{ marginTop: "0.5rem" }}>
          <a
            href="/faturamento"
            style={{
              fontWeight: 600,
              color: "inherit",
              textDecoration: "underline",
              cursor: "pointer",
            }}
          >
            Reativar Assinatura Agora &rarr;
          </a>
        </div>
      </div>
    );
  }

  return null;
}

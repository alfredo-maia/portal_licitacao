"use client";

import { useEffect, useState } from "react";

export interface TenantSubscriptionState {
  ok: boolean;
  plano: string;
  billingStatus: string;
  isReadOnly: boolean;
  isBlocked: boolean;
  inGracePeriod: boolean;
  diasRestantesTrial: number;
  diasRestantesCarencia: number;
  mensagemStatus: string;
  maxCnpjs: number;
  maxUsers: number;
}

let cachedState: TenantSubscriptionState | null = null;
const listeners = new Set<(state: TenantSubscriptionState | null) => void>();

function notify(state: TenantSubscriptionState | null) {
  cachedState = state;
  listeners.forEach((l) => l(state));
}

export function useTenantSubscription() {
  const [subscription, setSubscription] = useState<TenantSubscriptionState | null>(
    cachedState,
  );
  const [loading, setLoading] = useState(!cachedState);

  useEffect(() => {
    const listener = (newState: TenantSubscriptionState | null) => {
      setSubscription(newState);
      setLoading(false);
    };
    listeners.add(listener);

    if (!cachedState) {
      fetch("/api/planos/status")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && data.ok) {
            notify(data);
          } else {
            notify(null);
          }
        })
        .catch(() => notify(null));
    } else {
      setSubscription(cachedState);
      setLoading(false);
    }

    return () => {
      listeners.delete(listener);
    };
  }, []);

  return {
    subscription,
    loading,
    isReadOnly: subscription?.isReadOnly ?? false,
    isBlocked: subscription?.isBlocked ?? false,
    inGracePeriod: subscription?.inGracePeriod ?? false,
    plano: subscription?.plano ?? "BASICO",
  };
}


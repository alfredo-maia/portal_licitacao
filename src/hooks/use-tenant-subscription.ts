"use client";

import { useCallback, useEffect, useState } from "react";
import { isSubscriptionLocked } from "@/lib/subscription-guard";

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

export async function refreshTenantSubscription(): Promise<TenantSubscriptionState | null> {
  if (typeof fetch !== "function") return cachedState;
  try {
    const res = await fetch("/api/planos/status");
    const data = res.ok ? await res.json() : null;
    if (data && data.ok) {
      notify(data);
      return data;
    }
    notify(null);
    return null;
  } catch {
    notify(null);
    return null;
  }
}

export function useTenantSubscription() {
  const [subscription, setSubscription] =
    useState<TenantSubscriptionState | null>(cachedState);
  const [loading, setLoading] = useState(!cachedState);

  const refresh = useCallback(() => {
    setLoading(true);
    return refreshTenantSubscription();
  }, []);

  useEffect(() => {
    const listener = (newState: TenantSubscriptionState | null) => {
      setSubscription(newState);
      setLoading(false);
    };
    listeners.add(listener);

    if (!cachedState) {
      void refreshTenantSubscription();
    } else {
      setSubscription(cachedState);
      setLoading(false);
    }

    const handleInvalidate = () => {
      cachedState = null;
      void refreshTenantSubscription();
    };

    if (typeof window !== "undefined") {
      window.addEventListener("tenant-changed", handleInvalidate);
      window.addEventListener("subscription-updated", handleInvalidate);
    }

    return () => {
      listeners.delete(listener);
      if (typeof window !== "undefined") {
        window.removeEventListener("tenant-changed", handleInvalidate);
        window.removeEventListener("subscription-updated", handleInvalidate);
      }
    };
  }, []);

  const isLocked = isSubscriptionLocked(subscription);

  return {
    subscription,
    loading,
    refresh,
    isLocked,
    isReadOnly: subscription?.isReadOnly ?? false,
    isBlocked: subscription?.isBlocked ?? false,
    inGracePeriod: subscription?.inGracePeriod ?? false,
    plano: subscription?.plano ?? "BASICO",
  };
}

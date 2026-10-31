"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { InlineLoading } from "@carbon/react";

interface TenantInfo {
  id: string;
  cnpj: string;
  razaoSocial: string;
  nomeFantasia?: string | null;
  plano?: string;
}

function formatCnpj(cnpj: string): string {
  const digits = (cnpj || "").replace(/\D/g, "");
  if (digits.length !== 14) return cnpj;
  return digits.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    "$1.$2.$3/$4-$5",
  );
}

export function TenantHeaderSelector() {
  const router = useRouter();
  const [tenants, setTenants] = useState<TenantInfo[]>([]);
  const [activeTenantId, setActiveTenantId] = useState<string>("");
  const [isSwitching, setIsSwitching] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  const carregarTenants = useCallback(async () => {
    try {
      const res = await fetch("/api/configuracoes/tenants");
      if (res.ok) {
        const data = await res.json();
        if (data.ok && Array.isArray(data.tenants)) {
          setTenants(data.tenants);
          if (data.activeTenantId) {
            setActiveTenantId(data.activeTenantId);
          } else if (data.tenants.length > 0) {
            setActiveTenantId(data.tenants[0].id);
          }
        }
      }
    } catch {
      // Ignora erro de rede em background
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregarTenants();

    const handleTenantChanged = (e: any) => {
      const newTenantId = e?.detail?.tenantId;
      if (newTenantId) {
        setActiveTenantId(newTenantId);
        carregarTenants();
      }
    };

    window.addEventListener("tenant-changed", handleTenantChanged);
    return () => {
      window.removeEventListener("tenant-changed", handleTenantChanged);
    };
  }, [carregarTenants]);

  const handleSelectChange = async (targetTenantId: string) => {
    if (!targetTenantId || targetTenantId === activeTenantId) return;

    setIsSwitching(true);
    try {
      const res = await fetch("/api/configuracoes/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: targetTenantId }),
      });

      if (res.ok) {
        setActiveTenantId(targetTenantId);
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("tenant-changed", {
              detail: { tenantId: targetTenantId },
            }),
          );
        }
        router.refresh();
      }
    } catch (err) {
      console.error("[TenantHeaderSelector] Falha ao alternar empresa:", err);
    } finally {
      setIsSwitching(false);
    }
  };

  const activeTenant = tenants.find((t) => t.id === activeTenantId) || tenants[0];

  if (loading && tenants.length === 0) {
    return null;
  }

  if (!activeTenant) {
    return null;
  }

  const formattedCnpj = formatCnpj(activeTenant.cnpj);

  return (
    <div
      data-testid="tenant-header-container"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        marginLeft: "1rem",
        padding: "0.25rem 0.625rem",
        borderRadius: "4px",
        backgroundColor: "var(--cds-layer-02, rgba(255, 255, 255, 0.08))",
        fontSize: "0.8125rem",
        color: "var(--cds-text-primary, #ffffff)",
      }}
    >
      {isSwitching ? (
        <InlineLoading
          status="active"
          description="Alternando empresa..."
          style={{ width: "auto" }}
        />
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
            <span data-testid="tenant-header-current-name" style={{ fontWeight: 600 }}>{activeTenant.razaoSocial}</span>
            <span
              data-testid="tenant-header-current-cnpj"
              style={{
                fontSize: "0.75rem",
                color: "var(--cds-text-secondary, #c6c6c6)",
                fontFamily: "monospace",
              }}
            >
              {formattedCnpj}
            </span>
          </div>

          {tenants.length > 1 && (
            <select
              data-testid="tenant-header-select"
              aria-label="Selecionar Empresa Ativa"
              value={activeTenantId}
              onChange={(e) => handleSelectChange(e.target.value)}
              style={{
                marginLeft: "0.5rem",
                padding: "0.25rem 0.5rem",
                borderRadius: "3px",
                border: "1px solid var(--cds-border-subtle, #525252)",
                backgroundColor: "var(--cds-field, #262626)",
                color: "var(--cds-text-primary, #ffffff)",
                fontSize: "0.75rem",
                cursor: "pointer",
              }}
            >
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.razaoSocial} ({formatCnpj(t.cnpj)})
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  );
}

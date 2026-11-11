"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { InlineNotification } from "@carbon/react";

interface AvisoAtivo {
  id: string;
  titulo: string;
  mensagem: string;
  severidade: "INFO" | "ATENCAO" | "CRITICA" | string;
  formato: string;
  linkDestino?: string | null;
}

const STORAGE_KEY = "portal_avisos_dispensados";

function lerDispensados(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as string[];
  } catch {
    return [];
  }
}

function linkInternoSeguro(link?: string | null): string | null {
  if (!link) return null;
  const trimmed = link.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  return trimmed;
}

/**
 * Banner de topo com avisos em massa disparados pelo Portal ADM (`SystemBroadcast`).
 * Exibe apenas avisos com formato BANNER_TOPO/AMBOS ainda não dispensados pelo usuário.
 */
export function SystemBroadcastBanner() {
  const [avisos, setAvisos] = useState<AvisoAtivo[]>([]);

  useEffect(() => {
    if (typeof fetch !== "function") return;
    let ativo = true;
    Promise.resolve(fetch("/api/avisos/ativos"))
      .then((res) => (res && res.ok ? res.json() : null))
      .then((data: { avisos?: AvisoAtivo[] } | null) => {
        if (!ativo || !data?.avisos) return;
        const dispensados = lerDispensados();
        setAvisos(
          data.avisos.filter(
            (a) =>
              (a.formato === "BANNER_TOPO" || a.formato === "AMBOS") &&
              !dispensados.includes(a.id),
          ),
        );
      })
      .catch(() => undefined);
    return () => {
      ativo = false;
    };
  }, []);

  if (avisos.length === 0) return null;

  const dispensar = (id: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...lerDispensados(), id]));
    } catch {
      // storage indisponível
    }
    setAvisos((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <div data-testid="system-broadcast-banner" style={{ marginBottom: "1rem" }}>
      {avisos.map((a) => {
        const hrefSeguro = linkInternoSeguro(a.linkDestino);
        return (
          <div key={a.id} style={{ marginBottom: "0.5rem" }}>
            <InlineNotification
              kind={a.severidade === "CRITICA" ? "error" : a.severidade === "ATENCAO" ? "warning" : "info"}
              title={`${a.titulo}:`}
              subtitle={a.mensagem}
              onCloseButtonClick={() => dispensar(a.id)}
              lowContrast
            />
            {hrefSeguro ? (
              <div style={{ marginTop: "0.25rem", paddingLeft: "0.75rem" }}>
                <Link
                  href={hrefSeguro}
                  style={{
                    color: "var(--cds-link-primary, #0f62fe)",
                    fontWeight: 600,
                    fontSize: "0.875rem",
                    textDecoration: "underline",
                  }}
                >
                  Ver detalhes
                </Link>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

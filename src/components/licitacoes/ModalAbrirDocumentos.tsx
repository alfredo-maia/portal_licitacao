"use client";

import React, { useState, useEffect } from "react";
import {
  Modal,
  InlineLoading,
  Tag,
  Button,
  InlineNotification,
} from "@carbon/react";
import { Document, Download, Renew, CheckmarkFilled } from "@carbon/icons-react";
import type { R2ItemDocumento, SincronizarDocumentosPncpResponse } from "@/server/schemas/storage-r2.schema";

interface ModalAbrirDocumentosProps {
  open: boolean;
  onClose: () => void;
  licitacaoId: string;
  numeroEdital?: string;
}

export function ModalAbrirDocumentos({
  open,
  onClose,
  licitacaoId,
  numeroEdital = "Edital",
}: ModalAbrirDocumentosProps) {
  const [loading, setLoading] = useState(false);
  const [dados, setDados] = useState<SincronizarDocumentosPncpResponse | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (open && licitacaoId) {
      carregarDocumentos();
    } else {
      setDados(null);
      setErro(null);
    }
  }, [open, licitacaoId]);

  async function carregarDocumentos() {
    setLoading(true);
    setErro(null);

    try {
      const res = await fetch(`/api/licitacoes/${licitacaoId}/documentos`);
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.mensagem || "Falha ao sincronizar documentos com o PNCP.");
      }

      setDados(json);
    } catch (err: any) {
      setErro(err?.message || "Erro de conexão ao carregar documentos.");
    } finally {
      setLoading(false);
    }
  }

  function formatarBytes(bytes: number): string {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  return (
    <Modal
      open={open}
      onRequestClose={onClose}
      modalHeading={`Documentos do Edital — ${numeroEdital}`}
      modalLabel="Cloudflare R2 & Lazy Caching PNCP"
      passiveModal
      size="md"
      aria-label="Modal de Documentos do Edital"
    >
      <div style={{ marginTop: "1rem" }}>
        {loading && (
          <div style={{ padding: "1.5rem 0", display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <InlineLoading description="Sincronizando editais e anexos com o PNCP e Cloudflare R2..." status="active" />
          </div>
        )}

        {erro && (
          <InlineNotification
            kind="error"
            title="Erro na sincronização"
            subtitle={erro}
            lowContrast
            style={{ marginBottom: "1rem" }}
          />
        )}

        {dados && !loading && (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1rem",
                padding: "0.75rem 1rem",
                background: "var(--cds-layer-01, #f4f4f4)",
                borderRadius: "4px",
              }}
            >
              <div>
                <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>Status do Storage: </span>
                <Tag type={dados.origem === "R2_CACHE" ? "green" : "teal"} size="sm">
                  {dados.origem === "R2_CACHE" ? "Cache R2 Válido (TTL 24h)" : "Sincronizado via PNCP"}
                </Tag>
              </div>
              <Button
                kind="ghost"
                size="sm"
                renderIcon={Renew}
                onClick={carregarDocumentos}
                hasIconOnly
                iconDescription="Recarregar e sincronizar novamente"
              />
            </div>

            {dados.arquivos.length === 0 ? (
              <p style={{ color: "var(--cds-text-secondary, #6f6f6f)", padding: "1rem 0" }}>
                Nenhum anexo em PDF disponível para este certame no momento.
              </p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {dados.arquivos.map((arq: R2ItemDocumento) => (
                  <li
                    key={arq.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0.875rem 1rem",
                      borderBottom: "1px solid var(--cds-border-subtle, #e0e0e0)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <Document size={20} style={{ color: "var(--cds-link-primary, #0f62fe)" }} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: "0.875rem" }}>{arq.nome}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary, #6f6f6f)" }}>
                          {formatarBytes(arq.tamanho)} • {arq.mimeType}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <Tag type={arq.statusCache === "CACHE_HIT" ? "green" : "blue"} size="sm">
                        {arq.statusCache === "CACHE_HIT" ? "Cache Hit" : "Sincronizado"}
                      </Tag>
                      <Button
                        kind="primary"
                        size="sm"
                        renderIcon={Download}
                        href={arq.urlDownload}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Abrir PDF
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

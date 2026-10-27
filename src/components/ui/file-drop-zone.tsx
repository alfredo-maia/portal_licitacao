"use client";

import React, { useState, useRef } from "react";
import { Upload, Document, CheckmarkFilled, Close } from "@carbon/icons-react";

export interface FileDropZoneProps {
  id: string;
  accept?: string;
  selectedFile?: File | null;
  selectedFileName?: string;
  onFileSelect: (file: File) => void;
  onFileClear?: () => void;
  label?: string;
  helperText?: string;
  dataTestId?: string;
  style?: React.CSSProperties;
}

export function FileDropZone({
  id,
  accept,
  selectedFile,
  selectedFileName,
  onFileSelect,
  onFileClear,
  label,
  helperText = "Formatos aceitos: PDF, DOC, DOCX, PNG, JPG ou JSON (até 50MB)",
  dataTestId,
  style,
}: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const fileName = selectedFile?.name || selectedFileName;
  const fileSize = selectedFile?.size
    ? selectedFile.size > 1024 * 1024
      ? `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB`
      : `${(selectedFile.size / 1024).toFixed(1)} KB`
    : null;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      onFileSelect(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      onFileSelect(file);
    }
  };

  return (
    <div style={{ marginBottom: "1.25rem", ...style }}>
      {label && (
        <label
          htmlFor={id}
          style={{
            display: "block",
            fontSize: "0.875rem",
            fontWeight: 500,
            color: "var(--cds-text-primary, #161616)",
            marginBottom: "0.5rem",
          }}
        >
          {label}
        </label>
      )}

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        data-testid={dataTestId || `dropzone-${id}`}
        style={{
          border: isDragging
            ? "2px dashed var(--cds-interactive, #0f62fe)"
            : fileName
            ? "2px solid var(--cds-support-success, #24a148)"
            : "2px dashed var(--cds-border-subtle, #8d8d8d)",
          borderRadius: "4px",
          padding: "1.5rem 1rem",
          textAlign: "center",
          backgroundColor: isDragging
            ? "rgba(15, 98, 254, 0.08)"
            : fileName
            ? "rgba(36, 161, 72, 0.05)"
            : "var(--cds-layer-01, #f4f4f4)",
          cursor: "pointer",
          transition: "all 0.2s ease-in-out",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.5rem",
        }}
      >
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={accept}
          style={{ display: "none" }}
          onChange={handleFileChange}
        />

        {fileName ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--cds-support-success, #24a148)" }}>
              <CheckmarkFilled size={20} />
              <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>Arquivo pronto para envio</span>
            </div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.35rem 0.75rem",
                backgroundColor: "var(--cds-layer-02, #ffffff)",
                borderRadius: "3px",
                border: "1px solid var(--cds-border-subtle, #e0e0e0)",
                maxWidth: "100%",
              }}
            >
              <Document size={16} />
              <span
                style={{
                  fontSize: "0.875rem",
                  color: "var(--cds-text-primary, #161616)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: "280px",
                }}
              >
                {fileName}
              </span>
              {fileSize && (
                <span style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary, #6f6f6f)" }}>
                  ({fileSize})
                </span>
              )}
              {onFileClear && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (inputRef.current) inputRef.current.value = "";
                    onFileClear();
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "2px",
                    display: "flex",
                    alignItems: "center",
                    color: "var(--cds-text-secondary, #6f6f6f)",
                  }}
                  title="Remover arquivo"
                >
                  <Close size={14} />
                </button>
              )}
            </div>
            <span style={{ fontSize: "0.75rem", color: "var(--cds-text-helper, #6f6f6f)", marginTop: "0.25rem" }}>
              Clique ou arraste outro arquivo para substituir
            </span>
          </>
        ) : (
          <>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "50%",
                backgroundColor: isDragging ? "var(--cds-interactive, #0f62fe)" : "var(--cds-layer-02, #e0e0e0)",
                color: isDragging ? "#ffffff" : "var(--cds-text-primary, #161616)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "0.25rem",
              }}
            >
              <Upload size={20} />
            </div>
            <span style={{ fontSize: "0.95rem", fontWeight: 500, color: "var(--cds-text-primary, #161616)" }}>
              {isDragging ? "Solte o arquivo aqui..." : "Arraste e solte o arquivo aqui"}
            </span>
            <span style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary, #6f6f6f)" }}>
              ou <strong style={{ color: "var(--cds-interactive, #0f62fe)", textDecoration: "underline" }}>clique para navegar</strong> no computador
            </span>
            {helperText && (
              <span style={{ fontSize: "0.75rem", color: "var(--cds-text-helper, #8d8d8d)", marginTop: "0.25rem" }}>
                {helperText}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

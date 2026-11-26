"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { DismissibleTag } from "@carbon/react";
import { ChevronDown, ChevronUp } from "@carbon/icons-react";

export interface MembroEquipeOption {
  id: string;
  name: string;
  role: string;
}

export interface MembrosEquipeMultiSelectProps {
  id?: string;
  titleText?: string;
  placeholder?: string;
  items: MembroEquipeOption[];
  selectedIds: string[];
  onChange: (selectedIds: string[]) => void;
  disabled?: boolean;
}

function normalizarBusca(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Seletor múltiplo Carbon que exibe tags individuais com o nome de cada membro
 * selecionado e botão de remoção (`X`) diretamente dentro do campo, em vez do
 * contador numérico padrão (`1 ×`) do `FilterableMultiSelect`.
 */
export function MembrosEquipeMultiSelect({
  id = "multiselect-membros-equipe",
  titleText = "Membros Atribuídos da Equipe",
  placeholder = "Selecione os membros...",
  items,
  selectedIds,
  onChange,
  disabled = false,
}: MembrosEquipeMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setBusca("");
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const selectedItems = useMemo(() => {
    const porId = new Map(items.map((item) => [item.id, item]));
    return selectedIds
      .map((memberId) => porId.get(memberId))
      .filter((item): item is MembroEquipeOption => Boolean(item));
  }, [items, selectedIds]);

  const filteredItems = useMemo(() => {
    const termo = normalizarBusca(busca.trim());
    if (!termo) return items;
    return items.filter((item) =>
      normalizarBusca(`${item.name} ${item.role}`).includes(termo),
    );
  }, [items, busca]);

  const toggleMember = (memberId: string) => {
    if (disabled) return;
    if (selectedIds.includes(memberId)) {
      onChange(selectedIds.filter((currId) => currId !== memberId));
    } else {
      onChange([...selectedIds, memberId]);
    }
  };

  const removeMember = (memberId: string) => {
    if (disabled) return;
    onChange(selectedIds.filter((currId) => currId !== memberId));
  };

  const inputId = `${id}-input`;

  return (
    <div
      ref={wrapperRef}
      id={id}
      data-testid="membros-equipe-multiselect"
      className="cds--multi-select__wrapper cds--list-box__wrapper"
      style={{ position: "relative", width: "100%" }}
    >
      {titleText ? (
        <label htmlFor={inputId} className="cds--label">
          {titleText}
        </label>
      ) : null}

      <div
        className={`cds--multi-select cds--list-box${isOpen ? " cds--list-box--expanded" : ""}`}
        onClick={() => {
          if (disabled) return;
          setIsOpen(true);
          inputRef.current?.focus();
        }}
        style={{
          position: "relative",
          backgroundColor: "var(--cds-field, #262626)",
          borderBottom: "1px solid var(--cds-border-strong-01, #8d8d8d)",
          outline: isOpen ? "2px solid var(--cds-focus, #0f62fe)" : "none",
          outlineOffset: "-2px",
          minHeight: "2.5rem",
          height: "auto",
          maxHeight: "none",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.375rem",
            padding: "0.25rem 2.5rem 0.25rem 0.625rem",
            minHeight: "2.5rem",
            width: "100%",
          }}
        >
          {selectedItems.map((membro) => (
            <DismissibleTag
              key={membro.id}
              type="high-contrast"
              size="sm"
              text={membro.name}
              title={`Remover ${membro.name}`}
              dismissTooltipLabel={`Remover ${membro.name}`}
              disabled={disabled}
              onClose={() => removeMember(membro.id)}
              style={{ margin: 0, maxWidth: "none" }}
            />
          ))}

          <input
            ref={inputRef}
            id={inputId}
            type="text"
            role="combobox"
            aria-expanded={isOpen}
            aria-controls={`${id}-menu`}
            aria-autocomplete="list"
            disabled={disabled}
            value={busca}
            placeholder={selectedItems.length === 0 ? placeholder : "Adicionar membro..."}
            onFocus={() => {
              if (!disabled) setIsOpen(true);
            }}
            onChange={(e) => {
              setBusca(e.target.value);
              if (!isOpen) setIsOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setIsOpen(false);
                setBusca("");
              } else if (e.key === "Backspace" && !busca && selectedItems.length > 0) {
                removeMember(selectedItems[selectedItems.length - 1].id);
              }
            }}
            style={{
              flex: "1 1 110px",
              minWidth: "90px",
              border: "none",
              outline: "none",
              background: "transparent",
              color: "var(--cds-text-primary, #f4f4f4)",
              fontSize: "0.875rem",
              lineHeight: "1.25rem",
              padding: "0.25rem 0",
            }}
          />

          <button
            type="button"
            aria-label={isOpen ? "Fechar menu de membros" : "Abrir menu de membros"}
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
              if (disabled) return;
              setIsOpen((prev) => !prev);
            }}
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              height: "100%",
              width: "2.5rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: "none",
              color: "var(--cds-icon-primary, #f4f4f4)",
              cursor: disabled ? "not-allowed" : "pointer",
            }}
          >
            {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>

        {isOpen && (
          <ul
            id={`${id}-menu`}
            role="listbox"
            aria-multiselectable="true"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              zIndex: 6000,
              margin: 0,
              padding: 0,
              listStyle: "none",
              backgroundColor: "var(--cds-layer-01, #262626)",
              border: "1px solid var(--cds-border-subtle-01, #393939)",
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.35)",
              maxHeight: "15rem",
              overflowY: "auto",
            }}
          >
            {filteredItems.length === 0 ? (
              <li
                style={{
                  padding: "0.625rem 1rem",
                  fontSize: "0.875rem",
                  color: "var(--cds-text-secondary, #c6c6c6)",
                }}
              >
                Nenhum membro encontrado.
              </li>
            ) : (
              filteredItems.map((item) => {
                const isSelected = selectedIds.includes(item.id);
                const labelText = `${item.name} (${item.role})`;
                return (
                  <li
                    key={item.id}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => toggleMember(item.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      padding: "0.625rem 1rem",
                      cursor: "pointer",
                      fontSize: "0.875rem",
                      color: "var(--cds-text-primary, #f4f4f4)",
                      backgroundColor: isSelected
                        ? "var(--cds-layer-selected-01, #393939)"
                        : "transparent",
                      borderBottom: "1px solid var(--cds-border-subtle-01, #393939)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      tabIndex={-1}
                      aria-hidden="true"
                      style={{
                        width: "1rem",
                        height: "1rem",
                        accentColor: "var(--cds-interactive, #0f62fe)",
                        cursor: "pointer",
                      }}
                    />
                    <span>{labelText}</span>
                  </li>
                );
              })
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

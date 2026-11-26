import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MembrosEquipeMultiSelect } from "@/components/oportunidades/MembrosEquipeMultiSelect";

const MEMBROS = [
  { id: "usr-1", name: "Vitor Silva", role: "DIRETORIA" },
  { id: "usr-2", name: "Maria Oliveira", role: "ANALISTA_COMERCIAL" },
  { id: "usr-3", name: "Carlos Souza", role: "OPERADOR" },
];

describe("Issue #58 — MembrosEquipeMultiSelect (nome com X em vez de contador 1 x)", () => {
  it("exibe tags com o nome de cada membro selecionado e botão X individual, sem badge numérico '1'", () => {
    const onChange = vi.fn();

    render(
      <MembrosEquipeMultiSelect
        id="multiselect-membros-equipe"
        titleText="Membros Atribuídos da Equipe"
        placeholder="Selecione os membros..."
        items={MEMBROS}
        selectedIds={["usr-1", "usr-2"]}
        onChange={onChange}
      />,
    );

    const container = screen.getByTestId("membros-equipe-multiselect");
    expect(container).toHaveTextContent("Vitor Silva");
    expect(container).toHaveTextContent("Maria Oliveira");
    expect(container.querySelector(".cds--list-box__selection")).toBeNull();

    const removerVitor = screen.getByRole("button", { name: /Remover Vitor Silva/i });
    fireEvent.click(removerVitor);
    expect(onChange).toHaveBeenCalledWith(["usr-2"]);
  });

  it("permite abrir o dropdown, filtrar por nome e selecionar/desmarcar membros via checkbox", () => {
    const onChange = vi.fn();

    render(
      <MembrosEquipeMultiSelect
        id="multiselect-membros-equipe"
        titleText="Membros Atribuídos da Equipe"
        placeholder="Selecione os membros..."
        items={MEMBROS}
        selectedIds={["usr-1"]}
        onChange={onChange}
      />,
    );

    const input = screen.getByPlaceholderText("Adicionar membro...");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Carlos" } });

    expect(screen.getByText("Carlos Souza (OPERADOR)")).toBeInTheDocument();
    expect(screen.queryByText("Maria Oliveira (ANALISTA_COMERCIAL)")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("option", { name: /Carlos Souza/i }));
    expect(onChange).toHaveBeenCalledWith(["usr-1", "usr-3"]);
  });
});

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { TenantHeaderSelector } from "@/components/shell/tenant-header-selector";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

describe("TenantHeaderSelector (Header Multi-Empresa)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { reload: vi.fn() },
    });
  });

  it("deve carregar e exibir a Razão Social e o CNPJ da empresa ativa no Header", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        tenants: [
          { id: "tenant_1", razaoSocial: "ALIMENTOS LTDA", cnpj: "12345678000190" },
          { id: "tenant_2", razaoSocial: "REMEDIOS PHARMA", cnpj: "98765432000109" },
        ],
        activeTenantId: "tenant_1",
      }),
    });

    render(<TenantHeaderSelector />);

    await waitFor(() => {
      expect(screen.getByTestId("tenant-header-current-name")).toHaveTextContent("ALIMENTOS LTDA");
      expect(screen.getByTestId("tenant-header-current-cnpj")).toHaveTextContent("12.345.678/0001-90");
    });
  });

  it("deve alternar a empresa ativa via POST e disparar indicador de loading e evento de sincronização", async () => {
    global.fetch = vi.fn().mockImplementation((url: string, options?: any) => {
      if (options?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, activeTenantId: "tenant_2" }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          ok: true,
          tenants: [
            { id: "tenant_1", razaoSocial: "ALIMENTOS LTDA", cnpj: "12345678000190" },
            { id: "tenant_2", razaoSocial: "REMEDIOS PHARMA", cnpj: "98765432000109" },
          ],
          activeTenantId: "tenant_1",
        }),
      });
    });
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    render(<TenantHeaderSelector />);

    await waitFor(() => {
      expect(screen.getByTestId("tenant-header-current-name")).toHaveTextContent("ALIMENTOS LTDA");
    });

    const select = screen.getByTestId("tenant-header-select");
    fireEvent.change(select, { target: { value: "tenant_2" } });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/configuracoes/tenants",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ tenantId: "tenant_2" }),
        }),
      );
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: "tenant-changed" }),
      );
    });
  });

  it("ao alternar empresa, deve salvar dados no sessionStorage e invocar window.location.reload() com loading na tela", async () => {
    const reloadMock = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { reload: reloadMock },
    });

    global.fetch = vi.fn().mockImplementation((url: string, options?: any) => {
      if (options?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, activeTenantId: "tenant_2" }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          ok: true,
          tenants: [
            { id: "tenant_1", razaoSocial: "ALIMENTOS LTDA", cnpj: "12345678000190" },
            { id: "tenant_2", razaoSocial: "REMEDIOS PHARMA", cnpj: "98765432000109" },
          ],
          activeTenantId: "tenant_1",
        }),
      });
    });

    render(<TenantHeaderSelector />);

    await waitFor(() => {
      expect(screen.getByTestId("tenant-header-current-name")).toHaveTextContent("ALIMENTOS LTDA");
    });

    const select = screen.getByTestId("tenant-header-select");
    fireEvent.change(select, { target: { value: "tenant_2" } });

    await waitFor(() => {
      expect(reloadMock).toHaveBeenCalled();
      const stored = sessionStorage.getItem("portal_licitacao_tenant_switched");
      expect(stored).toBeTruthy();
      expect(JSON.parse(stored || "{}").razaoSocial).toBe("REMEDIOS PHARMA");
    });
  });

  it("ao montar com flag no sessionStorage, deve exibir ToastNotification de sucesso e limpar sessionStorage", async () => {
    sessionStorage.setItem(
      "portal_licitacao_tenant_switched",
      JSON.stringify({
        razaoSocial: "REMEDIOS PHARMA",
        cnpj: "98.765.432/0001-09",
      }),
    );

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        tenants: [
          { id: "tenant_2", razaoSocial: "REMEDIOS PHARMA", cnpj: "98765432000109" },
        ],
        activeTenantId: "tenant_2",
      }),
    });

    render(<TenantHeaderSelector />);

    await waitFor(() => {
      const toast = screen.getByTestId("tenant-switch-toast");
      expect(toast).toBeInTheDocument();
      expect(toast).toHaveTextContent("Troca de empresa efetuada com sucesso");
      expect(toast).toHaveTextContent("REMEDIOS PHARMA");
      expect(toast).toHaveTextContent("98.765.432/0001-09");
    });

    expect(sessionStorage.getItem("portal_licitacao_tenant_switched")).toBeNull();
  });
});

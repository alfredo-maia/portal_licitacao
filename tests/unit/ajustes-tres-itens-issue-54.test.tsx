import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AdminLoginPage from "@/app/admin/login/page";
import { Cliente360Screen } from "@/components/admin/screens/Cliente360Screen";
import { middleware } from "@/middleware";
import { NextRequest } from "next/server";

const pushMock = vi.fn();
const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    refresh: refreshMock,
  }),
  usePathname: () => "/admin/login",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next-auth/react", () => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));

describe("Issue #54 — Três Ajustes: Redirecionamento /admin, Login ADM em Etapas e Aba Segmentos/UFs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Ajuste 1: Redirecionamento automático ao acessar /admin sem estar logado", () => {
    it("deve redirecionar requisição não autenticada em /admin para /admin/login", async () => {
      const req = new NextRequest("https://staging.aponta.cloud/admin", {
        headers: new Headers(),
      });
      const response = await middleware(req);
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toContain("/admin/login");
    });
  });

  describe("Ajuste 2: Tela de login do Portal ADM no mesmo padrão da tela dos clientes", () => {
    it("deve iniciar exibindo apenas o campo de e-mail e botão Avançar", () => {
      render(<AdminLoginPage />);
      expect(screen.getByLabelText(/E-mail administrativo|E-mail corporativo/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Avançar|Continuar/i })).toBeInTheDocument();
      expect(screen.queryByLabelText(/^Senha$/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Receber código por E-mail/i)).not.toBeInTheDocument();
    });

    it("ao informar e-mail e avançar, deve apresentar as opções de entrar (Senha, E-mail ou WhatsApp)", async () => {
      render(<AdminLoginPage />);
      const emailInput = screen.getByLabelText(/E-mail administrativo|E-mail corporativo/i);
      fireEvent.change(emailInput, { target: { value: "admin@portal.com.br" } });
      fireEvent.click(screen.getByRole("button", { name: /Avançar|Continuar/i }));

      expect(await screen.findByRole("button", { name: /Entrar com Senha/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Receber código por E-mail/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Receber código no WhatsApp/i })).toBeInTheDocument();
    });

    it("ao escolher 'Entrar com Senha', deve exibir campo de senha com botão de voltar", async () => {
      render(<AdminLoginPage />);
      const emailInput = screen.getByLabelText(/E-mail administrativo|E-mail corporativo/i);
      fireEvent.change(emailInput, { target: { value: "admin@portal.com.br" } });
      fireEvent.click(screen.getByRole("button", { name: /Avançar|Continuar/i }));

      const btnSenha = await screen.findByRole("button", { name: /Entrar com Senha/i });
      fireEvent.click(btnSenha);

      expect(await screen.findByLabelText(/^Senha$/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Voltar/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Entrar no Portal ADM|Entrar/i })).toBeInTheDocument();
    });
  });

  describe("Ajuste 3: Aba de Segmentos & Regiões (UFs) em /admin/clientes/[id]", () => {
    it("deve incluir uma aba de Segmentos/UFs entre Usuários e Licitações & Cofre exibindo UFs e Segmentos de cada empresa", async () => {
      const dossieMock = {
        ok: true,
        tenantId: "tnt_mock_1",
        tenant: {
          id: "tnt_mock_1",
          cnpj: "12.345.678/0001-90",
          razaoSocial: "Empresa Alpha Ltda",
          nomeFantasia: "Alpha Tech",
          plano: "PRO",
          billingStatus: "ATIVO",
          ativo: true,
        },
        titular: {
          id: "usr_titular_1",
          name: "Gestor Titular",
          email: "titular@alpha.com.br",
        },
        empresas: [
          {
            id: "tnt_mock_1",
            cnpj: "12.345.678/0001-90",
            razaoSocial: "Empresa Alpha Ltda",
            nomeFantasia: "Alpha Tech",
            uf: "SP",
            cidade: "São Paulo",
            plano: "PRO",
            billingStatus: "ATIVO",
            ativo: true,
            brasilInteiro: false,
            ufs: ["SP", "RJ", "MG"],
            segmentos: ["ALIMENTOS", "TECNOLOGIA_DA_INFORMACAO"],
            subsegmentos: ["hortifrutigranjeiros", "equipamentos_de_ti"],
          },
          {
            id: "tnt_mock_2",
            cnpj: "98.765.432/0001-09",
            razaoSocial: "Filial Beta Ltda",
            nomeFantasia: "Beta Distribuidora",
            uf: "PR",
            cidade: "Curitiba",
            plano: "PRO",
            billingStatus: "ATIVO",
            ativo: true,
            brasilInteiro: true,
            ufs: [],
            segmentos: ["SAUDE_MEDICAMENTOS"],
            subsegmentos: ["medicamentos_basicos"],
          },
        ],
        usuarios: [],
        patrimonioOperacional: {
          licitacoes: [],
          kanbanPorColuna: {},
          documentos: { total: 0, vencidos: 0, bytes: 0, lista: [] },
          portais: 0,
          impugnacoes: 0,
          precosSalvos: 0,
        },
        porEmpresa: {},
        cotasPorEmpresa: {},
        cotas: { maxCnpjs: 2, maxUsers: 2, storageBaseMb: 2000, storageExtraQuotaMb: 0 },
        disputas: [],
      };

      vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(JSON.stringify(dossieMock), { status: 200 }),
      );

      render(<Cliente360Screen tenantId="tnt_mock_1" />);
      await screen.findAllByText(/Alpha Tech/i);

      // Aba deve existir entre Usuários e Licitações & Cofre
      const tabSegmentos = await screen.findByRole("tab", { name: /Segmentos & Regiões|Segmentos & UFs|Escopo & Segmentos/i });
      expect(tabSegmentos).toBeInTheDocument();

      fireEvent.click(tabSegmentos);

      // Deve exibir UFs das empresas
      expect(await screen.findByText("SP")).toBeInTheDocument();
      expect(screen.getByText("RJ")).toBeInTheDocument();
      expect(screen.getByText(/Todo o Brasil/i)).toBeInTheDocument();

      // Deve exibir Segmentos Macro e Subsegmentos
      expect(screen.getByText(/ALIMENTOS|Alimentos/i)).toBeInTheDocument();
      expect(screen.getByText(/TECNOLOGIA|Tecnologia/i)).toBeInTheDocument();
      expect(screen.getByText(/hortifrutigranjeiros/i)).toBeInTheDocument();
    });
  });
});

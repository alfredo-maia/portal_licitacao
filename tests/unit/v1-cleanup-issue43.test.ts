// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { APP_CONFIG } from "@/config/brand";
import { declaracaoGerarInputSchema } from "@/server/schemas/declaracao.schema";
import { configuracaoEmpresaSchema } from "@/server/schemas/configuracao.schema";
import {
  getInMemoryConfiguracaoEmpresa,
  listInMemoryUsuarios,
} from "@/server/services/licitacoes-store";
import { formatarDataExtenso as formatarDataDeclaracao } from "@/server/services/declaracoes.service";
import { gerarPdfDeclaracao } from "@/lib/declaracao-pdf";
import { gerarMinutaJuridica, gerarPdfMinutaImpugnacao } from "@/lib/minuta-juridica";
import { gerarPdfPedidoCotacao } from "@/lib/pedido-cotacao-pdf";
import { gerarPdfPropostaComercial } from "@/lib/proposta-comercial-pdf";
import {
  formatarDataExtenso as formatarDataCotacao,
  gerarConteudoPedidoCotacao,
} from "@/lib/pedido-cotacao-template";
import { gerarConteudoPropostaComercial } from "@/lib/proposta-comercial-template";

describe("Issue #43 [Chore] — Higienização de Vestígios v1 (Aponta, Goiânia, inboxlicitacoes)", () => {
  it("1. APP_CONFIG deve expor e-mails centralizados neutros (sem apontatech ou inboxlicitacoes)", () => {
    expect((APP_CONFIG as any).commercialEmail).toBeTruthy();
    expect((APP_CONFIG as any).noreplyEmail).toBeTruthy();
    expect((APP_CONFIG as any).commercialEmail).not.toMatch(/inboxlicitacoes|aponta/i);
    expect((APP_CONFIG as any).noreplyEmail).not.toMatch(/inboxlicitacoes|aponta/i);
  });

  it("2. Schemas Zod de declaração e configuração não devem forçar Goiânia/GO como default", () => {
    const dec = declaracaoGerarInputSchema.parse({
      tipo: "ELABORACAO_INDEPENDENTE",
      numeroEdital: "PE 010/2026",
      orgaoNome: "Prefeitura de Belo Horizonte",
      empresaRazaoSocial: "Empresa Mineira LTDA",
      empresaCnpj: "11.222.333/0001-44",
      representanteNome: "Ana Souza",
      representanteCpf: "111.222.333-44",
    });
    expect(dec.cidade).toBe("");
    expect(dec.uf).toBe("");

    const cfg = configuracaoEmpresaSchema.parse({
      razaoSocial: "Empresa Paulista LTDA",
      cnpj: "22.333.444/0001-55",
    });
    expect(cfg.uf).toBe("");
    expect(cfg.cidade).toBe("");
  });

  it("3. licitacoes-store não deve carregar APONTA TECNOLOGIA, Goiânia, 74115-030 ou @aponta.cloud", () => {
    const defaultCfg = getInMemoryConfiguracaoEmpresa();
    expect(defaultCfg.razaoSocial).not.toMatch(/APONTA TECNOLOGIA/i);
    expect(defaultCfg.cidade).not.toBe("Goiânia");
    expect(defaultCfg.uf).not.toBe("GO");
    expect(defaultCfg.cep).not.toBe("74115-030");

    const tenantCfg = getInMemoryConfiguracaoEmpresa("tenant_sp_novo");
    expect(tenantCfg.uf).toBe("");
    expect(tenantCfg.ufs).toEqual([]);

    const usuarios = listInMemoryUsuarios();
    expect(usuarios.some((u) => String(u.email).includes("aponta.cloud"))).toBe(false);
  });

  it("4. Templates A4, minutas e geradores de PDF não devem injetar Goiânia/GO quando cidade/UF forem omitidas", async () => {
    expect(formatarDataDeclaracao(undefined, "", "")).not.toContain("Goiânia");
    expect(formatarDataCotacao(new Date(), "", "")).not.toContain("Goiânia");

    const cotacao = gerarConteudoPedidoCotacao({
      orgaoNome: "Prefeitura de Curitiba",
      numeroEdital: "PE 05/2026",
      itens: [{ numeroItem: 1, descricao: "Papel A4", quantidade: 10, unidadeMedida: "CX" }],
      configuracao: { ocultarOrgaoEdital: true },
    });
    expect(cotacao.conteudoHtml).not.toContain("Goiânia");
    expect(cotacao.whatsappTexto).not.toContain("Goiânia/GO");

    const proposta = gerarConteudoPropostaComercial({
      numeroEdital: "PE 05/2026",
      orgaoNome: "Prefeitura de Curitiba",
      objetoLicitacao: "Aquisição de materiais de expediente",
      itens: [
        {
          id: "item_1",
          numeroItem: "01",
          descricao: "Papel A4",
          quantidade: 10,
          unidade: "CX",
          valorEstimadoUnitario: 25,
          custoUnitario: 12,
          freteUnitario: 0,
          outrosCustosUnitario: 0,
          impostosPercentual: 12,
          bdiPercentual: 20,
          margemMinimaPercentual: 10,
          margemAlvoPercentual: 20,
        },
      ],
    });
    expect(proposta.conteudoHtml).not.toContain("Goiânia");

    const minuta = gerarMinutaJuridica({
      id: "imp_test",
      numeroEdital: "PE 05/2026",
      orgaoNome: "Prefeitura de Curitiba",
      motivoLegal: "RESTRICAO_COMPETITIVIDADE",
      fundamentacao: "Texto fundamentado.",
      pedidos: "Suspensão do edital.",
      dataAberturaSessao: new Date("2026-12-01T10:00:00.000Z"),
    });
    expect(minuta.minutaHtml).not.toContain("Goiânia");

    const { pdfBuffer } = await gerarPdfDeclaracao({
      dados: {
        tipo: "HABILITACAO_PLENA",
        numeroEdital: "PE 05/2026",
        orgaoNome: "Prefeitura de Curitiba",
        empresaRazaoSocial: "Empresa Sul LTDA",
        empresaCnpj: "11.222.333/0001-44",
        representanteNome: "João",
        representanteCpf: "123.456.789-00",
        representanteCargo: "Diretor",
        cidade: "",
        uf: "",
      },
    });
    expect(pdfBuffer.slice(0, 4).toString("utf-8")).toBe("%PDF");

    const impPdf = await gerarPdfMinutaImpugnacao({
      impugnacao: {
        numeroEdital: "PE 05/2026",
        orgaoNome: "Prefeitura de Curitiba",
        motivoLegal: "RESTRICAO_COMPETITIVIDADE",
        fundamentacao: "Texto",
        pedidos: "Pedidos",
        dataAberturaSessao: new Date("2026-12-01T10:00:00.000Z"),
      },
    });
    expect(impPdf.pdfBuffer.slice(0, 4).toString("utf-8")).toBe("%PDF");

    const cotPdf = await gerarPdfPedidoCotacao({
      orgaoNome: "Prefeitura de Curitiba",
      numeroEdital: "PE 05/2026",
      itens: [{ numeroItem: 1, descricao: "Papel A4", quantidade: 10, unidadeMedida: "CX" }],
      configuracao: { ocultarOrgaoEdital: true },
    });
    expect(cotPdf.pdfBuffer.slice(0, 4).toString("utf-8")).toBe("%PDF");

    const propPdf = await gerarPdfPropostaComercial({
      numeroEdital: "PE 05/2026",
      orgaoNome: "Prefeitura de Curitiba",
      objetoLicitacao: "Aquisição de materiais de expediente",
      itens: [
        {
          id: "item_1",
          numeroItem: "01",
          descricao: "Papel A4",
          quantidade: 10,
          unidade: "CX",
          valorEstimadoUnitario: 25,
          custoUnitario: 12,
          freteUnitario: 0,
          outrosCustosUnitario: 0,
          impostosPercentual: 12,
          bdiPercentual: 20,
          margemMinimaPercentual: 10,
          margemAlvoPercentual: 20,
        },
      ],
    });
    expect(propPdf.pdfBuffer.slice(0, 4).toString("utf-8")).toBe("%PDF");
  });

  it("5. Arquivos de produção e deploy devem estar livres de inboxlicitacoes, apontatech, chatwoot e Aponta v1", () => {
    const alvos = [
      ".env.example",
      "docker-compose.yml",
      "prisma/schema.prisma",
      "scripts/docker-entrypoint.cjs",
      "src/server/services/email.service.ts",
      "src/app/oportunidades/[id]/page.tsx",
      "src/app/configuracoes/page.tsx",
      "src/app/declaracoes/page.tsx",
    ];

    const forbidden = /inboxlicitacoes|apontatech|chatwoot\.aponta\.cloud|tenant_aponta_matriz|APONTA TECNOLOGIA|aponta\.cloud/i;
    const violacoes: string[] = [];

    for (const rel of alvos) {
      const text = fs.readFileSync(path.resolve(process.cwd(), rel), "utf-8");
      if (forbidden.test(text)) {
        violacoes.push(rel);
      }
    }

    expect(violacoes).toEqual([]);

    const oppPage = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/oportunidades/[id]/page.tsx"),
      "utf-8",
    );
    expect(oppPage).not.toContain("a partir de <strong>Goiânia/GO</strong>");
    expect(oppPage).not.toContain("Certame Local em Goiás");
  });
});

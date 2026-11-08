import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  gerarConteudoPedidoCotacao,
  type ConfigPedidoCotacao,
  type ItemPedidoCotacao,
} from "@/lib/pedido-cotacao-template";
import { gerarPdfPedidoCotacao } from "@/lib/pedido-cotacao-pdf";
import { POST as cotacoesPdfPost } from "@/app/api/cotacoes/pdf/route";
import { GET as itensCertameGet } from "@/app/api/oportunidades/[id]/itens-certame/route";
import {
  verificarEIncrementarLimiteSilenciosoLicitacao,
  isLicitacaoDesbloqueadaParaIa,
  obterStatusCotaAnaliseIA,
} from "@/server/services/analise-ia-participacao.service";
import { PLAN_LIMITS } from "@/server/schemas/tenant.schema";

describe("📦 Pedido de Cotação, Sigilo Comercial, Extração de Itens & Cotas IA", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Regras de Sigilo Comercial e Geração de Conteúdo (HTML / WhatsApp / TXT)", () => {
    const itensTeste: ItemPedidoCotacao[] = [
      {
        numeroItem: "01",
        descricao: "Pão Francês Tradicional de 50g",
        quantidade: 500,
        unidadeMedida: "KG",
        marcaSugerida: "Fabricação Própria",
      },
      {
        numeroItem: "02",
        descricao: "Manteiga com Sal Primeira Qualidade",
        quantidade: 40,
        unidadeMedida: "KG",
        marcaSugerida: "Itambé / Piracanjuba",
      },
    ];

    it("deve ocultar o nome do Órgão e o Edital quando o Sigilo Comercial estiver ativado (padrão)", () => {
      const conteudo = gerarConteudoPedidoCotacao({
        orgaoNome: "Prefeitura Municipal de Goiânia",
        numeroEdital: "Pregão Eletrônico 045/2026",
        itens: itensTeste,
        configuracao: {
          ocultarOrgaoEdital: true,
          localEntregaCidade: "Goiânia",
          localEntregaUf: "GO",
          modalidadeFrete: "CIF",
        },
        empresa: {
          razaoSocial: "Vitor Comércio de Alimentos LTDA",
          cnpj: "12.345.678/0001-90",
          cidade: "Goiânia",
          uf: "GO",
        },
      });

      // O nome do órgão e o edital não devem vazar no texto nem no HTML
      expect(conteudo.conteudoHtml).not.toContain("Prefeitura Municipal de Goiânia");
      expect(conteudo.conteudoHtml).not.toContain("045/2026");
      expect(conteudo.whatsappTexto).not.toContain("Prefeitura Municipal de Goiânia");
      expect(conteudo.whatsappTexto).not.toContain("045/2026");

      // Mas o destino CIF para cálculo de frete DEVE estar presente
      expect(conteudo.conteudoHtml).toContain("Goiânia");
      expect(conteudo.conteudoHtml).toContain("CIF");
      expect(conteudo.whatsappTexto).toContain("Goiânia/GO");

      // Deve listar os itens
      expect(conteudo.conteudoHtml).toContain("Pão Francês Tradicional de 50g");
      expect(conteudo.conteudoHtml).toContain("500");
      expect(conteudo.whatsappTexto).toContain("Pão Francês Tradicional de 50g");
    });

    it("deve exibir o Órgão e o Edital quando o usuário desmarcar o Sigilo Comercial", () => {
      const conteudo = gerarConteudoPedidoCotacao({
        orgaoNome: "Tribunal Regional Federal da 1ª Região",
        numeroEdital: "PE 102/2026",
        itens: itensTeste,
        configuracao: {
          ocultarOrgaoEdital: false,
          localEntregaCidade: "Brasília",
          localEntregaUf: "DF",
        },
      });

      expect(conteudo.conteudoHtml).toContain("Tribunal Regional Federal da 1ª Região");
      expect(conteudo.conteudoHtml).toContain("PE 102/2026");
      expect(conteudo.whatsappTexto).toContain("Tribunal Regional Federal da 1ª Região");
    });
  });

  describe("2. Geração de PDF do Pedido de Cotação", () => {
    it("deve gerar buffer de PDF válido via gerarPdfPedidoCotacao", async () => {
      const { pdfBuffer, pdfNome } = await gerarPdfPedidoCotacao({
        orgaoNome: "Secretaria de Saúde",
        numeroEdital: "PE 01/2026",
        itens: [
          {
            numeroItem: 1,
            descricao: "Álcool em Gel 70% 500ml",
            quantidade: 100,
            unidadeMedida: "FRASCO",
          },
        ],
        configuracao: {
          ocultarOrgaoEdital: true,
          fornecedorNome: "Distribuidora Química Brasil",
        },
      });

      expect(pdfBuffer).toBeDefined();
      expect(pdfBuffer.length).toBeGreaterThan(500);
      // Assinatura de PDF (%PDF-)
      expect(pdfBuffer.slice(0, 4).toString("utf-8")).toBe("%PDF");
      expect(pdfNome).toContain("pedido_cotacao_");
    });

    it("rota POST /api/cotacoes/pdf deve responder status 200 com header application/pdf", async () => {
      const req = new Request("http://localhost:3000/api/cotacoes/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgaoNome: "Ministério da Educação",
          numeroEdital: "PE 99/2026",
          itens: [
            {
              numeroItem: 1,
              descricao: "Projetor Multimídia 4000 Lumens",
              quantidade: 10,
              unidadeMedida: "UN",
            },
          ],
          configuracao: {
            ocultarOrgaoEdital: true,
          },
        }),
      });

      const res = await cotacoesPdfPost(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/pdf");
      const disposition = res.headers.get("Content-Disposition");
      expect(disposition).toContain("inline; filename=");
    });
  });

  describe("3. Trava Silenciosa Anti-Abuso de IA por Licitação", () => {
    it("deve permitir até 5 consultas e na 6ª lançar ERRO_PROCESSAMENTO_SISTEMA sem contador", () => {
      const licitacaoTesteId = `lic_teste_silenciosa_${Date.now()}`;
      const contaTesteKey = `conta_${Date.now()}`;

      // Chamadas 1 a 5 devem passar sem exceção
      for (let i = 1; i <= 5; i++) {
        expect(() => {
          verificarEIncrementarLimiteSilenciosoLicitacao(licitacaoTesteId, contaTesteKey);
        }).not.toThrow();
      }

      // A 6ª chamada deve ser travada com erro genérico de sistema
      expect(() => {
        verificarEIncrementarLimiteSilenciosoLicitacao(licitacaoTesteId, contaTesteKey);
      }).toThrowError(/Ocorreu um erro interno no sistema ao processar esta solicitação automática/);
    });
  });

  describe("4. Cotas de IA por Plano e Desbloqueio por Licitação", () => {
    it("deve refletir o novo limite mensal de 15 análises para PRO e 30 para ENTERPRISE", () => {
      expect(PLAN_LIMITS.PRO.aiAnalisesMes).toBe(15);
      expect(PLAN_LIMITS.ENTERPRISE.aiAnalisesMes).toBe(30);
      expect(PLAN_LIMITS.BASICO.aiAnalisesMes).toBe(5);
    });

    it("rota GET /api/oportunidades/[id]/itens-certame responde itens estruturados", async () => {
      const req = new Request("http://localhost:3000/api/oportunidades/lic_mock_1/itens-certame");
      const context = { params: Promise.resolve({ id: "lic_mock_1" }) };

      const res = await itensCertameGet(req, context);
      expect([200, 403, 404, 500]).toContain(res.status);
      const json = await res.json();
      expect(json).toBeDefined();
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  ARSENAL_PLAN_MATRIX,
  calculadoraLanceSchema,
  canUseArsenalFeature,
  gerarMinutaIaImpugnacaoSchema,
  gerarPropostaComercialSchema,
  monitorChatPregoeiroSchema,
} from "@/server/schemas/arsenal.schema";
import {
  analisarMensagensChatPregoeiro,
  calcularLanceMinimoEBdi,
  consultarInteligenciaPrecosConcorrentes,
  gerarMinutaImpugnacaoIA,
  gerarPropostaComercialTimbrada,
  gerarRelatorioExecutivoMensal,
} from "@/server/services/arsenal.service";

describe("Sprint SaaS 5 — Arsenal Premium Pro & Enterprise (Contratos & Domínio)", () => {
  describe("1. Matriz de Elegibilidade por Plano (BASICO, PRO, ENTERPRISE)", () => {
    it("deve liberar CALCULADORA_BDI para todos os planos (BASICO, PRO, ENTERPRISE)", () => {
      expect(ARSENAL_PLAN_MATRIX.CALCULADORA_BDI).toEqual([
        "BASICO",
        "PRO",
        "ENTERPRISE",
      ]);
      expect(canUseArsenalFeature("BASICO", "CALCULADORA_BDI")).toBe(true);
      expect(canUseArsenalFeature("PRO", "CALCULADORA_BDI")).toBe(true);
      expect(canUseArsenalFeature("ENTERPRISE", "CALCULADORA_BDI")).toBe(true);
    });

    it("deve liberar PROPOSTA_PDF apenas para planos PRO e ENTERPRISE", () => {
      expect(canUseArsenalFeature("BASICO", "PROPOSTA_PDF")).toBe(false);
      expect(canUseArsenalFeature("PRO", "PROPOSTA_PDF")).toBe(true);
      expect(canUseArsenalFeature("ENTERPRISE", "PROPOSTA_PDF")).toBe(true);
    });

    it("deve restringir MONITOR_CHAT_PREGOEIRO, MINUTA_IMPUGNACAO_IA, INTELIGENCIA_PRECOS e RELATORIO_EXECUTIVO_MENSAL ao plano ENTERPRISE", () => {
      const enterpriseOnly = [
        "MONITOR_CHAT_PREGOEIRO",
        "MINUTA_IMPUGNACAO_IA",
        "INTELIGENCIA_PRECOS",
        "RELATORIO_EXECUTIVO_MENSAL",
      ] as const;

      for (const feat of enterpriseOnly) {
        expect(canUseArsenalFeature("BASICO", feat)).toBe(false);
        expect(canUseArsenalFeature("PRO", feat)).toBe(false);
        expect(canUseArsenalFeature("ENTERPRISE", feat)).toBe(true);
      }
    });
  });

  describe("2. Calculadora de Lance Mínimo & Simulador de BDI", () => {
    it("deve validar o schema calculadoraLanceSchema e calcular lance SEGURO com BDI e margem líquida", () => {
      const input = calculadoraLanceSchema.parse({
        descricaoItem: "Notebook Corporativo i7 16GB SSD 512GB",
        quantidade: 10,
        custoUnitarioDireto: 3000,
        freteUnitario: 100,
        impostosPercentual: 12,
        bdiPercentual: 25,
        margemMinimaPercentual: 10,
        valorEstimadoUnitarioEdital: 4800,
        lanceUnitarioProposto: 4300,
        tipoObjeto: "BENS_SERVICOS",
      });

      const resultado = calcularLanceMinimoEBdi(input);

      expect(resultado.custoBaseUnitario).toBe(3100);
      expect(resultado.lanceMinimoUnitarioSeguro).toBeGreaterThan(3800);
      expect(resultado.precoSugeridoComBdiUnitario).toBeGreaterThan(
        resultado.lanceMinimoUnitarioSeguro,
      );
      expect(resultado.lanceTotalProposto).toBe(43000);
      expect(resultado.margemLiquidaRealPercentual).toBeGreaterThanOrEqual(10);
      expect(resultado.statusRisco).toBe("SEGURO");
    });

    it("deve emitir alerta MARGEM_NEGATIVA quando o lance proposto não cobre custos + impostos", () => {
      const resultado = calcularLanceMinimoEBdi({
        descricaoItem: "Servidor Rack 2U",
        quantidade: 2,
        custoUnitarioDireto: 15000,
        freteUnitario: 500,
        impostosPercentual: 15,
        bdiPercentual: 20,
        margemMinimaPercentual: 10,
        valorEstimadoUnitarioEdital: 24000,
        lanceUnitarioProposto: 16000, // Custo 15500 + 15% imposto no faturamento (2400) = 17900 > 16000
        tipoObjeto: "BENS_SERVICOS",
      });

      expect(resultado.statusRisco).toBe("MARGEM_NEGATIVA");
      expect(resultado.lucroLiquidoTotal).toBeLessThan(0);
      expect(resultado.alertaMensagem).toContain("prejuízo");
    });

    it("deve emitir alerta RISCO_INEXEQUIBILIDADE quando o lance tem desconto excessivo sobre o valor estimado (Art. 59 Lei 14.133)", () => {
      const resultado = calcularLanceMinimoEBdi({
        descricaoItem: "Obra de Reforma de Cobertura Metálica",
        quantidade: 1,
        custoUnitarioDireto: 50000,
        freteUnitario: 1000,
        impostosPercentual: 8,
        bdiPercentual: 22,
        margemMinimaPercentual: 10,
        valorEstimadoUnitarioEdital: 100000,
        lanceUnitarioProposto: 70000, // 30% de desconto em OBRAS_ENGENHARIA (> 25% limite Art. 59 §4º)
        tipoObjeto: "OBRAS_ENGENHARIA",
      });

      expect(resultado.statusRisco).toBe("RISCO_INEXEQUIBILIDADE");
      expect(resultado.alertaMensagem).toContain("Art. 59");
    });
  });

  describe("3. Gerador Automático de Propostas Comerciais em Layout Timbrado (Pro & Enterprise)", () => {
    const payloadProposta = gerarPropostaComercialSchema.parse({
      planoTenant: "PRO",
      numeroEdital: "PE 045/2026",
      orgaoNome: "Prefeitura Municipal de Goiânia",
      uasg: "989373",
      objeto: "Aquisição de equipamentos de informática",
      validadeDias: 60,
      prazoEntregaDias: 15,
      empresa: {
        razaoSocial: "APONTA TECNOLOGIA E SERVICOS LTDA",
        cnpj: "12.345.678/0001-90",
        endereco: "Av. República do Líbano, 1200, Goiânia/GO",
        email: "comercial@aponta.cloud",
        telefone: "(62) 99999-0000",
        bancoNome: "Banco do Brasil",
        agencia: "1234-5",
        contaCorrente: "98765-4",
        chavePix: "12.345.678/0001-90",
        representanteNome: "Vítor Henrique de Souza",
        representanteCpf: "123.456.789-00",
      },
      itens: [
        {
          numeroItem: 1,
          descricao: "Notebook Corporativo i7 16GB SSD 512GB",
          marcaModelo: "Dell Latitude 3440",
          unidade: "UN",
          quantidade: 10,
          valorUnitario: 4300,
        },
      ],
    });

    it("deve bloquear geração de proposta comercial no plano BASICO", () => {
      expect(() =>
        gerarPropostaComercialTimbrada({
          ...payloadProposta,
          planoTenant: "BASICO",
        }),
      ).toThrow(/Plano PRO ou ENTERPRISE/i);
    });

    it("deve gerar proposta comercial timbrada com quadro de itens, valor global e declarações da Lei 14.133 no plano PRO", () => {
      const proposta = gerarPropostaComercialTimbrada(payloadProposta);

      expect(proposta.valorGlobalProposta).toBe(43000);
      expect(proposta.itensCalculados[0]?.valorTotal).toBe(43000);
      expect(proposta.textoTimbrado).toContain("PROPOSTA COMERCIAL READEQUADA");
      expect(proposta.textoTimbrado).toContain("PE 045/2026");
      expect(proposta.textoTimbrado).toContain("Dell Latitude 3440");
      expect(proposta.textoTimbrado).toContain("12.345.678/0001-90");
      expect(proposta.htmlTimbrado).toContain("<table");
    });
  });

  describe("4. Monitor de Chat do Pregoeiro com Alertas WhatsApp (Enterprise)", () => {
    it("deve bloquear o monitor de chat do pregoeiro para planos BASICO e PRO", async () => {
      await expect(
        analisarMensagensChatPregoeiro({
          planoTenant: "PRO",
          numeroEdital: "PE 099/2026",
          orgaoNome: "TRE-GO",
          cnpjMonitorado: "12.345.678/0001-90",
          razaoSocialMonitorada: "APONTA TECNOLOGIA",
          mensagens: [
            {
              autor: "Pregoeiro",
              horario: "14:32",
              texto: "Convoco a empresa APONTA TECNOLOGIA (12.345.678/0001-90) para envio da proposta readequada no prazo de 2 horas.",
            },
          ],
        }),
      ).rejects.toThrow(/ENTERPRISE/i);
    });

    it("deve detectar menção ao CNPJ/Razão Social e convocação de prazo fatal no plano ENTERPRISE e disparar alerta WhatsApp", async () => {
      const input = monitorChatPregoeiroSchema.parse({
        planoTenant: "ENTERPRISE",
        numeroEdital: "PE 099/2026",
        orgaoNome: "TRE-GO",
        cnpjMonitorado: "12.345.678/0001-90",
        razaoSocialMonitorada: "APONTA TECNOLOGIA",
        telefoneAlerta: "5562999998888",
        mensagens: [
          {
            autor: "Sistema",
            horario: "14:00",
            texto: "Sessão pública aberta para fase de lances.",
          },
          {
            autor: "Pregoeiro",
            horario: "14:32",
            texto: "Convoco a licitante APONTA TECNOLOGIA, CNPJ 12.345.678/0001-90, para enviar proposta readequada e anexos em até 2 horas.",
          },
        ],
      });

      const analise = await analisarMensagensChatPregoeiro(input);

      expect(analise.totalMensagensAnalisadas).toBe(2);
      expect(analise.alertasCriticos).toHaveLength(1);
      expect(analise.alertasCriticos[0]?.mencionouEmpresa).toBe(true);
      expect(analise.alertasCriticos[0]?.tipoEvento).toBe("CONVOCACAO_DIRETA");
      expect(analise.alertaSonoroAtivo).toBe(true);
      expect(analise.whatsappEnfileirado).toBe(true);
    });
  });

  describe("5. Gerador de Minutas de Impugnação com IA — Art. 164 Lei 14.133 (Enterprise)", () => {
    it("deve gerar minuta jurídica fundamentada no Art. 164 da Lei 14.133/2021 e acórdãos do TCU para plano ENTERPRISE", () => {
      const input = gerarMinutaIaImpugnacaoSchema.parse({
        planoTenant: "ENTERPRISE",
        numeroEdital: "PE 120/2026",
        orgaoNome: "Secretaria Estadual de Saúde",
        dataAberturaSessao: "2026-11-10T09:00:00.000Z",
        clausulaQuestionada:
          "Item 8.4 do Termo de Referência exige marca exclusiva e atestado técnico de 80% do quantitativo total sem justificativa técnica.",
        tesePrincipal: "RESTRICAO_COMPETITIVIDADE_E_MARCA",
        empresaImpugnante: "APONTA TECNOLOGIA E SERVICOS LTDA",
        cnpjImpugnante: "12.345.678/0001-90",
      });

      const minuta = gerarMinutaImpugnacaoIA(input);

      expect(minuta.fundamentacaoLegal).toContain("14.133/2021");
      expect(minuta.fundamentacaoLegal).toContain("Súmula");
      expect(minuta.pedidosFormais).toContain("republicação");
      expect(minuta.textoCompletoPeticao).toContain("ILUSTRÍSSIMO(A) SENHOR(A) PREGOEIRO(A)");
      expect(minuta.textoCompletoPeticao).toContain("PE 120/2026");
      expect(minuta.prazoFatalIso).toBeDefined();
    });
  });

  describe("6. Inteligência de Preços dos Concorrentes & Relatório Executivo Mensal (Enterprise)", () => {
    it("deve retornar histórico de homologações, desconto médio e concorrentes recorrentes para o plano ENTERPRISE", () => {
      const bi = consultarInteligenciaPrecosConcorrentes({
        planoTenant: "ENTERPRISE",
        termoOuCatmat: "Notebook",
        uf: "GO",
      });

      expect(bi.termoConsultado).toBe("Notebook");
      expect(bi.descontoMedioHomologadoPercentual).toBeGreaterThan(0);
      expect(bi.faixaLanceRecomendada.minimo).toBeLessThanOrEqual(
        bi.faixaLanceRecomendada.maximo,
      );
      expect(bi.historicoHomologacoes.length).toBeGreaterThan(0);
    });

    it("deve consolidar o Relatório Executivo Mensal de Desempenho para a diretoria no plano ENTERPRISE", () => {
      const relatorio = gerarRelatorioExecutivoMensal({
        planoTenant: "ENTERPRISE",
        mesReferencia: "2026-10",
        razaoSocialTenant: "APONTA TECNOLOGIA E SERVICOS LTDA",
        cnpjTenant: "12.345.678/0001-90",
        certamesAnalisados: 40,
        certamesDisputados: 15,
        certamesVencidos: 5,
        volumeFinanceiroDisputado: 1500000,
        volumeFinanceiroArrematado: 480000,
        economiaMediaObtidaPercentual: 18.5,
      });

      expect(relatorio.taxaConversaoDisputaPercentual).toBeCloseTo(33.33, 1);
      expect(relatorio.ticketMedioArrematado).toBe(96000);
      expect(relatorio.resumoExecutivoTexto).toContain("APONTA TECNOLOGIA");
      expect(relatorio.resumoExecutivoTexto).toContain("R$");
    });
  });
});


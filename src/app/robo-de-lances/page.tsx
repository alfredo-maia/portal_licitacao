"use client";

import React, { useState } from "react";
import {
  Button,
  Column,
  Grid,
  InlineNotification,
  Select,
  SelectItem,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Tag,
  TextArea,
  TextInput,
  Tile,
} from "@carbon/react";
import {
  Analytics,
  Calculator,
  Chat,
  Copy,
  DocumentPdf,
  Printer,
  Scale,
  Send,
} from "@carbon/icons-react";
import { ModulePageShell } from "@/components/shell/module-page-shell";
import {
  calcularLanceMinimoEBdi,
  canUseArsenalFeature,
  consultarInteligenciaPrecosConcorrentes,
  gerarMinutaImpugnacaoIA,
  gerarPropostaComercialTimbrada,
  gerarRelatorioExecutivoMensal,
  type CalculadoraLanceOutput,
  type InteligenciaPrecosOutput,
  type MinutaImpugnacaoIaOutput,
  type MonitorChatPregoeiroOutput,
  type PlanoAssinaturaArsenal,
  type PropostaComercialGerada,
  type RelatorioExecutivoMensalOutput,
  type TeseImpugnacaoIa,
  type TipoObjetoLicitacao,
} from "@/server/schemas/arsenal.schema";

function formatCurrency(val: number): string {
  return val.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function RoboDeLancesPage() {
  const [planoAtivo, setPlanoAtivo] =
    useState<PlanoAssinaturaArsenal>("ENTERPRISE");
  const [feedback, setFeedback] = useState<{
    kind: "success" | "warning" | "error";
    text: string;
  } | null>(null);

  // 1. Estado Calculadora de Lance & BDI
  const [calcDescricao, setCalcDescricao] = useState(
    "Notebook Corporativo i7 16GB SSD 512GB",
  );
  const [calcQtd, setCalcQtd] = useState("10");
  const [calcCustoDireto, setCalcCustoDireto] = useState("3000");
  const [calcFrete, setCalcFrete] = useState("100");
  const [calcImpostos, setCalcImpostos] = useState("12");
  const [calcBdi, setCalcBdi] = useState("25");
  const [calcMargemMinima, setCalcMargemMinima] = useState("10");
  const [calcEstimadoEdital, setCalcEstimadoEdital] = useState("4800");
  const [calcLanceProposto, setCalcLanceProposto] = useState("4300");
  const [calcTipoObjeto, setCalcTipoObjeto] =
    useState<TipoObjetoLicitacao>("BENS_SERVICOS");
  const [resultadoCalc, setResultadoCalc] =
    useState<CalculadoraLanceOutput | null>(() =>
      calcularLanceMinimoEBdi({
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
      }),
    );

  // 2. Estado Proposta Comercial Timbrada
  const [propEdital, setPropEdital] = useState("PE 045/2026");
  const [propOrgao, setPropOrgao] = useState(
    "Prefeitura Municipal de Goiânia",
  );
  const [propObjeto, setPropObjeto] = useState(
    "Aquisição de equipamentos de processamento de dados",
  );
  const [propMarca, setPropMarca] = useState("Dell Latitude 3440");
  const [propValidade, setPropValidade] = useState("60");
  const [propPrazoEntrega, setPropPrazoEntrega] = useState("15");
  const [propostaGerada, setPropostaGerada] =
    useState<PropostaComercialGerada | null>(null);

  // 3. Estado Monitor de Chat do Pregoeiro
  const [chatEdital, setChatEdital] = useState("PE 099/2026");
  const [chatOrgao, setChatOrgao] = useState("TRE-GO");
  const [chatCnpj, setChatCnpj] = useState("12.345.678/0001-90");
  const [chatRazao, setChatRazao] = useState("APONTA TECNOLOGIA");
  const [chatTelefone, setChatTelefone] = useState("(62) 99999-8888");
  const [chatMensagemTeste, setChatMensagemTeste] = useState(
    "Convoco a licitante APONTA TECNOLOGIA, CNPJ 12.345.678/0001-90, para enviar proposta readequada e anexos em até 2 horas.",
  );
  const [resultadoChat, setResultadoChat] =
    useState<MonitorChatPregoeiroOutput | null>(null);

  // 4. Estado Gerador de Impugnação com IA
  const [impEdital, setImpEdital] = useState("PE 120/2026");
  const [impOrgao, setImpOrgao] = useState("Secretaria Estadual de Saúde");
  const [impDataAbertura, setImpDataAbertura] = useState("2026-11-12");
  const [impTese, setImpTese] = useState<TeseImpugnacaoIa>(
    "RESTRICAO_COMPETITIVIDADE_E_MARCA",
  );
  const [impClausula, setImpClausula] = useState(
    "Item 8.4 do Termo de Referência exige marca exclusiva e atestado técnico de 80% do quantitativo total sem justificativa técnica no ETP.",
  );
  const [minutaIaGerada, setMinutaIaGerada] =
    useState<MinutaImpugnacaoIaOutput | null>(null);

  // 5. Estado BI de Preços & Relatório Executivo
  const [biTermo, setBiTermo] = useState("Notebook Corporativo");
  const [biUf, setBiUf] = useState("GO");
  const [resultadoBi, setResultadoBi] =
    useState<InteligenciaPrecosOutput | null>(null);
  const [relatorioMensal, setRelatorioMensal] =
    useState<RelatorioExecutivoMensalOutput | null>(null);

  const handleCalcularLance = () => {
    try {
      const res = calcularLanceMinimoEBdi({
        descricaoItem: calcDescricao,
        quantidade: Number(calcQtd) || 1,
        custoUnitarioDireto: Number(calcCustoDireto) || 0,
        freteUnitario: Number(calcFrete) || 0,
        impostosPercentual: Number(calcImpostos) || 0,
        bdiPercentual: Number(calcBdi) || 0,
        margemMinimaPercentual: Number(calcMargemMinima) || 0,
        valorEstimadoUnitarioEdital: Number(calcEstimadoEdital) || 1,
        lanceUnitarioProposto: Number(calcLanceProposto) || 1,
        tipoObjeto: calcTipoObjeto,
      });
      setResultadoCalc(res);
      setFeedback(null);
    } catch (err: unknown) {
      setFeedback({
        kind: "error",
        text:
          err instanceof Error
            ? err.message
            : "Verifique os valores numéricos informados.",
      });
    }
  };

  const handleGerarProposta = () => {
    try {
      const prop = gerarPropostaComercialTimbrada({
        planoTenant: planoAtivo,
        numeroEdital: propEdital,
        orgaoNome: propOrgao,
        objeto: propObjeto,
        validadeDias: Number(propValidade) || 60,
        prazoEntregaDias: Number(propPrazoEntrega) || 15,
        empresa: {
          razaoSocial: "APONTA TECNOLOGIA E SERVICOS LTDA",
          cnpj: "12.345.678/0001-90",
          endereco: "Av. República do Líbano, 1200, Setor Oeste, Goiânia/GO",
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
            descricao: calcDescricao,
            marcaModelo: propMarca,
            unidade: "UN",
            quantidade: Number(calcQtd) || 1,
            valorUnitario: Number(calcLanceProposto) || 1000,
          },
        ],
      });
      setPropostaGerada(prop);
      setFeedback({
        kind: "success",
        text: "Proposta Comercial Timbrada gerada com sucesso!",
      });
    } catch (err: unknown) {
      setFeedback({
        kind: "warning",
        text:
          err instanceof Error
            ? err.message
            : "Erro ao gerar proposta comercial.",
      });
    }
  };

  const handleMonitorarChat = async () => {
    try {
      const res = await fetch("/api/arsenal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "MONITORAR_CHAT_PREGOEIRO",
          payload: {
            planoTenant: planoAtivo,
            numeroEdital: chatEdital,
            orgaoNome: chatOrgao,
            cnpjMonitorado: chatCnpj,
            razaoSocialMonitorada: chatRazao,
            telefoneAlerta: chatTelefone,
            mensagens: [
              {
                autor: "Pregoeiro",
                horario: new Date().toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
                texto: chatMensagemTeste,
              },
            ],
          },
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setResultadoChat(data.resultado);
        setFeedback({
          kind: "success",
          text: "Mensagem analisada! Alerta sonoro e fila WhatsApp acionados.",
        });
      } else {
        setFeedback({ kind: "warning", text: data.error });
      }
    } catch {
      setFeedback({
        kind: "error",
        text: "Falha ao processar monitoramento do chat.",
      });
    }
  };

  const handleGerarMinutaIA = () => {
    try {
      const res = gerarMinutaImpugnacaoIA({
        planoTenant: planoAtivo,
        numeroEdital: impEdital,
        orgaoNome: impOrgao,
        dataAberturaSessao: new Date(impDataAbertura).toISOString(),
        clausulaQuestionada: impClausula,
        tesePrincipal: impTese,
        empresaImpugnante: "APONTA TECNOLOGIA E SERVICOS LTDA",
        cnpjImpugnante: "12.345.678/0001-90",
      });
      setMinutaIaGerada(res);
      setFeedback({
        kind: "success",
        text: "Minuta de Impugnação fundamentada na Lei 14.133/2021 e Súmulas do TCU gerada!",
      });
    } catch (err: unknown) {
      setFeedback({
        kind: "warning",
        text: err instanceof Error ? err.message : "Erro ao gerar minuta.",
      });
    }
  };

  const handleConsultarBiERelatorio = () => {
    try {
      const bi = consultarInteligenciaPrecosConcorrentes({
        planoTenant: planoAtivo,
        termoOuCatmat: biTermo,
        uf: biUf,
      });
      const rel = gerarRelatorioExecutivoMensal({
        planoTenant: planoAtivo,
        mesReferencia: "2026-10",
        razaoSocialTenant: "APONTA TECNOLOGIA E SERVICOS LTDA",
        cnpjTenant: "12.345.678/0001-90",
        certamesAnalisados: 42,
        certamesDisputados: 16,
        certamesVencidos: 6,
        volumeFinanceiroDisputado: 1850000,
        volumeFinanceiroArrematado: 612000,
        economiaMediaObtidaPercentual: 17.4,
      });
      setResultadoBi(bi);
      setRelatorioMensal(rel);
      setFeedback({
        kind: "success",
        text: "Histórico de homologações e Relatório Executivo Mensal atualizados!",
      });
    } catch (err: unknown) {
      setFeedback({
        kind: "warning",
        text: err instanceof Error ? err.message : "Erro ao consultar BI.",
      });
    }
  };

  return (
    <ModulePageShell
      routePath="/robo-de-lances"
      subtitle="Arsenal de Disputa Pro & Enterprise: Calculadora de Lance Mínimo & BDI, Proposta Timbrada em PDF, Monitor de Chat do Pregoeiro no WhatsApp, Minutas de Impugnação com IA e Inteligência de Preços Homologados."
    >
      {/* Barra de Simulação de Plano do Tenant */}
      <Tile
        style={{
          marginBottom: "1.5rem",
          padding: "1rem 1.5rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <strong style={{ fontSize: "0.95rem" }}>
              Escada de Valor do Arsenal SaaS:
            </strong>
            <Tag
              type={
                planoAtivo === "ENTERPRISE"
                  ? "purple"
                  : planoAtivo === "PRO"
                    ? "blue"
                    : "cool-gray"
              }
            >
              Plano {planoAtivo}
            </Tag>
          </div>
          <p
            style={{
              margin: "0.25rem 0 0 0",
              fontSize: "0.8125rem",
              color: "var(--cds-text-secondary)",
            }}
          >
            Básico (R$ 59,90): Calculadora BDI • Pro (R$ 97,00): + Proposta PDF
            Timbrada • Enterprise (R$ 197,00): + Monitor Pregoeiro WhatsApp, IA
            Impugnação & BI Preços.
          </p>
        </div>

        <div style={{ minWidth: "240px" }}>
          <Select
            id="select-plano-arsenal"
            labelText="Simular Visão do Plano"
            value={planoAtivo}
            onChange={(e) =>
              setPlanoAtivo(e.target.value as PlanoAssinaturaArsenal)
            }
          >
            <SelectItem value="BASICO" text="Plano Básico (R$ 59,90/mês)" />
            <SelectItem value="PRO" text="Plano Pro (R$ 97,00/mês)" />
            <SelectItem
              value="ENTERPRISE"
              text="Plano Enterprise (R$ 197,00/mês)"
            />
          </Select>
        </div>
      </Tile>

      {feedback && (
        <InlineNotification
          style={{ marginBottom: "1rem" }}
          kind={feedback.kind}
          title={
            feedback.kind === "success"
              ? "Operação Concluída"
              : "Atenção de Plano / Validação"
          }
          subtitle={feedback.text}
          onCloseButtonClick={() => setFeedback(null)}
        />
      )}

      <Tabs>
        <TabList aria-label="Módulos do Arsenal de Disputa">
          <Tab renderIcon={Calculator}>Calculadora de Lance & BDI</Tab>
          <Tab renderIcon={DocumentPdf}>Proposta Comercial PDF</Tab>
          <Tab renderIcon={Chat}>Monitor Chat Pregoeiro</Tab>
          <Tab renderIcon={Scale}>Impugnação com IA</Tab>
          <Tab renderIcon={Analytics}>BI Concorrentes & Relatório</Tab>
        </TabList>

        <TabPanels>
          {/* ABA 1: Calculadora de Lance Mínimo & Simulador de BDI */}
          <TabPanel>
            <Tile style={{ padding: "1.5rem", marginTop: "1rem" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "1rem",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                }}
              >
                <div>
                  <h2 style={{ margin: 0, fontSize: "1.25rem" }}>
                    Calculadora de Lance Mínimo Seguro & Simulador de BDI
                  </h2>
                  <p
                    style={{
                      margin: "0.25rem 0 0 0",
                      fontSize: "0.875rem",
                      color: "var(--cds-text-secondary)",
                    }}
                  >
                    Defina custo direto, frete, tributos e margem mínima para
                    proteger sua rentabilidade durante o pregão eletrônico.
                  </p>
                </div>
                <Tag type="green">Liberado em Todos os Planos</Tag>
              </div>

              <Grid style={{ padding: 0, marginBottom: "1.25rem" }}>
                <Column lg={6} md={4} sm={4} style={{ marginBottom: "1rem" }}>
                  <TextInput
                    id="calc-descricao"
                    labelText="Item / Lote em Disputa"
                    value={calcDescricao}
                    onChange={(e) => setCalcDescricao(e.target.value)}
                  />
                </Column>
                <Column lg={3} md={2} sm={4} style={{ marginBottom: "1rem" }}>
                  <TextInput
                    id="calc-qtd"
                    labelText="Quantidade"
                    value={calcQtd}
                    onChange={(e) => setCalcQtd(e.target.value)}
                  />
                </Column>
                <Column lg={4} md={2} sm={4} style={{ marginBottom: "1rem" }}>
                  <Select
                    id="calc-tipo-objeto"
                    labelText="Regime de Exequibilidade (Art. 59)"
                    value={calcTipoObjeto}
                    onChange={(e) =>
                      setCalcTipoObjeto(e.target.value as TipoObjetoLicitacao)
                    }
                  >
                    <SelectItem
                      value="BENS_SERVICOS"
                      text="Bens e Serviços Comuns (Alerta > 50%)"
                    />
                    <SelectItem
                      value="OBRAS_ENGENHARIA"
                      text="Obras e Serviços de Engenharia (Alerta > 25%)"
                    />
                  </Select>
                </Column>
                <Column lg={3} md={2} sm={4} style={{ marginBottom: "1rem" }}>
                  <TextInput
                    id="calc-estimado"
                    labelText="Vlr. Estimado Edital (R$)"
                    value={calcEstimadoEdital}
                    onChange={(e) => setCalcEstimadoEdital(e.target.value)}
                  />
                </Column>

                <Column lg={3} md={2} sm={4} style={{ marginBottom: "1rem" }}>
                  <TextInput
                    id="calc-custo"
                    labelText="Custo Direto Unit. (R$)"
                    value={calcCustoDireto}
                    onChange={(e) => setCalcCustoDireto(e.target.value)}
                  />
                </Column>
                <Column lg={3} md={2} sm={4} style={{ marginBottom: "1rem" }}>
                  <TextInput
                    id="calc-frete"
                    labelText="Frete / Logística Unit. (R$)"
                    value={calcFrete}
                    onChange={(e) => setCalcFrete(e.target.value)}
                  />
                </Column>
                <Column lg={2} md={2} sm={4} style={{ marginBottom: "1rem" }}>
                  <TextInput
                    id="calc-impostos"
                    labelText="Impostos (%)"
                    value={calcImpostos}
                    onChange={(e) => setCalcImpostos(e.target.value)}
                  />
                </Column>
                <Column lg={2} md={2} sm={4} style={{ marginBottom: "1rem" }}>
                  <TextInput
                    id="calc-bdi"
                    labelText="BDI (%)"
                    value={calcBdi}
                    onChange={(e) => setCalcBdi(e.target.value)}
                  />
                </Column>
                <Column lg={3} md={2} sm={4} style={{ marginBottom: "1rem" }}>
                  <TextInput
                    id="calc-margem"
                    labelText="Margem Mínima Segura (%)"
                    value={calcMargemMinima}
                    onChange={(e) => setCalcMargemMinima(e.target.value)}
                  />
                </Column>
                <Column lg={3} md={2} sm={4} style={{ marginBottom: "1rem" }}>
                  <TextInput
                    id="calc-lance"
                    labelText="Lance Unitário Simulado (R$)"
                    value={calcLanceProposto}
                    onChange={(e) => setCalcLanceProposto(e.target.value)}
                  />
                </Column>
              </Grid>

              <Button
                kind="primary"
                renderIcon={Calculator}
                onClick={handleCalcularLance}
                data-testid="btn-calcular-lance-bdi"
              >
                Calcular Piso de Lance & BDI
              </Button>

              {resultadoCalc && (
                <div style={{ marginTop: "1.5rem" }}>
                  <Grid style={{ padding: 0 }}>
                    <Column lg={4} md={4} sm={4}>
                      <Tile
                        style={{
                          background: "var(--cds-layer-02)",
                          padding: "1rem",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--cds-text-secondary)",
                          }}
                        >
                          Lance Mínimo Unitário Seguro (Piso)
                        </span>
                        <div
                          data-testid="resultado-lance-minimo-seguro"
                          className="pncp-mono"
                          style={{
                            fontSize: "1.5rem",
                            fontWeight: 700,
                            marginTop: "0.25rem",
                          }}
                        >
                          {formatCurrency(
                            resultadoCalc.lanceMinimoUnitarioSeguro,
                          )}
                        </div>
                        <span
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--cds-text-secondary)",
                          }}
                        >
                          Total Lote:{" "}
                          {formatCurrency(resultadoCalc.lanceMinimoTotalSeguro)}
                        </span>
                      </Tile>
                    </Column>

                    <Column lg={4} md={4} sm={4}>
                      <Tile
                        style={{
                          background: "var(--cds-layer-02)",
                          padding: "1rem",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--cds-text-secondary)",
                          }}
                        >
                          Preço Sugerido com BDI ({calcBdi}%)
                        </span>
                        <div
                          className="pncp-mono"
                          style={{
                            fontSize: "1.5rem",
                            fontWeight: 700,
                            marginTop: "0.25rem",
                          }}
                        >
                          {formatCurrency(
                            resultadoCalc.precoSugeridoComBdiUnitario,
                          )}
                        </div>
                        <span
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--cds-text-secondary)",
                          }}
                        >
                          Total c/ BDI:{" "}
                          {formatCurrency(
                            resultadoCalc.precoSugeridoComBdiTotal,
                          )}
                        </span>
                      </Tile>
                    </Column>

                    <Column lg={4} md={4} sm={4}>
                      <Tile
                        style={{
                          background: "var(--cds-layer-02)",
                          padding: "1rem",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--cds-text-secondary)",
                          }}
                        >
                          Lucro Líquido no Lance Simulado
                        </span>
                        <div
                          className="pncp-mono"
                          style={{
                            fontSize: "1.5rem",
                            fontWeight: 700,
                            marginTop: "0.25rem",
                            color:
                              resultadoCalc.lucroLiquidoTotal < 0
                                ? "var(--cds-support-error)"
                                : "var(--cds-support-success)",
                          }}
                        >
                          {formatCurrency(resultadoCalc.lucroLiquidoTotal)}
                        </div>
                        <span
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--cds-text-secondary)",
                          }}
                        >
                          Margem Real:{" "}
                          {resultadoCalc.margemLiquidaRealPercentual}% | Desc.
                          Edital: {resultadoCalc.descontoSobreEstimadoPercentual}
                          %
                        </span>
                      </Tile>
                    </Column>

                    <Column lg={4} md={4} sm={4}>
                      <Tile
                        style={{
                          background: "var(--cds-layer-02)",
                          padding: "1rem",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--cds-text-secondary)",
                          }}
                        >
                          Diagnóstico de Risco do Lance
                        </span>
                        <div
                          data-testid="status-risco-lance"
                          style={{ marginTop: "0.5rem" }}
                        >
                          <Tag
                            type={
                              resultadoCalc.statusRisco === "SEGURO"
                                ? "green"
                                : resultadoCalc.statusRisco ===
                                    "MARGEM_NEGATIVA"
                                  ? "red"
                                  : "magenta"
                            }
                          >
                            {resultadoCalc.statusRisco}
                          </Tag>
                        </div>
                        <p
                          style={{
                            fontSize: "0.75rem",
                            marginTop: "0.5rem",
                            marginBottom: 0,
                          }}
                        >
                          {resultadoCalc.alertaMensagem}
                        </p>
                      </Tile>
                    </Column>
                  </Grid>
                </div>
              )}
            </Tile>
          </TabPanel>

          {/* ABA 2: Gerador Automático de Proposta Comercial em PDF Timbrado */}
          <TabPanel>
            <Tile style={{ padding: "1.5rem", marginTop: "1rem" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "1rem",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                }}
              >
                <div>
                  <h2 style={{ margin: 0, fontSize: "1.25rem" }}>
                    Gerador Automático de Proposta Comercial Timbrada
                  </h2>
                  <p
                    style={{
                      margin: "0.25rem 0 0 0",
                      fontSize: "0.875rem",
                      color: "var(--cds-text-secondary)",
                    }}
                  >
                    Emissão instantânea da proposta readequada com CNPJ, dados
                    bancários, validade e declaração de integralidade de custos
                    (Art. 63 §1º Lei 14.133).
                  </p>
                </div>
                <Tag type="blue">Planos PRO & ENTERPRISE</Tag>
              </div>

              {!canUseArsenalFeature(planoAtivo, "PROPOSTA_PDF") && (
                <InlineNotification
                  kind="warning"
                  title="Recurso exclusivo dos Planos PRO e ENTERPRISE"
                  subtitle="Faça upgrade para o Plano Pro (R$ 97/mês) para gerar propostas comerciais timbradas em 1 clique."
                  hideCloseButton
                  style={{ marginBottom: "1rem" }}
                />
              )}

              <Grid style={{ padding: 0, marginBottom: "1rem" }}>
                <Column lg={4} md={4} sm={4} style={{ marginBottom: "1rem" }}>
                  <TextInput
                    id="prop-edital"
                    labelText="Número do Edital"
                    value={propEdital}
                    onChange={(e) => setPropEdital(e.target.value)}
                  />
                </Column>
                <Column lg={6} md={4} sm={4} style={{ marginBottom: "1rem" }}>
                  <TextInput
                    id="prop-orgao"
                    labelText="Órgão Comprador"
                    value={propOrgao}
                    onChange={(e) => setPropOrgao(e.target.value)}
                  />
                </Column>
                <Column lg={6} md={4} sm={4} style={{ marginBottom: "1rem" }}>
                  <TextInput
                    id="prop-marca"
                    labelText="Marca / Modelo Ofertado"
                    value={propMarca}
                    onChange={(e) => setPropMarca(e.target.value)}
                  />
                </Column>
                <Column lg={8} md={4} sm={4} style={{ marginBottom: "1rem" }}>
                  <TextInput
                    id="prop-objeto"
                    labelText="Objeto da Licitação"
                    value={propObjeto}
                    onChange={(e) => setPropObjeto(e.target.value)}
                  />
                </Column>
                <Column lg={4} md={2} sm={4} style={{ marginBottom: "1rem" }}>
                  <TextInput
                    id="prop-validade"
                    labelText="Validade da Proposta (Dias)"
                    value={propValidade}
                    onChange={(e) => setPropValidade(e.target.value)}
                  />
                </Column>
                <Column lg={4} md={2} sm={4} style={{ marginBottom: "1rem" }}>
                  <TextInput
                    id="prop-prazo"
                    labelText="Prazo de Entrega (Dias)"
                    value={propPrazoEntrega}
                    onChange={(e) => setPropPrazoEntrega(e.target.value)}
                  />
                </Column>
              </Grid>

              <Button
                kind="primary"
                renderIcon={DocumentPdf}
                onClick={handleGerarProposta}
                data-testid="btn-gerar-proposta-timbrada"
              >
                Gerar Proposta Comercial Timbrada
              </Button>

              {propostaGerada && (
                <div style={{ marginTop: "1.5rem" }}>
                  <div
                    style={{
                      display: "flex",
                      gap: "0.5rem",
                      marginBottom: "0.75rem",
                    }}
                  >
                    <Button
                      kind="secondary"
                      size="sm"
                      renderIcon={Copy}
                      onClick={() =>
                        navigator.clipboard?.writeText(
                          propostaGerada.textoTimbrado,
                        )
                      }
                    >
                      Copiar Proposta
                    </Button>
                    <Button
                      kind="tertiary"
                      size="sm"
                      renderIcon={Printer}
                      onClick={() => window.print()}
                    >
                      Imprimir / Salvar PDF
                    </Button>
                  </div>
                  <pre
                    style={{
                      background: "var(--cds-layer-02)",
                      padding: "1.25rem",
                      whiteSpace: "pre-wrap",
                      fontSize: "0.8125rem",
                      border: "1px solid var(--cds-border-subtle)",
                    }}
                  >
                    {propostaGerada.textoTimbrado}
                  </pre>
                </div>
              )}
            </Tile>
          </TabPanel>

          {/* ABA 3: Monitor de Chat do Pregoeiro com Alertas WhatsApp */}
          <TabPanel>
            <Tile style={{ padding: "1.5rem", marginTop: "1rem" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "1rem",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                }}
              >
                <div>
                  <h2 style={{ margin: 0, fontSize: "1.25rem" }}>
                    Monitor de Chat do Pregoeiro & Alertas no WhatsApp
                  </h2>
                  <p
                    style={{
                      margin: "0.25rem 0 0 0",
                      fontSize: "0.875rem",
                      color: "var(--cds-text-secondary)",
                    }}
                  >
                    Detecta menções ao seu CNPJ ou Razão Social e convocações de
                    prazo fatal na sala de disputa, disparando aviso imediato no
                    WhatsApp.
                  </p>
                </div>
                <Tag type="purple">Exclusivo ENTERPRISE</Tag>
              </div>

              <Grid style={{ padding: 0, marginBottom: "1rem" }}>
                <Column lg={3} md={2} sm={4} style={{ marginBottom: "1rem" }}>
                  <TextInput
                    id="chat-edital"
                    labelText="Edital Monitorado"
                    value={chatEdital}
                    onChange={(e) => setChatEdital(e.target.value)}
                  />
                </Column>
                <Column lg={3} md={2} sm={4} style={{ marginBottom: "1rem" }}>
                  <TextInput
                    id="chat-orgao"
                    labelText="Órgão"
                    value={chatOrgao}
                    onChange={(e) => setChatOrgao(e.target.value)}
                  />
                </Column>
                <Column lg={3} md={2} sm={4} style={{ marginBottom: "1rem" }}>
                  <TextInput
                    id="chat-cnpj"
                    labelText="CNPJ Monitorado"
                    value={chatCnpj}
                    onChange={(e) => setChatCnpj(e.target.value)}
                  />
                </Column>
                <Column lg={4} md={2} sm={4} style={{ marginBottom: "1rem" }}>
                  <TextInput
                    id="chat-razao"
                    labelText="Razão Social / Nome Fantasia"
                    value={chatRazao}
                    onChange={(e) => setChatRazao(e.target.value)}
                  />
                </Column>
                <Column lg={3} md={2} sm={4} style={{ marginBottom: "1rem" }}>
                  <TextInput
                    id="chat-wpp"
                    labelText="WhatsApp para Alerta"
                    value={chatTelefone}
                    onChange={(e) => setChatTelefone(e.target.value)}
                  />
                </Column>
                <Column lg={16} md={8} sm={4} style={{ marginBottom: "1rem" }}>
                  <TextArea
                    id="chat-msg"
                    labelText="Mensagem Capturada da Sala de Disputa"
                    rows={3}
                    value={chatMensagemTeste}
                    onChange={(e) => setChatMensagemTeste(e.target.value)}
                  />
                </Column>
              </Grid>

              <Button
                kind="primary"
                renderIcon={Send}
                onClick={handleMonitorarChat}
                data-testid="btn-analisar-chat-pregoeiro"
              >
                Analisar Mensagem & Testar Disparo WhatsApp
              </Button>

              {resultadoChat && (
                <div style={{ marginTop: "1.5rem" }}>
                  {resultadoChat.alertasCriticos.map((alerta, idx) => (
                    <Tile
                      key={idx}
                      style={{
                        background: "var(--cds-layer-02)",
                        borderLeft: "4px solid var(--cds-support-error)",
                        padding: "1rem",
                        marginBottom: "0.75rem",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          gap: "0.5rem",
                          alignItems: "center",
                          marginBottom: "0.5rem",
                        }}
                      >
                        <Tag type="red">{alerta.tipoEvento}</Tag>
                        {alerta.mencionouEmpresa && (
                          <Tag type="magenta">CNPJ / Razão Social Citada</Tag>
                        )}
                        {resultadoChat.whatsappEnfileirado && (
                          <Tag type="green">WhatsApp Enfileirado</Tag>
                        )}
                      </div>
                      <p style={{ margin: "0 0 0.5rem 0", fontWeight: 600 }}>
                        &ldquo;{alerta.textoOriginal}&rdquo;
                      </p>
                      <p
                        style={{
                          margin: 0,
                          fontSize: "0.875rem",
                          color: "var(--cds-text-secondary)",
                        }}
                      >
                        {alerta.acaoRecomendada}
                      </p>
                    </Tile>
                  ))}
                </div>
              )}
            </Tile>
          </TabPanel>

          {/* ABA 4: Gerador de Minutas de Impugnação com IA (Art. 164 Lei 14.133) */}
          <TabPanel>
            <Tile style={{ padding: "1.5rem", marginTop: "1rem" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "1rem",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                }}
              >
                <div>
                  <h2 style={{ margin: 0, fontSize: "1.25rem" }}>
                    Gerador de Minutas de Impugnação com IA (Art. 164 Lei
                    14.133/2021)
                  </h2>
                  <p
                    style={{
                      margin: "0.25rem 0 0 0",
                      fontSize: "0.875rem",
                      color: "var(--cds-text-secondary)",
                    }}
                  >
                    Redação jurídica estruturada com súmulas e acórdãos do TCU e
                    cálculo automático do prazo fatal de 3 dias úteis.
                  </p>
                </div>
                <Tag type="purple">Exclusivo ENTERPRISE</Tag>
              </div>

              <Grid style={{ padding: 0, marginBottom: "1rem" }}>
                <Column lg={4} md={2} sm={4} style={{ marginBottom: "1rem" }}>
                  <TextInput
                    id="imp-edital"
                    labelText="Número do Edital"
                    value={impEdital}
                    onChange={(e) => setImpEdital(e.target.value)}
                  />
                </Column>
                <Column lg={4} md={2} sm={4} style={{ marginBottom: "1rem" }}>
                  <TextInput
                    id="imp-orgao"
                    labelText="Órgão Licitante"
                    value={impOrgao}
                    onChange={(e) => setImpOrgao(e.target.value)}
                  />
                </Column>
                <Column lg={4} md={2} sm={4} style={{ marginBottom: "1rem" }}>
                  <TextInput
                    id="imp-data"
                    type="date"
                    labelText="Data da Sessão Pública"
                    value={impDataAbertura}
                    onChange={(e) => setImpDataAbertura(e.target.value)}
                  />
                </Column>
                <Column lg={4} md={2} sm={4} style={{ marginBottom: "1rem" }}>
                  <Select
                    id="imp-tese"
                    labelText="Tese Jurídica Principal"
                    value={impTese}
                    onChange={(e) =>
                      setImpTese(e.target.value as TeseImpugnacaoIa)
                    }
                  >
                    <SelectItem
                      value="RESTRICAO_COMPETITIVIDADE_E_MARCA"
                      text="Direcionamento de Marca / Restrição (Súmula 270/273 TCU)"
                    />
                    <SelectItem
                      value="QUALIFICACAO_TECNICA_EXCESSIVA"
                      text="Excesso em Atestado Técnico > 50% (Art. 67 Lei 14.133)"
                    />
                    <SelectItem
                      value="PRAZO_ENTREGA_INEXEQUIVEL"
                      text="Prazo de Entrega Exíguo / Inexequível (Art. 5º Lei 14.133)"
                    />
                    <SelectItem
                      value="ORCAMENTO_DEFASADO_OU_SIGILOSO_IRREGULAR"
                      text="Preço Estimado Defasado (Art. 23 Lei 14.133)"
                    />
                  </Select>
                </Column>
                <Column lg={16} md={8} sm={4} style={{ marginBottom: "1rem" }}>
                  <TextArea
                    id="imp-clausula"
                    labelText="Cláusula ou Exigência Questionada no Edital"
                    rows={3}
                    value={impClausula}
                    onChange={(e) => setImpClausula(e.target.value)}
                  />
                </Column>
              </Grid>

              <Button
                kind="primary"
                renderIcon={Scale}
                onClick={handleGerarMinutaIA}
                data-testid="btn-gerar-minuta-ia"
              >
                Redigir Petição de Impugnação com IA
              </Button>

              {minutaIaGerada && (
                <pre
                  style={{
                    marginTop: "1.5rem",
                    background: "var(--cds-layer-02)",
                    padding: "1.25rem",
                    whiteSpace: "pre-wrap",
                    fontSize: "0.8125rem",
                    border: "1px solid var(--cds-border-subtle)",
                  }}
                >
                  {minutaIaGerada.textoCompletoPeticao}
                </pre>
              )}
            </Tile>
          </TabPanel>

          {/* ABA 5: Inteligência de Preços dos Concorrentes & Relatório Executivo Mensal */}
          <TabPanel>
            <Tile style={{ padding: "1.5rem", marginTop: "1rem" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "1rem",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                }}
              >
                <div>
                  <h2 style={{ margin: 0, fontSize: "1.25rem" }}>
                    Inteligência de Preços Homologados & Relatório Executivo
                    Mensal
                  </h2>
                  <p
                    style={{
                      margin: "0.25rem 0 0 0",
                      fontSize: "0.875rem",
                      color: "var(--cds-text-secondary)",
                    }}
                  >
                    Histórico de vencedores e desconto médio praticado nos
                    últimos 12 meses + consolidado mensal para a diretoria.
                  </p>
                </div>
                <Tag type="purple">Exclusivo ENTERPRISE</Tag>
              </div>

              <Grid style={{ padding: 0, marginBottom: "1rem" }}>
                <Column lg={8} md={4} sm={4} style={{ marginBottom: "1rem" }}>
                  <TextInput
                    id="bi-termo"
                    labelText="Item, Palavra-Chave ou Código CATMAT/CATSER"
                    value={biTermo}
                    onChange={(e) => setBiTermo(e.target.value)}
                  />
                </Column>
                <Column lg={4} md={2} sm={4} style={{ marginBottom: "1rem" }}>
                  <TextInput
                    id="bi-uf"
                    labelText="UF (Ex: GO, DF, SP)"
                    value={biUf}
                    onChange={(e) => setBiUf(e.target.value)}
                  />
                </Column>
              </Grid>

              <Button
                kind="primary"
                renderIcon={Analytics}
                onClick={handleConsultarBiERelatorio}
                data-testid="btn-consultar-bi-precos"
              >
                Consultar Homologações & Gerar Relatório Executivo
              </Button>

              {resultadoBi && (
                <div style={{ marginTop: "1.5rem" }}>
                  <Grid style={{ padding: 0, marginBottom: "1rem" }}>
                    <Column lg={4} md={4} sm={4}>
                      <Tile
                        style={{
                          background: "var(--cds-layer-02)",
                          padding: "1rem",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--cds-text-secondary)",
                          }}
                        >
                          Desconto Médio Homologado
                        </span>
                        <div
                          className="pncp-mono"
                          style={{ fontSize: "1.5rem", fontWeight: 700 }}
                        >
                          {resultadoBi.descontoMedioHomologadoPercentual}%
                        </div>
                      </Tile>
                    </Column>
                    <Column lg={6} md={4} sm={4}>
                      <Tile
                        style={{
                          background: "var(--cds-layer-02)",
                          padding: "1rem",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--cds-text-secondary)",
                          }}
                        >
                          Faixa Competitiva Recomendada
                        </span>
                        <div
                          className="pncp-mono"
                          style={{ fontSize: "1.25rem", fontWeight: 700 }}
                        >
                          {formatCurrency(
                            resultadoBi.faixaLanceRecomendada.minimo,
                          )}{" "}
                          a{" "}
                          {formatCurrency(
                            resultadoBi.faixaLanceRecomendada.maximo,
                          )}
                        </div>
                      </Tile>
                    </Column>
                  </Grid>
                </div>
              )}

              {relatorioMensal && (
                <pre
                  style={{
                    marginTop: "1rem",
                    background: "var(--cds-layer-02)",
                    padding: "1.25rem",
                    whiteSpace: "pre-wrap",
                    fontSize: "0.8125rem",
                    border: "1px solid var(--cds-border-subtle)",
                  }}
                >
                  {relatorioMensal.resumoExecutivoTexto}
                </pre>
              )}
            </Tile>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </ModulePageShell>
  );
}

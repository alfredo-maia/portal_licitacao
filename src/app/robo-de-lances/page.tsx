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
  Bot,
  Calculator,
  Chat,
  Copy,
  DocumentPdf,
  Launch,
  Pause,
  Play,
  Printer,
  Send,
  Settings,
} from "@carbon/icons-react";
import { ModulePageShell } from "@/components/shell/module-page-shell";
import {
  calcularLanceMinimoEBdi,
  canUseArsenalFeature,
  consultarInteligenciaPrecosConcorrentes,
  gerarPropostaComercialTimbrada,
  gerarRelatorioExecutivoMensal,
  type CalculadoraLanceOutput,
  type InteligenciaPrecosOutput,
  type MonitorChatPregoeiroOutput,
  type PlanoAssinaturaArsenal,
  type PropostaComercialGerada,
  type RelatorioExecutivoMensalOutput,
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

  // 1. Estado Salas de Disputa Ativas (Robô de Lances)
  const [motorAtivoGlobal, setMotorAtivoGlobal] = useState(true);
  const [estrategiaGlobal, setEstrategiaGlobal] = useState("CENTAVO_1");
  const [tempoDisparo, setTempoDisparo] = useState("RANDOM_2S");
  const [preferenciaMe, setPreferenciaMe] = useState("ATIVO");

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
      subtitle="Arsenal de Disputa: Painel Central de Salas Ativas do Robô de Lances, Calculadora de Lance Mínimo & BDI, Proposta Timbrada em PDF e Monitoramento Estratégico."
    >
      {feedback && (
        <InlineNotification
          style={{ marginBottom: "1rem" }}
          kind={feedback.kind}
          title={
            feedback.kind === "success"
              ? "Operação Concluída"
              : "Atenção de Validação"
          }
          subtitle={feedback.text}
          onCloseButtonClick={() => setFeedback(null)}
        />
      )}

      <Tabs>
        <TabList aria-label="Módulos do Arsenal de Disputa">
          <Tab renderIcon={Bot}>Salas de Disputa Ativas</Tab>
          <Tab renderIcon={Calculator}>Calculadora de Lance & BDI</Tab>
          <Tab renderIcon={DocumentPdf}>Proposta Comercial PDF</Tab>
          <Tab renderIcon={Chat}>Monitor Chat Pregoeiro</Tab>
          <Tab renderIcon={Analytics}>BI Concorrentes & Relatório</Tab>
        </TabList>

        <TabPanels>
          {/* ABA 1: Salas de Disputa Ativas (Robô de Lances) */}
          <TabPanel>
            <Tile style={{ padding: "1.5rem", marginTop: "1rem" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: "1.25rem",
                  flexWrap: "wrap",
                  gap: "1rem",
                }}
              >
                <div>
                  <h2 style={{ margin: 0, fontSize: "1.25rem" }}>
                    Painel Central de Disputas em Tempo Real (Auto-Bidder)
                  </h2>
                  <p
                    style={{
                      margin: "0.25rem 0 0 0",
                      fontSize: "0.875rem",
                      color: "var(--cds-text-secondary)",
                    }}
                  >
                    Monitoramento em tempo real de todas as salas públicas de disputa ativas no dia, acompanhamento do menor lance e controle inviolável do piso seguro contra inexequibilidade.
                  </p>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <Tag type={motorAtivoGlobal ? "green" : "cool-gray"} size="md">
                    {motorAtivoGlobal ? "● Motor em Tempo Real ATIVO" : "⏸️ Motor PAUSADO"}
                  </Tag>
                  <Button
                    size="sm"
                    kind={motorAtivoGlobal ? "danger--tertiary" : "primary"}
                    renderIcon={motorAtivoGlobal ? Pause : Play}
                    onClick={() => setMotorAtivoGlobal(!motorAtivoGlobal)}
                  >
                    {motorAtivoGlobal ? "Pausar Motor Global" : "Ligar Motor Global"}
                  </Button>
                </div>
              </div>

              {/* Métricas do Robô */}
              <Grid style={{ padding: 0, marginBottom: "1.5rem" }}>
                <Column lg={3} md={2} sm={4}>
                  <Tile style={{ padding: "1rem", borderLeft: "4px solid var(--cds-interactive, #0f62fe)" }}>
                    <div style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)" }}>Salas Monitoradas Hoje</div>
                    <div style={{ fontSize: "1.6rem", fontWeight: 700, marginTop: "0.25rem" }}>3 Certames</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--cds-support-success, #24a148)", marginTop: "0.25rem" }}>
                      ● 2 em liderança (1º lugar)
                    </div>
                  </Tile>
                </Column>
                <Column lg={3} md={2} sm={4}>
                  <Tile style={{ padding: "1rem", borderLeft: "4px solid var(--cds-support-success, #24a148)" }}>
                    <div style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)" }}>Lances Disparados</div>
                    <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--cds-support-success, #24a148)", marginTop: "0.25rem" }}>
                      24 Lances
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginTop: "0.25rem" }}>
                      Tempo médio de resposta: 1.8s
                    </div>
                  </Tile>
                </Column>
                <Column lg={3} md={2} sm={4}>
                  <Tile style={{ padding: "1rem", borderLeft: "4px solid var(--cds-support-info, #0043ce)" }}>
                    <div style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)" }}>Economia / Margem Média</div>
                    <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--cds-support-info, #0043ce)", marginTop: "0.25rem" }}>
                      16.4%
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginTop: "0.25rem" }}>
                      Preservada acima do piso mínimo
                    </div>
                  </Tile>
                </Column>
                <Column lg={3} md={2} sm={4}>
                  <Tile style={{ padding: "1rem", borderLeft: "4px solid var(--cds-support-warning, #f1c21b)" }}>
                    <div style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)" }}>Proteção de Piso Seguro</div>
                    <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--cds-support-warning, #f1c21b)", marginTop: "0.25rem" }}>
                      100% Inviolável
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginTop: "0.25rem" }}>
                      Trava anti-inexequibilidade (Art. 59)
                    </div>
                  </Tile>
                </Column>
              </Grid>

              {/* Tabela de Salas de Disputa Ativas */}
              <div style={{ marginBottom: "1.5rem" }}>
                <h4 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}>
                  ⚡ Salas em Disputa Hoje
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <Tile style={{ padding: "1.25rem", borderLeft: "4px solid var(--cds-support-success, #24a148)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <Tag type="green" size="sm">1º LUGAR</Tag>
                          <Tag type="cool-gray" size="sm">Compras.gov.br</Tag>
                          <strong style={{ fontSize: "0.95rem" }}>PE 099/2026 - TRE-GO</strong>
                        </div>
                        <div style={{ fontSize: "0.85rem", marginTop: "0.35rem" }}>
                          Item 1: 50 Notebooks Corporativos i7 16GB SSD 512GB
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginTop: "0.25rem" }}>
                          Última ação: Cobriu lance concorrente por R$ 0,01 há 2 min
                        </div>
                      </div>

                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)" }}>Seu Lance Atual</div>
                        <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--cds-support-success, #24a148)" }}>
                          R$ 4.150,00
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                          Piso Seguro: R$ 3.850,00
                        </div>
                      </div>
                    </div>
                  </Tile>

                  <Tile style={{ padding: "1.25rem", borderLeft: "4px solid var(--cds-interactive, #0f62fe)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <Tag type="blue" size="sm">2º LUGAR</Tag>
                          <Tag type="cool-gray" size="sm">BBMNet</Tag>
                          <strong style={{ fontSize: "0.95rem" }}>PE 045/2026 - Prefeitura de Anápolis/GO</strong>
                        </div>
                        <div style={{ fontSize: "0.85rem", marginTop: "0.35rem" }}>
                          Lote 1: Suprimentos de TI e Periféricos
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginTop: "0.25rem" }}>
                          Última ação: Aguardando encerramento randômico da rodada
                        </div>
                      </div>

                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)" }}>Seu Lance Atual</div>
                        <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>
                          R$ 89.200,00
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                          Menor Lance: R$ 88.500,00 • Piso: R$ 82.000,00
                        </div>
                      </div>
                    </div>
                  </Tile>

                  <Tile style={{ padding: "1.25rem", borderLeft: "4px solid var(--cds-support-warning, #f1c21b)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <Tag type="warm-gray" size="sm">IMINÊNCIA</Tag>
                          <Tag type="cool-gray" size="sm">BEC-SP</Tag>
                          <strong style={{ fontSize: "0.95rem" }}>PE 112/2026 - Secretaria de Saúde SP</strong>
                        </div>
                        <div style={{ fontSize: "0.85rem", marginTop: "0.35rem" }}>
                          Item 3: Insumos Hospitalares e Materiais de Apoio
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginTop: "0.25rem" }}>
                          Última ação: Aviso de iminência emitido pelo pregoeiro
                        </div>
                      </div>

                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)" }}>Seu Lance Atual</div>
                        <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--cds-support-success, #24a148)" }}>
                          R$ 15.400,00
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                          Piso Seguro: R$ 14.200,00
                        </div>
                      </div>
                    </div>
                  </Tile>
                </div>
              </div>

              {/* Configurações Padrão de Disparo */}
              <Tile style={{ padding: "1.25rem", backgroundColor: "var(--cds-layer-accent, #f4f4f4)" }}>
                <h4 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.75rem" }}>
                  ⚙️ Estratégia de Disparo do Motor de Lances
                </h4>
                <Grid style={{ padding: 0 }}>
                  <Column lg={4} md={2} sm={4} style={{ marginBottom: "0.5rem" }}>
                    <Select
                      id="select-decremento-padrao"
                      labelText="Regra de Decremento (Cobrir Oferta)"
                      value={estrategiaGlobal}
                      onChange={(e) => setEstrategiaGlobal(e.target.value)}
                    >
                      <SelectItem value="CENTAVO_1" text="Cobrir por R$ 0,01 (Mínimo Permitido)" />
                      <SelectItem value="REAL_1" text="Cobrir por R$ 1,00" />
                      <SelectItem value="REAL_5" text="Cobrir por R$ 5,00" />
                      <SelectItem value="PERCENTUAL_05" text="Cobrir por 0,5% do valor atual" />
                    </Select>
                  </Column>
                  <Column lg={4} md={2} sm={4} style={{ marginBottom: "0.5rem" }}>
                    <Select
                      id="select-tempo-disparo"
                      labelText="Janela de Disparo do Lance"
                      value={tempoDisparo}
                      onChange={(e) => setTempoDisparo(e.target.value)}
                    >
                      <SelectItem value="IMEDIATO" text="Imediato (ao ser superado)" />
                      <SelectItem value="RANDOM_2S" text="Randômico (1 a 3 segundos finais)" />
                      <SelectItem value="ULTIMOS_SEGUNDOS" text="Sniper (Últimos 10 segundos da rodada)" />
                    </Select>
                  </Column>
                  <Column lg={4} md={2} sm={4} style={{ marginBottom: "0.5rem" }}>
                    <Select
                      id="select-empate-me"
                      labelText="Direito de Preferência ME/EPP (LC 123)"
                      value={preferenciaMe}
                      onChange={(e) => setPreferenciaMe(e.target.value)}
                    >
                      <SelectItem value="ATIVO" text="Ativo: Cobrir menor lance em até 5min" />
                      <SelectItem value="DESATIVO" text="Desativado" />
                    </Select>
                  </Column>
                </Grid>
              </Tile>
            </Tile>
          </TabPanel>

          {/* ABA 2: Calculadora de Lance Mínimo & Simulador de BDI */}
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
                <Tag type="teal">Arsenal de Disputa</Tag>
              </div>

              <InlineNotification
                kind="info"
                style={{ marginBottom: "1rem" }}
                title="Módulo Dedicado Disponível:"
                subtitle="Você pode gerenciar todas as mensagens recebidas de todas as salas em tempo real no novo módulo 'Chat do Pregoeiro' (/chat-pregoeiro) no menu lateral."
              />

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
                <Tag type="teal">Arsenal de Disputa</Tag>
              </div>

              <InlineNotification
                kind="info"
                style={{ marginBottom: "1rem" }}
                title="Módulo Dedicado Disponível:"
                subtitle="Você pode consultar histórico completo de homologações e média de preços praticados no novo módulo 'Inteligência de Preços' (/inteligencia-precos) no menu lateral."
              />

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

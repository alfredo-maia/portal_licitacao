"use client";

import React, { useState } from "react";
import {
  Button,
  Column,
  Grid,
  InlineNotification,
  Select,
  SelectItem,
  Tag,
  Tile,
} from "@carbon/react";
import {
  Bot,
  Pause,
  Play,
  Settings,
} from "@carbon/icons-react";
import { ModulePageShell } from "@/components/shell/module-page-shell";

export default function RoboDeLancesPage() {
  const [feedback, setFeedback] = useState<{
    kind: "success" | "warning" | "error";
    text: string;
  } | null>(null);

  // Estado do Motor de Lances e Salas de Disputa Ativas
  const [motorAtivoGlobal, setMotorAtivoGlobal] = useState(true);
  const [estrategiaGlobal, setEstrategiaGlobal] = useState("CENTAVO_1");
  const [tempoDisparo, setTempoDisparo] = useState("RANDOM_2S");
  const [preferenciaMe, setPreferenciaMe] = useState("ATIVO");

  return (
    <ModulePageShell
      title="Robô de Lances"
      badge="Em breve"
      subtitle="Painel central de monitoramento em tempo real das salas públicas de disputa ativas nos portais de compras (Compras.gov.br, Compras Públicas, BBMNet, BEC-SP), com estratégia de lances automáticos e proteção inviolável do preço piso."
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
              onClick={() => {
                const novoStatus = !motorAtivoGlobal;
                setMotorAtivoGlobal(novoStatus);
                setFeedback({
                  kind: novoStatus ? "success" : "warning",
                  text: novoStatus
                    ? "Motor global de lances ativado com sucesso para as salas monitoradas."
                    : "Motor global de lances pausado preventivamente. Nenhum lance automático será enviado.",
                });
              }}
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
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <Settings size={18} />
            <h4 style={{ fontSize: "0.95rem", fontWeight: 600, margin: 0 }}>
              Estratégia de Disparo do Motor de Lances
            </h4>
          </div>
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
    </ModulePageShell>
  );
}

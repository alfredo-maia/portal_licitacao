"use client";

import React from "react";
import Link from "next/link";
import { Button, Tab, TabList, TabPanel, TabPanels, Tabs, Tag } from "@carbon/react";
import { Renew } from "@carbon/icons-react";
import {
  AdminTable,
  KpiGrid,
  KpiTile,
  PageHeader,
  fmtBRL,
  fmtData,
  fmtNum,
  useAdminData,
} from "../admin-ui";

interface IaPayload {
  totalTokensHoje: number;
  chamadasHoje: number;
  gastoHojeBrl: number;
  gastoHojeUsd: number;
  totalTokensMes: number;
  chamadasMes: number;
  gastoMesBrl: number;
  gastoMesUsd: number;
  cotacaoUsdBrl: number;
  porCliente: Array<{ tenantId: string; empresaNome: string; chamadas: number; tokens: number; gastoBrl: number }>;
  porUsuario: Array<{ chave: string; rotulo: string; chamadas: number; tokens: number; gastoBrl: number }>;
  porFeature: Array<{ chave: string; rotulo: string; chamadas: number; tokens: number; gastoBrl: number }>;
  porModelo: Array<{ chave: string; rotulo: string; chamadas: number; tokens: number; gastoBrl: number }>;
  serieDiaria: Array<{ data: string; gastoBrl: number; tokens: number; chamadas: number }>;
  ultimasChamadas: Array<{
    id: string;
    criadoEm: string;
    empresaNome: string;
    usuarioNome: string;
    feature: string;
    model: string;
    tokens: number;
    custoBrl: number;
    status: string;
  }>;
}

export function IaConsumoScreen() {
  const { data, loading, erro, recarregar } = useAdminData<IaPayload>("/api/admin/ia");

  return (
    <div>
      <PageHeader
        titulo="Consumo & Custos Diários de IA"
        descricao="Telemetria em tempo real de tokens consumidos e gasto estimado em reais (BRL) e dólar (USD) por cliente, usuário, funcionalidade e modelo LLM."
        acoes={
          <Button kind="tertiary" renderIcon={Renew} onClick={() => void recarregar()} disabled={loading}>
            Atualizar
          </Button>
        }
      />

      {erro ? <p style={{ color: "var(--cds-support-error)" }}>{erro}</p> : null}

      <KpiGrid>
        <KpiTile rotulo="GASTO HOJE (BRL)" valor={fmtBRL(data?.gastoHojeBrl)} detalhe={`US$ ${(data?.gastoHojeUsd ?? 0).toFixed(4)} • Cotação ${data?.cotacaoUsdBrl ?? 5.5}`} cor="var(--cds-support-error)" />
        <KpiTile rotulo="TOKENS HOJE" valor={fmtNum(data?.totalTokensHoje)} detalhe={`${fmtNum(data?.chamadasHoje)} chamada(s) hoje`} />
        <KpiTile rotulo="GASTO NO MÊS (BRL)" valor={fmtBRL(data?.gastoMesBrl)} detalhe={`US$ ${(data?.gastoMesUsd ?? 0).toFixed(2)} • ${fmtNum(data?.chamadasMes)} chamada(s)`} />
        <KpiTile rotulo="TOKENS NO MÊS" valor={fmtNum(data?.totalTokensMes)} />
      </KpiGrid>

      <Tabs>
        <TabList aria-label="Visões de consumo de IA" contained>
          <Tab>Por Cliente (CNPJ)</Tab>
          <Tab>Por Usuário</Tab>
          <Tab>Por Funcionalidade & Modelo</Tab>
          <Tab>Histórico Diário & Últimas Chamadas</Tab>
        </TabList>
        <TabPanels>
          <TabPanel>
            <AdminTable
              titulo="Consumo no mês por empresa"
              colunas={[
                { key: "empresa", header: "Empresa" },
                { key: "chamadas", header: "Chamadas" },
                { key: "tokens", header: "Tokens" },
                { key: "gasto", header: "Custo Estimado (R$)" },
                { key: "acoes", header: "" },
              ]}
              vazio={loading ? "Carregando..." : "Nenhum consumo registrado no mês."}
              linhas={(data?.porCliente || []).map((c) => ({
                id: c.tenantId,
                empresa: c.empresaNome,
                chamadas: fmtNum(c.chamadas),
                tokens: fmtNum(c.tokens),
                gasto: <strong>{fmtBRL(c.gastoBrl)}</strong>,
                acoes: c.tenantId !== "SEM_TENANT" ? <Link href={`/admin/clientes/${c.tenantId}`}>Ver 360º</Link> : null,
              }))}
            />
          </TabPanel>

          <TabPanel>
            <AdminTable
              titulo="Consumo no mês por usuário"
              colunas={[
                { key: "usuario", header: "Usuário" },
                { key: "chamadas", header: "Chamadas" },
                { key: "tokens", header: "Tokens" },
                { key: "gasto", header: "Custo Estimado (R$)" },
              ]}
              linhas={(data?.porUsuario || []).map((u) => ({
                id: u.chave,
                usuario: u.rotulo,
                chamadas: fmtNum(u.chamadas),
                tokens: fmtNum(u.tokens),
                gasto: <strong>{fmtBRL(u.gastoBrl)}</strong>,
              }))}
            />
          </TabPanel>

          <TabPanel>
            <div style={{ display: "grid", gap: "1.5rem" }}>
              <AdminTable
                titulo="Por funcionalidade"
                colunas={[
                  { key: "feature", header: "Funcionalidade" },
                  { key: "chamadas", header: "Chamadas" },
                  { key: "tokens", header: "Tokens" },
                  { key: "gasto", header: "Custo (R$)" },
                ]}
                linhas={(data?.porFeature || []).map((f) => ({
                  id: f.chave,
                  feature: <Tag type="purple">{f.rotulo}</Tag>,
                  chamadas: fmtNum(f.chamadas),
                  tokens: fmtNum(f.tokens),
                  gasto: fmtBRL(f.gastoBrl),
                }))}
              />
              <AdminTable
                titulo="Por modelo LLM"
                colunas={[
                  { key: "modelo", header: "Modelo" },
                  { key: "chamadas", header: "Chamadas" },
                  { key: "tokens", header: "Tokens" },
                  { key: "gasto", header: "Custo (R$)" },
                ]}
                linhas={(data?.porModelo || []).map((m) => ({
                  id: m.chave,
                  modelo: <Tag type="blue">{m.rotulo}</Tag>,
                  chamadas: fmtNum(m.chamadas),
                  tokens: fmtNum(m.tokens),
                  gasto: fmtBRL(m.gastoBrl),
                }))}
              />
            </div>
          </TabPanel>

          <TabPanel>
            <div style={{ display: "grid", gap: "1.5rem" }}>
              <AdminTable
                titulo="Série diária do mês"
                colunas={[
                  { key: "data", header: "Dia" },
                  { key: "chamadas", header: "Chamadas" },
                  { key: "tokens", header: "Tokens" },
                  { key: "gasto", header: "Gasto (R$)" },
                ]}
                linhas={(data?.serieDiaria || []).map((d) => ({
                  id: d.data,
                  data: d.data,
                  chamadas: fmtNum(d.chamadas),
                  tokens: fmtNum(d.tokens),
                  gasto: fmtBRL(d.gastoBrl),
                }))}
              />
              <AdminTable
                titulo="Últimas 30 chamadas registradas"
                colunas={[
                  { key: "quando", header: "Data/Hora" },
                  { key: "empresa", header: "Empresa / Usuário" },
                  { key: "feature", header: "Função / Modelo" },
                  { key: "tokens", header: "Tokens" },
                  { key: "custo", header: "Custo" },
                ]}
                linhas={(data?.ultimasChamadas || []).map((l) => ({
                  id: l.id,
                  quando: fmtData(l.criadoEm),
                  empresa: `${l.empresaNome} (${l.usuarioNome})`,
                  feature: `${l.feature} • ${l.model}`,
                  tokens: fmtNum(l.tokens),
                  custo: fmtBRL(l.custoBrl),
                }))}
              />
            </div>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </div>
  );
}


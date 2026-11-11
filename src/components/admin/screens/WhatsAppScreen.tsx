"use client";

import React, { useEffect, useState } from "react";
import { Button, Tab, TabList, TabPanel, TabPanels, Tabs, Tag, TextInput, Tile } from "@carbon/react";
import { QrCode, Renew, SendAlt } from "@carbon/icons-react";
import { maskPhone } from "@/lib/masks";
import {
  AdminTable,
  FeedbackBar,
  KpiGrid,
  KpiTile,
  PageHeader,
  adminFetch,
  fmtData,
  fmtNum,
  useAdminData,
  type Feedback,
} from "../admin-ui";

interface WhatsAppPayload {
  instanciaConectada: boolean;
  nomeInstancia: string;
  filaTamanho: number;
  totalEnviadas: number;
  totalOptOuts: number;
  provedorConfigurado: boolean;
  config: {
    minDelaySegundos: number;
    maxDelaySegundos: number;
    limiteDiarioWarmup: number;
    janelaInicio: string;
    janelaFim: string;
  };
  fila: Array<{
    id: string;
    destinatario: string;
    mensagem: string;
    tipo: string;
    status: string;
    tentativas: number;
    erro: string | null;
    criadoEm: string;
  }>;
  optOuts: Array<{ telefone: string; motivo: string | null; criadoEm: string | null }>;
}

export function WhatsAppScreen() {
  const { data, loading, erro, recarregar } = useAdminData<WhatsAppPayload>("/api/admin/whatsapp");
  const [fb, setFb] = useState<Feedback | null>(null);
  const [qr, setQr] = useState<{
    qrCodeSvgDataUrl?: string | null;
    qrCodeImagemDataUrl?: string | null;
    pairingCode?: string | null;
    mensagem?: string;
    simulado?: boolean;
  } | null>(null);

  const [cfg, setCfg] = useState({
    minDelaySegundos: "4",
    maxDelaySegundos: "9",
    limiteDiarioWarmup: "30",
    janelaInicio: "08:00",
    janelaFim: "18:00",
  });
  const [testeTel, setTesteTel] = useState("");
  const [testeMsg, setTesteMsg] = useState("Mensagem de teste enviada pelo Portal ADM.");

  useEffect(() => {
    if (data?.config) {
      setCfg({
        minDelaySegundos: String(data.config.minDelaySegundos),
        maxDelaySegundos: String(data.config.maxDelaySegundos),
        limiteDiarioWarmup: String(data.config.limiteDiarioWarmup),
        janelaInicio: data.config.janelaInicio,
        janelaFim: data.config.janelaFim,
      });
    }
  }, [data?.config]);

  const gerarQr = async () => {
    const r = await adminFetch<NonNullable<typeof qr> & { error?: string }>("/api/admin/whatsapp", {
      method: "POST",
      body: { acao: "qrcode" },
    });
    if (r.ok) {
      setQr(r.data);
      if (r.data.mensagem) setFb({ kind: "info", texto: r.data.mensagem });
      await recarregar();
    } else {
      setFb({ kind: "error", texto: r.data?.error || "Falha ao gerar QR Code." });
    }
  };

  const salvarCfg = async () => {
    const r = await adminFetch<{ error?: string }>("/api/admin/whatsapp", {
      method: "POST",
      body: {
        acao: "config",
        minDelaySegundos: Number(cfg.minDelaySegundos),
        maxDelaySegundos: Number(cfg.maxDelaySegundos),
        limiteDiarioWarmup: Number(cfg.limiteDiarioWarmup),
        janelaInicio: cfg.janelaInicio,
        janelaFim: cfg.janelaFim,
      },
    });
    if (r.ok) {
      setFb({ kind: "success", texto: "Parâmetros Anti-Ban atualizados." });
      await recarregar();
    } else {
      setFb({ kind: "error", texto: r.data?.error || "Erro ao salvar parâmetros." });
    }
  };

  const processarFila = async () => {
    const r = await adminFetch<{
      processados?: unknown[];
      motivoBloqueio?: "FORA_DA_JANELA" | "LIMITE_DIARIO_ATINGIDO" | null;
      error?: string;
    }>("/api/admin/whatsapp", {
      method: "POST",
      body: { acao: "processar_fila", limite: 20 },
    });
    if (r.ok) {
      if (r.data.motivoBloqueio === "FORA_DA_JANELA") {
        setFb({ kind: "warning", texto: "Envio pausado: fora da janela permitida (BRT)." });
      } else if (r.data.motivoBloqueio === "LIMITE_DIARIO_ATINGIDO") {
        setFb({ kind: "warning", texto: "Envio pausado: limite diário de warm-up atingido." });
      } else {
        setFb({ kind: "success", texto: `${r.data.processados?.length || 0} mensagem(ns) processada(s) da fila.` });
        await recarregar();
      }
    } else {
      setFb({ kind: "error", texto: r.data?.error || "Erro ao processar fila." });
    }
  };

  const enviarTeste = async () => {
    const r = await adminFetch<{ error?: string }>("/api/admin/whatsapp", {
      method: "POST",
      body: { acao: "teste", destinatario: testeTel, mensagem: testeMsg },
    });
    if (r.ok) {
      setFb({ kind: "success", texto: "Mensagem de teste adicionada à fila com proteção anti-ban." });
      setTesteTel("");
      await recarregar();
    } else {
      setFb({ kind: "error", texto: r.data?.error || "Erro ao enfileirar teste." });
    }
  };

  const removerOptOut = async (telefone: string) => {
    const r = await adminFetch<{ error?: string }>("/api/admin/whatsapp", {
      method: "POST",
      body: { acao: "remover_optout", telefone },
    });
    if (r.ok) {
      setFb({ kind: "info", texto: `Número ${telefone} removido da lista de bloqueio.` });
      await recarregar();
    }
  };

  const qrImg = qr?.qrCodeImagemDataUrl || qr?.qrCodeSvgDataUrl;

  return (
    <div>
      <PageHeader
        titulo="Configuração do WhatsApp & QR Code"
        descricao="Conecte a instância da Evolution API por QR Code, ajuste os intervalos de Jitter Anti-Ban e monitore a fila e os bloqueios de Opt-Out."
        acoes={
          <>
            <Button renderIcon={QrCode} onClick={() => void gerarQr()}>
              Gerar / Atualizar QR Code
            </Button>
            <Button kind="tertiary" renderIcon={Renew} onClick={() => void recarregar()} disabled={loading}>
              Atualizar
            </Button>
          </>
        }
      />

      <FeedbackBar feedback={fb} onClose={() => setFb(null)} />
      {erro ? <p style={{ color: "var(--cds-support-error)" }}>{erro}</p> : null}

      <KpiGrid>
        <KpiTile
          rotulo="INSTÂNCIA EVOLUTION API"
          valor={
            <Tag type={data?.instanciaConectada ? "green" : "red"}>
              {data?.instanciaConectada ? "CONECTADA" : "DESCONECTADA"}
            </Tag>
          }
          detalhe={`${data?.nomeInstancia || "—"} (${data?.provedorConfigurado ? "Chave ativa" : "Modo simulação"})`}
        />
        <KpiTile rotulo="FILA PENDENTE" valor={fmtNum(data?.filaTamanho)} />
        <KpiTile rotulo="ENVIADAS" valor={fmtNum(data?.totalEnviadas)} cor="var(--cds-support-success)" />
        <KpiTile rotulo="OPT-OUTS (SAIR)" valor={fmtNum(data?.totalOptOuts)} />
      </KpiGrid>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        <Tile>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}>Conexão por QR Code</h3>
          {qrImg ? (
            <div style={{ textAlign: "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrImg} alt="QR Code WhatsApp" style={{ width: 220, height: 220, border: "1px solid var(--cds-border-subtle-01)" }} />
              {qr?.pairingCode ? <p style={{ marginTop: "0.5rem" }}>Código de pareamento: <strong>{qr.pairingCode}</strong></p> : null}
              <p style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)", marginTop: "0.5rem" }}>{qr?.mensagem}</p>
            </div>
          ) : (
            <p style={{ color: "var(--cds-text-secondary)" }}>
              Clique em <strong>Gerar / Atualizar QR Code</strong> para parear o número comercial da empresa no WhatsApp.
            </p>
          )}
        </Tile>

        <Tile>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}>Parâmetros Anti-Ban & Jitter Humano</h3>
          <div style={{ display: "grid", gap: "0.75rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <TextInput id="wa-min" labelText="Delay mínimo (s)" type="number" value={cfg.minDelaySegundos} onChange={(e) => setCfg({ ...cfg, minDelaySegundos: e.target.value })} />
              <TextInput id="wa-max" labelText="Delay máximo (s)" type="number" value={cfg.maxDelaySegundos} onChange={(e) => setCfg({ ...cfg, maxDelaySegundos: e.target.value })} />
              <TextInput id="wa-warmup" labelText="Limite diário (warm-up)" type="number" value={cfg.limiteDiarioWarmup} onChange={(e) => setCfg({ ...cfg, limiteDiarioWarmup: e.target.value })} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                <TextInput id="wa-ini" labelText="Início" value={cfg.janelaInicio} onChange={(e) => setCfg({ ...cfg, janelaInicio: e.target.value })} />
                <TextInput id="wa-fim" labelText="Fim" value={cfg.janelaFim} onChange={(e) => setCfg({ ...cfg, janelaFim: e.target.value })} />
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <Button onClick={() => void salvarCfg()}>Salvar parâmetros</Button>
              <Button kind="secondary" renderIcon={SendAlt} onClick={() => void processarFila()}>
                Processar fila agora
              </Button>
            </div>
          </div>
        </Tile>

        <Tile>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}>Disparo de Teste</h3>
          <div style={{ display: "grid", gap: "0.75rem" }}>
            <TextInput id="wa-teste-tel" labelText="Telefone destino (DDD + número)" placeholder="(62) 99999-0000" value={testeTel} onChange={(e) => setTesteTel(maskPhone(e.target.value))} />
            <TextInput id="wa-teste-msg" labelText="Mensagem" value={testeMsg} onChange={(e) => setTesteMsg(e.target.value)} />
            <Button kind="tertiary" renderIcon={SendAlt} disabled={!testeTel.trim()} onClick={() => void enviarTeste()}>
              Enfileirar mensagem de teste
            </Button>
          </div>
        </Tile>
      </div>

      <Tabs>
        <TabList aria-label="Listas do WhatsApp" contained>
          <Tab>Fila de Mensagens ({data?.fila?.length || 0})</Tab>
          <Tab>Bloqueios Opt-Out ({data?.optOuts?.length || 0})</Tab>
        </TabList>
        <TabPanels>
          <TabPanel>
            <AdminTable
              titulo="Últimas mensagens na fila"
              colunas={[
                { key: "dest", header: "Destinatário" },
                { key: "tipo", header: "Tipo" },
                { key: "msg", header: "Mensagem" },
                { key: "status", header: "Status" },
                { key: "data", header: "Criada em" },
              ]}
              linhas={(data?.fila || []).map((f) => ({
                id: f.id,
                dest: f.destinatario,
                tipo: <Tag type="blue">{f.tipo}</Tag>,
                msg: f.mensagem.slice(0, 120),
                status: <Tag type={f.status === "ENVIADO" ? "green" : f.status === "FALHA" ? "red" : "warm-gray"}>{f.status}</Tag>,
                data: fmtData(f.criadoEm),
              }))}
            />
          </TabPanel>
          <TabPanel>
            <AdminTable
              titulo="Números que responderam SAIR (Opt-Out)"
              colunas={[
                { key: "tel", header: "Telefone" },
                { key: "motivo", header: "Motivo" },
                { key: "data", header: "Registrado em" },
                { key: "acoes", header: "" },
              ]}
              linhas={(data?.optOuts || []).map((o) => ({
                id: o.telefone,
                tel: o.telefone,
                motivo: o.motivo || "—",
                data: fmtData(o.criadoEm),
                acoes: (
                  <Button size="sm" kind="ghost" onClick={() => void removerOptOut(o.telefone)}>
                    Reativar número
                  </Button>
                ),
              }))}
            />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </div>
  );
}


"use client";

import React, { useState } from "react";
import {
  Button,
  Modal,
  Search,
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
} from "@carbon/react";
import { Add, CloudDownload, Renew, TrashCan } from "@carbon/icons-react";
import type { SuperAdminTenantItem } from "@/server/schemas/superadmin.schema";
import {
  AdminTable,
  FeedbackBar,
  PageHeader,
  adminFetch,
  fmtBRL,
  fmtData,
  fmtDia,
  fmtNum,
  useAdminData,
  type Feedback,
} from "../admin-ui";

interface LicitacaoItem {
  id: string;
  idPncp: string;
  numeroEdital: string;
  orgaoNome: string;
  uf: string;
  municipio: string | null;
  modalidade: string;
  miniResumo: string;
  valorEstimado: number;
  dataAbertura: string;
  parecerIA: string;
  status: string;
  manual: boolean;
}

interface ExecucaoPncp {
  id: string;
  origem: string;
  dataInicial: string;
  dataFinal: string;
  totalConsultadoPncp: number;
  totalElegiveis: number;
  criados: number;
  atualizados: number;
  status: string;
  duracaoMs: number;
  executadoEm: string;
  erro: string | null;
}

interface LicitacoesPayload {
  licitacoes: LicitacaoItem[];
  execucoes: ExecucaoPncp[];
}

export function LicitacoesAdminScreen() {
  const [busca, setBusca] = useState("");
  const url = busca.trim() ? `/api/admin/licitacoes?busca=${encodeURIComponent(busca.trim())}` : "/api/admin/licitacoes";
  const { data, loading, erro, recarregar } = useAdminData<LicitacoesPayload>(url);
  const { data: tenants } = useAdminData<SuperAdminTenantItem[]>("/api/admin/tenants");
  const [fb, setFb] = useState<Feedback | null>(null);

  const [modalManual, setModalManual] = useState<{
    numeroEdital: string;
    orgaoNome: string;
    orgaoCnpj: string;
    uf: string;
    municipio: string;
    modalidade: string;
    miniResumo: string;
    resumo: string;
    valorEstimado: string;
    dataAbertura: string;
    linkSistemaOrigem: string;
    parecerIA: "GO" | "AVALIAR" | "NO_GO";
    injetarParaTenantId: string;
    statusKanbanInicial: string;
  } | null>(null);

  const [modalInjetar, setModalInjetar] = useState<{
    licitacao: LicitacaoItem;
    tenantId: string;
    statusKanban: string;
    notas: string;
  } | null>(null);

  const [modalLote, setModalLote] = useState(false);
  const [jsonLote, setJsonLote] = useState("[]");

  const salvarManual = async () => {
    if (!modalManual) return;
    const r = await adminFetch<{ error?: string; licitacao?: { numeroEdital: string } }>("/api/admin/licitacoes", {
      method: "POST",
      body: {
        acao: "salvar",
        ...modalManual,
        valorEstimado: Number(modalManual.valorEstimado) || 0,
        dataAbertura: modalManual.dataAbertura
          ? new Date(modalManual.dataAbertura).toISOString()
          : new Date(Date.now() + 7 * 86400000).toISOString(),
        linkSistemaOrigem: modalManual.linkSistemaOrigem || null,
        injetarParaTenantId: modalManual.injetarParaTenantId || null,
      },
    });
    if (r.ok) {
      setFb({ kind: "success", texto: `Licitação ${r.data.licitacao?.numeroEdital || ""} salva no catálogo.` });
      setModalManual(null);
      await recarregar();
    } else {
      setFb({ kind: "error", texto: r.data?.error || "Erro ao cadastrar licitação." });
    }
  };

  const injetar = async () => {
    if (!modalInjetar || !modalInjetar.tenantId) return;
    const r = await adminFetch<{ error?: string }>("/api/admin/licitacoes", {
      method: "POST",
      body: {
        acao: "injetar",
        licitacaoId: modalInjetar.licitacao.id,
        tenantId: modalInjetar.tenantId,
        statusKanban: modalInjetar.statusKanban,
        notas: modalInjetar.notas || undefined,
      },
    });
    if (r.ok) {
      setFb({ kind: "success", texto: `Edital ${modalInjetar.licitacao.numeroEdital} injetado no Kanban do cliente.` });
      setModalInjetar(null);
    } else {
      setFb({ kind: "error", texto: r.data?.error || "Erro ao injetar licitação." });
    }
  };

  const excluir = async (id: string) => {
    const r = await adminFetch<{ error?: string }>("/api/admin/licitacoes", {
      method: "POST",
      body: { acao: "excluir", id },
    });
    if (r.ok) {
      setFb({ kind: "info", texto: "Licitação removida do catálogo." });
      await recarregar();
    } else {
      setFb({ kind: "error", texto: r.data?.error || "Não foi possível excluir." });
    }
  };

  const importarLote = async () => {
    let itens: unknown[] = [];
    try {
      itens = JSON.parse(jsonLote);
      if (!Array.isArray(itens)) throw new Error("JSON deve ser um array.");
    } catch (e: unknown) {
      setFb({ kind: "error", texto: `JSON inválido: ${e instanceof Error ? e.message : "formato inválido"}` });
      return;
    }
    const r = await adminFetch<{ total?: number; error?: string }>("/api/admin/licitacoes", {
      method: "POST",
      body: { acao: "importar_lote", itens },
    });
    if (r.ok) {
      setFb({ kind: "success", texto: `Lote processado (${r.data.total ?? itens.length} item(ns)).` });
      setModalLote(false);
      await recarregar();
    } else {
      setFb({ kind: "error", texto: r.data?.error || "Erro ao importar lote." });
    }
  };

  const sincronizarPncp = async () => {
    setFb({ kind: "info", texto: "Sincronização com o PNCP iniciada..." });
    const r = await adminFetch<{ criados?: number; atualizados?: number; error?: string }>("/api/admin/licitacoes", {
      method: "POST",
      body: { acao: "sincronizar_pncp", diasRetroativos: 1 },
    });
    if (r.ok) {
      setFb({ kind: "success", texto: `PNCP sincronizado: ${r.data.criados ?? 0} criada(s), ${r.data.atualizados ?? 0} atualizada(s).` });
      await recarregar();
    } else {
      setFb({ kind: "error", texto: r.data?.error || "Erro ao sincronizar PNCP." });
    }
  };

  const licitacoes = data?.licitacoes || [];
  const execucoes = data?.execucoes || [];

  return (
    <div>
      <PageHeader
        titulo="Catálogo de Licitações, Injeção Manual & PNCP"
        descricao="Cadastre editais manualmente, importe em lote, injete diretamente no Kanban de um cliente ou acione a coleta oficial do PNCP."
        acoes={
          <>
            <Button
              renderIcon={Add}
              onClick={() =>
                setModalManual({
                  numeroEdital: "",
                  orgaoNome: "",
                  orgaoCnpj: "00.000.000/0001-00",
                  uf: "GO",
                  municipio: "",
                  modalidade: "Pregão Eletrônico",
                  miniResumo: "",
                  resumo: "",
                  valorEstimado: "0",
                  dataAbertura: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16),
                  linkSistemaOrigem: "",
                  parecerIA: "GO",
                  injetarParaTenantId: "",
                  statusKanbanInicial: "PENDENTE",
                })
              }
            >
              Cadastrar na mão
            </Button>
            <Button kind="tertiary" onClick={() => setModalLote(true)}>
              Importar lote JSON
            </Button>
            <Button kind="secondary" renderIcon={CloudDownload} onClick={() => void sincronizarPncp()}>
              Sincronizar PNCP agora
            </Button>
            <Button kind="ghost" renderIcon={Renew} onClick={() => void recarregar()} disabled={loading}>
              Atualizar
            </Button>
          </>
        }
      />

      <FeedbackBar feedback={fb} onClose={() => setFb(null)} />
      {erro ? <p style={{ color: "var(--cds-support-error)" }}>{erro}</p> : null}

      <Tabs>
        <TabList aria-label="Catálogo e PNCP" contained>
          <Tab>Catálogo Global ({licitacoes.length})</Tab>
          <Tab>Execuções do PNCP ({execucoes.length})</Tab>
        </TabList>
        <TabPanels>
          <TabPanel>
            <div style={{ margin: "1rem 0", maxWidth: "32rem" }}>
              <Search
                size="md"
                labelText="Buscar edital"
                placeholder="Número do edital, órgão, resumo ou ID PNCP"
                value={busca}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBusca(e.target.value)}
                onClear={() => setBusca("")}
              />
            </div>
            <AdminTable
              titulo="Licitações no catálogo global"
              colunas={[
                { key: "edital", header: "Edital / Órgão" },
                { key: "local", header: "UF / Município" },
                { key: "objeto", header: "Objeto" },
                { key: "valor", header: "Valor" },
                { key: "abertura", header: "Abertura" },
                { key: "acoes", header: "Ações" },
              ]}
              vazio={loading ? "Carregando..." : "Nenhuma licitação encontrada."}
              linhas={licitacoes.map((l) => ({
                id: l.id,
                edital: (
                  <div>
                    <strong>{l.numeroEdital}</strong>{" "}
                    {l.manual ? <Tag size="sm" type="purple">Manual</Tag> : null}
                    <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>{l.orgaoNome}</div>
                  </div>
                ),
                local: `${l.municipio ? `${l.municipio}/` : ""}${l.uf}`,
                objeto: (
                  <div>
                    <div>{l.miniResumo}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>ID: {l.id}</div>
                  </div>
                ),
                valor: fmtBRL(l.valorEstimado),
                abertura: fmtDia(l.dataAbertura),
                acoes: (
                  <div style={{ display: "flex", gap: "0.35rem" }}>
                    <Button
                      size="sm"
                      kind="tertiary"
                      onClick={() =>
                        setModalInjetar({
                          licitacao: l,
                          tenantId: tenants?.[0]?.id || "",
                          statusKanban: "PENDENTE",
                          notas: "Oportunidade enviada pelo Portal ADM",
                        })
                      }
                    >
                      Injetar p/ cliente
                    </Button>
                    <Button
                      size="sm"
                      kind="danger--ghost"
                      hasIconOnly
                      iconDescription="Excluir"
                      renderIcon={TrashCan}
                      onClick={() => void excluir(l.id)}
                    />
                  </div>
                ),
              }))}
            />
          </TabPanel>

          <TabPanel>
            <AdminTable
              titulo="Histórico de coletas PNCP"
              colunas={[
                { key: "quando", header: "Executado em" },
                { key: "origem", header: "Origem" },
                { key: "janela", header: "Janela" },
                { key: "numeros", header: "Consultadas / Elegíveis" },
                { key: "gravacao", header: "Criadas / Atualizadas" },
                { key: "status", header: "Status" },
              ]}
              linhas={execucoes.map((ex) => ({
                id: ex.id,
                quando: fmtData(ex.executadoEm),
                origem: <Tag type="blue">{ex.origem}</Tag>,
                janela: `${ex.dataInicial} → ${ex.dataFinal}`,
                numeros: `${fmtNum(ex.totalConsultadoPncp)} / ${fmtNum(ex.totalElegiveis)}`,
                gravacao: `${fmtNum(ex.criados)} / ${fmtNum(ex.atualizados)}`,
                status: (
                  <div>
                    <Tag type={ex.status === "CONCLUIDO" ? "green" : ex.status === "PARCIAL" ? "warm-gray" : "red"}>
                      {ex.status}
                    </Tag>
                    <span style={{ fontSize: "0.75rem", marginLeft: "0.4rem" }}>{ex.duracaoMs}ms</span>
                    {ex.erro ? <div style={{ fontSize: "0.7rem", color: "var(--cds-support-error)" }}>{ex.erro}</div> : null}
                  </div>
                ),
              }))}
            />
          </TabPanel>
        </TabPanels>
      </Tabs>

      <Modal
        open={modalManual !== null}
        modalHeading="Cadastrar licitação manualmente (e opcionalmente injetar no cliente)"
        primaryButtonText="Salvar"
        secondaryButtonText="Cancelar"
        onRequestClose={() => setModalManual(null)}
        onRequestSubmit={() => void salvarManual()}
      >
        {modalManual ? (
          <div style={{ display: "grid", gap: "0.75rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 5rem", gap: "0.75rem" }}>
              <TextInput id="lic-num" labelText="Número do edital" value={modalManual.numeroEdital} onChange={(e) => setModalManual({ ...modalManual, numeroEdital: e.target.value })} />
              <TextInput id="lic-uf" labelText="UF" maxLength={2} value={modalManual.uf} onChange={(e) => setModalManual({ ...modalManual, uf: e.target.value.toUpperCase() })} />
            </div>
            <TextInput id="lic-orgao" labelText="Órgão comprador" value={modalManual.orgaoNome} onChange={(e) => setModalManual({ ...modalManual, orgaoNome: e.target.value })} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <TextInput id="lic-mun" labelText="Município" value={modalManual.municipio} onChange={(e) => setModalManual({ ...modalManual, municipio: e.target.value })} />
              <TextInput id="lic-mod" labelText="Modalidade" value={modalManual.modalidade} onChange={(e) => setModalManual({ ...modalManual, modalidade: e.target.value })} />
            </div>
            <TextInput id="lic-mini" labelText="Título / Mini-resumo" value={modalManual.miniResumo} onChange={(e) => setModalManual({ ...modalManual, miniResumo: e.target.value })} />
            <TextArea id="lic-res" labelText="Objeto completo" value={modalManual.resumo} onChange={(e) => setModalManual({ ...modalManual, resumo: e.target.value })} rows={3} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <TextInput id="lic-val" labelText="Valor estimado (R$)" type="number" value={modalManual.valorEstimado} onChange={(e) => setModalManual({ ...modalManual, valorEstimado: e.target.value })} />
              <TextInput id="lic-ab" labelText="Data de abertura" type="datetime-local" value={modalManual.dataAbertura} onChange={(e) => setModalManual({ ...modalManual, dataAbertura: e.target.value })} />
            </div>
            <Select id="lic-tnt" labelText="Injetar direto para um cliente (opcional)" value={modalManual.injetarParaTenantId} onChange={(e) => setModalManual({ ...modalManual, injetarParaTenantId: e.target.value })}>
              <SelectItem value="" text="Somente catálogo global" />
              {(tenants || []).map((t) => (
                <SelectItem key={t.id} value={t.id} text={`${t.nomeFantasia || t.razaoSocial} (${t.cnpj})`} />
              ))}
            </Select>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={modalInjetar !== null}
        modalHeading={modalInjetar ? `Injetar ${modalInjetar.licitacao.numeroEdital}` : ""}
        primaryButtonText="Injetar no Kanban"
        secondaryButtonText="Cancelar"
        onRequestClose={() => setModalInjetar(null)}
        onRequestSubmit={() => void injetar()}
      >
        {modalInjetar ? (
          <div style={{ display: "grid", gap: "1rem" }}>
            <Select id="inj-tnt" labelText="Cliente destino" value={modalInjetar.tenantId} onChange={(e) => setModalInjetar({ ...modalInjetar, tenantId: e.target.value })}>
              {(tenants || []).map((t) => (
                <SelectItem key={t.id} value={t.id} text={`${t.nomeFantasia || t.razaoSocial} (${t.cnpj})`} />
              ))}
            </Select>
            <Select id="inj-col" labelText="Coluna inicial do Kanban" value={modalInjetar.statusKanban} onChange={(e) => setModalInjetar({ ...modalInjetar, statusKanban: e.target.value })}>
              {["PENDENTE", "ACEITA", "ANALISE_TECNICA", "REVISAO_PROPOSTA", "EM_DISPUTA"].map((s) => (
                <SelectItem key={s} value={s} text={s.replace(/_/g, " ")} />
              ))}
            </Select>
            <TextInput id="inj-notas" labelText="Observação para o cliente" value={modalInjetar.notas} onChange={(e) => setModalInjetar({ ...modalInjetar, notas: e.target.value })} />
          </div>
        ) : null}
      </Modal>

      <Modal
        open={modalLote}
        modalHeading="Importar lote JSON de licitações"
        primaryButtonText="Importar"
        secondaryButtonText="Cancelar"
        onRequestClose={() => setModalLote(false)}
        onRequestSubmit={() => void importarLote()}
      >
        <TextArea
          id="lic-lote-json"
          labelText='Array JSON ([{ "numeroEdital", "orgaoNome", "uf", "miniResumo", "resumo", "valorEstimado", "dataAbertura" }])'
          value={jsonLote}
          onChange={(e) => setJsonLote(e.target.value)}
          rows={8}
        />
      </Modal>
    </div>
  );
}


"use client";

import React, { useMemo, useState } from "react";
import {
  Button,
  Checkbox,
  Modal,
  Select,
  SelectItem,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Tag,
  TextInput,
} from "@carbon/react";
import {
  Add,
  CheckmarkOutline,
  Copy,
  Document,
  Edit,
  Money,
  Renew,
  Upload,
  UserFollow,
} from "@carbon/icons-react";
import { maskCnpj, maskCpf, maskPhone, sanitizeEmail } from "@/lib/masks";
import { ASAAS_PLAN_PRICES_BRL } from "@/server/schemas/asaas.schema";
import type { SuperAdminTenantItem } from "@/server/schemas/superadmin.schema";
import {
  AdminTable,
  FeedbackBar,
  KpiGrid,
  KpiTile,
  PageHeader,
  adminFetch,
  fmtBRL,
  fmtDia,
  fmtNum,
  useAdminData,
  type Feedback,
} from "../admin-ui";

interface IndicadoDetalhe {
  id: string;
  nome: string;
  cnpj?: string;
  plano?: string;
  billingStatus?: string;
  valorBasePlano?: number;
  valorComissao?: number;
  criadoEm?: string;
}

interface AfiliadoItem {
  id: string;
  nome: string;
  documento: string | null;
  email: string;
  telefone: string | null;
  chavePix: string | null;
  codigo: string;
  percentualComissao: number;
  tipoComissao: string;
  descontoIndicadosPct: number;
  diasExtrasTrial: number;
  ativo: boolean;
  linkIndicacao: string;
  totalIndicados: number;
  indicados: IndicadoDetalhe[];
  comissaoPendenteBrl: number;
  comissaoPagaBrl: number;
}

interface ComissaoItem {
  id: string;
  affiliateId: string;
  tenantId: string | null;
  tenantNome: string | null;
  competenciaMes: string;
  valorBasePlano: number;
  percentualAplicado: number;
  valorComissao: number;
  status: string;
  pagoEm: string | null;
  comprovanteObs: string | null;
  quantidadeIndicados?: number;
  clientesRelatorio?: IndicadoDetalhe[];
  dataInicio?: string | null;
  dataFim?: string | null;
  comprovanteDataUrl?: string | null;
  comprovanteNome?: string | null;
  comprovanteMimeType?: string | null;
  criadoEm?: string;
}

interface AfiliadosPayload {
  afiliados: AfiliadoItem[];
  comissoes: ComissaoItem[];
}

export function AfiliadosScreen() {
  const { data, loading, erro, recarregar } = useAdminData<AfiliadosPayload>("/api/admin/afiliados");
  const { data: tenants } = useAdminData<SuperAdminTenantItem[]>("/api/admin/tenants");
  const [fb, setFb] = useState<Feedback | null>(null);

  const [formAff, setFormAff] = useState<{
    id?: string;
    nome: string;
    documento: string;
    email: string;
    telefone: string;
    chavePix: string;
    codigo: string;
    percentualComissao: string;
    tipoComissao: "RECORRENTE" | "PRIMEIRA_MENSALIDADE";
    descontoIndicadosPct: string;
    diasExtrasTrial: string;
    ativo: boolean;
  } | null>(null);

  const [vincular, setVincular] = useState<{ affiliateId: string; affiliateNome: string; tenantId: string } | null>(
    null,
  );

  // Modal Registrar Pagamento
  const [modalPagamento, setModalPagamento] = useState<{
    affiliateId: string;
    competenciaMes: string;
    dataInicio: string;
    dataFim: string;
    valorPagoCustom: string;
    comprovanteObs: string;
    comprovanteDataUrl: string | null;
    comprovanteNome: string | null;
    comprovanteMimeType: string | null;
  } | null>(null);
  const [dragOverComprovante, setDragOverComprovante] = useState(false);

  // Filtros de data na aba Repasses & Comissões
  const [filtroCompetencia, setFiltroCompetencia] = useState("");
  const [filtroDataInicio, setFiltroDataInicio] = useState("");
  const [filtroDataFim, setFiltroDataFim] = useState("");

  // Modal Relatório da Comissão
  const [relatorioComissao, setRelatorioComissao] = useState<ComissaoItem | null>(null);

  const afiliados = data?.afiliados || [];
  const comissoes = data?.comissoes || [];

  const totais = useMemo(() => {
    const ativos = afiliados.filter((a) => a.ativo).length;
    const indicados = afiliados.reduce((s, a) => s + a.totalIndicados, 0);
    const pendente = comissoes.filter((c) => c.status === "PENDENTE").reduce((s, c) => s + c.valorComissao, 0);
    const pago = comissoes.filter((c) => c.status === "PAGO").reduce((s, c) => s + c.valorComissao, 0);
    return { ativos, indicados, pendente, pago };
  }, [afiliados, comissoes]);

  const nomeAfiliado = useMemo(() => new Map(afiliados.map((a) => [a.id, a.nome])), [afiliados]);
  const mapaAfiliados = useMemo(() => new Map(afiliados.map((a) => [a.id, a])), [afiliados]);

  // Cálculo dinâmico de clientes indicados e valor de pagamento no Modal "Registrar pagamento"
  const resumoPagamentoModal = useMemo(() => {
    if (!modalPagamento) return { clientes: [] as IndicadoDetalhe[], valorBase: 0, valorCalculado: 0, percentual: 20 };
    const af = mapaAfiliados.get(modalPagamento.affiliateId) || afiliados[0];
    if (!af) return { clientes: [] as IndicadoDetalhe[], valorBase: 0, valorCalculado: 0, percentual: 20 };

    const dtIni = modalPagamento.dataInicio ? new Date(`${modalPagamento.dataInicio}T00:00:00.000Z`).getTime() : null;
    const dtFim = modalPagamento.dataFim ? new Date(`${modalPagamento.dataFim}T23:59:59.999Z`).getTime() : null;

    const filtrados = (af.indicados || []).filter((ind) => {
      if (!dtIni && !dtFim) return true;
      if (!ind.criadoEm) return true;
      const ts = new Date(ind.criadoEm).getTime();
      if (dtIni && !Number.isNaN(dtIni) && ts < dtIni) return false;
      if (dtFim && !Number.isNaN(dtFim) && ts > dtFim) return false;
      return true;
    });

    const valorBase = filtrados.reduce(
      (acc, ind) => acc + (ind.valorBasePlano ?? ASAAS_PLAN_PRICES_BRL.PRO),
      0,
    );
    const valorCalculado = Math.round(valorBase * (af.percentualComissao / 100) * 100) / 100;
    return {
      clientes: filtrados,
      valorBase,
      valorCalculado,
      percentual: af.percentualComissao,
    };
  }, [modalPagamento, mapaAfiliados, afiliados]);

  // Filtro de comissões por período/competência na aba Repasses & Comissões
  const comissoesFiltradas = useMemo(() => {
    return comissoes.filter((c) => {
      if (filtroCompetencia && c.competenciaMes !== filtroCompetencia) return false;
      const dataRefStr = c.pagoEm || c.criadoEm || (c.competenciaMes ? `${c.competenciaMes}-01` : "");
      if ((filtroDataInicio || filtroDataFim) && dataRefStr) {
        const ts = new Date(dataRefStr).getTime();
        if (filtroDataInicio) {
          const ini = new Date(`${filtroDataInicio}T00:00:00.000Z`).getTime();
          if (!Number.isNaN(ini) && ts < ini) return false;
        }
        if (filtroDataFim) {
          const fim = new Date(`${filtroDataFim}T23:59:59.999Z`).getTime();
          if (!Number.isNaN(fim) && ts > fim) return false;
        }
      }
      return true;
    });
  }, [comissoes, filtroCompetencia, filtroDataInicio, filtroDataFim]);

  const processarArquivoComprovante = (file: File | undefined | null) => {
    if (!file || !modalPagamento) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : null;
      setModalPagamento((prev) =>
        prev
          ? {
              ...prev,
              comprovanteDataUrl: dataUrl,
              comprovanteNome: file.name,
              comprovanteMimeType: file.type || "application/pdf",
            }
          : null,
      );
    };
    reader.readAsDataURL(file);
  };

  const registrarPagamentoAfiliado = async () => {
    if (!modalPagamento || !modalPagamento.affiliateId) return;
    const valorFinal = modalPagamento.valorPagoCustom
      ? Number(modalPagamento.valorPagoCustom.replace(",", "."))
      : resumoPagamentoModal.valorCalculado;

    const r = await adminFetch<{ error?: string }>("/api/admin/afiliados", {
      method: "POST",
      body: {
        tipo: "registrar_pagamento",
        affiliateId: modalPagamento.affiliateId,
        competenciaMes: modalPagamento.competenciaMes || undefined,
        dataInicio: modalPagamento.dataInicio || null,
        dataFim: modalPagamento.dataFim || null,
        valorPago: Number.isFinite(valorFinal) && valorFinal > 0 ? valorFinal : undefined,
        comprovanteObs: modalPagamento.comprovanteObs || null,
        comprovanteDataUrl: modalPagamento.comprovanteDataUrl,
        comprovanteNome: modalPagamento.comprovanteNome,
        comprovanteMimeType: modalPagamento.comprovanteMimeType,
      },
    });

    if (r.ok) {
      setFb({ kind: "success", texto: "Pagamento de comissão registrado com sucesso." });
      setModalPagamento(null);
      await recarregar();
    } else {
      setFb({ kind: "error", texto: r.data?.error || "Erro ao registrar pagamento do afiliado." });
    }
  };

  const salvarAfiliado = async () => {
    if (!formAff) return;
    const r = await adminFetch<{ error?: string }>("/api/admin/afiliados", {
      method: "POST",
      body: {
        tipo: "afiliado",
        id: formAff.id || undefined,
        nome: formAff.nome,
        documento: formAff.documento || null,
        email: sanitizeEmail(formAff.email),
        telefone: formAff.telefone || null,
        chavePix: formAff.chavePix || null,
        codigo: formAff.codigo,
        percentualComissao: Number(formAff.percentualComissao) || 20,
        tipoComissao: formAff.tipoComissao,
        descontoIndicadosPct: Number(formAff.descontoIndicadosPct) || 0,
        diasExtrasTrial: Number(formAff.diasExtrasTrial) || 0,
        ativo: formAff.ativo,
      },
    });
    if (r.ok) {
      setFb({ kind: "success", texto: "Afiliado salvo com sucesso." });
      setFormAff(null);
      await recarregar();
    } else {
      setFb({ kind: "error", texto: r.data?.error || "Erro ao salvar afiliado." });
    }
  };

  const vincularCliente = async () => {
    if (!vincular || !vincular.tenantId) return;
    const r = await adminFetch<{ error?: string }>("/api/admin/afiliados", {
      method: "POST",
      body: { tipo: "vincular", tenantId: vincular.tenantId, affiliateId: vincular.affiliateId },
    });
    if (r.ok) {
      setFb({ kind: "success", texto: "Cliente vinculado ao afiliado." });
      setVincular(null);
      await recarregar();
    } else {
      setFb({ kind: "error", texto: r.data?.error || "Erro ao vincular cliente." });
    }
  };

  const marcarPago = async (commissionId: string) => {
    const r = await adminFetch<{ error?: string }>("/api/admin/afiliados", {
      method: "POST",
      body: { tipo: "comissao", commissionId, status: "PAGO", comprovanteObs: "PIX liquidado via Portal ADM" },
    });
    if (r.ok) {
      setFb({ kind: "success", texto: "Comissão marcada como paga (PIX)." });
      await recarregar();
    } else {
      setFb({ kind: "error", texto: r.data?.error || "Erro ao atualizar comissão." });
    }
  };

  const copiarLink = async (link: string) => {
    const full = typeof window !== "undefined" ? `${window.location.origin}${link}` : link;
    try {
      await navigator.clipboard.writeText(full);
      setFb({ kind: "info", texto: `Link copiado: ${full}` });
    } catch {
      setFb({ kind: "info", texto: `Link de indicação: ${full}` });
    }
  };

  return (
    <div>
      <PageHeader
        titulo="Controle de Afiliados & Comissões PIX"
        descricao="Cadastre parceiros indicadores, gere links rastreáveis (?ref=CODIGO), vincule clientes indicados e controle o pagamento mensal de comissões."
        acoes={
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
            <Button
              renderIcon={Add}
              onClick={() =>
                setFormAff({
                  nome: "",
                  documento: "",
                  email: "",
                  telefone: "",
                  chavePix: "",
                  codigo: "",
                  percentualComissao: "20",
                  tipoComissao: "RECORRENTE",
                  descontoIndicadosPct: "10",
                  diasExtrasTrial: "7",
                  ativo: true,
                })
              }
            >
              Novo afiliado
            </Button>
            <Button
              data-testid="btn-registrar-pagamento-afiliado"
              renderIcon={Money}
              style={{
                backgroundColor: "var(--cds-support-success, #24a148)",
                borderColor: "var(--cds-support-success, #24a148)",
                color: "#ffffff",
              }}
              onClick={() =>
                setModalPagamento({
                  affiliateId: afiliados[0]?.id || "",
                  competenciaMes: new Date().toISOString().slice(0, 7),
                  dataInicio: "",
                  dataFim: "",
                  valorPagoCustom: "",
                  comprovanteObs: "",
                  comprovanteDataUrl: null,
                  comprovanteNome: null,
                  comprovanteMimeType: null,
                })
              }
            >
              Registrar pagamento
            </Button>
            <Button kind="tertiary" renderIcon={Renew} onClick={() => void recarregar()} disabled={loading}>
              Atualizar
            </Button>
          </div>
        }
      />

      <FeedbackBar feedback={fb} onClose={() => setFb(null)} />
      {erro ? <p style={{ color: "var(--cds-support-error)" }}>{erro}</p> : null}

      <KpiGrid>
        <KpiTile rotulo="AFILIADOS ATIVOS" valor={fmtNum(totais.ativos)} />
        <KpiTile rotulo="CLIENTES INDICADOS" valor={fmtNum(totais.indicados)} />
        <KpiTile rotulo="COMISSÕES PENDENTES" valor={fmtBRL(totais.pendente)} cor="var(--cds-support-warning)" />
        <KpiTile rotulo="COMISSÕES PAGAS" valor={fmtBRL(totais.pago)} cor="var(--cds-support-success)" />
      </KpiGrid>

      <Tabs>
        <TabList aria-label="Visões de afiliados" contained>
          <Tab>Afiliados ({afiliados.length})</Tab>
          <Tab>Repasses & Comissões ({comissoes.length})</Tab>
        </TabList>
        <TabPanels>
          <TabPanel>
            <AdminTable
              titulo="Parceiros afiliados"
              colunas={[
                { key: "nome", header: "Afiliado" },
                { key: "codigo", header: "Código & Link" },
                { key: "regra", header: "Comissão" },
                { key: "pix", header: "Chave PIX" },
                { key: "indicados", header: "Indicados" },
                { key: "valores", header: "Pendente / Pago" },
                { key: "acoes", header: "Ações" },
              ]}
              vazio={loading ? "Carregando..." : "Nenhum afiliado cadastrado."}
              linhas={afiliados.map((a) => ({
                id: a.id,
                nome: (
                  <div>
                    <strong>{a.nome}</strong>
                    <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                      {a.email} {a.telefone ? `• ${a.telefone}` : ""}
                    </div>
                  </div>
                ),
                codigo: (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <Tag type="purple">{a.codigo}</Tag>
                    <Button size="sm" kind="ghost" hasIconOnly iconDescription="Copiar link" renderIcon={Copy} onClick={() => void copiarLink(a.linkIndicacao)} />
                  </div>
                ),
                regra: (
                  <div>
                    <strong>{a.percentualComissao}%</strong> ({a.tipoComissao === "RECORRENTE" ? "Recorrente" : "1ª mensalidade"})
                    <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                      +{a.diasExtrasTrial}d trial • {a.descontoIndicadosPct}% desc. indicado
                    </div>
                  </div>
                ),
                pix: a.chavePix || "—",
                indicados: (
                  <div>
                    <strong>{a.totalIndicados}</strong> cliente(s)
                    {a.indicados.slice(0, 2).map((ind) => (
                      <div key={ind.id} style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                        {ind.nome}
                      </div>
                    ))}
                  </div>
                ),
                valores: (
                  <div>
                    <div style={{ color: "var(--cds-support-warning)" }}>Pend: {fmtBRL(a.comissaoPendenteBrl)}</div>
                    <div style={{ color: "var(--cds-support-success)" }}>Pago: {fmtBRL(a.comissaoPagaBrl)}</div>
                  </div>
                ),
                acoes: (
                  <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                    <Button
                      size="sm"
                      kind="tertiary"
                      renderIcon={UserFollow}
                      onClick={() =>
                        setVincular({
                          affiliateId: a.id,
                          affiliateNome: a.nome,
                          tenantId: tenants?.[0]?.id || "",
                        })
                      }
                    >
                      Vincular cliente
                    </Button>
                    <Button
                      size="sm"
                      kind="ghost"
                      renderIcon={Edit}
                      onClick={() =>
                        setFormAff({
                          id: a.id,
                          nome: a.nome,
                          documento: a.documento || "",
                          email: a.email,
                          telefone: a.telefone || "",
                          chavePix: a.chavePix || "",
                          codigo: a.codigo,
                          percentualComissao: String(a.percentualComissao),
                          tipoComissao: a.tipoComissao === "PRIMEIRA_MENSALIDADE" ? "PRIMEIRA_MENSALIDADE" : "RECORRENTE",
                          descontoIndicadosPct: String(a.descontoIndicadosPct),
                          diasExtrasTrial: String(a.diasExtrasTrial),
                          ativo: a.ativo,
                        })
                      }
                    >
                      Editar
                    </Button>
                  </div>
                ),
              }))}
            />
          </TabPanel>

          <TabPanel>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "0.75rem",
                padding: "0.75rem 0",
                alignItems: "end",
              }}
            >
              <TextInput
                id="filtro-comp-comissao"
                labelText="Filtrar por Competência (YYYY-MM)"
                placeholder="Ex: 2026-11"
                value={filtroCompetencia}
                onChange={(e) => setFiltroCompetencia(e.target.value.trim())}
              />
              <TextInput
                id="filtro-dt-ini-comissao"
                type="date"
                labelText="Data Início"
                value={filtroDataInicio}
                onChange={(e) => setFiltroDataInicio(e.target.value)}
              />
              <TextInput
                id="filtro-dt-fim-comissao"
                type="date"
                labelText="Data Fim"
                value={filtroDataFim}
                onChange={(e) => setFiltroDataFim(e.target.value)}
              />
              {(filtroCompetencia || filtroDataInicio || filtroDataFim) && (
                <Button
                  size="sm"
                  kind="ghost"
                  onClick={() => {
                    setFiltroCompetencia("");
                    setFiltroDataInicio("");
                    setFiltroDataFim("");
                  }}
                >
                  Limpar filtros
                </Button>
              )}
            </div>

            <AdminTable
              titulo="Comissões geradas pelas assinaturas"
              colunas={[
                { key: "competencia", header: "Mês" },
                { key: "afiliado", header: "Afiliado" },
                { key: "qtdIndicados", header: "Qtd. Clientes indicados" },
                { key: "base", header: "Base × %" },
                { key: "comissao", header: "Comissão" },
                { key: "status", header: "Status" },
                { key: "relatorio", header: "Relatório" },
                { key: "acoes", header: "Ações" },
              ]}
              vazio="Nenhuma comissão encontrada para os filtros selecionados."
              linhas={comissoesFiltradas.map((c) => {
                const qtd =
                  c.quantidadeIndicados ??
                  (c.clientesRelatorio && c.clientesRelatorio.length > 0 ? c.clientesRelatorio.length : 1);
                return {
                  id: c.id,
                  competencia: c.competenciaMes,
                  afiliado: nomeAfiliado.get(c.affiliateId) || c.affiliateId,
                  qtdIndicados: (
                    <div>
                      <strong>{qtd}</strong> cliente{qtd > 1 ? "s" : ""}
                    </div>
                  ),
                  base: `${fmtBRL(c.valorBasePlano)} × ${c.percentualAplicado}%`,
                  comissao: <strong>{fmtBRL(c.valorComissao)}</strong>,
                  status: (
                    <div>
                      <Tag type={c.status === "PAGO" ? "green" : c.status === "PENDENTE" ? "warm-gray" : "gray"}>
                        {c.status}
                      </Tag>
                      {c.pagoEm ? <div style={{ fontSize: "0.75rem" }}>{fmtDia(c.pagoEm)}</div> : null}
                    </div>
                  ),
                  relatorio: (
                    <Button
                      size="sm"
                      kind="ghost"
                      hasIconOnly
                      iconDescription="Abrir relatório do afiliado"
                      data-testid={`btn-relatorio-comissao-${c.id}`}
                      renderIcon={Document}
                      onClick={() => setRelatorioComissao(c)}
                    />
                  ),
                  acoes:
                    c.status === "PENDENTE" ? (
                      <Button size="sm" kind="primary" renderIcon={CheckmarkOutline} onClick={() => void marcarPago(c.id)}>
                        Marcar PIX pago
                      </Button>
                    ) : null,
                };
              })}
            />
          </TabPanel>
        </TabPanels>
      </Tabs>

      <Modal
        open={formAff !== null}
        modalHeading={formAff?.id ? "Editar afiliado" : "Novo afiliado"}
        primaryButtonText="Salvar"
        secondaryButtonText="Cancelar"
        onRequestClose={() => setFormAff(null)}
        onRequestSubmit={() => void salvarAfiliado()}
      >
        {formAff ? (
          <div style={{ display: "grid", gap: "0.75rem" }}>
            <TextInput id="af-nome" labelText="Nome completo / Parceiro" value={formAff.nome} onChange={(e) => setFormAff({ ...formAff, nome: e.target.value })} />
            <TextInput
              id="af-email"
              labelText="E-mail"
              value={formAff.email}
              onChange={(e) => setFormAff({ ...formAff, email: e.target.value })}
              onBlur={() => setFormAff({ ...formAff, email: sanitizeEmail(formAff.email) })}
            />
            <TextInput
              id="af-doc"
              labelText="CPF / CNPJ"
              value={formAff.documento}
              onChange={(e) => {
                const d = e.target.value.replace(/\D/g, "");
                setFormAff({ ...formAff, documento: d.length <= 11 ? maskCpf(d) : maskCnpj(d) });
              }}
            />
            <TextInput
              id="af-tel"
              labelText="Telefone / WhatsApp"
              value={formAff.telefone}
              onChange={(e) => setFormAff({ ...formAff, telefone: maskPhone(e.target.value) })}
            />
            <TextInput id="af-pix" labelText="Chave PIX para repasse" value={formAff.chavePix} onChange={(e) => setFormAff({ ...formAff, chavePix: e.target.value })} />
            <TextInput id="af-cod" labelText="Código de indicação (?ref=CODIGO)" value={formAff.codigo} onChange={(e) => setFormAff({ ...formAff, codigo: e.target.value.toUpperCase() })} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <TextInput id="af-pct" labelText="Comissão (%)" type="number" value={formAff.percentualComissao} onChange={(e) => setFormAff({ ...formAff, percentualComissao: e.target.value })} />
              <Select id="af-tipo" labelText="Modelo de comissão" value={formAff.tipoComissao} onChange={(e) => setFormAff({ ...formAff, tipoComissao: e.target.value as "RECORRENTE" | "PRIMEIRA_MENSALIDADE" })}>
                <SelectItem value="RECORRENTE" text="Recorrente (mensal)" />
                <SelectItem value="PRIMEIRA_MENSALIDADE" text="Somente 1ª mensalidade" />
              </Select>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <TextInput id="af-desc" labelText="Desconto p/ indicados (%)" type="number" value={formAff.descontoIndicadosPct} onChange={(e) => setFormAff({ ...formAff, descontoIndicadosPct: e.target.value })} />
              <TextInput id="af-trial" labelText="Dias extras trial p/ indicados" type="number" value={formAff.diasExtrasTrial} onChange={(e) => setFormAff({ ...formAff, diasExtrasTrial: e.target.value })} />
            </div>
            <Checkbox id="af-ativo" labelText="Afiliado ativo" checked={formAff.ativo} onChange={(_, { checked }) => setFormAff({ ...formAff, ativo: checked })} />
          </div>
        ) : null}
      </Modal>

      <Modal
        open={vincular !== null}
        modalHeading={vincular ? `Vincular cliente ao afiliado ${vincular.affiliateNome}` : ""}
        primaryButtonText="Vincular"
        secondaryButtonText="Cancelar"
        onRequestClose={() => setVincular(null)}
        onRequestSubmit={() => void vincularCliente()}
      >
        {vincular ? (
          <Select id="af-vinc-tnt" labelText="Cliente (Empresa / CNPJ)" value={vincular.tenantId} onChange={(e) => setVincular({ ...vincular, tenantId: e.target.value })}>
            {(tenants || []).map((t) => (
              <SelectItem key={t.id} value={t.id} text={`${t.nomeFantasia || t.razaoSocial} (${t.cnpj})`} />
            ))}
          </Select>
        ) : null}
      </Modal>

      {/* Modal Registrar Pagamento de Afiliado (Item 8) */}
      <Modal
        open={modalPagamento !== null}
        modalHeading="Registrar pagamento de comissão a afiliado"
        primaryButtonText="Confirmar e registrar repasse"
        secondaryButtonText="Cancelar"
        data-testid="modal-registrar-pagamento-afiliado"
        onRequestClose={() => setModalPagamento(null)}
        onRequestSubmit={() => void registrarPagamentoAfiliado()}
      >
        {modalPagamento ? (
          <div style={{ display: "grid", gap: "1rem" }}>
            <Select
              id="af-reg-affiliate"
              labelText="Afiliado parceiro"
              value={modalPagamento.affiliateId}
              onChange={(e) => setModalPagamento({ ...modalPagamento, affiliateId: e.target.value })}
            >
              {afiliados.map((a) => (
                <SelectItem
                  key={a.id}
                  value={a.id}
                  text={`${a.nome} (${a.codigo}) • PIX: ${a.chavePix || "Não inf."}`}
                />
              ))}
            </Select>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem" }}>
              <TextInput
                id="af-reg-comp"
                labelText="Competência (Mês)"
                placeholder="Ex: 2026-11"
                value={modalPagamento.competenciaMes}
                onChange={(e) => setModalPagamento({ ...modalPagamento, competenciaMes: e.target.value })}
              />
              <TextInput
                id="af-reg-dt-ini"
                type="date"
                labelText="Data Início"
                value={modalPagamento.dataInicio}
                onChange={(e) => setModalPagamento({ ...modalPagamento, dataInicio: e.target.value })}
              />
              <TextInput
                id="af-reg-dt-fim"
                type="date"
                labelText="Data Fim"
                value={modalPagamento.dataFim}
                onChange={(e) => setModalPagamento({ ...modalPagamento, dataFim: e.target.value })}
              />
            </div>

            <div
              style={{
                backgroundColor: "var(--cds-layer-02, #262626)",
                padding: "0.85rem",
                borderRadius: "4px",
                border: "1px solid var(--cds-border-subtle, #393939)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <strong>
                  Clientes indicados no período:{" "}
                  <span style={{ color: "var(--cds-link-01, #78a9ff)" }}>
                    {resumoPagamentoModal.clientes.length}
                  </span>
                </strong>
                <span style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)" }}>
                  Taxa: {resumoPagamentoModal.percentual}%
                </span>
              </div>

              {resumoPagamentoModal.clientes.length === 0 ? (
                <div style={{ fontSize: "0.85rem", color: "var(--cds-text-secondary)" }}>
                  Nenhum cliente indicado encontrado para este afiliado nas datas informadas.
                </div>
              ) : (
                <div style={{ maxHeight: "140px", overflowY: "auto", display: "grid", gap: "0.4rem" }}>
                  {resumoPagamentoModal.clientes.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: "0.8rem",
                        padding: "0.3rem 0.5rem",
                        backgroundColor: "var(--cds-layer-01, #161616)",
                        borderRadius: "2px",
                      }}
                    >
                      <div>
                        <strong>{c.nome}</strong> {c.cnpj ? `(${c.cnpj})` : ""}
                        <span style={{ marginLeft: "0.5rem", color: "var(--cds-text-secondary)" }}>
                          Plano: {c.plano || "PRO"}
                        </span>
                      </div>
                      <div>
                        {fmtBRL(c.valorBasePlano ?? 97.0)} →{" "}
                        <strong style={{ color: "var(--cds-support-success)" }}>
                          {fmtBRL(c.valorComissao ?? 19.4)}
                        </strong>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div
                style={{
                  marginTop: "0.75rem",
                  paddingTop: "0.5rem",
                  borderTop: "1px solid var(--cds-border-subtle, #393939)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>Valor de pagamento calculado:</span>
                <strong style={{ fontSize: "1.1rem", color: "var(--cds-support-success)" }}>
                  {fmtBRL(resumoPagamentoModal.valorCalculado)}
                </strong>
              </div>
            </div>

            <TextInput
              id="af-reg-valor-custom"
              labelText="Valor a pagar (R$) — Deixe em branco para usar o calculado"
              placeholder={resumoPagamentoModal.valorCalculado.toFixed(2)}
              value={modalPagamento.valorPagoCustom}
              onChange={(e) => setModalPagamento({ ...modalPagamento, valorPagoCustom: e.target.value })}
            />

            {/* Upload com Drag-and-Drop do Comprovante (Item 8.a / Item 1) */}
            <div>
              <label
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  display: "block",
                  marginBottom: "0.4rem",
                  color: "var(--cds-text-secondary)",
                }}
              >
                Comprovante de pagamento (PDF, PNG ou JPEG) — Arraste e solte o arquivo aqui:
              </label>
              <div
                data-testid="dropzone-comprovante-afiliado"
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverComprovante(true);
                }}
                onDragLeave={() => setDragOverComprovante(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverComprovante(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) processarArquivoComprovante(f);
                }}
                style={{
                  border: dragOverComprovante
                    ? "2px dashed var(--cds-link-01, #0f62fe)"
                    : "1px dashed var(--cds-border-strong, #8d8d8d)",
                  backgroundColor: dragOverComprovante
                    ? "rgba(15, 98, 254, 0.08)"
                    : "var(--cds-layer-02, #262626)",
                  padding: "1.25rem",
                  textAlign: "center",
                  borderRadius: "4px",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
                onClick={() => {
                  const inputEl = document.getElementById("input-file-comprovante-afiliado");
                  inputEl?.click();
                }}
              >
                <input
                  id="input-file-comprovante-afiliado"
                  type="file"
                  accept="application/pdf,image/png,image/jpeg,image/webp"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) processarArquivoComprovante(f);
                  }}
                />
                <Upload size={24} style={{ marginBottom: "0.3rem", color: "var(--cds-link-01, #78a9ff)" }} />
                {modalPagamento.comprovanteNome ? (
                  <div>
                    <strong style={{ color: "var(--cds-support-success)" }}>
                      ✓ {modalPagamento.comprovanteNome}
                    </strong>
                    <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                      Clique ou arraste outro arquivo para substituir.
                    </div>
                  </div>
                ) : (
                  <div>
                    <div>
                      <strong>Clique para selecionar</strong> ou arraste o comprovante até aqui
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                      Formatos aceitos: PDF, PNG, JPG (até 5 MB)
                    </div>
                  </div>
                )}
              </div>
            </div>

            <TextInput
              id="af-reg-obs"
              labelText="Observações do repasse (opcional)"
              placeholder="Ex: Liquidado via PIX Banco Inter"
              value={modalPagamento.comprovanteObs}
              onChange={(e) => setModalPagamento({ ...modalPagamento, comprovanteObs: e.target.value })}
            />
          </div>
        ) : null}
      </Modal>

      {/* Modal Relatório de Repasse do Afiliado (Item 8.b) */}
      <Modal
        open={relatorioComissao !== null}
        modalHeading={
          relatorioComissao
            ? `Relatório de repasse — ${nomeAfiliado.get(relatorioComissao.affiliateId) || "Afiliado"} (${relatorioComissao.competenciaMes})`
            : "Relatório"
        }
        passiveModal
        data-testid="modal-relatorio-comissao"
        onRequestClose={() => setRelatorioComissao(null)}
      >
        {relatorioComissao ? (
          <div style={{ display: "grid", gap: "1rem" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                gap: "0.5rem",
                padding: "0.75rem",
                backgroundColor: "var(--cds-layer-02, #262626)",
                borderRadius: "4px",
              }}
            >
              <div>
                <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>Afiliado</div>
                <strong>{nomeAfiliado.get(relatorioComissao.affiliateId) || relatorioComissao.affiliateId}</strong>
              </div>
              <div>
                <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>Competência</div>
                <strong>{relatorioComissao.competenciaMes}</strong>
              </div>
              <div>
                <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>Valor Pago</div>
                <strong style={{ color: "var(--cds-support-success)" }}>
                  {fmtBRL(relatorioComissao.valorComissao)}
                </strong>
              </div>
              <div>
                <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>Status</div>
                <Tag type={relatorioComissao.status === "PAGO" ? "green" : "warm-gray"}>
                  {relatorioComissao.status}
                </Tag>
              </div>
            </div>

            <div>
              <h4 style={{ fontSize: "0.95rem", marginBottom: "0.5rem" }}>
                Clientes que vieram por este afiliado ({relatorioComissao.clientesRelatorio?.length ?? relatorioComissao.quantidadeIndicados ?? 1}):
              </h4>

              {relatorioComissao.clientesRelatorio && relatorioComissao.clientesRelatorio.length > 0 ? (
                <div
                  style={{
                    border: "1px solid var(--cds-border-subtle, #393939)",
                    borderRadius: "4px",
                    overflow: "hidden",
                  }}
                >
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                    <thead>
                      <tr style={{ backgroundColor: "var(--cds-layer-02, #262626)", textAlign: "left" }}>
                        <th style={{ padding: "0.5rem 0.75rem" }}>Cliente / Empresa</th>
                        <th style={{ padding: "0.5rem 0.75rem" }}>CNPJ</th>
                        <th style={{ padding: "0.5rem 0.75rem" }}>Plano</th>
                        <th style={{ padding: "0.5rem 0.75rem" }}>Status</th>
                        <th style={{ padding: "0.5rem 0.75rem", textAlign: "right" }}>Comissão</th>
                      </tr>
                    </thead>
                    <tbody>
                      {relatorioComissao.clientesRelatorio.map((cli, idx) => (
                        <tr
                          key={cli.id || idx}
                          style={{
                            borderTop: "1px solid var(--cds-border-subtle, #393939)",
                            backgroundColor: idx % 2 === 0 ? "var(--cds-layer-01, #161616)" : "transparent",
                          }}
                        >
                          <td style={{ padding: "0.5rem 0.75rem" }}>{cli.nome}</td>
                          <td style={{ padding: "0.5rem 0.75rem", color: "var(--cds-text-secondary)" }}>
                            {cli.cnpj || "—"}
                          </td>
                          <td style={{ padding: "0.5rem 0.75rem" }}>{cli.plano || "PRO"}</td>
                          <td style={{ padding: "0.5rem 0.75rem" }}>
                            <Tag size="sm" type={cli.billingStatus === "ATIVO" ? "green" : "gray"}>
                              {cli.billingStatus || "ATIVO"}
                            </Tag>
                          </td>
                          <td style={{ padding: "0.5rem 0.75rem", textAlign: "right" }}>
                            <strong>{fmtBRL(cli.valorComissao ?? relatorioComissao.valorComissao)}</strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ fontSize: "0.85rem", color: "var(--cds-text-secondary)" }}>
                  Cliente indicado: {relatorioComissao.tenantNome || relatorioComissao.tenantId || "Consolidado"}
                </div>
              )}
            </div>

            {/* Informações do Comprovante de Pagamento */}
            <div
              style={{
                backgroundColor: "var(--cds-layer-02, #262626)",
                padding: "0.85rem",
                borderRadius: "4px",
                border: "1px solid var(--cds-border-subtle, #393939)",
              }}
            >
              <div style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)", marginBottom: "0.25rem" }}>
                Comprovante & Observações de Liquidação:
              </div>
              <div style={{ fontSize: "0.9rem" }}>
                {relatorioComissao.comprovanteObs || "Sem observações adicionais."}
              </div>

              {relatorioComissao.comprovanteNome && (
                <div style={{ marginTop: "0.6rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <Document size={16} />
                  <span>
                    Arquivo: <strong>{relatorioComissao.comprovanteNome}</strong>
                  </span>
                  {relatorioComissao.comprovanteDataUrl && (
                    <a
                      href={relatorioComissao.comprovanteDataUrl}
                      download={relatorioComissao.comprovanteNome}
                      style={{
                        marginLeft: "auto",
                        color: "var(--cds-link-01, #78a9ff)",
                        textDecoration: "underline",
                        fontSize: "0.85rem",
                      }}
                    >
                      Baixar comprovante
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}


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
import { Add, CheckmarkOutline, Copy, Edit, Renew, UserFollow } from "@carbon/icons-react";
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
  indicados: Array<{ id: string; nome: string }>;
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

  const salvarAfiliado = async () => {
    if (!formAff) return;
    const r = await adminFetch<{ error?: string }>("/api/admin/afiliados", {
      method: "POST",
      body: {
        tipo: "afiliado",
        id: formAff.id || undefined,
        nome: formAff.nome,
        documento: formAff.documento || null,
        email: formAff.email,
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
          <>
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
            <Button kind="tertiary" renderIcon={Renew} onClick={() => void recarregar()} disabled={loading}>
              Atualizar
            </Button>
          </>
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
            <AdminTable
              titulo="Comissões geradas pelas assinaturas"
              colunas={[
                { key: "competencia", header: "Mês" },
                { key: "afiliado", header: "Afiliado" },
                { key: "cliente", header: "Cliente indicado" },
                { key: "base", header: "Base × %" },
                { key: "comissao", header: "Comissão" },
                { key: "status", header: "Status" },
                { key: "acoes", header: "" },
              ]}
              vazio="Nenhuma comissão registrada ainda (gerada automaticamente ao dar baixa ou receber pagamento de cliente indicado)."
              linhas={comissoes.map((c) => ({
                id: c.id,
                competencia: c.competenciaMes,
                afiliado: nomeAfiliado.get(c.affiliateId) || c.affiliateId,
                cliente: c.tenantNome || c.tenantId || "—",
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
                acoes:
                  c.status === "PENDENTE" ? (
                    <Button size="sm" kind="primary" renderIcon={CheckmarkOutline} onClick={() => void marcarPago(c.id)}>
                      Marcar PIX pago
                    </Button>
                  ) : null,
              }))}
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
            <TextInput id="af-email" labelText="E-mail" value={formAff.email} onChange={(e) => setFormAff({ ...formAff, email: e.target.value })} />
            <TextInput id="af-doc" labelText="CPF / CNPJ" value={formAff.documento} onChange={(e) => setFormAff({ ...formAff, documento: e.target.value })} />
            <TextInput id="af-tel" labelText="Telefone / WhatsApp" value={formAff.telefone} onChange={(e) => setFormAff({ ...formAff, telefone: e.target.value })} />
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
    </div>
  );
}


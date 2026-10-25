"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Button,
  Checkbox,
  Column,
  Form,
  FormGroup,
  Grid,
  InlineLoading,
  Modal,
  Pagination,
  Select,
  SelectItem,
  Tag,
  TextInput,
  TextArea,
  Tile,
} from "@carbon/react";
import {
  Add,
  Earth,
  Edit,
  Launch,
  Locked,
  Renew,
  TrashCan,
  WarningAlt,
} from "@carbon/icons-react";
import { ModulePageShell } from "@/components/shell/module-page-shell";
import { maskCnpj } from "@/lib/masks";

interface PortalItem {
  id: string;
  nome: string;
  url: string;
  status: string;
  login: string | null;
  email: string | null;
  cnpj: string | null;
  usuario: string | null;
  valorAssinatura: number | null;
  periodicidade: string;
  dataVencimento: string | null;
  aceitaRobo: boolean;
  exigeCertificadoDigital: boolean;
  suporteContato: string | null;
  observacoes: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

interface ListResponse {
  ok: boolean;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  portais: PortalItem[];
}

function formatarMoeda(valor: number | null): string {
  if (valor === null || valor === undefined) return "Gratuito / Isento";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valor);
}

const STATUS_OPCOES = [
  { valor: "", rotulo: "Todos os status" },
  { valor: "CADASTRADO", rotulo: "Cadastrado (Ativo)" },
  { valor: "PRE_CADASTRO", rotulo: "Pré-cadastro" },
  { valor: "AGUARDANDO_APROVACAO", rotulo: "Aguardando aprovação" },
  { valor: "VENCIDO", rotulo: "Assinatura Vencida" },
  { valor: "SUSPENSO", rotulo: "Suspenso" },
  { valor: "REJEITADO", rotulo: "Rejeitado" },
  { valor: "NAO_CADASTRADO", rotulo: "Não cadastrado" },
];

export default function PortaisPage() {
  const [portais, setPortais] = useState<PortalItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(9);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("");

  // Modal State
  const [modalAberto, setModalAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [formErro, setFormErro] = useState<string | null>(null);

  // Form Fields
  const [nome, setNome] = useState("");
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState("CADASTRADO");
  const [login, setLogin] = useState("");
  const [email, setEmail] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [usuario, setUsuario] = useState("");
  const [valorAssinatura, setValorAssinatura] = useState<string>("");
  const [periodicidade, setPeriodicidade] = useState("ANUAL");
  const [dataVencimento, setDataVencimento] = useState("");
  const [aceitaRobo, setAceitaRobo] = useState(false);
  const [exigeCertificadoDigital, setExigeCertificadoDigital] = useState(true);
  const [suporteContato, setSuporteContato] = useState("");
  const [observacoes, setObservacoes] = useState("");

  const carregarPortais = useCallback(async () => {
    setCarregando(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (statusFiltro) params.set("status", statusFiltro);
      if (busca) params.set("busca", busca);

      const res = await fetch(`/api/portais?${params.toString()}`);
      if (res.ok) {
        const data: ListResponse = await res.json();
        setPortais(data.portais || []);
        setTotal(data.total || 0);
      }
    } finally {
      setCarregando(false);
    }
  }, [busca, page, pageSize, statusFiltro]);

  useEffect(() => {
    carregarPortais();
  }, [carregarPortais]);

  const abrirModalNovo = () => {
    setEditandoId(null);
    setNome("");
    setUrl("");
    setStatus("CADASTRADO");
    setLogin("");
    setEmail("");
    setCnpj("");
    setUsuario("");
    setValorAssinatura("");
    setPeriodicidade("ANUAL");
    setDataVencimento("");
    setAceitaRobo(false);
    setExigeCertificadoDigital(true);
    setSuporteContato("");
    setObservacoes("");
    setFormErro(null);
    setModalAberto(true);
  };

  const abrirModalEditar = (portal: PortalItem) => {
    setEditandoId(portal.id);
    setNome(portal.nome);
    setUrl(portal.url);
    setStatus(portal.status);
    setLogin(portal.login || "");
    setEmail(portal.email || "");
    setCnpj(portal.cnpj || "");
    setUsuario(portal.usuario || "");
    setValorAssinatura(portal.valorAssinatura ? String(portal.valorAssinatura) : "");
    setPeriodicidade(portal.periodicidade);
    setDataVencimento(portal.dataVencimento ? portal.dataVencimento.split("T")[0] : "");
    setAceitaRobo(portal.aceitaRobo);
    setExigeCertificadoDigital(portal.exigeCertificadoDigital);
    setSuporteContato(portal.suporteContato || "");
    setObservacoes(portal.observacoes || "");
    setFormErro(null);
    setModalAberto(true);
  };

  const salvarPortal = async () => {
    if (!nome.trim() || !url.trim()) {
      setFormErro("Nome e URL oficial são obrigatórios.");
      return;
    }

    setSalvando(true);
    setFormErro(null);

    let urlNormalizada = url.trim();
    if (urlNormalizada && !/^https?:\/\//i.test(urlNormalizada)) {
      urlNormalizada = `https://${urlNormalizada}`;
    }

    const payload = {
      nome: nome.trim(),
      url: urlNormalizada,
      status,
      login: login.trim() || null,
      email: email.trim() || null,
      cnpj: cnpj.trim() || null,
      usuario: usuario.trim() || null,
      valorAssinatura: valorAssinatura ? parseFloat(valorAssinatura) : null,
      periodicidade,
      dataVencimento: dataVencimento ? new Date(dataVencimento).toISOString() : null,
      aceitaRobo,
      exigeCertificadoDigital,
      suporteContato: suporteContato.trim() || null,
      observacoes: observacoes.trim() || null,
    };

    try {
      const endpoint = editandoId ? `/api/portais/${editandoId}` : "/api/portais";
      const method = editandoId ? "PATCH" : "POST";
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setModalAberto(false);
        await carregarPortais();
      } else {
        const err = await res.json();
        setFormErro(err.message || err.error || "Erro ao salvar portal.");
      }
    } catch {
      setFormErro("Erro de conexão ao salvar portal.");
    } finally {
      setSalvando(false);
    }
  };

  const excluirPortal = async (id: string, nomePortal: string) => {
    if (!window.confirm(`Confirma a exclusão do portal "${nomePortal}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/portais/${id}`, { method: "DELETE" });
      if (res.ok) {
        await carregarPortais();
      }
    } catch {
      // Ignorar
    }
  };

  const getStatusTag = (st: string) => {
    switch (st) {
      case "CADASTRADO":
        return <Tag type="green" size="sm">Cadastrado</Tag>;
      case "PRE_CADASTRO":
        return <Tag type="warm-gray" size="sm">Pré-cadastro</Tag>;
      case "AGUARDANDO_APROVACAO":
        return <Tag type="blue" size="sm">Aguardando aprovação</Tag>;
      case "VENCIDO":
        return <Tag type="red" size="sm">Vencido</Tag>;
      case "SUSPENSO":
        return <Tag type="red" size="sm">Suspenso</Tag>;
      case "REJEITADO":
        return <Tag type="magenta" size="sm">Rejeitado</Tag>;
      case "NAO_CADASTRADO":
      default:
        return <Tag type="cool-gray" size="sm">Não cadastrado</Tag>;
    }
  };

  return (
    <ModulePageShell
      routePath="/portais"
      subtitle="Catálogo de plataformas de disputa, credenciamentos corporativos e controle preventivo de anuidades."
    >
      <Grid fullWidth>
        {/* Barra de Ações e Filtros */}
        <Column lg={16} md={8} sm={4} style={{ marginBottom: "1.5rem" }}>
          <Tile
            style={{
              padding: "1rem 1.25rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "1rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap", flex: 1 }}>
              <TextInput
                id="busca-portais"
                labelText=""
                aria-label="Buscar plataformas por nome ou usuário"
                placeholder="Buscar por nome, login ou CNPJ..."
                size="sm"
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value);
                  setPage(1);
                }}
                style={{ minWidth: "16rem", maxWidth: "24rem" }}
              />

              <Select
                id="filtro-status-portal"
                labelText=""
                aria-label="Filtrar por Status"
                size="sm"
                value={statusFiltro}
                onChange={(e) => {
                  setStatusFiltro(e.target.value);
                  setPage(1);
                }}
                style={{ minWidth: "12rem" }}
              >
                {STATUS_OPCOES.map((opt) => (
                  <SelectItem key={opt.valor} value={opt.valor} text={opt.rotulo} />
                ))}
              </Select>

              <Button
                kind="ghost"
                size="sm"
                hasIconOnly
                renderIcon={Renew}
                iconDescription="Atualizar lista"
                onClick={() => carregarPortais()}
              />
            </div>

            <Button
              kind="primary"
              size="sm"
              data-testid="btn-novo-portal"
              renderIcon={Add}
              onClick={abrirModalNovo}
            >
              + Novo Portal
            </Button>
          </Tile>
        </Column>

        {/* Grade de Portais */}
        <Column lg={16} md={8} sm={4}>
          {carregando ? (
            <Tile style={{ padding: "3rem", textAlign: "center" }}>
              <InlineLoading description="Carregando catálogo de plataformas..." />
            </Tile>
          ) : portais.length === 0 ? (
            <Tile style={{ padding: "3.5rem 1rem", textAlign: "center" }}>
              <Earth size={36} style={{ marginBottom: "1rem", opacity: 0.5 }} />
              <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1.125rem", fontWeight: 600 }}>
                Nenhum portal encontrado
              </h3>
              <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--cds-text-secondary)" }}>
                Não foram encontrados portais com os filtros aplicados. Clique em "+ Novo Portal" para cadastrar.
              </p>
            </Tile>
          ) : (
            <Grid fullWidth style={{ padding: 0 }}>
              {portais.map((p) => {
                const dataVenc = p.dataVencimento ? new Date(p.dataVencimento) : null;
                const diasRestantes = dataVenc
                  ? Math.ceil((dataVenc.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                  : null;
                const isVencendo = diasRestantes !== null && diasRestantes <= 30;

                return (
                  <Column key={p.id} lg={5} md={4} sm={4} style={{ marginBottom: "1rem" }}>
                    <Tile
                      data-testid={`portal-card-${p.id}`}
                      style={{
                        padding: "1.25rem",
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                      }}
                    >
                      <div>
                        {/* Topo do Card */}
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            marginBottom: "0.75rem",
                            gap: "0.5rem",
                          }}
                        >
                          <div>
                            <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600 }}>
                              {p.nome}
                            </h3>
                            <a
                              href={p.url}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.25rem",
                                fontSize: "0.75rem",
                                color: "var(--cds-link-primary, #0f62fe)",
                                marginTop: "0.25rem",
                                textDecoration: "none",
                              }}
                            >
                              Abrir Portal <Launch size={12} />
                            </a>
                          </div>
                          {getStatusTag(p.status)}
                        </div>

                        {/* Credenciais Seguras */}
                        <div
                          style={{
                            padding: "0.75rem",
                            backgroundColor: "var(--cds-layer-02, rgba(255,255,255,0.05))",
                            borderRadius: "4px",
                            marginBottom: "0.75rem",
                            fontSize: "0.8125rem",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", marginBottom: "0.375rem", fontWeight: 600, fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                            <Locked size={14} /> Credenciais Seguras (sem senhas)
                          </div>
                          <div>
                            <span style={{ color: "var(--cds-text-secondary)" }}>Login/Usuário:</span>{" "}
                            <span className="pncp-mono">{p.login || p.usuario || "—"}</span>
                          </div>
                          {p.cnpj && (
                            <div>
                              <span style={{ color: "var(--cds-text-secondary)" }}>CNPJ:</span>{" "}
                              <span className="pncp-mono">{p.cnpj}</span>
                            </div>
                          )}
                          {p.email && (
                            <div>
                              <span style={{ color: "var(--cds-text-secondary)" }}>E-mail:</span>{" "}
                              <span>{p.email}</span>
                            </div>
                          )}
                        </div>

                        {/* Dados de Assinatura */}
                        <div style={{ marginBottom: "0.75rem", fontSize: "0.8125rem" }}>
                          <div>
                            <span style={{ color: "var(--cds-text-secondary)" }}>Anuidade:</span>{" "}
                            <span className="pncp-mono" style={{ fontWeight: 600 }}>
                              {formatarMoeda(p.valorAssinatura)}
                            </span>{" "}
                            <span style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                              ({p.periodicidade})
                            </span>
                          </div>

                          {dataVenc && (
                            <div style={{ marginTop: "0.25rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                              <span style={{ color: "var(--cds-text-secondary)" }}>Expiração:</span>
                              <span className="pncp-mono">
                                {dataVenc.toLocaleDateString("pt-BR")}
                              </span>
                              {isVencendo && (
                                <Tag
                                  type={diasRestantes! < 0 ? "red" : "warm-gray"}
                                  size="sm"
                                  className="pncp-mono"
                                  renderIcon={WarningAlt}
                                >
                                  {diasRestantes! < 0 ? "Expirada" : `${diasRestantes}d`}
                                </Tag>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Flags Operacionais */}
                        <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
                          <Tag size="sm" type={p.aceitaRobo ? "teal" : "cool-gray"}>
                            {p.aceitaRobo ? "✔ Aceita Robô" : "Sem Robô"}
                          </Tag>
                          <Tag size="sm" type={p.exigeCertificadoDigital ? "purple" : "cool-gray"}>
                            {p.exigeCertificadoDigital ? "Certificado A1/A3" : "Acesso via Login"}
                          </Tag>
                        </div>

                        {p.suporteContato && (
                          <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginBottom: "0.5rem" }}>
                            <strong>Suporte:</strong> {p.suporteContato}
                          </div>
                        )}
                      </div>

                      {/* Botões de Ação */}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "flex-end",
                          gap: "0.5rem",
                          borderTop: "1px solid var(--cds-border-subtle, #e0e0e0)",
                          paddingTop: "0.75rem",
                          marginTop: "0.5rem",
                        }}
                      >
                        <Button
                          kind="ghost"
                          size="sm"
                          data-testid={`btn-editar-portal-${p.id}`}
                          renderIcon={Edit}
                          onClick={() => abrirModalEditar(p)}
                        >
                          Editar
                        </Button>
                        <Button
                          kind="danger--ghost"
                          size="sm"
                          data-testid={`btn-excluir-portal-${p.id}`}
                          renderIcon={TrashCan}
                          onClick={() => excluirPortal(p.id, p.nome)}
                        >
                          Excluir
                        </Button>
                      </div>
                    </Tile>
                  </Column>
                );
              })}
            </Grid>
          )}

          {total > pageSize && (
            <div style={{ marginTop: "1rem" }}>
              <Pagination
                backwardText="Página anterior"
                forwardText="Próxima página"
                itemsPerPageText="Itens por página:"
                page={page}
                pageNumberText="Número da página"
                pageSize={pageSize}
                pageSizes={[9, 18, 27]}
                totalItems={total}
                onChange={({ page: novaPagina, pageSize: novoPageSize }) => {
                  setPage(novaPagina);
                  setPageSize(novoPageSize);
                }}
              />
            </div>
          )}
        </Column>
      </Grid>

      {/* Modal Novo / Editar Portal */}
      <Modal
        open={modalAberto}
        modalHeading={editandoId ? "Editar Portal de Compras" : "Cadastrar Nova Plataforma de Licitações"}
        primaryButtonText={salvando ? "Salvando..." : "Salvar Plataforma"}
        secondaryButtonText="Cancelar"
        primaryButtonDisabled={salvando}
        onRequestClose={() => setModalAberto(false)}
        onRequestSubmit={salvarPortal}
        data-testid="modal-portal"
      >
        <Form style={{ display: "flex", flexDirection: "column", gap: "1rem", paddingTop: "0.5rem" }}>
          {formErro && (
            <div
              style={{
                padding: "0.75rem",
                backgroundColor: "var(--cds-support-error, #da1e28)",
                color: "#ffffff",
                borderRadius: "4px",
                fontSize: "0.875rem",
              }}
            >
              {formErro}
            </div>
          )}

          <div
            style={{
              padding: "0.75rem",
              backgroundColor: "var(--cds-layer-accent-01, rgba(69, 137, 255, 0.1))",
              borderLeft: "4px solid var(--cds-support-info, #4589ff)",
              fontSize: "0.8125rem",
            }}
          >
            <strong>Diretriz de Segurança:</strong> Por política de segurança estrita da Lei 14.133, este sistema nunca armazena senhas. Cadastre apenas dados de identificação e links oficiais.
          </div>

          <Grid fullWidth style={{ padding: 0 }}>
            <Column lg={10} md={5} sm={4}>
              <TextInput
                id="portal-nome"
                labelText="Nome da Plataforma *"
                placeholder="Ex: Portal de Compras Públicas, Compras.gov.br"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
            </Column>
            <Column lg={6} md={3} sm={4}>
              <Select
                id="portal-status"
                labelText="Status de Cadastro"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {STATUS_OPCOES.filter((o) => o.valor).map((opt) => (
                  <SelectItem key={opt.valor} value={opt.valor} text={opt.rotulo} />
                ))}
              </Select>
            </Column>

            <Column lg={16} md={8} sm={4}>
              <TextInput
                id="portal-url"
                labelText="URL Oficial do Portal *"
                placeholder="https://..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </Column>

            <Column lg={8} md={4} sm={4}>
              <TextInput
                id="portal-login"
                labelText="Login / Identificador"
                placeholder="empresa.gov"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
              />
            </Column>
            <Column lg={8} md={4} sm={4}>
              <TextInput
                id="portal-usuario"
                labelText="Nome do Usuário Cadastrado"
                placeholder="Vítor Henrique"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
              />
            </Column>

            <Column lg={8} md={4} sm={4}>
              <TextInput
                id="portal-email"
                labelText="E-mail Vinculado"
                placeholder="licitacoes@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Column>
            <Column lg={8} md={4} sm={4}>
              <TextInput
                id="portal-cnpj"
                labelText="CNPJ Vinculado"
                placeholder="00.000.000/0001-00"
                value={cnpj}
                onChange={(e) => setCnpj(maskCnpj(e.target.value))}
              />
            </Column>

            <Column lg={5} md={3} sm={2}>
              <TextInput
                id="portal-valor"
                labelText="Valor da Assinatura (R$)"
                placeholder="1200.00"
                value={valorAssinatura}
                onChange={(e) => setValorAssinatura(e.target.value)}
              />
            </Column>
            <Column lg={5} md={3} sm={2}>
              <Select
                id="portal-periodicidade"
                labelText="Periodicidade"
                value={periodicidade}
                onChange={(e) => setPeriodicidade(e.target.value)}
              >
                <SelectItem value="ANUAL" text="Anual" />
                <SelectItem value="SEMESTRAL" text="Semestral" />
                <SelectItem value="TRIMESTRAL" text="Trimestral" />
                <SelectItem value="MENSAL" text="Mensal" />
                <SelectItem value="GRATUITO" text="Gratuito" />
              </Select>
            </Column>
            <Column lg={6} md={2} sm={4}>
              <TextInput
                id="portal-vencimento"
                type="date"
                labelText="Data de Vencimento"
                value={dataVencimento}
                onChange={(e) => setDataVencimento(e.target.value)}
              />
            </Column>

            <Column lg={16} md={8} sm={4}>
              <FormGroup legendText="Configurações Técnicas e Integrações">
                <div style={{ display: "flex", gap: "2rem" }}>
                  <Checkbox
                    id="portal-aceita-robo"
                    labelText="Plataforma aceita Robô de Lances"
                    checked={aceitaRobo}
                    onChange={(_, { checked }) => setAceitaRobo(checked)}
                  />
                  <Checkbox
                    id="portal-exige-cert"
                    labelText="Exige Certificado Digital (A1/A3)"
                    checked={exigeCertificadoDigital}
                    onChange={(_, { checked }) => setExigeCertificadoDigital(checked)}
                  />
                </div>
              </FormGroup>
            </Column>

            <Column lg={16} md={8} sm={4}>
              <TextInput
                id="portal-suporte"
                labelText="Contatos de Suporte Técnico"
                placeholder="Telefone 0800, WhatsApp ou e-mail de suporte da plataforma"
                value={suporteContato}
                onChange={(e) => setSuporteContato(e.target.value)}
              />
            </Column>

            <Column lg={16} md={8} sm={4}>
              <TextArea
                id="portal-obs"
                labelText="Observações Operacionais"
                placeholder="Particularidades de envio de proposta, horário limite de lances, etc."
                rows={2}
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
              />
            </Column>
          </Grid>
        </Form>
      </Modal>
    </ModulePageShell>
  );
}

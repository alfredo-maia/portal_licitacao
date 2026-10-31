"use client";

import React, { useCallback, useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import {
  Button,
  Column,
  FormGroup,
  Grid,
  InlineLoading,
  InlineNotification,
  Modal,
  Pagination,
  Select,
  SelectItem,
  Tab,
  TabList,
  Tabs,
  Tag,
  TextInput,
  Tile,
} from "@carbon/react";
import {
  Add,
  Download,
  Edit,
  Enterprise,
  Group,
  Logout,
  Renew,
  Save,
  Security,
  User,
  View,
} from "@carbon/icons-react";
import { ModulePageShell } from "@/components/shell/module-page-shell";
import { getVisibleConfigTabs } from "@/lib/rbac";
import { maskCnpj, maskCpf } from "@/lib/masks";
import type {
  ConfiguracaoEmpresa,
  UsuarioEquipeItem,
  UsuarioRole,
} from "@/server/schemas/configuracao.schema";
import type { AuditViewerItem } from "@/server/schemas/audit-viewer.schema";

export default function ConfiguracoesPage() {
  const [userRole, setUserRole] = useState<string>("DIRETORIA");
  const [currentUser, setCurrentUser] = useState<{
    id?: string;
    name?: string;
    email?: string;
    role?: string;
    cnpj?: string;
    plano?: string;
  } | null>(null);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((session) => {
        if (session?.user) {
          setCurrentUser(session.user);
          if (session.user.role) {
            setUserRole(session.user.role);
          }
        }
      })
      .catch(() => {});
  }, []);

  const visibleTabIds = getVisibleConfigTabs(userRole);

  const TAB_DEFINITIONS = [
    { id: 0, label: "Meu Perfil", icon: User },
    { id: 1, label: "Dados da Empresa Licitante", icon: Enterprise },
    { id: 2, label: "Gestão da Equipe & RBAC", icon: Group },
    { id: 3, label: "Trilha de Auditoria (Logs)", icon: Security },
  ];

  const availableTabs = TAB_DEFINITIONS.filter((t) => visibleTabIds.includes(t.id));

  const [abaSelecionada, setAbaSelecionada] = useState(0);
  const [notificacao, setNotificacao] = useState<{ tipo: "success" | "error"; texto: string } | null>(null);

  // Garante que o usuário permaneça em aba autorizada para seu papel
  useEffect(() => {
    if (!visibleTabIds.includes(abaSelecionada)) {
      setAbaSelecionada(visibleTabIds[0] ?? 0);
    }
  }, [visibleTabIds, abaSelecionada]);

  // 1. Perfil do Usuário
  const [temaAtual, setTemaAtual] = useState<string>("white");
  useEffect(() => {
    const saved = localStorage.getItem("pncp_theme") || "white";
    setTemaAtual(saved);
  }, []);

  const handleTrocarTema = (novoTema: string) => {
    setTemaAtual(novoTema);
    localStorage.setItem("pncp_theme", novoTema);
    document.documentElement.setAttribute("data-carbon-theme", novoTema);
    setNotificacao({
      tipo: "success",
      texto: `Tema alterado para ${novoTema === "white" ? "Claro (white)" : "Escuro (g100)"}!`,
    });
  };

  // 2. Dados da Empresa
  const [empresa, setEmpresa] = useState<ConfiguracaoEmpresa>({
    id: "default",
    razaoSocial: "",
    cnpj: "",
    inscricaoEstadual: "",
    cnae: "",
    endereco: "",
    cidade: "",
    uf: "",
    cep: "",
    representanteNome: "",
    representanteCpf: "",
    representanteRg: "",
    representanteCargo: "Sócio-Administrador",
    bancoNome: "",
    agencia: "",
    contaCorrente: "",
    chavePix: "",
  });
  const [salvandoEmpresa, setSalvandoEmpresa] = useState(false);

  const carregarEmpresa = useCallback(async () => {
    try {
      const res = await fetch("/api/configuracoes/empresa");
      const data = await res.json();
      if (data.ok && data.empresa) {
        setEmpresa(data.empresa);
      }
    } catch {}
  }, []);

  const handleSalvarEmpresa = async () => {
    setSalvandoEmpresa(true);
    try {
      const res = await fetch("/api/configuracoes/empresa", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(empresa),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setNotificacao({ tipo: "success", texto: "Dados societários da empresa atualizados com sucesso!" });
      } else {
        setNotificacao({ tipo: "error", texto: data.error || "Falha ao salvar dados da empresa." });
      }
    } catch {
      setNotificacao({ tipo: "error", texto: "Erro na comunicação com o servidor." });
    } finally {
      setSalvandoEmpresa(false);
    }
  };

  // 3. Gestão de Equipe
  const [equipe, setEquipe] = useState<UsuarioEquipeItem[]>([]);
  const [carregandoEquipe, setCarregandoEquipe] = useState(false);
  const [modalNovoMembro, setModalNovoMembro] = useState(false);
  const [modalEditarMembro, setModalEditarMembro] = useState(false);
  const [membroSelecionado, setMembroSelecionado] = useState<UsuarioEquipeItem | null>(null);

  // Form Novo Membro
  const [novoNome, setNovoNome] = useState("");
  const [novoEmail, setNovoEmail] = useState("");
  const [novoRole, setNovoRole] = useState<UsuarioRole>("ANALISTA_COMERCIAL");
  const [novaSenha, setNovaSenha] = useState("");

  // Form Editar Membro
  const [editRole, setEditRole] = useState<UsuarioRole>("ANALISTA_COMERCIAL");
  const [editAtivo, setEditAtivo] = useState(true);

  const carregarEquipe = useCallback(async () => {
    setCarregandoEquipe(true);
    try {
      const res = await fetch("/api/configuracoes/equipe");
      const data = await res.json();
      if (data.ok && Array.isArray(data.usuarios)) {
        setEquipe(data.usuarios);
      }
    } catch {}
    finally {
      setCarregandoEquipe(false);
    }
  }, []);

  const handleCriarMembro = async () => {
    if (!novoNome || !novoEmail || !novaSenha) {
      setNotificacao({ tipo: "error", texto: "Preencha todos os campos do novo colaborador." });
      return;
    }
    try {
      const res = await fetch("/api/configuracoes/equipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: novoNome,
          email: novoEmail,
          role: novoRole,
          password: novaSenha,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setModalNovoMembro(false);
        setNovoNome("");
        setNovoEmail("");
        setNovaSenha("");
        setNotificacao({ tipo: "success", texto: `Colaborador ${data.usuario.name} criado com sucesso!` });
        carregarEquipe();
      } else {
        setNotificacao({ tipo: "error", texto: data.error || "Erro ao criar colaborador." });
      }
    } catch {
      setNotificacao({ tipo: "error", texto: "Erro na comunicação com o servidor." });
    }
  };

  const handleSalvarEdicaoMembro = async () => {
    if (!membroSelecionado) return;
    try {
      const res = await fetch(`/api/configuracoes/equipe/${membroSelecionado.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: editRole,
          ativo: editAtivo,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setModalEditarMembro(false);
        setNotificacao({ tipo: "success", texto: "Permissões do colaborador atualizadas!" });
        carregarEquipe();
      } else {
        setNotificacao({ tipo: "error", texto: data.error || "Erro ao atualizar colaborador." });
      }
    } catch {
      setNotificacao({ tipo: "error", texto: "Erro na comunicação com o servidor." });
    }
  };

  // 4. Trilha de Auditoria
  const [logs, setLogs] = useState<AuditViewerItem[]>([]);
  const [totalLogs, setTotalLogs] = useState(0);
  const [logPage, setLogPage] = useState(1);
  const [logPageSize, setLogPageSize] = useState(15);
  const [filtroEntidade, setFiltroEntidade] = useState("");
  const [filtroAcao, setFiltroAcao] = useState("");
  const [buscaAuditoria, setBuscaAuditoria] = useState("");
  const [carregandoLogs, setCarregandoLogs] = useState(false);
  const [logInspecao, setLogInspecao] = useState<AuditViewerItem | null>(null);

  const carregarAuditLogs = useCallback(async () => {
    setCarregandoLogs(true);
    try {
      const params = new URLSearchParams();
      if (filtroEntidade) params.set("entidadeTipo", filtroEntidade);
      if (filtroAcao) params.set("acao", filtroAcao);
      if (buscaAuditoria) params.set("busca", buscaAuditoria);
      params.set("page", String(logPage));
      params.set("pageSize", String(logPageSize));

      const res = await fetch(`/api/audit?${params.toString()}`);
      const data = await res.json();
      if (data.ok) {
        setLogs(data.logs || []);
        setTotalLogs(data.total || 0);
      }
    } catch {}
    finally {
      setCarregandoLogs(false);
    }
  }, [filtroEntidade, filtroAcao, buscaAuditoria, logPage, logPageSize]);

  useEffect(() => {
    carregarEmpresa();
    carregarEquipe();
    carregarAuditLogs();
  }, [carregarEmpresa, carregarEquipe, carregarAuditLogs]);

  const handleExportarCsv = () => {
    const params = new URLSearchParams();
    if (filtroEntidade) params.set("entidadeTipo", filtroEntidade);
    if (filtroAcao) params.set("acao", filtroAcao);
    if (buscaAuditoria) params.set("busca", buscaAuditoria);
    window.open(`/api/audit/export-csv?${params.toString()}`, "_blank");
  };

  return (
    <ModulePageShell routePath="/configuracoes">
      {/* Top Header Bar */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.25rem" }}>
              <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 600 }}>
                Configurações Corporativas & Auditoria
              </h1>
              <Tag type="high-contrast" size="md" className="pncp-mono">
                RBAC & Trilha Imutável
              </Tag>
            </div>
            <p style={{ margin: 0, color: "var(--cds-text-secondary)", fontSize: "0.875rem" }}>
              Gestão societária da empresa licitante, controle de acesso e permissões da equipe (Anexo 4) e inspeção auditável de logs (Lei 14.133/2021).
            </p>
          </div>
        </div>

        {notificacao && (
          <InlineNotification
            style={{ marginTop: "1rem" }}
            kind={notificacao.tipo}
            title={notificacao.tipo === "success" ? "Sucesso" : "Atenção"}
            subtitle={notificacao.texto}
            onCloseButtonClick={() => setNotificacao(null)}
          />
        )}
      </div>

      {/* Tabs Principais com controle de visibilidade RBAC (Item 11.2) */}
      <Tabs
        selectedIndex={Math.max(0, availableTabs.findIndex((t) => t.id === abaSelecionada))}
        onChange={({ selectedIndex }) => {
          const target = availableTabs[selectedIndex];
          if (target) setAbaSelecionada(target.id);
        }}
      >
        <TabList aria-label="Abas de Configurações" contained>
          {availableTabs.map((tab) => (
            <Tab key={tab.id} renderIcon={tab.icon} onClick={() => setAbaSelecionada(tab.id)}>
              {tab.label}
            </Tab>
          ))}
        </TabList>
      </Tabs>

      <div style={{ padding: "1.5rem 0" }}>
        {/* ABA 1: PERFIL DO USUÁRIO */}
        {abaSelecionada === 0 && (
            <Grid style={{ padding: 0 }}>
              <Column lg={8} md={8} sm={4}>
                <Tile style={{ padding: "1.5rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
                    <div
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: "50%",
                        background: "#0f62fe",
                        color: "#ffffff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "1.25rem",
                        fontWeight: 700,
                      }}
                    >
                      {(currentUser?.name || "Usuário")
                        .split(" ")
                        .filter(Boolean)
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase() || "US"}
                    </div>
                    <div>
                      <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600 }}>
                        {currentUser?.name || "Usuário"}
                      </h2>
                      <div style={{ color: "var(--cds-text-secondary)", fontSize: "0.875rem" }}>
                        {currentUser?.email || "usuario@empresa.com.br"}
                      </div>
                      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                        <Tag type="blue" size="sm">
                          {currentUser?.role === "SUPERADMIN"
                            ? "SUPERADMIN (Acesso Global)"
                            : currentUser?.role === "DIRETORIA"
                            ? "DIRETORIA (Acesso Total)"
                            : currentUser?.role === "ANALISTA_COMERCIAL"
                            ? "ANALISTA COMERCIAL"
                            : currentUser?.role || "OPERADOR"}
                        </Tag>
                        {currentUser?.plano && (
                          <Tag type="green" size="sm">
                            PLANO {currentUser.plano}
                          </Tag>
                        )}
                        {currentUser?.cnpj && (
                          <Tag type="cool-gray" size="sm">
                            {maskCnpj(currentUser.cnpj)}
                          </Tag>
                        )}
                      </div>
                    </div>
                  </div>

                  <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}>
                    Preferência de Visualização do Tema
                  </h3>
                  <p style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)", marginBottom: "1rem" }}>
                    Escolha o tema da interface visual para o IBM Carbon Design System:
                  </p>
                  <div style={{ display: "flex", gap: "0.75rem" }}>
                    <Button
                      kind={temaAtual === "white" ? "primary" : "tertiary"}
                      size="md"
                      onClick={() => handleTrocarTema("white")}
                      id="btn-tema-claro"
                    >
                      Tema Claro (White)
                    </Button>
                    <Button
                      kind={temaAtual === "g100" ? "primary" : "tertiary"}
                      size="md"
                      onClick={() => handleTrocarTema("g100")}
                      id="btn-tema-escuro"
                    >
                      Tema Escuro (g100)
                    </Button>
                  </div>

                  <div style={{ marginTop: "1.5rem", paddingTop: "1.5rem", borderTop: "1px solid var(--cds-border-subtle)" }}>
                    <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                      Sessão Ativa
                    </h3>
                    <p style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)", marginBottom: "1rem" }}>
                      Encerre a sessão atual para entrar com outra conta de usuário ou empresa.
                    </p>
                    <Button
                      kind="danger--ghost"
                      size="md"
                      renderIcon={Logout}
                      onClick={() => signOut({ callbackUrl: "/login" })}
                      id="btn-logout-perfil"
                      data-testid="btn-logout-perfil"
                    >
                      Sair da Conta
                    </Button>
                  </div>
                </Tile>
              </Column>
            </Grid>
        )}

        {/* ABA 2: DADOS DA EMPRESA LICITANTE */}
        {abaSelecionada === 1 && (
            <Tile style={{ padding: "1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600 }}>
                    Dados Cadastrais da Empresa Licitante
                  </h2>
                  <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--cds-text-secondary)" }}>
                    Fonte única da verdade utilizada no auto-preenchimento das 8 Declarações Oficiais e Impugnações.
                  </p>
                </div>
                <Button
                  kind="primary"
                  size="md"
                  renderIcon={Save}
                  onClick={handleSalvarEmpresa}
                  disabled={salvandoEmpresa}
                  id="btn-salvar-empresa"
                >
                  {salvandoEmpresa ? <InlineLoading description="Salvando..." /> : "Salvar Alterações"}
                </Button>
              </div>

              <h3 style={{ fontSize: "0.9375rem", fontWeight: 600, marginBottom: "0.75rem", borderBottom: "1px solid var(--cds-border-subtle)", paddingBottom: "0.5rem" }}>
                1. Identificação Societária
              </h3>
              <Grid style={{ padding: 0, marginBottom: "1.5rem" }}>
                <Column lg={8} md={4} sm={4}>
                  <TextInput
                    id="empresa-razao"
                    labelText="Razão Social da Empresa *"
                    value={empresa.razaoSocial}
                    onChange={(e) => setEmpresa({ ...empresa, razaoSocial: e.target.value })}
                  />
                </Column>
                <Column lg={4} md={2} sm={4}>
                  <TextInput
                    id="empresa-cnpj"
                    labelText="CNPJ *"
                    value={empresa.cnpj}
                    onChange={(e) => setEmpresa({ ...empresa, cnpj: maskCnpj(e.target.value) })}
                  />
                </Column>
                <Column lg={4} md={2} sm={4}>
                  <TextInput
                    id="empresa-ie"
                    labelText="Inscrição Estadual"
                    value={empresa.inscricaoEstadual || ""}
                    onChange={(e) => setEmpresa({ ...empresa, inscricaoEstadual: e.target.value })}
                  />
                </Column>
                <Column lg={16} md={8} sm={4} style={{ marginTop: "0.75rem" }}>
                  <TextInput
                    id="empresa-cnae"
                    labelText="CNAE Principal"
                    value={empresa.cnae || ""}
                    onChange={(e) => setEmpresa({ ...empresa, cnae: e.target.value })}
                  />
                </Column>
              </Grid>

              <h3 style={{ fontSize: "0.9375rem", fontWeight: 600, marginBottom: "0.75rem", borderBottom: "1px solid var(--cds-border-subtle)", paddingBottom: "0.5rem" }}>
                2. Endereço da Sede
              </h3>
              <Grid style={{ padding: 0, marginBottom: "1.5rem" }}>
                <Column lg={8} md={4} sm={4}>
                  <TextInput
                    id="empresa-endereco"
                    labelText="Logradouro / Número / Bairro *"
                    value={empresa.endereco}
                    onChange={(e) => setEmpresa({ ...empresa, endereco: e.target.value })}
                  />
                </Column>
                <Column lg={4} md={2} sm={4}>
                  <TextInput
                    id="empresa-cidade"
                    labelText="Cidade *"
                    value={empresa.cidade}
                    onChange={(e) => setEmpresa({ ...empresa, cidade: e.target.value })}
                  />
                </Column>
                <Column lg={2} md={1} sm={2}>
                  <TextInput
                    id="empresa-uf"
                    labelText="UF *"
                    value={empresa.uf}
                    onChange={(e) => setEmpresa({ ...empresa, uf: e.target.value })}
                  />
                </Column>
                <Column lg={2} md={1} sm={2}>
                  <TextInput
                    id="empresa-cep"
                    labelText="CEP *"
                    value={empresa.cep}
                    onChange={(e) => setEmpresa({ ...empresa, cep: e.target.value })}
                  />
                </Column>
              </Grid>

              <h3 style={{ fontSize: "0.9375rem", fontWeight: 600, marginBottom: "0.75rem", borderBottom: "1px solid var(--cds-border-subtle)", paddingBottom: "0.5rem" }}>
                3. Representante Legal (Assinante Padrão)
              </h3>
              <Grid style={{ padding: 0, marginBottom: "1.5rem" }}>
                <Column lg={6} md={3} sm={4}>
                  <TextInput
                    id="empresa-rep-nome"
                    labelText="Nome Completo *"
                    value={empresa.representanteNome}
                    onChange={(e) => setEmpresa({ ...empresa, representanteNome: e.target.value })}
                  />
                </Column>
                <Column lg={4} md={2} sm={4}>
                  <TextInput
                    id="empresa-rep-cpf"
                    labelText="CPF *"
                    value={empresa.representanteCpf}
                    onChange={(e) => setEmpresa({ ...empresa, representanteCpf: maskCpf(e.target.value) })}
                  />
                </Column>
                <Column lg={3} md={2} sm={4}>
                  <TextInput
                    id="empresa-rep-rg"
                    labelText="RG"
                    value={empresa.representanteRg || ""}
                    onChange={(e) => setEmpresa({ ...empresa, representanteRg: e.target.value })}
                  />
                </Column>
                <Column lg={3} md={1} sm={4}>
                  <TextInput
                    id="empresa-rep-cargo"
                    labelText="Cargo *"
                    value={empresa.representanteCargo}
                    onChange={(e) => setEmpresa({ ...empresa, representanteCargo: e.target.value })}
                  />
                </Column>
              </Grid>

              <h3 style={{ fontSize: "0.9375rem", fontWeight: 600, marginBottom: "0.75rem", borderBottom: "1px solid var(--cds-border-subtle)", paddingBottom: "0.5rem" }}>
                4. Dados Bancários Padrão para Propostas
              </h3>
              <Grid style={{ padding: 0 }}>
                <Column lg={4} md={2} sm={4}>
                  <TextInput
                    id="empresa-banco"
                    labelText="Instituição Bancária"
                    value={empresa.bancoNome || ""}
                    onChange={(e) => setEmpresa({ ...empresa, bancoNome: e.target.value })}
                  />
                </Column>
                <Column lg={3} md={2} sm={4}>
                  <TextInput
                    id="empresa-agencia"
                    labelText="Agência"
                    value={empresa.agencia || ""}
                    onChange={(e) => setEmpresa({ ...empresa, agencia: e.target.value })}
                  />
                </Column>
                <Column lg={4} md={2} sm={4}>
                  <TextInput
                    id="empresa-conta"
                    labelText="Conta Corrente"
                    value={empresa.contaCorrente || ""}
                    onChange={(e) => setEmpresa({ ...empresa, contaCorrente: e.target.value })}
                  />
                </Column>
                <Column lg={5} md={2} sm={4}>
                  <TextInput
                    id="empresa-pix"
                    labelText="Chave Pix"
                    value={empresa.chavePix || ""}
                    onChange={(e) => setEmpresa({ ...empresa, chavePix: e.target.value })}
                  />
                </Column>
              </Grid>
            </Tile>
        )}

        {/* ABA 3: GESTÃO DA EQUIPE & RBAC */}
        {abaSelecionada === 2 && (
            <Tile style={{ padding: "1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600 }}>
                    Equipe de Colaboradores & Matriz de Papéis (Anexo 4)
                  </h2>
                  <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--cds-text-secondary)" }}>
                    Diretoria, Analistas Comerciais e Operadores Técnicos com segregação de funções.
                  </p>
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <Button
                    kind="primary"
                    size="md"
                    renderIcon={Add}
                    onClick={() => setModalNovoMembro(true)}
                    id="btn-novo-colaborador"
                  >
                    Novo Colaborador
                  </Button>
                  <Button
                    kind="ghost"
                    size="md"
                    renderIcon={Renew}
                    onClick={carregarEquipe}
                  >
                    Atualizar
                  </Button>
                </div>
              </div>

              {carregandoEquipe ? (
                <div style={{ padding: "3rem", textAlign: "center" }}>
                  <InlineLoading description="Carregando colaboradores..." />
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {equipe.map((membro) => (
                    <div
                      key={membro.id}
                      style={{
                        padding: "1rem 1.25rem",
                        background: "var(--cds-layer-02)",
                        borderRadius: "2px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "1rem",
                        borderLeft: membro.ativo ? "4px solid #0f62fe" : "4px solid #8d8d8d",
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <span style={{ fontWeight: 600, fontSize: "1rem" }}>{membro.name}</span>
                          <Tag
                            type={
                              membro.role === "DIRETORIA"
                                ? "purple"
                                : membro.role === "ANALISTA_COMERCIAL"
                                ? "blue"
                                : "cool-gray"
                            }
                            size="sm"
                          >
                            {membro.role === "OPERADOR" ? "OPERADOR_TECNICO" : membro.role}
                          </Tag>
                          <Tag type={membro.ativo ? "green" : "red"} size="sm">
                            {membro.ativo ? "ATIVO" : "INATIVO"}
                          </Tag>
                        </div>
                        <div style={{ fontSize: "0.8125rem", color: "var(--cds-text-secondary)", marginTop: "0.25rem" }}>
                          {membro.email} • Cadastrado em {new Date(membro.createdAt).toLocaleDateString("pt-BR")}
                        </div>
                      </div>

                      {/* Apenas Diretoria pode alterar cargo ou desativar colaborador (Item 11.3) */}
                      {userRole === "DIRETORIA" && (
                        <Button
                          kind="ghost"
                          size="sm"
                          renderIcon={Edit}
                          onClick={() => {
                            setMembroSelecionado(membro);
                            setEditRole(membro.role);
                            setEditAtivo(membro.ativo);
                            setModalEditarMembro(true);
                          }}
                          id={`btn-editar-${membro.id}`}
                        >
                          Alterar Permissões
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Tile>
        )}

        {/* ABA 4: TRILHA DE AUDITORIA CORPORATIVA */}
        {abaSelecionada === 3 && (
            <Tile style={{ padding: "1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600 }}>
                    Trilha Imutável de Auditoria Corporativa (`audit_log`)
                  </h2>
                  <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--cds-text-secondary)" }}>
                    Rastreamento de todas as deliberações de Participação ("Participar / Não Participar"), mutações no Kanban, declarações e documentos (Art. 7º Lei 14.133).
                  </p>
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <Button
                    kind="secondary"
                    size="md"
                    renderIcon={Download}
                    onClick={handleExportarCsv}
                    id="btn-exportar-csv"
                  >
                    Exportar Relatório CSV
                  </Button>
                  <Button
                    kind="ghost"
                    size="md"
                    renderIcon={Renew}
                    onClick={carregarAuditLogs}
                  >
                    Atualizar
                  </Button>
                </div>
              </div>

              {/* Filtros da Trilha */}
              <Grid style={{ padding: 0, marginBottom: "1rem" }}>
                <Column lg={6} md={3} sm={4}>
                  <TextInput
                    id="busca-audit"
                    labelText="Buscar nos registros"
                    value={buscaAuditoria}
                    onChange={(e) => setBuscaAuditoria(e.target.value)}
                    placeholder="Ação, Entidade, ID ou Usuário..."
                  />
                </Column>
                <Column lg={5} md={3} sm={4}>
                  <Select
                    id="filtro-entidade-audit"
                    labelText="Tipo de Entidade"
                    value={filtroEntidade}
                    onChange={(e) => setFiltroEntidade(e.target.value)}
                  >
                    <SelectItem value="" text="Todas as Entidades" />
                    <SelectItem value="LICITACAO" text="LICITACAO" />
                    <SelectItem value="PORTAL" text="PORTAL" />
                    <SelectItem value="DOCUMENTO" text="DOCUMENTO" />
                    <SelectItem value="DECLARACAO" text="DECLARACAO" />
                    <SelectItem value="IMPUGNACAO" text="IMPUGNACAO" />
                    <SelectItem value="CONFIGURACAO" text="CONFIGURACAO" />
                    <SelectItem value="USUARIO" text="USUARIO" />
                  </Select>
                </Column>
                <Column lg={5} md={2} sm={4}>
                  <Select
                    id="filtro-acao-audit"
                    labelText="Ação Realizada"
                    value={filtroAcao}
                    onChange={(e) => setFiltroAcao(e.target.value)}
                  >
                    <SelectItem value="" text="Todas as Ações" />
                    <SelectItem value="DECIDE_GO_NOGO" text="DECIDE_GO_NOGO" />
                    <SelectItem value="MOVE_KANBAN" text="MOVE_KANBAN" />
                    <SelectItem value="DECLARACAO_GERADA" text="DECLARACAO_GERADA" />
                    <SelectItem value="IMPUGNACAO_CRIADA" text="IMPUGNACAO_CRIADA" />
                    <SelectItem value="DOCUMENTO_CRIADO" text="DOCUMENTO_CRIADO" />
                    <SelectItem value="PORTAL_CRIADO" text="PORTAL_CRIADO" />
                    <SelectItem value="CONFIGURACAO_EMPRESA_ATUALIZADA" text="CONFIGURACAO_ATUALIZADA" />
                    <SelectItem value="USUARIO_CRIADO" text="USUARIO_CRIADO" />
                  </Select>
                </Column>
              </Grid>

              {carregandoLogs ? (
                <div style={{ padding: "3rem", textAlign: "center" }}>
                  <InlineLoading description="Carregando trilha de auditoria..." />
                </div>
              ) : logs.length === 0 ? (
                <div style={{ padding: "3rem", textAlign: "center", color: "var(--cds-text-secondary)" }}>
                  Nenhum registro de auditoria encontrado com os filtros selecionados.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      style={{
                        padding: "0.75rem 1rem",
                        background: "var(--cds-layer-02)",
                        borderRadius: "2px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: "0.8125rem",
                        flexWrap: "wrap",
                        gap: "0.5rem",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <span style={{ color: "var(--cds-text-secondary)" }} className="pncp-mono">
                          {new Date(log.ocorridoEm).toLocaleString("pt-BR")}
                        </span>
                        <Tag type="blue" size="sm" className="pncp-mono">{log.acao}</Tag>
                        <Tag type="cool-gray" size="sm">{log.entidadeTipo}:{log.entidadeId.substring(0, 14)}</Tag>
                        <span>{log.usuarioNome || log.usuarioId || "Sistema"}</span>
                      </div>

                      <Button
                        kind="ghost"
                        size="sm"
                        renderIcon={View}
                        onClick={() => setLogInspecao(log)}
                        id={`btn-inspecionar-${log.id}`}
                      >
                        Ver Diff JSON
                      </Button>
                    </div>
                  ))}

                  {totalLogs > logPageSize && (
                    <Pagination
                      backwardText="Página anterior"
                      forwardText="Próxima página"
                      itemsPerPageText="Itens por página:"
                      page={logPage}
                      pageNumberText="Página"
                      pageSize={logPageSize}
                      pageSizes={[15, 30, 50]}
                      totalItems={totalLogs}
                      onChange={(e) => {
                        setLogPage(e.page);
                        setLogPageSize(e.pageSize);
                      }}
                    />
                  )}
                </div>
              )}
            </Tile>
        )}
      </div>

      {/* MODAL: Novo Colaborador */}
      <Modal
        open={modalNovoMembro}
        onRequestClose={() => setModalNovoMembro(false)}
        modalHeading="Cadastrar Novo Colaborador (RBAC)"
        primaryButtonText="Criar Usuário"
        secondaryButtonText="Cancelar"
        onRequestSubmit={handleCriarMembro}
      >
        <div style={{ padding: "0.5rem 0" }}>
          <TextInput
            id="novo-nome"
            labelText="Nome Completo *"
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            style={{ marginBottom: "1rem" }}
          />
          <TextInput
            id="novo-email"
            labelText="E-mail Corporativo *"
            value={novoEmail}
            onChange={(e) => setNovoEmail(e.target.value)}
            style={{ marginBottom: "1rem" }}
          />
          <Select
            id="novo-role"
            labelText="Papel no Sistema (Perfil de Acesso) *"
            value={novoRole}
            onChange={(e) => setNovoRole(e.target.value as UsuarioRole)}
            style={{ marginBottom: "1rem" }}
          >
            <SelectItem value="DIRETORIA" text="DIRETORIA (Acesso irrestrito a aprovações e finanças)" />
            <SelectItem value="ANALISTA_COMERCIAL" text="ANALISTA COMERCIAL (Lances, credenciamentos e petições)" />
            <SelectItem value="OPERADOR_TECNICO" text="OPERADOR TÉCNICO (Análise de TR, atestados e minutas)" />
          </Select>
          <TextInput
            id="nova-senha"
            type="password"
            labelText="Senha Provisória *"
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
            helperText="Mínimo de 6 caracteres"
          />
        </div>
      </Modal>

      {/* MODAL: Editar Colaborador */}
      <Modal
        open={modalEditarMembro}
        onRequestClose={() => setModalEditarMembro(false)}
        modalHeading={`Alterar Permissões — ${membroSelecionado?.name}`}
        primaryButtonText="Salvar Permissões"
        secondaryButtonText="Cancelar"
        onRequestSubmit={handleSalvarEdicaoMembro}
      >
        <div style={{ padding: "0.5rem 0" }}>
          <Select
            id="edit-role"
            labelText="Papel no Sistema"
            value={editRole}
            onChange={(e) => setEditRole(e.target.value as UsuarioRole)}
            style={{ marginBottom: "1rem" }}
          >
            <SelectItem value="DIRETORIA" text="DIRETORIA" />
            <SelectItem value="ANALISTA_COMERCIAL" text="ANALISTA COMERCIAL" />
            <SelectItem value="OPERADOR_TECNICO" text="OPERADOR TÉCNICO" />
          </Select>

          <Select
            id="edit-ativo"
            labelText="Status do Usuário"
            value={editAtivo ? "true" : "false"}
            onChange={(e) => setEditAtivo(e.target.value === "true")}
          >
            <SelectItem value="true" text="Ativo (Pode efetuar login)" />
            <SelectItem value="false" text="Inativo (Bloqueado)" />
          </Select>
        </div>
      </Modal>

      {/* MODAL: Inspeção de Auditoria (Diff JSON) */}
      <Modal
        open={Boolean(logInspecao)}
        onRequestClose={() => setLogInspecao(null)}
        modalHeading="Inspeção de Auditoria — Detalhes do Registro"
        passiveModal
        size="lg"
      >
        {logInspecao && (
          <div style={{ padding: "0.5rem 0", fontSize: "0.875rem" }}>
            <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem", flexWrap: "wrap" }}>
              <div><strong>Ação:</strong> <Tag type="blue" size="sm">{logInspecao.acao}</Tag></div>
              <div><strong>Entidade:</strong> {logInspecao.entidadeTipo} ({logInspecao.entidadeId})</div>
              <div><strong>Data:</strong> {new Date(logInspecao.ocorridoEm).toLocaleString("pt-BR")}</div>
              <div><strong>Responsável:</strong> {logInspecao.usuarioNome || logInspecao.usuarioId || "Sistema"}</div>
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>Estado Posterior (Depois):</div>
              <pre style={{ background: "var(--cds-layer-02)", padding: "1rem", borderRadius: "2px", overflowX: "auto", fontSize: "0.75rem" }}>
                {JSON.stringify(logInspecao.depois, null, 2)}
              </pre>
            </div>

            {logInspecao.antes && (
              <div>
                <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>Estado Anterior (Antes):</div>
                <pre style={{ background: "var(--cds-layer-02)", padding: "1rem", borderRadius: "2px", overflowX: "auto", fontSize: "0.75rem" }}>
                  {JSON.stringify(logInspecao.antes, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </Modal>
    </ModulePageShell>
  );
}

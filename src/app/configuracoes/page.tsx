"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { signOut } from "next-auth/react";
import {
  Button,
  Checkbox,
  Column,
  FormGroup,
  Grid,
  InlineLoading,
  InlineNotification,
  Modal,
  Select,
  SelectItem,
  Tab,
  TabList,
  Tabs,
  Tag,
  TextInput,
  Tile,
  ToastNotification,
} from "@carbon/react";
import {
  Add,
  Building,
  Edit,
  Enterprise,
  Group,
  Location,
  Logout,
  Renew,
  Save,
  Security,
  TrashCan,
  Upload,
  User as UserIcon,
} from "@carbon/icons-react";
import { ModulePageShell } from "@/components/shell/module-page-shell";
import { getVisibleConfigTabs } from "@/lib/rbac";
import { isValidCpf, maskCep, maskCnpj, maskCpf, maskPhone } from "@/lib/masks";
import { CATALOGO_MACRO_SEGMENTOS, type MacroSegmento } from "@/server/schemas/segmentos.schema";
import { ESTADOS_BRASIL } from "@/config/estados";
import { filtrarCatalogoSegmentos } from "@/lib/segmentos-busca";
import { CATALOGO_CNAE } from "@/config/cnae-catalogo";
import type {
  ConfiguracaoEmpresa,
  MeuPerfil,
  UsuarioEquipeItem,
  UsuarioRole,
} from "@/server/schemas/configuracao.schema";

interface TenantInfo {
  id: string;
  cnpj: string;
  razaoSocial: string;
  nomeFantasia?: string | null;
  plano: string;
  billingStatus: string;
  maxCnpjs: number;
  maxUsers: number;
  role?: string;
}

export default function ConfiguracoesPage() {
  const [userRole, setUserRole] = useState<string>("DIRETORIA");
  const [currentUser, setCurrentUser] = useState<{
    id?: string;
    name?: string;
    email?: string;
    role?: string;
    cnpj?: string;
    plano?: string;
    billingStatus?: string;
  } | null>(null);

  // Abas e Notificação
  const [abaSelecionada, setAbaSelecionada] = useState(0);
  const [notificacao, setNotificacao] = useState<{ tipo: "success" | "error" | "warning"; texto: string } | null>(null);

  // 1. MEU PERFIL (3 Cards + Card Sessão Ativa)
  const [perfil, setPerfil] = useState<MeuPerfil>({
    id: "",
    name: "",
    email: "",
    cpf: "",
    telefone: "",
    cep: "",
    logradouro: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    uf: "",
  });
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarNovaSenha, setConfirmarNovaSenha] = useState("");
  const [salvandoPerfil, setSalvandoPerfil] = useState(false);
  const [buscandoCepPerfil, setBuscandoCepPerfil] = useState(false);

  // 2. DADOS DA EMPRESA & MULTI-CNPJ
  const [tenants, setTenants] = useState<TenantInfo[]>([]);
  const [activeTenantId, setActiveTenantId] = useState<string>("");
  const [modalNovoCnpj, setModalNovoCnpj] = useState(false);
  const [salvandoNovoCnpj, setSalvandoNovoCnpj] = useState(false);
  const [novoCnpjForm, setNovoCnpjForm] = useState({
    cnpj: "",
    razaoSocial: "",
    nomeFantasia: "",
    cnaePrincipal: "",
    uf: "",
    cidade: "",
    endereco: "",
  });

  const [empresa, setEmpresa] = useState<ConfiguracaoEmpresa>({
    id: "default",
    razaoSocial: "",
    nomeFantasia: "",
    cnpj: "",
    inscricaoEstadual: "",
    inscricaoMunicipal: "",
    cnae: "",
    cnaesSecundarios: [],
    endereco: "",
    numero: "",
    complemento: "",
    bairro: "",
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
    segmentos: [],
    subsegmentos: [],
    ufs: [],
    brasilInteiro: true,
    preferenciasUpdatedAt: null,
  });
  const [salvandoEmpresa, setSalvandoEmpresa] = useState(false);
  const [buscaSegmento, setBuscaSegmento] = useState("");
  const [buscandoCepEmpresa, setBuscandoCepEmpresa] = useState(false);
  const [modalCnaesSecundarios, setModalCnaesSecundarios] = useState(false);
  const [novoCnaeSecundario, setNovoCnaeSecundario] = useState("");
  const [modalUploadCartao, setModalUploadCartao] = useState(false);
  const [arquivoCartaoCnpj, setArquivoCartaoCnpj] = useState<File | null>(null);
  const [enviandoCartaoCnpj, setEnviandoCartaoCnpj] = useState(false);
  const [dragOverLogo, setDragOverLogo] = useState(false);
  const [dragOverTimbrado, setDragOverTimbrado] = useState(false);
  const [dragOverAssinatura, setDragOverAssinatura] = useState(false);
  const [dragOverCsv, setDragOverCsv] = useState(false);
  const [dragOverCartao, setDragOverCartao] = useState(false);
  const [assinaturaDigitalUrl, setAssinaturaDigitalUrl] = useState<string | null>(null);
  const [tabelaPrecosCsvNome, setTabelaPrecosCsvNome] = useState<string | null>(null);

  // 3. GESTÃO DA EQUIPE
  const [equipe, setEquipe] = useState<UsuarioEquipeItem[]>([]);
  const [carregandoEquipe, setCarregandoEquipe] = useState(false);
  const [modalNovoMembro, setModalNovoMembro] = useState(false);
  const [modalEditarMembro, setModalEditarMembro] = useState(false);
  const [membroSelecionado, setMembroSelecionado] = useState<UsuarioEquipeItem | null>(null);

  const [novoNome, setNovoNome] = useState("");
  const [novoEmail, setNovoEmail] = useState("");
  const [novoRole, setNovoRole] = useState<UsuarioRole>("ANALISTA_COMERCIAL");
  const [novaSenhaMembro, setNovaSenhaMembro] = useState("");

  const [editRole, setEditRole] = useState<UsuarioRole>("ANALISTA_COMERCIAL");
  const [editAtivo, setEditAtivo] = useState(true);

  // ==========================================
  // Carregamento Inicial
  // ==========================================

  const carregarSessao = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session");
      const data = await res.json();
      if (data?.user) {
        setCurrentUser(data.user);
        if (data.user.role) setUserRole(data.user.role);
        setPerfil((prev) => ({
          ...prev,
          name: prev.name || data.user.name || "",
          email:
            !prev.email || prev.email === "usuario@empresa.com.br"
              ? data.user.email || prev.email
              : prev.email,
        }));
      }
    } catch {}
  }, []);

  const carregarPerfil = useCallback(async () => {
    try {
      const res = await fetch("/api/configuracoes/perfil");
      const data = await res.json();
      if (data.ok && data.perfil) {
        setPerfil((prev) => ({
          ...data.perfil,
          email:
            data.perfil.email && data.perfil.email !== "usuario@empresa.com.br"
              ? data.perfil.email
              : prev.email || data.perfil.email,
          name:
            data.perfil.name && data.perfil.name !== "Usuário"
              ? data.perfil.name
              : prev.name || data.perfil.name,
        }));
      }
    } catch {}
  }, []);

  const carregarEmpresa = useCallback(async (tenantId?: string) => {
    try {
      const url = tenantId
        ? `/api/configuracoes/empresa?tenantId=${encodeURIComponent(tenantId)}`
        : "/api/configuracoes/empresa";
      const res = await fetch(url);
      const data = await res.json();
      if (data.ok && data.empresa) {
        setEmpresa({
          ...data.empresa,
          cnaesSecundarios: data.empresa.cnaesSecundarios || [],
          segmentos: data.empresa.segmentos || [],
          subsegmentos: data.empresa.subsegmentos || [],
          ufs: data.empresa.ufs || [],
          brasilInteiro: data.empresa.brasilInteiro ?? true,
          preferenciasUpdatedAt: data.empresa.preferenciasUpdatedAt || null,
        });
        if (data.activeTenantId && !tenantId) {
          setActiveTenantId(data.activeTenantId);
        }
      }
    } catch {}
  }, []);

  const carregarTenants = useCallback(async () => {
    try {
      const res = await fetch("/api/configuracoes/tenants");
      const data = await res.json();
      if (data.ok && Array.isArray(data.tenants)) {
        setTenants(data.tenants);
        const resolvedId = data.activeTenantId || data.tenants[0]?.id;
        if (resolvedId) {
          setActiveTenantId(resolvedId);
          carregarEmpresa(resolvedId);
        } else {
          carregarEmpresa();
        }
      } else {
        carregarEmpresa();
      }
    } catch {
      carregarEmpresa();
    }
  }, [carregarEmpresa]);

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

  useEffect(() => {
    carregarSessao();
    carregarPerfil();
    carregarTenants();
    carregarEquipe();
  }, [carregarSessao, carregarPerfil, carregarTenants, carregarEquipe]);

  useEffect(() => {
    const handleTenantChanged = (e: any) => {
      const nextId = e?.detail?.tenantId;
      if (nextId) {
        setActiveTenantId(nextId);
        carregarEmpresa(nextId);
        carregarEquipe();
      }
    };
    window.addEventListener("tenant-changed", handleTenantChanged);
    return () => window.removeEventListener("tenant-changed", handleTenantChanged);
  }, [carregarEmpresa, carregarEquipe]);

  // Auto-dismiss da notificação dinâmica após 5 segundos
  useEffect(() => {
    if (!notificacao) return;
    const timer = setTimeout(() => {
      setNotificacao(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [notificacao]);

  // Controle de Abas Autorizadas
  const visibleTabIds = useMemo(() => getVisibleConfigTabs(userRole), [userRole]);
  const TAB_DEFINITIONS = useMemo(
    () => [
      { id: 0, label: "Meu Perfil", icon: UserIcon },
      { id: 1, label: "Dados da Empresa Licitante", icon: Enterprise },
      { id: 2, label: "Gestão da Equipe", icon: Group },
    ],
    [],
  );
  const availableTabs = useMemo(
    () => TAB_DEFINITIONS.filter((t) => visibleTabIds.includes(t.id)),
    [TAB_DEFINITIONS, visibleTabIds],
  );

  useEffect(() => {
    if (!visibleTabIds.includes(abaSelecionada)) {
      setAbaSelecionada(visibleTabIds[0] ?? 0);
    }
  }, [visibleTabIds, abaSelecionada]);

  // Tenant ativo resolvido (Regra Geral: Trial = PRO; opaonossopanificadora@gmail.com = ENTERPRISE)
  const currentTenant = tenants.find((t) => t.id === activeTenantId) || tenants[0];
  const isEnterpriseAccount =
    currentUser?.email?.toLowerCase() === "opaonossopanificadora@gmail.com" ||
    perfil.email?.toLowerCase() === "opaonossopanificadora@gmail.com";
  const billingStatus = isEnterpriseAccount
    ? "ATIVO"
    : currentTenant?.billingStatus || (currentUser as any)?.billingStatus || "TRIAL";
  const planoAtual = isEnterpriseAccount
    ? "ENTERPRISE"
    : billingStatus === "TRIAL"
    ? "PRO"
    : currentTenant?.plano || currentUser?.plano || "PRO";
  const maxCnpjs = isEnterpriseAccount
    ? 5
    : billingStatus === "TRIAL"
    ? Math.max(currentTenant?.maxCnpjs || 2, 2)
    : currentTenant?.maxCnpjs || (planoAtual === "ENTERPRISE" ? 5 : planoAtual === "PRO" ? 2 : 1);
  const maxUsers = isEnterpriseAccount
    ? 10
    : billingStatus === "TRIAL"
    ? Math.max(currentTenant?.maxUsers || 2, 2)
    : currentTenant?.maxUsers || (planoAtual === "ENTERPRISE" ? 10 : planoAtual === "PRO" ? 2 : 1);
  const isBasicoAtivo = planoAtual === "BASICO" && billingStatus !== "TRIAL";

  const diasDesdeUltimaAlteracao = empresa.preferenciasUpdatedAt
    ? Math.floor((Date.now() - new Date(empresa.preferenciasUpdatedAt).getTime()) / (24 * 60 * 60 * 1000))
    : 999;
  const diasRestantesDesbloqueio = Math.max(1, 30 - diasDesdeUltimaAlteracao);
  const bloqueadoPlanoBasico30Dias = Boolean(isBasicoAtivo && empresa.preferenciasUpdatedAt && diasDesdeUltimaAlteracao < 30);
  const dataProximaLiberacao = empresa.preferenciasUpdatedAt
    ? new Date(new Date(empresa.preferenciasUpdatedAt).getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString("pt-BR")
    : "";

  // Regra do Botão Adicionar CNPJ
  const isCnpjLimitBasico = isBasicoAtivo || maxCnpjs <= 1;
  const isCnpjLimitReached = tenants.length >= maxCnpjs;
  const canAddCnpj = !isCnpjLimitBasico && !isCnpjLimitReached;

  const tooltipAddCnpj = isCnpjLimitBasico
    ? "Faça upgrade do seu plano para cadastrar múltiplos CNPJs."
    : isCnpjLimitReached
    ? `Você atingiu o limite máximo de ${maxCnpjs} CNPJ(s) do seu plano.`
    : undefined;

  // Regra de limite de usuários na equipe
  const isTeamLimitReached = equipe.length >= maxUsers;

  // ==========================================
  // Handlers Meu Perfil
  // ==========================================

  const handleConsultarCepPerfil = async (cepValue: string) => {
    const limpo = cepValue.replace(/\D/g, "");
    if (limpo.length !== 8) return;

    setBuscandoCepPerfil(true);
    try {
      const res = await fetch(`/api/cep/${limpo}`);
      const data = await res.json();
      if (res.ok && data.ok) {
        setPerfil((prev) => ({
          ...prev,
          logradouro: data.logradouro || prev.logradouro,
          bairro: data.bairro || prev.bairro,
          cidade: data.cidade || prev.cidade,
          uf: data.uf || prev.uf,
        }));
      }
    } catch {}
    finally {
      setBuscandoCepPerfil(false);
    }
  };

  const handleSalvarPerfil = async () => {
    if (perfil.cpf && perfil.cpf.trim() !== "" && !isValidCpf(perfil.cpf)) {
      setNotificacao({ tipo: "error", texto: "CPF inválido. Verifique os dígitos informados." });
      return;
    }
    if (novaSenha && novaSenha !== confirmarNovaSenha) {
      setNotificacao({ tipo: "error", texto: "A nova senha e a confirmação não coincidem." });
      return;
    }
    if (novaSenha && novaSenha.length < 6) {
      setNotificacao({ tipo: "error", texto: "A nova senha deve ter no mínimo 6 caracteres." });
      return;
    }

    setSalvandoPerfil(true);
    try {
      const res = await fetch("/api/configuracoes/perfil", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...perfil,
          novaSenha: novaSenha || undefined,
          confirmarNovaSenha: confirmarNovaSenha || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setNotificacao({ tipo: "success", texto: "Seu perfil foi atualizado com sucesso!" });
        setNovaSenha("");
        setConfirmarNovaSenha("");
        if (data.perfil) {
          setPerfil((prev) => ({
            ...prev,
            ...data.perfil,
            email:
              data.perfil.email && data.perfil.email !== "usuario@empresa.com.br"
                ? data.perfil.email
                : prev.email,
          }));
        }
      } else {
        setNotificacao({ tipo: "error", texto: data.error || "Erro ao salvar perfil." });
      }
    } catch {
      setNotificacao({ tipo: "error", texto: "Erro na comunicação com o servidor." });
    } finally {
      setSalvandoPerfil(false);
    }
  };

  // ==========================================
  // Handlers Empresa & Multi-CNPJ
  // ==========================================

  const handleTrocarTenantAtivo = async (nextTenantId: string) => {
    if (!nextTenantId || nextTenantId === activeTenantId) return;

    try {
      const res = await fetch("/api/configuracoes/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: nextTenantId }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setActiveTenantId(nextTenantId);
        setNotificacao({ tipo: "success", texto: "Empresa ativa alterada com sucesso!" });
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("tenant-changed", { detail: { tenantId: nextTenantId } }),
          );
        }
        carregarEmpresa(nextTenantId);
        carregarEquipe();
      } else {
        setNotificacao({ tipo: "error", texto: data.error || "Erro ao alterar empresa ativa." });
      }
    } catch {
      setNotificacao({ tipo: "error", texto: "Erro ao comunicar com o servidor." });
    }
  };

  const handleConsultarCepEmpresa = async (cepValue: string) => {
    const limpo = cepValue.replace(/\D/g, "");
    if (limpo.length !== 8) return;

    setBuscandoCepEmpresa(true);
    try {
      const res = await fetch(`/api/cep/${limpo}`);
      const data = await res.json();
      if (res.ok && data.ok) {
        setEmpresa((prev) => ({
          ...prev,
          endereco: data.logradouro ? `${data.logradouro}` : prev.endereco,
          bairro: data.bairro || prev.bairro,
          cidade: data.cidade || prev.cidade,
          uf: data.uf || prev.uf,
        }));
      }
    } catch {}
    finally {
      setBuscandoCepEmpresa(false);
    }
  };

  const handleToggleMacroSegmento = (codigoMacro: string) => {
    if (bloqueadoPlanoBasico30Dias) return;
    const macroDef = CATALOGO_MACRO_SEGMENTOS[codigoMacro as MacroSegmento];
    const subCodigos = (macroDef?.subcategorias || []).map((s) => s.codigo);

    setEmpresa((prev) => {
      const currentSegmentos = prev.segmentos || [];
      const currentSub = prev.subsegmentos || [];

      if (currentSegmentos.includes(codigoMacro)) {
        return {
          ...prev,
          segmentos: currentSegmentos.filter((c) => c !== codigoMacro),
          subsegmentos: currentSub.filter((sub) => !subCodigos.includes(sub)),
        };
      }

      if (isBasicoAtivo) {
        return {
          ...prev,
          segmentos: [codigoMacro],
          subsegmentos: subCodigos,
        };
      }

      return {
        ...prev,
        segmentos: [...currentSegmentos, codigoMacro],
        subsegmentos: Array.from(new Set([...currentSub, ...subCodigos])),
      };
    });
  };

  const handleToggleSubsegmento = (codigoSub: string) => {
    if (bloqueadoPlanoBasico30Dias) return;
    setEmpresa((prev) => {
      const current = prev.subsegmentos || [];
      const updated = current.includes(codigoSub)
        ? current.filter((s) => s !== codigoSub)
        : [...current, codigoSub];
      return { ...prev, subsegmentos: updated };
    });
  };

  const handleToggleUf = (sigla: string) => {
    if (bloqueadoPlanoBasico30Dias) return;
    setEmpresa((prev) => {
      if (isBasicoAtivo) {
        return { ...prev, ufs: [sigla], brasilInteiro: false };
      }
      const current = prev.ufs || [];
      const updated = current.includes(sigla)
        ? current.filter((u) => u !== sigla)
        : [...current, sigla];
      return { ...prev, ufs: updated };
    });
  };

  const handleSalvarEmpresa = async () => {
    setSalvandoEmpresa(true);
    try {
      const url = activeTenantId
        ? `/api/configuracoes/empresa?tenantId=${encodeURIComponent(activeTenantId)}`
        : "/api/configuracoes/empresa";
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...empresa, tenantId: activeTenantId }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setNotificacao({ tipo: "success", texto: "Dados e escopo da empresa atualizados com sucesso!" });
        if (data.empresa) {
          setEmpresa((prev) => ({
            ...prev,
            ...data.empresa,
            cnaesSecundarios: data.empresa.cnaesSecundarios ?? prev.cnaesSecundarios ?? [],
            segmentos: data.empresa.segmentos || prev.segmentos || [],
            subsegmentos: data.empresa.subsegmentos || prev.subsegmentos || [],
            ufs: data.empresa.ufs || prev.ufs || [],
            brasilInteiro: data.empresa.brasilInteiro ?? prev.brasilInteiro ?? true,
            preferenciasUpdatedAt: data.empresa.preferenciasUpdatedAt || prev.preferenciasUpdatedAt || null,
          }));
        }
        await carregarTenants();
      } else {
        setNotificacao({ tipo: "error", texto: data.error || "Falha ao salvar dados da empresa." });
      }
    } catch {
      setNotificacao({ tipo: "error", texto: "Erro na comunicação com o servidor." });
    } finally {
      setSalvandoEmpresa(false);
    }
  };

  const handleAdicionarCnaeSecundario = () => {
    const val = novoCnaeSecundario.trim();
    if (!val) return;
    const matchCatalogo = CATALOGO_CNAE.find(
      (c) => c.codigo.toLowerCase() === val.toLowerCase(),
    );
    const formatted = matchCatalogo ? `${matchCatalogo.codigo} - ${matchCatalogo.descricao}` : val;
    setEmpresa((prev) => {
      const atuais = Array.isArray(prev.cnaesSecundarios) ? prev.cnaesSecundarios : [];
      if (atuais.some((c) => c.toLowerCase() === formatted.toLowerCase())) {
        return prev;
      }
      return {
        ...prev,
        cnaesSecundarios: [...atuais, formatted],
      };
    });
    setNovoCnaeSecundario("");
  };

  const handleRemoverCnaeSecundario = (cnaeAlvo: string) => {
    setEmpresa((prev) => ({
      ...prev,
      cnaesSecundarios: (prev.cnaesSecundarios || []).filter((c) => c !== cnaeAlvo),
    }));
  };

  const handleImportarCartaoCnpj = async () => {
    if (!arquivoCartaoCnpj) {
      setNotificacao({ tipo: "error", texto: "Selecione o arquivo PDF ou imagem do Cartão CNPJ." });
      return;
    }

    setEnviandoCartaoCnpj(true);
    try {
      const formData = new FormData();
      formData.set("file", arquivoCartaoCnpj);
      formData.set("modo", "atualizar_ativo");
      if (activeTenantId) formData.set("tenantId", activeTenantId);

      const url = activeTenantId
        ? `/api/configuracoes/empresa/cartao-cnpj?tenantId=${encodeURIComponent(activeTenantId)}`
        : "/api/configuracoes/empresa/cartao-cnpj";

      const res = await fetch(url, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setNotificacao({
          tipo: "error",
          texto: data.error || "Não foi possível importar os dados do Cartão CNPJ.",
        });
        return;
      }

      if (data.empresa) {
        setEmpresa((prev) => ({
          ...prev,
          ...data.empresa,
          cnaesSecundarios: data.empresa.cnaesSecundarios ?? prev.cnaesSecundarios ?? [],
          segmentos: data.empresa.segmentos || prev.segmentos || [],
          subsegmentos: data.empresa.subsegmentos || prev.subsegmentos || [],
          ufs: data.empresa.ufs || prev.ufs || [],
          brasilInteiro: data.empresa.brasilInteiro ?? prev.brasilInteiro ?? true,
          preferenciasUpdatedAt: data.empresa.preferenciasUpdatedAt || prev.preferenciasUpdatedAt || null,
        }));

        if (activeTenantId) {
          setTenants((prev) =>
            prev.map((t) =>
              t.id === activeTenantId
                ? {
                    ...t,
                    razaoSocial: data.empresa.razaoSocial || t.razaoSocial,
                    nomeFantasia: data.empresa.nomeFantasia ?? t.nomeFantasia,
                    cnpj: data.empresa.cnpj || t.cnpj,
                  }
                : t,
            ),
          );
        }
      }

      setModalUploadCartao(false);
      setArquivoCartaoCnpj(null);
      setNotificacao({
        tipo: "success",
        texto:
          "Cartão CNPJ importado! Dados cadastrais preenchidos e documento arquivado sem validade em /documentacao.",
      });
    } catch {
      setNotificacao({
        tipo: "error",
        texto: "Erro na comunicação com o servidor ao processar o Cartão CNPJ.",
      });
    } finally {
      setEnviandoCartaoCnpj(false);
    }
  };

  const handleCadastrarNovoCnpj = async () => {
    if (!novoCnpjForm.cnpj || !novoCnpjForm.razaoSocial) {
      setNotificacao({ tipo: "error", texto: "Preencha ao menos CNPJ e Razão Social." });
      return;
    }

    setSalvandoNovoCnpj(true);
    try {
      const res = await fetch("/api/configuracoes/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(novoCnpjForm),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setModalNovoCnpj(false);
        setNovoCnpjForm({
          cnpj: "",
          razaoSocial: "",
          nomeFantasia: "",
          cnaePrincipal: "",
          uf: "",
          cidade: "",
          endereco: "",
        });
        setNotificacao({ tipo: "success", texto: "Novo CNPJ cadastrado com sucesso!" });
        await carregarTenants();
        if (data.activeTenantId) {
          setActiveTenantId(data.activeTenantId);
          carregarEmpresa(data.activeTenantId);
          carregarEquipe();
        }
      } else {
        setNotificacao({ tipo: "error", texto: data.error || "Erro ao cadastrar novo CNPJ." });
      }
    } catch {
      setNotificacao({ tipo: "error", texto: "Erro na comunicação com o servidor." });
    } finally {
      setSalvandoNovoCnpj(false);
    }
  };

  // ==========================================
  // Handlers Equipe
  // ==========================================

  const handleCriarMembro = async () => {
    if (!novoNome || !novoEmail || !novaSenhaMembro) {
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
          password: novaSenhaMembro,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setModalNovoMembro(false);
        setNovoNome("");
        setNovoEmail("");
        setNovaSenhaMembro("");
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

    if (membroSelecionado.id === currentUser?.id && editAtivo === false) {
      setNotificacao({ tipo: "error", texto: "O próprio usuário não pode inativar sua própria conta." });
      return;
    }

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

  return (
    <ModulePageShell routePath="/configuracoes">
      {/* Top Header Bar */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.25rem" }}>
              <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 600 }}>
                Configurações Corporativas
              </h1>
            </div>
            <p style={{ margin: 0, color: "var(--cds-text-secondary)", fontSize: "0.875rem" }}>
              Gestão de perfil de usuário, dados societários da empresa licitante e controle de membros da equipe.
            </p>
          </div>
        </div>

      </div>

      {/* Toast Dinâmico Flutuante com Auto-Dismiss (Visível em qualquer rolagem) */}
      {notificacao && (
        <div
          data-testid="config-toast-container"
          style={{
            position: "fixed",
            bottom: "2rem",
            right: "2rem",
            zIndex: 99999,
            maxWidth: "460px",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4)",
          }}
        >
          <ToastNotification
            kind={notificacao.tipo}
            title={notificacao.tipo === "success" ? "Sucesso" : notificacao.tipo === "warning" ? "Atenção" : "Erro"}
            subtitle={notificacao.texto}
            caption={new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            timeout={5000}
            onClose={() => setNotificacao(null)}
            data-testid="config-toast-notification"
          />
        </div>
      )}

      {/* Tabs Principais */}
      <Tabs
        selectedIndex={Math.max(0, availableTabs.findIndex((t) => t.id === abaSelecionada))}
        onChange={({ selectedIndex }) => {
          const target = availableTabs[selectedIndex];
          if (target) setAbaSelecionada(target.id);
        }}
      >
        <TabList aria-label="Abas de Configurações" contained>
          {availableTabs.map((tab) => (
            <Tab
              key={tab.id}
              renderIcon={tab.icon}
              onClick={() => {
                setAbaSelecionada(tab.id);
              }}
            >
              {tab.label}
            </Tab>
          ))}
        </TabList>
      </Tabs>

      <div style={{ padding: "1.5rem 0" }}>
        {/* ========================================================
            ABA 1: MEU PERFIL (3 Cards + Card Sessão Ativa)
        ======================================================== */}
        {abaSelecionada === 0 && (
          <Grid style={{ padding: 0 }}>
            {/* Coluna Principal: Os 3 Cards de Perfil */}
            <Column lg={10} md={8} sm={4}>
              <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                {/* CARD 1 — DADOS PESSOAIS */}
                <Tile style={{ padding: "1.5rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
                    <UserIcon size={20} />
                    <h2 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600 }}>
                      Card 1 — Dados Pessoais
                    </h2>
                  </div>
                  <p style={{ fontSize: "0.8125rem", color: "var(--cds-text-secondary)", marginBottom: "1rem" }}>
                    Informações cadastrais do seu usuário no Portal de Licitações.
                  </p>

                  <Grid style={{ padding: 0 }}>
                    <Column lg={8} md={4} sm={4} style={{ marginBottom: "1rem" }}>
                      <TextInput
                        id="perfil-nome"
                        labelText="Nome Completo *"
                        value={perfil.name}
                        onChange={(e) => setPerfil({ ...perfil, name: e.target.value })}
                        placeholder="Seu nome completo"
                      />
                    </Column>
                    <Column lg={8} md={4} sm={4} style={{ marginBottom: "1rem" }}>
                      <TextInput
                        id="perfil-email"
                        labelText="E-mail (Não pode ser alterado)"
                        value={perfil.email}
                        disabled
                        helperText="Identificador único da sua conta"
                      />
                    </Column>
                    <Column lg={8} md={4} sm={4}>
                      <TextInput
                        id="perfil-cpf"
                        labelText="CPF"
                        value={perfil.cpf || ""}
                        onChange={(e) => setPerfil({ ...perfil, cpf: maskCpf(e.target.value) })}
                        placeholder="000.000.000-00"
                      />
                    </Column>
                    <Column lg={8} md={4} sm={4}>
                      <TextInput
                        id="perfil-telefone"
                        labelText="Telefone / WhatsApp"
                        value={perfil.telefone || ""}
                        onChange={(e) => setPerfil({ ...perfil, telefone: maskPhone(e.target.value) })}
                        placeholder="(00) 00000-0000"
                      />
                    </Column>
                  </Grid>
                </Tile>

                {/* CARD 2 — ENDEREÇO */}
                <Tile style={{ padding: "1.5rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
                    <Location size={20} />
                    <h2 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600 }}>
                      Card 2 — Endereço Residencial
                    </h2>
                  </div>
                  <p style={{ fontSize: "0.8125rem", color: "var(--cds-text-secondary)", marginBottom: "1rem" }}>
                    Digite seu CEP de 8 dígitos para preenchimento automático via ViaCEP.
                  </p>

                  <Grid style={{ padding: 0 }}>
                    <Column lg={4} md={3} sm={4} style={{ marginBottom: "1rem" }}>
                      <TextInput
                        id="perfil-cep"
                        labelText="CEP"
                        value={perfil.cep || ""}
                        onChange={(e) => {
                          const v = maskCep(e.target.value);
                          setPerfil({ ...perfil, cep: v });
                          if (v.replace(/\D/g, "").length === 8) {
                            handleConsultarCepPerfil(v);
                          }
                        }}
                        onBlur={() => {
                          if (perfil.cep) handleConsultarCepPerfil(perfil.cep);
                        }}
                        placeholder="00000-000"
                        helperText={buscandoCepPerfil ? "Buscando endereço..." : "Auto-busca ao digitar 8 dígitos"}
                      />
                    </Column>
                    <Column lg={9} md={5} sm={4} style={{ marginBottom: "1rem" }}>
                      <TextInput
                        id="perfil-logradouro"
                        labelText="Rua / Logradouro"
                        value={perfil.logradouro || ""}
                        onChange={(e) => setPerfil({ ...perfil, logradouro: e.target.value })}
                        placeholder="Ex: Rua das Flores"
                      />
                    </Column>
                    <Column lg={3} md={2} sm={4} style={{ marginBottom: "1rem" }}>
                      <TextInput
                        id="perfil-numero"
                        labelText="Número"
                        value={perfil.numero || ""}
                        onChange={(e) => setPerfil({ ...perfil, numero: e.target.value })}
                        placeholder="123"
                      />
                    </Column>
                    <Column lg={5} md={3} sm={4}>
                      <TextInput
                        id="perfil-complemento"
                        labelText="Complemento"
                        value={perfil.complemento || ""}
                        onChange={(e) => setPerfil({ ...perfil, complemento: e.target.value })}
                        placeholder="Apto, Sala, Bloco..."
                      />
                    </Column>
                    <Column lg={5} md={3} sm={4}>
                      <TextInput
                        id="perfil-bairro"
                        labelText="Bairro"
                        value={perfil.bairro || ""}
                        onChange={(e) => setPerfil({ ...perfil, bairro: e.target.value })}
                        placeholder="Bairro"
                      />
                    </Column>
                    <Column lg={4} md={3} sm={3}>
                      <TextInput
                        id="perfil-cidade"
                        labelText="Cidade"
                        value={perfil.cidade || ""}
                        onChange={(e) => setPerfil({ ...perfil, cidade: e.target.value })}
                        placeholder="Cidade"
                      />
                    </Column>
                    <Column lg={2} md={1} sm={1}>
                      <TextInput
                        id="perfil-uf"
                        labelText="Estado (UF)"
                        value={perfil.uf || ""}
                        onChange={(e) => setPerfil({ ...perfil, uf: e.target.value.toUpperCase().slice(0, 2) })}
                        placeholder="UF"
                      />
                    </Column>
                  </Grid>
                </Tile>

                {/* CARD 3 — SEGURANÇA */}
                <Tile style={{ padding: "1.5rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
                    <Security size={20} />
                    <h2 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600 }}>
                      Card 3 — Segurança & Alteração de Senha
                    </h2>
                  </div>
                  <p style={{ fontSize: "0.8125rem", color: "var(--cds-text-secondary)", marginBottom: "1rem" }}>
                    Deixe os campos abaixo em branco caso não queira alterar sua senha atual.
                  </p>

                  <Grid style={{ padding: 0 }}>
                    <Column lg={8} md={4} sm={4}>
                      <TextInput
                        id="perfil-nova-senha"
                        type="password"
                        labelText="Nova Senha"
                        value={novaSenha}
                        onChange={(e) => setNovaSenha(e.target.value)}
                        placeholder="Digite para alterar a senha"
                        helperText="Mínimo de 6 caracteres"
                      />
                    </Column>
                    <Column lg={8} md={4} sm={4}>
                      <TextInput
                        id="perfil-confirmar-senha"
                        type="password"
                        labelText="Confirmar Nova Senha"
                        value={confirmarNovaSenha}
                        onChange={(e) => setConfirmarNovaSenha(e.target.value)}
                        placeholder="Confirme a nova senha"
                      />
                    </Column>
                  </Grid>
                </Tile>

                {/* BOTÃO SALVAR MEU PERFIL (Inferior Direito) */}
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <Button
                    kind="primary"
                    size="lg"
                    renderIcon={Save}
                    onClick={handleSalvarPerfil}
                    disabled={salvandoPerfil}
                    id="btn-salvar-meu-perfil"
                  >
                    {salvandoPerfil ? <InlineLoading description="Salvando..." /> : "Salvar Meu Perfil"}
                  </Button>
                </div>
              </div>
            </Column>

            {/* Coluna Lateral: Card Sessão Ativa */}
            <Column lg={6} md={8} sm={4}>
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
                    {(perfil.name || currentUser?.name || "Usuário")
                      .split(" ")
                      .filter(Boolean)
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join("")
                      .toUpperCase() || "US"}
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600 }}>
                      {perfil.name || currentUser?.name || "Usuário"}
                    </h3>
                    <div style={{ color: "var(--cds-text-secondary)", fontSize: "0.875rem" }}>
                      {perfil.email || currentUser?.email || ""}
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                      <Tag type="blue" size="sm">
                        {userRole === "SUPERADMIN"
                          ? "SUPERADMIN"
                          : userRole === "DIRETORIA"
                          ? "DIRETORIA (Titular)"
                          : "ANALISTA COMERCIAL"}
                      </Tag>
                      <Tag type="green" size="sm">
                        PLANO {planoAtual}
                      </Tag>
                    </div>
                  </div>
                </div>

                <div style={{ paddingTop: "1rem", borderTop: "1px solid var(--cds-border-subtle)" }}>
                  <h4 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                    Sessão Ativa
                  </h4>
                  <p style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)", marginBottom: "1rem" }}>
                    Encerre a sessão atual para sair com segurança da conta.
                  </p>
                  <Button
                    kind="danger--ghost"
                    size="md"
                    renderIcon={Logout}
                    onClick={() => {
                      if (typeof window !== "undefined") {
                        document.cookie = "portal_licitacao_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
                        document.cookie = "portal_licitacao_active_tenant=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
                        localStorage.clear();
                        sessionStorage.clear();
                        fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
                      }
                      signOut({ callbackUrl: "/login" });
                    }}
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

        {/* ========================================================
            ABA 2: DADOS DA EMPRESA LICITANTE & MULTI-CNPJ
        ======================================================== */}
        {abaSelecionada === 1 && (
          <Tile style={{ padding: "1.5rem" }}>
            {/* Topo da Aba: Seletor Multi-CNPJ e Botão Adicionar CNPJ */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-end",
                marginBottom: "1.5rem",
                paddingBottom: "1.5rem",
                borderBottom: "1px solid var(--cds-border-subtle)",
                flexWrap: "wrap",
                gap: "1rem",
              }}
            >
              <div style={{ flex: 1, minWidth: "280px", maxWidth: "550px" }}>
                <Select
                  id="seletor-multi-cnpj"
                  labelText="Empresa Ativa (CNPJ) *"
                  value={activeTenantId}
                  onChange={(e) => handleTrocarTenantAtivo(e.target.value)}
                  helperText="Alterne entre as empresas cadastradas sob seu acesso corporativo"
                >
                  {tenants.map((t) => (
                    <SelectItem
                      key={t.id}
                      value={t.id}
                      text={`${t.razaoSocial} — ${maskCnpj(t.cnpj)} (${t.plano})`}
                    />
                  ))}
                  {tenants.length === 0 && (
                    <SelectItem
                      value={activeTenantId || "default"}
                      text={`${empresa.razaoSocial || "Empresa Padrão"} — ${maskCnpj(empresa.cnpj || "12.345.678/0001-90")}`}
                    />
                  )}
                </Select>
              </div>

              <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
                <Button
                  kind="tertiary"
                  size="md"
                  renderIcon={Upload}
                  onClick={() => setModalUploadCartao(true)}
                  id="btn-upload-cartao-cnpj"
                >
                  Upload Cartão CNPJ
                </Button>
                <span title={tooltipAddCnpj}>
                  <Button
                    kind="secondary"
                    size="md"
                    renderIcon={Add}
                    onClick={() => setModalNovoCnpj(true)}
                    disabled={!canAddCnpj}
                    id="btn-adicionar-cnpj"
                    title={tooltipAddCnpj}
                  >
                    Adicionar CNPJ
                  </Button>
                </span>
              </div>
            </div>

            {/* Aviso Regra de Plano Básico (1 UF / 1 Segmento) */}
            {planoAtual === "BASICO" && billingStatus !== "TRIAL" && (
              <InlineNotification
                kind="warning"
                title="Plano Básico Ativo — Escopo Limitado a 1 Segmento e 1 UF"
                subtitle="O seu plano atual monitora exclusivamente a UF da sede da empresa e o 1º segmento cadastrado. Faça upgrade para o Plano Pro ou Enterprise para monitorar múltiplos segmentos e todo o Brasil."
                style={{ marginBottom: "1.5rem" }}
              />
            )}

            {/* SEÇÃO 1: IDENTIFICAÇÃO SOCIETÁRIA & CNPJ */}
            <h3 style={{ fontSize: "0.9375rem", fontWeight: 600, marginBottom: "0.75rem", borderBottom: "1px solid var(--cds-border-subtle)", paddingBottom: "0.5rem" }}>
              1. Identificação Societária & Dados do CNPJ
            </h3>
            <Grid style={{ padding: 0, marginBottom: "1.5rem" }}>
              <Column lg={6} md={4} sm={4}>
                <TextInput
                  id="empresa-razao"
                  labelText="Razão Social da Empresa *"
                  value={empresa.razaoSocial}
                  onChange={(e) => setEmpresa({ ...empresa, razaoSocial: e.target.value })}
                />
              </Column>
              <Column lg={6} md={4} sm={4}>
                <TextInput
                  id="empresa-fantasia"
                  labelText="Nome Fantasia"
                  placeholder="Nome Fantasia da Empresa"
                  value={empresa.nomeFantasia || ""}
                  onChange={(e) => setEmpresa({ ...empresa, nomeFantasia: e.target.value })}
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
              <Column lg={3} md={2} sm={4}>
                <TextInput
                  id="empresa-ie"
                  labelText="Inscrição Estadual"
                  value={empresa.inscricaoEstadual || ""}
                  onChange={(e) => setEmpresa({ ...empresa, inscricaoEstadual: e.target.value })}
                />
              </Column>
              <Column lg={3} md={2} sm={4}>
                <TextInput
                  id="empresa-im"
                  labelText="Inscrição Municipal"
                  value={empresa.inscricaoMunicipal || ""}
                  onChange={(e) => setEmpresa({ ...empresa, inscricaoMunicipal: e.target.value })}
                  placeholder="Número de Inscrição Municipal"
                />
              </Column>
              <Column lg={11} md={5} sm={4} style={{ marginTop: "0.75rem" }}>
                <TextInput
                  id="empresa-cnae"
                  list="cnae-options-list"
                  labelText="CNAE Principal (Catálogo IBGE)"
                  placeholder="Pesquise por código ou atividade (ex: 4711-3/02, panificação, medicamentos)..."
                  value={empresa.cnae || ""}
                  onChange={(e) => setEmpresa({ ...empresa, cnae: e.target.value })}
                />
                <datalist id="cnae-options-list">
                  {CATALOGO_CNAE.map((c) => (
                    <option key={c.codigo} value={c.codigo}>
                      {c.codigo} — {c.descricao}
                    </option>
                  ))}
                </datalist>
              </Column>
              <Column
                lg={5}
                md={3}
                sm={4}
                style={{
                  marginTop: "0.75rem",
                  display: "flex",
                  alignItems: "flex-end",
                }}
              >
                <Button
                  kind="tertiary"
                  size="md"
                  renderIcon={Add}
                  type="button"
                  id="btn-cnaes-secundarios"
                  onClick={() => setModalCnaesSecundarios(true)}
                  style={{ width: "100%" }}
                >
                  CNAEs Secundários ({empresa.cnaesSecundarios?.length || 0})
                </Button>
              </Column>
            </Grid>

            {/* SEÇÃO 2: ENDEREÇO DA SEDE COM VIACEP */}
            <h3 style={{ fontSize: "0.9375rem", fontWeight: 600, marginBottom: "0.75rem", borderBottom: "1px solid var(--cds-border-subtle)", paddingBottom: "0.5rem" }}>
              2. Endereço da Sede Corporativa
            </h3>
            <Grid style={{ padding: 0, marginBottom: "1.5rem" }}>
              <Column lg={3} md={2} sm={4}>
                <TextInput
                  id="empresa-cep"
                  labelText="CEP *"
                  value={empresa.cep || ""}
                  onChange={(e) => {
                    const v = maskCep(e.target.value);
                    setEmpresa({ ...empresa, cep: v });
                    if (v.replace(/\D/g, "").length === 8) {
                      handleConsultarCepEmpresa(v);
                    }
                  }}
                  onBlur={() => {
                    if (empresa.cep) handleConsultarCepEmpresa(empresa.cep);
                  }}
                  helperText={buscandoCepEmpresa ? "Buscando ViaCEP..." : "Auto-busca ao digitar 8 dígitos"}
                />
              </Column>
              <Column lg={7} md={4} sm={4}>
                <TextInput
                  id="empresa-endereco"
                  labelText="Logradouro / Rua *"
                  value={empresa.endereco || ""}
                  onChange={(e) => setEmpresa({ ...empresa, endereco: e.target.value })}
                />
              </Column>
              <Column lg={2} md={1} sm={2}>
                <TextInput
                  id="empresa-numero"
                  labelText="Número"
                  value={empresa.numero || ""}
                  onChange={(e) => setEmpresa({ ...empresa, numero: e.target.value })}
                />
              </Column>
              <Column lg={4} md={2} sm={2}>
                <TextInput
                  id="empresa-complemento"
                  labelText="Complemento"
                  value={empresa.complemento || ""}
                  onChange={(e) => setEmpresa({ ...empresa, complemento: e.target.value })}
                />
              </Column>
              <Column lg={6} md={3} sm={4} style={{ marginTop: "0.75rem" }}>
                <TextInput
                  id="empresa-bairro"
                  labelText="Bairro"
                  value={empresa.bairro || ""}
                  onChange={(e) => setEmpresa({ ...empresa, bairro: e.target.value })}
                />
              </Column>
              <Column lg={6} md={3} sm={4} style={{ marginTop: "0.75rem" }}>
                <TextInput
                  id="empresa-cidade"
                  labelText="Cidade *"
                  value={empresa.cidade || ""}
                  onChange={(e) => setEmpresa({ ...empresa, cidade: e.target.value })}
                />
              </Column>
              <Column lg={4} md={2} sm={4} style={{ marginTop: "0.75rem" }}>
                <TextInput
                  id="empresa-uf"
                  labelText="UF *"
                  value={empresa.uf || ""}
                  onChange={(e) => setEmpresa({ ...empresa, uf: e.target.value.toUpperCase().slice(0, 2) })}
                />
              </Column>
            </Grid>

            {/* SEÇÃO 3: REPRESENTANTE LEGAL */}
            <h3 style={{ fontSize: "0.9375rem", fontWeight: 600, marginBottom: "0.75rem", borderBottom: "1px solid var(--cds-border-subtle)", paddingBottom: "0.5rem" }}>
              3. Representante Legal (Assinante Padrão)
            </h3>
            <Grid style={{ padding: 0, marginBottom: "1.5rem" }}>
              <Column lg={6} md={3} sm={4}>
                <TextInput
                  id="empresa-rep-nome"
                  labelText="Nome Completo *"
                  value={empresa.representanteNome || ""}
                  onChange={(e) => setEmpresa({ ...empresa, representanteNome: e.target.value })}
                />
              </Column>
              <Column lg={4} md={2} sm={4}>
                <TextInput
                  id="empresa-rep-cpf"
                  labelText="CPF *"
                  value={empresa.representanteCpf || ""}
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
                  value={empresa.representanteCargo || ""}
                  onChange={(e) => setEmpresa({ ...empresa, representanteCargo: e.target.value })}
                />
              </Column>
            </Grid>

            {/* SEÇÃO 4: DADOS BANCÁRIOS */}
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

            {/* SEÇÃO 5: IDENTIDADE VISUAL & PAPEL TIMBRADO */}
            <h3 style={{ fontSize: "0.9375rem", fontWeight: 600, marginTop: "2rem", marginBottom: "0.75rem", borderBottom: "1px solid var(--cds-border-subtle)", paddingBottom: "0.5rem" }}>
              5. Identidade Visual & Papel Timbrado Oficial (Multi-CNPJ)
            </h3>
            <p style={{ margin: "0 0 1rem 0", color: "var(--cds-text-secondary)", fontSize: "0.8125rem" }}>
              A logomarca e o papel timbrado cadastrados serão aplicados automaticamente nas Minutas de Impugnação (TCU), Declarações Oficiais e Relatórios Executivos deste CNPJ. Caso não faça upload de um arquivo, o sistema gera o timbrado padrão com os dados societários.
            </p>
            <Grid style={{ padding: 0, marginBottom: "1.5rem" }}>
              <Column lg={8} md={4} sm={4}>
                <div
                  data-testid="dropzone-logo-empresa"
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverLogo(true);
                  }}
                  onDragLeave={() => setDragOverLogo(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverLogo(false);
                    const file = e.dataTransfer.files?.[0];
                    if (!file) return;
                    if (file.size > 2 * 1024 * 1024) {
                      setNotificacao({ tipo: "error", texto: "A logomarca deve ter no máximo 2MB." });
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                      setEmpresa((prev) => ({ ...prev, logoUrl: reader.result as string }));
                      setNotificacao({ tipo: "success", texto: "Logomarca carregada via arrastar e soltar. Clique em 'Salvar Alterações da Empresa' para gravar." });
                    };
                    reader.readAsDataURL(file);
                  }}
                  style={{
                    padding: "1rem",
                    backgroundColor: dragOverLogo ? "rgba(15, 98, 254, 0.08)" : "var(--cds-layer-01)",
                    borderRadius: "4px",
                    border: dragOverLogo ? "2px dashed var(--cds-interactive, #0f62fe)" : "1px dashed var(--cds-border-subtle)",
                    height: "100%",
                    transition: "all 0.2s ease",
                  }}
                >
                  <strong style={{ fontSize: "0.875rem", display: "block", marginBottom: "0.5rem" }}>
                    🖼️ Logomarca da Empresa (PNG / JPG) — Arraste e solte o arquivo aqui
                  </strong>
                  <p style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginBottom: "0.75rem" }}>
                    Recomendado: Fundo transparente ou branco, altura de até 150px.
                  </p>

                  <input
                    type="file"
                    accept="image/png, image/jpeg, image/jpg"
                    id="upload-logo-empresa"
                    style={{ display: "none" }}
                    onClick={(e) => {
                      (e.target as HTMLInputElement).value = "";
                    }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 2 * 1024 * 1024) {
                        setNotificacao({ tipo: "error", texto: "A logomarca deve ter no máximo 2MB." });
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = () => {
                        setEmpresa((prev) => ({ ...prev, logoUrl: reader.result as string }));
                        setNotificacao({ tipo: "success", texto: "Logomarca carregada. Clique em 'Salvar Alterações da Empresa' para gravar." });
                      };
                      reader.readAsDataURL(file);
                    }}
                  />

                  {empresa.logoUrl ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", alignItems: "flex-start" }}>
                      <div style={{ padding: "0.5rem", background: "#ffffff", borderRadius: "4px", border: "1px solid #e0e0e0" }}>
                        <img src={empresa.logoUrl} alt="Logo da Empresa" style={{ maxHeight: "60px", maxWidth: "200px", objectFit: "contain", display: "block" }} />
                      </div>
                      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                        <label htmlFor="upload-logo-empresa" style={{ margin: 0 }}>
                          <Button kind="tertiary" size="sm" as="span">
                            Substituir Logomarca
                          </Button>
                        </label>
                        <Button
                          kind="ghost"
                          size="sm"
                          onClick={() => setEmpresa((prev) => ({ ...prev, logoUrl: null }))}
                        >
                          Remover Logo
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label htmlFor="upload-logo-empresa" style={{ margin: 0 }}>
                        <Button kind="tertiary" size="sm" as="span">
                          Selecionar Imagem da Logo
                        </Button>
                      </label>
                    </div>
                  )}
                </div>
              </Column>

              <Column lg={8} md={4} sm={4}>
                <div
                  data-testid="dropzone-timbrado-empresa"
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverTimbrado(true);
                  }}
                  onDragLeave={() => setDragOverTimbrado(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverTimbrado(false);
                    const file = e.dataTransfer.files?.[0];
                    if (!file) return;
                    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
                    if (!isPdf) {
                      setNotificacao({ tipo: "error", texto: "Apenas arquivos em formato PDF (.pdf) são aceitos para a folha timbrada." });
                      return;
                    }
                    if (file.size > 5 * 1024 * 1024) {
                      setNotificacao({ tipo: "error", texto: "O arquivo PDF timbrado deve ter no máximo 5MB." });
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                      setEmpresa((prev) => ({ ...prev, papelTimbradoUrl: reader.result as string }));
                      setNotificacao({ tipo: "success", texto: "Folha timbrada em PDF carregada via arrastar e soltar! Clique em 'Salvar Alterações da Empresa' para gravar." });
                    };
                    reader.readAsDataURL(file);
                  }}
                  style={{
                    padding: "1rem",
                    backgroundColor: dragOverTimbrado ? "rgba(15, 98, 254, 0.08)" : "var(--cds-layer-01)",
                    borderRadius: "4px",
                    border: dragOverTimbrado ? "2px dashed var(--cds-interactive, #0f62fe)" : "1px dashed var(--cds-border-subtle)",
                    height: "100%",
                    transition: "all 0.2s ease",
                  }}
                >
                  <strong style={{ fontSize: "0.875rem", display: "block", marginBottom: "0.5rem" }}>
                    📄 Folha de Papel Timbrado Oficial (Apenas PDF) — Arraste e solte aqui
                  </strong>
                  <p style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginBottom: "0.75rem" }}>
                    Faça upload da folha timbrada oficial em formato PDF (A4 com cabeçalho e rodapé institucionais). Esse modelo será o plano de fundo dos documentos gerados.
                  </p>
                  <p style={{ fontSize: "0.6875rem", color: "var(--cds-text-helper)", marginBottom: "0.75rem", fontStyle: "italic" }}>
                    💡 Se você anexar a Folha Timbrada em PDF, ela será o fundo oficial e o logo avulso não será duplicado por cima. A Logomarca ao lado é utilizada quando não houver papel timbrado em PDF.
                  </p>

                  <input
                    type="file"
                    accept="application/pdf"
                    id="upload-timbrado-empresa"
                    style={{ display: "none" }}
                    onClick={(e) => {
                      (e.target as HTMLInputElement).value = "";
                    }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
                      if (!isPdf) {
                        setNotificacao({ tipo: "error", texto: "Apenas arquivos em formato PDF (.pdf) são aceitos para a folha timbrada." });
                        return;
                      }
                      if (file.size > 5 * 1024 * 1024) {
                        setNotificacao({ tipo: "error", texto: "O arquivo PDF timbrado deve ter no máximo 5MB." });
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = () => {
                        setEmpresa((prev) => ({ ...prev, papelTimbradoUrl: reader.result as string }));
                        setNotificacao({ tipo: "success", texto: "Folha timbrada em PDF carregada! Clique em 'Salvar Alterações da Empresa' para gravar." });
                      };
                      reader.readAsDataURL(file);
                    }}
                  />

                  {empresa.papelTimbradoUrl ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", alignItems: "flex-start" }}>
                      <Tag type="teal" size="sm">
                        ✓ Folha Timbrada em PDF Anexada
                      </Tag>
                      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                        <label htmlFor="upload-timbrado-empresa" style={{ margin: 0 }}>
                          <Button kind="tertiary" size="sm" as="span">
                            Substituir Timbrado (PDF)
                          </Button>
                        </label>
                        <Button
                          kind="ghost"
                          size="sm"
                          onClick={() => setEmpresa((prev) => ({ ...prev, papelTimbradoUrl: null }))}
                        >
                          Remover Timbrado Personalizado
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label htmlFor="upload-timbrado-empresa" style={{ margin: 0 }}>
                        <Button kind="tertiary" size="sm" as="span">
                          Selecionar Folha Timbrada (PDF)
                        </Button>
                      </label>
                    </div>
                  )}
                </div>
              </Column>
            </Grid>

            {/* Uploads Adicionais Drag-and-Drop: Assinatura Digital e Catálogo CSV (Item 1) */}
            <Grid style={{ padding: 0, marginBottom: "1.5rem" }}>
              <Column lg={8} md={4} sm={4}>
                <div
                  data-testid="dropzone-assinatura-digital"
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverAssinatura(true);
                  }}
                  onDragLeave={() => setDragOverAssinatura(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverAssinatura(false);
                    const file = e.dataTransfer.files?.[0];
                    if (!file) return;
                    if (file.size > 2 * 1024 * 1024) {
                      setNotificacao({ tipo: "error", texto: "A assinatura digitalizada deve ter no máximo 2MB." });
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                      setAssinaturaDigitalUrl(reader.result as string);
                      setNotificacao({ tipo: "success", texto: "Assinatura digital carregada via arrastar e soltar." });
                    };
                    reader.readAsDataURL(file);
                  }}
                  style={{
                    padding: "1rem",
                    backgroundColor: dragOverAssinatura ? "rgba(15, 98, 254, 0.08)" : "var(--cds-layer-01)",
                    borderRadius: "4px",
                    border: dragOverAssinatura ? "2px dashed var(--cds-interactive, #0f62fe)" : "1px dashed var(--cds-border-subtle)",
                    height: "100%",
                    transition: "all 0.2s ease",
                  }}
                >
                  <strong style={{ fontSize: "0.875rem", display: "block", marginBottom: "0.5rem" }}>
                    ✍️ Assinatura Digital do Representante (PNG / JPG) — Arraste e solte
                  </strong>
                  <p style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginBottom: "0.75rem" }}>
                    Anexe a assinatura escaneada em fundo transparente para aposição em propostas e declarações.
                  </p>

                  <input
                    type="file"
                    accept="image/png, image/jpeg, image/jpg"
                    id="upload-assinatura-digital"
                    data-testid="upload-assinatura-digital"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 2 * 1024 * 1024) {
                        setNotificacao({ tipo: "error", texto: "A assinatura deve ter no máximo 2MB." });
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = () => {
                        setAssinaturaDigitalUrl(reader.result as string);
                        setNotificacao({ tipo: "success", texto: "Assinatura digitalizada carregada." });
                      };
                      reader.readAsDataURL(file);
                    }}
                  />

                  {assinaturaDigitalUrl ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", alignItems: "flex-start" }}>
                      <Tag type="green" size="sm">✓ Assinatura Digital Carregada</Tag>
                      <Button kind="ghost" size="sm" onClick={() => setAssinaturaDigitalUrl(null)}>
                        Remover Assinatura
                      </Button>
                    </div>
                  ) : (
                    <div>
                      <label htmlFor="upload-assinatura-digital" style={{ margin: 0 }}>
                        <Button kind="tertiary" size="sm" as="span">
                          Selecionar Assinatura Digital
                        </Button>
                      </label>
                    </div>
                  )}
                </div>
              </Column>

              <Column lg={8} md={4} sm={4}>
                <div
                  data-testid="dropzone-csv-precos"
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverCsv(true);
                  }}
                  onDragLeave={() => setDragOverCsv(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverCsv(false);
                    const file = e.dataTransfer.files?.[0];
                    if (!file) return;
                    if (!file.name.toLowerCase().endsWith(".csv")) {
                      setNotificacao({ tipo: "error", texto: "Apenas arquivos .csv são aceitos." });
                      return;
                    }
                    setTabelaPrecosCsvNome(file.name);
                    setNotificacao({ tipo: "success", texto: `Arquivo CSV ${file.name} carregado via arrastar e soltar.` });
                  }}
                  style={{
                    padding: "1rem",
                    backgroundColor: dragOverCsv ? "rgba(15, 98, 254, 0.08)" : "var(--cds-layer-01)",
                    borderRadius: "4px",
                    border: dragOverCsv ? "2px dashed var(--cds-interactive, #0f62fe)" : "1px dashed var(--cds-border-subtle)",
                    height: "100%",
                    transition: "all 0.2s ease",
                  }}
                >
                  <strong style={{ fontSize: "0.875rem", display: "block", marginBottom: "0.5rem" }}>
                    📊 Catálogo & Tabela de Preços (Importação CSV) — Arraste e solte
                  </strong>
                  <p style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginBottom: "0.75rem" }}>
                    Importe sua planilha de custos e itens de fornecimento em formato .csv (separado por vírgula ou ponto-e-vírgula).
                  </p>

                  <input
                    type="file"
                    accept=".csv,text/csv"
                    id="upload-csv-precos"
                    data-testid="upload-csv-precos"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setTabelaPrecosCsvNome(file.name);
                      setNotificacao({ tipo: "success", texto: `Arquivo CSV ${file.name} carregado.` });
                    }}
                  />

                  {tabelaPrecosCsvNome ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", alignItems: "flex-start" }}>
                      <Tag type="purple" size="sm">✓ {tabelaPrecosCsvNome}</Tag>
                      <Button kind="ghost" size="sm" onClick={() => setTabelaPrecosCsvNome(null)}>
                        Remover CSV
                      </Button>
                    </div>
                  ) : (
                    <div>
                      <label htmlFor="upload-csv-precos" style={{ margin: 0 }}>
                        <Button kind="tertiary" size="sm" as="span">
                          Selecionar Arquivo CSV
                        </Button>
                      </label>
                    </div>
                  )}
                </div>
              </Column>
            </Grid>

            {/* SEÇÃO 5: TRIAGEM & ESCOPO DE LICITAÇÕES */}
            <div style={{ marginTop: "2rem", borderTop: "1px solid var(--cds-border-subtle)", paddingTop: "1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.5rem" }}>
                <div>
                  <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>
                    5. Triagem & Escopo de Licitações (Segmentos, Sub-segmentos e UF)
                  </h3>
                  <p style={{ margin: "0.25rem 0 0 0", color: "var(--cds-text-secondary)", fontSize: "0.8125rem" }}>
                    As informações abaixo são de extrema importância para o sistema: Segmento, SubSegmento, UF. De acordo com o que o cliente preencher aqui é que o sistema vai buscar as licitações para ele.
                  </p>
                </div>
                {isBasicoAtivo && (
                  <Tag type="warm-gray" size="sm">
                    Plano Básico: 1 Segmento & 1 UF
                  </Tag>
                )}
              </div>

              {/* Alerta Básico Ativo caso exceda limite de 1 segmento ou 1 UF */}
              {isBasicoAtivo && ((empresa.segmentos && empresa.segmentos.length > 1) || (empresa.ufs && empresa.ufs.length > 1) || empresa.brasilInteiro) && (
                <InlineNotification
                  kind="warning"
                  title="Ajuste de Escopo do Plano Básico"
                  subtitle="Sua conta possuía múltiplos segmentos ou regiões configuradas anteriormente. No Plano Básico ativo, apenas o 1º segmento e 1 UF são monitorados. Ajuste abaixo ou faça upgrade para o Plano Pro ou Enterprise para monitorar múltiplos segmentos e todo o Brasil."
                  style={{ marginBottom: "1rem" }}
                />
              )}

              {/* Alerta de Carência de 30 dias para Plano Básico */}
              {bloqueadoPlanoBasico30Dias && (
                <InlineNotification
                  kind="info"
                  title="Carência de 30 dias (Plano Básico)"
                  subtitle={`No Plano Básico, alterações de Segmentos e Estados só podem ser realizadas a cada 30 dias. Próxima alteração disponível em ${dataProximaLiberacao} (faltam ${diasRestantesDesbloqueio} dia(s)).`}
                  style={{ marginBottom: "1rem" }}
                  data-testid="banner-trava-30-dias"
                />
              )}

              {/* Segmentos & Sub-segmentos de Atuação */}
              <div style={{ marginTop: "1rem", marginBottom: "1.5rem" }}>
                <h4 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                  Segmentos & Sub-segmentos de Atuação
                </h4>
                <p style={{ fontSize: "0.8125rem", color: "var(--cds-text-secondary)", marginBottom: "0.75rem" }}>
                  {isBasicoAtivo
                    ? "Selecione o segmento principal de atuação da sua empresa (máximo de 1 segmento no Plano Básico ativo)."
                    : "Selecione os segmentos de atuação. Ao marcar um segmento, suas subcategorias vêm selecionadas por padrão."}
                </p>

                <TextInput
                  id="config-busca-segmento"
                  data-testid="config-busca-segmento"
                  labelText="Buscar segmento ou subatividade"
                  placeholder="Ex.: medicamentos, software, pavimentação"
                  value={buscaSegmento}
                  onChange={(e) => setBuscaSegmento(e.target.value)}
                  style={{ marginBottom: "0.75rem" }}
                />

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.75rem",
                    maxHeight: "32rem",
                    overflowY: "auto",
                    paddingRight: "0.25rem",
                  }}
                >
                  {filtrarCatalogoSegmentos(buscaSegmento).map((macro) => {
                    const isChecked = (empresa.segmentos || []).includes(macro.codigo);
                    return (
                      <div
                        key={macro.codigo}
                        style={{
                          border: "1px solid var(--cds-border-subtle)",
                          borderRadius: "4px",
                          padding: "0.875rem 1rem",
                          backgroundColor: isChecked
                            ? "var(--cds-layer-accent-01, rgba(69, 137, 255, 0.05))"
                            : "var(--cds-layer-02)",
                          opacity: bloqueadoPlanoBasico30Dias ? 0.6 : 1,
                        }}
                      >
                        <Checkbox
                          id={`config-macro-${macro.codigo}`}
                          labelText={macro.nome}
                          checked={isChecked}
                          disabled={bloqueadoPlanoBasico30Dias}
                          onChange={() => handleToggleMacroSegmento(macro.codigo)}
                        />
                        {isChecked && (
                          <div
                            style={{
                              marginTop: "0.5rem",
                              paddingLeft: "1.75rem",
                              display: "grid",
                              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                              gap: "0.35rem",
                            }}
                          >
                            {macro.subcategorias.map((sub) => (
                              <Checkbox
                                key={sub.codigo}
                                id={`config-sub-${sub.codigo}`}
                                labelText={sub.nome}
                                checked={(empresa.subsegmentos || []).includes(sub.codigo)}
                                disabled={bloqueadoPlanoBasico30Dias}
                                onChange={() => handleToggleSubsegmento(sub.codigo)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Região e UFs de Monitoramento */}
              <div style={{ borderTop: "1px solid var(--cds-border-subtle)", paddingTop: "1rem" }}>
                <h4 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                  Região & UFs de Monitoramento
                </h4>
                <p style={{ fontSize: "0.8125rem", color: "var(--cds-text-secondary)", marginBottom: "0.75rem" }}>
                  Indique os estados da federação onde o robô deve rastrear licitações para a sua empresa.
                </p>

                {isBasicoAtivo ? (
                  <div style={{ maxWidth: "320px", marginTop: "0.5rem" }}>
                    <Select
                      id="config-uf-unica-basico"
                      labelText="UF Monitorada (Plano Básico) *"
                      value={(empresa.ufs && empresa.ufs[0]) || empresa.uf || ""}
                      onChange={(e) => handleToggleUf(e.target.value)}
                      disabled={bloqueadoPlanoBasico30Dias}
                      helperText={bloqueadoPlanoBasico30Dias ? `Carência ativa até ${dataProximaLiberacao}` : "O Plano Básico monitora exatamente 1 UF"}
                    >
                      <SelectItem value="" text="Selecione uma UF..." />
                      {ESTADOS_BRASIL.map((uf) => (
                        <SelectItem key={uf.sigla} value={uf.sigla} text={`${uf.sigla} — ${uf.nome}`} />
                      ))}
                    </Select>
                  </div>
                ) : (
                  <div>
                    <Checkbox
                      id="config-brasil-inteiro"
                      labelText="Brasil Inteiro (Todas as 27 UFs)"
                      checked={Boolean(empresa.brasilInteiro)}
                      onChange={(_, { checked }) => setEmpresa((prev) => ({ ...prev, brasilInteiro: checked }))}
                    />

                    {!empresa.brasilInteiro && (
                      <div style={{ marginTop: "0.75rem" }}>
                        <p style={{ fontSize: "0.8125rem", color: "var(--cds-text-secondary)", marginBottom: "0.5rem" }}>
                          Selecione as UFs prioritárias para monitoramento:
                        </p>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fill, minmax(70px, 1fr))",
                            gap: "0.35rem",
                            maxHeight: "160px",
                            overflowY: "auto",
                            padding: "0.75rem",
                            border: "1px solid var(--cds-border-subtle)",
                            borderRadius: "4px",
                          }}
                        >
                          {ESTADOS_BRASIL.map((uf) => (
                            <Checkbox
                              key={uf.sigla}
                              id={`config-uf-${uf.sigla}`}
                              labelText={uf.sigla}
                              checked={(empresa.ufs || []).includes(uf.sigla)}
                              onChange={() => handleToggleUf(uf.sigla)}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Botão de Salvar no rodapé da Seção 5 */}
              <div
                style={{
                  marginTop: "1.5rem",
                  paddingTop: "1rem",
                  borderTop: "1px solid var(--cds-border-subtle)",
                  display: "flex",
                  justifyContent: "flex-end",
                }}
              >
                <Button
                  kind="primary"
                  size="md"
                  renderIcon={Save}
                  onClick={handleSalvarEmpresa}
                  disabled={salvandoEmpresa || bloqueadoPlanoBasico30Dias}
                  id="btn-salvar-empresa"
                  data-testid="btn-salvar-empresa"
                >
                  {salvandoEmpresa ? <InlineLoading description="Salvando..." /> : "Salvar Alterações"}
                </Button>
              </div>
            </div>
          </Tile>
        )}

        {/* ========================================================
            ABA 3: GESTÃO DA EQUIPE
        ======================================================== */}
        {abaSelecionada === 2 && (
          <Tile style={{ padding: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600 }}>
                  Gestão da Equipe
                </h2>
                <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--cds-text-secondary)" }}>
                  Colaboradores vinculados ao CNPJ ativo ({equipe.length}/{maxUsers} assentos ocupados).
                </p>
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <span title={isTeamLimitReached ? "Limite de colaboradores do seu plano atingido. Faça upgrade para adicionar mais assentos." : undefined}>
                  <Button
                    kind="primary"
                    size="md"
                    renderIcon={Add}
                    onClick={() => setModalNovoMembro(true)}
                    disabled={isTeamLimitReached}
                    id="btn-novo-colaborador"
                    title={isTeamLimitReached ? "Limite de colaboradores do seu plano atingido. Faça upgrade para adicionar mais assentos." : undefined}
                  >
                    Novo Colaborador
                  </Button>
                </span>
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
                {equipe.map((membro, index) => {
                  const isTitularMembro = index === 0 && userRole === "DIRETORIA";
                  const isCurrentUser = membro.id === currentUser?.id;

                  return (
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
                            type={membro.role === "DIRETORIA" ? "purple" : "blue"}
                            size="sm"
                          >
                            {membro.role === "DIRETORIA" ? "DIRETORIA (Titular)" : "ANALISTA COMERCIAL"}
                          </Tag>
                          <Tag type={membro.ativo ? "green" : "red"} size="sm">
                            {membro.ativo ? "ATIVO" : "INATIVO"}
                          </Tag>
                          {isCurrentUser && (
                            <Tag type="cool-gray" size="sm">
                              Você
                            </Tag>
                          )}
                        </div>
                        <div style={{ fontSize: "0.8125rem", color: "var(--cds-text-secondary)", marginTop: "0.25rem" }}>
                          {membro.email} • Cadastrado em {new Date(membro.createdAt).toLocaleDateString("pt-BR")}
                        </div>
                      </div>

                      {/* Apenas Diretoria pode alterar membros da equipe */}
                      {userRole === "DIRETORIA" && (
                        <Button
                          kind="ghost"
                          size="sm"
                          renderIcon={Edit}
                          disabled={isCurrentUser}
                          title={isCurrentUser ? "Você não pode alterar suas próprias permissões." : undefined}
                          onClick={() => {
                            if (isCurrentUser) return;
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
                  );
                })}
              </div>
            )}
          </Tile>
        )}
      </div>

      {/* ========================================================
          MODAL: CNAEs Secundários
      ======================================================== */}
      <Modal
        open={modalCnaesSecundarios}
        onRequestClose={() => setModalCnaesSecundarios(false)}
        modalHeading="Gerenciar CNAEs Secundários"
        modalLabel="Classificação Econômica (IBGE)"
        primaryButtonText="Concluir"
        secondaryButtonText="Fechar"
        onRequestSubmit={() => setModalCnaesSecundarios(false)}
      >
        <div style={{ padding: "0.5rem 0", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--cds-text-secondary)" }}>
            Adicione os CNAEs secundários do Contrato Social / Cartão CNPJ. A análise de IA utilizará tanto o CNAE Principal quanto os Secundários para validar aderência aos editais.
          </p>

          <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <TextInput
                id="input-cnae-secundario"
                list="cnae-options-list"
                labelText="Adicionar CNAE Secundário"
                placeholder="Digite código ou atividade (ex: 4639-7/01 — Comércio atacadista...)"
                value={novoCnaeSecundario}
                onChange={(e) => setNovoCnaeSecundario(e.target.value)}
              />
            </div>
            <Button
              kind="secondary"
              size="md"
              type="button"
              onClick={handleAdicionarCnaeSecundario}
            >
              Adicionar CNAE
            </Button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "240px", overflowY: "auto" }}>
            {(!empresa.cnaesSecundarios || empresa.cnaesSecundarios.length === 0) ? (
              <div style={{ fontSize: "0.8125rem", color: "var(--cds-text-secondary)", padding: "0.75rem", border: "1px dashed var(--cds-border-subtle)" }}>
                Nenhum CNAE secundário adicionado até o momento.
              </div>
            ) : (
              empresa.cnaesSecundarios.map((cnaeItem) => (
                <div
                  key={cnaeItem}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.5rem 0.75rem",
                    backgroundColor: "var(--cds-layer-01)",
                    border: "1px solid var(--cds-border-subtle)",
                  }}
                >
                  <span style={{ fontSize: "0.875rem" }}>{cnaeItem}</span>
                  <Button
                    kind="ghost"
                    size="sm"
                    type="button"
                    hasIconOnly
                    renderIcon={TrashCan}
                    iconDescription={`Remover ${cnaeItem}`}
                    onClick={() => handleRemoverCnaeSecundario(cnaeItem)}
                  />
                </div>
              ))
            )}
          </div>
        </div>
      </Modal>

      {/* ========================================================
          MODAL: Upload Cartão CNPJ
      ======================================================== */}
      <Modal
        open={modalUploadCartao}
        onRequestClose={() => setModalUploadCartao(false)}
        modalHeading="Importar Dados pelo Cartão CNPJ"
        modalLabel="Extração Automática (RFB + IA)"
        primaryButtonText={enviandoCartaoCnpj ? "Processando..." : "Extrair e Preencher Empresa"}
        secondaryButtonText="Cancelar"
        primaryButtonDisabled={enviandoCartaoCnpj || !arquivoCartaoCnpj}
        onRequestSubmit={handleImportarCartaoCnpj}
      >
        <div style={{ padding: "0.5rem 0", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--cds-text-secondary)" }}>
            Envie o comprovante oficial da Receita Federal (PDF ou imagem PNG/JPG). O sistema preencherá automaticamente os dados societários, endereço da sede e CNAEs (Principal e Secundários), preservando Inscrição Estadual/Municipal, e salvará o arquivo sem data de validade em <code>/documentacao</code>.
          </p>

          <div
            data-testid="dropzone-cartao-cnpj"
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverCartao(true);
            }}
            onDragLeave={() => setDragOverCartao(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverCartao(false);
              const f = e.dataTransfer.files?.[0] || null;
              if (f) setArquivoCartaoCnpj(f);
            }}
            style={{
              padding: "1rem",
              border: dragOverCartao
                ? "2px dashed var(--cds-interactive, #0f62fe)"
                : "1px dashed var(--cds-border-strong)",
              backgroundColor: dragOverCartao
                ? "rgba(15, 98, 254, 0.08)"
                : "var(--cds-layer-01)",
              transition: "all 0.2s ease",
            }}
          >
            <label
              htmlFor="input-upload-cartao-cnpj"
              style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.5rem" }}
            >
              Arquivo do Cartão CNPJ (.pdf, .png, .jpg, .jpeg, .webp) — Arraste e solte o arquivo aqui *
            </label>
            <input
              id="input-upload-cartao-cnpj"
              data-testid="input-upload-cartao-cnpj"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setArquivoCartaoCnpj(f);
              }}
            />
            {arquivoCartaoCnpj && (
              <div style={{ marginTop: "0.5rem", fontSize: "0.8125rem", color: "var(--cds-text-primary)" }}>
                Selecionado: <strong>{arquivoCartaoCnpj.name}</strong> ({Math.max(1, Math.round(arquivoCartaoCnpj.size / 1024))} KB)
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* ========================================================
          MODAL: Adicionar Novo CNPJ
      ======================================================== */}
      <Modal
        open={modalNovoCnpj}
        onRequestClose={() => setModalNovoCnpj(false)}
        modalHeading="Cadastrar Novo CNPJ Vinculado"
        primaryButtonText={salvandoNovoCnpj ? "Cadastrando..." : "Cadastrar CNPJ"}
        secondaryButtonText="Cancelar"
        primaryButtonDisabled={salvandoNovoCnpj}
        onRequestSubmit={handleCadastrarNovoCnpj}
      >
        <div style={{ padding: "0.5rem 0" }}>
          <TextInput
            id="novo-cnpj"
            labelText="CNPJ *"
            value={novoCnpjForm.cnpj}
            onChange={(e) => setNovoCnpjForm({ ...novoCnpjForm, cnpj: maskCnpj(e.target.value) })}
            placeholder="00.000.000/0000-00"
            style={{ marginBottom: "1rem" }}
          />
          <TextInput
            id="novo-razao"
            labelText="Razão Social *"
            value={novoCnpjForm.razaoSocial}
            onChange={(e) => setNovoCnpjForm({ ...novoCnpjForm, razaoSocial: e.target.value })}
            placeholder="Nome oficial da empresa"
            style={{ marginBottom: "1rem" }}
          />
          <TextInput
            id="novo-fantasia"
            labelText="Nome Fantasia"
            value={novoCnpjForm.nomeFantasia}
            onChange={(e) => setNovoCnpjForm({ ...novoCnpjForm, nomeFantasia: e.target.value })}
            placeholder="Nome fantasia comercial"
            style={{ marginBottom: "1rem" }}
          />
          <TextInput
            id="novo-cnae"
            list="cnae-options-list"
            labelText="CNAE Principal (Catálogo IBGE)"
            value={novoCnpjForm.cnaePrincipal}
            onChange={(e) => setNovoCnpjForm({ ...novoCnpjForm, cnaePrincipal: e.target.value })}
            placeholder="Pesquise por código ou atividade (ex: 4711-3/02, panificação, alimentos)..."
            style={{ marginBottom: "1rem" }}
          />
          <Grid style={{ padding: 0 }}>
            <Column lg={12} md={6} sm={4}>
              <TextInput
                id="novo-cidade"
                labelText="Cidade"
                value={novoCnpjForm.cidade}
                onChange={(e) => setNovoCnpjForm({ ...novoCnpjForm, cidade: e.target.value })}
                placeholder="Cidade da sede"
              />
            </Column>
            <Column lg={4} md={2} sm={4}>
              <TextInput
                id="novo-uf"
                labelText="UF"
                value={novoCnpjForm.uf}
                onChange={(e) => setNovoCnpjForm({ ...novoCnpjForm, uf: e.target.value.toUpperCase().slice(0, 2) })}
                placeholder="UF"
              />
            </Column>
          </Grid>
        </div>
      </Modal>

      {/* ========================================================
          MODAL: Novo Colaborador
      ======================================================== */}
      <Modal
        open={modalNovoMembro}
        onRequestClose={() => setModalNovoMembro(false)}
        modalHeading="Cadastrar Novo Colaborador"
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
            labelText="Papel no Sistema *"
            value={novoRole}
            onChange={(e) => setNovoRole(e.target.value as UsuarioRole)}
            style={{ marginBottom: "1rem" }}
          >
            <SelectItem disabled value="DIRETORIA" text="Diretoria (Apenas Titular)" />
            <SelectItem value="ANALISTA_COMERCIAL" text="Analista Comercial (Lances, propostas e certidões)" />
          </Select>
          <TextInput
            id="nova-senha"
            type="password"
            labelText="Senha Provisória *"
            value={novaSenhaMembro}
            onChange={(e) => setNovaSenhaMembro(e.target.value)}
            helperText="Mínimo de 6 caracteres"
          />
        </div>
      </Modal>

      {/* ========================================================
          MODAL: Editar Colaborador
      ======================================================== */}
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
            {membroSelecionado?.role === "DIRETORIA" && (
              <SelectItem value="DIRETORIA" text="DIRETORIA (Titular)" />
            )}
            <SelectItem value="ANALISTA_COMERCIAL" text="ANALISTA COMERCIAL" />
          </Select>

          <Select
            id="edit-ativo"
            labelText="Status do Usuário"
            value={editAtivo ? "true" : "false"}
            onChange={(e) => setEditAtivo(e.target.value === "true")}
            disabled={membroSelecionado?.id === currentUser?.id}
            helperText={
              membroSelecionado?.id === currentUser?.id
                ? "Você não pode inativar sua própria conta."
                : undefined
            }
          >
            <SelectItem value="true" text="Ativo (Pode efetuar login)" />
            <SelectItem value="false" text="Inativo (Bloqueado)" />
          </Select>
        </div>
      </Modal>
    </ModulePageShell>
  );
}

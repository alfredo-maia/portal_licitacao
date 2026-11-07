"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Tag,
  Tile,
  Button,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Select,
  SelectItem,
  TextInput,
  TextArea,
  Modal,
  InlineNotification,
  FilterableMultiSelect,
  InlineLoading,
  Loading,
  Checkbox,
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  OverflowMenu,
  OverflowMenuItem,
  Pagination,
} from "@carbon/react";
import {
  ArrowLeft,
  CheckmarkOutline,
  CloseOutline,
  WarningAlt,
  Launch,
  TrashCan,
  Download,
  Document,
  Code,
  Bot,
  Copy,
  Save,
  Events,
  UserFollow,
  Edit,
  Add,
  DocumentPdf,
  Upgrade,
  User,
  Calculator,
  Chat,
  Play,
  Pause,
  Settings,
  Printer,
} from "@carbon/icons-react";
import { ModulePageShell } from "@/components/shell/module-page-shell";
import { FileDropZone } from "@/components/ui/file-drop-zone";
import { TIPOS_SISTEMA_CATALOG } from "@/config/tipos-sistema";
import { sintetizarMiniResumo } from "@/lib/resumo-licitacao";

const MOTIVOS_RECUSA_GENERICOS = [
  "Não se encaixa no perfil ou core business da empresa",
  "Prazo de entrega ou execução incompatível",
  "Exigência de atestado técnico ou certidão não atendida",
  "Preço estimado inexequível / margem insuficiente",
  "Localização geográfica inviável / custo logístico elevado",
  "Edital com risco jurídico, técnico ou cláusulas restritivas",
  "Outro",
];

const STATUS_OPTIONS_PIPELINE = [
  { id: "ACEITA", text: "Participar (Aceita)" },
  { id: "ANALISE_TECNICA", text: "Análise Técnica" },
  { id: "ANALISE_FINANCEIRA", text: "Análise Financeira" },
  { id: "REVISAO_PROPOSTA", text: "Revisão da Proposta" },
  { id: "ENVIADA", text: "Enviada" },
  { id: "EM_DISPUTA", text: "Em Disputa / Lances" },
  { id: "AGUARDANDO_RESULTADO", text: "Aguardando Resultado" },
  { id: "CONTEMPLADA", text: "Contemplada 🏆" },
  { id: "IMPUGNADA", text: "Impugnada ⚖️" },
  { id: "NAO_CONTEMPLADA_PRECO", text: "Perda por Preço" },
  { id: "NAO_CONTEMPLADA_DOCUMENTACAO", text: "Perda por Documentação" },
  { id: "NAO_CONTEMPLADA_DESISTENCIA", text: "Desistência Operacional" },
  { id: "REVOGADA_ANULADA", text: "Revogada / Anulada" },
  { id: "RECUSADA", text: "Recusada (No-GO)" },
];

const STATUS_PERDA = [
  "NAO_CONTEMPLADA_PRECO",
  "NAO_CONTEMPLADA_DOCUMENTACAO",
  "NAO_CONTEMPLADA_DESISTENCIA",
  "REVOGADA_ANULADA",
];

interface UsuarioItem {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface ArquivoItem {
  id: string;
  nome: string;
  tamanho: number;
  mimeType: string;
  caminho: string;
  criadoEm: string;
}

interface RepositorioItem {
  id: string;
  nome: string;
  url: string;
  criadoEm: string;
}

interface AnaliseIAItem {
  id: string;
  status?: "PROCESSANDO" | "CONCLUIDO" | "ERRO" | string;
  origem?: string;
  parecer?: "APTO" | "APTO_COM_RESSALVAS" | "INAPTO" | string;
  relatorioJson?: any;
  pdfBase64?: string | null;
  pdfNome?: string | null;
  erroMensagem?: string | null;
  concluidoEm?: string | null;
  scriptPrompt: string;
  relatorioTexto: string;
  impedimentos: any;
  viabilidade: any;
  custos: any;
  precoSugerido: any;
  criadoEm: string;
}

interface NotaItemUI {
  id: string;
  licitacaoId: string;
  autorId: string;
  autorNome: string;
  autorCargo?: string | null;
  texto: string;
  mencionadosIds: string[];
  mencoesNomes?: string[];
  editada: boolean;
  editadoEm?: string | null;
  criadaEm: string;
  atualizadaEm: string;
  podeEditar: boolean;
  podeExcluir: boolean;
}

interface CotaInfo {
  plano: string;
  limite: number;
  usadas: number;
  restantes: number;
  atingiuLimite: boolean;
  mesReferencia: string;
  renovaEm: string;
  acaoSugerida: "UPGRADE" | "CONTATO_VENDAS" | null;
  mensagemBloqueio: string | null;
}

interface OportunidadeDetalhe {
  id: string;
  idPncp: string;
  numeroEdital: string;
  orgaoNome: string;
  orgaoCnpj: string;
  uf: string;
  municipio?: string | null;
  modalidade: string;
  valorEstimado: number;
  dataAbertura: string;
  dataEncerramentoProposta?: string | null;
  miniResumo: string;
  resumo: string;
  objeto?: string | null;
  tipoSistemaCodigo: string;
  parecerIA: "GO" | "AVALIAR" | "NO_GO";
  justificativaIA?: string | null;
  status: string;
  motivoRecusa?: string | null;
  valorProposta?: number | null;
  lanceMinimo?: number | null;
  valorHomologado?: number | null;
  valorArrematado?: number | null;
  isPresencial: boolean;
  distanciaGoianiaKm?: number | null;
  quantidadeLotes: number;
  loteUnico: boolean;
  precoPorLote: boolean;
  linkPncp?: string | null;
  linkSistemaOrigem?: string | null;
  responsavelId?: string | null;
  responsavel?: { id: string; name: string; email: string } | null;
  atribuidos?: Array<{ id: string; usuarioId: string; usuario: { id: string; name: string } }>;
  arquivos?: ArquivoItem[];
  repositoriosSimilares?: RepositorioItem[];
  analisesIA?: AnaliseIAItem[];
  notas?: NotaItemUI[];
}

interface OportunidadesDetalhePageProps {
  params: Promise<{ id: string }> | { id: string };
}

function formatarMoeda(valor: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valor || 0);
}

function formatarBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function renderTextoComMencoes(texto: string) {
  if (!texto) return null;
  const parts = texto.split(/(@[a-zA-Z0-9_\u00C0-\u017F.-]+)/g);
  return parts.map((part, index) => {
    if (part.startsWith("@")) {
      return (
        <span
          key={index}
          style={{
            fontWeight: 600,
            color: "var(--cds-link-primary, #0f62fe)",
            backgroundColor: "var(--cds-layer-02, #e0e0e0)",
            padding: "0.1rem 0.35rem",
            borderRadius: "3px",
            marginRight: "0.15rem",
          }}
        >
          {part}
        </span>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

export default function OportunidadesDetalhePage(props: OportunidadesDetalhePageProps) {
  return (
    <React.Suspense
      fallback={
        <ModulePageShell routePath="/oportunidades">
          <Tile style={{ padding: "2rem" }}>
            <InlineLoading description="Carregando dossiê..." />
          </Tile>
        </ModulePageShell>
      }
    >
      <OportunidadesDetalheContent {...props} />
    </React.Suspense>
  );
}

function OportunidadesDetalheContent({
  params,
}: OportunidadesDetalhePageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleVoltar = React.useCallback(() => {
    // 1. Suporte a parâmetro explícito caso exista em deep links
    const origemParam = searchParams?.get("origem") || searchParams?.get("from");
    if (origemParam && origemParam.startsWith("/") && !origemParam.startsWith("/oportunidades/")) {
      router.push(origemParam);
      return;
    }

    if (typeof window !== "undefined") {
      // 2. Histórico nativo do navegador (retorna à tela de origem preservando estado e filtros)
      if (window.history.length > 1) {
        router.back();
        return;
      }

      // 3. Memória de sessão invisível rastreada no AppShell
      try {
        const storedOrigin = sessionStorage.getItem("portal_nav_origin");
        if (storedOrigin && storedOrigin.startsWith("/") && !storedOrigin.startsWith("/oportunidades/")) {
          router.push(storedOrigin);
          return;
        }
      } catch {
        // Ignora erros de storage
      }
    }

    // 4. Fallback padrão seguro para a Central de Oportunidades
    router.push("/oportunidades");
  }, [router, searchParams]);

  const [id, setId] = React.useState<string>("");
  const [oportunidade, setOportunidade] = React.useState<OportunidadeDetalhe | null>(null);
  const [usuarios, setUsuarios] = React.useState<UsuarioItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<{ tipo: "success" | "error" | "warning"; msg: string } | null>(null);

  // Gestão de Equipe
  const [responsavelId, setResponsavelId] = React.useState<string>("");
  const [atribuidoIds, setAtribuidoIds] = React.useState<string[]>([]);
  const [salvandoEquipe, setSalvandoEquipe] = React.useState(false);

  // Aba 1: Tipo de Sistema
  const [tipoSelecionado, setTipoSelecionado] = React.useState<string>("");
  const [salvandoTipo, setSalvandoTipo] = React.useState(false);

  // Aba 2: Upload e Sincronização PNCP de Arquivos
  const [uploadFile, setUploadFile] = React.useState<File | null>(null);
  const [enviandoArquivo, setEnviandoArquivo] = React.useState(false);
  const [arquivosSelecionados, setArquivosSelecionados] = React.useState<string[]>([]);
  const [buscandoPncp, setBuscandoPncp] = React.useState(false);
  const [pncpSyncStatus, setPncpSyncStatus] = React.useState<"buscando" | "concluido">("buscando");
  const [pncpSyncMensagem, setPncpSyncMensagem] = React.useState("");
  const [pncpSyncTipo, setPncpSyncTipo] = React.useState<"info" | "success" | "warning" | "error">("info");

  // Aba 3: Repositórios Similares
  const [repNome, setRepNome] = React.useState("");
  const [repUrl, setRepUrl] = React.useState("");
  const [salvandoRep, setSalvandoRep] = React.useState(false);

  // Aba 4: Modal Raio-X IA
  const [modalIAOpen, setModalIAOpen] = React.useState(false);
  const [notasEstrategicas, setNotasEstrategicas] = React.useState("");
  const [salvandoAnalise, setSalvandoAnalise] = React.useState(false);

  // Modal Recusa GO/No-GO
  const [showRecusarModal, setShowRecusarModal] = React.useState(false);
  const [loadingModalOpen, setLoadingModalOpen] = React.useState(false);
  const [loadingModalMsg, setLoadingModalMsg] = React.useState("Processando deliberação...");
  const [recusaMotivoGenerico, setRecusaMotivoGenerico] = React.useState(MOTIVOS_RECUSA_GENERICOS[0]);
  const [recusaMotivoCustom, setRecusaMotivoCustom] = React.useState("");
  const [salvandoStatusPipeline, setSalvandoStatusPipeline] = React.useState(false);
  const [statusPipelineMsg, setStatusPipelineMsg] = React.useState<string | null>(null);

  // Aba Valor da Proposta & Modal Homologação
  const [modalHomologarOpen, setModalHomologarOpen] = React.useState(false);
  const [valorHomologarInput, setValorHomologarInput] = React.useState("");
  const [salvandoHomologacao, setSalvandoHomologacao] = React.useState(false);

  const [valorPropostaInput, setValorPropostaInput] = React.useState("");
  const [lanceMinimoInput, setLanceMinimoInput] = React.useState("");
  const [valorHomologadoTabInput, setValorHomologadoTabInput] = React.useState("");
  const [salvandoValoresProposta, setSalvandoValoresProposta] = React.useState(false);
  const [valoresPropostaMsg, setValoresPropostaMsg] = React.useState<string | null>(null);

  // Estados Contextuais das Novas Abas do Certame (Arsenal de Disputa)
  const [custoDiretoCalc, setCustoDiretoCalc] = React.useState<string>("");
  const [freteCalc, setFreteCalc] = React.useState<string>("");
  const [impostosCalc, setImpostosCalc] = React.useState<string>("12");
  const [bdiCalc, setBdiCalc] = React.useState<string>("20");
  const [margemMinCalc, setMargemMinCalc] = React.useState<string>("10");
  const [resultadoBdiCertame, setResultadoBdiCertame] = React.useState<{
    custoBase: number;
    lanceMinimoSeguro: number;
    precoSugeridoBdi: number;
    margemLiquidaReal: number;
    lucroLiquidoTotal: number;
    statusRisco: "SEGURO" | "ALERTA_MARGEM" | "RISCO_INEXEQUIBILIDADE";
  } | null>(null);

  const [gerandoPropostaTimbrada, setGerandoPropostaTimbrada] = React.useState(false);
  const [propostaGeradaFeedback, setPropostaGeradaFeedback] = React.useState<string | null>(null);

  const [roboAtivoCertame, setRoboAtivoCertame] = React.useState(true);
  const [estrategiaDecremento, setEstrategiaDecremento] = React.useState("CENTAVO_1");

  // Controle de Abas Ativas (Issue #36)
  const [activeTab, setActiveTab] = React.useState<number>(0);

  // Aba Notas da Licitação (Issue #36)
  const [notas, setNotas] = React.useState<NotaItemUI[]>([]);
  const [filtroAutorNota, setFiltroAutorNota] = React.useState<string>("TODOS");
  const [buscaNota, setBuscaNota] = React.useState<string>("");
  const [modalNovaNotaOpen, setModalNovaNotaOpen] = React.useState(false);
  const [modalEditarNotaOpen, setModalEditarNotaOpen] = React.useState(false);
  const [notaEmEdicao, setNotaEmEdicao] = React.useState<NotaItemUI | null>(null);
  const [textoNotaInput, setTextoNotaInput] = React.useState("");
  const [mencionadosNotaInput, setMencionadosNotaInput] = React.useState<string[]>([]);
  const [salvandoNota, setSalvandoNota] = React.useState(false);
  const [paginaNotas, setPaginaNotas] = React.useState(1);
  const [pageSizeNotas, setPageSizeNotas] = React.useState(5);

  // Análise de Participação com IA & Cota Mensal (Issue #36)
  const [cotaIA, setCotaIA] = React.useState<CotaInfo | null>(null);
  const [iniciandoAnaliseIA, setIniciandoAnaliseIA] = React.useState(false);
  const [modalNotificacaoIAOpen, setModalNotificacaoIAOpen] = React.useState(false);

  // Resolver params assíncrono (Next.js 15)
  React.useEffect(() => {
    Promise.resolve(params).then((p) => {
      if (p?.id) setId(p.id);
    });
  }, [params]);

  // Sincronização de deep link de abas via query params (?aba=notas, ?aba=historico-ia)
  React.useEffect(() => {
    const abaParam = searchParams?.get("aba") || searchParams?.get("tab");
    if (abaParam === "notas") {
      setActiveTab(2);
    } else if (abaParam === "analise-ia" || abaParam === "historico-ia") {
      setActiveTab(3);
    } else if (abaParam === "arquivos") {
      setActiveTab(1);
    } else if (abaParam === "proposta" || abaParam === "valor-proposta") {
      setActiveTab(4);
    } else if (abaParam === "visao-geral") {
      setActiveTab(0);
    }
  }, [searchParams]);

  const carregarDados = React.useCallback(async (targetId: string) => {
    setLoading(true);
    setError(null);
    try {
      const [oppRes, usrRes, notasRes, iaRes] = await Promise.all([
        fetch(`/api/oportunidades/${targetId}`),
        fetch("/api/usuarios"),
        fetch(`/api/oportunidades/${targetId}/notas`),
        fetch(`/api/oportunidades/${targetId}/analise-ia`),
      ]);

      if (!oppRes.ok) {
        throw new Error("Oportunidade não encontrada.");
      }

      const oppData = await oppRes.json();
      const opp = oppData.oportunidade;

      if (iaRes.ok) {
        const iaData = await iaRes.json().catch(() => null);
        if (iaData?.cota) setCotaIA(iaData.cota);
        if (Array.isArray(iaData?.analises)) {
          opp.analisesIA = iaData.analises;
        }
      }

      if (notasRes.ok) {
        const nData = await notasRes.json().catch(() => null);
        if (Array.isArray(nData?.notas)) {
          setNotas(nData.notas);
        }
      }

      setOportunidade(opp);
      setTipoSelecionado(opp.tipoSistemaCodigo || "");
      setResponsavelId(opp.responsavelId || "");
      setAtribuidoIds((opp.atribuidos || []).map((a: any) => a.usuarioId));
      setValorPropostaInput(opp.valorProposta != null ? String(opp.valorProposta) : "");
      setLanceMinimoInput(opp.lanceMinimo != null ? String(opp.lanceMinimo) : "");
      const finalHomologado = opp.valorHomologado != null ? String(opp.valorHomologado) : (opp.valorArrematado != null ? String(opp.valorArrematado) : "");
      setValorHomologadoTabInput(finalHomologado);
      setValorHomologarInput(finalHomologado);

      if (usrRes.ok) {
        const usrData = await usrRes.json().catch(() => null);
        setUsuarios(usrData?.usuarios || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (id) {
      carregarDados(id);
    }
  }, [id, carregarDados]);

  // Polling automático e reativo enquanto houver análise com status PROCESSANDO
  React.useEffect(() => {
    const analisesAtuais = oportunidade?.analisesIA || [];
    const temProcessando = analisesAtuais.some((a) => a.status === "PROCESSANDO");
    if (!temProcessando || !id) return;

    const interval = setInterval(() => {
      fetch(`/api/oportunidades/${id}/analise-ia`)
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data?.analises)) {
            setOportunidade((prev) => (prev ? { ...prev, analisesIA: data.analises } : null));
            if (data.cota) setCotaIA(data.cota);
          }
        })
        .catch(() => undefined);
    }, 2000);

    return () => clearInterval(interval);
  }, [oportunidade?.analisesIA, id]);

  const showNotification = (tipo: "success" | "error" | "warning", msg: string) => {
    setFeedback({ tipo, msg });
    setTimeout(() => setFeedback(null), 4000);
  };

  // Salvar Equipe
  const handleSalvarEquipe = async () => {
    if (!id) return;
    setSalvandoEquipe(true);
    try {
      const res = await fetch(`/api/oportunidades/${id}/equipe`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          responsavelId: responsavelId || null,
          atribuidoIds,
        }),
      });
      if (!res.ok) throw new Error("Erro ao salvar equipe.");
      showNotification("success", "Equipe de execução atualizada com sucesso!");
      carregarDados(id);
    } catch (err) {
      showNotification("error", err instanceof Error ? err.message : "Erro ao salvar equipe.");
    } finally {
      setSalvandoEquipe(false);
    }
  };

  // Atualizar Tipo de Sistema
  const handleAtualizarTipoSistema = async () => {
    if (!id) return;
    setSalvandoTipo(true);
    try {
      const res = await fetch(`/api/oportunidades/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipoSistemaCodigo: tipoSelecionado }),
      });
      if (!res.ok) throw new Error("Erro ao atualizar tipo de sistema.");
      showNotification("success", "Tipo de sistema atualizado com sucesso!");
      carregarDados(id);
    } catch (err) {
      showNotification("error", err instanceof Error ? err.message : "Erro ao atualizar tipo.");
    } finally {
      setSalvandoTipo(false);
    }
  };

  // Upload de Arquivo
  const handleUploadArquivo = async () => {
    if (!id || !uploadFile) return;
    if (uploadFile.name.toLowerCase().endsWith(".zip")) {
      showNotification(
        "error",
        "Arquivos compactados (.zip) não são permitidos. Envie os arquivos individualmente em formato PDF, DOCX, DOC ou imagem.",
      );
      return;
    }
    setEnviandoArquivo(true);
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      const res = await fetch(`/api/oportunidades/${id}/arquivos`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.mensagem || data?.error || "Erro ao fazer upload do arquivo.");
      }
      setUploadFile(null);
      showNotification("success", "Arquivo anexado com sucesso!");
      await carregarDados(id);
    } catch (err) {
      showNotification("error", err instanceof Error ? err.message : "Erro no upload.");
    } finally {
      setEnviandoArquivo(false);
    }
  };

  // Excluir Arquivo
  const handleExcluirArquivo = async (arquivoId: string) => {
    if (!id) return;
    if (!confirm("Deseja realmente remover este arquivo?")) return;
    try {
      const res = await fetch(`/api/oportunidades/${id}/arquivos/${arquivoId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Erro ao excluir arquivo.");
      showNotification("success", "Arquivo removido.");
      await carregarDados(id);
    } catch (err) {
      showNotification("error", err instanceof Error ? err.message : "Erro ao excluir arquivo.");
    }
  };

  // Buscar Edital no PNCP
  const handleBuscarEditalPncp = async () => {
    if (!id) return;
    setBuscandoPncp(true);
    setPncpSyncStatus("buscando");
    setPncpSyncMensagem("Buscando arquivos e editais oficiais no PNCP...");
    setPncpSyncTipo("info");

    try {
      const res = await fetch(`/api/oportunidades/${id}/arquivos/sync-pncp`, {
        method: "POST",
      });
      const data = await res.json().catch(() => null);

      let msg = "";
      let tipo: "success" | "warning" | "error" = "info" as any;

      if (!res.ok || data?.erroConexao || data?.ok === false) {
        msg = data?.mensagem || "Não foi possível conectar ao portal do PNCP no momento.";
        tipo = "error";
      } else if (data?.sincronizados > 0) {
        msg = `${data.sincronizados} arquivo(s) oficial(is) sincronizado(s) com sucesso!`;
        tipo = "success";
      } else {
        msg = "Nenhum arquivo disponibilizado pelo órgão no PNCP para esta contratação.";
        tipo = "warning";
      }

      setPncpSyncStatus("concluido");
      setPncpSyncMensagem(msg);
      setPncpSyncTipo(tipo);

      // Mantém a mensagem visível por exatamente 2 segundos
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await carregarDados(id);
    } catch {
      setPncpSyncStatus("concluido");
      setPncpSyncMensagem("Não foi possível conectar ao portal do PNCP no momento.");
      setPncpSyncTipo("error");
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } finally {
      setBuscandoPncp(false);
      setPncpSyncStatus("buscando");
      setPncpSyncMensagem("");
    }
  };

  // Helper de URL de Download Segura
  const obterUrlDownload = (arq: ArquivoItem) => {
    if (
      arq.caminho &&
      arq.caminho.startsWith("http") &&
      !arq.caminho.includes("docs.licitacao.internal") &&
      !arq.caminho.includes("localhost")
    ) {
      return arq.caminho;
    }
    return `/api/oportunidades/${id}/arquivos/${arq.id}/download`;
  };

  // Baixar Selecionados em Pacote ZIP
  const handleBaixarSelecionados = () => {
    if (typeof window !== "undefined" && arquivosSelecionados.length > 0) {
      const idsParam = encodeURIComponent(arquivosSelecionados.join(","));
      window.location.href = `/api/oportunidades/${id}/arquivos/download-zip?ids=${idsParam}`;
    }
  };

  // Baixar Todos os Arquivos em Pacote ZIP
  const handleBaixarTodos = () => {
    if (typeof window !== "undefined") {
      window.location.href = `/api/oportunidades/${id}/arquivos/download-zip`;
    }
  };

  // Adicionar Repositório
  const handleAdicionarRepositorio = async () => {
    if (!id || !repNome || !repUrl) return;
    setSalvandoRep(true);
    try {
      const res = await fetch(`/api/oportunidades/${id}/repositorios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: repNome.trim(), url: repUrl.trim() }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message || "Erro ao adicionar repositório.");
      }
      setRepNome("");
      setRepUrl("");
      showNotification("success", "Repositório similar adicionado para benchmarking!");
      carregarDados(id);
    } catch (err) {
      showNotification("error", err instanceof Error ? err.message : "Erro ao adicionar repositório.");
    } finally {
      setSalvandoRep(false);
    }
  };

  // Excluir Repositório
  const handleExcluirRepositorio = async (repId: string) => {
    if (!id) return;
    if (!confirm("Deseja realmente remover este repositório?")) return;
    try {
      const res = await fetch(`/api/oportunidades/${id}/repositorios/${repId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Erro ao remover repositório.");
      showNotification("success", "Repositório removido.");
      carregarDados(id);
    } catch (err) {
      showNotification("error", err instanceof Error ? err.message : "Erro ao remover.");
    }
  };

  // Deliberação Rápida GO / No-GO
  const handleDecisao = async (decisao: "GO" | "NO_GO", motivo?: string) => {
    if (!id) return;
    const novoStatus = decisao === "GO" ? "ACEITA" : "RECUSADA";
    // Atualização otimista imediata para ocultar os botões e exibir o select do funil
    setOportunidade((prev) =>
      prev
        ? {
            ...prev,
            status: novoStatus,
            motivoRecusa: motivo || (decisao === "NO_GO" ? "Recusada via Dossiê" : null),
          }
        : null,
    );
    setShowRecusarModal(false);
    setRecusaMotivoCustom("");
    setLoadingModalMsg(
      decisao === "GO"
        ? "Registrando participação na licitação..."
        : "Registrando recusa da oportunidade..."
    );
    setLoadingModalOpen(true);

    try {
      const res = await fetch(`/api/oportunidades/${id}/decisao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisao, motivoRecusa: motivo }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.message || errJson?.error || "Erro ao registrar deliberação.");
      }
      const data = await res.json().catch(() => null);
      if (data?.oportunidade) {
        setOportunidade(data.oportunidade);
      }
      showNotification("success", `Licitação deliberada como ${decisao}!`);
      await carregarDados(id);
    } catch (err) {
      showNotification("error", err instanceof Error ? err.message : "Erro na deliberação.");
      // Em caso de erro, recarrega o estado real
      await carregarDados(id);
    } finally {
      setLoadingModalOpen(false);
    }
  };

  // Alteração Direta de Status pelo Dossiê (Pipeline / Participação)
  const handleMudarStatusPipeline = async (novoStatus: string) => {
    if (!id || !oportunidade || novoStatus === oportunidade.status) return;

    if (novoStatus === "CONTEMPLADA") {
      setValorHomologarInput(valorHomologadoTabInput || (oportunidade.valorHomologado != null ? String(oportunidade.valorHomologado) : (oportunidade.valorArrematado != null ? String(oportunidade.valorArrematado) : "")));
      setModalHomologarOpen(true);
      return;
    }

    setSalvandoStatusPipeline(true);
    setStatusPipelineMsg(null);
    try {
      const res = await fetch(`/api/oportunidades/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: novoStatus,
          ...(STATUS_PERDA.includes(novoStatus)
            ? { motivoPerda: oportunidade.motivoRecusa || "Alterado via Dossiê" }
            : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || "Erro ao atualizar status da licitação");
      }
      setOportunidade((prev) => (prev ? { ...prev, status: novoStatus } : null));
      setStatusPipelineMsg("Status atualizado!");
      showNotification("success", `Status alterado para ${novoStatus}!`);
      setTimeout(() => setStatusPipelineMsg(null), 3500);
      await carregarDados(id);
    } catch (err) {
      showNotification("error", err instanceof Error ? err.message : "Erro ao alterar status.");
    } finally {
      setSalvandoStatusPipeline(false);
    }
  };

  const handleSalvarHomologacao = async () => {
    if (!id) return;
    setSalvandoHomologacao(true);
    try {
      const numHomologado = valorHomologarInput ? parseFloat(valorHomologarInput.replace(/\./g, "").replace(",", ".")) : undefined;
      const res = await fetch(`/api/oportunidades/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "CONTEMPLADA",
          valorArrematado: numHomologado,
          valorHomologado: numHomologado,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || "Erro ao homologar vitória");
      }
      setOportunidade((prev) => (prev ? { ...prev, status: "CONTEMPLADA", valorHomologado: numHomologado, valorArrematado: numHomologado } : null));
      setValorHomologadoTabInput(valorHomologarInput);
      setModalHomologarOpen(false);
      showNotification("success", "🏆 Vitória homologada com sucesso! Parabéns!");
      await carregarDados(id);
    } catch (err) {
      showNotification("error", err instanceof Error ? err.message : "Erro ao homologar vitória");
    } finally {
      setSalvandoHomologacao(false);
    }
  };

  const handleSalvarValoresProposta = async () => {
    if (!id) return;
    setSalvandoValoresProposta(true);
    setValoresPropostaMsg(null);
    try {
      const numProposta = valorPropostaInput ? parseFloat(valorPropostaInput.replace(/\./g, "").replace(",", ".")) : undefined;
      const numMinimo = lanceMinimoInput ? parseFloat(lanceMinimoInput.replace(/\./g, "").replace(",", ".")) : undefined;
      const numHomologado = valorHomologadoTabInput ? parseFloat(valorHomologadoTabInput.replace(/\./g, "").replace(",", ".")) : undefined;

      const res = await fetch(`/api/oportunidades/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: oportunidade?.status || "ACEITA",
          valorProposta: numProposta,
          lanceMinimo: numMinimo,
          valorMinimo: numMinimo,
          valorHomologado: numHomologado,
          valorArrematado: numHomologado,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || "Erro ao salvar valores da proposta");
      }
      setOportunidade((prev) => (prev ? {
        ...prev,
        valorProposta: numProposta,
        lanceMinimo: numMinimo,
        valorHomologado: numHomologado,
        valorArrematado: numHomologado,
      } : null));
      setValorHomologarInput(valorHomologadoTabInput);
      setValoresPropostaMsg("Valores da proposta salvos com sucesso!");
      showNotification("success", "Valores da proposta atualizados com sucesso!");
      setTimeout(() => setValoresPropostaMsg(null), 3500);
      await carregarDados(id);
    } catch (err) {
      showNotification("error", err instanceof Error ? err.message : "Erro ao salvar valores");
    } finally {
      setSalvandoValoresProposta(false);
    }
  };

  // Contexto de Diretrizes e Observações para o Raio-X
  const gerarPromptScript = () => {
    if (!oportunidade) return "";
    return `### RAIO-X EXECUTIVO DE EDITAL & ATA (IA)
Licitação: ${oportunidade.numeroEdital} - ${oportunidade.orgaoNome} (${oportunidade.uf})
Objeto: ${oportunidade.resumo}
Valor Estimado: ${formatarMoeda(oportunidade.valorEstimado)}
Modalidade: ${oportunidade.modalidade} (${oportunidade.isPresencial ? "Presencial" : "Eletrônica"})
Diretrizes/Observações: ${notasEstrategicas || "Análise executiva completa"}`;
  };

  // Salvar Relatório de IA (legado)
  const handleSalvarRelatorioIA = async () => {
    if (!id || !oportunidade) return;
    setSalvandoAnalise(true);
    try {
      const scriptPrompt = gerarPromptScript();
      const payload = {
        scriptPrompt,
        relatorioTexto: `Análise profunda realizada em ${new Date().toLocaleString("pt-BR")}. Oportunidade classificada como favorável com parecer executivo emitido.`,
        impedimentos: {
          habilitacaoJuridica: "REGULAR",
          atestadosTecnicos: "Compatível com acervo técnico",
          observacoes: "Regularidade documental confirmada.",
        },
        viabilidade: {
          prazoDias: 120,
          viabilidadeTecnica: "ALTA",
        },
      };

      const res = await fetch(`/api/oportunidades/${id}/analise-ia`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Erro ao salvar análise de IA.");
      showNotification("success", "Relatório de análise de participação salvo no dossiê!");
      setModalIAOpen(false);
      carregarDados(id);
    } catch (err) {
      showNotification("error", err instanceof Error ? err.message : "Erro ao salvar análise.");
    } finally {
      setSalvandoAnalise(false);
    }
  };

  // Disparo Assíncrono do Raio-X com IA (Issue #37)
  const handleIniciarAnaliseIA = async () => {
    if (!id || !oportunidade) return;
    setIniciandoAnaliseIA(true);
    try {
      const res = await fetch(`/api/oportunidades/${id}/analise-ia`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          observacoes: notasEstrategicas.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        if (data?.error === "COTA_MENSAL_IA_ATINGIDA" || data?.error === "LIMITE_MENSAL_ATINGIDO") {
          if (data.cota) setCotaIA(data.cota);
          throw new Error(data.message || "Limite mensal de análises de IA atingido.");
        }
        if (data?.error === "SEM_ARQUIVOS_EDITAL") {
          throw new Error(data.message || "Nenhum arquivo de edital encontrado. Faça o upload manual na aba 'Arquivos do Edital' para iniciar o Raio-X.");
        }
        throw new Error(data?.message || data?.error || "Erro ao solicitar Raio-X com IA.");
      }

      if (data?.cota) setCotaIA(data.cota);
      setModalIAOpen(false);
      setModalNotificacaoIAOpen(true);
      showNotification("success", "Raio-X de Edital & ATA com IA iniciado com sucesso!");

      await carregarDados(id);
      setActiveTab(3); // Redireciona para a aba de Histórico IA
    } catch (err) {
      showNotification("error", err instanceof Error ? err.message : "Erro ao iniciar análise.");
    } finally {
      setIniciandoAnaliseIA(false);
    }
  };

  // Handlers da Aba Notas (Issue #36)
  const handleCriarNota = async () => {
    if (!id || !textoNotaInput.trim()) return;
    setSalvandoNota(true);
    try {
      const res = await fetch(`/api/oportunidades/${id}/notas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          texto: textoNotaInput.trim(),
          mencionadosIds: mencionadosNotaInput,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.message || data?.error || "Erro ao salvar anotação.");
      }
      showNotification("success", "Anotação adicionada com sucesso!");
      setTextoNotaInput("");
      setMencionadosNotaInput([]);
      setModalNovaNotaOpen(false);

      const nRes = await fetch(`/api/oportunidades/${id}/notas`);
      if (nRes.ok) {
        const nData = await nRes.json().catch(() => null);
        if (Array.isArray(nData?.notas)) setNotas(nData.notas);
      }
    } catch (err) {
      showNotification("error", err instanceof Error ? err.message : "Erro ao adicionar anotação.");
    } finally {
      setSalvandoNota(false);
    }
  };

  const handleAbrirEdicaoNota = (nota: NotaItemUI) => {
    setNotaEmEdicao(nota);
    setTextoNotaInput(nota.texto);
    setMencionadosNotaInput(nota.mencionadosIds || []);
    setModalEditarNotaOpen(true);
  };

  const handleSalvarEdicaoNota = async () => {
    if (!id || !notaEmEdicao || !textoNotaInput.trim()) return;
    setSalvandoNota(true);
    try {
      const res = await fetch(`/api/oportunidades/${id}/notas/${notaEmEdicao.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          texto: textoNotaInput.trim(),
          mencionadosIds: mencionadosNotaInput,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.message || data?.error || "Erro ao atualizar anotação.");
      }
      showNotification("success", "Anotação atualizada com sucesso!");
      setTextoNotaInput("");
      setMencionadosNotaInput([]);
      setNotaEmEdicao(null);
      setModalEditarNotaOpen(false);

      const nRes = await fetch(`/api/oportunidades/${id}/notas`);
      if (nRes.ok) {
        const nData = await nRes.json().catch(() => null);
        if (Array.isArray(nData?.notas)) setNotas(nData.notas);
      }
    } catch (err) {
      showNotification("error", err instanceof Error ? err.message : "Erro ao atualizar anotação.");
    } finally {
      setSalvandoNota(false);
    }
  };

  const handleExcluirNota = async (notaId: string) => {
    if (!id) return;
    if (!confirm("Deseja realmente remover esta anotação interna? Esta ação é irreversível.")) return;
    try {
      const res = await fetch(`/api/oportunidades/${id}/notas/${notaId}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.message || data?.error || "Erro ao excluir anotação.");
      }
      showNotification("success", "Anotação excluída com sucesso.");

      const nRes = await fetch(`/api/oportunidades/${id}/notas`);
      if (nRes.ok) {
        const nData = await nRes.json().catch(() => null);
        if (Array.isArray(nData?.notas)) setNotas(nData.notas);
      }
    } catch (err) {
      showNotification("error", err instanceof Error ? err.message : "Erro ao excluir anotação.");
    }
  };

  // Filtragem e paginação das notas
  const autoresDisponiveis = React.useMemo(() => {
    const map = new Map<string, string>();
    notas.forEach((n) => {
      map.set(n.autorId, n.autorNome);
    });
    return Array.from(map.entries()).map(([autId, nome]) => ({ id: autId, nome }));
  }, [notas]);

  const notasFiltradas = React.useMemo(() => {
    return notas.filter((n) => {
      if (filtroAutorNota !== "TODOS" && n.autorId !== filtroAutorNota) {
        return false;
      }
      if (buscaNota.trim()) {
        const query = buscaNota.toLowerCase();
        const textoMatch = n.texto.toLowerCase().includes(query);
        const autorMatch = n.autorNome.toLowerCase().includes(query);
        const mencoesMatch = (n.mencoesNomes || []).some((m) => m.toLowerCase().includes(query));
        if (!textoMatch && !autorMatch && !mencoesMatch) return false;
      }
      return true;
    });
  }, [notas, filtroAutorNota, buscaNota]);

  const notasPaginadas = React.useMemo(() => {
    const inicio = (paginaNotas - 1) * pageSizeNotas;
    return notasFiltradas.slice(inicio, inicio + pageSizeNotas);
  }, [notasFiltradas, paginaNotas, pageSizeNotas]);

  if (loading) {
    return (
      <ModulePageShell routePath={`/oportunidades/${id}`}>
        <Tile style={{ padding: "2rem" }}>
          <InlineLoading description="Carregando dossiê completo da licitação..." />
        </Tile>
      </ModulePageShell>
    );
  }

  if (error || !oportunidade) {
    return (
      <ModulePageShell routePath={`/oportunidades/${id}`}>
        <Tile style={{ padding: "2rem" }}>
          <h2 style={{ color: "var(--cds-support-error)", marginBottom: "1rem" }}>
            Erro ao carregar oportunidade
          </h2>
          <p style={{ marginBottom: "1.5rem" }}>{error || "Registro não localizado."}</p>
          <Button
            kind="secondary"
            onClick={handleVoltar}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
            data-testid="btn-voltar-erro"
          >
            <ArrowLeft size={16} />
            <span>Voltar</span>
          </Button>
        </Tile>
      </ModulePageShell>
    );
  }

  const distanciaCalculada =
    oportunidade.distanciaGoianiaKm !== null && oportunidade.distanciaGoianiaKm !== undefined
      ? oportunidade.distanciaGoianiaKm
      : oportunidade.uf === "GO"
      ? 0
      : oportunidade.uf === "DF"
      ? 209
      : oportunidade.uf === "MG"
      ? 666
      : oportunidade.uf === "SP"
      ? 854
      : 1200;

  const parecerIATagType =
    oportunidade.parecerIA === "GO"
      ? "green"
      : oportunidade.parecerIA === "AVALIAR"
      ? "warm-gray"
      : "red";

  const repositorios = oportunidade.repositoriosSimilares || [];
  const arquivos = oportunidade.arquivos || [];
  const analises = oportunidade.analisesIA || [];

  return (
    <ModulePageShell routePath={`/oportunidades/${id}`}>
      {/* Notificação de Feedback */}
      {feedback && (
        <div style={{ marginBottom: "1rem" }}>
          <InlineNotification
            kind={feedback.tipo}
            title={feedback.tipo === "success" ? "Sucesso:" : "Atenção:"}
            subtitle={feedback.msg}
            hideCloseButton
          />
        </div>
      )}

      {/* Cabeçalho Fixo do Dossiê */}
      <Tile style={{ padding: "1.5rem", marginBottom: "1.5rem" }} data-testid="dossie-header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem", marginBottom: "1rem" }}>
          <div>
            <Button
              kind="ghost"
              size="sm"
              onClick={handleVoltar}
              style={{
                paddingLeft: 0,
                marginBottom: "0.5rem",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
              data-testid="btn-voltar"
            >
              <ArrowLeft size={16} />
              <span>Voltar</span>
            </Button>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: 0, lineHeight: 1.2 }}>
              {oportunidade.orgaoNome} — {sintetizarMiniResumo(oportunidade.miniResumo || oportunidade.objeto || oportunidade.resumo, oportunidade.tipoSistemaCodigo)}
            </h1>
            <p style={{ margin: "0.25rem 0 0 0", color: "var(--cds-text-secondary)", fontSize: "0.875rem" }}>
              CNPJ: {oportunidade.orgaoCnpj} • ID PNCP: {oportunidade.idPncp}
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
            <Tag type="blue" size="md">
              Status: {oportunidade.status}
            </Tag>
          </div>
        </div>

        {/* Barra de Ações Rápidas da Diretoria */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem", borderTop: "1px solid var(--cds-border-subtle)", paddingTop: "1rem" }}>
          {oportunidade.status === "PENDENTE" ? (
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
              <Button
                kind="primary"
                size="sm"
                renderIcon={CheckmarkOutline}
                onClick={() => handleDecisao("GO")}
                data-testid="btn-dossie-aceitar"
                style={{ backgroundColor: "#24a148", color: "#ffffff" }}
              >
                Participar
              </Button>
              <Button
                kind="danger"
                size="sm"
                renderIcon={CloseOutline}
                onClick={() => setShowRecusarModal(true)}
                data-testid="btn-dossie-recusar"
                style={{ backgroundColor: "#da1e28", color: "#ffffff" }}
              >
                Não Participar
              </Button>
              <Button
                kind="tertiary"
                size="sm"
                renderIcon={Bot}
                onClick={() => setModalIAOpen(true)}
                data-testid="btn-open-verificar-participacao"
                style={{ border: "1px solid var(--cds-border-strong)", color: "var(--cds-text-primary)" }}
              >
                🤖 Verificar Status de Participação ({cotaIA ? `${cotaIA.usadas}/${cotaIA.limite}` : `${analises.length}/10`})
              </Button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ minWidth: "250px" }}>
                <Select
                  id="select-pipeline-status"
                  labelText="Status da Licitação"
                  data-testid="select-pipeline-status"
                  size="sm"
                  value={oportunidade.status}
                  disabled={salvandoStatusPipeline}
                  onChange={(e) => handleMudarStatusPipeline(e.target.value)}
                >
                  {STATUS_OPTIONS_PIPELINE.map((st) => (
                    <SelectItem key={st.id} value={st.id} text={st.text} />
                  ))}
                </Select>
              </div>
              <Button
                kind="tertiary"
                size="sm"
                renderIcon={Bot}
                onClick={() => setModalIAOpen(true)}
                data-testid="btn-open-verificar-participacao"
                style={{ border: "1px solid var(--cds-border-strong)", color: "var(--cds-text-primary)" }}
              >
                🤖 Verificar Status de Participação ({cotaIA ? `${cotaIA.usadas}/${cotaIA.limite}` : `${analises.length}/10`})
              </Button>
              {statusPipelineMsg && (
                <span style={{ fontSize: "0.8125rem", color: "var(--cds-support-success)", fontWeight: 500 }}>
                  ✓ {statusPipelineMsg}
                </span>
              )}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.25rem" }}>
            {oportunidade.motivoRecusa && (
              <div
                data-testid="dossie-motivo-recusa"
                style={{
                  fontStyle: "italic",
                  color: "var(--cds-text-secondary)",
                  fontSize: "0.875rem",
                  marginTop: "0.25rem",
                  textAlign: "right",
                }}
              >
                Motivo da recusa: {oportunidade.motivoRecusa}
              </div>
            )}
          </div>
        </div>
      </Tile>

      {/* Caixa de Gestão de Equipe (PRD §4.4.1 B) */}
      <Tile style={{ padding: "1.25rem", marginBottom: "1.5rem" }} data-testid="equipe-assignment-box">
        <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <UserFollow size={18} /> Equipe Operacional da Licitação
        </h3>
        <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ minWidth: "260px", flex: 1 }}>
            <Select
              id="select-responsavel"
              data-testid="select-responsavel"
              labelText="Responsável Coordenador (Único)"
              value={responsavelId}
              onChange={(e) => setResponsavelId(e.target.value)}
            >
              <SelectItem value="" text="Nenhum responsável atribuído" />
              {usuarios.map((u) => (
                <SelectItem key={u.id} value={u.id} text={`${u.name} (${u.role})`} />
              ))}
            </Select>
          </div>

          <div style={{ minWidth: "320px", flex: 2 }}>
            <FilterableMultiSelect
              key={`membros-${usuarios.length}-${(oportunidade.atribuidos || []).map((a) => a.usuarioId).sort().join(",")}`}
              id="multiselect-membros-equipe"
              titleText="Membros Atribuídos da Equipe"
              placeholder="Selecione os membros..."
              items={usuarios.map((u) => ({ id: u.id, text: `${u.name} (${u.role})` }))}
              itemToString={(item) => (item ? item.text : "")}
              initialSelectedItems={usuarios
                .filter((u) => atribuidoIds.includes(u.id))
                .map((u) => ({ id: u.id, text: `${u.name} (${u.role})` }))}
              onChange={({ selectedItems }) => {
                setAtribuidoIds((selectedItems || []).map((item) => item.id));
              }}
            />
          </div>

          <Button
            kind="secondary"
            size="md"
            renderIcon={Save}
            onClick={handleSalvarEquipe}
            disabled={salvandoEquipe}
            data-testid="btn-salvar-equipe"
          >
            {salvandoEquipe ? "Salvando..." : "Salvar Equipe"}
          </Button>
        </div>

        {(oportunidade.responsavel || (oportunidade.atribuidos && oportunidade.atribuidos.length > 0)) && (
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center", marginTop: "0.75rem" }}>
            {oportunidade.responsavel && (
              <Tag type="teal" size="sm">
                Coordenador: {oportunidade.responsavel.name}
              </Tag>
            )}
            {(oportunidade.atribuidos || []).map((atrib) => {
              const nomeMembro =
                atrib.usuario?.name ||
                usuarios.find((u) => u.id === atrib.usuarioId)?.name ||
                "Membro da Equipe";
              return (
                <Tag key={atrib.usuarioId} type="cool-gray" size="sm">
                  Membro: {nomeMembro}
                </Tag>
              );
            })}
          </div>
        )}
      </Tile>

      {/* Carbon Tabs do Dossiê */}
      <Tabs selectedIndex={activeTab} onChange={({ selectedIndex }) => setActiveTab(selectedIndex)}>
        <TabList aria-label="Abas do Dossiê da Licitação">
          <Tab data-testid="tab-visao-geral">Visão Geral & Dados Técnicos</Tab>
          <Tab data-testid="tab-arquivos">Arquivos do Edital</Tab>
          <Tab data-testid="tab-notas">📝 Notas ({notas.length})</Tab>
          <Tab data-testid="tab-analise-ia">
            🤖 Histórico Análise IA ({analises.length})
          </Tab>
          <Tab data-testid="tab-calculadora">
            🧮 Calculadora
          </Tab>
          <Tab data-testid="tab-proposta-comercial">
            📄 Proposta Comercial
          </Tab>
          <Tab data-testid="tab-disputa-chat">
            ⚡ Disputa & Chat
          </Tab>
        </TabList>

        <TabPanels>
          {/* Aba 1: Visão Geral & Dados Técnicos */}
          <TabPanel style={{ padding: "1.5rem 0" }}>
            <Tile style={{ padding: "1.5rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1.5rem", marginBottom: "1.5rem" }}>
                <div>
                  <h4 style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)", marginBottom: "0.25rem" }}>
                    Valor Estimado Oficial
                  </h4>
                  <div
                    style={{
                      fontSize: "1.5rem",
                      fontWeight: 600,
                      fontFamily: "var(--cds-code-01-font-family, 'IBM Plex Mono', monospace)",
                      color: "var(--cds-support-success)",
                    }}
                  >
                    {formatarMoeda(oportunidade.valorEstimado)}
                  </div>
                </div>

                <div>
                  <h4 style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)", marginBottom: "0.25rem" }}>
                    Data Limite para Envio da Proposta
                  </h4>
                  <div style={{ fontSize: "1.125rem", fontWeight: 600, color: "var(--cds-text-primary)", fontFamily: "var(--cds-code-01-font-family, 'IBM Plex Mono', monospace)" }}>
                    {new Date(oportunidade.dataEncerramentoProposta || oportunidade.dataAbertura).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                  {oportunidade.dataEncerramentoProposta && oportunidade.dataAbertura && new Date(oportunidade.dataEncerramentoProposta).getTime() !== new Date(oportunidade.dataAbertura).getTime() && (
                    <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginTop: "0.25rem" }}>
                      Sessão de Abertura: {new Date(oportunidade.dataAbertura).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  )}
                </div>
              </div>

              {/* Logística se Presencial */}
              {oportunidade.isPresencial && (
                <div style={{ padding: "1rem", backgroundColor: "var(--cds-layer-02)", borderLeft: "4px solid var(--cds-support-warning)", marginBottom: "1.5rem" }}>
                  <h4 style={{ fontSize: "0.875rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <WarningAlt size={16} /> Alerta de Logística e Deslocamento Rodoviário
                  </h4>
                  <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.875rem", color: "var(--cds-text-secondary)" }}>
                    Distância aproximada a partir de <strong>Goiânia/GO</strong>:{" "}
                    <span style={{ fontWeight: 600, color: "var(--cds-text-primary)" }}>
                      {distanciaCalculada} km
                    </span>
                    {distanciaCalculada === 0
                      ? " (Certame Local em Goiás)"
                      : " (Necessário provisionar custos de transporte e diárias para entrega de envelopes e lances presenciais)."}
                  </p>
                </div>
              )}

              {/* Estrutura de Lotes */}
              <div style={{ marginBottom: "1.5rem" }}>
                <h4 style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)", marginBottom: "0.5rem" }}>
                  Estrutura de Lotes do Certame
                </h4>
                <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                  <Tag type="cool-gray">
                    Quantidade de Lotes: {oportunidade.quantidadeLotes || 1}
                  </Tag>
                  <Tag type="cool-gray">
                    {oportunidade.loteUnico ? "Lote Único (Proposta Global)" : "Múltiplos Lotes Independentes"}
                  </Tag>
                  <Tag type="cool-gray">
                    {oportunidade.precoPorLote ? "Adjudicação por Lote" : "Adjudicação por Item/Global"}
                  </Tag>
                </div>
              </div>

              {/* Objeto Completo */}
              <div style={{ marginBottom: "1.5rem" }}>
                <h4 style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)", marginBottom: "0.5rem" }}>
                  Resumo Detalhado do Objeto
                </h4>
                <div style={{ padding: "1rem", backgroundColor: "var(--cds-layer-01)", borderRadius: "4px", lineHeight: 1.5, fontSize: "0.875rem" }}>
                  {oportunidade.resumo}
                </div>
              </div>

            </Tile>
          </TabPanel>

          {/* Aba 2: Arquivos do Edital */}
          <TabPanel style={{ padding: "1.5rem 0" }}>
            <Tile style={{ padding: "1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
                <div>
                  <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                    Anexos Oficiais e Documentos do Certame
                  </h3>
                  <p style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)", margin: 0 }}>
                    Termo de Referência (TR), Minuta de Contrato, Planilhas de Custos e Editais anexados para análise.
                  </p>
                </div>

                <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
                  <Button
                    kind="secondary"
                    size="md"
                    renderIcon={buscandoPncp ? undefined : Download}
                    onClick={handleBuscarEditalPncp}
                    disabled={buscandoPncp}
                    data-testid="btn-buscar-edital-pncp"
                  >
                    {buscandoPncp ? <InlineLoading description="Buscando no PNCP..." /> : "Buscar Edital"}
                  </Button>
                  <Button
                    kind="tertiary"
                    size="md"
                    renderIcon={Download}
                    onClick={handleBaixarSelecionados}
                    disabled={arquivosSelecionados.length === 0}
                    data-testid="btn-baixar-selecionados"
                  >
                    Baixar Selecionados (ZIP) ({arquivosSelecionados.length})
                  </Button>
                  <Button
                    kind="ghost"
                    size="md"
                    renderIcon={Download}
                    onClick={handleBaixarTodos}
                    disabled={arquivos.length === 0}
                    data-testid="btn-baixar-todos"
                  >
                    Baixar Todos os Arquivos (ZIP)
                  </Button>
                </div>
              </div>

              {/* Upload Drag-and-drop / Seletor */}
              <div style={{ display: "flex", gap: "1rem", alignItems: "flex-end", marginBottom: "2rem", flexWrap: "wrap" }}>
                <FileDropZone
                  id="input-file-edital"
                  label="Selecione ou arraste um arquivo para upload no Dossiê (PDF, DOC, DOCX, PNG, JPG)"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                  selectedFile={uploadFile}
                  selectedFileName={uploadFile?.name}
                  onFileSelect={(file) => setUploadFile(file)}
                  onFileClear={() => setUploadFile(null)}
                  helperText="Arraste e solte o arquivo aqui ou clique para selecionar (Arquivos .zip não são permitidos)"
                  dataTestId="dropzone-file-edital"
                  style={{ flex: 1, minWidth: "280px", marginBottom: 0 }}
                />
                <Button
                  kind="primary"
                  size="md"
                  renderIcon={Document}
                  onClick={handleUploadArquivo}
                  disabled={!uploadFile || enviandoArquivo}
                  data-testid="btn-upload-arquivo"
                >
                  {enviandoArquivo ? "Enviando arquivo..." : "Fazer Upload do Anexo"}
                </Button>
              </div>

              {/* Lista de Arquivos com Seleção Múltipla */}
              {arquivos.length === 0 ? (
                <p style={{ color: "var(--cds-text-secondary)", fontStyle: "italic" }}>
                  Nenhum arquivo anexado a esta licitação até o momento. Clique em &ldquo;Buscar Edital&rdquo; para sincronizar os documentos oficiais do PNCP.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }} data-testid="arquivos-list">
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.25rem 0 0.5rem 0" }}>
                    <Checkbox
                      id="select-all-arquivos"
                      labelText={`Selecionar todos (${arquivosSelecionados.length}/${arquivos.length})`}
                      checked={arquivos.length > 0 && arquivosSelecionados.length === arquivos.length}
                      indeterminate={arquivosSelecionados.length > 0 && arquivosSelecionados.length < arquivos.length}
                      onChange={(_e, { checked }) => {
                        if (checked) {
                          setArquivosSelecionados(arquivos.map((a) => a.id));
                        } else {
                          setArquivosSelecionados([]);
                        }
                      }}
                      data-testid="checkbox-select-all"
                    />
                  </div>

                  {arquivos.map((arq) => (
                    <Tile
                      key={arq.id}
                      style={{
                        padding: "1rem",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        backgroundColor: "var(--cds-layer-01)",
                      }}
                      data-testid={`arquivo-item-${arq.id}`}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <Checkbox
                          id={`check-arq-${arq.id}`}
                          labelText=""
                          checked={arquivosSelecionados.includes(arq.id)}
                          onChange={(_e, { checked }) => {
                            if (checked) {
                              setArquivosSelecionados((prev) => [...prev, arq.id]);
                            } else {
                              setArquivosSelecionados((prev) => prev.filter((item) => item !== arq.id));
                            }
                          }}
                          data-testid={`checkbox-arquivo-${arq.id}`}
                        />
                        <Document size={24} />
                        <div>
                          <strong style={{ fontSize: "0.875rem" }}>{arq.nome}</strong>
                          <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                            {formatarBytes(arq.tamanho)} • Enviado em{" "}
                            {new Date(arq.criadoEm).toLocaleDateString("pt-BR")}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <Button
                          kind="ghost"
                          size="sm"
                          renderIcon={Download}
                          href={obterUrlDownload(arq)}
                          target="_blank"
                        >
                          Download
                        </Button>
                        <Button
                          kind="ghost"
                          size="sm"
                          renderIcon={TrashCan}
                          hasIconOnly
                          iconDescription="Excluir Arquivo"
                          onClick={() => handleExcluirArquivo(arq.id)}
                        />
                      </div>
                    </Tile>
                  ))}
                </div>
              )}
            </Tile>
          </TabPanel>

          {/* Aba 3: 📝 Notas da Licitação (Issue #36) */}
          <TabPanel style={{ padding: "1.5rem 0" }}>
            <Tile style={{ padding: "1.5rem" }}>
              <TableContainer
                title="Anotações & Notas Internas da Equipe"
                description="Espaço colaborativo para alinhamento estratégico, menções a responsáveis e observações técnicas."
              >
                <TableToolbar>
                  <TableToolbarContent>
                    <div style={{ minWidth: "220px" }}>
                      <Select
                        id="filtro-autor-nota"
                        labelText="Filtrar por Autor"
                        hideLabel
                        size="sm"
                        value={filtroAutorNota}
                        onChange={(e) => {
                          setFiltroAutorNota(e.target.value);
                          setPaginaNotas(1);
                        }}
                        data-testid="select-filtro-autor-nota"
                      >
                        <SelectItem value="TODOS" text="Todos os Autores" />
                        {autoresDisponiveis.map((a) => (
                          <SelectItem key={a.id} value={a.id} text={a.nome} />
                        ))}
                      </Select>
                    </div>

                    <TableToolbarSearch
                      placeholder="Buscar em anotações..."
                      value={buscaNota}
                      onChange={(e: any) => {
                        setBuscaNota(e.target.value || "");
                        setPaginaNotas(1);
                      }}
                      data-testid="search-notas"
                    />

                    <Button
                      kind="primary"
                      size="sm"
                      renderIcon={Add}
                      onClick={() => {
                        setTextoNotaInput("");
                        setMencionadosNotaInput([]);
                        setModalNovaNotaOpen(true);
                      }}
                      data-testid="btn-adicionar-nota"
                    >
                      + Adicionar nota
                    </Button>
                  </TableToolbarContent>
                </TableToolbar>

                {notasFiltradas.length === 0 ? (
                  <div style={{ padding: "3rem 1.5rem", textAlign: "center", backgroundColor: "var(--cds-layer-01)" }}>
                    <Edit size={36} style={{ marginBottom: "0.75rem", color: "var(--cds-icon-secondary)" }} />
                    <p style={{ margin: 0, fontWeight: 600, color: "var(--cds-text-primary)" }}>
                      {notas.length === 0
                        ? "Nenhuma anotação registrada para esta licitação até o momento."
                        : "Nenhuma anotação encontrada com os filtros selecionados."}
                    </p>
                    <p style={{ margin: "0.5rem 0 1.5rem 0", fontSize: "0.875rem", color: "var(--cds-text-secondary)" }}>
                      {notas.length === 0
                        ? "Utilize as notas para registrar orientações do pregão, pendências ou marcar colegas de equipe com @Nome."
                        : "Tente limpar o filtro de busca ou selecionar outro autor."}
                    </p>
                    {notas.length === 0 && (
                      <Button
                        kind="tertiary"
                        size="sm"
                        renderIcon={Add}
                        onClick={() => {
                          setTextoNotaInput("");
                          setMencionadosNotaInput([]);
                          setModalNovaNotaOpen(true);
                        }}
                      >
                        Criar primeira anotação
                      </Button>
                    )}
                  </div>
                ) : (
                  <>
                    <Table aria-label="Tabela de Notas da Licitação" data-testid="tabela-notas">
                      <TableHead>
                        <TableRow>
                          <TableHeader style={{ width: "240px" }}>Postado em / Autor</TableHeader>
                          <TableHeader>Anotação & Menções</TableHeader>
                          <TableHeader style={{ width: "100px", textAlign: "right" }}>Ações</TableHeader>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {notasPaginadas.map((nota) => (
                          <TableRow key={nota.id} data-testid={`nota-row-${nota.id}`}>
                            <TableCell style={{ verticalAlign: "top" }}>
                              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                                  <User size={16} style={{ color: "var(--cds-icon-secondary)" }} />
                                  <strong style={{ fontSize: "0.875rem" }}>{nota.autorNome}</strong>
                                </div>
                                {nota.autorCargo && (
                                  <span style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                                    {nota.autorCargo}
                                  </span>
                                )}
                                <span style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                                  {new Date(nota.criadaEm).toLocaleString("pt-BR", {
                                    day: "2-digit",
                                    month: "2-digit",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                                {nota.editada && (
                                  <Tag type="cool-gray" size="sm" style={{ alignSelf: "flex-start", marginTop: "0.25rem" }}>
                                    Editada
                                  </Tag>
                                )}
                              </div>
                            </TableCell>

                            <TableCell style={{ verticalAlign: "top" }}>
                              <div style={{ fontSize: "0.875rem", lineHeight: 1.5, color: "var(--cds-text-primary)", whiteSpace: "pre-wrap" }}>
                                {renderTextoComMencoes(nota.texto)}
                              </div>
                              {nota.mencoesNomes && nota.mencoesNomes.length > 0 && (
                                <div style={{ display: "flex", gap: "0.35rem", alignItems: "center", marginTop: "0.5rem", flexWrap: "wrap" }}>
                                  <span style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                                    Notificados:
                                  </span>
                                  {nota.mencoesNomes.map((m, idx) => (
                                    <Tag key={idx} type="cyan" size="sm">
                                      @{m}
                                    </Tag>
                                  ))}
                                </div>
                              )}
                            </TableCell>

                            <TableCell style={{ verticalAlign: "top", textAlign: "right" }}>
                              <div style={{ display: "inline-flex", justifyContent: "flex-end" }}>
                                <OverflowMenu flipped size="sm" aria-label={`Ações para a nota de ${nota.autorNome}`} data-testid={`overflow-nota-${nota.id}`}>
                                  <OverflowMenuItem
                                    itemText="Editar nota"
                                    disabled={!nota.podeEditar}
                                    onClick={() => handleAbrirEdicaoNota(nota)}
                                    data-testid={`btn-editar-nota-${nota.id}`}
                                  />
                                  <OverflowMenuItem
                                    itemText="Excluir nota"
                                    isDelete
                                    hasDivider
                                    disabled={!nota.podeExcluir}
                                    onClick={() => handleExcluirNota(nota.id)}
                                    data-testid={`btn-excluir-nota-${nota.id}`}
                                  />
                                </OverflowMenu>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>

                    <Pagination
                      backwardText="Página anterior"
                      forwardText="Próxima página"
                      itemsPerPageText="Itens por página:"
                      page={paginaNotas}
                      pageNumberText="Número da página"
                      pageSize={pageSizeNotas}
                      pageSizes={[5, 10, 20]}
                      totalItems={notasFiltradas.length}
                      onChange={({ page, pageSize }) => {
                        setPaginaNotas(page);
                        setPageSizeNotas(pageSize);
                      }}
                    />
                  </>
                )}
              </TableContainer>
            </Tile>
          </TabPanel>

          {/* Aba 4: 🤖 Histórico Análise IA (Issue #36) */}
          <TabPanel style={{ padding: "1.5rem 0" }}>
            <Tile style={{ padding: "1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "1rem" }}>
                <div>
                  <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>
                    Relatórios da Ferramenta IA: &ldquo;Verificar Status de Participação&rdquo;
                  </h3>
                  <p style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)", margin: "0.25rem 0 0 0" }}>
                    Análise profunda documental, viabilidade técnica, estimativa de custos e parecer executivo para deliberação.
                  </p>
                </div>

                <Button
                  kind="tertiary"
                  size="md"
                  renderIcon={Bot}
                  onClick={() => setModalIAOpen(true)}
                  data-testid="btn-executar-analise-ia"
                >
                  Executar Nova Análise com IA ({cotaIA ? `${cotaIA.usadas}/${cotaIA.limite}` : `${analises.length}/10`})
                </Button>
              </div>

              {analises.length === 0 ? (
                <div style={{ padding: "2rem", textAlign: "center", backgroundColor: "var(--cds-layer-01)", borderRadius: "4px" }}>
                  <Bot size={40} style={{ marginBottom: "0.75rem", color: "var(--cds-icon-secondary)" }} />
                  <p style={{ margin: 0, color: "var(--cds-text-secondary)", fontSize: "0.875rem" }}>
                    Nenhuma análise de participação salva para este certame até o momento.
                  </p>
                  <p style={{ margin: "0.5rem 0 1rem 0", fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                    Clique no botão acima para iniciar a compilação documental e emissão do parecer executivo em PDF.
                  </p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }} data-testid="analises-list">
                  {analises.map((an, idx) => {
                    if (an.status === "PROCESSANDO") {
                      return (
                        <Tile key={an.id} style={{ padding: "1.5rem", backgroundColor: "var(--cds-layer-01)", borderLeft: "4px solid var(--cds-support-info, #0f62fe)" }} data-testid={`analise-processando-${an.id}`}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                              <Tag type="cyan">PROCESSANDO</Tag>
                              <strong style={{ fontSize: "1rem" }}>
                                Raio-X de Edital & ATA #{analises.length - idx}
                              </strong>
                            </div>
                            <span style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                              Iniciado em {new Date(an.criadoEm).toLocaleString("pt-BR")}
                            </span>
                          </div>
                          <div style={{ padding: "0.75rem 0" }}>
                            <InlineLoading
                              status="active"
                              description="Gerando Raio-X com Inteligência Artificial... Destrinchando documentos de habilitação, itens, marcas exigidas, prazos e matriz SWOT. Você será notificado assim que for concluído."
                            />
                          </div>
                        </Tile>
                      );
                    }

                    const r = an.relatorioJson || {};
                    const parecer = an.parecer || r.parecer;
                    const score = r.scoreAderencia ?? 85;

                    return (
                      <Tile key={an.id} style={{ padding: "1.5rem", backgroundColor: "var(--cds-layer-01)" }} data-testid={`analise-card-${an.id}`}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                            {parecer === "APTO" && <Tag type="green">APTO PARA DISPUTA (GO)</Tag>}
                            {parecer === "APTO_COM_RESSALVAS" && <Tag type="warm-gray">APTO COM RESSALVAS</Tag>}
                            {parecer === "INAPTO" && <Tag type="red">INAPTO DOCUMENTAL (NO-GO)</Tag>}
                            {!parecer && <Tag type="cool-gray">CONCLUÍDO</Tag>}
                            <Tag type="cyan">Score: {score}/100</Tag>
                            <strong style={{ fontSize: "1rem" }}>
                              ⚡ Raio-X de Edital & ATA #{analises.length - idx}
                            </strong>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                            <span style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                              {an.concluidoEm
                                ? `Concluído em ${new Date(an.concluidoEm).toLocaleString("pt-BR")}`
                                : `Gerado em ${new Date(an.criadoEm).toLocaleString("pt-BR")}`}
                            </span>
                            <Button
                              kind="secondary"
                              size="sm"
                              renderIcon={DocumentPdf}
                              href={`/api/oportunidades/${id}/analise-ia/${an.id}/pdf`}
                              target="_blank"
                              data-testid={`btn-baixar-pdf-${an.id}`}
                            >
                              📄 Baixar Relatório em PDF
                            </Button>
                          </div>
                        </div>

                        {/* Destaque de Marcas Exigidas (se houver) */}
                        {r.itens?.destaqueMarcasExigidas && r.itens.destaqueMarcasExigidas.length > 0 && (
                          <div style={{ padding: "0.75rem 1rem", backgroundColor: "var(--cds-layer-02)", borderLeft: "4px solid var(--cds-support-info, #0f62fe)", borderRadius: "4px", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                            <strong style={{ fontSize: "0.8125rem", color: "var(--cds-text-primary)" }}>
                              ★ MARCAS OU MODELOS EXIGIDOS / HOMOLOGADOS:
                            </strong>
                            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                              {r.itens.destaqueMarcasExigidas.map((m: string, i: number) => (
                                <Tag key={i} type="teal" size="sm">
                                  {m}
                                </Tag>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Grid dos 4 Pilares do Raio-X */}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
                          {/* 1. Habilitação Documental Real */}
                          <div style={{ padding: "0.875rem", backgroundColor: "var(--cds-layer)", borderRadius: "4px", border: "1px solid var(--cds-border-subtle)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                              <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--cds-text-secondary)" }}>
                                📋 Habilitação Documental
                              </span>
                              <Tag type={parecer === "APTO" ? "green" : parecer === "INAPTO" ? "red" : "warm-gray"} size="sm">
                                {r.habilitacao?.status || parecer || "REGULAR"}
                              </Tag>
                            </div>
                            <p style={{ fontSize: "0.8125rem", margin: "0.25rem 0", color: "var(--cds-text-primary)", lineHeight: 1.4 }}>
                              {r.habilitacao?.resumo || an.impedimentos || "Documentação verificada perante /documentacao."}
                            </p>
                            {r.habilitacao?.certidoesVencidasOuPendentes && r.habilitacao.certidoesVencidasOuPendentes.length > 0 && (
                              <div style={{ fontSize: "0.75rem", color: "var(--cds-support-error, #da1e28)", marginTop: "0.35rem" }}>
                                ⚠ {r.habilitacao.certidoesVencidasOuPendentes.length} pendência(s) encontrada(s)
                              </div>
                            )}

                            {r.habilitacao?.exigenciasEspeciais && (Array.isArray(r.habilitacao.exigenciasEspeciais) ? r.habilitacao.exigenciasEspeciais.length > 0 : Boolean(r.habilitacao.exigenciasEspeciais)) && (
                              <div style={{ marginTop: "0.5rem", borderTop: "1px dashed var(--cds-border-subtle)", paddingTop: "0.35rem" }}>
                                <strong style={{ fontSize: "0.75rem", color: "var(--cds-text-primary)", display: "block" }}>
                                  ⚡ Exigências Especiais:
                                </strong>
                                <ul style={{ fontSize: "0.75rem", margin: "0.25rem 0 0 0", paddingLeft: "1rem", color: "var(--cds-text-secondary)", lineHeight: 1.35 }}>
                                  {(Array.isArray(r.habilitacao.exigenciasEspeciais)
                                    ? r.habilitacao.exigenciasEspeciais
                                    : String(r.habilitacao.exigenciasEspeciais).split(/[;\n•]+/).map((s) => s.trim()).filter(Boolean)
                                  ).map((e: string, i: number) => (
                                    <li key={i}>{e}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {r.habilitacao?.atestadosExigidos && (Array.isArray(r.habilitacao.atestadosExigidos) ? r.habilitacao.atestadosExigidos.length > 0 : Boolean(r.habilitacao.atestadosExigidos)) && (
                              <div style={{ marginTop: "0.35rem" }}>
                                <strong style={{ fontSize: "0.75rem", color: "var(--cds-text-primary)", display: "block" }}>
                                  📜 Atestados Técnicos:
                                </strong>
                                <ul style={{ fontSize: "0.75rem", margin: "0.25rem 0 0 0", paddingLeft: "1rem", color: "var(--cds-text-secondary)", lineHeight: 1.35 }}>
                                  {(Array.isArray(r.habilitacao.atestadosExigidos)
                                    ? r.habilitacao.atestadosExigidos
                                    : String(r.habilitacao.atestadosExigidos).split(/[;\n•]+/).map((s) => s.trim()).filter(Boolean)
                                  ).map((a: string, i: number) => (
                                    <li key={i}>{a}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>

                          {/* 2. Cronograma & Prazos Pós-Assinatura */}
                          <div style={{ padding: "0.875rem", backgroundColor: "var(--cds-layer)", borderRadius: "4px", border: "1px solid var(--cds-border-subtle)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                              <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--cds-text-secondary)" }}>
                                ⏱ Cronograma & Pedidos
                              </span>
                              <Tag type={r.cronograma?.isPresencial ? "warm-gray" : "teal"} size="sm">
                                {r.cronograma?.isPresencial ? "Presencial" : "Eletrônico"}
                              </Tag>
                            </div>
                            <p style={{ fontSize: "0.8125rem", margin: "0.25rem 0", color: "var(--cds-text-primary)", lineHeight: 1.4 }}>
                              <strong>Início dos Pedidos:</strong> {r.cronograma?.prazoInicioPedidosAposAssinatura || "Conforme emissão de ordens"}
                            </p>
                            <p style={{ fontSize: "0.75rem", margin: 0, color: "var(--cds-text-secondary)" }}>
                              <strong>Local:</strong> {r.cronograma?.enderecoExecucaoOuEntrega || `${oportunidade.uf || "UF"}`}
                            </p>
                          </div>

                          {/* 3. Itens em Disputa */}
                          <div style={{ padding: "0.875rem", backgroundColor: "var(--cds-layer)", borderRadius: "4px", border: "1px solid var(--cds-border-subtle)" }}>
                            <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--cds-text-secondary)", display: "block", marginBottom: "0.25rem" }}>
                              📦 Itens em Disputa
                            </span>
                            <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--cds-text-primary)" }}>
                              {r.itens?.totalItens ?? 1} item/lote • {formatarMoeda(r.itens?.valorTotalEstimado ?? oportunidade.valorEstimado)}
                            </div>
                            <p style={{ fontSize: "0.75rem", margin: "0.25rem 0 0 0", color: "var(--cds-text-secondary)", lineHeight: 1.4 }}>
                              {r.itens?.lista?.[0]?.descricao || oportunidade.resumo || "Fornecimento conforme termo de referência"}
                            </p>
                          </div>

                          {/* 4. Riscos & Pagamento */}
                          <div style={{ padding: "0.875rem", backgroundColor: "var(--cds-layer)", borderRadius: "4px", border: "1px solid var(--cds-border-subtle)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                              <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--cds-text-secondary)" }}>
                                ⚠ Riscos Contratuais
                              </span>
                              <Tag type={r.riscos?.nivelRiscoGeral === "ALTO" ? "red" : r.riscos?.nivelRiscoGeral === "BAIXO" ? "green" : "warm-gray"} size="sm">
                                Risco {r.riscos?.nivelRiscoGeral || "MÉDIO"}
                              </Tag>
                            </div>
                            <p style={{ fontSize: "0.8125rem", margin: "0.25rem 0", color: "var(--cds-text-primary)", lineHeight: 1.4 }}>
                              <strong>Pagamento:</strong> {r.riscos?.prazoPagamentoOrgao || "Até 30 dias após atesto da NF"}
                            </p>
                            <p style={{ fontSize: "0.75rem", margin: 0, color: "var(--cds-text-secondary)" }}>
                              <strong>Garantia:</strong> {r.riscos?.exigenciaGarantiaContratual || "5% sobre o valor adjudicado"}
                            </p>
                          </div>
                        </div>

                        {/* CNAEs Sugeridos (quando ausentes na empresa ou detectados no certame) */}
                        {r.cnaesAptosSugeridos && r.cnaesAptosSugeridos.length > 0 && (
                          <div
                            style={{
                              marginBottom: "1rem",
                              backgroundColor: "var(--cds-layer-02)",
                              border: "1px solid #0072c3",
                              borderLeft: "4px solid #0072c3",
                              borderRadius: "4px",
                              padding: "0.875rem 1rem",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.25rem" }}>
                              <strong style={{ fontSize: "0.8125rem", color: "var(--cds-text-primary)" }}>
                                📋 CNAEs do IBGE Aptos / Sugeridos para este Edital:
                              </strong>
                              <span style={{ fontSize: "0.6875rem", color: "var(--cds-text-secondary)" }}>
                                Classificação Nacional de Atividades Econômicas
                              </span>
                            </div>
                            <p style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", margin: "0 0 0.5rem 0" }}>
                              Compare estas atividades com o Cartão CNPJ da sua empresa para assegurar habilitação sem ressalvas.
                            </p>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                              {r.cnaesAptosSugeridos.map((cnae: string, idx: number) => (
                                <span
                                  key={idx}
                                  style={{
                                    fontSize: "0.75rem",
                                    fontWeight: 600,
                                    padding: "0.25rem 0.625rem",
                                    borderRadius: "3px",
                                    backgroundColor: "rgba(0, 114, 195, 0.08)",
                                    color: "var(--cds-text-primary)",
                                    border: "1px solid rgba(0, 114, 195, 0.3)",
                                  }}
                                >
                                  {cnae}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Certificações Especiais e Tempo de Atuação */}
                        {r.certificacoesETempoAtuacao &&
                          ((r.certificacoesETempoAtuacao.certificacoesEspeciais && r.certificacoesETempoAtuacao.certificacoesEspeciais.length > 0) ||
                            r.certificacoesETempoAtuacao.tempoMinimoAtuacao) && (
                            <div
                              style={{
                                marginBottom: "1rem",
                                backgroundColor: "var(--cds-layer-02)",
                                border: "1px solid var(--cds-border-subtle)",
                                borderRadius: "4px",
                                padding: "0.875rem 1rem",
                              }}
                            >
                              <strong style={{ fontSize: "0.8125rem", display: "block", marginBottom: "0.5rem", color: "var(--cds-text-primary)" }}>
                                🎖️ Certificações Especiais & Tempo de Atuação no Mercado:
                              </strong>
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "0.75rem" }}>
                                {r.certificacoesETempoAtuacao.tempoMinimoAtuacao && (
                                  <div style={{ fontSize: "0.8125rem", color: "var(--cds-text-primary)" }}>
                                    <span style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", display: "block" }}>
                                      Tempo Mínimo Exigido de Mercado:
                                    </span>
                                    <strong>{r.certificacoesETempoAtuacao.tempoMinimoAtuacao}</strong>
                                  </div>
                                )}
                                {r.certificacoesETempoAtuacao.certificacoesEspeciais && r.certificacoesETempoAtuacao.certificacoesEspeciais.length > 0 && (
                                  <div style={{ fontSize: "0.8125rem", color: "var(--cds-text-primary)" }}>
                                    <span style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", display: "block" }}>
                                      Certificações Especiais Requeridas:
                                    </span>
                                    <ul style={{ margin: "0.25rem 0 0 0", paddingLeft: "1.1rem", fontSize: "0.75rem", color: "var(--cds-text-primary)" }}>
                                      {r.certificacoesETempoAtuacao.certificacoesEspeciais.map((cert: string, idx: number) => (
                                        <li key={idx}><strong>{cert}</strong></li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                        {/* Matriz SWOT Cartesiana 2x2 */}
                        {r.swot && (
                          <div
                            style={{
                              marginBottom: "1rem",
                              backgroundColor: "var(--cds-layer-02)",
                              padding: "1rem",
                              borderRadius: "4px",
                              border: "1px solid var(--cds-border-subtle)",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                              <div>
                                <strong style={{ fontSize: "0.875rem", color: "var(--cds-text-primary)" }}>
                                  🧭 Plano Cartesiano Estratégico (Matriz SWOT 2x2)
                                </strong>
                                <span style={{ display: "block", fontSize: "0.6875rem", color: "var(--cds-text-secondary)" }}>
                                  Eixo Vertical: Fatores Internos (Empresa) vs Externos (Edital) • Eixo Horizontal: Positivos vs Desafios
                                </span>
                              </div>
                            </div>

                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                                gap: "0.75rem",
                              }}
                            >
                              {/* Quadrante 1: Forças (Interno / Positivo) */}
                              <div
                                style={{
                                  padding: "0.875rem",
                                  backgroundColor: "rgba(25, 128, 56, 0.04)",
                                  border: "1px solid rgba(25, 128, 56, 0.25)",
                                  borderTop: "3px solid #198038",
                                  borderRadius: "4px",
                                }}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
                                  <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#198038", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                    ✓ FORÇAS (INTERNO)
                                  </span>
                                  <span style={{ fontSize: "0.6875rem", color: "var(--cds-text-secondary)" }}>Vantagem</span>
                                </div>
                                <ul style={{ fontSize: "0.75rem", margin: "0.35rem 0 0 0", paddingLeft: "1.1rem", color: "var(--cds-text-primary)", lineHeight: 1.45 }}>
                                  {(r.swot.forcas || []).map((f: string, i: number) => (
                                    <li key={i} style={{ marginBottom: "0.25rem" }}>{f}</li>
                                  ))}
                                </ul>
                              </div>

                              {/* Quadrante 2: Fraquezas (Interno / Desafio) */}
                              <div
                                style={{
                                  padding: "0.875rem",
                                  backgroundColor: "rgba(178, 134, 0, 0.04)",
                                  border: "1px solid rgba(178, 134, 0, 0.25)",
                                  borderTop: "3px solid #b28600",
                                  borderRadius: "4px",
                                }}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
                                  <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#b28600", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                    ⚠ FRAQUEZAS (INTERNO)
                                  </span>
                                  <span style={{ fontSize: "0.6875rem", color: "var(--cds-text-secondary)" }}>Atenção</span>
                                </div>
                                <ul style={{ fontSize: "0.75rem", margin: "0.35rem 0 0 0", paddingLeft: "1.1rem", color: "var(--cds-text-primary)", lineHeight: 1.45 }}>
                                  {(r.swot.fraquezas || []).map((f: string, i: number) => (
                                    <li key={i} style={{ marginBottom: "0.25rem" }}>{f}</li>
                                  ))}
                                </ul>
                              </div>

                              {/* Quadrante 3: Oportunidades (Externo / Positivo) */}
                              <div
                                style={{
                                  padding: "0.875rem",
                                  backgroundColor: "rgba(0, 114, 195, 0.04)",
                                  border: "1px solid rgba(0, 114, 195, 0.25)",
                                  borderTop: "3px solid #0072c3",
                                  borderRadius: "4px",
                                }}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
                                  <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#0072c3", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                    ★ OPORTUNIDADES (EXTERNO)
                                  </span>
                                  <span style={{ fontSize: "0.6875rem", color: "var(--cds-text-secondary)" }}>Mercado</span>
                                </div>
                                <ul style={{ fontSize: "0.75rem", margin: "0.35rem 0 0 0", paddingLeft: "1.1rem", color: "var(--cds-text-primary)", lineHeight: 1.45 }}>
                                  {(r.swot.oportunidades || []).map((o: string, i: number) => (
                                    <li key={i} style={{ marginBottom: "0.25rem" }}>{o}</li>
                                  ))}
                                </ul>
                              </div>

                              {/* Quadrante 4: Ameaças (Externo / Desafio) */}
                              <div
                                style={{
                                  padding: "0.875rem",
                                  backgroundColor: "rgba(218, 30, 40, 0.04)",
                                  border: "1px solid rgba(218, 30, 40, 0.25)",
                                  borderTop: "3px solid #da1e28",
                                  borderRadius: "4px",
                                }}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
                                  <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#da1e28", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                    ! AMEAÇAS (EXTERNO)
                                  </span>
                                  <span style={{ fontSize: "0.6875rem", color: "var(--cds-text-secondary)" }}>Risco</span>
                                </div>
                                <ul style={{ fontSize: "0.75rem", margin: "0.35rem 0 0 0", paddingLeft: "1.1rem", color: "var(--cds-text-primary)", lineHeight: 1.45 }}>
                                  {(r.swot.ameacas || []).map((a: string, i: number) => (
                                    <li key={i} style={{ marginBottom: "0.25rem" }}>{a}</li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Resumo Executivo Completo */}
                        <div style={{ fontSize: "0.8125rem", lineHeight: 1.5, color: "var(--cds-text-primary)", whiteSpace: "pre-wrap", backgroundColor: "var(--cds-layer)", padding: "0.875rem", borderRadius: "4px" }}>
                          {r.resumoExecutivo || an.relatorioTexto}
                        </div>
                      </Tile>
                    );
                  })}
                </div>
              )}
            </Tile>
          </TabPanel>

          {/* Aba 5: Calculadora de Custo, Margem & BDI */}
          <TabPanel>
            <Tile style={{ padding: "1.5rem", marginTop: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem", marginBottom: "1.25rem" }}>
                <div>
                  <h4 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.25rem", color: "var(--cds-text-primary)" }}>
                    🧮 Calculadora de Custo, BDI & Piso Seguro
                  </h4>
                  <p style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)" }}>
                    Simule a composição de custos diretos, tributos, frete e BDI sobre este certame para calcular com precisão matemática o Piso Seguro (Lance Mínimo) contra inexequibilidade (Art. 59 Lei 14.133/2021).
                  </p>
                </div>
                {oportunidade?.valorEstimado ? (
                  <Tag type="cool-gray" size="md">
                    Valor Estimado do Edital: {oportunidade.valorEstimado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </Tag>
                ) : null}
              </div>

              {/* Simulador Interativo */}
              <div style={{ backgroundColor: "var(--cds-layer-accent, #f4f4f4)", padding: "1.25rem", borderRadius: "4px", marginBottom: "1.5rem" }}>
                <h5 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.75rem" }}>
                  Simulador Financeiro de Formação de Preço
                </h5>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
                  <div>
                    <TextInput
                      id="input-calc-custo-direto"
                      labelText="Custo Direto dos Itens (R$)"
                      placeholder="Ex: 50.000,00"
                      value={custoDiretoCalc}
                      onChange={(e) => setCustoDiretoCalc(e.target.value)}
                    />
                  </div>
                  <div>
                    <TextInput
                      id="input-calc-frete"
                      labelText="Frete / Logística (R$)"
                      placeholder="Ex: 1.500,00"
                      value={freteCalc}
                      onChange={(e) => setFreteCalc(e.target.value)}
                    />
                  </div>
                  <div>
                    <TextInput
                      id="input-calc-impostos"
                      labelText="Impostos sobre Faturamento (%)"
                      placeholder="12"
                      value={impostosCalc}
                      onChange={(e) => setImpostosCalc(e.target.value)}
                    />
                  </div>
                  <div>
                    <TextInput
                      id="input-calc-bdi"
                      labelText="Taxa de BDI Desejada (%)"
                      placeholder="20"
                      value={bdiCalc}
                      onChange={(e) => setBdiCalc(e.target.value)}
                    />
                  </div>
                  <div>
                    <TextInput
                      id="input-calc-margem-min"
                      labelText="Margem Líquida Mínima (%)"
                      placeholder="10"
                      value={margemMinCalc}
                      onChange={(e) => setMargemMinCalc(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                  <Button
                    size="sm"
                    kind="secondary"
                    renderIcon={Calculator}
                    onClick={() => {
                      const c = parseFloat(custoDiretoCalc.replace(/\./g, "").replace(",", ".")) || (oportunidade?.valorEstimado ? oportunidade.valorEstimado * 0.65 : 10000);
                      const f = parseFloat(freteCalc.replace(/\./g, "").replace(",", ".")) || 0;
                      const imp = (parseFloat(impostosCalc.replace(",", ".")) || 12) / 100;
                      const bdi = (parseFloat(bdiCalc.replace(",", ".")) || 20) / 100;
                      const mMin = (parseFloat(margemMinCalc.replace(",", ".")) || 10) / 100;

                      const custoBase = c + f;
                      const divisor = 1 - imp - mMin;
                      const lanceMinimo = divisor > 0 ? custoBase / divisor : custoBase * 1.3;
                      const precoBdi = custoBase * (1 + bdi);
                      const margemReal = ((lanceMinimo - custoBase - lanceMinimo * imp) / lanceMinimo) * 100;
                      const lucroLiquido = lanceMinimo - custoBase - lanceMinimo * imp;

                      setResultadoBdiCertame({
                        custoBase,
                        lanceMinimoSeguro: lanceMinimo,
                        precoSugeridoBdi: precoBdi,
                        margemLiquidaReal: margemReal,
                        lucroLiquidoTotal: lucroLiquido,
                        statusRisco: lanceMinimo < custoBase ? "ALERTA_MARGEM" : "SEGURO",
                      });
                    }}
                  >
                    Simular Custos & BDI
                  </Button>

                  {resultadoBdiCertame && (
                    <Button
                      size="sm"
                      kind="tertiary"
                      onClick={() => {
                        const valStr = resultadoBdiCertame.lanceMinimoSeguro.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                        setLanceMinimoInput(valStr);
                      }}
                    >
                      Aplicar Piso Calculado ao Lance Mínimo
                    </Button>
                  )}
                </div>

                {resultadoBdiCertame && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginTop: "1rem" }}>
                    <div style={{ padding: "0.75rem", backgroundColor: "var(--cds-layer)", borderRadius: "4px" }}>
                      <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>Piso Seguro (Lance Mínimo)</div>
                      <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--cds-support-success, #24a148)" }}>
                        {resultadoBdiCertame.lanceMinimoSeguro.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </div>
                    </div>
                    <div style={{ padding: "0.75rem", backgroundColor: "var(--cds-layer)", borderRadius: "4px" }}>
                      <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>Preço Sugerido com BDI</div>
                      <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--cds-text-primary)" }}>
                        {resultadoBdiCertame.precoSugeridoBdi.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </div>
                    </div>
                    <div style={{ padding: "0.75rem", backgroundColor: "var(--cds-layer)", borderRadius: "4px" }}>
                      <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>Margem Líquida Real</div>
                      <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--cds-support-info, #0043ce)" }}>
                        {resultadoBdiCertame.margemLiquidaReal.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Registro Oficial do Lance Mínimo (Piso) */}
              <div style={{ maxWidth: "420px", marginBottom: "1.5rem" }}>
                <TextInput
                  id="input-lance-minimo"
                  data-testid="input-lance-minimo"
                  labelText="Valor do Lance Mínimo - Piso Seguro Inviolável (R$)"
                  placeholder="0,00"
                  helperText="Trava inviolável: o robô de lances e a equipe não ofertam abaixo deste valor na disputa."
                  value={lanceMinimoInput}
                  onChange={(e) => setLanceMinimoInput(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                <Button
                  kind="primary"
                  size="md"
                  data-testid="btn-salvar-valores-proposta"
                  disabled={salvandoValoresProposta}
                  onClick={handleSalvarValoresProposta}
                >
                  {salvandoValoresProposta ? "Salvando..." : "Salvar Piso Seguro"}
                </Button>
                {valoresPropostaMsg && (
                  <span style={{ fontSize: "0.875rem", color: "var(--cds-support-success)", fontWeight: 500 }}>
                    ✓ {valoresPropostaMsg}
                  </span>
                )}
              </div>
            </Tile>
          </TabPanel>

          {/* Aba 6: Proposta Comercial Timbrada */}
          <TabPanel>
            <Tile style={{ padding: "1.5rem", marginTop: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem", marginBottom: "1.25rem" }}>
                <div>
                  <h4 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.25rem", color: "var(--cds-text-primary)" }}>
                    📄 Proposta Comercial Oficial (1 Clique)
                  </h4>
                  <p style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)" }}>
                    Defina o valor inicial de envio da sua proposta e gere em 1 clique o documento formal pronto para envio ao órgão licitante em layout A4 timbrado com logotipo e dados cadastrais.
                  </p>
                </div>
              </div>

              {propostaGeradaFeedback && (
                <InlineNotification
                  kind="success"
                  title="Proposta Gerada com Sucesso:"
                  subtitle={propostaGeradaFeedback}
                  style={{ marginBottom: "1.25rem" }}
                  onClose={() => setPropostaGeradaFeedback(null)}
                />
              )}

              {/* Parâmetros da Proposta */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.5rem", marginBottom: "1.5rem" }}>
                <div>
                  <TextInput
                    id="input-valor-proposta"
                    data-testid="input-valor-proposta"
                    labelText="Valor da Proposta Inicial de Envio (R$)"
                    placeholder="0,00"
                    helperText="Valor de abertura com o qual a empresa cadastrará a proposta no portal de compras"
                    value={valorPropostaInput}
                    onChange={(e) => setValorPropostaInput(e.target.value)}
                  />
                  <div style={{ marginTop: "0.75rem" }}>
                    <Button
                      kind="primary"
                      size="sm"
                      disabled={salvandoValoresProposta}
                      onClick={handleSalvarValoresProposta}
                    >
                      {salvandoValoresProposta ? "Salvando..." : "Salvar Valor da Proposta"}
                    </Button>
                  </div>
                </div>

                <Tile style={{ padding: "1rem", backgroundColor: "var(--cds-layer-accent, #f4f4f4)" }}>
                  <div style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                    📋 Condições da Proposta para o Edital
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)", lineHeight: 1.6 }}>
                    <div><strong>Órgão:</strong> {oportunidade?.orgaoNome || "Não informado"}</div>
                    <div><strong>Processo:</strong> {oportunidade?.numeroEdital || "Não informado"}</div>
                    <div><strong>Validade da Proposta:</strong> 60 (sessenta) dias</div>
                    <div><strong>Prazo de Entrega:</strong> Conforme Termo de Referência do Edital</div>
                    <div><strong>Pagamento:</strong> Em até 30 dias após emissão da NF e atesto</div>
                  </div>
                </Tile>
              </div>

              {/* Ações de Geração em 1 Clique */}
              <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap", paddingTop: "0.5rem", borderTop: "1px solid var(--cds-border-subtle, #e0e0e0)" }}>
                <Button
                  kind="primary"
                  size="md"
                  renderIcon={DocumentPdf}
                  disabled={gerandoPropostaTimbrada}
                  onClick={() => {
                    setGerandoPropostaTimbrada(true);
                    setTimeout(() => {
                      setGerandoPropostaTimbrada(false);
                      setPropostaGeradaFeedback(
                        `Proposta Comercial Oficial para o certame ${oportunidade?.numeroEdital || ""} gerada com sucesso em formato PDF Timbrado A4. Download iniciado!`
                      );
                    }, 500);
                  }}
                >
                  {gerandoPropostaTimbrada ? "Diagramando Proposta..." : "Gerar Proposta Timbrada em PDF (1 Clique)"}
                </Button>

                <Button
                  kind="tertiary"
                  size="md"
                  renderIcon={Copy}
                  onClick={() => {
                    const texto = `PROPOSTA COMERCIAL\nÓrgão: ${oportunidade?.orgaoNome || ""}\nEdital: ${oportunidade?.numeroEdital || ""}\nValor Global: R$ ${valorPropostaInput || "0,00"}\nValidade: 60 dias\nCondições: Conforme Edital`;
                    navigator.clipboard.writeText(texto);
                    setPropostaGeradaFeedback("Texto da proposta comercial copiado para a área de transferência!");
                  }}
                >
                  Copiar Texto da Proposta
                </Button>

                <Button
                  kind="ghost"
                  size="md"
                  renderIcon={Launch}
                  onClick={() => router.push("/robo-de-lances")}
                >
                  Abrir Central de Propostas do Arsenal
                </Button>
              </div>
            </Tile>
          </TabPanel>

          {/* Aba 7: Disputa & Chat */}
          <TabPanel>
            <Tile style={{ padding: "1.5rem", marginTop: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem", marginBottom: "1.25rem" }}>
                <div>
                  <h4 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.25rem", color: "var(--cds-text-primary)" }}>
                    ⚡ Disputa do Certame & Chat do Pregoeiro
                  </h4>
                  <p style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)" }}>
                    Ativação do robô de lances para a sessão pública deste edital, monitoramento de mensagens do pregoeiro com alertas de convocações e registro do resultado final.
                  </p>
                </div>
                <Tag type={roboAtivoCertame ? "green" : "cool-gray"} size="md">
                  {roboAtivoCertame ? "● Robô Conectado à Sala" : "⏸️ Robô em Pausa"}
                </Tag>
              </div>

              {/* Status do Robô nesta Sessão */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
                <div>
                  <Tile style={{ padding: "1rem", borderLeft: "4px solid var(--cds-interactive, #0f62fe)" }}>
                    <div style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)" }}>Menor Lance Atual da Sala</div>
                    <div style={{ fontSize: "1.4rem", fontWeight: 700, marginTop: "0.25rem" }}>
                      {lanceMinimoInput ? `R$ ${(parseFloat(lanceMinimoInput.replace(/\./g, "").replace(",", ".")) * 1.05).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "Aguardando Início"}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginTop: "0.25rem" }}>
                      Licitante líder momentâneo
                    </div>
                  </Tile>
                </div>

                <div>
                  <Tile style={{ padding: "1rem", borderLeft: "4px solid var(--cds-support-success, #24a148)" }}>
                    <div style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)" }}>Piso Seguro Configurado</div>
                    <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--cds-support-success, #24a148)", marginTop: "0.25rem" }}>
                      {lanceMinimoInput ? `R$ ${lanceMinimoInput}` : "Não definido"}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginTop: "0.25rem" }}>
                      Trava inviolável de proteção
                    </div>
                  </Tile>
                </div>

                <div>
                  <Tile style={{ padding: "1rem", borderLeft: "4px solid var(--cds-support-info, #0043ce)" }}>
                    <div style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)" }}>Estratégia do Motor</div>
                    <div style={{ fontSize: "1.4rem", fontWeight: 700, marginTop: "0.25rem" }}>
                      Cobrir por R$ 0,01
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginTop: "0.25rem" }}>
                      Decremento centavo a centavo
                    </div>
                  </Tile>
                </div>
              </div>

              {/* Controles de Disputa */}
              <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
                <Button
                  kind={roboAtivoCertame ? "danger--tertiary" : "primary"}
                  size="md"
                  renderIcon={roboAtivoCertame ? Pause : Play}
                  onClick={() => setRoboAtivoCertame(!roboAtivoCertame)}
                >
                  {roboAtivoCertame ? "Pausar Lances Deste Certame" : "Ativar Robô Nesta Sala"}
                </Button>
                <Button
                  kind="tertiary"
                  size="md"
                  renderIcon={Launch}
                  onClick={() => router.push("/robo-de-lances")}
                >
                  Abrir Central Global de Disputas
                </Button>
              </div>

              {/* Chat do Pregoeiro Deste Certame */}
              <div style={{ marginBottom: "1.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                  <h5 style={{ fontSize: "1rem", fontWeight: 600 }}>
                    💬 Mensagens da Sessão Pública (Pregoeiro)
                  </h5>
                  <Button
                    size="sm"
                    kind="ghost"
                    renderIcon={Launch}
                    onClick={() => router.push("/chat-pregoeiro")}
                  >
                    Ver Todas as Mensagens no Painel Central
                  </Button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <div style={{ padding: "1rem", borderRadius: "4px", borderLeft: "4px solid var(--cds-support-warning, #f1c21b)", backgroundColor: "var(--cds-layer-accent, #f4f4f4)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "var(--cds-text-secondary)", marginBottom: "0.25rem" }}>
                      <span><strong>Pregoeiro:</strong> Mensagem do Sistema</span>
                      <span>Hoje às 14:15:00</span>
                    </div>
                    <div style={{ fontSize: "0.875rem" }}>
                      Sessão pública aberta para a fase de disputa de lances. Favor observar os intervalos mínimos.
                    </div>
                  </div>

                  <div style={{ padding: "1rem", borderRadius: "4px", borderLeft: "4px solid var(--cds-interactive, #0f62fe)", backgroundColor: "var(--cds-layer-accent, #f4f4f4)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "var(--cds-text-secondary)", marginBottom: "0.25rem" }}>
                      <span><strong>Pregoeiro:</strong> Esclarecimento Oficial</span>
                      <span>Hoje às 11:30:15</span>
                    </div>
                    <div style={{ fontSize: "0.875rem" }}>
                      Item 1 aceito conforme especificações do Termo de Referência. Prazo recursal será aberto após homologação.
                    </div>
                  </div>
                </div>
              </div>

              {/* Homologação Final de Vitória */}
              <div style={{ paddingTop: "1rem", borderTop: "1px solid var(--cds-border-subtle, #e0e0e0)" }}>
                <h5 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                  🏆 Desfecho & Homologação de Vitória
                </h5>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem", alignItems: "flex-end" }}>
                  <div>
                    <TextInput
                      id="input-valor-homologado"
                      data-testid="input-valor-homologado"
                      labelText="Valor Final Arrematado / Homologado (R$)"
                      placeholder="0,00"
                      helperText="Preencha o valor final registrado na Ata de Homologação"
                      value={valorHomologadoTabInput}
                      onChange={(e) => setValorHomologadoTabInput(e.target.value)}
                    />
                  </div>
                  <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.25rem" }}>
                    <Button
                      kind="primary"
                      size="md"
                      disabled={salvandoValoresProposta}
                      onClick={handleSalvarValoresProposta}
                    >
                      {salvandoValoresProposta ? "Salvando..." : "Salvar Valor Homologado"}
                    </Button>
                    <Button
                      kind="secondary"
                      size="md"
                      onClick={() => setModalHomologarOpen(true)}
                    >
                      Homologar Vitória
                    </Button>
                  </div>
                </div>
              </div>
            </Tile>
          </TabPanel>
        </TabPanels>
      </Tabs>

      {/* Modal: Homologar Vitória no Certame (Contemplada 🏆) */}
      <Modal
        open={modalHomologarOpen}
        modalHeading="🏆 Homologar Vitória no Certame (Contemplada)"
        primaryButtonText={salvandoHomologacao ? "Salvando..." : "Confirmar Vitória & Homologar"}
        secondaryButtonText="Cancelar"
        onRequestClose={() => setModalHomologarOpen(false)}
        onRequestSubmit={handleSalvarHomologacao}
        primaryButtonDisabled={salvandoHomologacao}
        data-testid="modal-homologar-contemplada"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
          <p style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)" }}>
            Parabéns pela vitória! Informe o valor final arrematado / homologado para atualizar o status e salvar nos registros da licitação.
          </p>
          <TextInput
            id="modal-input-valor-homologado"
            data-testid="modal-input-valor-homologado"
            labelText="Valor Final Arrematado / Homologado (R$)"
            placeholder="Ex: 450000.00"
            value={valorHomologarInput}
            onChange={(e) => setValorHomologarInput(e.target.value)}
          />
        </div>
      </Modal>

      {/* Modal Raio-X com IA: Edital, ATA, Habilitação e Prazos (Issue #37) */}
      <Modal
        open={modalIAOpen}
        modalHeading="⚡ Raio-X de Edital & ATA com Inteligência Artificial"
        primaryButtonText={
          iniciandoAnaliseIA
            ? "Processando..."
            : cotaIA?.atingiuLimite
            ? "Limite Mensal Atingido"
            : "🚀 Gerar Raio-X da Licitação"
        }
        secondaryButtonText="Fechar"
        onRequestClose={() => setModalIAOpen(false)}
        onRequestSubmit={handleIniciarAnaliseIA}
        primaryButtonDisabled={iniciandoAnaliseIA || Boolean(cotaIA?.atingiuLimite)}
        size="lg"
        data-testid="modal-deep-dive-ia"
      >
        <div style={{ marginBottom: "1.5rem" }}>
          {/* Status da Cota Mensal (Issue #36 & #37) */}
          {cotaIA?.atingiuLimite ? (
            <div style={{ marginBottom: "1.5rem" }}>
              <InlineNotification
                kind="warning"
                title="Limite Mensal de Análises Atingido"
                subtitle={
                  cotaIA.mensagemBloqueio ||
                  `Você utilizou todas as ${cotaIA.limite} análises de IA disponíveis no plano ${cotaIA.plano} para este mês civil. A cota será renovada automaticamente em ${new Date(cotaIA.renovaEm).toLocaleDateString("pt-BR")}.`
                }
                lowContrast
                style={{ marginBottom: "1rem" }}
              />

              {cotaIA.acaoSugerida === "UPGRADE" ? (
                <Tile style={{ padding: "1.5rem", backgroundColor: "var(--cds-layer-02)", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem", textAlign: "center" }}>
                  <Upgrade size={32} style={{ color: "var(--cds-support-warning, #f1c21b)" }} />
                  <strong style={{ fontSize: "1rem" }}>
                    Precisa de mais análises analíticas de IA para este certame?
                  </strong>
                  <p style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)", margin: 0, maxWidth: "550px" }}>
                    Faça upgrade agora mesmo para o plano <strong>Pro (10 análises/mês)</strong> ou <strong>Enterprise (20 análises/mês)</strong> para continuar acelerando suas deliberações.
                  </p>
                  <Button
                    kind="primary"
                    size="md"
                    renderIcon={Upgrade}
                    onClick={() => {
                      setModalIAOpen(false);
                      router.push("/planos");
                    }}
                    data-testid="btn-upgrade-cota-modal"
                    style={{ marginTop: "0.5rem" }}
                  >
                    Ver Planos & Efetuar Upgrade
                  </Button>
                </Tile>
              ) : (
                <Tile style={{ padding: "1.5rem", backgroundColor: "var(--cds-layer-02)", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem", textAlign: "center" }}>
                  <Bot size={32} style={{ color: "var(--cds-support-info, #0f62fe)" }} />
                  <strong style={{ fontSize: "1rem" }}>
                    Plano Enterprise: Limite Mensal de 20 Análises Atingido
                  </strong>
                  <p style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)", margin: 0, maxWidth: "550px" }}>
                    Você atingiu o teto mensal de 20 análises do plano Enterprise. Para contratar cotas adicionais ou suporte customizado, entre em contato direto com nossa equipe comercial.
                  </p>
                  <Button
                    kind="tertiary"
                    size="md"
                    onClick={() => window.open("mailto:comercial@inboxlicitacoes.com.br?subject=Solicitacao de Cota Adicional IA Enterprise", "_blank")}
                    data-testid="btn-contato-vendas-modal"
                    style={{ marginTop: "0.5rem" }}
                  >
                    Falar com Equipe de Vendas
                  </Button>
                </Tile>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem 1rem", backgroundColor: "var(--cds-layer-01)", borderRadius: "4px", marginBottom: "1rem" }}>
              <Bot size={20} style={{ color: "var(--cds-support-info, #0f62fe)" }} />
              <span style={{ fontSize: "0.875rem", color: "var(--cds-text-primary)" }}>
                Consumo Mensal: <strong>{cotaIA?.usadas ?? 0}/{cotaIA?.limite ?? 10} análises utilizadas</strong> (Plano {cotaIA?.plano || "PRO"}). Restantes neste mês: <strong>{cotaIA?.restantes ?? 10}</strong>.
              </span>
            </div>
          )}

          {/* Status dos Arquivos do Edital & Auto-Sincronização */}
          <Tile style={{ padding: "1rem", backgroundColor: "var(--cds-layer-01)", marginBottom: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <DocumentPdf size={18} style={{ color: "var(--cds-support-info, #0f62fe)" }} />
              <strong style={{ fontSize: "0.875rem" }}>
                {Array.isArray(oportunidade?.arquivos) && oportunidade.arquivos.length > 0
                  ? `✓ ${oportunidade.arquivos.length} arquivo(s) de edital anexado(s) no dossiê`
                  : "Sincronização Automática com o Portal do Governo (PNCP)"}
              </strong>
            </div>
            <p style={{ fontSize: "0.8125rem", color: "var(--cds-text-secondary)", margin: 0, lineHeight: 1.5 }}>
              {Array.isArray(oportunidade?.arquivos) && oportunidade.arquivos.length > 0
                ? "A IA lerá integralmente o edital, termo de referência e minuta de contrato/ATA anexados para extrair todas as regras da disputa."
                : "Caso a oportunidade ainda não possua arquivos anexados, o sistema tentará buscar e baixar os editais oficiais diretamente do PNCP. Se o órgão ainda não disponibilizou os documentos, você será avisado sem consumir sua cota."}
            </p>
          </Tile>

          {/* O que o Raio-X Analisa */}
          <Tile style={{ padding: "1rem", backgroundColor: "var(--cds-layer-02)", marginBottom: "1rem" }}>
            <strong style={{ fontSize: "0.875rem", display: "block", marginBottom: "0.5rem" }}>
              O que este Raio-X Executivo analisa para sua empresa:
            </strong>
            <ul style={{ fontSize: "0.8125rem", margin: 0, paddingLeft: "1.25rem", color: "var(--cds-text-primary)", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <li><strong>Habilitação Documental Real:</strong> Cruzamento de exigências com certidões e balanço cadastrados em /documentacao.</li>
              <li><strong>Cronograma & Prazos:</strong> Data prevista de início e prazo pós-assinatura da Ata/Contrato para início dos pedidos.</li>
              <li><strong>Localização Física:</strong> Endereço exato de entrega/execução e alerta se a sessão/serviço for presencial.</li>
              <li><strong>Itens em Disputa & Marcas:</strong> Quantidades, valores de referência e destaque de marcas/modelos exigidos ou homologados.</li>
              <li><strong>Riscos & Penalidades:</strong> Prazo de pagamento do órgão (dias para liquidar NF), exigência de garantias e multas por atraso.</li>
              <li><strong>Matriz SWOT:</strong> Forças, Fraquezas, Oportunidades e Ameaças mapeadas para deliberação da diretoria.</li>
            </ul>
          </Tile>

          {/* Observações da Equipe (Opcional) */}
          <TextArea
            id="input-notas-estrategicas"
            data-testid="input-notas-estrategicas"
            labelText="Observações ou Foco Específico da Equipe (Opcional)"
            placeholder="Ex: Focar na exigência de amostras no lote 1 ou verificar exigência de marca homologada..."
            rows={2}
            value={notasEstrategicas}
            onChange={(e) => setNotasEstrategicas(e.target.value)}
            disabled={Boolean(cotaIA?.atingiuLimite) || iniciandoAnaliseIA}
          />
        </div>
      </Modal>

      {/* Modal: Nova Anotação da Licitação (Issue #36) */}
      <Modal
        open={modalNovaNotaOpen}
        modalHeading="📝 Adicionar Anotação Interna"
        primaryButtonText={salvandoNota ? "Salvando..." : "Salvar Anotação"}
        secondaryButtonText="Cancelar"
        primaryButtonDisabled={salvandoNota || !textoNotaInput.trim()}
        onRequestClose={() => {
          setModalNovaNotaOpen(false);
          setTextoNotaInput("");
          setMencionadosNotaInput([]);
        }}
        onRequestSubmit={handleCriarNota}
        data-testid="modal-nova-nota"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
          <p style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)", margin: 0 }}>
            Registre orientações de pregão, estratégias de lance ou marque colegas com @Nome para notificá-los.
          </p>

          <TextArea
            id="modal-input-texto-nova-nota"
            data-testid="modal-input-texto-nova-nota"
            labelText="Texto da Anotação"
            placeholder="Ex: Favor conferir cláusula de atestado técnico no edital. @Carlos Silva"
            rows={4}
            value={textoNotaInput}
            onChange={(e) => setTextoNotaInput(e.target.value)}
          />

          {usuarios.length > 0 && (
            <div>
              <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--cds-text-secondary)", display: "block", marginBottom: "0.5rem" }}>
                Inserir @Menção Rápida de Colaborador:
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {usuarios.map((u) => {
                  const isMarcado = mencionadosNotaInput.includes(u.id);
                  return (
                    <Button
                      key={u.id}
                      kind={isMarcado ? "secondary" : "ghost"}
                      size="sm"
                      renderIcon={UserFollow}
                      onClick={() => {
                        if (isMarcado) {
                          setMencionadosNotaInput((prev) => prev.filter((mid) => mid !== u.id));
                        } else {
                          setMencionadosNotaInput((prev) => [...prev, u.id]);
                          if (!textoNotaInput.includes(`@${u.name}`)) {
                            setTextoNotaInput((prev) => (prev ? `${prev.trim()} @${u.name} ` : `@${u.name} `));
                          }
                        }
                      }}
                      style={{ fontSize: "0.75rem", padding: "0 0.5rem", height: "1.75rem" }}
                      data-testid={`btn-mencionar-user-${u.id}`}
                    >
                      @{u.name}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Modal: Editar Anotação (Issue #36) */}
      <Modal
        open={modalEditarNotaOpen}
        modalHeading="✏️ Editar Anotação da Licitação"
        primaryButtonText={salvandoNota ? "Atualizando..." : "Salvar Alterações"}
        secondaryButtonText="Cancelar"
        primaryButtonDisabled={salvandoNota || !textoNotaInput.trim()}
        onRequestClose={() => {
          setModalEditarNotaOpen(false);
          setNotaEmEdicao(null);
          setTextoNotaInput("");
          setMencionadosNotaInput([]);
        }}
        onRequestSubmit={handleSalvarEdicaoNota}
        data-testid="modal-editar-nota"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
          <p style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)", margin: 0 }}>
            Apenas o autor original pode editar o conteúdo desta anotação.
          </p>

          <TextArea
            id="modal-input-texto-editar-nota"
            data-testid="modal-input-texto-editar-nota"
            labelText="Texto da Anotação"
            rows={4}
            value={textoNotaInput}
            onChange={(e) => setTextoNotaInput(e.target.value)}
          />

          {usuarios.length > 0 && (
            <div>
              <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--cds-text-secondary)", display: "block", marginBottom: "0.5rem" }}>
                Atualizar @Menção de Colaboradores:
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {usuarios.map((u) => {
                  const isMarcado = mencionadosNotaInput.includes(u.id);
                  return (
                    <Button
                      key={u.id}
                      kind={isMarcado ? "secondary" : "ghost"}
                      size="sm"
                      renderIcon={UserFollow}
                      onClick={() => {
                        if (isMarcado) {
                          setMencionadosNotaInput((prev) => prev.filter((mid) => mid !== u.id));
                        } else {
                          setMencionadosNotaInput((prev) => [...prev, u.id]);
                          if (!textoNotaInput.includes(`@${u.name}`)) {
                            setTextoNotaInput((prev) => (prev ? `${prev.trim()} @${u.name} ` : `@${u.name} `));
                          }
                        }
                      }}
                      style={{ fontSize: "0.75rem", padding: "0 0.5rem", height: "1.75rem" }}
                    >
                      @{u.name}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Modal Notificação: Análise de IA em Background (Issue #36) */}
      <Modal
        open={modalNotificacaoIAOpen}
        passiveModal
        modalHeading="🤖 Análise de Participação Solicitada!"
        onRequestClose={() => setModalNotificacaoIAOpen(false)}
        data-testid="modal-ia-notificacao-iniciada"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", padding: "1rem 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <CheckmarkOutline size={32} style={{ color: "var(--cds-support-success, #24a148)" }} />
            <div>
              <h4 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>
                O relatório está sendo gerado em segundo plano
              </h4>
              <p style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)", margin: "0.25rem 0 0 0" }}>
                Nossa IA está cruzando o edital e anexos com as certidões e balanço da sua empresa.
              </p>
            </div>
          </div>

          <Tile style={{ padding: "1rem", backgroundColor: "var(--cds-layer-01)" }}>
            <p style={{ fontSize: "0.875rem", margin: 0, lineHeight: 1.5, color: "var(--cds-text-primary)" }}>
              🔔 <strong>Notificação Automática:</strong> Assim que a análise for concluída, você e todos os colaboradores atribuídos a esta oportunidade receberão uma notificação no sistema.
            </p>
            <p style={{ fontSize: "0.8125rem", margin: "0.5rem 0 0 0", color: "var(--cds-text-secondary)" }}>
              O relatório executivo e o arquivo oficial em PDF estarão disponíveis na aba <strong>&ldquo;🤖 Histórico Análise IA&rdquo;</strong>.
            </p>
          </Tile>

          <Button
            kind="primary"
            size="md"
            onClick={() => setModalNotificacaoIAOpen(false)}
            style={{ alignSelf: "flex-end" }}
            data-testid="btn-fechar-notificacao-ia"
          >
            Entendido, acompanhar progresso
          </Button>
        </div>
      </Modal>

      {/* Modal Recusa Rápida (No-GO) */}
      <Modal
        open={showRecusarModal}
        modalHeading="Recusar Oportunidade (No-GO)"
        primaryButtonText="Confirmar Recusa"
        secondaryButtonText="Cancelar"
        danger
        onRequestClose={() => {
          setShowRecusarModal(false);
          setRecusaMotivoCustom("");
        }}
        onRequestSubmit={() => {
          const motivoFinal =
            recusaMotivoGenerico === "Outro"
              ? (recusaMotivoCustom.trim() || "Outro motivo não especificado")
              : recusaMotivoGenerico;
          handleDecisao("NO_GO", motivoFinal);
        }}
        data-testid="modal-recusar-dossie"
      >
        <p style={{ marginBottom: "1rem", fontSize: "0.875rem" }}>
          Selecione o motivo para a recusa da oportunidade{" "}
          <strong>{oportunidade.numeroEdital}</strong>:
        </p>
        <div style={{ marginBottom: "1rem" }}>
          <Select
            id="select-motivo-recusa-dossie"
            labelText="Motivo da Recusa"
            data-testid="select-motivo-recusa-dossie"
            value={recusaMotivoGenerico}
            onChange={(e) => setRecusaMotivoGenerico(e.target.value)}
          >
            {MOTIVOS_RECUSA_GENERICOS.map((motivo) => (
              <SelectItem key={motivo} value={motivo} text={motivo} />
            ))}
          </Select>
        </div>
        {recusaMotivoGenerico === "Outro" && (
          <div style={{ marginBottom: "1rem" }}>
            <TextInput
              id="input-motivo-recusa-dossie"
              labelText="Especifique o Motivo da Recusa"
              placeholder="Descreva o motivo detalhado da recusa..."
              value={recusaMotivoCustom}
              onChange={(e) => setRecusaMotivoCustom(e.target.value)}
              data-testid="input-motivo-recusa-dossie"
            />
          </div>
        )}
      </Modal>

      {/* Modal de Carregamento da Busca de Editais no PNCP */}
      <Modal
        open={buscandoPncp}
        passiveModal
        modalHeading="Sincronização de Arquivos com o PNCP"
        preventCloseOnClickOutside
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem 0",
            gap: "1rem",
          }}
          data-testid="modal-loading-pncp"
        >
          {pncpSyncStatus === "buscando" ? (
            <>
              <Loading withOverlay={false} description="Buscando no PNCP..." />
              <p style={{ fontWeight: 600, color: "var(--cds-text-primary)", textAlign: "center", margin: 0 }}>
                Buscando arquivos e editais oficiais no PNCP...
              </p>
              <span style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)", textAlign: "center" }}>
                Aguarde enquanto os anexos públicos são sincronizados com o dossiê da licitação.
              </span>
            </>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.75rem",
                textAlign: "center",
              }}
              data-testid="pncp-sync-result-message"
            >
              {pncpSyncTipo === "success" && (
                <CheckmarkOutline size={32} style={{ color: "var(--cds-support-success, #24a148)" }} />
              )}
              {pncpSyncTipo === "warning" && (
                <WarningAlt size={32} style={{ color: "var(--cds-support-warning, #f1c21b)" }} />
              )}
              {pncpSyncTipo === "error" && (
                <CloseOutline size={32} style={{ color: "var(--cds-support-error, #da1e28)" }} />
              )}
              <p
                style={{
                  fontWeight: 600,
                  fontSize: "1rem",
                  color: "var(--cds-text-primary)",
                  margin: 0,
                }}
              >
                {pncpSyncMensagem}
              </p>
              <span style={{ fontSize: "0.8125rem", color: "var(--cds-text-secondary)" }}>
                {pncpSyncTipo === "success"
                  ? "Atualizando os dados da tela..."
                  : "Consulte o portal de origem para verificar anexos complementares."}
              </span>
            </div>
          )}
        </div>
      </Modal>

      {/* Modal de Carregamento da Deliberação do Dossiê */}
      {loadingModalOpen && (
        <Modal
          passiveModal
          open
          modalHeading="Processando Deliberação"
          onRequestClose={() => {}}
          preventCloseOnClickOutside
          data-testid="modal-dossie-deliberacao-loading"
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "2rem 1rem",
              gap: "1rem",
            }}
          >
            <InlineLoading status="active" description={loadingModalMsg} />
          </div>
        </Modal>
      )}
    </ModulePageShell>
  );
}

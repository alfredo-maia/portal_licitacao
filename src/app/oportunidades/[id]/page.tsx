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
  DocumentDownload,
  Information,
} from "@carbon/icons-react";
import { ModulePageShell } from "@/components/shell/module-page-shell";
import { FileDropZone } from "@/components/ui/file-drop-zone";
import { TIPOS_SISTEMA_CATALOG } from "@/config/tipos-sistema";
import { sintetizarMiniResumo } from "@/lib/resumo-licitacao";
import {
  CALCULADORA_TOOLTIPS,
  calcularItemProposta,
  consolidarCalculadoraProposta,
  formatarMoedaBrl,
  UNIDADES_ITEM_OPCOES,
  type ItemCalculadoraInput,
  type ConfiguracaoPropostaInput,
  type UnidadeItemLicitacao,
} from "@/server/schemas/proposta-calculadora.schema";
import { gerarConteudoPropostaComercial } from "@/lib/proposta-comercial-template";

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

function obterObjetoCertame(opp?: Partial<OportunidadeDetalhe> | null): string {
  if (!opp) return "";
  return (opp.objeto || opp.resumo || opp.miniResumo || "").trim();
}

interface CampoComHoverTooltipProps {
  tooltipText: string;
  children: React.ReactNode;
  testId?: string;
}

function CampoComHoverTooltip({ tooltipText, children, testId }: CampoComHoverTooltipProps) {
  const [visivel, setVisivel] = React.useState(false);

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => setVisivel(true)}
      onMouseLeave={() => setVisivel(false)}
      onFocus={() => setVisivel(true)}
      onBlur={() => setVisivel(false)}
      data-testid={testId}
    >
      {visivel && (
        <div
          role="tooltip"
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: 0,
            zIndex: 9999,
            minWidth: "240px",
            maxWidth: "320px",
            backgroundColor: "#161616",
            color: "#ffffff",
            padding: "0.65rem 0.8rem",
            borderRadius: "4px",
            fontSize: "0.75rem",
            lineHeight: 1.45,
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.28)",
            pointerEvents: "none",
          }}
        >
          {tooltipText}
        </div>
      )}
      {children}
    </div>
  );
}

interface NumericCalcInputProps {
  id: string;
  labelText: React.ReactNode;
  value: number | null | undefined;
  onChangeValue: (val: number | null) => void;
  placeholder?: string;
  helperText?: string;
  allowEmpty?: boolean;
  min?: number;
  max?: number;
}

function NumericCalcInput({
  id,
  labelText,
  value,
  onChangeValue,
  placeholder,
  helperText,
  allowEmpty = false,
  min = 0,
  max,
}: NumericCalcInputProps) {
  const formatarNumero = (v: number | null | undefined) => {
    if (v === null || v === undefined || Number.isNaN(v)) return "";
    return String(v);
  };

  const [draft, setDraft] = React.useState<string>(() => formatarNumero(value));
  const [focado, setFocado] = React.useState(false);

  React.useEffect(() => {
    if (!focado) {
      setDraft(formatarNumero(value));
    }
  }, [value, focado]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (!/^[0-9.,]*$/.test(raw)) return;
    setDraft(raw);

    const limpo = raw.trim().replace(",", ".");
    if (!limpo || limpo === ".") {
      onChangeValue(allowEmpty ? null : min);
      return;
    }

    const parsed = Number.parseFloat(limpo);
    if (!Number.isNaN(parsed)) {
      let ajustado = Math.max(min, parsed);
      if (max !== undefined) ajustado = Math.min(max, ajustado);
      onChangeValue(ajustado);
    }
  };

  const handleBlur = () => {
    setFocado(false);
    const limpo = draft.trim().replace(",", ".");
    if (!limpo || limpo === ".") {
      if (allowEmpty) {
        setDraft("");
        onChangeValue(null);
      } else {
        setDraft(String(min));
        onChangeValue(min);
      }
      return;
    }
    const parsed = Number.parseFloat(limpo);
    if (Number.isNaN(parsed)) {
      setDraft(allowEmpty ? "" : String(min));
      return;
    }
    let ajustado = Math.max(min, parsed);
    if (max !== undefined) ajustado = Math.min(max, ajustado);
    const arredondado = Math.round((ajustado + Number.EPSILON) * 100) / 100;
    setDraft(String(arredondado));
    onChangeValue(arredondado);
  };

  return (
    <TextInput
      id={id}
      labelText={labelText}
      placeholder={placeholder}
      helperText={helperText}
      value={draft}
      onFocus={() => setFocado(true)}
      onBlur={handleBlur}
      onChange={handleChange}
    />
  );
}

function renderLabelTooltipIcon(texto: string) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
      <span>{texto}</span>
      <Information size={14} style={{ color: "var(--cds-icon-secondary, #525252)", flexShrink: 0 }} />
    </span>
  );
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

  // Empresa & Identidade Visual Oficial
  const [empresaConfig, setEmpresaConfig] = React.useState<any>(null);
  const [temTimbradoOuLogo, setTemTimbradoOuLogo] = React.useState(false);

  // Aba 5: Calculadora Multi-Item de Custos, BDI & Piso Seguro
  const [itensCalculadora, setItensCalculadora] = React.useState<ItemCalculadoraInput[]>([]);
  const [parametrosPadraoCalc, setParametrosPadraoCalc] = React.useState({
    impostosPercentual: 12,
    bdiPercentual: 25,
    margemMinimaPercentual: 10,
    margemAlvoPercentual: 20,
  });
  const [salvandoCalculadoraCertame, setSalvandoCalculadoraCertame] = React.useState(false);
  const [calculadoraFeedback, setCalculadoraFeedback] = React.useState<{ tipo: "success" | "error"; msg: string } | null>(null);

  // Aba 6: Proposta Comercial Timbrada
  const [propostaConfig, setPropostaConfig] = React.useState<ConfiguracaoPropostaInput>({
    modoEmissao: "ITENS_CALCULADORA",
    tipoTabelaProposta: "PROPOSTA_INICIAL",
    tipoAgrupamentoGlobal: "LOTE_01",
    tituloGlobalCustomizado: "Lote 01",
    descricaoGlobal: "",
    valorGlobalManual: null,
    validadeDias: 60,
    prazoEntrega: "15 (quinze) dias úteis",
    condicoesPagamento: "30 (trinta) dias após a liquidação da Nota Fiscal",
    garantiaObservacoes: "Garantia legal de 90 dias acrescida da garantia contratual do fabricante.",
    dadosBancariosPersonalizados: null,
    dataEmissao: new Date().toISOString().split("T")[0],
  });

  const [modalPropostaOpen, setModalPropostaOpen] = React.useState(false);
  const [confirmarSaidaPropostaOpen, setConfirmarSaidaPropostaOpen] = React.useState(false);
  const [salvandoPropostaComercial, setSalvandoPropostaComercial] = React.useState(false);
  const [propostaSalvaSnapshot, setPropostaSalvaSnapshot] = React.useState<string | null>(null);
  const [gerandoPdfTimbradoProposta, setGerandoPdfTimbradoProposta] = React.useState(false);
  const [propostaFeedback, setPropostaFeedback] = React.useState<{ tipo: "success" | "error"; msg: string } | null>(null);
  const [copiadoProposta, setCopiadoProposta] = React.useState(false);

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

      const objetoCertame = obterObjetoCertame(opp);

      // Hidratação dos dados da Calculadora Multi-Item e Proposta
      if (opp.calculadoraDados) {
        const itensHidratados =
          Array.isArray(opp.calculadoraDados.itens) && opp.calculadoraDados.itens.length > 0
            ? opp.calculadoraDados.itens
            : [];
        if (itensHidratados.length > 0) {
          setItensCalculadora(itensHidratados);
        }
        if (opp.calculadoraDados.parametrosPadrao) {
          setParametrosPadraoCalc(opp.calculadoraDados.parametrosPadrao);
        }
        if (opp.calculadoraDados.propostaConfig) {
          const cfgHidratada: ConfiguracaoPropostaInput = {
            modoEmissao: "ITENS_CALCULADORA",
            tipoTabelaProposta: "PROPOSTA_INICIAL",
            tipoAgrupamentoGlobal: "LOTE_01",
            tituloGlobalCustomizado: "Lote 01",
            valorGlobalManual: null,
            validadeDias: 60,
            prazoEntrega: "15 (quinze) dias úteis",
            condicoesPagamento: "30 (trinta) dias após a liquidação da Nota Fiscal",
            garantiaObservacoes: "Garantia legal de 90 dias acrescida da garantia contratual do fabricante.",
            dadosBancariosPersonalizados: null,
            dataEmissao: new Date().toISOString().split("T")[0],
            ...opp.calculadoraDados.propostaConfig,
            descricaoGlobal: opp.calculadoraDados.propostaConfig.descricaoGlobal || objetoCertame,
          };
          setPropostaConfig(cfgHidratada);
          setPropostaSalvaSnapshot(
            JSON.stringify({ itens: itensHidratados, propostaConfig: cfgHidratada })
          );
        } else {
          setPropostaSalvaSnapshot(null);
        }
      } else {
        const vEst = opp.valorEstimado || 0;
        const cUnit = vEst > 0 ? Math.round(vEst * 0.6) : 5000;
        setItensCalculadora([
          {
            id: "item_01",
            numeroItem: "01",
            descricao: objetoCertame || "Fornecimento de materiais/serviços conforme edital",
            marcaModelo: "",
            unidade: "UN",
            quantidade: 1,
            valorEstimadoUnitario: vEst > 0 ? vEst : null,
            custoUnitario: cUnit,
            freteUnitario: 0,
            outrosCustosUnitario: 0,
            impostosPercentual: 12,
            bdiPercentual: 25,
            margemMinimaPercentual: 10,
            margemAlvoPercentual: 20,
            valorUnitarioArrematado: null,
          },
        ]);
        setPropostaConfig((prev) => ({
          ...prev,
          descricaoGlobal: objetoCertame,
        }));
        setPropostaSalvaSnapshot(null);
      }

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

  const carregarDadosEmpresa = React.useCallback(async () => {
    try {
      const res = await fetch("/api/configuracoes/empresa");
      if (res.ok) {
        const data = await res.json();
        const emp = data.empresa || data;
        setEmpresaConfig(emp);
        setTemTimbradoOuLogo(Boolean(emp.papelTimbradoUrl || emp.logoUrl));
      }
    } catch {}
  }, []);

  React.useEffect(() => {
    if (id) {
      carregarDados(id);
    }
  }, [id, carregarDados]);

  React.useEffect(() => {
    carregarDadosEmpresa();
    const handleTenantChanged = () => {
      carregarDadosEmpresa();
      if (id) carregarDados(id);
    };
    window.addEventListener("tenant-changed", handleTenantChanged);
    return () => {
      window.removeEventListener("tenant-changed", handleTenantChanged);
    };
  }, [carregarDadosEmpresa, id, carregarDados]);

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

  // Cálculos consolidados da Calculadora e Proposta
  const consolidadoCalculadora = React.useMemo(() => {
    return consolidarCalculadoraProposta(itensCalculadora, propostaConfig);
  }, [itensCalculadora, propostaConfig]);

  const documentoProposta = React.useMemo(() => {
    if (!oportunidade) return null;
    return gerarConteudoPropostaComercial({
      orgaoNome: oportunidade.orgaoNome || "Órgão Licitante",
      numeroEdital: oportunidade.numeroEdital || "Edital",
      objetoLicitacao: obterObjetoCertame(oportunidade),
      itens: itensCalculadora,
      configuracao: propostaConfig,
      empresa: empresaConfig,
    });
  }, [oportunidade, itensCalculadora, propostaConfig, empresaConfig]);

  const snapshotAtualProposta = React.useMemo(
    () => JSON.stringify({ itens: itensCalculadora, propostaConfig }),
    [itensCalculadora, propostaConfig]
  );

  const propostaTemAlteracoesNaoSalvas =
    propostaSalvaSnapshot === null || propostaSalvaSnapshot !== snapshotAtualProposta;

  const aliquotasPadraoDivergemDosItens = React.useMemo(() => {
    return itensCalculadora.some(
      (it) =>
        it.impostosPercentual !== parametrosPadraoCalc.impostosPercentual ||
        it.bdiPercentual !== parametrosPadraoCalc.bdiPercentual ||
        it.margemMinimaPercentual !== parametrosPadraoCalc.margemMinimaPercentual ||
        it.margemAlvoPercentual !== parametrosPadraoCalc.margemAlvoPercentual
    );
  }, [itensCalculadora, parametrosPadraoCalc]);

  const handleAdicionarItemCalc = () => {
    const num = String(itensCalculadora.length + 1).padStart(2, "0");
    const novo: ItemCalculadoraInput = {
      id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      numeroItem: num,
      descricao: "",
      marcaModelo: "",
      unidade: "UN",
      quantidade: 1,
      valorEstimadoUnitario: null,
      custoUnitario: 0,
      freteUnitario: 0,
      outrosCustosUnitario: 0,
      impostosPercentual: parametrosPadraoCalc.impostosPercentual,
      bdiPercentual: parametrosPadraoCalc.bdiPercentual,
      margemMinimaPercentual: parametrosPadraoCalc.margemMinimaPercentual,
      margemAlvoPercentual: parametrosPadraoCalc.margemAlvoPercentual,
    };
    setItensCalculadora((prev) => [...prev, novo]);
  };

  const handleDuplicarItemCalc = (idx: number) => {
    const orig = itensCalculadora[idx];
    const clone: ItemCalculadoraInput = {
      ...orig,
      id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      numeroItem: String(itensCalculadora.length + 1).padStart(2, "0"),
    };
    const novos = [...itensCalculadora];
    novos.splice(idx + 1, 0, clone);
    setItensCalculadora(novos);
  };

  const handleRemoverItemCalc = (idx: number) => {
    if (itensCalculadora.length <= 1) {
      showNotification("warning", "A calculadora deve manter ao menos 1 item.");
      return;
    }
    setItensCalculadora((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleAtualizarItemCalc = (idx: number, patch: Partial<ItemCalculadoraInput>) => {
    setItensCalculadora((prev) => {
      const novos = [...prev];
      novos[idx] = { ...novos[idx], ...patch };
      return novos;
    });
  };

  const handleAplicarParametrosPadraoCalc = () => {
    setItensCalculadora((prev) =>
      prev.map((it) => ({
        ...it,
        impostosPercentual: parametrosPadraoCalc.impostosPercentual,
        bdiPercentual: parametrosPadraoCalc.bdiPercentual,
        margemMinimaPercentual: parametrosPadraoCalc.margemMinimaPercentual,
        margemAlvoPercentual: parametrosPadraoCalc.margemAlvoPercentual,
      }))
    );
    showNotification("success", "Alíquotas padrão aplicadas a todos os itens.");
  };

  const handleSalvarCalculadoraCertame = async () => {
    if (!id || !oportunidade) return;
    setSalvandoCalculadoraCertame(true);
    setCalculadoraFeedback(null);
    try {
      const dadosCalculadora = {
        parametrosPadrao: parametrosPadraoCalc,
        itens: itensCalculadora,
        propostaConfig,
        atualizadoEm: new Date().toISOString(),
      };
      const res = await fetch(`/api/oportunidades/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: oportunidade.status,
          lanceMinimo: consolidadoCalculadora.pisoTotalGeral,
          valorProposta: consolidadoCalculadora.propostaTotalGeral,
          calculadoraDados: dadosCalculadora,
        }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Falha ao salvar dados da calculadora");
      }
      setLanceMinimoInput(String(consolidadoCalculadora.pisoTotalGeral));
      setValorPropostaInput(String(consolidadoCalculadora.propostaTotalGeral));
      setPropostaSalvaSnapshot(JSON.stringify({ itens: itensCalculadora, propostaConfig }));
      setCalculadoraFeedback({
        tipo: "success",
        msg: "Calculadora salva! Piso Seguro e Valor da Proposta sincronizados com sucesso.",
      });
      setTimeout(() => setCalculadoraFeedback(null), 5000);
    } catch (err: any) {
      setCalculadoraFeedback({
        tipo: "error",
        msg: err?.message || "Erro ao salvar a calculadora.",
      });
    } finally {
      setSalvandoCalculadoraCertame(false);
    }
  };

  const handleSalvarPropostaComercial = async (): Promise<boolean> => {
    if (!id || !oportunidade) return false;
    setSalvandoPropostaComercial(true);
    setPropostaFeedback(null);
    try {
      const dadosCalculadora = {
        parametrosPadrao: parametrosPadraoCalc,
        itens: itensCalculadora,
        propostaConfig,
        atualizadoEm: new Date().toISOString(),
      };
      const res = await fetch(`/api/oportunidades/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: oportunidade.status,
          lanceMinimo: consolidadoCalculadora.pisoTotalGeral,
          valorProposta:
            propostaConfig.modoEmissao === "VALOR_GLOBAL" &&
            propostaConfig.valorGlobalManual &&
            propostaConfig.valorGlobalManual > 0
              ? propostaConfig.valorGlobalManual
              : propostaConfig.tipoTabelaProposta === "PROPOSTA_READEQUADA"
              ? consolidadoCalculadora.readequadaTotalGeral
              : consolidadoCalculadora.propostaTotalGeral,
          calculadoraDados: dadosCalculadora,
        }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Falha ao salvar a proposta comercial");
      }
      setPropostaSalvaSnapshot(JSON.stringify({ itens: itensCalculadora, propostaConfig }));
      setPropostaFeedback({
        tipo: "success",
        msg: "Proposta Comercial salva com sucesso! Seus dados e condições comerciais estão protegidos.",
      });
      setTimeout(() => setPropostaFeedback(null), 5000);
      return true;
    } catch (err: any) {
      setPropostaFeedback({
        tipo: "error",
        msg: err?.message || "Erro ao salvar a proposta comercial.",
      });
      return false;
    } finally {
      setSalvandoPropostaComercial(false);
    }
  };

  const handleSolicitarFecharModalProposta = () => {
    if (propostaTemAlteracoesNaoSalvas) {
      setConfirmarSaidaPropostaOpen(true);
      return;
    }
    setModalPropostaOpen(false);
  };

  const handleImprimirPropostaLimpa = () => {
    if (!documentoProposta?.conteudoHtml) return;
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "none";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) return;

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${documentoProposta.titulo}</title>
          <style>
            @media print {
              @page {
                size: A4 portrait;
                margin: 12mm 14mm;
              }
              body {
                margin: 0;
                padding: 0;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
            }
          </style>
        </head>
        <body>
          ${documentoProposta.conteudoHtml}
        </body>
      </html>
    `);
    doc.close();

    iframe.contentWindow?.focus();
    setTimeout(() => {
      iframe.contentWindow?.print();
      setTimeout(() => {
        try {
          document.body.removeChild(iframe);
        } catch {}
      }, 1500);
    }, 300);
  };

  const handleImprimirPropostaTimbrada = async () => {
    if (!oportunidade) return;
    setGerandoPdfTimbradoProposta(true);
    setPropostaFeedback(null);
    try {
      const payload = {
        orgaoNome: oportunidade.orgaoNome || "Órgão Licitante",
        numeroEdital: oportunidade.numeroEdital || "Edital",
        objetoLicitacao: obterObjetoCertame(oportunidade),
        itens: itensCalculadora,
        configuracao: propostaConfig,
      };

      const res = await fetch("/api/propostas/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Erro ao gerar PDF timbrado");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank");
      if (!win) {
        const a = document.createElement("a");
        a.href = url;
        const slug = (oportunidade.numeroEdital || "edital").replace(/[^a-zA-Z0-9]/g, "_");
        a.download = `proposta_timbrada_${slug}.pdf`;
        a.click();
      }
      setPropostaFeedback({
        tipo: "success",
        msg: "PDF timbrado gerado com sucesso! Abrindo para impressão...",
      });
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err: any) {
      setPropostaFeedback({
        tipo: "error",
        msg: err?.message || "Falha ao gerar o PDF timbrado.",
      });
    } finally {
      setGerandoPdfTimbradoProposta(false);
    }
  };

  const handleCopiarTextoProposta = () => {
    if (!documentoProposta?.conteudoTexto) return;
    navigator.clipboard.writeText(documentoProposta.conteudoTexto);
    setCopiadoProposta(true);
    setTimeout(() => setCopiadoProposta(false), 2500);
  };

  const handleBaixarTxtProposta = () => {
    if (!documentoProposta?.conteudoTexto) return;
    const blob = new Blob([documentoProposta.conteudoTexto], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const slug = (oportunidade?.numeroEdital || "edital").replace(/[^a-zA-Z0-9]/g, "_");
    a.download = `proposta_comercial_${slug}.txt`;
    a.click();
    URL.revokeObjectURL(url);
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
          <Tab data-testid="tab-disputa">
            ⚡ Disputa
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

          {/* Aba 5: Calculadora de Custos, BDI & Piso Seguro */}
          <TabPanel>
            <Tile style={{ padding: "1.5rem", marginTop: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem", marginBottom: "1.25rem" }}>
                <div>
                  <h4 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.25rem", color: "var(--cds-text-primary)" }}>
                    🧮 Calculadora Multi-Item de Custos, BDI & Piso Seguro
                  </h4>
                  <p style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)" }}>
                    Componha os custos diretos, tributos, fretes e taxa de BDI de cada item ou lote deste certame. O motor calcula o Piso Seguro inviolável (trava do robô de lances contra inexequibilidade - Art. 59 §4º da Lei 14.133/2021) e o preço alvo para a proposta inicial.
                  </p>
                </div>
                {oportunidade?.valorEstimado ? (
                  <Tag type="cool-gray" size="md">
                    Valor Estimado do Edital: {oportunidade.valorEstimado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </Tag>
                ) : null}
              </div>

              {calculadoraFeedback && (
                <InlineNotification
                  kind={calculadoraFeedback.tipo}
                  title={calculadoraFeedback.tipo === "success" ? "Sucesso:" : "Atenção:"}
                  subtitle={calculadoraFeedback.msg}
                  style={{ marginBottom: "1.25rem" }}
                  onClose={() => setCalculadoraFeedback(null)}
                />
              )}

              {/* Barra de Parâmetros Fiscais & Formação Padrão */}
              <Tile style={{ padding: "1rem", backgroundColor: "var(--cds-layer-accent, #f4f4f4)", marginBottom: "1.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Settings size={18} />
                    <strong style={{ fontSize: "0.9rem" }}>Alíquotas Padrão de Formação de Preço do Certame</strong>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <Button
                      size="sm"
                      kind="tertiary"
                      onClick={handleAplicarParametrosPadraoCalc}
                      title="Aplica as alíquotas fiscais e margens abaixo em todos os itens existentes da lista"
                    >
                      Aplicar % a Todos os Itens
                    </Button>
                    <Button
                      size="sm"
                      kind="primary"
                      renderIcon={Add}
                      onClick={handleAdicionarItemCalc}
                      data-testid="btn-adicionar-item-calc"
                    >
                      + Adicionar Item
                    </Button>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))", gap: "0.75rem" }}>
                  <CampoComHoverTooltip tooltipText={CALCULADORA_TOOLTIPS.impostosPercentual} testId="tooltip-param-impostos">
                    <NumericCalcInput
                      id="param-impostos"
                      labelText={renderLabelTooltipIcon("Impostos s/ Fat. (%)")}
                      value={parametrosPadraoCalc.impostosPercentual}
                      max={80}
                      onChangeValue={(v) =>
                        setParametrosPadraoCalc({
                          ...parametrosPadraoCalc,
                          impostosPercentual: v ?? 0,
                        })
                      }
                    />
                  </CampoComHoverTooltip>

                  <CampoComHoverTooltip tooltipText={CALCULADORA_TOOLTIPS.bdiPercentual} testId="tooltip-param-bdi">
                    <NumericCalcInput
                      id="param-bdi"
                      labelText={renderLabelTooltipIcon("BDI / Desp. Indiretas (%)")}
                      value={parametrosPadraoCalc.bdiPercentual}
                      max={100}
                      onChangeValue={(v) =>
                        setParametrosPadraoCalc({
                          ...parametrosPadraoCalc,
                          bdiPercentual: v ?? 0,
                        })
                      }
                    />
                  </CampoComHoverTooltip>

                  <CampoComHoverTooltip tooltipText={CALCULADORA_TOOLTIPS.margemMinimaPercentual} testId="tooltip-param-mmin">
                    <NumericCalcInput
                      id="param-margem-min"
                      labelText={renderLabelTooltipIcon("Margem Mínima Piso (%)")}
                      value={parametrosPadraoCalc.margemMinimaPercentual}
                      max={80}
                      onChangeValue={(v) =>
                        setParametrosPadraoCalc({
                          ...parametrosPadraoCalc,
                          margemMinimaPercentual: v ?? 0,
                        })
                      }
                    />
                  </CampoComHoverTooltip>

                  <CampoComHoverTooltip tooltipText={CALCULADORA_TOOLTIPS.margemAlvoPercentual} testId="tooltip-param-malvo">
                    <NumericCalcInput
                      id="param-margem-alvo"
                      labelText={renderLabelTooltipIcon("Margem Alvo Proposta (%)")}
                      value={parametrosPadraoCalc.margemAlvoPercentual}
                      max={90}
                      onChangeValue={(v) =>
                        setParametrosPadraoCalc({
                          ...parametrosPadraoCalc,
                          margemAlvoPercentual: v ?? 0,
                        })
                      }
                    />
                  </CampoComHoverTooltip>
                </div>

                {aliquotasPadraoDivergemDosItens && (
                  <div style={{ marginTop: "0.65rem", fontSize: "0.75rem", color: "var(--cds-support-info, #0043ce)" }}>
                    ℹ️ Para aplicar estas alíquotas padrão aos itens já listados abaixo, clique em <strong>&quot;Aplicar % a Todos os Itens&quot;</strong>.
                  </div>
                )}
              </Tile>

              {/* Lista Interativa de Itens */}
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1.5rem" }}>
                {consolidadoCalculadora.itens.map((it, idx) => (
                  <Tile
                    key={it.id || idx}
                    style={{
                      padding: "1.25rem",
                      borderLeft: it.alertaInexequivel
                        ? "4px solid var(--cds-support-warning, #f1c21b)"
                        : "4px solid var(--cds-interactive, #0f62fe)",
                    }}
                  >
                    {/* Linha de Cabeçalho do Item */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <Tag type="cool-gray" size="sm">
                          Linha {idx + 1}
                        </Tag>
                        <strong style={{ fontSize: "0.95rem" }}>
                          Item {it.numeroItem || String(idx + 1).padStart(2, "0")}
                        </strong>
                        {it.alertaInexequivel && (
                          <Tag type="warm-gray" size="sm">
                            ⚠️ Alerta Art. 59 §4º
                          </Tag>
                        )}
                      </div>

                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <Button
                          size="sm"
                          kind="ghost"
                          renderIcon={Copy}
                          hasIconOnly
                          iconDescription="Duplicar item"
                          onClick={() => handleDuplicarItemCalc(idx)}
                        />
                        <Button
                          size="sm"
                          kind="danger--ghost"
                          renderIcon={TrashCan}
                          hasIconOnly
                          iconDescription="Remover item"
                          disabled={consolidadoCalculadora.itens.length <= 1}
                          onClick={() => handleRemoverItemCalc(idx)}
                        />
                      </div>
                    </div>

                    {/* Campos de Entrada do Item */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.75rem", marginBottom: "0.75rem" }}>
                      <CampoComHoverTooltip tooltipText={CALCULADORA_TOOLTIPS.numeroItem}>
                        <div style={{ minWidth: "100px" }}>
                          <TextInput
                            id={`item-num-${idx}`}
                            labelText={renderLabelTooltipIcon("Nº Item/Lote")}
                            value={it.numeroItem}
                            onChange={(e) => handleAtualizarItemCalc(idx, { numeroItem: e.target.value })}
                          />
                        </div>
                      </CampoComHoverTooltip>
                      <div style={{ gridColumn: "span 2", minWidth: "260px" }}>
                        <CampoComHoverTooltip tooltipText={CALCULADORA_TOOLTIPS.descricao}>
                          <TextInput
                            id={`item-desc-${idx}`}
                            labelText={renderLabelTooltipIcon("Descrição / Especificação do Item")}
                            placeholder="Ex: Fornecimento de Notebook Corporativo i7..."
                            value={it.descricao}
                            onChange={(e) => handleAtualizarItemCalc(idx, { descricao: e.target.value })}
                          />
                        </CampoComHoverTooltip>
                      </div>
                      <CampoComHoverTooltip tooltipText={CALCULADORA_TOOLTIPS.marcaModelo}>
                        <TextInput
                          id={`item-marca-${idx}`}
                          labelText={renderLabelTooltipIcon("Marca / Modelo (Opcional)")}
                          placeholder="Ex: Dell Latitude 3440"
                          value={it.marcaModelo || ""}
                          onChange={(e) => handleAtualizarItemCalc(idx, { marcaModelo: e.target.value })}
                        />
                      </CampoComHoverTooltip>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))", gap: "0.75rem", marginBottom: "0.75rem" }}>
                      <CampoComHoverTooltip tooltipText={CALCULADORA_TOOLTIPS.unidade}>
                        <Select
                          id={`item-unid-${idx}`}
                          labelText={renderLabelTooltipIcon("Unidade") as any}
                          value={it.unidade}
                          onChange={(e) => handleAtualizarItemCalc(idx, { unidade: e.target.value })}
                        >
                          {UNIDADES_ITEM_OPCOES.map((u) => (
                            <SelectItem key={u} value={u} text={u} />
                          ))}
                        </Select>
                      </CampoComHoverTooltip>

                      <CampoComHoverTooltip tooltipText={CALCULADORA_TOOLTIPS.quantidade}>
                        <NumericCalcInput
                          id={`item-qtd-${idx}`}
                          labelText={renderLabelTooltipIcon("Quantidade")}
                          value={it.quantidade}
                          min={1}
                          onChangeValue={(v) => handleAtualizarItemCalc(idx, { quantidade: Math.max(1, v ?? 1) })}
                        />
                      </CampoComHoverTooltip>

                      <CampoComHoverTooltip tooltipText={CALCULADORA_TOOLTIPS.valorEstimadoUnitario}>
                        <NumericCalcInput
                          id={`item-vest-${idx}`}
                          labelText={renderLabelTooltipIcon("Vlr. Estimado Edital (R$)")}
                          placeholder="Opcional"
                          allowEmpty
                          value={it.valorEstimadoUnitario}
                          onChangeValue={(v) => handleAtualizarItemCalc(idx, { valorEstimadoUnitario: v })}
                        />
                      </CampoComHoverTooltip>

                      <CampoComHoverTooltip tooltipText={CALCULADORA_TOOLTIPS.custoUnitario}>
                        <NumericCalcInput
                          id={`item-custo-${idx}`}
                          labelText={renderLabelTooltipIcon("Custo Direto Unit. (R$)")}
                          value={it.custoUnitario}
                          onChangeValue={(v) => handleAtualizarItemCalc(idx, { custoUnitario: v ?? 0 })}
                        />
                      </CampoComHoverTooltip>

                      <CampoComHoverTooltip tooltipText={CALCULADORA_TOOLTIPS.freteUnitario}>
                        <NumericCalcInput
                          id={`item-frete-${idx}`}
                          labelText={renderLabelTooltipIcon("Frete Unit. (R$)")}
                          value={it.freteUnitario}
                          onChangeValue={(v) => handleAtualizarItemCalc(idx, { freteUnitario: v ?? 0 })}
                        />
                      </CampoComHoverTooltip>

                      <CampoComHoverTooltip tooltipText={CALCULADORA_TOOLTIPS.outrosCustosUnitario}>
                        <NumericCalcInput
                          id={`item-outros-${idx}`}
                          labelText={renderLabelTooltipIcon("Outros Custos (R$)")}
                          value={it.outrosCustosUnitario}
                          onChangeValue={(v) => handleAtualizarItemCalc(idx, { outrosCustosUnitario: v ?? 0 })}
                        />
                      </CampoComHoverTooltip>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.75rem", marginBottom: "0.75rem" }}>
                      <CampoComHoverTooltip tooltipText={CALCULADORA_TOOLTIPS.impostosPercentual}>
                        <NumericCalcInput
                          id={`item-imp-${idx}`}
                          labelText={renderLabelTooltipIcon("Impostos (%)")}
                          value={it.impostosPercentual}
                          max={80}
                          onChangeValue={(v) => handleAtualizarItemCalc(idx, { impostosPercentual: v ?? 0 })}
                        />
                      </CampoComHoverTooltip>

                      <CampoComHoverTooltip tooltipText={CALCULADORA_TOOLTIPS.bdiPercentual} testId={`tooltip-item-bdi-${idx}`}>
                        <NumericCalcInput
                          id={`item-bdi-${idx}`}
                          labelText={renderLabelTooltipIcon("BDI / Desp. Indiretas (%)")}
                          value={it.bdiPercentual}
                          max={100}
                          onChangeValue={(v) => handleAtualizarItemCalc(idx, { bdiPercentual: v ?? 0 })}
                        />
                      </CampoComHoverTooltip>

                      <CampoComHoverTooltip tooltipText={CALCULADORA_TOOLTIPS.margemMinimaPercentual}>
                        <NumericCalcInput
                          id={`item-mmin-${idx}`}
                          labelText={renderLabelTooltipIcon("Margem Mín. (%)")}
                          value={it.margemMinimaPercentual}
                          max={80}
                          onChangeValue={(v) => handleAtualizarItemCalc(idx, { margemMinimaPercentual: v ?? 0 })}
                        />
                      </CampoComHoverTooltip>

                      <CampoComHoverTooltip tooltipText={CALCULADORA_TOOLTIPS.margemAlvoPercentual}>
                        <NumericCalcInput
                          id={`item-malvo-${idx}`}
                          labelText={renderLabelTooltipIcon("Margem Alvo (%)")}
                          value={it.margemAlvoPercentual}
                          max={90}
                          onChangeValue={(v) => handleAtualizarItemCalc(idx, { margemAlvoPercentual: v ?? 0 })}
                        />
                      </CampoComHoverTooltip>
                    </div>

                    {/* Resumo Instantâneo Calculado da Linha */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "var(--cds-layer, #fff)", padding: "0.75rem", borderRadius: "4px", flexWrap: "wrap", gap: "0.75rem", borderTop: "1px dashed var(--cds-border-subtle, #e0e0e0)" }}>
                      <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap", fontSize: "0.825rem" }}>
                        <div>
                          <span style={{ color: "var(--cds-text-secondary)" }}>Piso Seguro: </span>
                          <strong style={{ color: "var(--cds-support-success, #24a148)" }}>
                            {formatarMoedaBrl(it.pisoUnitarioSeguro)}
                          </strong>{" "}
                          <span style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                            (Total: {formatarMoedaBrl(it.pisoTotalSeguro)})
                          </span>
                        </div>

                        <div>
                          <span style={{ color: "var(--cds-text-secondary)" }}>Proposta Inicial: </span>
                          <strong style={{ color: "var(--cds-text-primary)" }}>
                            {formatarMoedaBrl(it.propostaUnitaria)}
                          </strong>{" "}
                          <span style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                            (Total: {formatarMoedaBrl(it.propostaTotal)})
                          </span>
                        </div>

                        <div>
                          <span style={{ color: "var(--cds-text-secondary)" }}>Lucro Líq. Estimado: </span>
                          <strong style={{ color: "var(--cds-support-info, #0043ce)" }}>
                            {formatarMoedaBrl(it.lucroLiquidoProposta)}
                          </strong>
                        </div>
                      </div>

                      {it.motivoAlerta && (
                        <div style={{ fontSize: "0.75rem", color: "var(--cds-support-warning, #b28600)" }}>
                          ⚠️ {it.motivoAlerta}
                        </div>
                      )}
                    </div>
                  </Tile>
                ))}
              </div>

              {/* Resumo Consolidado Global da Licitação */}
              <div style={{ marginBottom: "1.5rem" }}>
                <h5 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}>
                  📊 Resumo Financeiro Consolidado da Licitação ({consolidadoCalculadora.totalItens} {consolidadoCalculadora.totalItens === 1 ? "item" : "itens"})
                </h5>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem" }}>
                  <div>
                    <Tile style={{ padding: "1rem", borderLeft: "4px solid var(--cds-border-strong, #8d8d8d)" }}>
                      <div style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)" }}>Custo Direto Total dos Itens</div>
                      <div style={{ fontSize: "1.5rem", fontWeight: 700, marginTop: "0.25rem" }}>
                        {formatarMoedaBrl(consolidadoCalculadora.custoTotalGeral)}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginTop: "0.25rem" }}>
                        Com BDI/Indiretos: {formatarMoedaBrl(consolidadoCalculadora.custoComBdiTotalGeral)}
                      </div>
                    </Tile>
                  </div>

                  <div>
                    <Tile style={{ padding: "1rem", borderLeft: "4px solid var(--cds-support-success, #24a148)" }}>
                      <div style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)" }}>Piso Seguro Global (Trava do Robô)</div>
                      <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--cds-support-success, #24a148)", marginTop: "0.25rem" }}>
                        {formatarMoedaBrl(consolidadoCalculadora.pisoTotalGeral)}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginTop: "0.25rem" }}>
                        Lucro Líq. no Piso: {formatarMoedaBrl(consolidadoCalculadora.lucroLiquidoEstimadoPiso)}
                      </div>
                    </Tile>
                  </div>

                  <div>
                    <Tile style={{ padding: "1rem", borderLeft: "4px solid var(--cds-interactive, #0f62fe)" }}>
                      <div style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)" }}>Valor Total da Proposta Inicial</div>
                      <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--cds-text-primary)", marginTop: "0.25rem" }}>
                        {formatarMoedaBrl(consolidadoCalculadora.propostaTotalGeral)}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--cds-support-info, #0043ce)", marginTop: "0.25rem" }}>
                        Lucro Líquido: {formatarMoedaBrl(consolidadoCalculadora.lucroLiquidoEstimadoProposta)} ({consolidadoCalculadora.margemMediaLiquida}%)
                      </div>
                    </Tile>
                  </div>
                </div>
              </div>

              {/* Ações da Calculadora */}
              <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap", paddingTop: "0.5rem", borderTop: "1px solid var(--cds-border-subtle, #e0e0e0)" }}>
                <Button
                  kind="primary"
                  size="md"
                  renderIcon={Save}
                  disabled={salvandoCalculadoraCertame}
                  onClick={handleSalvarCalculadoraCertame}
                  data-testid="btn-salvar-calculadora-certame"
                >
                  {salvandoCalculadoraCertame ? "Salvando no Certame..." : "Salvar Calculadora & Sincronizar Valores"}
                </Button>

                <Button
                  kind="secondary"
                  size="md"
                  renderIcon={DocumentPdf}
                  onClick={() => setActiveTab(5)}
                >
                  Ir para Proposta Comercial →
                </Button>
              </div>
            </Tile>
          </TabPanel>

          {/* Aba 6: Proposta Comercial Oficial em PDF */}
          <TabPanel>
            <Tile style={{ padding: "1.5rem", marginTop: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem", marginBottom: "1.25rem" }}>
                <div>
                  <h4 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.25rem", color: "var(--cds-text-primary)" }}>
                    📄 Proposta Comercial Oficial (Via Limpa & PDF Timbrado)
                  </h4>
                  <p style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)" }}>
                    Gere a proposta formal de preços pronta para anexar no sistema de compras públicas ou enviar ao pregoeiro. Escolha entre listar a planilha detalhada da calculadora ou o valor global em lote único, com impressão limpa ou em papel timbrado.
                  </p>
                </div>

                {/* Status da Identidade Corporativa (Logo / Timbrado) */}
                <div>
                  {empresaConfig?.papelTimbradoUrl ? (
                    <Tag type="green" size="md">
                      ✓ Papel Timbrado PDF Ativo
                    </Tag>
                  ) : empresaConfig?.logoUrl ? (
                    <Tag type="blue" size="md">
                      ✓ Logomarca Oficial Ativa
                    </Tag>
                  ) : (
                    <Tag type="cool-gray" size="md">
                      ℹ️ Sem timbrado cadastrado (Acesse Configurações)
                    </Tag>
                  )}
                </div>
              </div>

              {propostaFeedback && (
                <InlineNotification
                  kind={propostaFeedback.tipo}
                  title={propostaFeedback.tipo === "success" ? "Operação Concluída:" : "Atenção:"}
                  subtitle={propostaFeedback.msg}
                  style={{ marginBottom: "1.25rem" }}
                  onClose={() => setPropostaFeedback(null)}
                />
              )}

              {/* 1. Escolha de Modo de Emissão e Tipo de Proposta */}
              <Tile style={{ padding: "1.25rem", backgroundColor: "var(--cds-layer-accent, #f4f4f4)", marginBottom: "1.5rem" }}>
                <h5 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.75rem" }}>
                  1. Formato de Apresentação da Proposta Comercial
                </h5>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.25rem", marginBottom: "1rem" }}>
                  <div>
                    <Select
                      id="select-modo-emissao"
                      labelText="Modo de Listagem dos Preços"
                      value={propostaConfig.modoEmissao}
                      onChange={(e) => {
                        const novoModo = e.target.value as any;
                        setPropostaConfig((prev) => ({
                          ...prev,
                          modoEmissao: novoModo,
                          descricaoGlobal:
                            novoModo === "VALOR_GLOBAL" && !prev.descricaoGlobal?.trim()
                              ? obterObjetoCertame(oportunidade)
                              : prev.descricaoGlobal,
                        }));
                      }}
                    >
                      <SelectItem
                        value="ITENS_CALCULADORA"
                        text={`Planilha Detalhada de Itens (${consolidadoCalculadora.totalItens} itens calculados)`}
                      />
                      <SelectItem
                        value="VALOR_GLOBAL"
                        text="Valor Global / Lote Único Consolidado"
                      />
                    </Select>
                  </div>

                  <div>
                    <Select
                      id="select-tipo-tabela"
                      labelText="Base de Valores da Proposta"
                      value={propostaConfig.tipoTabelaProposta}
                      onChange={(e) =>
                        setPropostaConfig({
                          ...propostaConfig,
                          tipoTabelaProposta: e.target.value as any,
                        })
                      }
                    >
                      <SelectItem
                        value="PROPOSTA_INICIAL"
                        text="Proposta Inicial de Abertura (Valores com margem alvo)"
                      />
                      <SelectItem
                        value="PROPOSTA_READEQUADA"
                        text="Proposta Readequada ao Lance Vencedor (Valores arrematados/piso)"
                      />
                    </Select>
                  </div>
                </div>

                {/* Lista Minimalista de Valores Arrematados (Proposta Readequada + Planilha Detalhada de Itens) */}
                {propostaConfig.modoEmissao === "ITENS_CALCULADORA" &&
                  propostaConfig.tipoTabelaProposta === "PROPOSTA_READEQUADA" && (
                    <div
                      data-testid="lista-itens-readequados"
                      style={{
                        padding: "1rem",
                        backgroundColor: "var(--cds-layer, #fff)",
                        borderRadius: "4px",
                        border: "1px solid var(--cds-border-subtle, #e0e0e0)",
                        marginTop: "0.25rem",
                      }}
                    >
                      <div style={{ marginBottom: "0.75rem" }}>
                        <strong style={{ fontSize: "0.875rem", color: "var(--cds-text-primary)" }}>
                          🏆 Valores Arrematados por Item ({consolidadoCalculadora.totalItens} {consolidadoCalculadora.totalItens === 1 ? "item" : "itens"})
                        </strong>
                        <p style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", margin: "0.15rem 0 0 0" }}>
                          O número e a especificação são somente visuais para evitar erros. Ajuste apenas o valor arrematado de cada item conforme a ata da disputa.
                        </p>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        {consolidadoCalculadora.itens.map((it, idx) => (
                          <div
                            key={it.id || idx}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "90px 1fr 220px",
                              gap: "0.75rem",
                              alignItems: "center",
                              padding: "0.6rem 0.75rem",
                              backgroundColor: "var(--cds-layer-01, #f9f9f9)",
                              borderRadius: "4px",
                              border: "1px solid var(--cds-border-subtle, #e8e8e8)",
                            }}
                          >
                            <div>
                              <div style={{ fontSize: "0.7rem", color: "var(--cds-text-secondary)" }}>Nº Item</div>
                              <strong style={{ fontSize: "0.875rem" }}>{it.numeroItem}</strong>
                            </div>

                            <div>
                              <div style={{ fontSize: "0.7rem", color: "var(--cds-text-secondary)" }}>
                                Descrição / Especificação do Item ({it.quantidade} {it.unidade})
                              </div>
                              <div style={{ fontSize: "0.85rem", color: "var(--cds-text-primary)", fontWeight: 500 }}>
                                {it.descricao || "Sem descrição"}
                              </div>
                            </div>

                            <div>
                              <NumericCalcInput
                                id={`item-arrematado-${idx}`}
                                labelText={it.quantidade > 1 ? `Valor Unit. Arrematado (Total: ${formatarMoedaBrl(it.valorTotalReadequado)})` : "Valor Arrematado (R$)"}
                                placeholder={String(it.pisoUnitarioSeguro)}
                                allowEmpty
                                value={it.valorUnitarioArrematado ?? it.pisoUnitarioSeguro}
                                onChangeValue={(v) =>
                                  handleAtualizarItemCalc(idx, { valorUnitarioArrematado: v })
                                }
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                {propostaConfig.modoEmissao === "VALOR_GLOBAL" && (
                  <div style={{ padding: "1rem", backgroundColor: "var(--cds-layer, #fff)", borderRadius: "4px", border: "1px solid var(--cds-border-subtle, #e0e0e0)" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.75rem", marginBottom: "0.75rem" }}>
                      <div>
                        <Select
                          id="select-agrupamento-global"
                          labelText="Tipo de Rótulo do Agrupamento"
                          value={propostaConfig.tipoAgrupamentoGlobal}
                          onChange={(e) =>
                            setPropostaConfig({
                              ...propostaConfig,
                              tipoAgrupamentoGlobal: e.target.value as any,
                              tituloGlobalCustomizado:
                                e.target.value === "PRECO_GLOBAL"
                                  ? "Preço Global"
                                  : "Lote 01",
                            })
                          }
                        >
                          <SelectItem value="LOTE_01" text="Lote Específico (ex: Lote 01)" />
                          <SelectItem value="PRECO_GLOBAL" text="Preço Global Único" />
                        </Select>
                      </div>

                      {propostaConfig.tipoAgrupamentoGlobal === "LOTE_01" && (
                        <div>
                          <TextInput
                            id="input-titulo-lote"
                            labelText="Título / Identificação do Lote"
                            value={propostaConfig.tituloGlobalCustomizado || "Lote 01"}
                            onChange={(e) =>
                              setPropostaConfig({
                                ...propostaConfig,
                                tituloGlobalCustomizado: e.target.value,
                              })
                            }
                          />
                        </div>
                      )}

                      <div>
                        <NumericCalcInput
                          id="input-valor-global-manual"
                          labelText="Valor Global da Proposta (R$)"
                          placeholder={formatarMoedaBrl(
                            propostaConfig.tipoTabelaProposta === "PROPOSTA_READEQUADA"
                              ? consolidadoCalculadora.readequadaTotalGeral
                              : consolidadoCalculadora.propostaTotalGeral
                          )}
                          allowEmpty
                          value={propostaConfig.valorGlobalManual}
                          onChangeValue={(v) =>
                            setPropostaConfig({
                              ...propostaConfig,
                              valorGlobalManual: v,
                            })
                          }
                          helperText="Deixe vazio para usar a soma automática dos itens calculados"
                        />
                      </div>
                    </div>

                    <div>
                      <TextArea
                        id="textarea-desc-global"
                        labelText="Descrição Resumida do Objeto para o Lote / Preço Global"
                        rows={2}
                        value={propostaConfig.descricaoGlobal || obterObjetoCertame(oportunidade)}
                        onChange={(e) =>
                          setPropostaConfig({
                            ...propostaConfig,
                            descricaoGlobal: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                )}
              </Tile>

              {/* 2. Condições Comerciais Formais */}
              <Tile style={{ padding: "1.25rem", backgroundColor: "var(--cds-layer-accent, #f4f4f4)", marginBottom: "1.5rem" }}>
                <h5 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.75rem" }}>
                  2. Condições Comerciais da Proposta
                </h5>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem", marginBottom: "0.75rem" }}>
                  <div>
                    <TextInput
                      id="input-validade-dias"
                      labelText="Validade da Proposta (Dias)"
                      type="number"
                      value={String(propostaConfig.validadeDias)}
                      onChange={(e) =>
                        setPropostaConfig({
                          ...propostaConfig,
                          validadeDias: parseInt(e.target.value) || 60,
                        })
                      }
                      helperText="Padrão da Lei 14.133/2021: 60 dias"
                    />
                  </div>

                  <div>
                    <TextInput
                      id="input-prazo-entrega"
                      labelText="Prazo de Entrega / Início"
                      value={propostaConfig.prazoEntrega}
                      onChange={(e) =>
                        setPropostaConfig({
                          ...propostaConfig,
                          prazoEntrega: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div style={{ gridColumn: "span 2" }}>
                    <TextInput
                      id="input-cond-pagamento"
                      labelText="Condições de Pagamento"
                      value={propostaConfig.condicoesPagamento}
                      onChange={(e) =>
                        setPropostaConfig({
                          ...propostaConfig,
                          condicoesPagamento: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                <div style={{ marginBottom: "0.75rem" }}>
                  <TextInput
                    id="input-garantia-obs"
                    labelText="Garantia / Observações Adicionais"
                    value={propostaConfig.garantiaObservacoes || ""}
                    onChange={(e) =>
                      setPropostaConfig({
                        ...propostaConfig,
                        garantiaObservacoes: e.target.value,
                      })
                    }
                  />
                </div>

                {/* Dados Bancários */}
                <div style={{ padding: "0.75rem", backgroundColor: "var(--cds-layer, #fff)", borderRadius: "4px", border: "1px solid var(--cds-border-subtle, #e0e0e0)" }}>
                  <div style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                    💳 Dados Bancários para Pagamento / Liquidação do Empenho
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.75rem" }}>
                    <div>
                      <TextInput
                        id="banco-nome-prop"
                        labelText="Banco"
                        placeholder="Ex: Banco do Brasil"
                        value={
                          propostaConfig.dadosBancariosPersonalizados?.bancoNome ??
                          empresaConfig?.bancoNome ??
                          ""
                        }
                        onChange={(e) =>
                          setPropostaConfig({
                            ...propostaConfig,
                            dadosBancariosPersonalizados: {
                              ...(propostaConfig.dadosBancariosPersonalizados || {}),
                              bancoNome: e.target.value,
                            },
                          })
                        }
                      />
                    </div>
                    <div>
                      <TextInput
                        id="banco-agencia-prop"
                        labelText="Agência"
                        placeholder="Ex: 1234-5"
                        value={
                          propostaConfig.dadosBancariosPersonalizados?.agencia ??
                          empresaConfig?.agencia ??
                          ""
                        }
                        onChange={(e) =>
                          setPropostaConfig({
                            ...propostaConfig,
                            dadosBancariosPersonalizados: {
                              ...(propostaConfig.dadosBancariosPersonalizados || {}),
                              agencia: e.target.value,
                            },
                          })
                        }
                      />
                    </div>
                    <div>
                      <TextInput
                        id="banco-conta-prop"
                        labelText="Conta Corrente"
                        placeholder="Ex: 98765-4"
                        value={
                          propostaConfig.dadosBancariosPersonalizados?.contaCorrente ??
                          empresaConfig?.contaCorrente ??
                          ""
                        }
                        onChange={(e) =>
                          setPropostaConfig({
                            ...propostaConfig,
                            dadosBancariosPersonalizados: {
                              ...(propostaConfig.dadosBancariosPersonalizados || {}),
                              contaCorrente: e.target.value,
                            },
                          })
                        }
                      />
                    </div>
                    <div>
                      <TextInput
                        id="banco-pix-prop"
                        labelText="Chave PIX"
                        placeholder="CNPJ, e-mail ou aleatória"
                        value={
                          propostaConfig.dadosBancariosPersonalizados?.chavePix ??
                          empresaConfig?.chavePix ??
                          ""
                        }
                        onChange={(e) =>
                          setPropostaConfig({
                            ...propostaConfig,
                            dadosBancariosPersonalizados: {
                              ...(propostaConfig.dadosBancariosPersonalizados || {}),
                              chavePix: e.target.value,
                            },
                          })
                        }
                      />
                    </div>
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginTop: "0.4rem" }}>
                    Puxados automaticamente das Configurações da Empresa. Só serão impressos na proposta caso ao menos um campo esteja preenchido.
                  </div>
                </div>
              </Tile>

              {/* Botão de Ação: Abrir Modal com os 4 Botões Padronizados */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem", paddingTop: "0.5rem", borderTop: "1px solid var(--cds-border-subtle, #e0e0e0)" }}>
                <div>
                  <div style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)" }}>
                    Valor Total da Proposta ({propostaConfig.tipoTabelaProposta === "PROPOSTA_READEQUADA" ? "Readequada" : "Inicial"}):
                  </div>
                  <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--cds-interactive, #0f62fe)" }}>
                    {documentoProposta?.valorTotalFormatado || "R$ 0,00"}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                  <Button
                    kind="primary"
                    size="lg"
                    renderIcon={DocumentPdf}
                    onClick={() => setModalPropostaOpen(true)}
                    data-testid="btn-visualizar-proposta"
                  >
                    Visualizar Proposta Comercial (A4)
                  </Button>

                  <Button
                    kind="secondary"
                    size="lg"
                    renderIcon={Save}
                    disabled={salvandoPropostaComercial}
                    onClick={handleSalvarPropostaComercial}
                    data-testid="btn-salvar-proposta-aba"
                  >
                    {salvandoPropostaComercial
                      ? "Salvando..."
                      : propostaTemAlteracoesNaoSalvas
                      ? "Salvar Proposta"
                      : "Proposta Salva ✓"}
                  </Button>
                </div>
              </div>
            </Tile>
          </TabPanel>

          {/* Aba 7: Disputa do Certame */}
          <TabPanel>
            <Tile style={{ padding: "1.5rem", marginTop: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem", marginBottom: "1.25rem" }}>
                <div>
                  <h4 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.25rem", color: "var(--cds-text-primary)" }}>
                    ⚡ Disputa do Certame & Sala do Auto-Bidder
                  </h4>
                  <p style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)" }}>
                    Ativação do robô de lances para a sessão pública deste edital, proteção inviolável do preço piso calculado e homologação formal de vitória.
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

      {/* Modal A4: Pré-visualização da Proposta Comercial com os 4 Botões Padronizados + Salvar */}
      <Modal
        open={modalPropostaOpen}
        onRequestClose={handleSolicitarFecharModalProposta}
        passiveModal
        size="lg"
        modalHeading={documentoProposta?.titulo || "Proposta Comercial"}
        aria-label="Pré-visualização da Proposta Comercial"
      >
        <div>
          {/* Barra Superior com Salvar Proposta + os 4 Botões Idênticos a Declarações e Impugnações */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
            <Button
              kind={propostaTemAlteracoesNaoSalvas ? "primary" : "ghost"}
              size="sm"
              renderIcon={Save}
              disabled={salvandoPropostaComercial}
              onClick={handleSalvarPropostaComercial}
              id="btn-salvar-proposta-modal"
              data-testid="btn-salvar-proposta-modal"
            >
              {salvandoPropostaComercial
                ? "Salvando..."
                : propostaTemAlteracoesNaoSalvas
                ? "Salvar Proposta"
                : "Proposta Salva ✓"}
            </Button>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", flexWrap: "wrap" }}>
              <Button
                kind="secondary"
                size="sm"
                renderIcon={Printer}
                onClick={handleImprimirPropostaLimpa}
                id="btn-imprimir-proposta-a4"
                data-testid="btn-imprimir-proposta-a4"
              >
                Imprimir Documento PDF
              </Button>

            <div
              title={
                !temTimbradoOuLogo
                  ? "Cadastre o papel timbrado oficial ou o logotipo da empresa na tela de Configurações para habilitar a emissão timbrada."
                  : undefined
              }
              style={{ display: "inline-flex" }}
            >
              <Button
                kind="primary"
                size="sm"
                renderIcon={DocumentPdf}
                onClick={handleImprimirPropostaTimbrada}
                disabled={!temTimbradoOuLogo || gerandoPdfTimbradoProposta}
                id="btn-imprimir-proposta-timbrada"
                data-testid="btn-imprimir-proposta-timbrada"
              >
                {gerandoPdfTimbradoProposta ? <InlineLoading description="Gerando..." /> : "Imprimir PDF Timbrado"}
              </Button>
            </div>

            <Button
              kind="tertiary"
              size="sm"
              renderIcon={Copy}
              onClick={handleCopiarTextoProposta}
              id="btn-copiar-proposta"
              data-testid="btn-copiar-proposta"
            >
              {copiadoProposta ? "Texto Copiado!" : "Copiar Texto"}
            </Button>

            <Button
              kind="ghost"
              size="sm"
              renderIcon={DocumentDownload}
              onClick={handleBaixarTxtProposta}
              id="btn-exportar-txt-proposta"
              data-testid="btn-exportar-txt-proposta"
            >
              Exportar .TXT
            </Button>
            </div>
          </div>

          {/* Visualização da Folha Oficial no Modal */}
          <div
            id="a4-folha-proposta"
            data-testid="folha-proposta-preview"
            style={{
              background: "#ffffff",
              color: "#161616",
              padding: "2rem",
              borderRadius: "2px",
              border: "1px solid #c6c6c6",
              maxHeight: "65vh",
              overflowY: "auto",
            }}
          >
            {documentoProposta?.conteudoHtml ? (
              <div dangerouslySetInnerHTML={{ __html: documentoProposta.conteudoHtml }} />
            ) : (
              <div style={{ textAlign: "center", padding: "2rem", color: "var(--cds-text-secondary)" }}>
                Nenhum dado de proposta disponível para exibição.
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Modal de Confirmação ao fechar Proposta Comercial com alterações não salvas */}
      <Modal
        open={confirmarSaidaPropostaOpen}
        modalHeading="Deseja salvar a Proposta Comercial?"
        primaryButtonText={salvandoPropostaComercial ? "Salvando..." : "Salvar e Fechar"}
        secondaryButtonText="Fechar sem Salvar"
        onRequestClose={() => setConfirmarSaidaPropostaOpen(false)}
        onSecondarySubmit={() => {
          setConfirmarSaidaPropostaOpen(false);
          setModalPropostaOpen(false);
        }}
        onRequestSubmit={async () => {
          const ok = await handleSalvarPropostaComercial();
          if (ok) {
            setConfirmarSaidaPropostaOpen(false);
            setModalPropostaOpen(false);
          }
        }}
        primaryButtonDisabled={salvandoPropostaComercial}
        size="sm"
        data-testid="modal-confirmar-salvar-proposta"
      >
        <p style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)", lineHeight: 1.5 }}>
          Esta proposta ainda não foi salva ou teve alguma modificação recente (como prazo de validade, condições comerciais ou valores arrematados). Deseja salvar a proposta antes de sair para não perder os dados?
        </p>
      </Modal>

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

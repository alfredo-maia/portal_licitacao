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
  Toggle,
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
  Locked,
  Renew,
  Flash,
} from "@carbon/icons-react";
import { SalaSimuladaModal } from "@/components/robo-lances/sala-simulada-modal";
import { ModulePageShell } from "@/components/shell/module-page-shell";
import { FileDropZone } from "@/components/ui/file-drop-zone";
import { APP_CONFIG } from "@/config/brand";
import { TIPOS_SISTEMA_CATALOG } from "@/config/tipos-sistema";
import { resolverTituloExibicaoLicitacao } from "@/lib/resumo-licitacao";
import { sanitizarHtmlDocumento } from "@/lib/sanitize-html";
import {
  CALCULADORA_TOOLTIPS,
  calcularItemProposta,
  consolidarCalculadoraProposta,
  formatarMoedaBrl,
  parseDecimalFlexivel,
  round2,
  validarPropostaManual,
  validarRegrasDisputa,
  UNIDADES_ITEM_OPCOES,
  PORTAIS_DISPUTA_OPCOES,
  TIPO_DECREMENTO_OPCOES,
  TATICA_DISPUTA_OPCOES,
  type ItemCalculadoraInput,
  type ConfiguracaoPropostaInput,
  type UnidadeItemLicitacao,
  type DisputaConfig,
  type DisputaItemRegra,
  type TipoDecremento,
  type TaticaDisputa,
  type RegrasDisputaDetectadas,
} from "@/server/schemas/proposta-calculadora.schema";
import { mesclarRegrasDisputaDetectadas } from "@/lib/regras-disputa-edital";
import { gerarConteudoPropostaComercial } from "@/lib/proposta-comercial-template";
import {
  gerarConteudoPedidoCotacao,
  type ConfigPedidoCotacao,
  type ItemPedidoCotacao,
} from "@/lib/pedido-cotacao-template";
import type { ItemDisputaEdital } from "@/server/schemas/analise-ia.schema";
import {
  adequarItensAoIntervaloMinimo,
  listarItensAbaixoIntervaloMinimo,
  parseIntervaloMinimoEdital,
} from "@/lib/robo-lances-engine";
import {
  mesclarItensCertameNaCalculadora,
  normalizarChaveItem,
  normalizarMapaSelecaoCotacao,
  sanearItensCalculadoraHidratados,
  sincronizarRegrasDisputaComCalculadora,
} from "@/lib/sincronizacao-itens-certame";

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
  portalDisputa?: string | null;
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
  regrasDisputaDetectadas?: RegrasDisputaDetectadas | null;
  calculadoraDados?: {
    parametrosPadrao?: {
      impostosPercentual: number;
      bdiPercentual: number;
      margemMinimaPercentual: number;
      margemAlvoPercentual: number;
    };
    itens?: ItemCalculadoraInput[];
    propostaConfig?: Partial<ConfiguracaoPropostaInput>;
    cotacaoConfig?: Record<string, unknown> & {
      itensSelecionados?: Record<string, boolean>;
    };
    disputaConfig?: Partial<DisputaConfig>;
    regrasDisputaDetectadas?: RegrasDisputaDetectadas | null;
    atualizadoEm?: string;
  } | null;
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

function obterObjetoCertame(
  opp?: Partial<OportunidadeDetalhe> | null,
  cfg?: Partial<ConfiguracaoPropostaInput> | null,
  itens?: ItemCalculadoraInput[]
): string {
  if (cfg?.descricaoGlobal?.trim()) {
    return cfg.descricaoGlobal.trim();
  }
  if (opp) {
    const txt = (opp.objeto || opp.resumo || opp.miniResumo || (opp as any).descricao || "").trim();
    if (txt) return txt;
  }
  if (itens && itens.length > 0 && itens[0]?.descricao?.trim()) {
    return itens[0].descricao.trim();
  }
  return "Fornecimento de materiais e/ou serviços especializados conforme especificações do Edital e seus anexos.";
}

export interface CampoComHoverTooltipProps {
  tooltipText: string;
  children: React.ReactNode;
  testId?: string;
}

export function CampoComHoverTooltip({ tooltipText, children, testId }: CampoComHoverTooltipProps) {
  const [visivel, setVisivel] = React.useState(false);

  return (
    <span
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        gap: "0.25rem",
        cursor: "help",
      }}
      onMouseEnter={() => setVisivel(true)}
      onMouseLeave={() => setVisivel(false)}
      data-testid={testId}
    >
      <span>{children}</span>
      <Information
        size={14}
        style={{ color: "var(--cds-icon-secondary, #525252)", flexShrink: 0 }}
      />
      {visivel && (
        <span
          role="tooltip"
          style={{
            position: "absolute",
            bottom: "calc(100% + 4px)",
            left: 0,
            zIndex: 99999,
            minWidth: "240px",
            maxWidth: "340px",
            backgroundColor: "#161616",
            color: "#ffffff",
            padding: "0.65rem 0.8rem",
            borderRadius: "4px",
            fontSize: "0.75rem",
            lineHeight: 1.45,
            boxShadow: "0 4px 14px rgba(0, 0, 0, 0.35)",
            pointerEvents: "none",
            whiteSpace: "normal",
            fontWeight: 400,
            textAlign: "left",
          }}
        >
          {tooltipText}
        </span>
      )}
    </span>
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
  hideLabel?: boolean;
  invalid?: boolean;
  invalidText?: string;
  size?: "sm" | "md" | "lg";
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
  hideLabel = false,
  invalid = false,
  invalidText,
  size,
  min = 0,
  max,
}: NumericCalcInputProps) {
  const formatarNumero = (v: number | null | undefined) => {
    if (v === null || v === undefined || Number.isNaN(v)) return "";
    return String(v);
  };

  const normalizarEntradaNumerica = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed.includes(",") && trimmed.includes(".")) {
      return trimmed.replace(/\./g, "").replace(",", ".");
    }
    return trimmed.replace(",", ".");
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

    const limpo = normalizarEntradaNumerica(raw);
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
    const limpo = normalizarEntradaNumerica(draft);
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
      hideLabel={hideLabel}
      placeholder={placeholder}
      helperText={helperText}
      invalid={invalid}
      invalidText={invalidText}
      size={size}
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
  const [confirmarReanaliseIAOpen, setConfirmarReanaliseIAOpen] = React.useState(false);
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
    origemValoresProposta: "CALCULADORA",
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

  // Pedido de Cotação (RFQ para Fornecedores)
  const [configCotacao, setConfigCotacao] = React.useState<ConfigPedidoCotacao>({
    fornecedorNome: "",
    contatoFornecedor: "",
    emailFornecedor: "",
    telefoneFornecedor: "",
    prazoResposta: "Até 3 dias úteis",
    modalidadeFrete: "CIF",
    localEntregaCidade: "",
    localEntregaUf: "",
    condicoesPagamento: "Conforme faturamento / entrega",
    prazoGarantia: "12 meses padrão de fábrica",
    observacoes: "",
    ocultarOrgaoEdital: true, // Sigilo Comercial ativado por padrão
  });
  const [itensSelecionadosCotacao, setItensSelecionadosCotacao] = React.useState<Record<string, boolean>>({});
  const [modalVisualizarCotacaoAberto, setModalVisualizarCotacaoAberto] = React.useState(false);
  const [gerandoPdfCotacao, setGerandoPdfCotacao] = React.useState(false);
  const [salvandoCotacao, setSalvandoCotacao] = React.useState(false);
  const [copiadoCotacao, setCopiadoCotacao] = React.useState(false);
  const [cotacaoFeedback, setCotacaoFeedback] = React.useState<{ tipo: "success" | "error"; msg: string } | null>(null);
  const [consultandoItensCertame, setConsultandoItensCertame] = React.useState(false);

  // Disputa & Robô de Lances Multi-Item
  const [portalDisputa, setPortalDisputa] = React.useState<string>("Compras.gov.br");
  const [identificadorSalaDisputa, setIdentificadorSalaDisputa] = React.useState<string>("");
  const [modoDisputaEdital, setModoDisputaEdital] = React.useState<"ABERTO" | "ABERTO_FECHADO" | "FECHADO_ABERTO">("ABERTO");
  const [intervaloMinimoLances, setIntervaloMinimoLances] = React.useState<string>("R$ 0,01");
  const [disputaOrigemPrecos, setDisputaOrigemPrecos] = React.useState<"CALCULADORA" | "MANUAL">("CALCULADORA");
  const [statusGeralDisputa, setStatusGeralDisputa] = React.useState<"CONFIGURADA" | "EM_DISPUTA" | "PAUSADA" | "CONCLUIDA">("CONFIGURADA");
  const [pausaEmergenciaDisputa, setPausaEmergenciaDisputa] = React.useState<boolean>(false);
  const [tempoRespostaSegundos, setTempoRespostaSegundos] = React.useState<number>(3);
  const [tempoRespostaDraft, setTempoRespostaDraft] = React.useState<string>("3");
  const [segundosFinaisSniper, setSegundosFinaisSniper] = React.useState<number>(10);

  React.useEffect(() => {
    setTempoRespostaDraft(String(tempoRespostaSegundos));
  }, [tempoRespostaSegundos]);
  const [regrasDisputaItens, setRegrasDisputaItens] = React.useState<DisputaItemRegra[]>([]);
  const [regrasDisputaDetectadas, setRegrasDisputaDetectadas] =
    React.useState<RegrasDisputaDetectadas | null>(null);
  const [salvandoDisputaCertame, setSalvandoDisputaCertame] = React.useState(false);
  const [disputaFeedback, setDisputaFeedback] = React.useState<{ tipo: "success" | "error"; msg: string } | null>(null);
  const [modalSimuladorDisputaAberto, setModalSimuladorDisputaAberto] = React.useState(false);

  // Estados da barra de aplicação de regra em massa
  const [massaTipoDecremento, setMassaTipoDecremento] = React.useState<TipoDecremento>("CENTAVOS_1");
  const [massaValorDecremento, setMassaValorDecremento] = React.useState<string>("0.01");
  const [massaTatica, setMassaTatica] = React.useState<TaticaDisputa>("IMEDIATO");

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
    } else if (abaParam === "cotacao" || abaParam === "pedido-cotacao") {
      setActiveTab(4);
    } else if (abaParam === "calculadora") {
      setActiveTab(5);
    } else if (abaParam === "proposta" || abaParam === "valor-proposta") {
      setActiveTab(6);
    } else if (abaParam === "disputa" || abaParam === "robo") {
      setActiveTab(7);
    } else if (abaParam === "arquivos") {
      setActiveTab(1);
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
      const detectadasInicial: RegrasDisputaDetectadas | null =
        opp.regrasDisputaDetectadas || opp.calculadoraDados?.regrasDisputaDetectadas || null;
      setRegrasDisputaDetectadas(detectadasInicial);

      const aplicarPrefillDetectadasSemSobrescrever = () => {
        setDisputaOrigemPrecos("CALCULADORA");
        const portalDetectado =
          detectadasInicial?.portal &&
          (PORTAIS_DISPUTA_OPCOES as readonly string[]).includes(detectadasInicial.portal)
            ? detectadasInicial.portal
            : null;
        if (portalDetectado) {
          setPortalDisputa(portalDetectado);
        }
        if (detectadasInicial?.modoDisputaEdital) {
          setModoDisputaEdital(detectadasInicial.modoDisputaEdital);
        }
        if (detectadasInicial?.intervaloMinimoLances) {
          setIntervaloMinimoLances(detectadasInicial.intervaloMinimoLances);
        }
        setIdentificadorSalaDisputa(
          detectadasInicial?.identificadorSala ||
            (detectadasInicial?.uasg ? `UASG ${detectadasInicial.uasg}` : "") ||
            opp.numeroEdital ||
            "",
        );
      };

      // Hidratação dos dados da Calculadora Multi-Item e Proposta
      if (opp.calculadoraDados) {
        const itensBrutos =
          Array.isArray(opp.calculadoraDados.itens) && opp.calculadoraDados.itens.length > 0
            ? opp.calculadoraDados.itens
            : [];
        const itensHidratados = sanearItensCalculadoraHidratados(itensBrutos, opp.valorEstimado);
        if (itensHidratados.length > 0) {
          setItensCalculadora(itensHidratados);
        }
        if (opp.calculadoraDados.parametrosPadrao) {
          setParametrosPadraoCalc(opp.calculadoraDados.parametrosPadrao);
        }
        if (opp.calculadoraDados.propostaConfig) {
          const cfgHidratada: ConfiguracaoPropostaInput = {
            modoEmissao: "ITENS_CALCULADORA",
            origemValoresProposta: "CALCULADORA",
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

        if (opp.calculadoraDados.cotacaoConfig) {
          const { itensSelecionados, ...cfgCotacaoLimpo } = opp.calculadoraDados.cotacaoConfig;
          setConfigCotacao((prev) => ({
            ...prev,
            ...cfgCotacaoLimpo,
            ocultarOrgaoEdital: cfgCotacaoLimpo.ocultarOrgaoEdital ?? true,
            localEntregaCidade: cfgCotacaoLimpo.localEntregaCidade || opp.municipio || opp.cidade || "",
            localEntregaUf: cfgCotacaoLimpo.localEntregaUf || opp.uf || "",
          }));
          if (itensSelecionados && typeof itensSelecionados === "object" && !Array.isArray(itensSelecionados)) {
            setItensSelecionadosCotacao(itensSelecionados);
          }
        } else {
          setConfigCotacao((prev) => ({
            ...prev,
            localEntregaCidade: opp.municipio || opp.cidade || "",
            localEntregaUf: opp.uf || "",
          }));
        }

        if (opp.calculadoraDados.disputaConfig) {
          const disp = opp.calculadoraDados.disputaConfig;
          if (disp.portal) setPortalDisputa(disp.portal);
          setIdentificadorSalaDisputa(disp.identificadorSala || opp.numeroEdital || "");
          if (disp.modoDisputaEdital) setModoDisputaEdital(disp.modoDisputaEdital);
          if (disp.intervaloMinimoLances) setIntervaloMinimoLances(disp.intervaloMinimoLances);
          setDisputaOrigemPrecos(disp.origemPrecos === "MANUAL" ? "MANUAL" : "CALCULADORA");
          if (disp.statusGeral) setStatusGeralDisputa(disp.statusGeral);
          setPausaEmergenciaDisputa(Boolean(disp.pausaEmergencia));
          if (disp.tempoRespostaSegundos) setTempoRespostaSegundos(disp.tempoRespostaSegundos);
          if (disp.segundosFinaisSniper) setSegundosFinaisSniper(disp.segundosFinaisSniper);
          if (Array.isArray(disp.regrasItens) && disp.regrasItens.length > 0) {
            setRegrasDisputaItens(disp.regrasItens);
          }
        } else {
          aplicarPrefillDetectadasSemSobrescrever();
        }
      } else {
        aplicarPrefillDetectadasSemSobrescrever();
        setItensCalculadora([
          {
            id: "item_01",
            numeroItem: "01",
            descricao: objetoCertame || "Fornecimento de materiais/serviços conforme edital",
            marcaModelo: "",
            unidade: "UN",
            quantidade: 1,
            valorEstimadoUnitario: null,
            custoUnitario: 0,
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
          origemValoresProposta: "CALCULADORA",
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

  // Cálculos consolidados da Calculadora (puros) e Proposta (Calculada ou Manual)
  const consolidadoPuroCalculadora = React.useMemo(() => {
    return consolidarCalculadoraProposta(itensCalculadora, {
      ...propostaConfig,
      origemValoresProposta: "CALCULADORA",
    });
  }, [itensCalculadora, propostaConfig]);

  const pisosCalculadosPorItem = React.useMemo(() => {
    const porId = new Map<string, number>();
    const porNumero = new Map<string, number>();
    consolidadoPuroCalculadora.itens.forEach((it, idx) => {
      if (it.id) porId.set(it.id, it.pisoUnitarioSeguro);
      porNumero.set(normalizarChaveItem(it.numeroItem, idx), it.pisoUnitarioSeguro);
    });
    return { porId, porNumero };
  }, [consolidadoPuroCalculadora.itens]);

  const consolidadoCalculadora = React.useMemo(() => {
    return consolidarCalculadoraProposta(itensCalculadora, propostaConfig);
  }, [itensCalculadora, propostaConfig]);

  const disputaTotais = React.useMemo(() => {
    let pisoTotal = 0;
    let propostaTotal = 0;
    for (const r of regrasDisputaItens) {
      const qtd = Number(r.quantidade) > 0 ? Number(r.quantidade) : 1;
      pisoTotal += round2((Number(r.pisoUnitarioSeguro) || 0) * qtd);
      propostaTotal += round2((Number(r.propostaUnitaria) || 0) * qtd);
    }
    return {
      pisoTotal: round2(pisoTotal),
      propostaTotal: round2(propostaTotal),
    };
  }, [regrasDisputaItens]);

  const validacaoDisputaAtual = React.useMemo(
    () => validarRegrasDisputa(regrasDisputaItens, disputaOrigemPrecos),
    [regrasDisputaItens, disputaOrigemPrecos],
  );

  const itensAbaixoIntervaloDisputa = React.useMemo(
    () => listarItensAbaixoIntervaloMinimo(regrasDisputaItens, intervaloMinimoLances),
    [regrasDisputaItens, intervaloMinimoLances],
  );

  const intervaloIaDivergente = React.useMemo(() => {
    const parsedIa = parseIntervaloMinimoEdital(regrasDisputaDetectadas?.intervaloMinimoLances);
    if (!parsedIa) return null;
    const parsedAtual = parseIntervaloMinimoEdital(intervaloMinimoLances);
    if (!parsedAtual) return parsedIa;
    if (parsedIa.tipo === parsedAtual.tipo) {
      return parsedIa.valor > parsedAtual.valor + 1e-9 ? parsedIa : null;
    }
    return parsedIa.textoFormatado !== parsedAtual.textoFormatado ? parsedIa : null;
  }, [regrasDisputaDetectadas?.intervaloMinimoLances, intervaloMinimoLances]);

  const validacaoPropostaAtual = React.useMemo(
    () => validarPropostaManual(itensCalculadora, propostaConfig),
    [itensCalculadora, propostaConfig],
  );

  const documentoProposta = React.useMemo(() => {
    if (!oportunidade) return null;
    return gerarConteudoPropostaComercial({
      orgaoNome: oportunidade.orgaoNome || "Órgão Licitante",
      numeroEdital: oportunidade.numeroEdital || "Edital",
      objetoLicitacao: obterObjetoCertame(oportunidade, propostaConfig, itensCalculadora),
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

  const handleAlternarOrigemProposta = (novaOrigem: "CALCULADORA" | "MANUAL") => {
    if (novaOrigem === "MANUAL") {
      setItensCalculadora((prev) =>
        prev.map((it) => {
          if (it.valorUnitarioPropostaManual != null) return it;
          const calc = calcularItemProposta(it, { usarPropostaManual: false });
          return {
            ...it,
            valorUnitarioPropostaManual: calc.propostaUnitaria,
          };
        }),
      );
    }
    setPropostaConfig((prev) => ({
      ...prev,
      origemValoresProposta: novaOrigem,
    }));
    setPropostaFeedback(null);
  };

  const handleAtualizarPropostaManualItem = (idx: number, valorUnitario: number | null) => {
    const targetItem = itensCalculadora[idx];
    setItensCalculadora((prev) => {
      const novos = [...prev];
      if (!novos[idx]) return prev;
      novos[idx] = { ...novos[idx], valorUnitarioPropostaManual: valorUnitario };
      return novos;
    });
    if (targetItem && valorUnitario !== null && !Number.isNaN(valorUnitario)) {
      const valorLimpo = round2(Math.max(0, valorUnitario));
      const targetNumNorm = normalizarChaveItem(targetItem.numeroItem, idx);
      setRegrasDisputaItens((prev) =>
        prev.map((r, rIdx) => {
          const mesmoItem =
            (targetItem.id && r.itemId === targetItem.id) ||
            normalizarChaveItem(r.numeroItem, rIdx) === targetNumNorm;
          return mesmoItem ? { ...r, propostaUnitaria: valorLimpo } : r;
        }),
      );
    }
  };

  const handleRestaurarPropostaCalculadora = () => {
    const recalculados = consolidadoPuroCalculadora.itens;
    setItensCalculadora((prev) =>
      prev.map((it, idx) => ({
        ...it,
        valorUnitarioPropostaManual: recalculados[idx]?.propostaUnitaria ?? 0,
      })),
    );
    setRegrasDisputaItens((prev) =>
      prev.map((r, rIdx) => {
        const match = recalculados.find(
          (c, cIdx) =>
            c.id === r.itemId ||
            normalizarChaveItem(c.numeroItem, cIdx) === normalizarChaveItem(r.numeroItem, rIdx),
        );
        return match ? { ...r, propostaUnitaria: match.propostaUnitaria } : r;
      }),
    );
    setPropostaFeedback({
      tipo: "success",
      msg: "Valores manuais da proposta preenchidos novamente a partir da Calculadora.",
    });
    setTimeout(() => setPropostaFeedback(null), 4000);
  };

  const handleAlternarOrigemDisputa = (novaOrigem: "CALCULADORA" | "MANUAL") => {
    setDisputaOrigemPrecos(novaOrigem);
    setDisputaFeedback(null);
    if (novaOrigem === "CALCULADORA") {
      setRegrasDisputaItens((prevRegras) =>
        sincronizarRegrasDisputaComCalculadora(consolidadoCalculadora.itens, prevRegras, {
          origemPrecosDisputa: "CALCULADORA",
        }),
      );
    } else {
      setRegrasDisputaItens((prevRegras) => {
        if (prevRegras.length === 0 && consolidadoCalculadora.itens.length > 0) {
          return sincronizarRegrasDisputaComCalculadora(consolidadoCalculadora.itens, [], {
            origemPrecosDisputa: "CALCULADORA",
          });
        }
        return prevRegras;
      });
    }
  };

  const handleRecarregarDisputaDaCalculadora = () => {
    setRegrasDisputaItens((prevRegras) =>
      sincronizarRegrasDisputaComCalculadora(consolidadoPuroCalculadora.itens, prevRegras, {
        origemPrecosDisputa: "CALCULADORA",
      }),
    );
    setDisputaFeedback({
      tipo: "success",
      msg: "Piso Seguro e Proposta Inicial da Disputa recarregados a partir da Calculadora.",
    });
    setTimeout(() => setDisputaFeedback(null), 4000);
  };

  const handleAtualizarRegraDisputaPreco = (
    itemId: string,
    campo: "pisoUnitarioSeguro" | "propostaUnitaria",
    valor: number,
  ) => {
    const valorLimpo = round2(Math.max(0, Number.isFinite(valor) ? valor : 0));
    setRegrasDisputaItens((prev) =>
      prev.map((r) => (r.itemId === itemId ? { ...r, [campo]: valorLimpo } : r)),
    );
  };

  const handleAdequarItensAoIntervaloMinimo = (intervaloAlvo?: string) => {
    const intervaloEfetivo = intervaloAlvo ?? intervaloMinimoLances;
    if (intervaloAlvo) {
      setIntervaloMinimoLances(intervaloAlvo);
    }
    setRegrasDisputaItens((prev) =>
      adequarItensAoIntervaloMinimo(prev, intervaloEfetivo),
    );
    const parsed = parseIntervaloMinimoEdital(intervaloEfetivo);
    setDisputaFeedback({
      tipo: "success",
      msg: `Itens ativos adequados ao intervalo mínimo de ${
        parsed?.textoFormatado || intervaloEfetivo
      }. Clique em 'Salvar Configuração de Disputa' para confirmar.`,
    });
    setTimeout(() => setDisputaFeedback(null), 5000);
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
      const lanceMinEfetivo =
        disputaOrigemPrecos === "MANUAL"
          ? disputaTotais.pisoTotal
          : consolidadoPuroCalculadora.pisoTotalGeral;
      const valorPropEfetivo =
        propostaConfig.modoEmissao === "VALOR_GLOBAL" &&
        propostaConfig.valorGlobalManual &&
        propostaConfig.valorGlobalManual > 0
          ? propostaConfig.valorGlobalManual
          : consolidadoCalculadora.propostaTotalGeral;

      const dadosCalculadora = {
        parametrosPadrao: parametrosPadraoCalc,
        itens: itensCalculadora,
        propostaConfig,
        cotacaoConfig: { ...configCotacao, itensSelecionados: itensSelecionadosCotacao },
        disputaConfig: {
          portal: portalDisputa,
          identificadorSala: identificadorSalaDisputa.trim() || oportunidade.numeroEdital || "",
          modoDisputaEdital,
          intervaloMinimoLances,
          origemPrecos: disputaOrigemPrecos,
          statusGeral: statusGeralDisputa,
          pausaEmergencia: pausaEmergenciaDisputa,
          tempoRespostaSegundos,
          segundosFinaisSniper,
          regrasItens: regrasDisputaItens,
          atualizadoEm: new Date().toISOString(),
        },
        ...(regrasDisputaDetectadas ? { regrasDisputaDetectadas } : {}),
        atualizadoEm: new Date().toISOString(),
      };
      const res = await fetch(`/api/oportunidades/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: oportunidade.status,
          lanceMinimo: lanceMinEfetivo,
          valorProposta: valorPropEfetivo,
          calculadoraDados: dadosCalculadora,
        }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || errJson.error || "Falha ao salvar dados da calculadora");
      }
      setLanceMinimoInput(String(lanceMinEfetivo));
      setValorPropostaInput(String(valorPropEfetivo));
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
    const checkProposta = validarPropostaManual(itensCalculadora, propostaConfig);
    if (!checkProposta.valido) {
      setPropostaFeedback({
        tipo: "error",
        msg: checkProposta.erro || "Informe valores unitários maiores que R$ 0,00 antes de salvar.",
      });
      return false;
    }
    const checkDisputaPiso = validarRegrasDisputa(regrasDisputaItens, disputaOrigemPrecos);
    if (checkDisputaPiso.itensPisoMaiorIds.length > 0) {
      setPropostaFeedback({
        tipo: "error",
        msg:
          checkDisputaPiso.errosPisoMaior[0] ||
          checkDisputaPiso.erros[0] ||
          "Na aba Disputa existe item com Valor Mínimo maior que a Proposta Inicial.",
      });
      return false;
    }
    setSalvandoPropostaComercial(true);
    setPropostaFeedback(null);
    try {
      const lanceMinEfetivo =
        disputaOrigemPrecos === "MANUAL"
          ? disputaTotais.pisoTotal
          : consolidadoPuroCalculadora.pisoTotalGeral;
      const valorPropEfetivo =
        propostaConfig.modoEmissao === "VALOR_GLOBAL" &&
        propostaConfig.valorGlobalManual &&
        propostaConfig.valorGlobalManual > 0
          ? propostaConfig.valorGlobalManual
          : propostaConfig.tipoTabelaProposta === "PROPOSTA_READEQUADA"
          ? consolidadoCalculadora.readequadaTotalGeral
          : consolidadoCalculadora.propostaTotalGeral;

      const dadosCalculadora = {
        parametrosPadrao: parametrosPadraoCalc,
        itens: itensCalculadora,
        propostaConfig,
        cotacaoConfig: { ...configCotacao, itensSelecionados: itensSelecionadosCotacao },
        disputaConfig: {
          portal: portalDisputa,
          identificadorSala: identificadorSalaDisputa.trim() || oportunidade.numeroEdital || "",
          modoDisputaEdital,
          intervaloMinimoLances,
          origemPrecos: disputaOrigemPrecos,
          statusGeral: statusGeralDisputa,
          pausaEmergencia: pausaEmergenciaDisputa,
          tempoRespostaSegundos,
          segundosFinaisSniper,
          regrasItens: regrasDisputaItens,
          atualizadoEm: new Date().toISOString(),
        },
        ...(regrasDisputaDetectadas ? { regrasDisputaDetectadas } : {}),
        atualizadoEm: new Date().toISOString(),
      };
      const res = await fetch(`/api/oportunidades/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: oportunidade.status,
          lanceMinimo: lanceMinEfetivo,
          valorProposta: valorPropEfetivo,
          calculadoraDados: dadosCalculadora,
        }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || errJson.error || "Falha ao salvar a proposta comercial");
      }
      setValorPropostaInput(String(valorPropEfetivo));
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

  // Sincroniza a grade multi-item do Robô de Lances com os itens e pisos da Calculadora
  React.useEffect(() => {
    if (!consolidadoCalculadora.itens || consolidadoCalculadora.itens.length === 0) return;
    setRegrasDisputaItens((prevRegras) =>
      sincronizarRegrasDisputaComCalculadora(consolidadoCalculadora.itens, prevRegras, {
        origemPrecosDisputa: disputaOrigemPrecos,
      }),
    );
  }, [consolidadoCalculadora.itens, disputaOrigemPrecos]);

  const aplicarRegraEmMassa = () => {
    const vDec = parseDecimalFlexivel(massaValorDecremento);
    const valorFinal =
      vDec === null || vDec <= 0
        ? massaTipoDecremento === "CENTAVOS_1"
          ? 0.01
          : massaTipoDecremento === "PERCENTUAL"
          ? 0.5
          : 1.0
        : round2(vDec);

    setRegrasDisputaItens((prev) =>
      prev.map((r) => ({
        ...r,
        tipoDecremento: massaTipoDecremento,
        valorDecremento: massaTipoDecremento === "CENTAVOS_1" ? 0.01 : valorFinal,
        tatica: massaTatica,
      }))
    );
    setDisputaFeedback({
      tipo: "success",
      msg: `Regra em massa (${
        massaTipoDecremento === "CENTAVOS_1"
          ? "R$ 0,01"
          : massaTipoDecremento === "FIXO_REAIS"
          ? `R$ ${valorFinal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : `${valorFinal.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`
      }, Tática: ${massaTatica}) aplicada a todos os itens.`,
    });
    setTimeout(() => setDisputaFeedback(null), 4000);
  };

  const handleAplicarRegrasDetectadas = () => {
    if (!regrasDisputaDetectadas) return;
    if (
      regrasDisputaDetectadas.portal &&
      (PORTAIS_DISPUTA_OPCOES as readonly string[]).includes(regrasDisputaDetectadas.portal)
    ) {
      setPortalDisputa(regrasDisputaDetectadas.portal);
    } else if (regrasDisputaDetectadas.portal) {
      setPortalDisputa("Outro Portal");
    }
    if (regrasDisputaDetectadas.modoDisputaEdital) {
      setModoDisputaEdital(regrasDisputaDetectadas.modoDisputaEdital);
    }
    if (regrasDisputaDetectadas.intervaloMinimoLances) {
      setIntervaloMinimoLances(regrasDisputaDetectadas.intervaloMinimoLances);
    }
    if (regrasDisputaDetectadas.identificadorSala || regrasDisputaDetectadas.uasg) {
      setIdentificadorSalaDisputa(
        regrasDisputaDetectadas.identificadorSala ||
          `UASG ${regrasDisputaDetectadas.uasg}`,
      );
    }
    setDisputaFeedback({
      tipo: "success",
      msg: "Regras detectadas do Edital/PNCP aplicadas nos campos da sessão. Clique em 'Salvar Disputa & Robô' para confirmar.",
    });
    setTimeout(() => setDisputaFeedback(null), 5000);
  };

  const handleSalvarPedidoCotacao = async () => {
    if (!id || !oportunidade) return;
    setSalvandoCotacao(true);
    setCotacaoFeedback(null);
    try {
      const cotacaoPersistida = {
        ...configCotacao,
        itensSelecionados: itensSelecionadosCotacao,
      };
      const valorPropEfetivo =
        propostaConfig.modoEmissao === "VALOR_GLOBAL" &&
        propostaConfig.valorGlobalManual &&
        propostaConfig.valorGlobalManual > 0
          ? propostaConfig.valorGlobalManual
          : propostaConfig.tipoTabelaProposta === "PROPOSTA_READEQUADA"
          ? consolidadoCalculadora.readequadaTotalGeral
          : consolidadoCalculadora.propostaTotalGeral;
      const lanceMinEfetivo =
        disputaOrigemPrecos === "MANUAL"
          ? disputaTotais.pisoTotal
          : consolidadoPuroCalculadora.pisoTotalGeral;

      const dadosCalculadora = {
        parametrosPadrao: parametrosPadraoCalc,
        itens: itensCalculadora,
        propostaConfig,
        cotacaoConfig: cotacaoPersistida,
        disputaConfig: {
          portal: portalDisputa,
          identificadorSala: identificadorSalaDisputa.trim() || oportunidade.numeroEdital || "",
          modoDisputaEdital,
          intervaloMinimoLances,
          origemPrecos: disputaOrigemPrecos,
          statusGeral: statusGeralDisputa,
          pausaEmergencia: pausaEmergenciaDisputa,
          tempoRespostaSegundos,
          segundosFinaisSniper,
          regrasItens: regrasDisputaItens,
          atualizadoEm: new Date().toISOString(),
        },
        ...(regrasDisputaDetectadas ? { regrasDisputaDetectadas } : {}),
        atualizadoEm: new Date().toISOString(),
      };

      const res = await fetch(`/api/oportunidades/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: oportunidade.status,
          lanceMinimo: lanceMinEfetivo,
          valorProposta: valorPropEfetivo,
          calculadoraDados: dadosCalculadora,
        }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || errJson.error || "Falha ao salvar pedido de cotação");
      }
      setCotacaoFeedback({
        tipo: "success",
        msg: configCotacao.ocultarOrgaoEdital
          ? "Pedido de Cotação salvo! Sigilo Comercial (órgão e edital ocultos) e itens selecionados gravados."
          : "Pedido de Cotação salvo! Referência do órgão/edital visível e itens selecionados gravados.",
      });
      setTimeout(() => setCotacaoFeedback(null), 5000);
    } catch (err: any) {
      setCotacaoFeedback({
        tipo: "error",
        msg: err?.message || "Erro ao salvar pedido de cotação.",
      });
    } finally {
      setSalvandoCotacao(false);
    }
  };

  const handleSalvarConfiguracaoDisputa = async () => {
    if (!id || !oportunidade) return;
    const checkDisputa = validarRegrasDisputa(regrasDisputaItens, disputaOrigemPrecos);
    if (!checkDisputa.valido) {
      setDisputaFeedback({
        tipo: "error",
        msg:
          checkDisputa.erros[0] ||
          "Corrija os valores de Piso Seguro e Proposta Inicial antes de salvar.",
      });
      return;
    }

    setSalvandoDisputaCertame(true);
    setDisputaFeedback(null);
    try {
      const configDisputa: DisputaConfig = {
        portal: portalDisputa,
        identificadorSala: identificadorSalaDisputa.trim() || oportunidade.numeroEdital || "",
        modoDisputaEdital,
        intervaloMinimoLances,
        origemPrecos: disputaOrigemPrecos,
        statusGeral: statusGeralDisputa,
        pausaEmergencia: pausaEmergenciaDisputa,
        tempoRespostaSegundos,
        segundosFinaisSniper,
        regrasItens: regrasDisputaItens,
        atualizadoEm: new Date().toISOString(),
      };

      const lanceMinEfetivo =
        disputaOrigemPrecos === "MANUAL"
          ? disputaTotais.pisoTotal
          : consolidadoPuroCalculadora.pisoTotalGeral;
      const valorPropEfetivo =
        disputaOrigemPrecos === "MANUAL"
          ? disputaTotais.propostaTotal
          : consolidadoCalculadora.propostaTotalGeral;

      const dadosCalculadora = {
        parametrosPadrao: parametrosPadraoCalc,
        itens: itensCalculadora,
        propostaConfig,
        cotacaoConfig: { ...configCotacao, itensSelecionados: itensSelecionadosCotacao },
        disputaConfig: configDisputa,
        ...(regrasDisputaDetectadas ? { regrasDisputaDetectadas } : {}),
        atualizadoEm: new Date().toISOString(),
      };

      const nextKanbanStatus =
        statusGeralDisputa === "EM_DISPUTA" ? "EM_DISPUTA" : oportunidade.status;

      const res = await fetch(`/api/oportunidades/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: nextKanbanStatus,
          validarDisputaEstrita: true,
          lanceMinimo: lanceMinEfetivo,
          valorProposta: valorPropEfetivo,
          calculadoraDados: dadosCalculadora,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || errJson.error || "Falha ao salvar configuração da disputa");
      }

      setOportunidade((prev) =>
        prev
          ? {
              ...prev,
              status: nextKanbanStatus,
              lanceMinimo: lanceMinEfetivo,
              valorProposta: valorPropEfetivo,
            }
          : prev,
      );
      setLanceMinimoInput(String(lanceMinEfetivo));
      setValorPropostaInput(String(valorPropEfetivo));
      setDisputaFeedback({
        tipo: "success",
        msg: "Configuração do Robô de Lances salva com sucesso para todos os itens deste certame!",
      });
      setTimeout(() => setDisputaFeedback(null), 5000);
    } catch (err: any) {
      setDisputaFeedback({
        tipo: "error",
        msg: err?.message || "Erro ao salvar configuração da disputa.",
      });
    } finally {
      setSalvandoDisputaCertame(false);
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
        objetoLicitacao: obterObjetoCertame(oportunidade, propostaConfig, itensCalculadora),
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

  // Itens Selecionados para Cotação
  const itensParaCotacao = React.useMemo<ItemPedidoCotacao[]>(() => {
    return itensCalculadora
      .filter((it, idx) => {
        const numKey = normalizarChaveItem(it.numeroItem, idx);
        const rawKey = String(it.numeroItem || idx + 1);
        const flag = itensSelecionadosCotacao[numKey] ?? itensSelecionadosCotacao[rawKey];
        return flag !== false;
      })
      .map((it, idx) => ({
        numeroItem: it.numeroItem || idx + 1,
        descricao: it.descricao,
        quantidade: it.quantidade,
        unidadeMedida: it.unidade,
        marcaSugerida: it.marcaModelo || null,
      }));
  }, [itensCalculadora, itensSelecionadosCotacao]);

  // Consulta e sincronização de todos os itens do certame (PNCP + Varredura Documental + IA)
  const handleConsultarTodosItensCertame = React.useCallback(async () => {
    if (!id) return;
    setConsultandoItensCertame(true);
    try {
      const res = await fetch(`/api/oportunidades/${id}/itens-certame?refresh=true`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (data?.error === "PLANO_INSUFICIENTE") {
          const msg = data.message || "A extração automática de itens é exclusiva dos planos Pro e Enterprise.";
          setCalculadoraFeedback({ tipo: "error", msg });
          setCotacaoFeedback({ tipo: "error", msg });
          setDisputaFeedback({ tipo: "error", msg });
        } else {
          const msg = data?.message || "Ocorreu um erro interno no sistema ao processar esta solicitação automática para esta licitação. Por favor, entre em contato com o nosso suporte técnico.";
          setCalculadoraFeedback({ tipo: "error", msg });
          setCotacaoFeedback({ tipo: "error", msg });
          setDisputaFeedback({ tipo: "error", msg });
        }
        return;
      }

      const novosItensExtraidos: ItemDisputaEdital[] = data.itens || [];
      if (novosItensExtraidos.length === 0) {
        setCotacaoFeedback({
          tipo: "error",
          msg: "Nenhum item foi encontrado nos documentos ou PNCP deste certame.",
        });
        return;
      }

      const objetoAtual = obterObjetoCertame(oportunidade, propostaConfig);
      const proximosItens = mesclarItensCertameNaCalculadora({
        prevItens: itensCalculadora,
        novosItensExtraidos,
        objetoCertame: objetoAtual,
        valorEstimadoOpp: oportunidade?.valorEstimado,
        parametrosPadrao: parametrosPadraoCalc,
      });

      const consolidadoSync = consolidarCalculadoraProposta(proximosItens, propostaConfig);
      const proximasRegras = sincronizarRegrasDisputaComCalculadora(
        consolidadoSync.itens,
        regrasDisputaItens,
        { origemPrecosDisputa: disputaOrigemPrecos },
      );
      const proximaSelecaoCotacao = normalizarMapaSelecaoCotacao(
        itensSelecionadosCotacao,
        proximosItens,
      );

      setItensCalculadora(proximosItens);
      setRegrasDisputaItens(proximasRegras);
      setItensSelecionadosCotacao(proximaSelecaoCotacao);

      const pisoSyncEfetivo =
        disputaOrigemPrecos === "MANUAL"
          ? round2(
              proximasRegras.reduce(
                (acc, r) =>
                  acc + round2((Number(r.pisoUnitarioSeguro) || 0) * (Number(r.quantidade) > 0 ? Number(r.quantidade) : 1)),
                0,
              ),
            )
          : consolidadoSync.pisoTotalGeral;
      const propostaSyncEfetiva =
        disputaOrigemPrecos === "MANUAL"
          ? round2(
              proximasRegras.reduce(
                (acc, r) =>
                  acc + round2((Number(r.propostaUnitaria) || 0) * (Number(r.quantidade) > 0 ? Number(r.quantidade) : 1)),
                0,
              ),
            )
          : consolidadoSync.propostaTotalGeral;

      let portalSync = portalDisputa;
      let modoSync = modoDisputaEdital;
      let intervaloSync = intervaloMinimoLances;
      let salaSync = identificadorSalaDisputa.trim() || oportunidade?.numeroEdital || "";

      const regrasSyncAtualizadas = data.regrasDisputaDetectadas
        ? mesclarRegrasDisputaDetectadas(
            regrasDisputaDetectadas,
            data.regrasDisputaDetectadas,
          )
        : regrasDisputaDetectadas;

      if (regrasSyncAtualizadas) {
        setRegrasDisputaDetectadas(regrasSyncAtualizadas);
        const temConfigManualSalva = Boolean(oportunidade?.calculadoraDados?.disputaConfig);
        if (!temConfigManualSalva) {
          if (
            regrasSyncAtualizadas.portal &&
            (PORTAIS_DISPUTA_OPCOES as readonly string[]).includes(regrasSyncAtualizadas.portal)
          ) {
            portalSync = regrasSyncAtualizadas.portal;
            setPortalDisputa(portalSync);
          }
          if (regrasSyncAtualizadas.modoDisputaEdital) {
            modoSync = regrasSyncAtualizadas.modoDisputaEdital;
            setModoDisputaEdital(modoSync);
          }
          if (regrasSyncAtualizadas.intervaloMinimoLances) {
            intervaloSync = regrasSyncAtualizadas.intervaloMinimoLances;
            setIntervaloMinimoLances(intervaloSync);
          }
          if (regrasSyncAtualizadas.identificadorSala || regrasSyncAtualizadas.uasg) {
            salaSync =
              regrasSyncAtualizadas.identificadorSala ||
              `UASG ${regrasSyncAtualizadas.uasg}`;
            setIdentificadorSalaDisputa(salaSync);
          }
        }
      }

      let salvoAutomaticamente = false;
      if (oportunidade) {
        const dadosCalculadoraSync = {
          parametrosPadrao: parametrosPadraoCalc,
          itens: proximosItens,
          propostaConfig,
          cotacaoConfig: { ...configCotacao, itensSelecionados: proximaSelecaoCotacao },
          disputaConfig: {
            portal: portalSync,
            identificadorSala: salaSync,
            modoDisputaEdital: modoSync,
            intervaloMinimoLances: intervaloSync,
            origemPrecos: disputaOrigemPrecos,
            statusGeral: statusGeralDisputa,
            pausaEmergencia: pausaEmergenciaDisputa,
            tempoRespostaSegundos,
            segundosFinaisSniper,
            regrasItens: proximasRegras,
            atualizadoEm: new Date().toISOString(),
          },
          ...(regrasSyncAtualizadas ? { regrasDisputaDetectadas: regrasSyncAtualizadas } : {}),
          atualizadoEm: new Date().toISOString(),
        };

        try {
          const patchRes = await fetch(`/api/oportunidades/${id}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status: oportunidade.status,
              lanceMinimo: pisoSyncEfetivo,
              valorProposta: propostaSyncEfetiva,
              calculadoraDados: dadosCalculadoraSync,
            }),
          });
          if (patchRes.ok) {
            salvoAutomaticamente = true;
            setLanceMinimoInput(String(pisoSyncEfetivo));
            setValorPropostaInput(String(propostaSyncEfetiva));
            setPropostaSalvaSnapshot(JSON.stringify({ itens: proximosItens, propostaConfig }));
          }
        } catch {
          // Estado em tela já foi atualizado mesmo que a gravação assíncrona falhe
        }
      }

      const docsCount = Array.isArray(data.documentosLidos) ? data.documentosLidos.length : 0;
      const sufixoDocs = docsCount > 0 ? ` • ${docsCount} documento(s) do edital inspecionado(s)` : "";
      const sufixoPersist = salvoAutomaticamente ? " e salvo no certame" : "";
      const msgSucesso = `${proximosItens.length} itens sincronizados${sufixoPersist} via ${data.origem}${sufixoDocs} para Cotação, Calculadora, Proposta e Robô de Lances!`;
      setCotacaoFeedback({ tipo: "success", msg: msgSucesso });
      setCalculadoraFeedback({ tipo: "success", msg: msgSucesso });
      setPropostaFeedback({ tipo: "success", msg: msgSucesso });
      setDisputaFeedback({ tipo: "success", msg: msgSucesso });
    } catch {
      const msgErro = "Falha de conexão ao sincronizar itens do certame.";
      setCotacaoFeedback({ tipo: "error", msg: msgErro });
      setCalculadoraFeedback({ tipo: "error", msg: msgErro });
      setDisputaFeedback({ tipo: "error", msg: msgErro });
    } finally {
      setConsultandoItensCertame(false);
    }
  }, [
    id,
    oportunidade,
    itensCalculadora,
    regrasDisputaItens,
    itensSelecionadosCotacao,
    parametrosPadraoCalc,
    propostaConfig,
    configCotacao,
    portalDisputa,
    identificadorSalaDisputa,
    modoDisputaEdital,
    intervaloMinimoLances,
    disputaOrigemPrecos,
    statusGeralDisputa,
    pausaEmergenciaDisputa,
    tempoRespostaSegundos,
    segundosFinaisSniper,
    regrasDisputaDetectadas,
  ]);

  const handleImprimirCotacaoLimpa = () => {
    const itensEfetivos = itensParaCotacao.length > 0 ? itensParaCotacao : itensCalculadora.map((it, idx) => ({
      numeroItem: it.numeroItem || idx + 1,
      descricao: it.descricao,
      quantidade: it.quantidade,
      unidadeMedida: it.unidade,
      marcaSugerida: it.marcaModelo || null,
    }));

    const win = window.open("", "_blank");
    if (!win) return;
    const conteudo = gerarConteudoPedidoCotacao({
      orgaoNome: oportunidade?.orgaoNome,
      numeroEdital: oportunidade?.numeroEdital,
      itens: itensEfetivos,
      configuracao: {
        ...configCotacao,
        localEntregaCidade: configCotacao.localEntregaCidade || oportunidade?.municipio || (oportunidade as any)?.cidade || empresaConfig?.cidade || "",
        localEntregaUf: configCotacao.localEntregaUf || oportunidade?.uf || empresaConfig?.uf || "",
      },
      empresa: empresaConfig,
    });
    win.document.write(conteudo.conteudoHtml);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 350);
  };

  const handleBaixarPdfTimbradoCotacao = async () => {
    setGerandoPdfCotacao(true);
    setCotacaoFeedback(null);
    try {
      const itensEfetivos = itensParaCotacao.length > 0 ? itensParaCotacao : itensCalculadora.map((it, idx) => ({
        numeroItem: it.numeroItem || idx + 1,
        descricao: it.descricao,
        quantidade: it.quantidade,
        unidadeMedida: it.unidade,
        marcaSugerida: it.marcaModelo || null,
      }));

      const res = await fetch("/api/cotacoes/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgaoNome: configCotacao.ocultarOrgaoEdital ? "Órgão Público (Sigilo Comercial Ativo)" : oportunidade?.orgaoNome,
          numeroEdital: configCotacao.ocultarOrgaoEdital ? "Edital Sob Sigilo Comercial" : oportunidade?.numeroEdital,
          itens: itensEfetivos,
          configuracao: {
            ...configCotacao,
            localEntregaCidade: configCotacao.localEntregaCidade || oportunidade?.municipio || (oportunidade as any)?.cidade || empresaConfig?.cidade || "",
            localEntregaUf: configCotacao.localEntregaUf || oportunidade?.uf || empresaConfig?.uf || "",
          },
        }),
      });

      if (!res.ok) {
        throw new Error("Falha ao gerar PDF de cotação");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Pedido_Cotacao_${configCotacao.ocultarOrgaoEdital ? "Sigilo_" : ""}${new Date().toISOString().split("T")[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setCotacaoFeedback({
        tipo: "error",
        msg: "Não foi possível gerar o PDF timbrado da cotação. Verifique a conexão com o servidor.",
      });
    } finally {
      setGerandoPdfCotacao(false);
    }
  };

  const handleCopiarWhatsAppCotacao = async () => {
    const itensEfetivos = itensParaCotacao.length > 0 ? itensParaCotacao : itensCalculadora.map((it, idx) => ({
      numeroItem: it.numeroItem || idx + 1,
      descricao: it.descricao,
      quantidade: it.quantidade,
      unidadeMedida: it.unidade,
      marcaSugerida: it.marcaModelo || null,
    }));

    const conteudo = gerarConteudoPedidoCotacao({
      orgaoNome: oportunidade?.orgaoNome,
      numeroEdital: oportunidade?.numeroEdital,
      itens: itensEfetivos,
      configuracao: {
        ...configCotacao,
        localEntregaCidade: configCotacao.localEntregaCidade || oportunidade?.municipio || (oportunidade as any)?.cidade || empresaConfig?.cidade || "",
        localEntregaUf: configCotacao.localEntregaUf || oportunidade?.uf || empresaConfig?.uf || "",
      },
      empresa: empresaConfig,
    });

    try {
      await navigator.clipboard.writeText(conteudo.whatsappTexto);
      setCopiadoCotacao(true);
      setTimeout(() => setCopiadoCotacao(false), 2500);
    } catch {
      // fallback
    }
  };

  const handleBaixarHtmlCotacao = () => {
    const itensEfetivos = itensParaCotacao.length > 0 ? itensParaCotacao : itensCalculadora.map((it, idx) => ({
      numeroItem: it.numeroItem || idx + 1,
      descricao: it.descricao,
      quantidade: it.quantidade,
      unidadeMedida: it.unidade,
      marcaSugerida: it.marcaModelo || null,
    }));

    const conteudo = gerarConteudoPedidoCotacao({
      orgaoNome: oportunidade?.orgaoNome,
      numeroEdital: oportunidade?.numeroEdital,
      itens: itensEfetivos,
      configuracao: {
        ...configCotacao,
        localEntregaCidade: configCotacao.localEntregaCidade || oportunidade?.municipio || (oportunidade as any)?.cidade || empresaConfig?.cidade || "",
        localEntregaUf: configCotacao.localEntregaUf || oportunidade?.uf || empresaConfig?.uf || "",
      },
      empresa: empresaConfig,
    });

    const blob = new Blob([conteudo.conteudoHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Pedido_Cotacao_${new Date().toISOString().split("T")[0]}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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
      const numHomologado = parseDecimalFlexivel(valorHomologarInput) ?? undefined;
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
      const numProposta = parseDecimalFlexivel(valorPropostaInput) ?? undefined;
      const numMinimo = parseDecimalFlexivel(lanceMinimoInput) ?? undefined;
      const numHomologado = parseDecimalFlexivel(valorHomologadoTabInput) ?? undefined;

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

  const sedeUf = String(empresaConfig?.uf || "").trim().toUpperCase();
  const sedeCidade = String(empresaConfig?.cidade || "").trim();
  const certameMesmaUfSede = Boolean(sedeUf && oportunidade.uf && sedeUf === oportunidade.uf.toUpperCase());
  const localSedeRotulo = sedeCidade && sedeUf ? `${sedeCidade}/${sedeUf}` : sedeCidade || sedeUf || "";
  const localCertameRotulo =
    oportunidade.municipio && oportunidade.uf
      ? `${oportunidade.municipio}/${oportunidade.uf}`
      : oportunidade.municipio || oportunidade.uf || "local do órgão";

  const parecerIATagType =
    oportunidade.parecerIA === "GO"
      ? "green"
      : oportunidade.parecerIA === "AVALIAR"
      ? "warm-gray"
      : "red";

  const repositorios = oportunidade.repositoriosSimilares || [];
  const arquivos = oportunidade.arquivos || [];
  const analises = oportunidade.analisesIA || [];
  const analisesValidasCount = analises.filter((a) => a.status !== "ERRO").length;

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
              {oportunidade.orgaoNome} — {resolverTituloExibicaoLicitacao(oportunidade.miniResumo, oportunidade.objeto || oportunidade.resumo, oportunidade.tipoSistemaCodigo)}
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
                onClick={() => (analisesValidasCount > 0 ? setConfirmarReanaliseIAOpen(true) : setModalIAOpen(true))}
                data-testid="btn-open-verificar-participacao"
                style={{ border: "1px solid var(--cds-border-strong)", color: "var(--cds-text-primary)" }}
              >
                🤖 Verificar Status de Participação ({cotaIA ? `${cotaIA.usadas}/${cotaIA.limite}` : "..."})
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
                onClick={() => (analisesValidasCount > 0 ? setConfirmarReanaliseIAOpen(true) : setModalIAOpen(true))}
                data-testid="btn-open-verificar-participacao"
                style={{ border: "1px solid var(--cds-border-strong)", color: "var(--cds-text-primary)" }}
              >
                🤖 Verificar Status de Participação ({cotaIA ? `${cotaIA.usadas}/${cotaIA.limite}` : "..."})
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
          <Tab data-testid="tab-pedido-cotacao">
            📦 Pedido de Cotação
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
                    {localSedeRotulo ? (
                      <>
                        Sessão presencial em <strong>{localCertameRotulo}</strong> com origem na sede{" "}
                        <strong>{localSedeRotulo}</strong>
                        {certameMesmaUfSede
                          ? " (Mesma UF da empresa — avaliar deslocamento local)."
                          : " (Necessário provisionar custos de transporte, deslocamento e diárias para entrega de envelopes e lances presenciais)."}
                      </>
                    ) : (
                      <>
                        Sessão presencial em <strong>{localCertameRotulo}</strong>. Configure a cidade/UF da sede em Configurações para estimar logística; necessário provisionar custos de deslocamento para entrega de envelopes e lances presenciais.
                      </>
                    )}
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
                  onClick={() => (analisesValidasCount > 0 ? setConfirmarReanaliseIAOpen(true) : setModalIAOpen(true))}
                  data-testid="btn-executar-analise-ia"
                >
                  Executar Nova Análise com IA ({cotaIA ? `${cotaIA.usadas}/${cotaIA.limite}` : "..."})
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
                              kind="tertiary"
                              size="sm"
                              renderIcon={Renew}
                              onClick={() => handleConsultarTodosItensCertame()}
                              disabled={consultandoItensCertame}
                              data-testid={`btn-sincronizar-itens-${an.id}`}
                            >
                              {consultandoItensCertame
                                ? "Sincronizando..."
                                : "📥 Sincronizar Itens com Cotação, Calculadora e Robô"}
                            </Button>
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
                                <div style={{ fontWeight: 600 }}>
                                  ⚠ {r.habilitacao.certidoesVencidasOuPendentes.length} pendência(s) encontrada(s):
                                </div>
                                <ul style={{ margin: "0.25rem 0 0 0", paddingLeft: "1rem", color: "var(--cds-text-secondary)", lineHeight: 1.35 }}>
                                  {r.habilitacao.certidoesVencidasOuPendentes.slice(0, 6).map((p: string, idxP: number) => (
                                    <li key={idxP}>{p}</li>
                                  ))}
                                  {r.habilitacao.certidoesVencidasOuPendentes.length > 6 && (
                                    <li>... e mais {r.habilitacao.certidoesVencidasOuPendentes.length - 6} pendência(s) no relatório PDF.</li>
                                  )}
                                </ul>
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

                        {r.regrasDisputa &&
                          (r.regrasDisputa.portal ||
                            r.regrasDisputa.modoDisputaEdital ||
                            r.regrasDisputa.intervaloMinimoLances ||
                            r.regrasDisputa.criterioJulgamento) && (
                            <div
                              style={{
                                marginBottom: "1rem",
                                padding: "0.75rem 1rem",
                                backgroundColor: "var(--cds-layer-02)",
                                borderLeft: "4px solid var(--cds-support-info)",
                                borderRadius: "4px",
                                display: "flex",
                                flexWrap: "wrap",
                                gap: "0.75rem",
                                alignItems: "center",
                              }}
                            >
                              <strong style={{ fontSize: "0.8125rem", color: "var(--cds-text-primary)" }}>
                                ⚡ Regras de Disputa Extraídas:
                              </strong>
                              {r.regrasDisputa.portal && (
                                <Tag type="cool-gray" size="sm">Portal: {r.regrasDisputa.portal}</Tag>
                              )}
                              {r.regrasDisputa.modoDisputaEdital && (
                                <Tag type="cyan" size="sm">Modo: {r.regrasDisputa.modoDisputaEdital}</Tag>
                              )}
                              {r.regrasDisputa.intervaloMinimoLances && (
                                <Tag type="teal" size="sm">Intervalo: {r.regrasDisputa.intervaloMinimoLances}</Tag>
                              )}
                              {r.regrasDisputa.criterioJulgamento && (
                                <Tag type="purple" size="sm">{r.regrasDisputa.criterioJulgamento}</Tag>
                              )}
                              {r.regrasDisputa.uasg && (
                                <Tag type="outline" size="sm">UASG {r.regrasDisputa.uasg}</Tag>
                              )}
                            </div>
                          )}

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

          {/* Aba 5: Pedido de Cotação de Preços (RFQ para Fornecedores) */}
          <TabPanel>
            <Tile style={{ padding: "1.5rem", marginTop: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem", marginBottom: "1.25rem" }}>
                <div>
                  <h4 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.25rem", color: "var(--cds-text-primary)" }}>
                    📦 Pedido de Cotação de Preços (RFQ para Fornecedores)
                  </h4>
                  <p style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)" }}>
                    Solicite propostas comerciais formais a distribuidores e indústrias com sigilo comercial inteligente, frete CIF por destino e exportação imediata para PDF e WhatsApp.
                  </p>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <Button
                    size="sm"
                    kind="secondary"
                    renderIcon={Renew}
                    onClick={() => handleConsultarTodosItensCertame()}
                    disabled={consultandoItensCertame}
                    data-testid="btn-consultar-itens-cotacao"
                  >
                    {consultandoItensCertame ? "Lendo documentos..." : "🔍 Consultar Todos os Itens do Certame"}
                  </Button>
                  <Button
                    size="sm"
                    kind="tertiary"
                    renderIcon={Add}
                    onClick={handleAdicionarItemCalc}
                    data-testid="btn-adicionar-item-cotacao"
                  >
                    + Adicionar Item
                  </Button>
                  <Button
                    size="sm"
                    kind="tertiary"
                    renderIcon={Save}
                    disabled={salvandoCotacao}
                    onClick={handleSalvarPedidoCotacao}
                    data-testid="btn-salvar-pedido-cotacao"
                  >
                    {salvandoCotacao ? "Salvando..." : "Salvar Pedido de Cotação"}
                  </Button>
                  <Button
                    size="sm"
                    kind="primary"
                    renderIcon={DocumentPdf}
                    onClick={() => setModalVisualizarCotacaoAberto(true)}
                    disabled={itensCalculadora.length === 0}
                    data-testid="btn-visualizar-cotacao"
                  >
                    Visualizar Pedido de Cotação (A4 / PDF)
                  </Button>
                </div>
              </div>

              {cotacaoFeedback && (
                <InlineNotification
                  kind={cotacaoFeedback.tipo}
                  title={cotacaoFeedback.tipo === "success" ? "Sucesso:" : "Atenção:"}
                  subtitle={cotacaoFeedback.msg}
                  style={{ marginBottom: "1.25rem" }}
                  onClose={() => setCotacaoFeedback(null)}
                />
              )}

              {/* Barra de Parâmetros da Cotação & Sigilo Comercial */}
              <Tile style={{ padding: "1.25rem", backgroundColor: "var(--cds-layer-accent, #f4f4f4)", marginBottom: "1.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "1rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Settings size={18} />
                    <strong style={{ fontSize: "0.95rem" }}>Parâmetros da Solicitação de Cotação</strong>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", backgroundColor: "var(--cds-layer-01, #fff)", padding: "0.5rem 0.75rem", borderRadius: "4px", border: "1px solid var(--cds-border-subtle, #e0e0e0)" }}>
                    <Toggle
                      id="toggle-sigilo-comercial"
                      size="sm"
                      labelText="🔒 Sigilo Comercial (Ocultar Órgão e Edital no PDF)"
                      labelA="Exibir"
                      labelB="Ocultar"
                      toggled={configCotacao.ocultarOrgaoEdital}
                      onToggle={(checked) => setConfigCotacao((prev) => ({ ...prev, ocultarOrgaoEdital: checked }))}
                    />
                    <span
                      data-testid="sigilo-comercial-status-texto"
                      style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", maxWidth: "300px" }}
                    >
                      {configCotacao.ocultarOrgaoEdital
                        ? "🔒 Sigilo ATIVO: órgão e edital não aparecem no PDF/WhatsApp/HTML (apenas Cidade/UF para frete CIF)."
                        : "👁️ Sigilo DESATIVADO: órgão e edital serão exibidos como referência nos documentos."}
                    </span>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
                  <div>
                    <TextInput
                      id="input-cotacao-fornecedor-nome"
                      labelText="Fornecedor / Distribuidor / Fábrica"
                      placeholder="Ex: Distribuidora Nacional de Tecnologia Ltda"
                      value={configCotacao.fornecedorNome || ""}
                      onChange={(e) => setConfigCotacao((prev) => ({ ...prev, fornecedorNome: e.target.value }))}
                    />
                  </div>
                  <div>
                    <TextInput
                      id="input-cotacao-contato-nome"
                      labelText="Nome do Vendedor / Representante"
                      placeholder="Ex: Carlos Oliveira (Gerente Comercial)"
                      value={configCotacao.contatoFornecedor || ""}
                      onChange={(e) => setConfigCotacao((prev) => ({ ...prev, contatoFornecedor: e.target.value }))}
                    />
                  </div>
                  <div>
                    <TextInput
                      id="input-cotacao-email"
                      labelText="E-mail de Contato"
                      placeholder="Ex: comercial@distribuidora.com.br"
                      value={configCotacao.emailFornecedor || ""}
                      onChange={(e) => setConfigCotacao((prev) => ({ ...prev, emailFornecedor: e.target.value }))}
                    />
                  </div>
                  <div>
                    <TextInput
                      id="input-cotacao-telefone"
                      labelText="Telefone / WhatsApp"
                      placeholder="Ex: (11) 98765-4321"
                      value={configCotacao.telefoneFornecedor || ""}
                      onChange={(e) => setConfigCotacao((prev) => ({ ...prev, telefoneFornecedor: e.target.value }))}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
                  <div>
                    <Select
                      id="select-cotacao-frete"
                      labelText="Modalidade de Frete Requerida"
                      value={configCotacao.modalidadeFrete || "CIF"}
                      onChange={(e) => setConfigCotacao((prev) => ({ ...prev, modalidadeFrete: e.target.value as any }))}
                    >
                      <SelectItem value="CIF" text="CIF (Frete e Seguro Inclusos até o Destino)" />
                      <SelectItem value="FOB" text="FOB (Retirada por conta da nossa empresa)" />
                    </Select>
                  </div>
                  <div>
                    <TextInput
                      id="input-cotacao-cidade-entrega"
                      labelText="Cidade de Entrega (Destino)"
                      placeholder="Ex: Cidade de entrega"
                      value={configCotacao.localEntregaCidade || oportunidade?.municipio || (oportunidade as any)?.cidade || empresaConfig?.cidade || ""}
                      onChange={(e) => setConfigCotacao((prev) => ({ ...prev, localEntregaCidade: e.target.value }))}
                    />
                  </div>
                  <div>
                    <TextInput
                      id="input-cotacao-uf-entrega"
                      labelText="UF de Entrega"
                      placeholder="Ex: UF"
                      value={configCotacao.localEntregaUf || oportunidade?.uf || empresaConfig?.uf || ""}
                      onChange={(e) => setConfigCotacao((prev) => ({ ...prev, localEntregaUf: e.target.value }))}
                    />
                  </div>
                  <div>
                    <TextInput
                      id="input-cotacao-prazo-resposta"
                      labelText="Prazo para Retorno da Cotação"
                      placeholder="Ex: Até 3 dias úteis"
                      value={configCotacao.prazoResposta || ""}
                      onChange={(e) => setConfigCotacao((prev) => ({ ...prev, prazoResposta: e.target.value }))}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
                  <div>
                    <TextInput
                      id="input-cotacao-cond-pagto"
                      labelText="Condições de Pagamento Desejadas"
                      placeholder="Ex: 28 DDL faturado ou conforme empenho"
                      value={configCotacao.condicoesPagamento || ""}
                      onChange={(e) => setConfigCotacao((prev) => ({ ...prev, condicoesPagamento: e.target.value }))}
                    />
                  </div>
                  <div>
                    <TextInput
                      id="input-cotacao-obs"
                      labelText="Observações / Exigências Técnicas Especiais"
                      placeholder="Ex: Enviar ficha técnica ou comprovação de garantia"
                      value={configCotacao.observacoes || ""}
                      onChange={(e) => setConfigCotacao((prev) => ({ ...prev, observacoes: e.target.value }))}
                    />
                  </div>
                </div>
              </Tile>

              {/* Tabela de Itens para Cotação */}
              {itensCalculadora.length === 0 ? (
                <Tile style={{ padding: "2rem", textAlign: "center", backgroundColor: "var(--cds-layer-01)" }}>
                  <p style={{ color: "var(--cds-text-secondary)", marginBottom: "1rem" }}>
                    Nenhum item adicionado ainda para solicitar cotação.
                  </p>
                  <div style={{ display: "flex", justifyContent: "center", gap: "1rem", flexWrap: "wrap" }}>
                    <Button
                      kind="secondary"
                      renderIcon={Renew}
                      onClick={() => handleConsultarTodosItensCertame()}
                      disabled={consultandoItensCertame}
                    >
                      {consultandoItensCertame ? "Lendo documentos..." : "🔍 Consultar Todos os Itens do Certame"}
                    </Button>
                    <Button
                      kind="primary"
                      renderIcon={Add}
                      onClick={handleAdicionarItemCalc}
                    >
                      + Adicionar Item Manual
                    </Button>
                  </div>
                </Tile>
              ) : (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
                    <strong style={{ fontSize: "0.9rem" }}>
                      Itens Selecionados para Cotação: ({itensParaCotacao.length} de {itensCalculadora.length})
                    </strong>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <Button
                        size="sm"
                        kind="ghost"
                        onClick={() => {
                          const todos: Record<string, boolean> = {};
                          itensCalculadora.forEach((it, idx) => {
                            todos[normalizarChaveItem(it.numeroItem, idx)] = true;
                            todos[String(it.numeroItem || idx + 1)] = true;
                          });
                          setItensSelecionadosCotacao(todos);
                        }}
                      >
                        Selecionar Todos
                      </Button>
                      <Button
                        size="sm"
                        kind="ghost"
                        onClick={() => {
                          const nenhum: Record<string, boolean> = {};
                          itensCalculadora.forEach((it, idx) => {
                            nenhum[normalizarChaveItem(it.numeroItem, idx)] = false;
                            nenhum[String(it.numeroItem || idx + 1)] = false;
                          });
                          setItensSelecionadosCotacao(nenhum);
                        }}
                      >
                        Desmarcar Todos
                      </Button>
                    </div>
                  </div>

                  <TableContainer style={{ backgroundColor: "var(--cds-layer-01)" }}>
                    <Table size="md" aria-label="Tabela de Itens para Cotação">
                      <TableHead>
                        <TableRow>
                          <TableHeader style={{ width: "40px" }}>Incluir</TableHeader>
                          <TableHeader style={{ width: "80px" }}>Item</TableHeader>
                          <TableHeader>Descrição do Produto / Especificação</TableHeader>
                          <TableHeader style={{ width: "180px" }}>Marca Sugerida</TableHeader>
                          <TableHeader style={{ width: "110px", textAlign: "right" }}>Quantidade</TableHeader>
                          <TableHeader style={{ width: "95px" }}>Unidade</TableHeader>
                          <TableHeader style={{ width: "80px", textAlign: "center" }}>Ação</TableHeader>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {itensCalculadora.map((it, idx) => {
                          const numKey = normalizarChaveItem(it.numeroItem, idx);
                          const selecionado =
                            itensSelecionadosCotacao[numKey] !== false &&
                            itensSelecionadosCotacao[String(it.numeroItem || idx + 1)] !== false;
                          const unidadeNorm = String(it.unidade || "UN").trim().toUpperCase();
                          const temUnidadeNaLista = (UNIDADES_ITEM_OPCOES as readonly string[]).includes(unidadeNorm);
                          return (
                            <TableRow key={it.id || idx}>
                              <TableCell>
                                <Checkbox
                                  id={`chk-cotacao-${it.id || idx}`}
                                  labelText=""
                                  checked={selecionado}
                                  onChange={(_, { checked }) => {
                                    const rawKey = String(it.numeroItem || idx + 1);
                                    setItensSelecionadosCotacao((prev) => ({
                                      ...prev,
                                      [numKey]: checked,
                                      [rawKey]: checked,
                                    }));
                                  }}
                                />
                              </TableCell>
                              <TableCell style={{ fontWeight: 600 }}>{it.numeroItem || idx + 1}</TableCell>
                              <TableCell>
                                <TextInput
                                  id={`cotacao-desc-${it.id}`}
                                  labelText=""
                                  hideLabel
                                  value={it.descricao}
                                  onChange={(e) => handleAtualizarItemCalc(idx, { descricao: e.target.value })}
                                />
                              </TableCell>
                              <TableCell>
                                <TextInput
                                  id={`cotacao-marca-${it.id}`}
                                  labelText=""
                                  hideLabel
                                  placeholder="Ex: Dell / HP"
                                  value={it.marcaModelo || ""}
                                  onChange={(e) => handleAtualizarItemCalc(idx, { marcaModelo: e.target.value })}
                                />
                              </TableCell>
                              <TableCell style={{ textAlign: "right" }}>
                                <TextInput
                                  id={`cotacao-qtd-${it.id}`}
                                  labelText=""
                                  hideLabel
                                  type="number"
                                  value={it.quantidade}
                                  onChange={(e) => handleAtualizarItemCalc(idx, { quantidade: Number(e.target.value) || 1 })}
                                />
                              </TableCell>
                              <TableCell>
                                <Select
                                  id={`cotacao-un-${it.id}`}
                                  labelText=""
                                  hideLabel
                                  value={unidadeNorm}
                                  onChange={(e) => handleAtualizarItemCalc(idx, { unidade: e.target.value })}
                                >
                                  {!temUnidadeNaLista && unidadeNorm && (
                                    <SelectItem key={unidadeNorm} value={unidadeNorm} text={unidadeNorm} />
                                  )}
                                  {UNIDADES_ITEM_OPCOES.map((u) => (
                                    <SelectItem key={u} value={u} text={u} />
                                  ))}
                                </Select>
                              </TableCell>
                              <TableCell style={{ textAlign: "center" }}>
                                <Button
                                  hasIconOnly
                                  renderIcon={TrashCan}
                                  iconDescription="Remover Item"
                                  kind="ghost"
                                  size="sm"
                                  onClick={() => handleRemoverItemCalc(idx)}
                                />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </div>
              )}
            </Tile>
          </TabPanel>

          {/* Aba 6: Calculadora de Custos, BDI & Piso Seguro */}
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
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <Button
                      size="sm"
                      kind="secondary"
                      renderIcon={Renew}
                      onClick={() => handleConsultarTodosItensCertame()}
                      disabled={consultandoItensCertame}
                      data-testid="btn-consultar-itens-certame-calc"
                    >
                      {consultandoItensCertame ? "Lendo documentos..." : "🔍 Consultar Todos os Itens do Certame"}
                    </Button>
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
                  <NumericCalcInput
                    id="param-impostos"
                    labelText={
                      <CampoComHoverTooltip tooltipText={CALCULADORA_TOOLTIPS.impostosPercentual} testId="tooltip-param-impostos">
                        Impostos s/ Fat. (%)
                      </CampoComHoverTooltip>
                    }
                    value={parametrosPadraoCalc.impostosPercentual}
                    max={80}
                    onChangeValue={(v) =>
                      setParametrosPadraoCalc({
                        ...parametrosPadraoCalc,
                        impostosPercentual: v ?? 0,
                      })
                    }
                  />

                  <NumericCalcInput
                    id="param-bdi"
                    labelText={
                      <CampoComHoverTooltip tooltipText={CALCULADORA_TOOLTIPS.bdiPercentual} testId="tooltip-param-bdi">
                        BDI / Desp. Indiretas (%)
                      </CampoComHoverTooltip>
                    }
                    value={parametrosPadraoCalc.bdiPercentual}
                    max={100}
                    onChangeValue={(v) =>
                      setParametrosPadraoCalc({
                        ...parametrosPadraoCalc,
                        bdiPercentual: v ?? 0,
                      })
                    }
                  />

                  <NumericCalcInput
                    id="param-margem-min"
                    labelText={
                      <CampoComHoverTooltip tooltipText={CALCULADORA_TOOLTIPS.margemMinimaPercentual} testId="tooltip-param-mmin">
                        Margem Mínima Piso (%)
                      </CampoComHoverTooltip>
                    }
                    value={parametrosPadraoCalc.margemMinimaPercentual}
                    max={80}
                    onChangeValue={(v) =>
                      setParametrosPadraoCalc({
                        ...parametrosPadraoCalc,
                        margemMinimaPercentual: v ?? 0,
                      })
                    }
                  />

                  <NumericCalcInput
                    id="param-margem-alvo"
                    labelText={
                      <CampoComHoverTooltip tooltipText={CALCULADORA_TOOLTIPS.margemAlvoPercentual} testId="tooltip-param-malvo">
                        Margem Alvo Proposta (%)
                      </CampoComHoverTooltip>
                    }
                    value={parametrosPadraoCalc.margemAlvoPercentual}
                    max={90}
                    onChangeValue={(v) =>
                      setParametrosPadraoCalc({
                        ...parametrosPadraoCalc,
                        margemAlvoPercentual: v ?? 0,
                      })
                    }
                  />
                </div>

                {aliquotasPadraoDivergemDosItens && (
                  <div style={{ marginTop: "0.65rem", fontSize: "0.75rem", color: "var(--cds-support-info, #0043ce)" }}>
                    ℹ️ Para aplicar estas alíquotas padrão aos itens já listados abaixo, clique em <strong>&quot;Aplicar % a Todos os Itens&quot;</strong>.
                  </div>
                )}
              </Tile>

              {/* Lista Interativa de Itens */}
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1.5rem" }}>
                {consolidadoPuroCalculadora.itens.map((it, idx) => (
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
                          disabled={consolidadoPuroCalculadora.itens.length <= 1}
                          onClick={() => handleRemoverItemCalc(idx)}
                        />
                      </div>
                    </div>

                    {/* Campos de Entrada do Item */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.75rem", marginBottom: "0.75rem" }}>
                      <div style={{ minWidth: "100px" }}>
                        <TextInput
                          id={`item-num-${idx}`}
                          labelText={
                            <CampoComHoverTooltip tooltipText={CALCULADORA_TOOLTIPS.numeroItem}>
                              Nº Item/Lote
                            </CampoComHoverTooltip>
                          }
                          value={it.numeroItem}
                          onChange={(e) => handleAtualizarItemCalc(idx, { numeroItem: e.target.value })}
                        />
                      </div>
                      <div style={{ gridColumn: "span 2", minWidth: "260px" }}>
                        <TextInput
                          id={`item-desc-${idx}`}
                          labelText={
                            <CampoComHoverTooltip tooltipText={CALCULADORA_TOOLTIPS.descricao}>
                              Descrição / Especificação do Item
                            </CampoComHoverTooltip>
                          }
                          placeholder="Ex: Fornecimento de Notebook Corporativo i7..."
                          value={it.descricao}
                          onChange={(e) => handleAtualizarItemCalc(idx, { descricao: e.target.value })}
                        />
                      </div>
                      <TextInput
                        id={`item-marca-${idx}`}
                        labelText={
                          <CampoComHoverTooltip tooltipText={CALCULADORA_TOOLTIPS.marcaModelo}>
                            Marca / Modelo (Opcional)
                          </CampoComHoverTooltip>
                        }
                        placeholder="Ex: Dell Latitude 3440"
                        value={it.marcaModelo || ""}
                        onChange={(e) => handleAtualizarItemCalc(idx, { marcaModelo: e.target.value })}
                      />
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))", gap: "0.75rem", marginBottom: "0.75rem" }}>
                      <Select
                        id={`item-unid-${idx}`}
                        labelText={
                          <CampoComHoverTooltip tooltipText={CALCULADORA_TOOLTIPS.unidade}>
                            Unidade
                          </CampoComHoverTooltip> as any
                        }
                        value={String(it.unidade || "UN").trim().toUpperCase()}
                        onChange={(e) => handleAtualizarItemCalc(idx, { unidade: e.target.value })}
                      >
                        {!(UNIDADES_ITEM_OPCOES as readonly string[]).includes(
                          String(it.unidade || "UN").trim().toUpperCase(),
                        ) &&
                          it.unidade && (
                            <SelectItem
                              key={String(it.unidade).trim().toUpperCase()}
                              value={String(it.unidade).trim().toUpperCase()}
                              text={String(it.unidade).trim().toUpperCase()}
                            />
                          )}
                        {UNIDADES_ITEM_OPCOES.map((u) => (
                          <SelectItem key={u} value={u} text={u} />
                        ))}
                      </Select>

                      <NumericCalcInput
                        id={`item-qtd-${idx}`}
                        labelText={
                          <CampoComHoverTooltip tooltipText={CALCULADORA_TOOLTIPS.quantidade}>
                            Quantidade
                          </CampoComHoverTooltip>
                        }
                        value={it.quantidade}
                        min={1}
                        onChangeValue={(v) => handleAtualizarItemCalc(idx, { quantidade: Math.max(1, v ?? 1) })}
                      />

                      <NumericCalcInput
                        id={`item-vest-${idx}`}
                        labelText={
                          <CampoComHoverTooltip tooltipText={CALCULADORA_TOOLTIPS.valorEstimadoUnitario}>
                            Vlr. Estimado Edital (R$)
                          </CampoComHoverTooltip>
                        }
                        placeholder="Opcional"
                        allowEmpty
                        value={it.valorEstimadoUnitario}
                        onChangeValue={(v) => handleAtualizarItemCalc(idx, { valorEstimadoUnitario: v })}
                      />

                      <NumericCalcInput
                        id={`item-custo-${idx}`}
                        labelText={
                          <CampoComHoverTooltip tooltipText={CALCULADORA_TOOLTIPS.custoUnitario}>
                            Custo Direto Unit. (R$)
                          </CampoComHoverTooltip>
                        }
                        value={it.custoUnitario}
                        onChangeValue={(v) => handleAtualizarItemCalc(idx, { custoUnitario: v ?? 0 })}
                      />

                      <NumericCalcInput
                        id={`item-frete-${idx}`}
                        labelText={
                          <CampoComHoverTooltip tooltipText={CALCULADORA_TOOLTIPS.freteUnitario}>
                            Frete Unit. (R$)
                          </CampoComHoverTooltip>
                        }
                        value={it.freteUnitario}
                        onChangeValue={(v) => handleAtualizarItemCalc(idx, { freteUnitario: v ?? 0 })}
                      />

                      <NumericCalcInput
                        id={`item-outros-${idx}`}
                        labelText={
                          <CampoComHoverTooltip tooltipText={CALCULADORA_TOOLTIPS.outrosCustosUnitario}>
                            Outros Custos (R$)
                          </CampoComHoverTooltip>
                        }
                        value={it.outrosCustosUnitario}
                        onChangeValue={(v) => handleAtualizarItemCalc(idx, { outrosCustosUnitario: v ?? 0 })}
                      />
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.75rem", marginBottom: "0.75rem" }}>
                      <NumericCalcInput
                        id={`item-imp-${idx}`}
                        labelText={
                          <CampoComHoverTooltip tooltipText={CALCULADORA_TOOLTIPS.impostosPercentual}>
                            Impostos (%)
                          </CampoComHoverTooltip>
                        }
                        value={it.impostosPercentual}
                        max={80}
                        onChangeValue={(v) => handleAtualizarItemCalc(idx, { impostosPercentual: v ?? 0 })}
                      />

                      <NumericCalcInput
                        id={`item-bdi-${idx}`}
                        labelText={
                          <CampoComHoverTooltip tooltipText={CALCULADORA_TOOLTIPS.bdiPercentual} testId={`tooltip-item-bdi-${idx}`}>
                            BDI / Desp. Indiretas (%)
                          </CampoComHoverTooltip>
                        }
                        value={it.bdiPercentual}
                        max={100}
                        onChangeValue={(v) => handleAtualizarItemCalc(idx, { bdiPercentual: v ?? 0 })}
                      />

                      <NumericCalcInput
                        id={`item-mmin-${idx}`}
                        labelText={
                          <CampoComHoverTooltip tooltipText={CALCULADORA_TOOLTIPS.margemMinimaPercentual}>
                            Margem Mín. (%)
                          </CampoComHoverTooltip>
                        }
                        value={it.margemMinimaPercentual}
                        max={80}
                        onChangeValue={(v) => handleAtualizarItemCalc(idx, { margemMinimaPercentual: v ?? 0 })}
                      />

                      <NumericCalcInput
                        id={`item-malvo-${idx}`}
                        labelText={
                          <CampoComHoverTooltip tooltipText={CALCULADORA_TOOLTIPS.margemAlvoPercentual}>
                            Margem Alvo (%)
                          </CampoComHoverTooltip>
                        }
                        value={it.margemAlvoPercentual}
                        max={90}
                        onChangeValue={(v) => handleAtualizarItemCalc(idx, { margemAlvoPercentual: v ?? 0 })}
                      />
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

                      {it.motivoAlerta ? (
                        <div
                          data-testid={`alerta-calc-item-${idx}`}
                          style={{ fontSize: "0.75rem", color: "var(--cds-support-warning, #b28600)" }}
                        >
                          ⚠️ {it.motivoAlerta}
                        </div>
                      ) : it.notaInformativa ? (
                        <div
                          data-testid={`nota-info-calc-item-${idx}`}
                          style={{ fontSize: "0.75rem", color: "var(--cds-support-info, #0043ce)" }}
                        >
                          ℹ️ {it.notaInformativa}
                        </div>
                      ) : null}
                    </div>
                  </Tile>
                ))}
              </div>

              {/* Resumo Consolidado Global da Licitação */}
              <div style={{ marginBottom: "1.5rem" }}>
                <h5 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}>
                  📊 Resumo Financeiro Consolidado da Licitação ({consolidadoPuroCalculadora.totalItens} {consolidadoPuroCalculadora.totalItens === 1 ? "item" : "itens"})
                </h5>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem" }}>
                  <div>
                    <Tile style={{ padding: "1rem", borderLeft: "4px solid var(--cds-border-strong, #8d8d8d)" }}>
                      <div style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)" }}>Custo Direto Total dos Itens</div>
                      <div style={{ fontSize: "1.5rem", fontWeight: 700, marginTop: "0.25rem" }}>
                        {formatarMoedaBrl(consolidadoPuroCalculadora.custoTotalGeral)}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginTop: "0.25rem" }}>
                        Com BDI/Indiretos: {formatarMoedaBrl(consolidadoPuroCalculadora.custoComBdiTotalGeral)}
                      </div>
                    </Tile>
                  </div>

                  <div>
                    <Tile style={{ padding: "1rem", borderLeft: "4px solid var(--cds-support-success, #24a148)" }}>
                      <div style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)" }}>Piso Seguro Global (Trava do Robô)</div>
                      <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--cds-support-success, #24a148)", marginTop: "0.25rem" }}>
                        {formatarMoedaBrl(consolidadoPuroCalculadora.pisoTotalGeral)}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginTop: "0.25rem" }}>
                        Lucro Líq. no Piso: {formatarMoedaBrl(consolidadoPuroCalculadora.lucroLiquidoEstimadoPiso)}
                      </div>
                    </Tile>
                  </div>

                  <div>
                    <Tile style={{ padding: "1rem", borderLeft: "4px solid var(--cds-interactive, #0f62fe)" }}>
                      <div style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)" }}>Valor Total da Proposta Inicial</div>
                      <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--cds-text-primary)", marginTop: "0.25rem" }}>
                        {formatarMoedaBrl(consolidadoPuroCalculadora.propostaTotalGeral)}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--cds-support-info, #0043ce)", marginTop: "0.25rem" }}>
                        Lucro Líquido: {formatarMoedaBrl(consolidadoPuroCalculadora.lucroLiquidoEstimadoProposta)} ({consolidadoPuroCalculadora.margemMediaLiquida}%)
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
                  onClick={() => setActiveTab(6)}
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

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1.25rem", marginBottom: "1rem" }}>
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
                              ? obterObjetoCertame(oportunidade, null, itensCalculadora)
                              : prev.descricaoGlobal,
                        }));
                      }}
                    >
                      <SelectItem
                        value="ITENS_CALCULADORA"
                        text={`Planilha Detalhada de Itens (${consolidadoCalculadora.totalItens} itens)`}
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
                        text="Proposta Inicial de Abertura (Valores de abertura)"
                      />
                      <SelectItem
                        value="PROPOSTA_READEQUADA"
                        text="Proposta Readequada ao Lance Vencedor (Valores arrematados/piso)"
                      />
                    </Select>
                  </div>

                  <div>
                    <Select
                      id="select-origem-valores-proposta"
                      labelText="Origem dos Preços (Proposta Inicial)"
                      disabled={propostaConfig.tipoTabelaProposta === "PROPOSTA_READEQUADA"}
                      value={propostaConfig.origemValoresProposta || "CALCULADORA"}
                      onChange={(e) =>
                        handleAlternarOrigemProposta(e.target.value as "CALCULADORA" | "MANUAL")
                      }
                    >
                      <SelectItem
                        value="CALCULADORA"
                        text="Usar Calculadora (Cálculo automático)"
                      />
                      <SelectItem
                        value="MANUAL"
                        text="Definir Manualmente (Editar em R$ livremente)"
                      />
                    </Select>
                  </div>
                </div>

                {/* Objeto Oficial do Certame na Proposta Comercial (Sempre Visível e Editável) */}
                <div style={{ marginTop: "0.25rem", marginBottom: "1rem" }}>
                  <TextArea
                    id="textarea-objeto-proposta-geral"
                    data-testid="textarea-objeto-proposta-geral"
                    labelText="Descrição do Objeto da Licitação (Impresso no cabeçalho da Proposta e Anexo I)"
                    helperText="Carregado automaticamente dos dados do edital ou do 1º item calculado. Edite livremente para constar exatamente como exige o edital."
                    rows={2}
                    value={propostaConfig.descricaoGlobal || obterObjetoCertame(oportunidade, null, itensCalculadora)}
                    onChange={(e) =>
                      setPropostaConfig((prev) => ({
                        ...prev,
                        descricaoGlobal: e.target.value,
                      }))
                    }
                  />
                </div>

                {/* Lista de Edição Manual Livre em R$ (Proposta Inicial + Planilha Detalhada + Modo Manual) */}
                {propostaConfig.modoEmissao === "ITENS_CALCULADORA" &&
                  propostaConfig.tipoTabelaProposta === "PROPOSTA_INICIAL" &&
                  (propostaConfig.origemValoresProposta || "CALCULADORA") === "MANUAL" && (
                    <div
                      data-testid="lista-itens-proposta-manual"
                      style={{
                        padding: "1rem",
                        backgroundColor: "var(--cds-layer, #fff)",
                        borderRadius: "4px",
                        border: "1px solid var(--cds-interactive, #0f62fe)",
                        marginTop: "0.25rem",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          flexWrap: "wrap",
                          gap: "0.75rem",
                          marginBottom: "0.75rem",
                        }}
                      >
                        <div>
                          <strong style={{ fontSize: "0.875rem", color: "var(--cds-text-primary)" }}>
                            ✏️ Valores Manuais da Proposta Inicial ({consolidadoCalculadora.totalItens} {consolidadoCalculadora.totalItens === 1 ? "item" : "itens"})
                          </strong>
                          <p style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", margin: "0.15rem 0 0 0", maxWidth: "680px" }}>
                            Os preços iniciam pré-preenchidos com os valores da Calculadora (e funcionam normalmente mesmo se os custos estiverem zerados). Editar o preço de um item aqui atualiza também a Proposta Inicial na aba Disputa.
                          </p>
                        </div>

                        <Button
                          size="sm"
                          kind="ghost"
                          renderIcon={Renew}
                          onClick={handleRestaurarPropostaCalculadora}
                          data-testid="btn-puxar-calculadora-proposta"
                        >
                          ↺ Puxar da Calculadora
                        </Button>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        {consolidadoCalculadora.itens.map((it, idx) => {
                          const valorManualAtual =
                            it.valorUnitarioPropostaManual ?? it.propostaUnitaria;
                          const valorInvalido = !(valorManualAtual > 0);
                          return (
                            <div
                              key={it.id || idx}
                              style={{
                                display: "grid",
                                gridTemplateColumns: "90px 1fr 250px",
                                gap: "0.75rem",
                                alignItems: "center",
                                padding: "0.65rem 0.75rem",
                                backgroundColor: "var(--cds-layer-01, #f9f9f9)",
                                borderRadius: "4px",
                                border: valorInvalido
                                  ? "1px solid var(--cds-support-error, #da1e28)"
                                  : "1px solid var(--cds-border-subtle, #e8e8e8)",
                              }}
                            >
                              <div>
                                <div style={{ fontSize: "0.7rem", color: "var(--cds-text-secondary)" }}>Nº Item</div>
                                <strong style={{ fontSize: "0.875rem" }}>{it.numeroItem}</strong>
                              </div>

                              <div>
                                <div style={{ fontSize: "0.7rem", color: "var(--cds-text-secondary)" }}>
                                  Descrição / Especificação ({it.quantidade} {it.unidade})
                                </div>
                                <div style={{ fontSize: "0.85rem", color: "var(--cds-text-primary)", fontWeight: 500 }}>
                                  {it.descricao || "Sem descrição"}
                                </div>
                                <div style={{ fontSize: "0.72rem", color: "var(--cds-text-secondary)", marginTop: "0.2rem" }}>
                                  Subtotal: <strong>{formatarMoedaBrl(it.propostaTotal)}</strong> • Ref. Calculadora:{" "}
                                  {formatarMoedaBrl(it.propostaCalculadoraUnitaria ?? it.propostaUnitaria)}
                                  {it.pisoUnitarioSeguro > 0 && valorManualAtual > 0 && valorManualAtual < it.pisoUnitarioSeguro && (
                                    <span style={{ color: "var(--cds-support-warning, #b28600)", marginLeft: "0.4rem" }}>
                                      ⚠️ Abaixo do Piso da Calculadora ({formatarMoedaBrl(it.pisoUnitarioSeguro)})
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div>
                                <NumericCalcInput
                                  id={`item-proposta-manual-${idx}`}
                                  labelText={`Proposta Unit. (R$) — Item ${it.numeroItem}`}
                                  placeholder="0,00"
                                  allowEmpty
                                  value={valorManualAtual}
                                  invalid={valorInvalido}
                                  invalidText="Informe um valor maior que R$ 0,00."
                                  onChangeValue={(v) => handleAtualizarPropostaManualItem(idx, v)}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

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
                          invalid={
                            propostaConfig.origemValoresProposta === "MANUAL" &&
                            propostaConfig.modoEmissao === "VALOR_GLOBAL" &&
                            !validacaoPropostaAtual.valido
                          }
                          invalidText={validacaoPropostaAtual.erro}
                          onChangeValue={(v) =>
                            setPropostaConfig({
                              ...propostaConfig,
                              valorGlobalManual: v,
                            })
                          }
                          helperText={
                            propostaConfig.origemValoresProposta === "MANUAL"
                              ? "No modo Manual com Valor Global, informe o Valor Global desejado em R$ (maior que zero)"
                              : "Deixe vazio para usar a soma automática dos itens calculados"
                          }
                        />
                      </div>
                    </div>

                    <div>
                      <TextArea
                        id="textarea-desc-global"
                        labelText="Descrição Resumida do Objeto para o Lote / Preço Global"
                        rows={2}
                        value={propostaConfig.descricaoGlobal || obterObjetoCertame(oportunidade, null, itensCalculadora)}
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

          {/* Aba 7: Disputa do Certame & Auto-Bidder Multi-Item */}
          <TabPanel>
            <Tile style={{ padding: "1.5rem", marginTop: "1rem" }}>
              {disputaFeedback && (
                <InlineNotification
                  style={{ marginBottom: "1rem" }}
                  kind={disputaFeedback.tipo}
                  title={disputaFeedback.tipo === "success" ? "Configuração Atualizada" : "Aviso de Disputa"}
                  subtitle={disputaFeedback.msg}
                  onCloseButtonClick={() => setDisputaFeedback(null)}
                />
              )}

              {/* Cabeçalho da Disputa */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                  gap: "1rem",
                  marginBottom: "1.25rem",
                }}
              >
                <div>
                  <h4
                    style={{
                      fontSize: "1.125rem",
                      fontWeight: 600,
                      marginBottom: "0.25rem",
                      color: "var(--cds-text-primary)",
                    }}
                  >
                    ⚡ Disputa do Certame & Robô de Lances Multi-Item
                  </h4>
                  <p style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)", margin: 0 }}>
                    Configuração individual por item/lote sincronizada com a Calculadora. Trava inviolável de proteção contra inexequibilidade (Art. 59 da Lei 14.133/2021).
                  </p>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                  <Tag
                    type={
                      pausaEmergenciaDisputa
                        ? "red"
                        : statusGeralDisputa === "EM_DISPUTA"
                        ? "green"
                        : statusGeralDisputa === "PAUSADA"
                        ? "warm-gray"
                        : statusGeralDisputa === "CONCLUIDA"
                        ? "blue"
                        : "teal"
                    }
                    size="md"
                  >
                    {pausaEmergenciaDisputa
                      ? "🛑 Pausa de Emergência"
                      : statusGeralDisputa === "EM_DISPUTA"
                      ? "● Sala em Disputa ao Vivo"
                      : statusGeralDisputa === "PAUSADA"
                      ? "⏸️ Disputa Pausada"
                      : statusGeralDisputa === "CONCLUIDA"
                      ? "🏁 Disputa Concluída"
                      : "⚙️ Robô Configurado"}
                  </Tag>
                  <Button
                    size="sm"
                    kind="tertiary"
                    renderIcon={Renew}
                    disabled={consultandoItensCertame}
                    onClick={() => handleConsultarTodosItensCertame()}
                    data-testid="btn-consultar-itens-disputa"
                  >
                    {consultandoItensCertame ? "Lendo documentos..." : "🔍 Sincronizar Itens do Edital"}
                  </Button>
                  <Button
                    size="sm"
                    kind="secondary"
                    renderIcon={Flash}
                    onClick={() => {
                      if (!validacaoDisputaAtual.valido) {
                        setDisputaFeedback({
                          tipo: "error",
                          msg:
                            validacaoDisputaAtual.erros[0] ||
                            "Corrija os valores de Piso Seguro e Proposta Inicial antes de iniciar a simulação do robô.",
                        });
                        return;
                      }
                      setModalSimuladorDisputaAberto(true);
                    }}
                    data-testid="btn-simular-disputa-certame"
                  >
                    🎮 Simular Disputa Deste Certame
                  </Button>
                  <Button
                    size="sm"
                    kind="primary"
                    renderIcon={Save}
                    disabled={salvandoDisputaCertame}
                    onClick={handleSalvarConfiguracaoDisputa}
                    data-testid="btn-salvar-disputa-topo"
                  >
                    {salvandoDisputaCertame ? "Salvando..." : "Salvar Configuração de Disputa"}
                  </Button>
                </div>
              </div>

              {/* Configuração Geral da Sala no Portal */}
              <div
                style={{
                  padding: "1rem 1.25rem",
                  backgroundColor: "var(--cds-layer-01, #ffffff)",
                  border: "1px solid var(--cds-border-subtle, #e0e0e0)",
                  borderRadius: "4px",
                  marginBottom: "1.5rem",
                }}
              >
                <div style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.75rem" }}>
                  🌐 Dados da Sessão Pública & Conexão ao Portal
                </div>

                {regrasDisputaDetectadas &&
                  (regrasDisputaDetectadas.portal ||
                    regrasDisputaDetectadas.modoDisputaEdital ||
                    regrasDisputaDetectadas.intervaloMinimoLances ||
                    regrasDisputaDetectadas.criterioJulgamento ||
                    regrasDisputaDetectadas.uasg ||
                    regrasDisputaDetectadas.identificadorSala ||
                    regrasDisputaDetectadas.linkSessao) && (
                    <Tile
                      data-testid="disputa-regras-detectadas-banner"
                      style={{
                        padding: "0.875rem 1rem",
                        marginBottom: "1rem",
                        backgroundColor: "var(--cds-layer-02)",
                        borderLeft: "4px solid var(--cds-support-info)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: "0.75rem",
                        }}
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                          <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--cds-text-primary)" }}>
                            🧭 Referência automática importada (PNCP / Edital / IA) — edições manuais são preservadas:
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", alignItems: "center" }}>
                            {regrasDisputaDetectadas.portal && (
                              <Tag type="cool-gray" size="sm">Portal: {regrasDisputaDetectadas.portal}</Tag>
                            )}
                            {regrasDisputaDetectadas.modoDisputaEdital && (
                              <Tag type="cyan" size="sm">
                                Modo:{" "}
                                {regrasDisputaDetectadas.modoDisputaEdital === "ABERTO_FECHADO"
                                  ? "Aberto e Fechado"
                                  : regrasDisputaDetectadas.modoDisputaEdital === "FECHADO_ABERTO"
                                    ? "Fechado e Aberto"
                                    : "Aberto"}
                              </Tag>
                            )}
                            {regrasDisputaDetectadas.intervaloMinimoLances && (
                              <Tag type="teal" size="sm">
                                Intervalo mín.: {regrasDisputaDetectadas.intervaloMinimoLances}
                              </Tag>
                            )}
                            {regrasDisputaDetectadas.criterioJulgamento && (
                              <Tag type="purple" size="sm">
                                Critério: {regrasDisputaDetectadas.criterioJulgamento}
                              </Tag>
                            )}
                            {(regrasDisputaDetectadas.uasg || regrasDisputaDetectadas.identificadorSala) && (
                              <Tag type="outline" size="sm">
                                {regrasDisputaDetectadas.identificadorSala ||
                                  `UASG ${regrasDisputaDetectadas.uasg}`}
                              </Tag>
                            )}
                            {Array.isArray(regrasDisputaDetectadas.fontes) &&
                              regrasDisputaDetectadas.fontes.length > 0 && (
                                <span style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                                  Fontes: {regrasDisputaDetectadas.fontes.join(", ")}
                                </span>
                              )}
                          </div>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                          {regrasDisputaDetectadas.linkSessao &&
                            /^https?:\/\//i.test(regrasDisputaDetectadas.linkSessao) && (
                              <Button
                                kind="ghost"
                                size="sm"
                                renderIcon={Launch}
                                href={regrasDisputaDetectadas.linkSessao}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Abrir Portal de Origem
                              </Button>
                            )}
                          <Button
                            kind="tertiary"
                            size="sm"
                            onClick={handleAplicarRegrasDetectadas}
                            data-testid="btn-aplicar-regras-edital"
                          >
                            Aplicar regras detectadas
                          </Button>
                        </div>
                      </div>
                    </Tile>
                  )}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: "1rem",
                    alignItems: "flex-end",
                  }}
                >
                  <div>
                    <Select
                      id="select-portal-disputa"
                      labelText="Portal Eletrônico de Disputa"
                      value={portalDisputa}
                      onChange={(e) => setPortalDisputa(e.target.value)}
                    >
                      {PORTAIS_DISPUTA_OPCOES.map((p) => (
                        <SelectItem key={p} value={p} text={p} />
                      ))}
                    </Select>
                  </div>

                  <div>
                    <Select
                      id="select-modo-disputa-edital"
                      labelText="Modo de Disputa do Edital"
                      value={modoDisputaEdital}
                      onChange={(e) =>
                        setModoDisputaEdital(
                          e.target.value as "ABERTO" | "ABERTO_FECHADO" | "FECHADO_ABERTO",
                        )
                      }
                    >
                      <SelectItem value="ABERTO" text="Modo Aberto (10 min + prorrogações de 2 min)" />
                      <SelectItem value="ABERTO_FECHADO" text="Modo Aberto e Fechado (15 min + até 10 min fechado)" />
                      <SelectItem value="FECHADO_ABERTO" text="Modo Fechado e Aberto (Lances sigilosos + disputa aberta)" />
                    </Select>
                  </div>

                  <div>
                    <TextInput
                      id="input-intervalo-minimo-lances"
                      labelText="Intervalo Mínimo entre Lances Exigido pelo Edital"
                      placeholder="Ex: R$ 0,05 ou 0,5%"
                      helperText={
                        regrasDisputaDetectadas?.intervaloMinimoLances
                          ? `Edital/IA: ${regrasDisputaDetectadas.intervaloMinimoLances} (editável e validado no simulador)`
                          : "Ex.: R$ 5,00 ou 0,5% (imposto no simulador)"
                      }
                      value={intervaloMinimoLances}
                      onChange={(e) => setIntervaloMinimoLances(e.target.value)}
                    />
                  </div>

                  <div>
                    <TextInput
                      id="input-identificador-sala"
                      labelText="Identificador da Sala / UASG / Link da Sessão"
                      placeholder="Ex: UASG 158123 • PE 088/2026"
                      value={identificadorSalaDisputa}
                      onChange={(e) => setIdentificadorSalaDisputa(e.target.value)}
                    />
                  </div>

                  <div>
                    <TextInput
                      id="input-tempo-resposta-disputa"
                      data-testid="input-tempo-resposta-disputa"
                      type="number"
                      min={1}
                      max={60}
                      labelText="Tempo de Resposta do Robô (segundos)"
                      helperText="Cadência após perder 1º lugar (1s a 60s)"
                      value={tempoRespostaDraft}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setTempoRespostaDraft(raw);
                        const parsed = Number.parseInt(raw, 10);
                        if (Number.isFinite(parsed)) {
                          setTempoRespostaSegundos(Math.min(60, Math.max(1, parsed)));
                        }
                      }}
                      onBlur={() => {
                        const parsed = Number.parseInt(tempoRespostaDraft, 10);
                        const clamped = Number.isFinite(parsed)
                          ? Math.min(60, Math.max(1, parsed))
                          : tempoRespostaSegundos;
                        setTempoRespostaSegundos(clamped);
                        setTempoRespostaDraft(String(clamped));
                      }}
                    />
                  </div>

                  <div>
                    <Select
                      id="select-janela-sniper-disputa"
                      data-testid="select-janela-sniper-disputa"
                      labelText="Janela da Tática Sniper"
                      value={String(segundosFinaisSniper)}
                      onChange={(e) => {
                        const parsed = Number.parseInt(e.target.value, 10);
                        if (Number.isFinite(parsed)) {
                          setSegundosFinaisSniper(Math.min(60, Math.max(3, parsed)));
                        }
                      }}
                    >
                      <SelectItem value="5" text="Últimos 5 segundos" />
                      <SelectItem value="10" text="Últimos 10 segundos" />
                      <SelectItem value="15" text="Últimos 15 segundos" />
                      <SelectItem value="20" text="Últimos 20 segundos" />
                      <SelectItem value="30" text="Últimos 30 segundos" />
                      {![5, 10, 15, 20, 30].includes(segundosFinaisSniper) && (
                        <SelectItem
                          value={String(segundosFinaisSniper)}
                          text={`Últimos ${segundosFinaisSniper} segundos`}
                        />
                      )}
                    </Select>
                  </div>

                  <div>
                    <Select
                      id="select-status-sala"
                      labelText="Status Operacional da Sala"
                      value={statusGeralDisputa}
                      onChange={(e) =>
                        setStatusGeralDisputa(
                          e.target.value as "CONFIGURADA" | "EM_DISPUTA" | "PAUSADA" | "CONCLUIDA",
                        )
                      }
                    >
                      <SelectItem value="CONFIGURADA" text="⚙️ Configurada (Pronta para Iniciar)" />
                      <SelectItem value="EM_DISPUTA" text="🟢 Em Disputa ao Vivo (Sessão Aberta)" />
                      <SelectItem value="PAUSADA" text="⏸️ Pausada Preventivamente" />
                      <SelectItem value="CONCLUIDA" text="🏁 Disputa Concluída / Encerrada" />
                    </Select>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", paddingBottom: "0.4rem" }}>
                    <Toggle
                      id="toggle-pausa-emergencia"
                      size="sm"
                      labelText="Pausa de Emergência"
                      labelA="Desativada"
                      labelB="Ativa"
                      toggled={pausaEmergenciaDisputa}
                      onToggle={(checked) => setPausaEmergenciaDisputa(checked)}
                    />
                  </div>
                </div>

                {(itensAbaixoIntervaloDisputa.length > 0 || Boolean(intervaloIaDivergente)) && (
                  <div
                    style={{ marginTop: "1rem" }}
                    data-testid="alerta-intervalo-minimo-disputa"
                  >
                    <InlineNotification
                      kind="warning"
                      lowContrast
                      hideCloseButton
                      title="Atenção ao Intervalo Mínimo entre Lances do Edital:"
                      subtitle={
                        itensAbaixoIntervaloDisputa.length > 0
                          ? `${itensAbaixoIntervaloDisputa.length} ${
                              itensAbaixoIntervaloDisputa.length === 1
                                ? "item ativo está"
                                : "itens ativos estão"
                            } com decremento inferior ao mínimo configurado (${
                              parseIntervaloMinimoEdital(intervaloMinimoLances)?.textoFormatado ||
                              intervaloMinimoLances
                            }). O simulador ajustará o passo para respeitar o edital (bloqueando se cruzar o Piso Seguro).`
                          : `A leitura do Edital/IA identificou intervalo mínimo de ${intervaloIaDivergente?.textoFormatado}, diferente do campo atual (${intervaloMinimoLances || "não informado"}).`
                      }
                    />
                    <div
                      style={{
                        display: "flex",
                        gap: "0.75rem",
                        flexWrap: "wrap",
                        marginTop: "0.5rem",
                      }}
                    >
                      {itensAbaixoIntervaloDisputa.length > 0 && (
                        <Button
                          kind="tertiary"
                          size="sm"
                          onClick={() => handleAdequarItensAoIntervaloMinimo()}
                          data-testid="btn-adequar-intervalo-minimo"
                        >
                          Adequar {itensAbaixoIntervaloDisputa.length}{" "}
                          {itensAbaixoIntervaloDisputa.length === 1 ? "item" : "itens"} para{" "}
                          {parseIntervaloMinimoEdital(intervaloMinimoLances)?.textoFormatado ||
                            intervaloMinimoLances}
                        </Button>
                      )}
                      {intervaloIaDivergente && (
                        <Button
                          kind="ghost"
                          size="sm"
                          onClick={() =>
                            handleAdequarItensAoIntervaloMinimo(intervaloIaDivergente.textoFormatado)
                          }
                          data-testid="btn-adotar-intervalo-ia"
                        >
                          Adotar {intervaloIaDivergente.textoFormatado} do Edital/IA e adequar itens
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Origem dos Preços da Disputa (Calculadora vs Manual R$) */}
              <Tile
                style={{
                  padding: "1rem 1.25rem",
                  backgroundColor: "var(--cds-layer-02)",
                  borderLeft: "4px solid var(--cds-interactive, #0f62fe)",
                  marginBottom: "1.25rem",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: "1rem",
                    alignItems: "end",
                  }}
                >
                  <div>
                    <Select
                      id="select-origem-precos-disputa"
                      labelText="Origem dos Preços da Disputa (Valor Mínimo / Piso e Proposta Inicial)"
                      value={disputaOrigemPrecos}
                      onChange={(e) =>
                        handleAlternarOrigemDisputa(e.target.value as "CALCULADORA" | "MANUAL")
                      }
                    >
                      <SelectItem
                        value="CALCULADORA"
                        text="Usar Calculadora (Piso Seguro e Proposta Inicial sincronizados automaticamente)"
                      />
                      <SelectItem
                        value="MANUAL"
                        text="Definir Manualmente (Editar Piso Seguro e Proposta Inicial em R$ na grade)"
                      />
                    </Select>
                  </div>

                  <div>
                    <Button
                      size="md"
                      kind="tertiary"
                      renderIcon={Renew}
                      onClick={handleRecarregarDisputaDaCalculadora}
                      data-testid="btn-recarregar-disputa-calc"
                    >
                      ↺ Recarregar da Calculadora
                    </Button>
                  </div>
                </div>

                {disputaOrigemPrecos === "MANUAL" && (
                  <div
                    style={{
                      fontSize: "0.78rem",
                      color: "var(--cds-support-info, #0043ce)",
                      marginTop: "0.65rem",
                    }}
                  >
                    ℹ️ Modo Manual ativo: edite o <strong>Piso Seguro (Valor Mínimo)</strong> e a{" "}
                    <strong>Proposta Inicial</strong> em R$ diretamente na tabela abaixo — funciona normalmente mesmo com custos zerados na Calculadora. O Valor Mínimo nunca pode ultrapassar a Proposta Inicial.
                  </div>
                )}
              </Tile>

              {!validacaoDisputaAtual.valido && (
                <InlineNotification
                  style={{ marginBottom: "1.25rem" }}
                  kind="error"
                  lowContrast
                  hideCloseButton
                  title="Bloqueio de Segurança na Disputa:"
                  subtitle={
                    validacaoDisputaAtual.erros[0] ||
                    "Verifique os valores de Piso Seguro e Proposta Inicial."
                  }
                  data-testid="alerta-disputa-validacao"
                />
              )}

              {/* Cards de Métricas da Disputa */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "1rem",
                  marginBottom: "1.5rem",
                }}
              >
                <Tile style={{ padding: "1rem", borderLeft: "4px solid var(--cds-interactive, #0f62fe)" }}>
                  <div style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)" }}>
                    Itens Ativos no Robô
                  </div>
                  <div style={{ fontSize: "1.45rem", fontWeight: 700, marginTop: "0.25rem" }}>
                    {regrasDisputaItens.filter((r) => r.ativoNoRobo).length} de {regrasDisputaItens.length} itens
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginTop: "0.25rem" }}>
                    Itens monitorados automaticamente
                  </div>
                </Tile>

                <Tile style={{ padding: "1rem", borderLeft: "4px solid var(--cds-support-success, #24a148)" }}>
                  <div style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)" }}>
                    Piso Seguro Total (Inviolável)
                  </div>
                  <div
                    style={{
                      fontSize: "1.45rem",
                      fontWeight: 700,
                      color: "var(--cds-support-success, #24a148)",
                      marginTop: "0.25rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem",
                    }}
                  >
                    <Locked size={18} />
                    {formatarMoedaBrl(
                      disputaOrigemPrecos === "MANUAL"
                        ? disputaTotais.pisoTotal
                        : consolidadoCalculadora.pisoTotalGeral,
                    )}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginTop: "0.25rem" }}>
                    {disputaOrigemPrecos === "MANUAL"
                      ? "Definido manualmente por item na Disputa"
                      : "Trava automática da Calculadora (Aba 5)"}
                  </div>
                </Tile>

                <Tile style={{ padding: "1rem", borderLeft: "4px solid var(--cds-support-info, #0043ce)" }}>
                  <div style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)" }}>
                    Proposta Inicial Total
                  </div>
                  <div style={{ fontSize: "1.45rem", fontWeight: 700, marginTop: "0.25rem" }}>
                    {formatarMoedaBrl(
                      disputaOrigemPrecos === "MANUAL"
                        ? disputaTotais.propostaTotal
                        : consolidadoCalculadora.propostaTotalGeral,
                    )}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginTop: "0.25rem" }}>
                    {disputaOrigemPrecos === "MANUAL"
                      ? "Valores de abertura editados na Disputa"
                      : (propostaConfig.origemValoresProposta || "CALCULADORA") === "MANUAL"
                        ? "Sincronizada com a Proposta Manual (Aba 6)"
                        : "Valor de abertura cadastrado no edital"}
                  </div>
                </Tile>

                <Tile style={{ padding: "1rem", borderLeft: "4px solid #007d79" }}>
                  <div style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)" }}>
                    Parâmetros de Disparo
                  </div>
                  <div style={{ fontSize: "1.1rem", fontWeight: 700, marginTop: "0.35rem", color: "#007d79" }}>
                    {tempoRespostaSegundos}s Resposta • {segundosFinaisSniper}s Sniper
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginTop: "0.25rem" }}>
                    Cadência configurada para cobertura de lances
                  </div>
                </Tile>
              </div>

              {/* Barra de Regra em Massa */}
              <Tile
                style={{
                  padding: "1rem 1.25rem",
                  marginBottom: "1.5rem",
                  backgroundColor: "var(--cds-layer-02)",
                  borderLeft: "4px solid #0f62fe",
                }}
              >
                <div style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.75rem" }}>
                  ⚡ Aplicar Regras de Disputa em Massa (Para Todos os {regrasDisputaItens.length} Itens)
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: "0.75rem",
                    alignItems: "flex-end",
                  }}
                >
                  <div>
                    <Select
                      id="select-massa-tipo-decremento"
                      labelText="Regra de Decremento"
                      value={massaTipoDecremento}
                      onChange={(e) => {
                        const t = e.target.value as TipoDecremento;
                        setMassaTipoDecremento(t);
                        if (t === "CENTAVOS_1") {
                          setMassaValorDecremento("0,01");
                        } else if (
                          !massaValorDecremento ||
                          massaValorDecremento === "0.01" ||
                          massaValorDecremento === "0,01"
                        ) {
                          setMassaValorDecremento(t === "PERCENTUAL" ? "0,5" : "1,00");
                        }
                      }}
                    >
                      <SelectItem value="CENTAVOS_1" text="Cobrir por R$ 0,01 (Mínimo)" />
                      <SelectItem value="FIXO_REAIS" text="Valor Fixo em Reais (R$)" />
                      <SelectItem value="PERCENTUAL" text="Percentual sobre o menor lance (%)" />
                    </Select>
                  </div>

                  <div>
                    <TextInput
                      id="input-massa-valor-decremento"
                      labelText="Valor do Decremento"
                      placeholder={massaTipoDecremento === "CENTAVOS_1" ? "0,01" : massaTipoDecremento === "FIXO_REAIS" ? "10,00" : "0,5%"}
                      disabled={massaTipoDecremento === "CENTAVOS_1"}
                      value={massaTipoDecremento === "CENTAVOS_1" ? "0,01" : massaValorDecremento}
                      onChange={(e) => setMassaValorDecremento(e.target.value)}
                    />
                  </div>

                  <div>
                    <Select
                      id="select-massa-tatica"
                      labelText="Tática de Disparo"
                      value={massaTatica}
                      onChange={(e) => setMassaTatica(e.target.value as TaticaDisputa)}
                    >
                      <SelectItem value="IMEDIATO" text="Imediato (Cobrir ao perder 1º lugar)" />
                      <SelectItem value="SNIPER" text="Sniper (Segundos finais da rodada)" />
                      <SelectItem value="MONITORAR" text="Apenas Monitorar (Sem disparos)" />
                    </Select>
                  </div>

                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <Button kind="tertiary" size="md" onClick={aplicarRegraEmMassa}>
                      Aplicar a Todos
                    </Button>
                  </div>
                </div>
              </Tile>

              {/* Tabela de Grade Multi-Item */}
              <div style={{ marginBottom: "1.5rem" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "1rem",
                    marginBottom: "0.75rem",
                  }}
                >
                  <h5 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>
                    📋 Grade de Itens da Disputa ({regrasDisputaItens.length})
                  </h5>
                  <div style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)" }}>
                    {disputaOrigemPrecos === "MANUAL"
                      ? "Modo Manual ativo: edite Piso Seguro e Proposta Inicial diretamente em R$ (Piso ≤ Proposta Inicial)"
                      : "Piso Seguro Travado 🔒 puxado em tempo real da Calculadora (Aba 5)"}
                  </div>
                </div>

                <div style={{ overflowX: "auto" }}>
                  <Table size="lg">
                    <TableHead>
                      <TableRow>
                        <TableHeader style={{ width: "90px" }}>Robô</TableHeader>
                        <TableHeader style={{ width: "70px" }}>Item</TableHeader>
                        <TableHeader>Descrição do Objeto</TableHeader>
                        <TableHeader>Qtd / Un</TableHeader>
                        <TableHeader style={{ minWidth: disputaOrigemPrecos === "MANUAL" ? "170px" : undefined }}>
                          Piso Seguro 🔒
                        </TableHeader>
                        <TableHeader style={{ minWidth: disputaOrigemPrecos === "MANUAL" ? "170px" : undefined }}>
                          Proposta Inicial
                        </TableHeader>
                        <TableHeader style={{ minWidth: "210px" }}>Regra de Decremento</TableHeader>
                        <TableHeader style={{ minWidth: "170px" }}>Tática</TableHeader>
                        <TableHeader>Status</TableHeader>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {regrasDisputaItens.map((item, idx) => {
                        const pisoMaiorQueProposta = item.pisoUnitarioSeguro > item.propostaUnitaria;
                        const faltaPisoManual =
                          disputaOrigemPrecos === "MANUAL" &&
                          !(item.pisoUnitarioSeguro > 0);
                        const faltaPisoCalculadora =
                          disputaOrigemPrecos !== "MANUAL" &&
                          !(item.pisoUnitarioSeguro > 0);
                        const faltaPropostaManual =
                          disputaOrigemPrecos === "MANUAL" &&
                          item.ativoNoRobo &&
                          !(item.propostaUnitaria > 0);
                        const pisoCalculadoOriginal =
                          pisosCalculadosPorItem.porId.get(item.itemId) ??
                          pisosCalculadosPorItem.porNumero.get(
                            normalizarChaveItem(item.numeroItem, idx),
                          ) ??
                          0;
                        const pisoManualAbaixoCalculado =
                          disputaOrigemPrecos === "MANUAL" &&
                          pisoCalculadoOriginal > 0 &&
                          item.pisoUnitarioSeguro > 0 &&
                          item.pisoUnitarioSeguro < pisoCalculadoOriginal;
                        return (
                        <TableRow
                          key={item.itemId || idx}
                          style={{
                            opacity: item.ativoNoRobo ? 1 : 0.5,
                            backgroundColor: pisoMaiorQueProposta
                              ? "rgba(218, 30, 40, 0.06)"
                              : item.ativoNoRobo
                                ? "inherit"
                                : "var(--cds-layer-02)",
                          }}
                        >
                          {/* Toggle Robô Ativo */}
                          <TableCell>
                            <input
                              type="checkbox"
                              id={`check-robo-item-${item.itemId}`}
                              aria-label={`Ativar robô no item ${item.numeroItem}`}
                              checked={item.ativoNoRobo}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setRegrasDisputaItens((prev) =>
                                  prev.map((r) =>
                                    r.itemId === item.itemId ? { ...r, ativoNoRobo: checked } : r,
                                  ),
                                );
                              }}
                              style={{ width: "16px", height: "16px", cursor: "pointer" }}
                            />
                          </TableCell>

                          {/* Número Item */}
                          <TableCell>
                            <strong>#{item.numeroItem}</strong>
                          </TableCell>

                          {/* Descrição */}
                          <TableCell style={{ maxWidth: "260px" }}>
                            <div
                              style={{
                                fontSize: "0.84rem",
                                fontWeight: 500,
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                              }}
                            >
                              {item.descricao}
                            </div>
                          </TableCell>

                          {/* Quantidade e Unidade */}
                          <TableCell>
                            <span style={{ fontSize: "0.85rem" }}>
                              {item.quantidade} {item.unidade}
                            </span>
                          </TableCell>

                          {/* Piso Seguro (Calculadora ou Edição Manual R$) */}
                          <TableCell>
                            {disputaOrigemPrecos === "MANUAL" ? (
                              <NumericCalcInput
                                id={`disputa-piso-${item.itemId}`}
                                size="sm"
                                hideLabel
                                labelText={`Piso Seguro (Valor Mínimo R$) do item ${item.numeroItem}`}
                                placeholder="0,00"
                                value={item.pisoUnitarioSeguro}
                                invalid={pisoMaiorQueProposta || faltaPisoManual}
                                invalidText={
                                  pisoMaiorQueProposta
                                    ? "Maior que Proposta Inicial"
                                    : "Informe > R$ 0,00"
                                }
                                onChangeValue={(v) =>
                                  handleAtualizarRegraDisputaPreco(
                                    item.itemId,
                                    "pisoUnitarioSeguro",
                                    v ?? 0,
                                  )
                                }
                              />
                            ) : (
                              <div>
                                <div
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "0.3rem",
                                    fontWeight: 700,
                                    color:
                                      pisoMaiorQueProposta || faltaPisoCalculadora
                                        ? "var(--cds-support-error, #da1e28)"
                                        : "var(--cds-support-success, #24a148)",
                                    backgroundColor: "var(--cds-layer-02)",
                                    padding: "0.2rem 0.5rem",
                                    borderRadius: "3px",
                                    border: "1px solid var(--cds-border-subtle, #e0e0e0)",
                                  }}
                                  title="Piso mínimo seguro calculado na Aba 5 (Calculadora). O robô é bloqueado automaticamente caso os lances atinjam esse valor."
                                >
                                  <Locked size={14} />
                                  {formatarMoedaBrl(item.pisoUnitarioSeguro)}
                                </div>
                                {pisoMaiorQueProposta ? (
                                  <div style={{ fontSize: "0.7rem", color: "var(--cds-support-error, #da1e28)", marginTop: "0.2rem" }}>
                                    Piso maior que a Proposta Inicial
                                  </div>
                                ) : faltaPisoCalculadora ? (
                                  <div style={{ fontSize: "0.7rem", color: "var(--cds-support-error, #da1e28)", marginTop: "0.2rem" }}>
                                    Piso R$ 0,00 bloqueado para disputa
                                  </div>
                                ) : null}
                              </div>
                            )}
                            <div
                              data-testid={`disputa-piso-calc-original-${item.itemId}`}
                              style={{
                                fontSize: "0.72rem",
                                color: "var(--cds-text-secondary)",
                                marginTop: "0.25rem",
                                lineHeight: 1.3,
                              }}
                            >
                              Calc. original: {formatarMoedaBrl(pisoCalculadoOriginal)}
                            </div>
                            {pisoManualAbaixoCalculado && (
                              <div
                                data-testid={`disputa-piso-alerta-abaixo-${item.itemId}`}
                                style={{
                                  fontSize: "0.7rem",
                                  color: "var(--cds-support-warning, #b28600)",
                                  marginTop: "0.15rem",
                                  lineHeight: 1.25,
                                }}
                              >
                                Abaixo do piso calculado
                              </div>
                            )}
                          </TableCell>

                          {/* Proposta Inicial (Calculadora/Tab 6 ou Edição Manual Independente R$) */}
                          <TableCell>
                            {disputaOrigemPrecos === "MANUAL" ? (
                              <NumericCalcInput
                                id={`disputa-proposta-${item.itemId}`}
                                size="sm"
                                hideLabel
                                labelText={`Proposta Inicial (R$) do item ${item.numeroItem}`}
                                placeholder="0,00"
                                value={item.propostaUnitaria}
                                invalid={pisoMaiorQueProposta || faltaPropostaManual}
                                invalidText={
                                  pisoMaiorQueProposta
                                    ? "Menor que Piso Seguro"
                                    : "Informe > R$ 0,00"
                                }
                                onChangeValue={(v) =>
                                  handleAtualizarRegraDisputaPreco(
                                    item.itemId,
                                    "propostaUnitaria",
                                    v ?? 0,
                                  )
                                }
                              />
                            ) : (
                              <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                                {formatarMoedaBrl(item.propostaUnitaria)}
                              </span>
                            )}
                          </TableCell>

                          {/* Regra de Decremento */}
                          <TableCell>
                            <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
                              <select
                                aria-label={`Tipo de decremento do item ${item.numeroItem}`}
                                value={item.tipoDecremento}
                                onChange={(e) => {
                                  const t = e.target.value as TipoDecremento;
                                  setRegrasDisputaItens((prev) =>
                                    prev.map((r) =>
                                      r.itemId === item.itemId
                                        ? {
                                            ...r,
                                            tipoDecremento: t,
                                            valorDecremento:
                                              t === "CENTAVOS_1"
                                                ? 0.01
                                                : r.tipoDecremento === "CENTAVOS_1" || r.valorDecremento <= 0.01
                                                ? t === "PERCENTUAL"
                                                  ? 0.5
                                                  : 1.0
                                                : r.valorDecremento,
                                          }
                                        : r,
                                    ),
                                  );
                                }}
                                style={{
                                  fontSize: "0.78rem",
                                  padding: "0.25rem 0.4rem",
                                  borderRadius: "3px",
                                  border: "1px solid var(--cds-border-subtle, #8d8d8d)",
                                  backgroundColor: "var(--cds-field-01, #ffffff)",
                                  color: "var(--cds-text-primary, #161616)",
                                }}
                              >
                                <option value="CENTAVOS_1">R$ 0,01</option>
                                <option value="FIXO_REAIS">Fixo (R$)</option>
                                <option value="PERCENTUAL">% Desc</option>
                              </select>

                              {item.tipoDecremento !== "CENTAVOS_1" && (
                                <div style={{ width: "84px" }}>
                                  <NumericCalcInput
                                    id={`disputa-decremento-${item.itemId || idx}`}
                                    size="sm"
                                    hideLabel
                                    labelText={`Valor de decremento do item ${item.numeroItem}`}
                                    placeholder={item.tipoDecremento === "PERCENTUAL" ? "0,5" : "1,00"}
                                    min={0.01}
                                    value={item.valorDecremento}
                                    onChangeValue={(v) =>
                                      setRegrasDisputaItens((prev) =>
                                        prev.map((r) =>
                                          r.itemId === item.itemId
                                            ? { ...r, valorDecremento: v ?? 0.01 }
                                            : r,
                                        ),
                                      )
                                    }
                                  />
                                </div>
                              )}
                            </div>
                          </TableCell>

                          {/* Tática de Disparo */}
                          <TableCell>
                            <select
                              aria-label={`Tática do item ${item.numeroItem}`}
                              value={item.tatica}
                              onChange={(e) => {
                                const t = e.target.value as TaticaDisputa;
                                setRegrasDisputaItens((prev) =>
                                  prev.map((r) => (r.itemId === item.itemId ? { ...r, tatica: t } : r)),
                                );
                              }}
                              style={{
                                fontSize: "0.78rem",
                                padding: "0.25rem 0.4rem",
                                borderRadius: "3px",
                                border: "1px solid var(--cds-border-subtle, #8d8d8d)",
                                backgroundColor: "var(--cds-field-01, #ffffff)",
                                color: "var(--cds-text-primary, #161616)",
                              }}
                            >
                              <option value="IMEDIATO">Imediato</option>
                              <option value="SNIPER">Sniper</option>
                              <option value="MONITORAR">Monitorar</option>
                            </select>
                          </TableCell>

                          {/* Status */}
                          <TableCell>
                            <Tag
                              type={
                                item.statusItem === "EM_DISPUTA"
                                  ? "green"
                                  : item.statusItem === "PISO_ATINGIDO"
                                  ? "red"
                                  : item.statusItem === "VENCEDOR"
                                  ? "teal"
                                  : item.statusItem === "PAUSADO"
                                  ? "warm-gray"
                                  : "cool-gray"
                              }
                              size="sm"
                            >
                              {item.statusItem === "PISO_ATINGIDO"
                                ? "🛑 Piso Atingido"
                                : item.statusItem === "EM_DISPUTA"
                                ? "● Em Disputa"
                                : item.statusItem === "VENCEDOR"
                                ? "🏆 Vencedor"
                                : item.statusItem === "PAUSADO"
                                ? "Pausado"
                                : "Pronto"}
                            </Tag>
                          </TableCell>
                        </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Botões de Ação da Aba Disputa */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "1rem",
                  flexWrap: "wrap",
                  marginBottom: "1.5rem",
                  paddingTop: "0.5rem",
                }}
              >
                <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                  <Button
                    kind="primary"
                    size="md"
                    renderIcon={Save}
                    disabled={salvandoDisputaCertame}
                    onClick={handleSalvarConfiguracaoDisputa}
                    data-testid="btn-salvar-disputa-rodape"
                  >
                    {salvandoDisputaCertame ? "Salvando..." : "Salvar Configuração de Disputa"}
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

                <div style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)" }}>
                  As alterações salvam o portal, regras e status de todos os itens em banco de dados.
                </div>
              </div>

              {/* Homologação Final de Vitória */}
              <div style={{ paddingTop: "1.25rem", borderTop: "1px solid var(--cds-border-subtle, #e0e0e0)" }}>
                <h5 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                  🏆 Desfecho & Homologação de Vitória
                </h5>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                    gap: "1rem",
                    alignItems: "flex-end",
                  }}
                >
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

      {/* Modal A4: Pré-visualização e Exportação do Pedido de Cotação */}
      <Modal
        open={modalVisualizarCotacaoAberto}
        onRequestClose={() => setModalVisualizarCotacaoAberto(false)}
        passiveModal
        size="lg"
        modalHeading="Visualização da Solicitação de Cotação (RFQ para Fornecedores)"
        aria-label="Pré-visualização do Pedido de Cotação"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Barra Superior com as 4 Ações de Exportação */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", backgroundColor: "var(--cds-layer-01)", padding: "0.75rem", borderRadius: "4px" }}>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <Button
                kind="secondary"
                size="sm"
                renderIcon={Printer}
                onClick={handleImprimirCotacaoLimpa}
                data-testid="btn-imprimir-cotacao-limpa"
              >
                📄 Imprimir PDF Limpo (A4)
              </Button>
              <Button
                kind="secondary"
                size="sm"
                renderIcon={DocumentPdf}
                disabled={gerandoPdfCotacao}
                onClick={handleBaixarPdfTimbradoCotacao}
                data-testid="btn-imprimir-cotacao-timbrada"
              >
                {gerandoPdfCotacao ? "Gerando PDF..." : "📑 Imprimir PDF Timbrado Oficial"}
              </Button>
              <Button
                kind="tertiary"
                size="sm"
                renderIcon={Copy}
                onClick={handleCopiarWhatsAppCotacao}
                data-testid="btn-copiar-whatsapp-cotacao"
              >
                {copiadoCotacao ? "Copiado para Área de Transferência! ✓" : "📋 Copiar Texto para WhatsApp / E-mail"}
              </Button>
              <Button
                kind="ghost"
                size="sm"
                renderIcon={DocumentDownload}
                onClick={handleBaixarHtmlCotacao}
                data-testid="btn-baixar-html-cotacao"
              >
                💾 Baixar HTML
              </Button>
            </div>

            {configCotacao.ocultarOrgaoEdital ? (
              <Tag type="green" size="sm">🔒 Sigilo Comercial Ativo</Tag>
            ) : (
              <Tag type="cool-gray" size="sm">Órgão / Edital Visível</Tag>
            )}
          </div>

          {/* Preview do documento formatado */}
          <div
            style={{
              backgroundColor: "#ffffff",
              color: "#161616",
              padding: "2rem",
              border: "1px solid #e0e0e0",
              borderRadius: "4px",
              maxHeight: "550px",
              overflowY: "auto",
              fontFamily: "var(--cds-font-family, sans-serif)",
            }}
            dangerouslySetInnerHTML={{
              __html: sanitizarHtmlDocumento(
                gerarConteudoPedidoCotacao({
                  orgaoNome: oportunidade?.orgaoNome,
                  numeroEdital: oportunidade?.numeroEdital,
                  itens: itensParaCotacao.length > 0 ? itensParaCotacao : itensCalculadora.map((it, idx) => ({
                    numeroItem: it.numeroItem || idx + 1,
                    descricao: it.descricao,
                    quantidade: it.quantidade,
                    unidadeMedida: it.unidade,
                    marcaSugerida: it.marcaModelo || null,
                  })),
                  configuracao: {
                    ...configCotacao,
                    localEntregaCidade: configCotacao.localEntregaCidade || oportunidade?.municipio || (oportunidade as any)?.cidade || empresaConfig?.cidade || "",
                    localEntregaUf: configCotacao.localEntregaUf || oportunidade?.uf || empresaConfig?.uf || "",
                  },
                  empresa: empresaConfig,
                }).conteudoHtml,
              ),
            }}
          />
        </div>
      </Modal>

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
              <div
                dangerouslySetInnerHTML={{
                  __html: sanitizarHtmlDocumento(documentoProposta.conteudoHtml),
                }}
              />
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

      {/* Modal de Alerta: Reanálise com IA Consome 1 Crédito Mensal (Issue #51) */}
      <Modal
        open={confirmarReanaliseIAOpen}
        modalHeading="Esta licitação já possui análise de IA realizada"
        primaryButtonText="Sim, consumir cota e continuar"
        secondaryButtonText="Cancelar"
        onRequestClose={() => setConfirmarReanaliseIAOpen(false)}
        onRequestSubmit={() => {
          setConfirmarReanaliseIAOpen(false);
          setModalIAOpen(true);
        }}
        size="sm"
        data-testid="modal-confirmar-reanalise-ia"
      >
        <p style={{ fontSize: "0.875rem", color: "var(--cds-text-primary)", lineHeight: 1.5, marginBottom: "0.75rem" }}>
          Esta licitação já possui {analisesValidasCount} análise(s) de Inteligência Artificial salva(s) na aba &ldquo;Histórico Análise IA&rdquo;.
        </p>
        <p style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)", lineHeight: 1.5 }}>
          Executar uma nova análise consumirá <strong>1 crédito da cota mensal de IA</strong> da sua conta. Deseja realmente continuar?
        </p>
      </Modal>

      {/* Modal Raio-X com IA: Edital, ATA, Habilitação e Prazos (Issue #37) */}
      <div style={modalIAOpen ? undefined : { display: "none" }}>
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
                    Faça upgrade agora mesmo para o plano <strong>Pro (15 análises/mês)</strong> ou <strong>Enterprise (30 análises/mês)</strong> para continuar acelerando suas deliberações.
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
                    Plano Enterprise: Limite Mensal de 30 Análises Atingido
                  </strong>
                  <p style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)", margin: 0, maxWidth: "550px" }}>
                    Você atingiu o teto mensal de 30 análises do plano Enterprise. Para contratar cotas adicionais ou suporte customizado, entre em contato direto com nossa equipe comercial.
                  </p>
                  <Button
                    kind="tertiary"
                    size="md"
                    onClick={() => window.open(`mailto:${APP_CONFIG.commercialEmail}?subject=Solicitacao de Cota Adicional IA Enterprise`, "_blank")}
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
                Consumo Mensal: <strong>{cotaIA?.usadas ?? 0}/{cotaIA?.limite ?? 15} análises utilizadas</strong> (Plano {cotaIA?.plano || "PRO"}). Restantes neste mês: <strong>{cotaIA?.restantes ?? 15}</strong>.
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
      </div>

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

      {/* Modal da Sala Simulada de Pregão (Auto-Bidder Sandbox) */}
      {modalSimuladorDisputaAberto && (
        <SalaSimuladaModal
          open={modalSimuladorDisputaAberto}
          onRequestClose={() => setModalSimuladorDisputaAberto(false)}
          licitacaoInicial={
            oportunidade
              ? {
                  id: oportunidade.id,
                  numeroEdital: oportunidade.numeroEdital,
                  orgao: oportunidade.orgaoNome,
                  portal: portalDisputa,
                  modoDisputaEdital,
                  intervaloMinimoLances,
                  tempoRespostaSegundos,
                  pausaEmergencia: pausaEmergenciaDisputa,
                  segundosFinaisSniper,
                  regrasItens: regrasDisputaItens,
                }
              : null
          }
          planoTenant={(cotaIA?.plano as any) || "PRO"}
        />
      )}
    </ModulePageShell>
  );
}

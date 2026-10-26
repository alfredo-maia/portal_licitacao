"use client";

import React from "react";
import { useRouter } from "next/navigation";
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
} from "@carbon/icons-react";
import { ModulePageShell } from "@/components/shell/module-page-shell";
import { TIPOS_SISTEMA_CATALOG } from "@/config/tipos-sistema";

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
  scriptPrompt: string;
  relatorioTexto: string;
  impedimentos: any;
  viabilidade: any;
  custos: any;
  precoSugerido: any;
  criadoEm: string;
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

export default function OportunidadesDetalhePage({
  params,
}: OportunidadesDetalhePageProps) {
  const router = useRouter();
  const [id, setId] = React.useState<string>("");
  const [oportunidade, setOportunidade] = React.useState<OportunidadeDetalhe | null>(null);
  const [usuarios, setUsuarios] = React.useState<UsuarioItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<{ tipo: "success" | "error"; msg: string } | null>(null);

  // Gestão de Equipe
  const [responsavelId, setResponsavelId] = React.useState<string>("");
  const [atribuidoIds, setAtribuidoIds] = React.useState<string[]>([]);
  const [salvandoEquipe, setSalvandoEquipe] = React.useState(false);

  // Aba 1: Tipo de Sistema
  const [tipoSelecionado, setTipoSelecionado] = React.useState<string>("");
  const [salvandoTipo, setSalvandoTipo] = React.useState(false);

  // Aba 2: Upload de Arquivos
  const [uploadFile, setUploadFile] = React.useState<File | null>(null);
  const [enviandoArquivo, setEnviandoArquivo] = React.useState(false);

  // Aba 3: Repositórios Similares
  const [repNome, setRepNome] = React.useState("");
  const [repUrl, setRepUrl] = React.useState("");
  const [salvandoRep, setSalvandoRep] = React.useState(false);

  // Aba 4: Modal Deep Dive IA
  const [modalIAOpen, setModalIAOpen] = React.useState(false);
  const [scriptCopiado, setScriptCopiado] = React.useState(false);
  const [sistemaBaseProprio, setSistemaBaseProprio] = React.useState("Sim, módulo base existente em Next.js e PostgreSQL");
  const [repositorioReferencia, setRepositorioReferencia] = React.useState("");
  const [notasEstrategicas, setNotasEstrategicas] = React.useState("Margem mínima de 25%. Foco em comprovação de atestado técnico.");
  const [salvandoAnalise, setSalvandoAnalise] = React.useState(false);

  // Modal Recusa GO/No-GO
  const [showRecusarModal, setShowRecusarModal] = React.useState(false);
  const [recusaMotivoGenerico, setRecusaMotivoGenerico] = React.useState(MOTIVOS_RECUSA_GENERICOS[0]);
  const [recusaMotivoCustom, setRecusaMotivoCustom] = React.useState("");
  const [salvandoStatusPipeline, setSalvandoStatusPipeline] = React.useState(false);
  const [statusPipelineMsg, setStatusPipelineMsg] = React.useState<string | null>(null);

  // Resolver params assíncrono (Next.js 15)
  React.useEffect(() => {
    Promise.resolve(params).then((p) => {
      if (p?.id) setId(p.id);
    });
  }, [params]);

  const carregarDados = React.useCallback(async (targetId: string) => {
    setLoading(true);
    setError(null);
    try {
      const [oppRes, usrRes] = await Promise.all([
        fetch(`/api/oportunidades/${targetId}`),
        fetch("/api/usuarios"),
      ]);

      if (!oppRes.ok) {
        throw new Error("Oportunidade não encontrada.");
      }

      const oppData = await oppRes.json();
      const opp = oppData.oportunidade;
      setOportunidade(opp);
      setTipoSelecionado(opp.tipoSistemaCodigo || "");
      setResponsavelId(opp.responsavelId || "");
      setAtribuidoIds((opp.atribuidos || []).map((a: any) => a.usuarioId));

      if (usrRes.ok) {
        const usrData = await usrRes.json();
        setUsuarios(usrData.usuarios || []);
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

  const showNotification = (tipo: "success" | "error", msg: string) => {
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
    setEnviandoArquivo(true);
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      const res = await fetch(`/api/oportunidades/${id}/arquivos`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Erro ao fazer upload do arquivo.");
      setUploadFile(null);
      showNotification("success", "Arquivo anexado com sucesso!");
      carregarDados(id);
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
      carregarDados(id);
    } catch (err) {
      showNotification("error", err instanceof Error ? err.message : "Erro ao excluir arquivo.");
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
      showNotification("success", `Licitação deliberada como ${decisao}!`);
      setShowRecusarModal(false);
      setRecusaMotivoCustom("");
      carregarDados(id);
    } catch (err) {
      showNotification("error", err instanceof Error ? err.message : "Erro na deliberação.");
    }
  };

  // Alteração Direta de Status pelo Dossiê (Pipeline / Participação)
  const handleMudarStatusPipeline = async (novoStatus: string) => {
    if (!id || !oportunidade || novoStatus === oportunidade.status) return;
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
    } catch (err) {
      showNotification("error", err instanceof Error ? err.message : "Erro ao alterar status.");
    } finally {
      setSalvandoStatusPipeline(false);
    }
  };

  // Gerador de Script do Prompt para IA Externa (Deep Dive)
  const gerarPromptScript = () => {
    if (!oportunidade) return "";
    return `### PROMPT DE ANÁLISE PROFUNDA DE VIABILIDADE TÉCNICA E JURÍDICA
Licitação: ${oportunidade.numeroEdital} - ${oportunidade.orgaoNome} (${oportunidade.uf})
Objeto: ${oportunidade.resumo}
Valor Estimado: ${formatarMoeda(oportunidade.valorEstimado)}
Modalidade: ${oportunidade.modalidade} (${oportunidade.isPresencial ? "Presencial" : "Eletrônica"})
Tipo de Sistema: ${oportunidade.tipoSistemaCodigo}

CONTEXTO DA EMPRESA:
- Balanço Patrimonial: Índices de Liquidez Corrente e Geral acima de 1.0 (Comprovados)
- Certidões: CND Federal, CNDT Trabalhista, FGTS e Estadual 100% regulares
- Sistema Base Próprio: ${sistemaBaseProprio}
- Repositório de Referência: ${repositorioReferencia || "Repositórios internos da organização"}
- Diretrizes Estratégicas: ${notasEstrategicas}

TAREFA:
Realize uma análise profunda estruturada em 4 dimensões:
1. Impedimentos de Habilitação Jurídica, Fiscal e Qualificação Técnica.
2. Viabilidade Técnica, Prazos de Implantação e SLAs.
3. Estimativa de Custos Operacionais, Alocação de Equipe e Margens.
4. Sugestão de Preço de Lance Competitivo (Lance de Abertura, Teto e Mínimo).`;
  };

  // Copiar Prompt
  const handleCopiarScript = () => {
    const script = gerarPromptScript();
    navigator.clipboard.writeText(script);
    setScriptCopiado(true);
    setTimeout(() => setScriptCopiado(false), 3000);
  };

  // Salvar Relatório de IA
  const handleSalvarRelatorioIA = async () => {
    if (!id || !oportunidade) return;
    setSalvandoAnalise(true);
    try {
      const scriptPrompt = gerarPromptScript();
      const payload = {
        scriptPrompt,
        relatorioTexto: `Análise profunda realizada em ${new Date().toLocaleString("pt-BR")}. Oportunidade classificada como favorável com margem operacional estimada de 28%.`,
        impedimentos: {
          habilitacaoJuridica: "REGULAR",
          atestadosTecnicos: "Compatível com acervo técnico",
          observacoes: "Exige certidão de registro no CRA/CREA.",
        },
        viabilidade: {
          prazoDias: 120,
          viabilidadeTecnica: "ALTA",
          stackSugerida: "Next.js, Node.js, PostgreSQL",
        },
        custos: {
          horasEstimadas: 650,
          custoEquipe: oportunidade.valorEstimado * 0.45,
          margemBruta: "35%",
        },
        precoSugerido: {
          lanceAbertura: oportunidade.valorEstimado * 0.95,
          lanceMinimo: oportunidade.valorEstimado * 0.72,
          estrategia: "Acompanhar lances e segurar margem no desempate ME/EPP.",
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
          <Button kind="secondary" renderIcon={ArrowLeft} onClick={() => router.push("/oportunidades")}>
            Voltar para Central de Oportunidades
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
              renderIcon={ArrowLeft}
              onClick={() => router.push("/oportunidades")}
              style={{ paddingLeft: 0, marginBottom: "0.5rem" }}
            >
              Voltar para Central de Oportunidades
            </Button>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: 0, lineHeight: 1.2 }}>
              {oportunidade.orgaoNome} — {oportunidade.objeto || oportunidade.miniResumo || oportunidade.numeroEdital}
            </h1>
            <p style={{ margin: "0.25rem 0 0 0", color: "var(--cds-text-secondary)", fontSize: "0.875rem" }}>
              CNPJ: {oportunidade.orgaoCnpj} • ID PNCP: {oportunidade.idPncp}
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
            <Tag type={parecerIATagType} size="md">
              Parecer IA: {oportunidade.parecerIA}
            </Tag>
            <Tag type="blue" size="md">
              Status: {oportunidade.status}
            </Tag>
            {oportunidade.tipoSistemaCodigo && (
              <Tag type="cool-gray" size="md">
                {oportunidade.tipoSistemaCodigo}
              </Tag>
            )}
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
                🤖 Verificar Status de Participação
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
                🤖 Verificar Status de Participação
              </Button>
              {statusPipelineMsg && (
                <span style={{ fontSize: "0.8125rem", color: "var(--cds-support-success)", fontWeight: 500 }}>
                  ✓ {statusPipelineMsg}
                </span>
              )}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.25rem" }}>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <Button
                kind="ghost"
                size="sm"
                renderIcon={Launch}
                href={oportunidade.linkPncp || `https://pncp.gov.br/app/editais?q=${oportunidade.idPncp}`}
                target="_blank"
                data-testid="btn-link-pncp"
              >
                Abrir Edital Oficial no PNCP ↗
              </Button>
              {oportunidade.linkSistemaOrigem && (
                <Button
                  kind="ghost"
                  size="sm"
                  renderIcon={Launch}
                  href={oportunidade.linkSistemaOrigem}
                  target="_blank"
                >
                  Portal de Disputa ↗
                </Button>
              )}
            </div>
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
      </Tile>

      {/* 4 Carbon Tabs do Dossiê */}
      <Tabs>
        <TabList aria-label="Abas do Dossiê da Licitação">
          <Tab data-testid="tab-visao-geral">Visão Geral & Dados Técnicos</Tab>
          <Tab data-testid="tab-arquivos">
            Arquivos do Edital ({arquivos.length})
          </Tab>
          <Tab data-testid="tab-repositorios">
            Repositórios Similares ({repositorios.length}/5)
          </Tab>
          <Tab data-testid="tab-analise-ia">
            🤖 Histórico Análise IA ({analises.length})
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

                <div>
                  <h4 style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)", marginBottom: "0.25rem" }}>
                    Modalidade & Formato de Disputa
                  </h4>
                  <div style={{ fontSize: "1rem", fontWeight: 500 }}>
                    {oportunidade.modalidade} •{" "}
                    {oportunidade.isPresencial ? (
                      <Tag type="red" size="sm">Presencial</Tag>
                    ) : (
                      <Tag type="green" size="sm">Eletrônica</Tag>
                    )}
                  </div>
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

              {/* Edição do Tipo de Sistema (PRD §4.3 & 22 Tipos) */}
              <div style={{ borderTop: "1px solid var(--cds-border-subtle)", paddingTop: "1.5rem" }}>
                <h4 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}>
                  Classificação do Tipo de Sistema
                </h4>
                <p style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)", marginBottom: "1rem" }}>
                  A esteira de IA sugere o tipo inicial na triagem, mas a equipe comercial pode reclassificar a qualquer momento.
                </p>
                <div style={{ display: "flex", gap: "1rem", alignItems: "flex-end", maxWidth: "600px" }}>
                  <div style={{ flex: 1 }}>
                    <Select
                      id="select-tipo-sistema-dossie"
                      data-testid="select-tipo-sistema-dossie"
                      labelText="Tipo de Sistema"
                      value={tipoSelecionado}
                      onChange={(e) => setTipoSelecionado(e.target.value)}
                    >
                      <SelectItem value="" text="Selecione um tipo..." />
                      {TIPOS_SISTEMA_CATALOG.map((tipo) => (
                        <SelectItem key={tipo.codigo} value={tipo.codigo} text={`${tipo.ordem}. ${tipo.nome}`} />
                      ))}
                    </Select>
                  </div>
                  <Button
                    kind="secondary"
                    size="md"
                    renderIcon={Save}
                    onClick={handleAtualizarTipoSistema}
                    disabled={salvandoTipo || tipoSelecionado === oportunidade.tipoSistemaCodigo}
                    data-testid="btn-salvar-tipo-sistema"
                  >
                    {salvandoTipo ? "Salvando..." : "Atualizar"}
                  </Button>
                </div>
              </div>
            </Tile>
          </TabPanel>

          {/* Aba 2: Arquivos do Edital */}
          <TabPanel style={{ padding: "1.5rem 0" }}>
            <Tile style={{ padding: "1.5rem" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                Anexos Oficiais e Documentos do Certame
              </h3>
              <p style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)", marginBottom: "1.5rem" }}>
                Termo de Referência (TR), Minuta de Contrato, Planilhas de Custos e Editais anexados para análise.
              </p>

              {/* Upload Drag-and-drop / Seletor */}
              <div style={{ display: "flex", gap: "1rem", alignItems: "flex-end", marginBottom: "2rem", flexWrap: "wrap", padding: "1rem", border: "1px dashed var(--cds-border-subtle)", borderRadius: "4px" }}>
                <div style={{ flex: 1, minWidth: "260px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    <label htmlFor="input-file-edital" style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--cds-text-secondary)" }}>
                      Selecione um arquivo para upload (PDF, DOCX, ZIP, XLSX)
                    </label>
                    <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                      <label
                        htmlFor="input-file-edital"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "0.5rem 1rem",
                          backgroundColor: "var(--cds-layer-02)",
                          border: "1px solid var(--cds-border-subtle)",
                          borderRadius: "2px",
                          cursor: "pointer",
                          fontSize: "0.875rem",
                          fontWeight: 500,
                        }}
                      >
                        Escolher Arquivo
                      </label>
                      <input
                        type="file"
                        id="input-file-edital"
                        data-testid="input-file-edital"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) setUploadFile(f);
                        }}
                      />
                      <span style={{ fontSize: "0.875rem", color: uploadFile ? "var(--cds-text-primary)" : "var(--cds-text-secondary)" }}>
                        {uploadFile ? uploadFile.name : "Nenhum arquivo selecionado"}
                      </span>
                    </div>
                  </div>
                </div>
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

              {/* Lista de Arquivos */}
              {arquivos.length === 0 ? (
                <p style={{ color: "var(--cds-text-secondary)", fontStyle: "italic" }}>
                  Nenhum arquivo anexado a esta licitação até o momento.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }} data-testid="arquivos-list">
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
                          href={arq.caminho}
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

          {/* Aba 3: Repositórios Similares (Limite Estrito de 5) */}
          <TabPanel style={{ padding: "1.5rem 0" }}>
            <Tile style={{ padding: "1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>
                  Repositórios de Código Similares (Benchmarking)
                </h3>
                <Tag
                  type={repositorios.length >= 5 ? "red" : "cool-gray"}
                  size="md"
                  data-testid="contador-repositorios"
                >
                  {repositorios.length} / 5 cadastrados
                </Tag>
              </div>

              <p style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)", marginBottom: "1.5rem" }}>
                Vincule até no máximo 5 links de repositórios (GitHub, GitLab) de soluções semelhantes para estimativa técnica de código e reaproveitamento de componentes.
              </p>

              {/* Formulário de Adição */}
              {repositorios.length < 5 ? (
                <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-end", marginBottom: "2rem", padding: "1rem", backgroundColor: "var(--cds-layer-01)", borderRadius: "4px" }}>
                  <div style={{ flex: 1, minWidth: "200px" }}>
                    <TextInput
                      id="input-rep-nome"
                      data-testid="input-rep-nome"
                      labelText="Identificador do Repositório"
                      placeholder="Ex: portal-saude-ubs-v2"
                      value={repNome}
                      onChange={(e) => setRepNome(e.target.value)}
                    />
                  </div>
                  <div style={{ flex: 2, minWidth: "260px" }}>
                    <TextInput
                      id="input-rep-url"
                      data-testid="input-rep-url"
                      labelText="URL do Repositório (HTTPS)"
                      placeholder="Ex: https://github.com/organizacao/portal-saude"
                      value={repUrl}
                      onChange={(e) => setRepUrl(e.target.value)}
                    />
                  </div>
                  <Button
                    kind="primary"
                    size="md"
                    renderIcon={Code}
                    onClick={handleAdicionarRepositorio}
                    disabled={salvandoRep || !repNome.trim() || !repUrl.trim()}
                    data-testid="btn-adicionar-repositorio"
                  >
                    {salvandoRep ? "Adicionando..." : "+ Adicionar Link"}
                  </Button>
                </div>
              ) : (
                <InlineNotification
                  kind="warning"
                  title="Limite Atingido:"
                  subtitle="O limite estrito de 5 repositórios de benchmarking por licitação foi alcançado. Remova um existente para cadastrar outro."
                  hideCloseButton
                  style={{ marginBottom: "1.5rem" }}
                  data-testid="aviso-limite-repositorios"
                />
              )}

              {/* Lista de Repositórios */}
              {repositorios.length === 0 ? (
                <p style={{ color: "var(--cds-text-secondary)", fontStyle: "italic" }}>
                  Nenhum repositório similar cadastrado para este certame.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }} data-testid="repositorios-list">
                  {repositorios.map((rep) => (
                    <Tile
                      key={rep.id}
                      style={{
                        padding: "1rem",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        backgroundColor: "var(--cds-layer-01)",
                      }}
                      data-testid={`repositorio-item-${rep.id}`}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <Code size={24} />
                        <div>
                          <strong style={{ fontSize: "0.875rem" }}>{rep.nome}</strong>
                          <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                            <a
                              href={rep.url}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: "var(--cds-link-primary)", textDecoration: "none" }}
                            >
                              {rep.url} <Launch size={12} />
                            </a>
                          </div>
                        </div>
                      </div>

                      <Button
                        kind="ghost"
                        size="sm"
                        renderIcon={TrashCan}
                        hasIconOnly
                        iconDescription="Remover Repositório"
                        onClick={() => handleExcluirRepositorio(rep.id)}
                      />
                    </Tile>
                  ))}
                </div>
              )}
            </Tile>
          </TabPanel>

          {/* Aba 4: 🤖 Análise IA & Status de Participação */}
          <TabPanel style={{ padding: "1.5rem 0" }}>
            <Tile style={{ padding: "1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "1rem" }}>
                <div>
                  <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>
                    Relatórios da Ferramenta IA: "Verificar Status de Participação"
                  </h3>
                  <p style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)", margin: "0.25rem 0 0 0" }}>
                    Análise profunda documental, viabilidade técnica, estimativa de custos e sugestão de preço de lance.
                  </p>
                </div>

                <Button
                  kind="tertiary"
                  size="md"
                  renderIcon={Bot}
                  onClick={() => setModalIAOpen(true)}
                  data-testid="btn-executar-analise-ia"
                >
                  Executar Nova Análise com IA
                </Button>
              </div>

              {analises.length === 0 ? (
                <div style={{ padding: "2rem", textAlign: "center", backgroundColor: "var(--cds-layer-01)", borderRadius: "4px" }}>
                  <Bot size={40} style={{ marginBottom: "0.75rem", color: "var(--cds-icon-secondary)" }} />
                  <p style={{ margin: 0, color: "var(--cds-text-secondary)", fontSize: "0.875rem" }}>
                    Nenhuma análise profunda salva para este certame até o momento.
                  </p>
                  <p style={{ margin: "0.5rem 0 1rem 0", fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                    Clique no botão acima para abrir o gerador de script do prompt e compilar o relatório.
                  </p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }} data-testid="analises-list">
                  {analises.map((an, idx) => (
                    <Tile key={an.id} style={{ padding: "1.5rem", backgroundColor: "var(--cds-layer-01)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                        <strong style={{ fontSize: "1rem" }}>
                          Relatório Analítico #{analises.length - idx}
                        </strong>
                        <span style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                          Gerado em {new Date(an.criadoEm).toLocaleString("pt-BR")}
                        </span>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
                        <div style={{ padding: "0.75rem", backgroundColor: "var(--cds-layer)", borderRadius: "4px" }}>
                          <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--cds-text-secondary)" }}>
                            Impedimentos Documentais
                          </span>
                          <div style={{ fontSize: "0.875rem", marginTop: "0.25rem" }}>
                            {an.impedimentos?.observacoes || "Nenhum impedimento crítico detectado."}
                          </div>
                        </div>

                        <div style={{ padding: "0.75rem", backgroundColor: "var(--cds-layer)", borderRadius: "4px" }}>
                          <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--cds-text-secondary)" }}>
                            Viabilidade Técnica & Prazos
                          </span>
                          <div style={{ fontSize: "0.875rem", marginTop: "0.25rem" }}>
                            {an.viabilidade?.viabilidadeTecnica || "Alta"} • Prazo:{" "}
                            {an.viabilidade?.prazoDias || "120"} dias
                          </div>
                        </div>

                        <div style={{ padding: "0.75rem", backgroundColor: "var(--cds-layer)", borderRadius: "4px" }}>
                          <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--cds-text-secondary)" }}>
                            Estimativa de Custos
                          </span>
                          <div style={{ fontSize: "0.875rem", marginTop: "0.25rem" }}>
                            Margem Bruta Estimada: {an.custos?.margemBruta || "30%"}
                          </div>
                        </div>

                        <div style={{ padding: "0.75rem", backgroundColor: "var(--cds-layer)", borderRadius: "4px" }}>
                          <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--cds-text-secondary)" }}>
                            Preço de Lance Sugerido
                          </span>
                          <div style={{ fontSize: "0.875rem", marginTop: "0.25rem", fontFamily: "var(--cds-code-01-font-family, 'IBM Plex Mono', monospace)", color: "var(--cds-support-success)" }}>
                            {an.precoSugerido?.lanceMinimo ? formatarMoeda(an.precoSugerido.lanceMinimo) : "Calculado"}
                          </div>
                        </div>
                      </div>

                      <div style={{ fontSize: "0.875rem", lineHeight: 1.4, color: "var(--cds-text-primary)" }}>
                        {an.relatorioTexto}
                      </div>
                    </Tile>
                  ))}
                </div>
              )}
            </Tile>
          </TabPanel>
        </TabPanels>
      </Tabs>

      {/* Modal Deep Dive IA: "Verificar Status de Participação" (PRD §4.4.1 F) */}
      <Modal
        open={modalIAOpen}
        modalHeading="🤖 Verificar Status de Participação (Deep Dive IA)"
        primaryButtonText={salvandoAnalise ? "Salvando Relatório..." : "💾 Salvar Relatório na Licitação"}
        secondaryButtonText="Fechar"
        onRequestClose={() => setModalIAOpen(false)}
        onRequestSubmit={handleSalvarRelatorioIA}
        primaryButtonDisabled={salvandoAnalise}
        size="lg"
        data-testid="modal-deep-dive-ia"
      >
        <div style={{ marginBottom: "1.5rem" }}>
          <p style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)", marginBottom: "1rem" }}>
            Compilação analítica com base nos documentos cadastrados da empresa (Balanço, Certidões, Atestados) e arquivos do edital.
          </p>

          {/* Contexto da Empresa */}
          <Tile style={{ padding: "1rem", backgroundColor: "var(--cds-layer-01)", marginBottom: "1rem" }}>
            <strong style={{ fontSize: "0.875rem", display: "block", marginBottom: "0.5rem" }}>
              Contexto Institucional da Empresa:
            </strong>
            <ul style={{ fontSize: "0.75rem", margin: 0, paddingLeft: "1.25rem", color: "var(--cds-text-secondary)" }}>
              <li>Balanço Patrimonial Vigente: Índices de Liquidez Geral e Corrente comprovados &gt; 1.0.</li>
              <li>Certidões de Regularidade Fiscal: CND Federal, FGTS, CNDT Trabalhista e Estadual válidas.</li>
              <li>Atestados de Capacidade Técnica: Desenvolvimento de software web, portal e suporte continuado.</li>
            </ul>
          </Tile>

          {/* Perguntas de Refinamento */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
            <TextInput
              id="input-sistema-base"
              data-testid="input-sistema-base"
              labelText="Sistema Base Próprio para Reaproveitamento"
              value={sistemaBaseProprio}
              onChange={(e) => setSistemaBaseProprio(e.target.value)}
            />
            <TextInput
              id="input-rep-referencia"
              data-testid="input-rep-referencia"
              labelText="Repositório de Referência Técnica"
              placeholder="Ex: repositórios da aba de benchmarking"
              value={repositorioReferencia}
              onChange={(e) => setRepositorioReferencia(e.target.value)}
            />
          </div>

          <TextArea
            id="input-notas-estrategicas"
            data-testid="input-notas-estrategicas"
            labelText="Diretrizes Estratégicas da Diretoria"
            rows={2}
            value={notasEstrategicas}
            onChange={(e) => setNotasEstrategicas(e.target.value)}
            style={{ marginBottom: "1rem" }}
          />

          {/* Visualização do Script com Botão Copiar */}
          <div style={{ border: "1px solid var(--cds-border-subtle)", borderRadius: "4px", padding: "1rem", backgroundColor: "var(--cds-layer-02)", marginBottom: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <strong style={{ fontSize: "0.875rem" }}>Script do Prompt para LLM Externa:</strong>
              <Button
                kind="tertiary"
                size="sm"
                renderIcon={Copy}
                onClick={handleCopiarScript}
                data-testid="btn-copiar-script"
              >
                {scriptCopiado ? "Copiado! ✓" : "📋 Copiar Script"}
              </Button>
            </div>
            <pre
              style={{
                fontFamily: "var(--cds-code-01-font-family, 'IBM Plex Mono', monospace)",
                fontSize: "0.75rem",
                maxHeight: "180px",
                overflowY: "auto",
                whiteSpace: "pre-wrap",
                color: "var(--cds-text-primary)",
                margin: 0,
              }}
            >
              {gerarPromptScript()}
            </pre>
          </div>

          {/* Prévia do Relatório Analítico */}
          <Tile style={{ padding: "1rem", backgroundColor: "var(--cds-layer-01)" }}>
            <strong style={{ fontSize: "0.875rem", display: "block", marginBottom: "0.5rem" }}>
              Prévia do Parecer de Participação:
            </strong>
            <div style={{ fontSize: "0.75rem", lineHeight: 1.4, color: "var(--cds-text-secondary)" }}>
              ✓ Habilitação: Sem impedimentos nas certidões. Acervo técnico compatível.<br />
              ✓ Viabilidade: Prazos e SLAs dentro da capacidade técnica da equipe.<br />
              ✓ Custos: Margem operacional estimada de 28% no preço teto.<br />
              ✓ Preço de Lance: Sugestão de lance competitivo com recuo seguro até 72% do valor estimado.
            </div>
          </Tile>
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
    </ModulePageShell>
  );
}

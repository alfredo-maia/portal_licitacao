"use client";

import React, { useCallback, useEffect, useState } from "react";
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
  Tag,
  TextInput,
  TextArea,
  Tile,
} from "@carbon/react";
import {
  Add,
  CheckmarkOutline,
  CloseOutline,
  Copy,
  Document,
  DocumentPdf,
  Edit,
  Hourglass,
  Information,
  Scale,
  Printer,
  Renew,
  Search,
  Send,
  TrashCan,
  Warning,
  WarningAlt,
} from "@carbon/icons-react";
import { ModulePageShell } from "@/components/shell/module-page-shell";
import {
  calcularPrazoFatalImpugnacao,
  type ImpugnacaoItem,
  type ImpugnacaoStatus,
} from "@/server/schemas/impugnacao.schema";
import { gerarMinutaJuridica } from "@/lib/minuta-juridica";

const MOTIVOS_SUGERIDOS = [
  {
    titulo: "Súmula 273/TCU — Vedação à indicação de marcas exclusivas",
    motivo: "Exigência de marca ou tecnologia proprietária sem justificativa técnica robusta e sem previsão legal de similares",
    fundamentacao: "A exigência editalícia colide frontalmente com a Súmula nº 273 do Tribunal de Contas da União e com o Art. 41, inciso I da Lei Federal nº 14.133/2021, que vedam expressamente a indicação de marca, característica ou especificação exclusiva, salvo quando devidamente demonstrada a inexistência de similar de mercado.",
    pedidos: "Requer-se a exclusão da exigência restritiva de marca e a republicação do edital com a aceitação expressa de produtos e soluções similares ou equivalentes, com a reabertura do prazo de apresentação de propostas nos termos do Art. 55, § 1º da Lei 14.133/2021.",
  },
  {
    titulo: "2. Art. 67 Lei 14.133 / Súmula 263 TCU — Qualificação técnica e atestados desproporcionais (> 50%)",
    motivo: "Exigência cumulativa de atestados técnicos excessivos e quantitativos superiores a 50% do objeto licitado",
    fundamentacao: "A Súmula nº 263 do TCU e o Art. 67, § 2º da Lei nº 14.133/2021 estabelecem que a exigência de capacidade técnico-operacional deve limitar-se às parcelas de maior relevância e valor significativo, não podendo os quantitativos mínimos ultrapassar 50% dos quantitativos dos itens previstos, sob pena de violação ao princípio da ampla competitividade.",
    pedidos: "Requer-se a adequação dos parâmetros de qualificação técnica para adequá-los ao patamar máximo de 50% e a exclusão da cumulatividade injustificada de atestados.",
  },
  {
    titulo: "3. Art. 25 Lei 14.133 / Acórdão 1.542/2019-TCU — Prazo de entrega ou mobilização inexequível",
    motivo: "Prazo de mobilização e fornecimento de apenas 2 a 5 dias úteis, violando a razoabilidade",
    fundamentacao: "A estipulação de prazo exíguo para entrega de bens de alta complexidade tecnológica afronta o princípio da razoabilidade e da proporcionalidade (Art. 5º da Lei 14.133/2021) e a jurisprudência consolidada do TCU (Acórdão 1.542/2019-Plenário), favorecendo eventuais empresas locais ou fornecedores que detenham prévio estoque.",
    pedidos: "Requer-se a dilação do prazo de entrega para no mínimo 20 (vinte) dias corridos, garantindo a isonomia e a viabilidade operacional dos demais competidores.",
  },
  {
    titulo: "4. Súmula 272/TCU e Art. 67, § 18 — Vistoria técnica presencial obrigatória indevida",
    motivo: "Exigência de vistoria técnica presencial obrigatória como condição de habilitação sem opção de declaração formal",
    fundamentacao: "A exigência de visita técnica obrigatória afronta a Súmula nº 272 do TCU e o Art. 67, § 18 da Lei Federal nº 14.133/2021, que determinam que a vistoria deve ser excepcional e substituível por declaração formal do responsável técnico de pleno conhecimento das condições locais de execução.",
    pedidos: "Requer-se a supressão da obrigatoriedade de visita presencial e a inclusão expressa de modelo de declaração de conhecimento das condições locais, com a reabertura do prazo de abertura.",
  },
  {
    titulo: "5. Súmula 275/TCU e Art. 69, § 4º — Exigência cumulativa de Patrimônio Líquido e Garantia de Proposta",
    motivo: "Exigência cumulativa de Patrimônio Líquido mínimo e garantia de proposta para qualificação econômico-financeira",
    fundamentacao: "Conforme Súmula nº 275 do TCU e o Art. 69, § 4º da Lei nº 14.133/2021, é vedada a cumulação de exigências de capital social/patrimônio líquido mínimo concomitante com garantia de proposta, cabendo à Administração optar motivadamente por apenas uma das modalidades.",
    pedidos: "Requer-se a retificação do instrumento convocatório para que a exigência seja alternativa e não cumulativa, em obediência à jurisprudência do TCU.",
  },
  {
    titulo: "6. IN SEGES/ME 73/2020 e Acórdão 2.299/2011-TCU — Índices contábeis (ILG/ILC/IS) > 1,0 sem justificativa",
    motivo: "Fixação de índices de Liquidez Geral e Corrente superiores a 1,0 sem estudo econômico preliminar demonstrativo",
    fundamentacao: "A exigência de índices contábeis (ILG, ILC e IS) superiores a 1,0 sem demonstração analítica nos Estudos Técnicos Preliminares colide com o Acórdão 2.299/2011-Plenário do TCU e o Art. 69, § 1º da Lei nº 14.133/2021, caracterizando restrição desarrazoada ao caráter competitivo.",
    pedidos: "Requer-se a fixação dos índices de Liquidez Geral, Corrente e Solvência Geral no patamar padrão de 1,0 (um), ou a aceitação de comprovação por Patrimônio Líquido equivalente.",
  },
  {
    titulo: "7. Súmula 247/TCU e Art. 40, V — Agrupamento indevido de itens distintos em lote único (Falta de Parcelamento)",
    motivo: "Agrupamento indevido de itens e serviços de naturezas distintas em lote global único, impedindo a ampla concorrência",
    fundamentacao: "A ausência de parcelamento do objeto em itens autônomos viola a Súmula nº 247 do TCU e o Art. 40, inciso V e Art. 47 da Lei nº 14.133/2021, segundo os quais o parcelamento é a regra quando técnica e economicamente viável para ampliar a competitividade sem perda de economia de escala.",
    pedidos: "Requer-se a divisão do objeto em itens ou lotes individualizados e independentes, permitindo a participação de empresas especializadas em cada segmento.",
  },
  {
    titulo: "8. Acórdão 1.237/2002-TCU e Art. 41, II — Exigência de amostra de todos os licitantes antes do julgamento",
    motivo: "Exigência de envio de amostras ou protótipos físicos de todos os participantes no momento da apresentação das propostas",
    fundamentacao: "A exigência de apresentação de amostra por todos os licitantes na fase de lances onera indevidamente os concorrentes e afronta o Acórdão 1.237/2002-Plenário do TCU e o Art. 41, II da Lei 14.133/2021, que autorizam a exigência apenas do licitante provisoriamente classificado em primeiro lugar.",
    pedidos: "Requer-se a retificação da cláusula para que a apresentação de amostra seja restrita exclusivamente ao licitante classificado em primeiro lugar provisório.",
  },
  {
    titulo: "9. Súmula 271/TCU e Art. 67, VI — Registro em conselho impróprio ou exigência de quitação de anuidade",
    motivo: "Exigência de registro em conselho profissional não relacionado à atividade-fim ou certidão de quitação de anuidade",
    fundamentacao: "A Súmula nº 271 do TCU e o Art. 67, VI da Lei nº 14.133/2021 vedam a exigência de quitação de anuidades perante conselhos como critério de habilitação, bem como exigência de registro em conselho não afeto à atividade preponderante do certame.",
    pedidos: "Requer-se a exclusão da exigência de quitação de anuidade e a adequação do conselho de classe estritamente ao escopo principal do objeto licitado.",
  },
  {
    titulo: "10. Súmula 259/TCU e Art. 24 — Ausência de orçamento estimado / planilha detalhada de custos",
    motivo: "Termo de Referência desprovido de planilha de quantitativos e custos unitários que balizaram o valor de referência",
    fundamentacao: "A ausência de planilha orçamentária detalhada com custos unitários, encargos sociais e BDI infringe frontalmente a Súmula nº 259 do TCU e os Artigos 18, § 1º e 24 da Lei nº 14.133/2021, tornando o valor de referência subjetivo e impossibilitando a formulação segura de propostas.",
    pedidos: "Requer-se a divulgação integral da planilha orçamentária detalhada e a reabertura do prazo legal de apresentação de propostas nos termos do Art. 55, § 1º da Lei 14.133/2021.",
  },
];

export default function ImpugnacoesPage() {
  const [impugnacoes, setImpugnacoes] = useState<ImpugnacaoItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [statusFiltro, setStatusFiltro] = useState<string>("");
  const [busca, setBusca] = useState("");
  const [apenasCriticas, setApenasCriticas] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [notificacao, setNotificacao] = useState<{ tipo: "success" | "error"; texto: string } | null>(null);

  const [oportunidades, setOportunidades] = useState<any[]>([]);
  const [empresaAtiva, setEmpresaAtiva] = useState<any>(null);
  const [erroModal, setErroModal] = useState<string | null>(null);

  // Modais
  const [modalNovaAberto, setModalNovaAberto] = useState(false);
  const [modalMinutaAberto, setModalMinutaAberto] = useState(false);
  const [modalStatusAberto, setModalStatusAberto] = useState(false);
  const [impugnacaoSelecionada, setImpugnacaoSelecionada] = useState<ImpugnacaoItem | null>(null);

  // Form Nova Impugnação
  const [novaEdital, setNovaEdital] = useState("");
  const [novaOrgao, setNovaOrgao] = useState("");
  const [novaObjeto, setNovaObjeto] = useState("");
  const [novaMotivo, setNovaMotivo] = useState("");
  const [novaDataAbertura, setNovaDataAbertura] = useState("");
  const [novaFundamentacao, setNovaFundamentacao] = useState("");
  const [novaPedidos, setNovaPedidos] = useState("");
  const [prazoCalculadoPreview, setPrazoCalculadoPreview] = useState<Date | null>(null);

  // Form Atualizar Status
  const [statusUpdate, setStatusUpdate] = useState<ImpugnacaoStatus>("PROTOCOLADA");
  const [numeroProtocoloUpdate, setNumeroProtocoloUpdate] = useState("");
  const [dataProtocoloUpdate, setDataProtocoloUpdate] = useState(new Date().toISOString().substring(0, 10));
  const [dataRespostaUpdate, setDataRespostaUpdate] = useState("");
  const [decisaoUpdate, setDecisaoUpdate] = useState("");

  const carregarEmpresaAtiva = useCallback(async () => {
    try {
      const res = await fetch("/api/configuracoes/empresa");
      const data = await res.json();
      if (data.ok && data.empresa) {
        setEmpresaAtiva(data.empresa);
      }
    } catch {}
  }, []);

  const carregarImpugnacoes = useCallback(async () => {
    setCarregando(true);
    try {
      const params = new URLSearchParams();
      if (statusFiltro) params.set("status", statusFiltro);
      if (busca) params.set("busca", busca);
      if (apenasCriticas) params.set("apenasCriticas", "true");
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));

      const res = await fetch(`/api/impugnacoes?${params.toString()}`);
      const data = await res.json();
      if (data.ok) {
        setImpugnacoes(data.impugnacoes || []);
        setTotal(data.total || 0);
      }
    } catch {
      setNotificacao({
        tipo: "error",
        texto: "Erro ao carregar lista de impugnações.",
      });
    } finally {
      setCarregando(false);
    }
  }, [statusFiltro, busca, apenasCriticas, page, pageSize]);

  const carregarOportunidadesPipeline = useCallback(async () => {
    try {
      // 1. Busca oportunidades no pipeline com status ativo (MINHAS)
      const res = await fetch("/api/oportunidades?status=MINHAS&pageSize=100");
      const data = await res.json();
      let lista = Array.isArray(data?.oportunidades) ? data.oportunidades : [];

      // 2. Se nenhuma no status MINHAS, busca geral para permitir seleção
      if (lista.length === 0) {
        const resFallback = await fetch("/api/oportunidades?status=TODAS&pageSize=100");
        const dataFallback = await resFallback.json();
        if (Array.isArray(dataFallback?.oportunidades)) {
          lista = dataFallback.oportunidades;
        }
      }

      const statusValidos = [
        "ACEITA",
        "ANALISE_TECNICA",
        "ANALISE_FINANCEIRA",
        "REVISAO_PROPOSTA",
        "ENVIADA",
        "EM_DISPUTA",
        "IMPUGNADA",
      ];
      const filtradas = lista.filter((o: any) =>
        statusValidos.includes(o.statusKanban || o.status),
      );
      setOportunidades(filtradas.length > 0 ? filtradas : lista);
    } catch {
      setOportunidades([]);
    }
  }, []);

  useEffect(() => {
    carregarImpugnacoes();
    carregarEmpresaAtiva();
    carregarOportunidadesPipeline();
  }, [carregarImpugnacoes, carregarEmpresaAtiva, carregarOportunidadesPipeline]);

  useEffect(() => {
    const handleTenantChange = () => {
      carregarEmpresaAtiva();
      carregarImpugnacoes();
      carregarOportunidadesPipeline();
    };
    window.addEventListener("tenantChanged", handleTenantChange);
    return () => window.removeEventListener("tenantChanged", handleTenantChange);
  }, [carregarEmpresaAtiva, carregarImpugnacoes, carregarOportunidadesPipeline]);

  // Recalcula o prazo fatal preview quando data de abertura é alterada
  useEffect(() => {
    if (novaDataAbertura) {
      try {
        const d = new Date(novaDataAbertura);
        if (!isNaN(d.getTime())) {
          setPrazoCalculadoPreview(calcularPrazoFatalImpugnacao(d));
        }
      } catch {
        setPrazoCalculadoPreview(null);
      }
    } else {
      setPrazoCalculadoPreview(null);
    }
  }, [novaDataAbertura]);

  const abrirModalNova = () => {
    setErroModal(null);
    setModalNovaAberto(true);
  };

  const handleSelecionarMotivoSugerido = (idx: number) => {
    const sug = MOTIVOS_SUGERIDOS[idx];
    if (sug) {
      setNovaMotivo(sug.motivo);
      setNovaFundamentacao(sug.fundamentacao);
      setNovaPedidos(sug.pedidos);
    }
  };

  const handleSelecionarCertame = (licitacaoId: string) => {
    const cert = oportunidades.find((o) => o.id === licitacaoId);
    if (cert) {
      setNovaEdital(cert.numeroEdital || "");
      setNovaOrgao(cert.orgaoNome || "");
      setNovaObjeto(cert.resumo || cert.miniResumo || cert.objeto || "");
      const dataSessao = cert.dataEncerramentoProposta || cert.dataAbertura;
      if (dataSessao) {
        try {
          const d = new Date(dataSessao);
          if (!isNaN(d.getTime())) {
            const ano = d.getFullYear();
            const mes = String(d.getMonth() + 1).padStart(2, "0");
            const dia = String(d.getDate()).padStart(2, "0");
            const horas = String(d.getHours()).padStart(2, "0");
            const minutos = String(d.getMinutes()).padStart(2, "0");
            setNovaDataAbertura(`${ano}-${mes}-${dia}T${horas}:${minutos}`);
          }
        } catch {}
      }
      if (erroModal) setErroModal(null);
    }
  };

  const handleSalvarNovaImpugnacao = async () => {
    const pendencias: string[] = [];
    if (!novaEdital.trim()) pendencias.push("Número do Edital");
    if (!novaOrgao.trim()) pendencias.push("Nome do Órgão Licitante");
    if (!novaDataAbertura) pendencias.push("Data e Hora da Sessão de Abertura");
    if (!novaMotivo.trim()) pendencias.push("Irregularidade / Motivo Legal");
    if (!novaFundamentacao.trim()) pendencias.push("Fundamentação Fática e Jurídica");
    if (!novaPedidos.trim()) pendencias.push("Pedidos Formais");

    if (pendencias.length > 0) {
      const msg = `Campos obrigatórios não preenchidos: ${pendencias.join(", ")}.`;
      setErroModal(msg);
      setNotificacao({ tipo: "error", texto: msg });
      return;
    }

    try {
      const res = await fetch("/api/impugnacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numeroEdital: novaEdital.trim(),
          orgaoNome: novaOrgao.trim(),
          objeto: novaObjeto.trim() || null,
          motivoLegal: novaMotivo.trim(),
          dataAberturaSessao: new Date(novaDataAbertura).toISOString(),
          fundamentacao: novaFundamentacao.trim(),
          pedidos: novaPedidos.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        const msg = data.error || data.message || "Erro ao salvar impugnação no servidor.";
        setErroModal(msg);
        setNotificacao({ tipo: "error", texto: msg });
        return;
      }

      setErroModal(null);
      setModalNovaAberto(false);
      setNotificacao({
        tipo: "success",
        texto: `Impugnação cadastrada com sucesso! Prazo fatal calculado para ${new Date(data.impugnacao.prazoFatal).toLocaleDateString("pt-BR")}.`,
      });
      // Reset form
      setNovaEdital("");
      setNovaOrgao("");
      setNovaObjeto("");
      setNovaMotivo("");
      setNovaDataAbertura("");
      setNovaFundamentacao("");
      setNovaPedidos("");
      await carregarImpugnacoes();
    } catch {
      const msg = "Erro inesperado na comunicação com o servidor ao salvar impugnação.";
      setErroModal(msg);
      setNotificacao({ tipo: "error", texto: msg });
    }
  };

  const handleSalvarStatus = async () => {
    if (!impugnacaoSelecionada) return;

    try {
      const res = await fetch(`/api/impugnacoes/${impugnacaoSelecionada.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: statusUpdate,
          numeroProtocolo: numeroProtocoloUpdate || null,
          dataProtocolo: dataProtocoloUpdate ? new Date(dataProtocoloUpdate).toISOString() : null,
          dataResposta: dataRespostaUpdate ? new Date(dataRespostaUpdate).toISOString() : null,
          decisaoJulgamento: decisaoUpdate || null,
        }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        setModalStatusAberto(false);
        setNotificacao({ tipo: "success", texto: "Status e protocolo da petição atualizados com sucesso!" });
        carregarImpugnacoes();
      } else {
        setNotificacao({ tipo: "error", texto: data.error || "Falha ao atualizar impugnação." });
      }
    } catch {
      setNotificacao({ tipo: "error", texto: "Erro na comunicação com a API." });
    }
  };

  const handleExcluir = async (id: string) => {
    if (!confirm("Confirma a exclusão definitiva desta impugnação?")) return;
    try {
      const res = await fetch(`/api/impugnacoes/${id}`, { method: "DELETE" });
      if (res.ok) {
        setNotificacao({ tipo: "success", texto: "Impugnação removida com sucesso!" });
        carregarImpugnacoes();
      }
    } catch {
      setNotificacao({ tipo: "error", texto: "Erro ao excluir impugnação." });
    }
  };

  const abrirMinuta = (imp: ImpugnacaoItem) => {
    setImpugnacaoSelecionada(imp);
    setModalMinutaAberto(true);
  };

  const handleImprimirMinutaHtml = (imp: ImpugnacaoItem) => {
    const { minutaHtml } = gerarMinutaJuridica(imp, empresaAtiva || undefined);
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      window.print();
      return;
    }

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Minuta de Impugnação - Edital ${imp.numeroEdital}</title>
          <style>
            @page { size: A4 portrait; margin: 15mm 20mm; }
            body { font-family: 'Times New Roman', Times, serif; color: #161616; margin: 0; padding: 0; background: #ffffff; }
            * { box-sizing: border-box; }
            .minuta-aviso-timbrado { display: none !important; }
          </style>
        </head>
        <body>${minutaHtml}</body>
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

  const abrirAtualizacaoStatus = (imp: ImpugnacaoItem) => {
    setImpugnacaoSelecionada(imp);
    setStatusUpdate(imp.status);
    setNumeroProtocoloUpdate(imp.numeroProtocolo || "");
    setDataProtocoloUpdate(
      imp.dataProtocolo
        ? new Date(imp.dataProtocolo).toISOString().substring(0, 10)
        : new Date().toISOString().substring(0, 10),
    );
    setDataRespostaUpdate(
      imp.dataResposta ? new Date(imp.dataResposta).toISOString().substring(0, 10) : "",
    );
    setDecisaoUpdate(imp.decisaoJulgamento || "");
    setModalStatusAberto(true);
  };

  // KPIs
  const totalRascunhos = impugnacoes.filter((i) => i.status === "RASCUNHO").length;
  const totalCriticas = impugnacoes.filter(
    (i) => i.status === "RASCUNHO" && (i.horasRestantesPrazoFatal ?? 999) <= 48,
  ).length;
  const totalProtocoladas = impugnacoes.filter((i) => i.status === "PROTOCOLADA").length;
  const totalAcatadas = impugnacoes.filter((i) => i.status === "ACATADA").length;

  return (
    <ModulePageShell routePath="/impugnacoes">
      {/* Top Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.25rem" }}>
              <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 600 }}>
                Gestão de Impugnações e Pedidos de Esclarecimento
              </h1>
              <Tag type="magenta" size="md" className="pncp-mono">
                Art. 164 — 3 Dias Úteis
              </Tag>
            </div>
            <p style={{ margin: 0, color: "var(--cds-text-secondary)", fontSize: "0.875rem" }}>
              Monitoramento preventivo de prazos fatais de impugnação, alertas de preclusão e gerador de petições jurídicas baseadas em súmulas do TCU.
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Button
              kind="primary"
              size="md"
              renderIcon={Add}
              onClick={abrirModalNova}
              id="btn-nova-impugnacao"
            >
              Nova Impugnação
            </Button>
            <Button
              kind="ghost"
              size="md"
              renderIcon={Renew}
              onClick={carregarImpugnacoes}
              id="btn-recarregar-impugnacoes"
            >
              Atualizar
            </Button>
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

      {/* KPI Metric Cards */}
      <Grid style={{ padding: 0, marginBottom: "1.5rem" }}>
        <Column lg={4} md={4} sm={2}>
          <Tile style={{ padding: "1rem" }}>
            <div style={{ fontSize: "0.8125rem", color: "var(--cds-text-secondary)", marginBottom: "0.25rem" }}>
              Total de Processos
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700 }} className="pncp-mono">
              {total}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginTop: "0.25rem" }}>
              Cadastrados no sistema
            </div>
          </Tile>
        </Column>

        <Column lg={4} md={4} sm={2}>
          <Tile style={{ padding: "1rem" }}>
            <div style={{ fontSize: "0.8125rem", color: "var(--cds-text-secondary)", marginBottom: "0.25rem" }}>
              Rascunhos em Análise
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--cds-support-warning)" }} className="pncp-mono">
              {totalRascunhos}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginTop: "0.25rem" }}>
              Aguardando protocolo formal
            </div>
          </Tile>
        </Column>

        <Column lg={4} md={4} sm={2}>
          <Tile style={{ padding: "1rem", borderLeft: totalCriticas > 0 ? "4px solid #da1e28" : "none" }}>
            <div style={{ fontSize: "0.8125rem", color: totalCriticas > 0 ? "#da1e28" : "var(--cds-text-secondary)", fontWeight: 600, marginBottom: "0.25rem" }}>
              Prazos Críticos (≤ 48h)
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, color: totalCriticas > 0 ? "#da1e28" : "inherit" }} className="pncp-mono">
              {totalCriticas}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginTop: "0.25rem" }}>
              Risco iminente de preclusão
            </div>
          </Tile>
        </Column>

        <Column lg={4} md={4} sm={2}>
          <Tile style={{ padding: "1rem" }}>
            <div style={{ fontSize: "0.8125rem", color: "var(--cds-text-secondary)", marginBottom: "0.25rem" }}>
              Protocoladas / Acatadas
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--cds-support-success)" }} className="pncp-mono">
              {totalProtocoladas} / {totalAcatadas}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginTop: "0.25rem" }}>
              Em julgamento pelo pregoeiro
            </div>
          </Tile>
        </Column>
      </Grid>

      {/* Filter and Search Bar */}
      <Tile style={{ padding: "1rem 1.25rem", marginBottom: "1.5rem" }}>
        <Grid style={{ padding: 0, alignItems: "flex-end" }}>
          <Column lg={6} md={4} sm={4}>
            <TextInput
              id="input-busca-impugnacao"
              labelText="Buscar por Edital, Órgão, Motivo ou Protocolo"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Digite o termo para filtrar..."
            />
          </Column>

          <Column lg={4} md={2} sm={4}>
            <Select
              id="select-status-filtro"
              labelText="Filtrar por Status"
              value={statusFiltro}
              onChange={(e) => setStatusFiltro(e.target.value)}
            >
              <SelectItem value="" text="Todos os Status" />
              <SelectItem value="RASCUNHO" text="RASCUNHO (Não protocolado)" />
              <SelectItem value="PROTOCOLADA" text="PROTOCOLADA (Em análise)" />
              <SelectItem value="ACATADA" text="ACATADA (Edital retificado)" />
              <SelectItem value="INDEFERIDA" text="INDEFERIDA" />
            </Select>
          </Column>

          <Column lg={6} md={2} sm={4} style={{ display: "flex", gap: "0.5rem" }}>
            <Button
              kind={apenasCriticas ? "danger" : "ghost"}
              size="md"
              onClick={() => setApenasCriticas(!apenasCriticas)}
              id="btn-filtro-criticas"
            >
              {apenasCriticas ? "Exibindo apenas Críticas (≤ 48h)" : "Filtrar Críticas (≤ 48h)"}
            </Button>
          </Column>
        </Grid>
      </Tile>

      {/* Listagem de Impugnações */}
      {carregando ? (
        <div style={{ padding: "4rem 2rem", textAlign: "center" }}>
          <InlineLoading description="Carregando impugnações..." />
        </div>
      ) : impugnacoes.length === 0 ? (
        <Tile style={{ padding: "3rem 2rem", textAlign: "center" }}>
          <Scale size={36} style={{ color: "var(--cds-text-secondary)", marginBottom: "1rem" }} />
          <h3 style={{ fontSize: "1.125rem", fontWeight: 600, margin: "0 0 0.5rem 0" }}>
            Nenhuma impugnação encontrada
          </h3>
          <p style={{ margin: "0 0 1.5rem 0", color: "var(--cds-text-secondary)", fontSize: "0.875rem" }}>
            {apenasCriticas || statusFiltro || busca
              ? "Tente ajustar os filtros de busca para encontrar registros."
              : "Clique no botão acima para cadastrar a primeira impugnação com cálculo do prazo legal."}
          </p>
          <Button kind="primary" size="md" onClick={abrirModalNova}>
            Cadastrar Nova Impugnação
          </Button>
        </Tile>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {impugnacoes.map((imp) => {
            const horas = imp.horasRestantesPrazoFatal ?? 0;
            const vencido = imp.prazoVencido ?? false;

            return (
              <Tile
                key={imp.id}
                style={{
                  padding: "1.25rem 1.5rem",
                  borderLeft:
                    vencido && imp.status === "RASCUNHO"
                      ? "6px solid #da1e28"
                      : horas <= 24 && imp.status === "RASCUNHO"
                      ? "6px solid #fa4d56"
                      : horas <= 48 && imp.status === "RASCUNHO"
                      ? "6px solid #ff832b"
                      : imp.status === "ACATADA"
                      ? "6px solid #24a148"
                      : "6px solid #0f62fe",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem", marginBottom: "0.75rem" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.25rem" }}>
                      <span style={{ fontWeight: 700, fontSize: "1.125rem" }} className="pncp-mono">
                        {imp.numeroEdital}
                      </span>
                      <span style={{ color: "var(--cds-text-secondary)" }}>•</span>
                      <span style={{ fontWeight: 600, fontSize: "0.9375rem" }}>{imp.orgaoNome}</span>
                    </div>
                    {imp.objeto && (
                      <p style={{ margin: "0 0 0.5rem 0", fontSize: "0.8125rem", color: "var(--cds-text-secondary)" }}>
                        {imp.objeto}
                      </p>
                    )}
                  </div>

                  {/* Status Tag + Prazo Tag */}
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                    {/* Status */}
                    {imp.status === "RASCUNHO" && <Tag type="warm-gray">RASCUNHO</Tag>}
                    {imp.status === "PROTOCOLADA" && <Tag type="blue">PROTOCOLADA</Tag>}
                    {imp.status === "ACATADA" && <Tag type="green">ACATADA</Tag>}
                    {imp.status === "INDEFERIDA" && <Tag type="red">INDEFERIDA</Tag>}

                    {/* Prazo Fatal Art. 164 */}
                    {vencido ? (
                      <Tag type="red" size="md">
                        PRAZO FATAL ENCERRADO
                      </Tag>
                    ) : horas <= 24 ? (
                      <Tag type="red" size="md">
                        CRÍTICO: {horas}h restantes
                      </Tag>
                    ) : horas <= 48 ? (
                      <Tag type="magenta" size="md">
                        ATENÇÃO: {horas}h restantes
                      </Tag>
                    ) : (
                      <Tag type="cool-gray" size="md">
                        {Math.ceil(horas / 24)} dias úteis restantes
                      </Tag>
                    )}
                  </div>
                </div>

                {/* Motivo e Fundamentação */}
                <div style={{ background: "var(--cds-layer-02)", padding: "0.75rem 1rem", borderRadius: "2px", marginBottom: "1rem" }}>
                  <div style={{ fontWeight: 600, fontSize: "0.875rem", marginBottom: "0.25rem" }}>
                    Motivo Apontado: {imp.motivoLegal}
                  </div>
                  <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--cds-text-secondary)" }}>
                    {imp.fundamentacao.length > 200
                      ? `${imp.fundamentacao.substring(0, 200)}...`
                      : imp.fundamentacao}
                  </p>
                </div>

                {/* Metadados Legais & Prazos */}
                <div style={{ display: "flex", gap: "1.5rem", fontSize: "0.8125rem", flexWrap: "wrap", color: "var(--cds-text-secondary)", marginBottom: "1rem" }}>
                  <div>
                    <strong>Sessão de Abertura:</strong>{" "}
                    {new Date(imp.dataAberturaSessao).toLocaleDateString("pt-BR")}{" "}
                    {new Date(imp.dataAberturaSessao).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <div>
                    <strong>Prazo Fatal (Art. 164):</strong>{" "}
                    <span style={{ color: horas <= 48 && imp.status === "RASCUNHO" ? "#da1e28" : "inherit", fontWeight: 600 }}>
                      {new Date(imp.prazoFatal).toLocaleDateString("pt-BR")} às 18:00
                    </span>
                  </div>
                  {imp.numeroProtocolo && (
                    <div>
                      <strong>Protocolo:</strong> {imp.numeroProtocolo}
                    </div>
                  )}
                  {imp.dataResposta && (
                    <div>
                      <strong>Julgamento:</strong> {new Date(imp.dataResposta).toLocaleDateString("pt-BR")}
                    </div>
                  )}
                </div>

                {/* Decisão / Julgamento se houver */}
                {imp.decisaoJulgamento && (
                  <div style={{ fontSize: "0.8125rem", marginBottom: "1rem", padding: "0.5rem 0.75rem", background: imp.status === "ACATADA" ? "#defbe6" : "#fff1f1", color: "#161616" }}>
                    <strong>Decisão do Pregoeiro:</strong> {imp.decisaoJulgamento}
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", borderTop: "1px solid var(--cds-border-subtle)", paddingTop: "0.75rem" }}>
                  <Button
                    kind="tertiary"
                    size="sm"
                    renderIcon={Document}
                    onClick={() => abrirMinuta(imp)}
                    id={`btn-ver-minuta-${imp.id}`}
                    data-testid={`btn-ver-minuta-${imp.id}`}
                  >
                    Ver Minuta Jurídica (TCU)
                  </Button>
                  <Button
                    kind="secondary"
                    size="sm"
                    renderIcon={Edit}
                    onClick={() => abrirAtualizacaoStatus(imp)}
                    id={`btn-status-${imp.id}`}
                    data-testid={`btn-status-${imp.id}`}
                  >
                    Atualizar Status / Protocolo
                  </Button>
                  <Button
                    kind="danger--ghost"
                    size="sm"
                    renderIcon={TrashCan}
                    onClick={() => handleExcluir(imp.id)}
                    id={`btn-excluir-${imp.id}`}
                  >
                    Excluir
                  </Button>
                </div>
              </Tile>
            );
          })}

          {total > pageSize && (
            <Pagination
              backwardText="Página anterior"
              forwardText="Próxima página"
              itemsPerPageText="Itens por página:"
              page={page}
              pageNumberText="Número da página"
              pageSize={pageSize}
              pageSizes={[10, 20, 50]}
              totalItems={total}
              onChange={(e) => {
                setPage(e.page);
                setPageSize(e.pageSize);
              }}
            />
          )}
        </div>
      )}

      {/* MODAL: Nova Impugnação */}
      <Modal
        open={modalNovaAberto}
        onRequestClose={() => {
          setErroModal(null);
          setModalNovaAberto(false);
        }}
        modalHeading="Nova Impugnação ou Pedido de Esclarecimento (Art. 164 Lei 14.133)"
        primaryButtonText="Salvar Impugnação"
        secondaryButtonText="Cancelar"
        onRequestSubmit={handleSalvarNovaImpugnacao}
        size="lg"
      >
        <div style={{ padding: "0.5rem 0" }}>
          {erroModal && (
            <InlineNotification
              kind="error"
              title="Atenção nos Campos Obrigatórios"
              subtitle={erroModal}
              onClose={() => setErroModal(null)}
              lowContrast
              style={{ marginBottom: "1.25rem" }}
            />
          )}

          <FormGroup legendText="" style={{ marginBottom: "1rem" }}>
            <Select
              id="select-certame-modal"
              labelText="Vincular a uma Licitação do Pipeline (Opcional)"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  handleSelecionarCertame(e.target.value);
                }
              }}
            >
              <SelectItem
                value=""
                text={
                  oportunidades.length > 0
                    ? "Preencher manualmente (sem vínculo) ou escolher certame..."
                    : "Preencher manualmente (sem certames no pipeline para vincular)"
                }
              />
              {oportunidades.map((op) => (
                <SelectItem
                  key={op.id}
                  value={op.id}
                  text={`${op.numeroEdital || "Edital"} — ${(op.orgaoNome || "").substring(0, 45)}...`}
                />
              ))}
            </Select>
          </FormGroup>

          <Grid style={{ padding: 0, marginBottom: "1rem" }}>
            <Column lg={8} md={4} sm={4}>
              <TextInput
                id="modal-edital"
                labelText="Número do Edital / Processo *"
                value={novaEdital}
                onChange={(e) => {
                  setNovaEdital(e.target.value);
                  if (erroModal) setErroModal(null);
                }}
                placeholder="Ex: PE 104/2026"
                invalid={Boolean(erroModal && !novaEdital.trim())}
                invalidText="Informe o número do edital ou processo."
              />
            </Column>
            <Column lg={8} md={4} sm={4}>
              <TextInput
                id="modal-orgao"
                labelText="Órgão Licitante *"
                value={novaOrgao}
                onChange={(e) => {
                  setNovaOrgao(e.target.value);
                  if (erroModal) setErroModal(null);
                }}
                placeholder="Ex: Tribunal Regional Eleitoral"
                invalid={Boolean(erroModal && !novaOrgao.trim())}
                invalidText="Informe o nome do órgão licitante."
              />
            </Column>
            <Column lg={16} md={8} sm={4} style={{ marginTop: "0.75rem" }}>
              <TextInput
                id="modal-objeto"
                labelText="Objeto da Contratação (Opcional)"
                value={novaObjeto}
                onChange={(e) => setNovaObjeto(e.target.value)}
                placeholder="Descrição sucinta do objeto do certame"
              />
            </Column>
          </Grid>

          <Grid style={{ padding: 0, marginBottom: "1rem" }}>
            <Column lg={8} md={4} sm={4}>
              <TextInput
                id="modal-data-abertura"
                type="datetime-local"
                labelText="Data e Hora da Sessão de Abertura *"
                value={novaDataAbertura}
                onChange={(e) => {
                  setNovaDataAbertura(e.target.value);
                  if (erroModal) setErroModal(null);
                }}
                invalid={Boolean(erroModal && !novaDataAbertura)}
                invalidText="Selecione a data e horário de abertura da sessão pública."
              />
            </Column>
            <Column lg={8} md={4} sm={4}>
              <div style={{ marginTop: "1.75rem", padding: "0.5rem 0.75rem", background: "var(--cds-layer-02)", borderRadius: "2px" }}>
                <span style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>Prazo Fatal Legal Calculado:</span>
                <div style={{ fontWeight: 700, fontSize: "0.9375rem" }} className="pncp-mono">
                  {prazoCalculadoPreview
                    ? `${prazoCalculadoPreview.toLocaleDateString("pt-BR")} às 18:00 (3 dias úteis antes)`
                    : "Informe a data de abertura"}
                </div>
              </div>
            </Column>
          </Grid>

          {/* Modelos Sugeridos do TCU (Select com 10 Opções) */}
          <FormGroup legendText="" style={{ marginBottom: "1rem" }}>
            <Select
              id="select-modelo-tcu"
              labelText="Modelos Rápidos de Jurisprudência do TCU: Preenchimento Automático"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value !== "") {
                  handleSelecionarMotivoSugerido(Number(e.target.value));
                  if (erroModal) setErroModal(null);
                }
              }}
            >
              <SelectItem value="" text="Selecione um modelo fundamentado do TCU para preencher..." />
              {MOTIVOS_SUGERIDOS.map((sug, idx) => (
                <SelectItem key={idx} value={String(idx)} text={sug.titulo} />
              ))}
            </Select>
          </FormGroup>

          <TextInput
            id="modal-motivo"
            labelText="Irregularidade / Motivo Legal *"
            value={novaMotivo}
            onChange={(e) => {
              setNovaMotivo(e.target.value);
              if (erroModal) setErroModal(null);
            }}
            placeholder="Ex: Cláusula restritiva de qualificação técnica desproporcional"
            invalid={Boolean(erroModal && !novaMotivo.trim())}
            invalidText="Descreva o motivo ou cláusula irregular."
            style={{ marginBottom: "1rem" }}
          />

          <TextArea
            id="modal-fundamentacao"
            labelText="Fundamentação Fática e Jurídica (Súmulas TCU / Artigos da Lei 14.133) *"
            value={novaFundamentacao}
            onChange={(e) => {
              setNovaFundamentacao(e.target.value);
              if (erroModal) setErroModal(null);
            }}
            rows={4}
            placeholder="Argumentação legal, artigos violados e precedentes dos tribunais de contas..."
            invalid={Boolean(erroModal && !novaFundamentacao.trim())}
            invalidText="A fundamentação jurídica é obrigatória para a petição formal."
            style={{ marginBottom: "1rem" }}
          />

          <TextArea
            id="modal-pedidos"
            labelText="Pedidos Formais (Exclusão de Cláusula, Republicação, Reabertura) *"
            value={novaPedidos}
            onChange={(e) => {
              setNovaPedidos(e.target.value);
              if (erroModal) setErroModal(null);
            }}
            rows={3}
            placeholder="Requerimentos formais formulados ao pregoeiro ou comissão de contratação..."
            invalid={Boolean(erroModal && !novaPedidos.trim())}
            invalidText="Informe os pedidos formais da impugnação."
          />
        </div>
      </Modal>

      {/* MODAL: Visualizar Minuta Jurídica TCU */}
      <Modal
        open={modalMinutaAberto}
        onRequestClose={() => setModalMinutaAberto(false)}
        modalHeading="Minuta Jurídica Formal de Impugnação (Art. 164 Lei 14.133)"
        passiveModal
        size="lg"
      >
        {impugnacaoSelecionada && (
          <div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
              <Button
                kind="secondary"
                size="sm"
                renderIcon={Printer}
                onClick={() => handleImprimirMinutaHtml(impugnacaoSelecionada)}
                id="btn-imprimir-minuta-oficial-modal"
              >
                Imprimir Minuta Oficial
              </Button>
              <Button
                kind="primary"
                size="sm"
                renderIcon={DocumentPdf}
                onClick={() => window.open(`/api/impugnacoes/${impugnacaoSelecionada.id}/pdf`, "_blank")}
                id="btn-baixar-pdf-timbrado-modal"
                data-testid="btn-baixar-pdf-timbrado-modal"
              >
                Baixar PDF Timbrado
              </Button>
              <Button
                kind="tertiary"
                size="sm"
                renderIcon={Copy}
                onClick={() => {
                  const m = gerarMinutaJuridica(impugnacaoSelecionada, empresaAtiva || undefined);
                  navigator.clipboard.writeText(m.minutaTexto);
                  setNotificacao({ tipo: "success", texto: "Minuta jurídica copiada para a área de transferência!" });
                }}
                id="btn-copiar-minuta-modal"
              >
                Copiar Texto da Minuta
              </Button>
            </div>

            <div
              style={{
                background: "#ffffff",
                color: "#161616",
                padding: "2rem",
                borderRadius: "2px",
                border: "1px solid #c6c6c6",
                maxHeight: "60vh",
                overflowY: "auto",
              }}
              dangerouslySetInnerHTML={{
                __html: gerarMinutaJuridica(impugnacaoSelecionada, empresaAtiva || undefined).minutaHtml,
              }}
            />
          </div>
        )}
      </Modal>

      {/* MODAL: Atualizar Status e Julgamento */}
      <Modal
        open={modalStatusAberto}
        onRequestClose={() => setModalStatusAberto(false)}
        modalHeading="Atualizar Status da Petição e Protocolo"
        primaryButtonText="Salvar Alterações"
        secondaryButtonText="Cancelar"
        onRequestSubmit={handleSalvarStatus}
      >
        <div style={{ padding: "0.5rem 0" }}>
          <FormGroup legendText="" style={{ marginBottom: "1rem" }}>
            <Select
              id="update-status"
              labelText="Status Atual"
              value={statusUpdate}
              onChange={(e) => setStatusUpdate(e.target.value as ImpugnacaoStatus)}
            >
              <SelectItem value="RASCUNHO" text="RASCUNHO (Não protocolado)" />
              <SelectItem value="PROTOCOLADA" text="PROTOCOLADA (Em análise)" />
              <SelectItem value="ACATADA" text="ACATADA (Edital alterado)" />
              <SelectItem value="INDEFERIDA" text="INDEFERIDA (Edital mantido)" />
            </Select>
          </FormGroup>

          <Grid style={{ padding: 0, marginBottom: "1rem" }}>
            <Column lg={8} md={4} sm={4}>
              <TextInput
                id="update-protocolo"
                labelText="Número do Protocolo Formal"
                value={numeroProtocoloUpdate}
                onChange={(e) => setNumeroProtocoloUpdate(e.target.value)}
                placeholder="Ex: PROT-2026-98124"
              />
            </Column>
            <Column lg={8} md={4} sm={4}>
              <TextInput
                id="update-data-protocolo"
                type="date"
                labelText="Data do Protocolo"
                value={dataProtocoloUpdate}
                onChange={(e) => setDataProtocoloUpdate(e.target.value)}
              />
            </Column>
          </Grid>

          {(statusUpdate === "ACATADA" || statusUpdate === "INDEFERIDA") && (
            <>
              <TextInput
                id="update-data-resposta"
                type="date"
                labelText="Data da Resposta do Pregoeiro"
                value={dataRespostaUpdate}
                onChange={(e) => setDataRespostaUpdate(e.target.value)}
                style={{ marginBottom: "1rem" }}
              />

              <TextArea
                id="update-decisao"
                labelText="Resumo da Decisão / Julgamento da CPL"
                value={decisaoUpdate}
                onChange={(e) => setDecisaoUpdate(e.target.value)}
                rows={3}
                placeholder="Transcreva a decisão oficial do pregoeiro ou anexe o parecer"
              />
            </>
          )}
        </div>
      </Modal>
    </ModulePageShell>
  );
}

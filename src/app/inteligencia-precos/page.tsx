"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Column,
  Grid,
  InlineNotification,
  Modal,
  Select,
  SelectItem,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  Tag,
  TextArea,
  TextInput,
  Tile,
} from "@carbon/react";
import {
  Copy,
  Download,
  Launch,
  Save,
  Search as SearchIcon,
  TrashCan,
} from "@carbon/icons-react";
import { ModulePageShell } from "@/components/shell/module-page-shell";
import {
  calcularEstatisticasPrecosHomologados,
  type HomologacaoItemPublico,
  type ItemPrecoSalvoRecord,
} from "@/server/schemas/inteligencia-precos.schema";

const UFS_BRASIL = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

const INICIAL_HISTORICO_PRECOS: HomologacaoItemPublico[] = [
  {
    id: "hom-1",
    catmat: "452109",
    itemNumero: 1,
    itemDescricao:
      "Notebook Corporativo Processador Core i7 (13ª Geração), 16GB RAM DDR5, SSD NVMe 512GB, Tela 15.6 FHD Antirreflexo, Windows 11 Pro, Garantia Onsite 36 meses",
    marca: "Dell",
    modelo: "Latitude 3540",
    informacaoComplementar: "Acompanha maleta de transporte e mouse óptico sem fio.",
    unidade: "UN",
    quantidade: 50,
    orgaoNome: "Tribunal Regional Eleitoral de Goiás",
    orgaoCnpj: "05.526.875/0001-45",
    uf: "GO",
    municipio: "Goiânia",
    modalidade: "Pregão Eletrônico",
    numeroProcesso: "PE 088/2026",
    dataHomologacao: "28/10/2026",
    empresaVencedora: "DELL COMPUTADORES DO BRASIL LTDA",
    cnpjVencedor: "72.381.189/0001-10",
    porteFornecedor: "Demais",
    tipoBeneficio: "Ampla Concorrência",
    valorEstimadoUnitario: 5200.0,
    valorHomologadoUnitario: 4150.0,
    valorTotalHomologado: 207500.0,
    descontoPercentual: 20.19,
    linkPncp: "https://pncp.gov.br",
    fonte: "PNCP_OFICIAL",
  },
  {
    id: "hom-2",
    catmat: "452109",
    itemNumero: 1,
    itemDescricao:
      "Computador Portátil Core i7, 16GB RAM, SSD 512GB M.2 PCIe, Tela LED 15.6 FHD, Windows 11 Pro, Teclado ABNT2 com numérico",
    marca: "Positivo",
    modelo: "Master N6445",
    informacaoComplementar: "Entrega em até 30 dias corridos.",
    unidade: "UN",
    quantidade: 200,
    orgaoNome: "Secretaria de Educação do Estado de São Paulo",
    orgaoCnpj: "46.384.111/0001-40",
    uf: "SP",
    municipio: "São Paulo",
    modalidade: "Pregão Eletrônico",
    numeroProcesso: "PE 124/2026",
    dataHomologacao: "25/10/2026",
    empresaVencedora: "POSITIVO TECNOLOGIA S.A.",
    cnpjVencedor: "81.243.735/0001-48",
    porteFornecedor: "Demais",
    tipoBeneficio: "Ampla Concorrência",
    valorEstimadoUnitario: 4950.0,
    valorHomologadoUnitario: 3890.0,
    valorTotalHomologado: 778000.0,
    descontoPercentual: 21.41,
    linkPncp: "https://pncp.gov.br",
    fonte: "PNCP_OFICIAL",
  },
  {
    id: "hom-3",
    catmat: "452109",
    itemNumero: 2,
    itemDescricao:
      "Notebook Corporativo Core i7, Memória 16GB DDR4, Armazenamento SSD 512GB, Tela 14 FHD IPS, Bateria 3 Células, Windows 11 Pro",
    marca: "Lenovo",
    modelo: "ThinkPad E14 Gen 5",
    informacaoComplementar: "Garantia oficial do fabricante de 36 meses.",
    unidade: "UN",
    quantidade: 80,
    orgaoNome: "Comando da Aeronáutica - GAP-DF",
    orgaoCnpj: "00.394.429/0177-75",
    uf: "DF",
    municipio: "Brasília",
    modalidade: "Pregão Eletrônico",
    numeroProcesso: "PE 031/2026",
    dataHomologacao: "19/10/2026",
    empresaVencedora: "LENOVO TECNOLOGIA BRASIL LTDA",
    cnpjVencedor: "07.275.920/0001-61",
    porteFornecedor: "Demais",
    tipoBeneficio: "Ampla Concorrência",
    valorEstimadoUnitario: 5100.0,
    valorHomologadoUnitario: 4050.0,
    valorTotalHomologado: 324000.0,
    descontoPercentual: 20.59,
    linkPncp: "https://pncp.gov.br",
    fonte: "PNCP_OFICIAL",
  },
  {
    id: "hom-4",
    catmat: "452109",
    itemNumero: 3,
    itemDescricao:
      "Notebook Ultrafino Processador 8 Núcleos i7, 16GB RAM, SSD 512GB, Chassi Alumínio, Garantia Onsite 36 Meses",
    marca: "Acer",
    modelo: "TravelMate P2",
    informacaoComplementar: "Cota exclusiva ME/EPP.",
    unidade: "UN",
    quantidade: 120,
    orgaoNome: "Prefeitura Municipal de Belo Horizonte",
    orgaoCnpj: "18.715.383/0001-40",
    uf: "MG",
    municipio: "Belo Horizonte",
    modalidade: "Pregão Eletrônico",
    numeroProcesso: "PE 077/2026",
    dataHomologacao: "12/10/2026",
    empresaVencedora: "MICROTECH SOLUCOES CORPORATIVAS LTDA",
    cnpjVencedor: "29.411.882/0001-90",
    porteFornecedor: "EPP",
    tipoBeneficio: "Exclusivo ME/EPP",
    valorEstimadoUnitario: 4800.0,
    valorHomologadoUnitario: 3750.0,
    valorTotalHomologado: 450000.0,
    descontoPercentual: 21.88,
    linkPncp: "https://pncp.gov.br",
    fonte: "PNCP_OFICIAL",
  },
];

function formatBRL(valor: number): string {
  return (valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDataCurta(isoOuBr: string): string {
  if (!isoOuBr) return "—";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(isoOuBr)) return isoOuBr;
  const d = new Date(isoOuBr);
  if (Number.isNaN(d.getTime())) return isoOuBr;
  return d.toLocaleDateString("pt-BR");
}

export default function InteligenciaPrecosPage() {
  const [abaSelecionada, setAbaSelecionada] = useState(0);

  // Filtros de pesquisa (Aba 1)
  const [termoBusca, setTermoBusca] = useState("Notebook i7 16GB 512GB");
  const [termoExibido, setTermoExibido] = useState("Notebook i7 16GB 512GB");
  const [ufFiltro, setUfFiltro] = useState("TODOS");
  const [modalidadeFiltro, setModalidadeFiltro] = useState("TODOS");
  const [periodoMeses, setPeriodoMeses] = useState(12);
  const [limiteLastro, setLimiteLastro] = useState(20);
  const [fontePrincipal, setFontePrincipal] = useState<"PNCP_OFICIAL" | "BASE_REFERENCIA">(
    "PNCP_OFICIAL",
  );

  const [itens, setItens] = useState<HomologacaoItemPublico[]>(INICIAL_HISTORICO_PRECOS);
  const [idsSelecionados, setIdsSelecionados] = useState<Set<string>>(
    () => new Set(INICIAL_HISTORICO_PRECOS.map((i) => i.id)),
  );
  const [carregandoBusca, setCarregandoBusca] = useState(false);

  const [feedback, setFeedback] = useState<{
    kind: "success" | "info" | "warning" | "error";
    text: string;
  } | null>(null);

  // Modal de detalhes de 1 homologação específica
  const [homologacaoModal, setHomologacaoModal] = useState<HomologacaoItemPublico | null>(null);

  // Modal de salvar item na base da empresa
  const [modalSalvarAberto, setModalSalvarAberto] = useState(false);
  const [salvandoItem, setSalvandoItem] = useState(false);
  const [formSalvarNome, setFormSalvarNome] = useState("");
  const [formSalvarMarca, setFormSalvarMarca] = useState("");
  const [formSalvarCatmat, setFormSalvarCatmat] = useState("");
  const [formSalvarObs, setFormSalvarObs] = useState("");

  // Aba 2 — Meus Itens Salvos
  const [itensSalvos, setItensSalvos] = useState<ItemPrecoSalvoRecord[]>([]);
  const [carregandoSalvos, setCarregandoSalvos] = useState(false);
  const [buscaSalvos, setBuscaSalvos] = useState("");
  const [itemSalvoModal, setItemSalvoModal] = useState<ItemPrecoSalvoRecord | null>(null);

  const carregarItensSalvos = useCallback(async () => {
    setCarregandoSalvos(true);
    try {
      const res = await fetch("/api/inteligencia-precos/salvos", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.itens)) {
          setItensSalvos(data.itens);
        }
      }
    } catch {
      // Silencioso em ambiente sem API ativa
    } finally {
      setCarregandoSalvos(false);
    }
  }, []);

  useEffect(() => {
    carregarItensSalvos();
    const onTenantChange = () => {
      carregarItensSalvos();
    };
    window.addEventListener("tenant-changed", onTenantChange);
    return () => window.removeEventListener("tenant-changed", onTenantChange);
  }, [carregarItensSalvos]);

  // Homologações marcadas para o cálculo dinâmico
  const itensAtivosNoCalculo = useMemo(() => {
    const filtrados = itens.filter((i) => idsSelecionados.has(i.id));
    return filtrados.length > 0 ? filtrados : itens;
  }, [itens, idsSelecionados]);

  const estatisticas = useMemo(
    () => calcularEstatisticasPrecosHomologados(itensAtivosNoCalculo),
    [itensAtivosNoCalculo],
  );

  const itensSalvosFiltrados = useMemo(() => {
    const q = buscaSalvos.trim().toLowerCase();
    if (!q) return itensSalvos;
    return itensSalvos.filter((item) => {
      const alvo = `${item.nomeProduto} ${item.termoPesquisado} ${item.marcaReferencia || ""} ${
        item.catmat || ""
      } ${item.especificacaoResumo || ""} ${item.observacoes || ""}`.toLowerCase();
      return alvo.includes(q);
    });
  }, [itensSalvos, buscaSalvos]);

  const executarPesquisa = async (paramsOverride?: {
    q?: string;
    uf?: string;
    modalidade?: string;
    periodoMeses?: number;
    limite?: number;
  }) => {
    const qFinal = (paramsOverride?.q ?? termoBusca).trim();
    const ufFinal = paramsOverride?.uf ?? ufFiltro;
    const modFinal = paramsOverride?.modalidade ?? modalidadeFiltro;
    const perFinal = paramsOverride?.periodoMeses ?? periodoMeses;
    const limFinal = paramsOverride?.limite ?? limiteLastro;

    if (qFinal.length < 2) {
      setFeedback({
        kind: "warning",
        text: "Informe pelo menos 2 caracteres (descrição do produto, marca/configuração ou código CATMAT) para pesquisar.",
      });
      return;
    }

    setCarregandoBusca(true);
    setFeedback(null);

    try {
      const qs = new URLSearchParams({
        q: qFinal,
        uf: ufFinal,
        modalidade: modFinal,
        periodoMeses: String(perFinal),
        limite: String(limFinal),
      });

      const res = await fetch(`/api/inteligencia-precos/busca?${qs.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Falha ao consultar homologações públicas.");
      }

      const novosItens: HomologacaoItemPublico[] = Array.isArray(data.itens) ? data.itens : [];
      setItens(novosItens);
      setIdsSelecionados(new Set(novosItens.map((i) => i.id)));
      setTermoExibido(qFinal);
      setFontePrincipal(data.fontePrincipal || "PNCP_OFICIAL");

      setFeedback({
        kind: "success",
        text: `Consulta concluída para "${qFinal}" nos últimos ${perFinal} meses: ${novosItens.length} homologações carregadas (${
          data.fontePrincipal === "PNCP_OFICIAL"
            ? "Dados Oficiais PNCP em Tempo Real"
            : "Base de Referência Consolidada"
        }).`,
      });
    } catch (err: any) {
      setFeedback({
        kind: "error",
        text: err?.message || "Não foi possível concluir a busca de preços no momento.",
      });
    } finally {
      setCarregandoBusca(false);
    }
  };

  const abrirModalSalvarItem = () => {
    const marcasSugeridas = Array.from(
      new Set(
        itensAtivosNoCalculo
          .map((h) => [h.marca, h.modelo].filter(Boolean).join(" "))
          .filter(Boolean),
      ),
    )
      .slice(0, 3)
      .join(" / ");

    const catmatSugerido =
      itensAtivosNoCalculo.find((h) => h.catmat && h.catmat !== "N/I")?.catmat || "";

    setFormSalvarNome(termoBusca.trim() || termoExibido);
    setFormSalvarMarca(marcasSugeridas);
    setFormSalvarCatmat(catmatSugerido);
    setFormSalvarObs("");
    setModalSalvarAberto(true);
  };

  const confirmarSalvarItem = async () => {
    if (formSalvarNome.trim().length < 2) {
      setFeedback({
        kind: "warning",
        text: "Informe um nome de identificação para o produto antes de salvar.",
      });
      return;
    }

    setSalvandoItem(true);
    try {
      const payload = {
        nomeProduto: formSalvarNome.trim(),
        termoPesquisado: termoExibido || termoBusca.trim(),
        marcaReferencia: formSalvarMarca.trim(),
        catmat: formSalvarCatmat.trim(),
        especificacaoResumo: itensAtivosNoCalculo[0]?.itemDescricao?.slice(0, 280) || "",
        ufFiltro,
        modalidadeFiltro,
        periodoMeses,
        observacoes: formSalvarObs.trim(),
        homologacoes: itensAtivosNoCalculo,
      };

      const res = await fetch("/api/inteligencia-precos/salvos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Não foi possível salvar o item na sua base.");
      }

      await carregarItensSalvos();
      setModalSalvarAberto(false);
      setFeedback({
        kind: "success",
        text: `Item "${formSalvarNome.trim()}" salvo na sua base com ${itensAtivosNoCalculo.length} homologações de lastro! Consulte a qualquer momento na aba "Meus Itens Salvos".`,
      });
    } catch (err: any) {
      setFeedback({
        kind: "error",
        text: err?.message || "Erro ao salvar item na base.",
      });
    } finally {
      setSalvandoItem(false);
    }
  };

  const handleExcluirItemSalvo = async (
    e: React.MouseEvent,
    item: ItemPrecoSalvoRecord,
  ) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/inteligencia-precos/salvos/${item.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setItensSalvos((prev) => prev.filter((x) => x.id !== item.id));
        if (itemSalvoModal?.id === item.id) {
          setItemSalvoModal(null);
        }
        setFeedback({
          kind: "info",
          text: `Item "${item.nomeProduto}" removido da sua base salva.`,
        });
      }
    } catch {
      setFeedback({
        kind: "error",
        text: "Não foi possível remover o item salvo.",
      });
    }
  };

  const handleExportarCsv = (listaParaExportar: HomologacaoItemPublico[], nomeRef: string) => {
    const cabecalho = [
      "Orgao",
      "UF",
      "Processo",
      "Data Homologacao",
      "CATMAT",
      "Marca",
      "Modelo",
      "Descricao do Item",
      "Empresa Vencedora",
      "CNPJ Vencedor",
      "Quantidade",
      "Unidade",
      "Valor Estimado Unit",
      "Valor Homologado Unit",
      "Desconto (%)",
      "Link PNCP",
    ];
    const linhas = listaParaExportar.map((r) =>
      [
        `"${(r.orgaoNome || "").replace(/"/g, '""')}"`,
        r.uf,
        `"${(r.numeroProcesso || "").replace(/"/g, '""')}"`,
        r.dataHomologacao,
        r.catmat,
        `"${(r.marca || "").replace(/"/g, '""')}"`,
        `"${(r.modelo || "").replace(/"/g, '""')}"`,
        `"${(r.itemDescricao || "").replace(/"/g, '""')}"`,
        `"${(r.empresaVencedora || "").replace(/"/g, '""')}"`,
        r.cnpjVencedor,
        r.quantidade,
        r.unidade,
        r.valorEstimadoUnitario.toFixed(2),
        r.valorHomologadoUnitario.toFixed(2),
        r.descontoPercentual.toFixed(2),
        r.linkPncp || "",
      ].join(";"),
    );

    try {
      const csvContent = "\uFEFF" + [cabecalho.join(";"), ...linhas].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `homologacoes-${nomeRef.toLowerCase().replace(/[^a-z0-9]+/gi, "-")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Ignora em ambiente de teste sem createObjectURL
    }

    setFeedback({
      kind: "info",
      text: `Exportação CSV concluída com ${listaParaExportar.length} homologações de referência.`,
    });
  };

  const toggleSelecionarLinha = (id: string) => {
    setIdsSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size > 1) {
          next.delete(id);
        }
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const todasLinhasMarcadas = itens.length > 0 && idsSelecionados.size === itens.length;

  return (
    <ModulePageShell
      title="Inteligência de Preços Homologados"
      subtitle="Pesquisa determinística em atas e certames homologados no PNCP com saneamento estatístico de outliers, filtro por configuração/marca e base própria de itens salvos."
      badge="Arsenal de Disputa"
      routePath="/inteligencia-precos"
    >
      {feedback && (
        <InlineNotification
          kind={feedback.kind}
          title={
            feedback.kind === "success"
              ? "Concluído:"
              : feedback.kind === "error"
              ? "Erro:"
              : "Informação:"
          }
          subtitle={feedback.text}
          onClose={() => setFeedback(null)}
          style={{ marginBottom: "1.25rem", maxWidth: "100%" }}
        />
      )}

      <Tabs
        selectedIndex={abaSelecionada}
        onChange={(evt: { selectedIndex: number }) => setAbaSelecionada(evt.selectedIndex)}
      >
        <TabList aria-label="Navegação da Inteligência de Preços" contained>
          <Tab>🔍 Pesquisar no Banco Público</Tab>
          <Tab>📌 Meus Itens Salvos ({itensSalvos.length})</Tab>
        </TabList>

        <TabPanels>
          {/* ================================================================= */}
          {/* ABA 1: PESQUISAR NO BANCO PÚBLICO                                 */}
          {/* ================================================================= */}
          <TabPanel style={{ padding: "1.25rem 0 0 0" }}>
            <Tile style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                  marginBottom: "1rem",
                }}
              >
                <h4 style={{ fontSize: "1.05rem", fontWeight: 600, margin: 0 }}>
                  🔍 Consulta de Preços de Referência & Homologações Oficiais
                </h4>
                <Tag type={fontePrincipal === "PNCP_OFICIAL" ? "blue" : "cool-gray"} size="sm">
                  {fontePrincipal === "PNCP_OFICIAL"
                    ? "Fonte: API Pública PNCP • Custo R$ 0,00"
                    : "Fonte: Base Consolidada de Referência"}
                </Tag>
              </div>

              <Grid style={{ padding: 0 }}>
                <Column lg={5} md={4} sm={4} style={{ marginBottom: "1rem" }}>
                  <TextInput
                    id="input-termo-catmat"
                    labelText="Descrição do Item, Marca/Configuração ou CATMAT"
                    placeholder="Ex: iPhone 16 128GB, Notebook i7 16GB 512GB, 452109..."
                    value={termoBusca}
                    onChange={(e) => setTermoBusca(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        executarPesquisa();
                      }
                    }}
                    helperText="Dica: inclua capacidade/configuração (ex: 128GB, 16GB SSD 512GB) para maior precisão."
                  />
                </Column>

                <Column lg={2} md={2} sm={4} style={{ marginBottom: "1rem" }}>
                  <Select
                    id="select-periodo-meses"
                    labelText="Intervalo de Tempo"
                    value={String(periodoMeses)}
                    onChange={(e) => setPeriodoMeses(Number(e.target.value))}
                  >
                    <SelectItem value="3" text="Últimos 3 meses" />
                    <SelectItem value="6" text="Últimos 6 meses" />
                    <SelectItem value="12" text="Últimos 12 meses (Padrão)" />
                    <SelectItem value="24" text="Últimos 24 meses" />
                  </Select>
                </Column>

                <Column lg={2} md={2} sm={4} style={{ marginBottom: "1rem" }}>
                  <Select
                    id="select-lastro-limite"
                    labelText="Lastro de Licitações"
                    value={String(limiteLastro)}
                    onChange={(e) => setLimiteLastro(Number(e.target.value))}
                  >
                    <SelectItem value="10" text="Até 10 homologações" />
                    <SelectItem value="20" text="Até 20 homologações (Ideal)" />
                    <SelectItem value="30" text="Até 30 homologações" />
                  </Select>
                </Column>

                <Column lg={2} md={2} sm={4} style={{ marginBottom: "1rem" }}>
                  <Select
                    id="select-uf-filtro"
                    labelText="Região / UF"
                    value={ufFiltro}
                    onChange={(e) => setUfFiltro(e.target.value)}
                  >
                    <SelectItem value="TODOS" text="Todo o Brasil" />
                    {UFS_BRASIL.map((sigla) => (
                      <SelectItem key={sigla} value={sigla} text={`Estado: ${sigla}`} />
                    ))}
                  </Select>
                </Column>

                <Column lg={3} md={2} sm={4} style={{ marginBottom: "1rem" }}>
                  <Select
                    id="select-modalidade-filtro"
                    labelText="Modalidade"
                    value={modalidadeFiltro}
                    onChange={(e) => setModalidadeFiltro(e.target.value)}
                  >
                    <SelectItem value="TODOS" text="Todas as Modalidades" />
                    <SelectItem value="PREGAO" text="Pregão Eletrônico" />
                    <SelectItem value="DISPENSA" text="Dispensa Eletrônica" />
                    <SelectItem value="CONCORRENCIA" text="Concorrência" />
                  </Select>
                </Column>

                <Column
                  lg={2}
                  md={2}
                  sm={4}
                  style={{ display: "flex", alignItems: "flex-end", marginBottom: "1rem" }}
                >
                  <Button
                    kind="primary"
                    size="md"
                    renderIcon={SearchIcon}
                    onClick={() => executarPesquisa()}
                    disabled={carregandoBusca}
                    style={{ width: "100%" }}
                  >
                    {carregandoBusca ? "Consultando PNCP..." : "Pesquisar"}
                  </Button>
                </Column>
              </Grid>
            </Tile>

            {/* Cards de Métricas e Análise de Dispersão Saneada */}
            <Grid style={{ padding: 0, marginBottom: "1.5rem" }}>
              <Column lg={4} md={2} sm={4} style={{ marginBottom: "1rem" }}>
                <Tile
                  style={{
                    padding: "1.25rem",
                    borderLeft: "4px solid var(--cds-interactive, #0f62fe)",
                    height: "100%",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.8rem",
                      color: "var(--cds-text-secondary)",
                      marginBottom: "0.25rem",
                    }}
                  >
                    Preço Médio Homologado (Saneado)
                  </div>
                  <div
                    style={{
                      fontSize: "1.55rem",
                      fontWeight: 700,
                      color: "var(--cds-text-primary)",
                    }}
                  >
                    {formatBRL(estatisticas.precoMedio)}
                  </div>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--cds-text-secondary)",
                      marginTop: "0.25rem",
                    }}
                  >
                    Mediana: <strong>{formatBRL(estatisticas.mediana)}</strong> •{" "}
                    {estatisticas.amostrasSaneadas} amostra(s) ativa(s)
                    {estatisticas.outliersDescartados > 0
                      ? ` (${estatisticas.outliersDescartados} outlier descartado)`
                      : ""}
                  </div>
                </Tile>
              </Column>

              <Column lg={4} md={2} sm={4} style={{ marginBottom: "1rem" }}>
                <Tile
                  style={{
                    padding: "1.25rem",
                    borderLeft: "4px solid var(--cds-support-success, #24a148)",
                    height: "100%",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.8rem",
                      color: "var(--cds-text-secondary)",
                      marginBottom: "0.25rem",
                    }}
                  >
                    Menor Preço Arrematado
                  </div>
                  <div
                    style={{
                      fontSize: "1.55rem",
                      fontWeight: 700,
                      color: "var(--cds-support-success, #24a148)",
                    }}
                  >
                    {formatBRL(estatisticas.menorPreco)}
                  </div>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--cds-text-secondary)",
                      marginTop: "0.25rem",
                    }}
                  >
                    Lance vencedor mais agressivo na amostra
                  </div>
                </Tile>
              </Column>

              <Column lg={4} md={2} sm={4} style={{ marginBottom: "1rem" }}>
                <Tile
                  style={{
                    padding: "1.25rem",
                    borderLeft: "4px solid var(--cds-support-warning, #f1c21b)",
                    height: "100%",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.8rem",
                      color: "var(--cds-text-secondary)",
                      marginBottom: "0.25rem",
                    }}
                  >
                    Maior Preço Homologado
                  </div>
                  <div
                    style={{
                      fontSize: "1.55rem",
                      fontWeight: 700,
                      color: "var(--cds-text-primary)",
                    }}
                  >
                    {formatBRL(estatisticas.maiorPreco)}
                  </div>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--cds-text-secondary)",
                      marginTop: "0.25rem",
                    }}
                  >
                    Teto de aceitabilidade registrado
                  </div>
                </Tile>
              </Column>

              <Column lg={4} md={2} sm={4} style={{ marginBottom: "1rem" }}>
                <Tile
                  style={{
                    padding: "1.25rem",
                    borderLeft: "4px solid var(--cds-support-info, #0043ce)",
                    height: "100%",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.8rem",
                      color: "var(--cds-text-secondary)",
                      marginBottom: "0.25rem",
                    }}
                  >
                    Desconto Médio Obtido
                  </div>
                  <div
                    style={{
                      fontSize: "1.55rem",
                      fontWeight: 700,
                      color: "var(--cds-support-info, #0043ce)",
                    }}
                  >
                    {estatisticas.descontoMedio.toFixed(1)}%
                  </div>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--cds-text-secondary)",
                      marginTop: "0.25rem",
                    }}
                  >
                    Redução média frente ao valor estimado do edital
                  </div>
                </Tile>
              </Column>
            </Grid>

            {/* Banner: Faixa de Lance Competitivo Sugerida + Salvar Item */}
            <Tile
              style={{
                padding: "1.25rem 1.5rem",
                marginBottom: "1.5rem",
                backgroundColor: "var(--cds-layer-accent, #f4f4f4)",
                borderLeft: "4px solid #007d79",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "1rem",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.95rem", marginBottom: "0.25rem" }}>
                    💡 Faixa de Lance Competitivo Sugerida para "{termoExibido}":
                  </div>
                  <div style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)" }}>
                    Com base no quartil vencedor e na mediana saneada ({estatisticas.amostrasSaneadas}{" "}
                    homologações), lances entre{" "}
                    <strong>{formatBRL(estatisticas.faixaSugeridaMin)}</strong> e{" "}
                    <strong>{formatBRL(estatisticas.faixaSugeridaMax)}</strong> apresentam alta
                    competitividade preservando margem operacional.
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                  <Tag type="teal" size="md">
                    Alta Competitividade
                  </Tag>
                  <Button
                    id="btn-salvar-item-inteligencia"
                    kind="primary"
                    size="sm"
                    renderIcon={Save}
                    onClick={abrirModalSalvarItem}
                    disabled={itens.length === 0}
                  >
                    Salvar Item na Minha Base
                  </Button>
                </div>
              </div>
            </Tile>

            {/* Tabela de Homologações Oficiais */}
            <Tile style={{ padding: "1.5rem" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "1rem",
                  marginBottom: "1rem",
                }}
              >
                <div>
                  <h4 style={{ fontSize: "1.05rem", fontWeight: 600, margin: 0 }}>
                    📋 Histórico de Homologações Públicas ({itens.length})
                  </h4>
                  <p
                    style={{
                      fontSize: "0.82rem",
                      color: "var(--cds-text-secondary)",
                      marginTop: "0.25rem",
                    }}
                  >
                    Clique em qualquer linha para inspecionar a especificação completa, marca/modelo,
                    vencedor e link oficial no PNCP. Desmarque itens de configuração diferente para
                    recalcular a média na hora.
                  </p>
                </div>

                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <Button
                    kind="tertiary"
                    size="sm"
                    renderIcon={Download}
                    onClick={() => handleExportarCsv(itensAtivosNoCalculo, termoExibido)}
                  >
                    Exportar CSV
                  </Button>
                </div>
              </div>

              <div style={{ overflowX: "auto" }}>
                <Table size="lg">
                  <TableHead>
                    <TableRow>
                      <TableHeader style={{ width: "44px" }}>
                        <input
                          type="checkbox"
                          aria-label="Selecionar todas as homologações para cálculo"
                          checked={todasLinhasMarcadas}
                          onChange={() => {
                            if (todasLinhasMarcadas) {
                              setIdsSelecionados(new Set(itens[0] ? [itens[0].id] : []));
                            } else {
                              setIdsSelecionados(new Set(itens.map((x) => x.id)));
                            }
                          }}
                        />
                      </TableHeader>
                      <TableHeader>Órgão / UF</TableHeader>
                      <TableHeader>Processo / Data</TableHeader>
                      <TableHeader>Item, Marca & Especificação</TableHeader>
                      <TableHeader>Empresa Vencedora</TableHeader>
                      <TableHeader>Qtd</TableHeader>
                      <TableHeader>Valor Estimado</TableHeader>
                      <TableHeader>Valor Homologado</TableHeader>
                      <TableHeader>Desconto</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {itens.map((row) => {
                      const marcada = idsSelecionados.has(row.id);
                      const marcaModelo = [row.marca, row.modelo].filter(Boolean).join(" • ");
                      return (
                        <TableRow
                          key={row.id}
                          onClick={() => setHomologacaoModal(row)}
                          style={{
                            cursor: "pointer",
                            opacity: marcada ? 1 : 0.55,
                          }}
                          title="Clique para abrir todas as informações desta homologação"
                        >
                          <TableCell
                            onClick={(e) => {
                              e.stopPropagation();
                            }}
                          >
                            <input
                              type="checkbox"
                              aria-label={`Considerar homologação ${row.numeroProcesso} no cálculo`}
                              checked={marcada}
                              onChange={() => toggleSelecionarLinha(row.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <strong>{row.orgaoNome}</strong>
                            <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                              UF: {row.uf}
                              {row.municipio ? ` (${row.municipio})` : ""} • {row.modalidade}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div style={{ fontWeight: 500 }}>{row.numeroProcesso}</div>
                            <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                              {row.dataHomologacao}
                            </div>
                          </TableCell>
                          <TableCell style={{ maxWidth: "340px" }}>
                            <div
                              style={{
                                fontSize: "0.84rem",
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                              }}
                            >
                              {row.itemDescricao}
                            </div>
                            <div
                              style={{
                                display: "flex",
                                gap: "0.35rem",
                                flexWrap: "wrap",
                                marginTop: "0.35rem",
                              }}
                            >
                              {marcaModelo && (
                                <Tag type="blue" size="sm">
                                  Marca/Mod: {marcaModelo}
                                </Tag>
                              )}
                              <Tag type="cool-gray" size="sm">
                                CATMAT: {row.catmat}
                              </Tag>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div style={{ fontSize: "0.84rem", fontWeight: 600 }}>
                              {row.empresaVencedora}
                            </div>
                            <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                              CNPJ: {row.cnpjVencedor}
                            </div>
                          </TableCell>
                          <TableCell>
                            {row.quantidade} {row.unidade || "UN"}
                          </TableCell>
                          <TableCell>{formatBRL(row.valorEstimadoUnitario)}</TableCell>
                          <TableCell>
                            <strong style={{ color: "var(--cds-support-success, #24a148)" }}>
                              {formatBRL(row.valorHomologadoUnitario)}
                            </strong>
                          </TableCell>
                          <TableCell>
                            <Tag type="green" size="sm">
                              -{row.descontoPercentual.toFixed(1)}%
                            </Tag>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </Tile>
          </TabPanel>

          {/* ================================================================= */}
          {/* ABA 2: MEUS ITENS SALVOS (BASE PRÓPRIA DO CLIENTE / TENANT)        */}
          {/* ================================================================= */}
          <TabPanel style={{ padding: "1.25rem 0 0 0" }}>
            <Tile style={{ padding: "1.5rem" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-end",
                  flexWrap: "wrap",
                  gap: "1rem",
                  marginBottom: "1.25rem",
                }}
              >
                <div style={{ flex: "1 1 320px" }}>
                  <h4 style={{ fontSize: "1.05rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                    📌 Base Própria de Produtos & Preços de Referência Salvos
                  </h4>
                  <p style={{ fontSize: "0.82rem", color: "var(--cds-text-secondary)" }}>
                    Consulte rapidamente itens já estudados pela sua equipe. Clique em qualquer
                    linha da tabela para abrir o modal com todas as métricas e homologações salvas.
                  </p>
                </div>

                <div style={{ flex: "1 1 340px", maxWidth: "460px" }}>
                  <TextInput
                    id="input-busca-itens-salvos"
                    labelText="Buscar na própria base"
                    placeholder="Filtrar por nome do produto, marca, CATMAT ou especificação..."
                    value={buscaSalvos}
                    onChange={(e) => setBuscaSalvos(e.target.value)}
                  />
                </div>
              </div>

              {carregandoSalvos ? (
                <div style={{ padding: "2rem", textAlign: "center", color: "var(--cds-text-secondary)" }}>
                  Carregando itens salvos da empresa...
                </div>
              ) : itensSalvosFiltrados.length === 0 ? (
                <div
                  style={{
                    padding: "2.5rem 1.5rem",
                    textAlign: "center",
                    border: "1px dashed var(--cds-border-subtle, #c6c6c6)",
                    borderRadius: "4px",
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: "0.35rem" }}>
                    {itensSalvos.length === 0
                      ? "Nenhum item salvo na sua base ainda."
                      : "Nenhum item salvo corresponde ao filtro digitado."}
                  </div>
                  <div
                    style={{
                      fontSize: "0.85rem",
                      color: "var(--cds-text-secondary)",
                      marginBottom: "1rem",
                    }}
                  >
                    Realize uma pesquisa na aba "Pesquisar no Banco Público" e clique em "Salvar Item
                    na Minha Base" para guardar o histórico do produto.
                  </div>
                  {itensSalvos.length === 0 && (
                    <Button kind="tertiary" size="sm" onClick={() => setAbaSelecionada(0)}>
                      Ir para Pesquisa de Preços
                    </Button>
                  )}
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <Table size="lg">
                    <TableHead>
                      <TableRow>
                        <TableHeader>Produto / Item Salvo</TableHeader>
                        <TableHeader>Marca / Especificação & CATMAT</TableHeader>
                        <TableHeader>Lastro</TableHeader>
                        <TableHeader>Preço Médio / Mediana</TableHeader>
                        <TableHeader>Menor Preço</TableHeader>
                        <TableHeader>Faixa Competitiva Sugerida</TableHeader>
                        <TableHeader>Salvo em</TableHeader>
                        <TableHeader>Ações</TableHeader>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {itensSalvosFiltrados.map((salvo) => (
                        <TableRow
                          key={salvo.id}
                          onClick={() => setItemSalvoModal(salvo)}
                          style={{ cursor: "pointer" }}
                          title="Clique para abrir todas as informações e homologações deste item salvo"
                        >
                          <TableCell>
                            <strong style={{ fontSize: "0.9rem" }}>{salvo.nomeProduto}</strong>
                            <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                              Busca: "{salvo.termoPesquisado}"
                            </div>
                          </TableCell>
                          <TableCell style={{ maxWidth: "300px" }}>
                            <div
                              style={{
                                fontSize: "0.82rem",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {salvo.especificacaoResumo || "—"}
                            </div>
                            <div style={{ display: "flex", gap: "0.35rem", marginTop: "0.25rem", flexWrap: "wrap" }}>
                              {salvo.marcaReferencia && (
                                <Tag type="blue" size="sm">
                                  {salvo.marcaReferencia}
                                </Tag>
                              )}
                              {salvo.catmat && (
                                <Tag type="cool-gray" size="sm">
                                  CATMAT: {salvo.catmat}
                                </Tag>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Tag type="teal" size="sm">
                              {salvo.quantidadeAmostras} certame(s)
                            </Tag>
                            <div style={{ fontSize: "0.72rem", color: "var(--cds-text-secondary)", marginTop: "0.2rem" }}>
                              {salvo.periodoMeses}m • UF: {salvo.ufFiltro}
                            </div>
                          </TableCell>
                          <TableCell>
                            <strong>{formatBRL(salvo.precoMedio)}</strong>
                            <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                              Mediana: {formatBRL(salvo.mediana)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <strong style={{ color: "var(--cds-support-success, #24a148)" }}>
                              {formatBRL(salvo.menorPreco)}
                            </strong>
                          </TableCell>
                          <TableCell>
                            <span style={{ fontSize: "0.84rem", fontWeight: 600 }}>
                              {formatBRL(salvo.faixaSugeridaMin)} – {formatBRL(salvo.faixaSugeridaMax)}
                            </span>
                          </TableCell>
                          <TableCell>{formatDataCurta(salvo.criadoEm)}</TableCell>
                          <TableCell
                            onClick={(e) => {
                              e.stopPropagation();
                            }}
                          >
                            <Button
                              kind="danger--ghost"
                              size="sm"
                              hasIconOnly
                              renderIcon={TrashCan}
                              iconDescription="Excluir item salvo"
                              onClick={(e: React.MouseEvent) => handleExcluirItemSalvo(e, salvo)}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Tile>
          </TabPanel>
        </TabPanels>
      </Tabs>

      {/* ===================================================================== */}
      {/* MODAL 1: DETALHES COMPLETOS DE UMA HOMOLOGAÇÃO PÚBLICA                */}
      {/* ===================================================================== */}
      <Modal
        open={Boolean(homologacaoModal)}
        modalHeading={
          homologacaoModal
            ? `Detalhes da Homologação — ${homologacaoModal.numeroProcesso}`
            : "Detalhes da Homologação"
        }
        modalLabel={
          homologacaoModal ? `${homologacaoModal.orgaoNome} (${homologacaoModal.uf})` : ""
        }
        primaryButtonText={
          homologacaoModal?.linkPncp ? "Abrir Certame Oficial no PNCP" : "Fechar"
        }
        secondaryButtonText="Fechar"
        onRequestClose={() => setHomologacaoModal(null)}
        onRequestSubmit={() => {
          if (homologacaoModal?.linkPncp) {
            window.open(homologacaoModal.linkPncp, "_blank", "noopener,noreferrer");
          } else {
            setHomologacaoModal(null);
          }
        }}
        size="lg"
      >
        {homologacaoModal && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <Tile style={{ backgroundColor: "var(--cds-layer-02, #f4f4f4)", padding: "1rem" }}>
              <div
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  color: "var(--cds-text-secondary)",
                  marginBottom: "0.35rem",
                }}
              >
                Especificação Técnica Completa do Item (Item #{homologacaoModal.itemNumero})
              </div>
              <div style={{ fontSize: "0.92rem", lineHeight: 1.5, fontWeight: 500 }}>
                {homologacaoModal.itemDescricao}
              </div>
              {homologacaoModal.informacaoComplementar && (
                <div
                  style={{
                    fontSize: "0.84rem",
                    color: "var(--cds-text-secondary)",
                    marginTop: "0.5rem",
                  }}
                >
                  <strong>Informação Complementar:</strong>{" "}
                  {homologacaoModal.informacaoComplementar}
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  flexWrap: "wrap",
                  marginTop: "0.75rem",
                }}
              >
                <Tag type="blue" size="sm">
                  Marca: {homologacaoModal.marca || "Não informada na ata"}
                </Tag>
                <Tag type="cyan" size="sm">
                  Modelo: {homologacaoModal.modelo || "Não informado"}
                </Tag>
                <Tag type="cool-gray" size="sm">
                  CATMAT/CATSER: {homologacaoModal.catmat}
                </Tag>
                {homologacaoModal.tipoBeneficio && (
                  <Tag type="teal" size="sm">
                    {homologacaoModal.tipoBeneficio}
                  </Tag>
                )}
              </div>
            </Tile>

            <Grid style={{ padding: 0 }}>
              <Column lg={4} md={2} sm={4} style={{ marginBottom: "0.75rem" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                  Valor Estimado Unitário
                </div>
                <div style={{ fontSize: "1.1rem", fontWeight: 600 }}>
                  {formatBRL(homologacaoModal.valorEstimadoUnitario)}
                </div>
              </Column>
              <Column lg={4} md={2} sm={4} style={{ marginBottom: "0.75rem" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                  Valor Arrematado / Homologado
                </div>
                <div
                  style={{
                    fontSize: "1.2rem",
                    fontWeight: 700,
                    color: "var(--cds-support-success, #24a148)",
                  }}
                >
                  {formatBRL(homologacaoModal.valorHomologadoUnitario)}
                </div>
              </Column>
              <Column lg={4} md={2} sm={4} style={{ marginBottom: "0.75rem" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                  Quantidade & Total Homologado
                </div>
                <div style={{ fontSize: "1rem", fontWeight: 600 }}>
                  {homologacaoModal.quantidade} {homologacaoModal.unidade} •{" "}
                  {formatBRL(
                    homologacaoModal.valorTotalHomologado ||
                      homologacaoModal.valorHomologadoUnitario * homologacaoModal.quantidade,
                  )}
                </div>
              </Column>
              <Column lg={4} md={2} sm={4} style={{ marginBottom: "0.75rem" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                  Desconto sobre o Estimado
                </div>
                <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#0043ce" }}>
                  -{homologacaoModal.descontoPercentual.toFixed(2)}%
                </div>
              </Column>
            </Grid>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: "0.75rem",
                borderTop: "1px solid var(--cds-border-subtle, #e0e0e0)",
                paddingTop: "0.75rem",
                fontSize: "0.85rem",
              }}
            >
              <div>
                <strong>Empresa Vencedora:</strong>
                <div>{homologacaoModal.empresaVencedora}</div>
                <div style={{ color: "var(--cds-text-secondary)" }}>
                  CNPJ: {homologacaoModal.cnpjVencedor}
                  {homologacaoModal.porteFornecedor
                    ? ` • Porte: ${homologacaoModal.porteFornecedor}`
                    : ""}
                </div>
              </div>
              <div>
                <strong>Órgão & Certame:</strong>
                <div>
                  {homologacaoModal.orgaoNome} ({homologacaoModal.uf})
                </div>
                <div style={{ color: "var(--cds-text-secondary)" }}>
                  {homologacaoModal.modalidade} • Homologado em{" "}
                  {homologacaoModal.dataHomologacao}
                </div>
              </div>
            </div>

            <div>
              <Button
                kind="ghost"
                size="sm"
                renderIcon={Copy}
                onClick={() => {
                  navigator.clipboard?.writeText(
                    `${homologacaoModal.itemDescricao} | Marca: ${
                      homologacaoModal.marca || "N/I"
                    } | Homologado: ${formatBRL(homologacaoModal.valorHomologadoUnitario)} (${
                      homologacaoModal.orgaoNome
                    })`,
                  );
                  setFeedback({
                    kind: "info",
                    text: "Resumo da homologação copiado para a área de transferência.",
                  });
                }}
              >
                Copiar Referência de Preço
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ===================================================================== */}
      {/* MODAL 2: SALVAR ITEM NA BASE PRÓPRIA DA EMPRESA                       */}
      {/* ===================================================================== */}
      <Modal
        open={modalSalvarAberto}
        modalHeading="Salvar Item na Base de Inteligência de Preços"
        modalLabel="Referência interna da empresa"
        primaryButtonText={salvandoItem ? "Salvando..." : "Salvar Item"}
        primaryButtonDisabled={salvandoItem}
        secondaryButtonText="Cancelar"
        onRequestClose={() => setModalSalvarAberto(false)}
        onRequestSubmit={confirmarSalvarItem}
        size="md"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <p style={{ fontSize: "0.85rem", color: "var(--cds-text-secondary)" }}>
            Salve este estudo de preço com as <strong>{itensAtivosNoCalculo.length}</strong>{" "}
            homologações selecionadas (Média Saneada:{" "}
            <strong>{formatBRL(estatisticas.precoMedio)}</strong> • Faixa Competitiva:{" "}
            <strong>
              {formatBRL(estatisticas.faixaSugeridaMin)} a {formatBRL(estatisticas.faixaSugeridaMax)}
            </strong>
            ) para consulta imediata em futuras licitações.
          </p>

          <TextInput
            id="input-salvar-nome-produto"
            labelText="Nome do Produto / Item de Referência *"
            placeholder="Ex: Notebook Corporativo i7 16GB SSD 512GB"
            value={formSalvarNome}
            onChange={(e) => setFormSalvarNome(e.target.value)}
          />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <TextInput
              id="input-salvar-marca"
              labelText="Marca / Configuração de Referência"
              placeholder="Ex: Dell Latitude / Lenovo 512GB"
              value={formSalvarMarca}
              onChange={(e) => setFormSalvarMarca(e.target.value)}
            />
            <TextInput
              id="input-salvar-catmat"
              labelText="Código CATMAT / CATSER (Opcional)"
              placeholder="Ex: 452109"
              value={formSalvarCatmat}
              onChange={(e) => setFormSalvarCatmat(e.target.value)}
            />
          </div>

          <TextArea
            id="input-salvar-observacoes"
            labelText="Observações Internas / Fornecedor ou Custo Cotado (Opcional)"
            placeholder="Ex: Cotação distribuidor X em R$ 3.150,00; exigir garantia 36m."
            rows={3}
            value={formSalvarObs}
            onChange={(e) => setFormSalvarObs(e.target.value)}
          />
        </div>
      </Modal>

      {/* ===================================================================== */}
      {/* MODAL 3: DETALHES COMPLETOS DO ITEM SALVO (AO CLICAR NA LINHA)        */}
      {/* ===================================================================== */}
      <Modal
        open={Boolean(itemSalvoModal)}
        modalHeading={
          itemSalvoModal
            ? `${itemSalvoModal.nomeProduto}`
            : "Detalhes do Item Salvo"
        }
        modalLabel={
          itemSalvoModal
            ? `Salvo em ${formatDataCurta(itemSalvoModal.criadoEm)} • Lastro de ${
                itemSalvoModal.quantidadeAmostras
              } homologações`
            : ""
        }
        primaryButtonText="Reconsultar Agora no PNCP"
        secondaryButtonText="Fechar"
        onRequestClose={() => setItemSalvoModal(null)}
        onRequestSubmit={() => {
          if (!itemSalvoModal) return;
          const alvo = itemSalvoModal;
          setTermoBusca(alvo.termoPesquisado);
          setUfFiltro(alvo.ufFiltro || "TODOS");
          setModalidadeFiltro(alvo.modalidadeFiltro || "TODOS");
          setPeriodoMeses(alvo.periodoMeses || 12);
          setItemSalvoModal(null);
          setAbaSelecionada(0);
          executarPesquisa({
            q: alvo.termoPesquisado,
            uf: alvo.ufFiltro || "TODOS",
            modalidade: alvo.modalidadeFiltro || "TODOS",
            periodoMeses: alvo.periodoMeses || 12,
          });
        }}
        size="lg"
      >
        {itemSalvoModal && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {/* Resumo de métricas do snapshot salvo */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: "0.75rem",
              }}
            >
              <Tile style={{ backgroundColor: "var(--cds-layer-02, #f4f4f4)", padding: "0.85rem" }}>
                <div style={{ fontSize: "0.72rem", color: "var(--cds-text-secondary)" }}>
                  Preço Médio Saneado
                </div>
                <div style={{ fontSize: "1.15rem", fontWeight: 700 }}>
                  {formatBRL(itemSalvoModal.precoMedio)}
                </div>
                <div style={{ fontSize: "0.72rem", color: "var(--cds-text-secondary)" }}>
                  Mediana: {formatBRL(itemSalvoModal.mediana)}
                </div>
              </Tile>

              <Tile style={{ backgroundColor: "var(--cds-layer-02, #f4f4f4)", padding: "0.85rem" }}>
                <div style={{ fontSize: "0.72rem", color: "var(--cds-text-secondary)" }}>
                  Menor / Maior Homologado
                </div>
                <div
                  style={{
                    fontSize: "1rem",
                    fontWeight: 700,
                    color: "var(--cds-support-success, #24a148)",
                  }}
                >
                  {formatBRL(itemSalvoModal.menorPreco)}
                </div>
                <div style={{ fontSize: "0.72rem", color: "var(--cds-text-secondary)" }}>
                  Teto: {formatBRL(itemSalvoModal.maiorPreco)}
                </div>
              </Tile>

              <Tile style={{ backgroundColor: "var(--cds-layer-02, #f4f4f4)", padding: "0.85rem" }}>
                <div style={{ fontSize: "0.72rem", color: "var(--cds-text-secondary)" }}>
                  💡 Faixa Competitiva
                </div>
                <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#007d79" }}>
                  {formatBRL(itemSalvoModal.faixaSugeridaMin)} –{" "}
                  {formatBRL(itemSalvoModal.faixaSugeridaMax)}
                </div>
                <div style={{ fontSize: "0.72rem", color: "var(--cds-text-secondary)" }}>
                  Desconto médio: -{itemSalvoModal.descontoMedio.toFixed(1)}%
                </div>
              </Tile>
            </div>

            <div style={{ fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <div>
                <strong>Termo Pesquisado:</strong> {itemSalvoModal.termoPesquisado} •{" "}
                <strong>UF:</strong> {itemSalvoModal.ufFiltro} •{" "}
                <strong>Janela:</strong> {itemSalvoModal.periodoMeses} meses
              </div>
              {(itemSalvoModal.marcaReferencia || itemSalvoModal.catmat) && (
                <div>
                  {itemSalvoModal.marcaReferencia && (
                    <span>
                      <strong>Marca / Configuração:</strong> {itemSalvoModal.marcaReferencia}{" "}
                    </span>
                  )}
                  {itemSalvoModal.catmat && (
                    <span>
                      • <strong>CATMAT:</strong> {itemSalvoModal.catmat}
                    </span>
                  )}
                </div>
              )}
              {itemSalvoModal.observacoes && (
                <div
                  style={{
                    padding: "0.65rem 0.85rem",
                    backgroundColor: "var(--cds-layer-accent, #f4f4f4)",
                    borderLeft: "3px solid #0f62fe",
                  }}
                >
                  <strong>Observações Internas:</strong> {itemSalvoModal.observacoes}
                </div>
              )}
            </div>

            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "0.5rem",
                }}
              >
                <strong style={{ fontSize: "0.9rem" }}>
                  Homologações Salvas neste Estudo ({itemSalvoModal.homologacoesJson.length})
                </strong>
                <Button
                  kind="ghost"
                  size="sm"
                  renderIcon={Download}
                  onClick={() =>
                    handleExportarCsv(itemSalvoModal.homologacoesJson, itemSalvoModal.nomeProduto)
                  }
                >
                  Baixar CSV
                </Button>
              </div>

              <div style={{ maxHeight: "280px", overflowY: "auto", overflowX: "auto" }}>
                <Table size="sm">
                  <TableHead>
                    <TableRow>
                      <TableHeader>Órgão / UF</TableHeader>
                      <TableHeader>Especificação & Marca</TableHeader>
                      <TableHeader>Vencedor</TableHeader>
                      <TableHeader>Homologado</TableHeader>
                      <TableHeader>PNCP</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {itemSalvoModal.homologacoesJson.map((h) => (
                      <TableRow key={h.id}>
                        <TableCell>
                          <div style={{ fontWeight: 600, fontSize: "0.8rem" }}>{h.orgaoNome}</div>
                          <div style={{ fontSize: "0.72rem", color: "var(--cds-text-secondary)" }}>
                            {h.uf} • {h.dataHomologacao}
                          </div>
                        </TableCell>
                        <TableCell style={{ maxWidth: "260px" }}>
                          <div style={{ fontSize: "0.78rem" }}>{h.itemDescricao}</div>
                          {(h.marca || h.modelo) && (
                            <div style={{ fontSize: "0.72rem", color: "#0043ce", fontWeight: 600 }}>
                              {[h.marca, h.modelo].filter(Boolean).join(" • ")}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div style={{ fontSize: "0.78rem" }}>{h.empresaVencedora}</div>
                          <div style={{ fontSize: "0.7rem", color: "var(--cds-text-secondary)" }}>
                            {h.cnpjVencedor}
                          </div>
                        </TableCell>
                        <TableCell>
                          <strong style={{ color: "var(--cds-support-success, #24a148)" }}>
                            {formatBRL(h.valorHomologadoUnitario)}
                          </strong>
                        </TableCell>
                        <TableCell>
                          {h.linkPncp ? (
                            <Button
                              kind="ghost"
                              size="sm"
                              hasIconOnly
                              renderIcon={Launch}
                              iconDescription="Abrir no PNCP"
                              onClick={() =>
                                window.open(h.linkPncp || "", "_blank", "noopener,noreferrer")
                              }
                            />
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </ModulePageShell>
  );
}

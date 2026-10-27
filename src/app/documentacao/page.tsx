"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Button,
  Checkbox,
  Column,
  Form,
  Grid,
  InlineLoading,
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
  Document,
  DocumentUnknown,
  Download,
  Renew,
  Search,
  TrashCan,
  Upgrade,
  Upload,
  WarningAlt,
} from "@carbon/icons-react";
import { ModulePageShell } from "@/components/shell/module-page-shell";
import { FileDropZone } from "@/components/ui/file-drop-zone";

interface DocumentoItem {
  id: string;
  nome: string;
  categoria: string;
  tipo: string | null;
  orgaoEmissor: string | null;
  semValidade: boolean;
  dataEmissao: string | null;
  dataVencimento: string | null;
  arquivoUrl: string | null;
  arquivoNome: string | null;
  arquivoTamanho: number | null;
  mimeType: string | null;
  versao: number;
  documentoPaiId: string | null;
  status: string;
  alertaVencimento: boolean;
  vencido: boolean;
  diasParaVencer: number | null;
  criadoEm: string;
  atualizadoEm: string;
}

interface ListResponse {
  ok: boolean;
  total: number;
  vencidosOuVencendo: number;
  page: number;
  pageSize: number;
  totalPages: number;
  documentos: DocumentoItem[];
}

const CATEGORIAS = [
  { id: "", rotulo: "Todas as Categorias" },
  { id: "JURIDICA", rotulo: "Habilitação Jurídica" },
  { id: "FISCAL_TRABALHISTA", rotulo: "Fiscal & Trabalhista" },
  { id: "QUALIFICACAO_TECNICA", rotulo: "Qualificação Técnica (ACTs)" },
  { id: "QUALIFICACAO_ECONOMICA", rotulo: "Qualificação Econômica" },
  { id: "OUTROS", rotulo: "Outros Documentos" },
];

export default function DocumentacaoPage() {
  const [categoriaAtiva, setCategoriaAtiva] = useState("");
  const [documentos, setDocumentos] = useState<DocumentoItem[]>([]);
  const [total, setTotal] = useState(0);
  const [vencidosOuVencendo, setVencidosOuVencendo] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(true);

  // Modal Novo Documento
  const [modalNovoAberto, setModalNovoAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [formErro, setFormErro] = useState<string | null>(null);

  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState("FISCAL_TRABALHISTA");
  const [tipo, setTipo] = useState("");
  const [orgaoEmissor, setOrgaoEmissor] = useState("");
  const [semValidade, setSemValidade] = useState(false);
  const [dataEmissao, setDataEmissao] = useState("");
  const [dataVencimento, setDataVencimento] = useState("");
  const [arquivoNome, setArquivoNome] = useState("");
  const [arquivoFile, setArquivoFile] = useState<File | null>(null);

  // Modal Nova Versão
  const [modalVersaoAberto, setModalVersaoAberto] = useState(false);
  const [docAlvoVersao, setDocAlvoVersao] = useState<DocumentoItem | null>(null);
  const [versaoDataEmissao, setVersaoDataEmissao] = useState("");
  const [versaoDataVencimento, setVersaoDataVencimento] = useState("");
  const [versaoArquivoNome, setVersaoArquivoNome] = useState("");
  const [versaoArquivoFile, setVersaoArquivoFile] = useState<File | null>(null);

  const handleBaixarDocumento = (doc: DocumentoItem) => {
    const a = document.createElement("a");
    a.href = `/api/documentos/${doc.id}/download`;
    a.setAttribute("download", doc.arquivoNome || `${doc.nome}.pdf`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const carregarDocumentos = useCallback(async () => {
    setCarregando(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (categoriaAtiva) params.set("categoria", categoriaAtiva);
      if (busca) params.set("busca", busca);

      const res = await fetch(`/api/documentos?${params.toString()}`);
      if (res.ok) {
        const data: ListResponse = await res.json();
        setDocumentos(data.documentos || []);
        setTotal(data.total || 0);
        setVencidosOuVencendo(data.vencidosOuVencendo || 0);
      }
    } finally {
      setCarregando(false);
    }
  }, [busca, categoriaAtiva, page, pageSize]);

  useEffect(() => {
    carregarDocumentos();
  }, [carregarDocumentos]);

  const abrirModalNovo = () => {
    setNome("");
    setCategoria(categoriaAtiva || "FISCAL_TRABALHISTA");
    setTipo("");
    setOrgaoEmissor("");
    setSemValidade(false);
    setDataEmissao("");
    setDataVencimento("");
    setArquivoNome("");
    setFormErro(null);
    setModalNovoAberto(true);
  };

  const salvarNovoDocumento = async () => {
    if (!nome.trim()) {
      setFormErro("Nome do documento é obrigatório.");
      return;
    }
    if (!semValidade && !dataVencimento) {
      setFormErro("Data de vencimento é obrigatória para documentos com validade determinada.");
      return;
    }

    setSalvando(true);
    setFormErro(null);

    const formData = new FormData();
    formData.append("nome", nome.trim());
    formData.append("categoria", categoria);
    if (tipo.trim()) formData.append("tipo", tipo.trim());
    if (orgaoEmissor.trim()) formData.append("orgaoEmissor", orgaoEmissor.trim());
    formData.append("semValidade", String(semValidade));
    if (dataEmissao) formData.append("dataEmissao", dataEmissao);
    if (!semValidade && dataVencimento) formData.append("dataVencimento", dataVencimento);
    if (arquivoFile) {
      formData.append("file", arquivoFile);
      formData.append("arquivoNome", arquivoFile.name);
    } else if (arquivoNome.trim()) {
      formData.append("arquivoNome", arquivoNome.trim());
    }

    try {
      const res = await fetch("/api/documentos", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        setModalNovoAberto(false);
        setArquivoFile(null);
        setArquivoNome("");
        await carregarDocumentos();
      } else {
        const err = await res.json();
        setFormErro(err.message || "Erro ao salvar documento.");
      }
    } catch {
      setFormErro("Erro de rede ao salvar documento.");
    } finally {
      setSalvando(false);
    }
  };

  const abrirModalNovaVersao = (doc: DocumentoItem) => {
    setDocAlvoVersao(doc);
    setVersaoDataEmissao("");
    setVersaoDataVencimento("");
    setVersaoArquivoNome("");
    setVersaoArquivoFile(null);
    setFormErro(null);
    setModalVersaoAberto(true);
  };

  const salvarNovaVersao = async () => {
    if (!docAlvoVersao) return;
    if (!docAlvoVersao.semValidade && !versaoDataVencimento) {
      setFormErro("Informe a nova data de vencimento.");
      return;
    }

    setSalvando(true);
    setFormErro(null);

    const formData = new FormData();
    if (versaoDataEmissao) formData.append("dataEmissao", versaoDataEmissao);
    if (versaoDataVencimento) formData.append("dataVencimento", versaoDataVencimento);
    if (versaoArquivoFile) {
      formData.append("file", versaoArquivoFile);
      formData.append("arquivoNome", versaoArquivoFile.name);
    } else if (versaoArquivoNome.trim()) {
      formData.append("arquivoNome", versaoArquivoNome.trim());
    }

    try {
      const res = await fetch(`/api/documentos/${docAlvoVersao.id}/nova-versao`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        setModalVersaoAberto(false);
        setVersaoArquivoFile(null);
        setVersaoArquivoNome("");
        await carregarDocumentos();
      } else {
        const err = await res.json();
        setFormErro(err.message || "Erro ao gerar nova versão.");
      }
    } catch {
      setFormErro("Erro de rede ao salvar nova versão.");
    } finally {
      setSalvando(false);
    }
  };

  const excluirDocumento = async (id: string, nomeDoc: string) => {
    if (!window.confirm(`Confirma a exclusão do documento "${nomeDoc}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/documentos/${id}`, { method: "DELETE" });
      if (res.ok) {
        await carregarDocumentos();
      }
    } catch {
      // Ignorar
    }
  };

  const getCategoriaLabel = (cat: string) => {
    switch (cat) {
      case "JURIDICA":
        return "Habilitação Jurídica";
      case "FISCAL_TRABALHISTA":
        return "Fiscal & Trabalhista";
      case "QUALIFICACAO_TECNICA":
        return "Qualificação Técnica";
      case "QUALIFICACAO_ECONOMICA":
        return "Qualificação Econômica";
      case "OUTROS":
      default:
        return "Outros";
    }
  };

  return (
    <ModulePageShell
      routePath="/documentacao"
      subtitle="Acervo corporativo de certidões, balanços e atestados técnicos."
    >
      <Grid fullWidth>
        {/* Painel Superior de Resumo e Ações */}
        <Column lg={16} md={8} sm={4} style={{ marginBottom: "1rem" }}>
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
                id="busca-documentos"
                labelText=""
                aria-label="Buscar documentos por nome, tipo ou órgão"
                placeholder="Buscar por nome, tipo ou órgão emissor..."
                size="sm"
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value);
                  setPage(1);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    carregarDocumentos();
                  }
                }}
                style={{ minWidth: "16rem", maxWidth: "24rem" }}
              />

              <Button
                kind="primary"
                size="sm"
                renderIcon={Search}
                onClick={() => {
                  setPage(1);
                  carregarDocumentos();
                }}
              >
                Buscar
              </Button>

              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Tag size="sm" type="cool-gray" className="pncp-mono">
                  {total} documento{total !== 1 ? "s" : ""}
                </Tag>
                {vencidosOuVencendo > 0 && (
                  <Tag
                    size="sm"
                    type="red"
                    className="pncp-mono"
                    renderIcon={WarningAlt}
                    style={{ fontWeight: 700 }}
                  >
                    {vencidosOuVencendo} vencendo em ≤ 30 dias
                  </Tag>
                )}
              </div>

              <Button
                kind="ghost"
                size="sm"
                hasIconOnly
                renderIcon={Renew}
                iconDescription="Atualizar acervo"
                onClick={() => carregarDocumentos()}
              />
            </div>

            <Button
              kind="primary"
              size="sm"
              data-testid="btn-novo-documento"
              renderIcon={Add}
              onClick={abrirModalNovo}
            >
              + Novo Documento
            </Button>
          </Tile>
        </Column>

        {/* Abas por Categoria da Lei 14.133 */}
        <Column lg={16} md={8} sm={4} style={{ marginBottom: "1rem" }}>
          <Tabs
            selectedIndex={CATEGORIAS.findIndex((c) => c.id === categoriaAtiva)}
            onChange={({ selectedIndex }) => {
              setCategoriaAtiva(CATEGORIAS[selectedIndex]?.id || "");
              setPage(1);
            }}
          >
            <TabList aria-label="Categorias de Documentação" contained>
              {CATEGORIAS.map((cat) => (
                <Tab key={cat.id}>{cat.rotulo}</Tab>
              ))}
            </TabList>
          </Tabs>
        </Column>

        {/* Lista de Documentos */}
        <Column lg={16} md={8} sm={4}>
          {carregando ? (
            <Tile style={{ padding: "3rem", textAlign: "center" }}>
              <InlineLoading description="Carregando acervo documental..." />
            </Tile>
          ) : documentos.length === 0 ? (
            <Tile style={{ padding: "3.5rem 1rem", textAlign: "center" }}>
              <DocumentUnknown size={36} style={{ marginBottom: "1rem", opacity: 0.5 }} />
              <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1.125rem", fontWeight: 600 }}>
                Nenhum documento cadastrado nesta categoria
              </h3>
              <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--cds-text-secondary)" }}>
                Clique em "+ Novo Documento" para anexar certidões, balanços ou atestados técnicos.
              </p>
            </Tile>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {documentos.map((doc) => {
                const dataVenc = doc.dataVencimento ? new Date(doc.dataVencimento) : null;
                const dataEmiss = doc.dataEmissao ? new Date(doc.dataEmissao) : null;

                return (
                  <Tile
                    key={doc.id}
                    data-testid={`documento-card-${doc.id}`}
                    style={{
                      padding: "1.25rem",
                      borderLeft: doc.alertaVencimento
                        ? "4px solid var(--cds-support-error, #da1e28)"
                        : "4px solid var(--cds-support-info, #4589ff)",
                      backgroundColor: doc.alertaVencimento
                        ? "var(--cds-layer-accent-01, rgba(218, 30, 40, 0.05))"
                        : "var(--cds-layer-01, #ffffff)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: "1rem",
                        flexWrap: "wrap",
                      }}
                    >
                      {/* Lado Esquerdo: Identificação e Metadados */}
                      <div style={{ flex: 1, minWidth: "18rem" }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            flexWrap: "wrap",
                            marginBottom: "0.375rem",
                          }}
                        >
                          <Tag type="blue" size="sm" className="pncp-mono">
                            {getCategoriaLabel(doc.categoria)}
                          </Tag>
                          <Tag type={doc.versao > 1 ? "magenta" : "cool-gray"} size="sm" className="pncp-mono">
                            v{doc.versao}{doc.versao > 1 ? " (Histórico mantido)" : ""}
                          </Tag>
                          {doc.semValidade ? (
                            <Tag type="teal" size="sm">
                              Permanente
                            </Tag>
                          ) : doc.vencido ? (
                            <Tag
                              type="red"
                              size="sm"
                              renderIcon={WarningAlt}
                              className="pncp-mono"
                              data-testid="documento-alerta-vencimento"
                              style={{ fontWeight: 700 }}
                            >
                              ⛔ VENCIDO ({Math.abs(doc.diasParaVencer || 0)}d atrás)
                            </Tag>
                          ) : doc.alertaVencimento ? (
                            <Tag
                              type="red"
                              size="sm"
                              renderIcon={WarningAlt}
                              className="pncp-mono"
                              data-testid="documento-alerta-vencimento"
                              style={{ fontWeight: 700 }}
                            >
                              ⚠️ Vence em {doc.diasParaVencer} dias
                            </Tag>
                          ) : (
                            <Tag type="green" size="sm" className="pncp-mono">
                              Vigente ({doc.diasParaVencer}d)
                            </Tag>
                          )}
                        </div>

                        {/* Nome do Documento (Vermelho e Negrito se vencido ou vencendo em <= 30 dias) */}
                        <h3
                          style={{
                            margin: "0 0 0.375rem 0",
                            fontSize: "1.125rem",
                            fontWeight: doc.alertaVencimento ? 700 : 600,
                            color: doc.alertaVencimento
                              ? "var(--cds-support-error, #da1e28)"
                              : "var(--cds-text-primary)",
                          }}
                        >
                          {doc.nome}
                        </h3>

                        {/* Detalhes de Emissão e Vencimento */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "1.5rem",
                            flexWrap: "wrap",
                            fontSize: "0.8125rem",
                            color: "var(--cds-text-secondary)",
                          }}
                        >
                          {doc.orgaoEmissor && (
                            <div>
                              <strong>Órgão Emissor:</strong> {doc.orgaoEmissor}
                            </div>
                          )}
                          {dataEmiss && (
                            <div>
                              <strong>Emissão:</strong>{" "}
                              <span className="pncp-mono">{dataEmiss.toLocaleDateString("pt-BR")}</span>
                            </div>
                          )}
                          {dataVenc && (
                            <div
                              style={{
                                color: doc.alertaVencimento ? "var(--cds-support-error, #da1e28)" : undefined,
                                fontWeight: doc.alertaVencimento ? 700 : 400,
                              }}
                            >
                              <strong>Vencimento:</strong>{" "}
                              <span className="pncp-mono">{dataVenc.toLocaleDateString("pt-BR")}</span>
                            </div>
                          )}
                          {doc.arquivoNome && (
                            <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                              <Document size={14} />
                              <span className="pncp-mono">{doc.arquivoNome}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Lado Direito: Ações */}
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <Button
                          kind="ghost"
                          size="sm"
                          renderIcon={Download}
                          data-testid={`btn-baixar-doc-${doc.id}`}
                          onClick={() => handleBaixarDocumento(doc)}
                        >
                          Baixar
                        </Button>
                        <Button
                          kind="tertiary"
                          size="sm"
                          data-testid={`btn-nova-versao-${doc.id}`}
                          renderIcon={Upgrade}
                          onClick={() => abrirModalNovaVersao(doc)}
                        >
                          Atualizar (Nova Versão)
                        </Button>
                        <Button
                          kind="danger--ghost"
                          size="sm"
                          data-testid={`btn-excluir-doc-${doc.id}`}
                          renderIcon={TrashCan}
                          onClick={() => excluirDocumento(doc.id, doc.nome)}
                        >
                          Excluir
                        </Button>
                      </div>
                    </div>
                  </Tile>
                );
              })}

              {total > pageSize && (
                <div style={{ marginTop: "1rem" }}>
                  <Pagination
                    backwardText="Página anterior"
                    forwardText="Próxima página"
                    itemsPerPageText="Itens por página:"
                    page={page}
                    pageNumberText="Número da página"
                    pageSize={pageSize}
                    pageSizes={[10, 20, 50]}
                    totalItems={total}
                    onChange={({ page: novaPagina, pageSize: novoPageSize }) => {
                      setPage(novaPagina);
                      setPageSize(novoPageSize);
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </Column>
      </Grid>

      {/* Modal Novo Documento */}
      <Modal
        open={modalNovoAberto}
        modalHeading="Cadastrar Documento de Habilitação (Lei 14.133/2021)"
        primaryButtonText={salvando ? "Salvando..." : "Salvar Documento"}
        secondaryButtonText="Cancelar"
        primaryButtonDisabled={salvando}
        onRequestClose={() => setModalNovoAberto(false)}
        onRequestSubmit={salvarNovoDocumento}
        data-testid="modal-novo-documento"
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

          <TextInput
            id="doc-nome"
            labelText="Nome do Documento / Certidão *"
            placeholder="Ex: Certidão Negativa de Débitos Federais (CND), Balanço 2025"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />

          <Grid fullWidth style={{ padding: 0 }}>
            <Column lg={8} md={4} sm={4}>
              <Select
                id="doc-categoria"
                labelText="Categoria Legal *"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
              >
                {CATEGORIAS.filter((c) => c.id).map((cat) => (
                  <SelectItem key={cat.id} value={cat.id} text={cat.rotulo} />
                ))}
              </Select>
            </Column>
            <Column lg={8} md={4} sm={4}>
              <TextInput
                id="doc-orgao"
                labelText="Órgão Emissor"
                placeholder="Ex: Receita Federal, Junta Comercial, TJ-GO"
                value={orgaoEmissor}
                onChange={(e) => setOrgaoEmissor(e.target.value)}
              />
            </Column>

            <Column lg={16} md={8} sm={4}>
              <Checkbox
                id="doc-sem-validade"
                labelText="Documento permanente (Sem prazo de validade — ex: Diplomas, Contrato Social, Atestados definitivos)"
                checked={semValidade}
                onChange={(_, { checked }) => setSemValidade(checked)}
              />
            </Column>

            <Column lg={8} md={4} sm={4}>
              <TextInput
                id="doc-emissao"
                type="date"
                labelText="Data de Emissão"
                value={dataEmissao}
                onChange={(e) => setDataEmissao(e.target.value)}
              />
            </Column>
            <Column lg={8} md={4} sm={4}>
              <TextInput
                id="doc-vencimento"
                type="date"
                labelText={semValidade ? "Data de Vencimento (Dispensada)" : "Data de Vencimento *"}
                disabled={semValidade}
                value={dataVencimento}
                onChange={(e) => setDataVencimento(e.target.value)}
              />
            </Column>

            <Column lg={16} md={8} sm={4}>
              <div style={{ marginTop: "0.5rem" }}>
                <FileDropZone
                  id="doc-file-upload"
                  label="Arquivo do Documento (PDF, DOCX ou Imagem)"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                  selectedFile={arquivoFile}
                  selectedFileName={arquivoNome}
                  onFileSelect={(file) => {
                    setArquivoFile(file);
                    setArquivoNome(file.name);
                  }}
                  onFileClear={() => {
                    setArquivoFile(null);
                    setArquivoNome("");
                  }}
                  helperText="Arraste e solte o arquivo aqui ou clique para selecionar (PDF, DOCX, PNG, JPG)"
                  dataTestId="dropzone-doc-upload"
                />
              </div>
            </Column>
          </Grid>
        </Form>
      </Modal>

      {/* Modal Nova Versão */}
      <Modal
        open={modalVersaoAberto}
        modalHeading={`Adicionar Nova Versão — ${docAlvoVersao?.nome || ""}`}
        primaryButtonText={salvando ? "Arquivando anterior & Salvando..." : "Salvar Nova Versão"}
        secondaryButtonText="Cancelar"
        primaryButtonDisabled={salvando}
        onRequestClose={() => setModalVersaoAberto(false)}
        onRequestSubmit={salvarNovaVersao}
        data-testid="modal-nova-versao"
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
            Ao salvar, a versão atual (v{docAlvoVersao?.versao}) será arquivada no histórico de auditoria e a nova versão (v{(docAlvoVersao?.versao || 1) + 1}) assumirá a vigência ativa do documento.
          </div>

          <Grid fullWidth style={{ padding: 0 }}>
            <Column lg={8} md={4} sm={4}>
              <TextInput
                id="versao-emissao"
                type="date"
                labelText="Nova Data de Emissão"
                value={versaoDataEmissao}
                onChange={(e) => setVersaoDataEmissao(e.target.value)}
              />
            </Column>
            <Column lg={8} md={4} sm={4}>
              <TextInput
                id="versao-vencimento"
                type="date"
                labelText="Nova Data de Vencimento"
                value={versaoDataVencimento}
                onChange={(e) => setVersaoDataVencimento(e.target.value)}
              />
            </Column>
            <Column lg={16} md={8} sm={4}>
              <div style={{ marginTop: "0.5rem" }}>
                <FileDropZone
                  id="versao-file-upload"
                  label="Novo Arquivo Atualizado"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                  selectedFile={versaoArquivoFile}
                  selectedFileName={versaoArquivoNome}
                  onFileSelect={(file) => {
                    setVersaoArquivoFile(file);
                    setVersaoArquivoNome(file.name);
                  }}
                  onFileClear={() => {
                    setVersaoArquivoFile(null);
                    setVersaoArquivoNome("");
                  }}
                  helperText="Arraste a nova versão do arquivo aqui ou clique para selecionar"
                  dataTestId="dropzone-versao-upload"
                />
              </div>
            </Column>
          </Grid>
        </Form>
      </Modal>
    </ModulePageShell>
  );
}

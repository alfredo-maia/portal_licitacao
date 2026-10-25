"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  Tag,
  Tile,
  DataTable,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableToolbar,
  TableBatchActions,
  TableBatchAction,
  TableSelectAll,
  TableSelectRow,
  TableToolbarContent,
  TableToolbarSearch,
  TableToolbarMenu,
  TableToolbarAction,
  Button,
  Dropdown,
  TextInput,
  Modal,
} from "@carbon/react";
import { CheckmarkOutline, CloseOutline, WarningAlt, Edit, TrashCan, Download } from "@carbon/icons-react";
import { ModulePageShell } from "@/components/shell/module-page-shell";

export default function OportunidadesPage() {
  const router = useRouter();

  const headers = [
    { key: "dataAbertura", header: "Data de Abertura" },
    { key: "orgaoUF", header: "Órgão e UF" },
    { key: "miniResumo", header: "Mini-resumo" },
    { key: "resumoObjeto", header: "Resumo do Objeto" },
    { key: "valorEstimado", header: "Valor Estimado" },
    { key: "parecerIA", header: "Parecer da IA" },
    { key: "acoes", header: "Ações Rápidas" },
  ];

  const rows = [
    {
      id: "1",
      dataAbertura: "25/10/2026",
      orgaoUF: "Prefeitura de SP - SP",
      miniResumo: "Aquisição de equipamentos de informática",
      resumoObjeto:
        "Aquisição de equipamentos de informática para diversas secretarias municipais, incluindo desktops, notebooks, impressoras e softwares.",
      valorEstimado: 1500000.00,
      parecerIA: "GO",
      acoes: "",
    },
    {
      id: "2",
      dataAbertura: "26/10/2026",
      orgaoUF: "Governo do Estado da Bahia - BA",
      miniResumo: "Serviços de consultoria em gestão de projetos",
      resumoObjeto:
        "Contratação de empresa especializada para prestação de serviços de consultoria e assessoria técnica em gestão e planejamento de projetos.",
      valorEstimado: 800000.00,
      parecerIA: "AVALIAR",
      acoes: "",
    },
    {
      id: "3",
      dataAbertura: "27/10/2026",
      orgaoUF: "Ministério da Saúde - DF",
      miniResumo: "Fornecimento de medicamentos",
      resumoObjeto:
        "Registro de preços para eventual aquisição de medicamentos para atendimento das necessidades da rede pública de saúde.",
      valorEstimado: 5000000.00,
      parecerIA: "NO-GO",
      acoes: "",
    },
  ];

  const [showManualModal, setShowManualModal] = React.useState(false);
  const [showImportModal, setShowImportModal] = React.useState(false);
  const [showRecusarModal, setShowRecusarModal] = React.useState(false);
  const [recusaMotivo, setRecusaMotivo] = React.useState("");
  const [selectedOpportunityId, setSelectedOpportunityId] = React.useState<string | null>(null);

  const handleRecusarClick = (id: string) => {
    setSelectedOpportunityId(id);
    setShowRecusarModal(true);
  };

  const handleConfirmRecusa = () => {
    console.log(`Recusar oportunidade ${selectedOpportunityId} com motivo: ${recusaMotivo}`);
    setShowRecusarModal(false);
    setRecusaMotivo("");
    setSelectedOpportunityId(null);
  };

  return (
    <ModulePageShell routePath="/oportunidades">
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
          <h2 style={{ margin: 0, fontSize: "1.125rem" }}>
            Central de Triagem e Deliberação (GO / No-GO)
          </h2>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Tag type="green" renderIcon={CheckmarkOutline}>
              GO - Recomendado
            </Tag>
            <Tag type="warm-gray" renderIcon={WarningAlt}>
              AVALIAR DIRETORIA
            </Tag>
            <Tag type="red" renderIcon={CloseOutline}>
              NO-GO
            </Tag>
          </div>
        </div>
        <p style={{ margin: 0, color: "var(--cds-text-secondary)" }}>
          Tabela de alta densidade ordenada por data de abertura do certame para
          decisão estratégica da Diretoria e Analistas Comerciais.
        </p>

        <div data-testid="oportunidades-filters" style={{ marginBottom: "1rem", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <Dropdown
            id="filter-tipo-sistema"
            titleText="Tipo de Sistema"
            label="Selecione um tipo"
            items={[
              { id: "pregao", text: "Pregão" },
              { id: "concorrencia", text: "Concorrência" },
            ]}
            itemToString={(item) => (item ? item.text : "")}
            style={{ minWidth: "200px" }}
          />
          <Dropdown
            id="filter-uf"
            titleText="UF"
            label="Selecione um estado"
            items={[
              { id: "SP", text: "São Paulo" },
              { id: "RJ", text: "Rio de Janeiro" },
            ]}
            itemToString={(item) => (item ? item.text : "")}
            style={{ minWidth: "150px" }}
          />
          <TextInput
            id="filter-faixa-valor"
            labelText="Faixa de Valor"
            placeholder="Ex: 1000-5000"
            style={{ minWidth: "150px" }}
          />
          <Dropdown
            id="filter-status"
            titleText="Status"
            label="Selecione um status"
            items={[
              { id: "PENDENTE", text: "Pendente" },
              { id: "RECUSADA", text: "Recusada" },
            ]}
            itemToString={(item) => (item ? item.text : "")}
            style={{ minWidth: "150px" }}
          />
          <Dropdown
            id="filter-parecer-ia"
            titleText="Parecer da IA"
            label="Selecione um parecer"
            items={[
              { id: "GO", text: "GO" },
              { id: "AVALIAR", text: "AVALIAR" },
              { id: "NO-GO", text: "NO-GO" },
            ]}
            itemToString={(item) => (item ? item.text : "")}
            style={{ minWidth: "150px" }}
          />
          <TextInput
            id="filter-busca"
            labelText="Busca"
            placeholder="Buscar por palavra-chave"
            style={{ minWidth: "250px" }}
          />
        </div>

        <DataTable
          rows={rows}
          headers={headers}
          data-testid="oportunidades-datatable"
          render={({
            rows,
            headers,
            getHeaderProps,
            getRowProps,
            getBatchActionProps,
            onInputChange,
            selectedRows,
            getSelectionProps,
          }) => (
            <TableContainer>
              <TableToolbar>
                <TableBatchActions {...getBatchActionProps()}>
                  <TableBatchAction
                    tabIndex={getBatchActionProps().shouldShowBatchActions ? 0 : -1}
                    onClick={() => {}}
                  >
                    Excluir
                  </TableBatchAction>
                  <TableBatchAction
                    tabIndex={getBatchActionProps().shouldShowBatchActions ? 0 : -1}
                    onClick={() => {}}
                  >
                    Marcar como lido
                  </TableBatchAction>
                </TableBatchActions>
                <TableToolbarContent>
                  <TableToolbarSearch
                    id="search-oportunidades"
                    persistent
                    onChange={onInputChange}
                  />
                  <TableToolbarMenu>
                    <TableToolbarAction onClick={() => alert("Download")}>
                      <Download size={16} />
                    </TableToolbarAction>
                    <TableToolbarAction onClick={() => alert("Editar")}>
                      <Edit size={16} />
                    </TableToolbarAction>
                    <TableToolbarAction onClick={() => alert("Deletar")}>
                      <TrashCan size={16} />
                    </TableToolbarAction>
                  </TableToolbarMenu>
                  <Button onClick={() => setShowManualModal(true)} kind="primary" data-testid="btn-open-manual-modal">
                    + Adicionar Licitação Manualmente
                  </Button>
                  <Button onClick={() => setShowImportModal(true)} kind="secondary" data-testid="btn-open-import-modal">
                    Importar Relatório (JSON)
                  </Button>
                </TableToolbarContent>
              </TableToolbar>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableSelectAll {...getSelectionProps()} />
                    {headers.map((header) => (
                      <TableHeader {...getHeaderProps({ header })}>
                        {header.header}
                      </TableHeader>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow
                      {...getRowProps({ row })}
                      data-testid={`oportunidade-row-${row.id}`}
                      onClick={() => router.push(`/oportunidades/${row.id}`)}
                    >
                      <TableSelectRow {...getSelectionProps({ row })} />
                      {row.cells.map((cell) => (
                        <TableCell key={cell.id}>
                          {cell.info.header === "valorEstimado" ? (
                            <span
                              style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                              data-testid="valor-estimado-cell"
                            >
                              {new Intl.NumberFormat("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                              }).format(cell.value)}
                            </span>
                          ) : cell.info.header === "parecerIA" ? (
                            <Tag
                              type={
                                cell.value === "GO"
                                  ? "green"
                                  : cell.value === "AVALIAR"
                                  ? "warm-gray"
                                  : "red"
                              }
                              renderIcon={
                                cell.value === "GO"
                                  ? CheckmarkOutline
                                  : cell.value === "AVALIAR"
                                  ? WarningAlt
                                  : CloseOutline
                              }
                            >
                              {cell.value}
                            </Tag>
                          ) : cell.info.header === "acoes" ? (
                            <>
                              <Button
                                size="sm"
                                kind="ghost"
                                data-testid={`btn-aceitar-${row.id}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  alert(`Aceitar ${row.id}`);
                                }}
                              >
                                Aceitar
                              </Button>
                              <Button
                                size="sm"
                                kind="ghost"
                                data-testid={`btn-recusar-${row.id}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRecusarClick(row.id);
                                }}
                              >
                                Recusar
                              </Button>
                            </>
                          ) : (
                            cell.value
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        />
      </Tile>

      {/* Modal Adicionar Licitação Manualmente */}
      <Modal
        open={showManualModal}
        onRequestClose={() => setShowManualModal(false)}
        modalHeading="+ Adicionar Licitação Manualmente"
        primaryButtonText="Adicionar"
        secondaryButtonText="Cancelar"
        data-testid="modal-adicionar-manual"
      >
        <p style={{ marginBottom: "1rem" }}>
          Preencha os campos abaixo para adicionar uma nova licitação manualmente.
        </p>
        <TextInput id="manual-data-abertura" labelText="Data de Abertura" placeholder="DD/MM/AAAA" style={{ marginBottom: "1rem" }} />
        <TextInput id="manual-orgao-uf" labelText="Órgão e UF" placeholder="Ex: Prefeitura de SP - SP" style={{ marginBottom: "1rem" }} />
        <TextInput id="manual-mini-resumo" labelText="Mini-resumo" placeholder="Ex: Aquisição de equipamentos" style={{ marginBottom: "1rem" }} />
        <TextInput id="manual-resumo-objeto" labelText="Resumo do Objeto" placeholder="Ex: Aquisição de equipamentos de informática para secretarias..." style={{ marginBottom: "1rem" }} />
        <TextInput id="manual-valor-estimado" labelText="Valor Estimado" placeholder="Ex: 1500000.00" style={{ marginBottom: "1rem" }} />
      </Modal>

      {/* Modal Importar Relatório (JSON) */}
      <Modal
        open={showImportModal}
        onRequestClose={() => setShowImportModal(false)}
        modalHeading="Importar Relatório (JSON)"
        primaryButtonText="Importar"
        secondaryButtonText="Cancelar"
        data-testid="modal-importar-json"
        // TODO: Conectar com POST /api/ingestao
      >
        <p style={{ marginBottom: "1rem" }}>
          Cole o conteúdo JSON do relatório de licitações para importação.
        </p>
        <TextInput
          id="import-json-content"
          labelText="Conteúdo JSON"
          placeholder="[{ \"id\": \"...\", \"dataAbertura\": \"...\" }]"
          multiline
          rows={10}
          style={{ marginBottom: "1rem" }}
        />
      </Modal>

      {/* Modal Recusar Licitação */}
      <Modal
        open={showRecusarModal}
        onRequestClose={() => setShowRecusarModal(false)}
        modalHeading={`Recusar Oportunidade ${selectedOpportunityId}`}
        primaryButtonText="Confirmar Recusa"
        secondaryButtonText="Cancelar"
        data-testid="modal-recusar-licitacao"
        onRequestSubmit={handleConfirmRecusa}
        danger
      >
        <p style={{ marginBottom: "1rem" }}>
          Por favor, forneça um motivo para a recusa da oportunidade.
        </p>
        <TextInput
          id="input-motivo-recusa"
          labelText="Motivo da Recusa"
          placeholder="Ex: Não se encaixa no perfil da empresa"
          value={recusaMotivo}
          onChange={(e) => setRecusaMotivo(e.target.value)}
          style={{ marginBottom: "1rem" }}
          data-testid="input-motivo-recusa"
        />
        <Button
          onClick={handleConfirmRecusa}
          kind="danger"
          data-testid="btn-confirmar-recusa"
          disabled={!recusaMotivo.trim()}
        >
          Confirmar Recusa
        </Button>
      </Modal>
    </ModulePageShell>
  );
}
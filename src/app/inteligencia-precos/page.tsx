"use client";

import React, { useState } from "react";
import {
  Button,
  Column,
  DataTable,
  Grid,
  InlineNotification,
  Search,
  Select,
  SelectItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  TextInput,
  Tile,
} from "@carbon/react";
import {
  Analytics,
  Download,
  Filter,
  Search as SearchIcon,
  Tag as TagIcon,
  Copy,
} from "@carbon/icons-react";
import { ModulePageShell } from "@/components/shell/module-page-shell";

interface PrecoHomologadoItem {
  id: string;
  catmat: string;
  itemDescricao: string;
  orgaoNome: string;
  uf: string;
  modalidade: string;
  numeroProcesso: string;
  dataHomologacao: string;
  empresaVencedora: string;
  cnpjVencedor: string;
  quantidade: number;
  valorEstimadoUnitario: number;
  valorHomologadoUnitario: number;
  descontoPercentual: number;
}

const MOCK_HISTORICO_PRECOS: PrecoHomologadoItem[] = [
  {
    id: "hom-1",
    catmat: "452109",
    itemDescricao: "Notebook Corporativo i7 16GB SSD 512GB Tela 15.6 FHD",
    orgaoNome: "Tribunal Regional Eleitoral de Goiás",
    uf: "GO",
    modalidade: "Pregão Eletrônico",
    numeroProcesso: "PE 088/2026",
    dataHomologacao: "28/10/2026",
    empresaVencedora: "DELL COMPUTADORES DO BRASIL LTDA",
    cnpjVencedor: "72.381.189/0001-10",
    quantidade: 50,
    valorEstimadoUnitario: 5200.0,
    valorHomologadoUnitario: 4150.0,
    descontoPercentual: 20.19,
  },
  {
    id: "hom-2",
    catmat: "452109",
    itemDescricao: "Notebook Corporativo i7 16GB SSD 512GB Windows 11 Pro",
    orgaoNome: "Secretaria de Educação do Estado de São Paulo",
    uf: "SP",
    modalidade: "Pregão Eletrônico",
    numeroProcesso: "PE 124/2026",
    dataHomologacao: "25/10/2026",
    empresaVencedora: "POSITIVO TECNOLOGIA S.A.",
    cnpjVencedor: "81.243.735/0001-48",
    quantidade: 200,
    valorEstimadoUnitario: 4950.0,
    valorHomologadoUnitario: 3890.0,
    descontoPercentual: 21.41,
  },
  {
    id: "hom-3",
    catmat: "452109",
    itemDescricao: "Computador Portátil / Notebook Core i7 16GB 512GB SSD",
    orgaoNome: "Comando da Aeronáutica - GAP-DF",
    uf: "DF",
    modalidade: "Pregão Eletrônico",
    numeroProcesso: "PE 031/2026",
    dataHomologacao: "19/10/2026",
    empresaVencedora: "LENOVO TECNOLOGIA BRASIL LTDA",
    cnpjVencedor: "07.275.920/0001-61",
    quantidade: 80,
    valorEstimadoUnitario: 5100.0,
    valorHomologadoUnitario: 4050.0,
    descontoPercentual: 20.59,
  },
  {
    id: "hom-4",
    catmat: "452109",
    itemDescricao: "Notebook i7 16GB 512GB SSD - Garantia Onsite 36 Meses",
    orgaoNome: "Prefeitura Municipal de Belo Horizonte",
    uf: "MG",
    modalidade: "Pregão Eletrônico",
    numeroProcesso: "PE 077/2026",
    dataHomologacao: "12/10/2026",
    empresaVencedora: "MULTILASER INDUSTRIAL S.A.",
    cnpjVencedor: "59.717.553/0001-02",
    quantidade: 120,
    valorEstimadoUnitario: 4800.0,
    valorHomologadoUnitario: 3750.0,
    descontoPercentual: 21.88,
  },
];

function formatBRL(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function InteligenciaPrecosPage() {
  const [termoBusca, setTermoBusca] = useState("Notebook i7");
  const [ufFiltro, setUfFiltro] = useState("TODOS");
  const [modalidadeFiltro, setModalidadeFiltro] = useState("TODOS");
  const [itens, setItens] = useState<PrecoHomologadoItem[]>(MOCK_HISTORICO_PRECOS);
  const [carregando, setCarregando] = useState(false);
  const [feedback, setFeedback] = useState<{
    kind: "success" | "info" | "warning";
    text: string;
  } | null>(null);

  const handleBuscar = () => {
    setCarregando(true);
    setTimeout(() => {
      setCarregando(false);
      setFeedback({
        kind: "success",
        text: `Consulta concluída para "${termoBusca}". 4 homologações oficiais encontradas no banco de preços públicos.`,
      });
    }, 400);
  };

  // Cálculo de agregados
  const valoresHomologados = itens.map((i) => i.valorHomologadoUnitario);
  const precoMedio =
    valoresHomologados.reduce((acc, curr) => acc + curr, 0) /
    (valoresHomologados.length || 1);
  const menorPreco = Math.min(...valoresHomologados);
  const maiorPreco = Math.max(...valoresHomologados);
  const descontoMedio =
    itens.reduce((acc, curr) => acc + curr.descontoPercentual, 0) /
    (itens.length || 1);

  return (
    <ModulePageShell
      title="Inteligência de Preços Homologados"
      subtitle="Buscador analítico de preços praticados e homologados pela Administração Pública por item, descrição ou código CATMAT/CATSER."
      badge="Arsenal de Disputa"
      routePath="/inteligencia-precos"
    >
      {feedback && (
        <InlineNotification
          kind={feedback.kind}
          title={feedback.kind === "success" ? "Pesquisa Concluída:" : "Aviso:"}
          subtitle={feedback.text}
          onClose={() => setFeedback(null)}
          style={{ marginBottom: "1.5rem" }}
        />
      )}

      {/* Caixa de Pesquisa Parametrizada */}
      <Tile style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
        <h4 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "1rem" }}>
          🔍 Consulta de Preços de Referência & Homologações
        </h4>
        <Grid style={{ padding: 0 }}>
          <Column lg={6} md={4} sm={4} style={{ marginBottom: "1rem" }}>
            <TextInput
              id="input-termo-catmat"
              labelText="Descrição do Item ou Código CATMAT/CATSER"
              placeholder="Ex: Notebook i7, 452109, Resma Papel A4, Cadeira Ergonômica..."
              value={termoBusca}
              onChange={(e) => setTermoBusca(e.target.value)}
              helperText="Busca integrada aos dados oficiais de compras públicas do PNCP e Compras.gov.br"
            />
          </Column>

          <Column lg={2} md={2} sm={4} style={{ marginBottom: "1rem" }}>
            <Select
              id="select-uf-filtro"
              labelText="Região / UF"
              value={ufFiltro}
              onChange={(e) => setUfFiltro(e.target.value)}
            >
              <SelectItem value="TODOS" text="Todo o Brasil" />
              <SelectItem value="GO" text="Goiás (GO)" />
              <SelectItem value="SP" text="São Paulo (SP)" />
              <SelectItem value="MG" text="Minas Gerais (MG)" />
              <SelectItem value="DF" text="Distrito Federal (DF)" />
              <SelectItem value="RJ" text="Rio de Janeiro (RJ)" />
            </Select>
          </Column>

          <Column lg={2} md={2} sm={4} style={{ marginBottom: "1rem" }}>
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

          <Column lg={2} md={2} sm={4} style={{ display: "flex", alignItems: "flex-end", marginBottom: "1rem" }}>
            <Button
              kind="primary"
              size="md"
              renderIcon={SearchIcon}
              onClick={handleBuscar}
              disabled={carregando}
              style={{ width: "100%" }}
            >
              {carregando ? "Pesquisando..." : "Pesquisar"}
            </Button>
          </Column>
        </Grid>
      </Tile>

      {/* Cards de Métricas e Análise de Dispersão */}
      <Grid style={{ padding: 0, marginBottom: "1.5rem" }}>
        <Column lg={3} md={2} sm={4}>
          <Tile style={{ padding: "1.25rem", borderLeft: "4px solid var(--cds-interactive, #0f62fe)" }}>
            <div style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)", marginBottom: "0.25rem" }}>
              Preço Médio Homologado
            </div>
            <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--cds-text-primary)" }}>
              {formatBRL(precoMedio)}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginTop: "0.25rem" }}>
              Média ponderada nos últimos 12 meses
            </div>
          </Tile>
        </Column>

        <Column lg={3} md={2} sm={4}>
          <Tile style={{ padding: "1.25rem", borderLeft: "4px solid var(--cds-support-success, #24a148)" }}>
            <div style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)", marginBottom: "0.25rem" }}>
              Menor Preço Arrematado
            </div>
            <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--cds-support-success, #24a148)" }}>
              {formatBRL(menorPreco)}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginTop: "0.25rem" }}>
              Lance mais agressivo homologado
            </div>
          </Tile>
        </Column>

        <Column lg={3} md={2} sm={4}>
          <Tile style={{ padding: "1.25rem", borderLeft: "4px solid var(--cds-support-warning, #f1c21b)" }}>
            <div style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)", marginBottom: "0.25rem" }}>
              Maior Preço Homologado
            </div>
            <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--cds-text-primary)" }}>
              {formatBRL(maiorPreco)}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginTop: "0.25rem" }}>
              Teto de aceitabilidade registrado
            </div>
          </Tile>
        </Column>

        <Column lg={3} md={2} sm={4}>
          <Tile style={{ padding: "1.25rem", borderLeft: "4px solid var(--cds-support-info, #0043ce)" }}>
            <div style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)", marginBottom: "0.25rem" }}>
              Desconto Médio Obtido
            </div>
            <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--cds-support-info, #0043ce)" }}>
              {descontoMedio.toFixed(1)}%
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginTop: "0.25rem" }}>
              Abaixo do valor estimado do edital
            </div>
          </Tile>
        </Column>
      </Grid>

      {/* Banner de Recomendação de Disputa */}
      <Tile style={{ padding: "1.25rem", marginBottom: "1.5rem", backgroundColor: "var(--cds-layer-accent, #f4f4f4)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: "0.95rem", marginBottom: "0.25rem" }}>
              💡 Faixa de Lance Competitivo Sugerida para "{termoBusca}":
            </div>
            <div style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)" }}>
              Com base nos certames recentes, lances entre{" "}
              <strong>{formatBRL(menorPreco * 0.98)}</strong> e <strong>{formatBRL(precoMedio)}</strong> têm{" "}
              <strong>78% de chance de vitória</strong> com margem saudável.
            </div>
          </div>
          <Tag type="teal" size="md">
            Alta Competitividade
          </Tag>
        </div>
      </Tile>

      {/* Tabela de Homologações Oficiais */}
      <Tile style={{ padding: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <div>
            <h4 style={{ fontSize: "1.05rem", fontWeight: 600 }}>
              📋 Histórico de Homologações Públicas ({itens.length})
            </h4>
            <p style={{ fontSize: "0.825rem", color: "var(--cds-text-secondary)" }}>
              Registros oficiais extraídos de atas e termos de adjudicação homologados
            </p>
          </div>
          <Button
            kind="tertiary"
            size="sm"
            renderIcon={Download}
            onClick={() => {
              setFeedback({
                kind: "info",
                text: "Exportação em CSV iniciada com os registros de preços homologados.",
              });
            }}
          >
            Exportar CSV
          </Button>
        </div>

        <div style={{ overflowX: "auto" }}>
          <Table size="lg">
            <TableHead>
              <TableRow>
                <TableHeader>Órgão / UF</TableHeader>
                <TableHeader>Processo</TableHeader>
                <TableHeader>Item & Especificação</TableHeader>
                <TableHeader>Empresa Vencedora</TableHeader>
                <TableHeader>Qtd</TableHeader>
                <TableHeader>Valor Estimado</TableHeader>
                <TableHeader>Valor Homologado</TableHeader>
                <TableHeader>Desconto</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {itens.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <strong>{row.orgaoNome}</strong>
                    <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                      UF: {row.uf} • {row.modalidade}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>{row.numeroProcesso}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                      {row.dataHomologacao}
                    </div>
                  </TableCell>
                  <TableCell style={{ maxWidth: "280px" }}>
                    <div style={{ fontSize: "0.85rem" }}>{row.itemDescricao}</div>
                    <Tag type="cool-gray" size="sm" style={{ marginTop: "0.25rem" }}>
                      CATMAT: {row.catmat}
                    </Tag>
                  </TableCell>
                  <TableCell>
                    <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                      {row.empresaVencedora}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                      CNPJ: {row.cnpjVencedor}
                    </div>
                  </TableCell>
                  <TableCell>{row.quantidade} un</TableCell>
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
              ))}
            </TableBody>
          </Table>
        </div>
      </Tile>
    </ModulePageShell>
  );
}


"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Tag, Tile, Button } from "@carbon/react";
import { ArrowLeft } from "@carbon/icons-react";
import { ModulePageShell } from "@/components/shell/module-page-shell";

interface OportunidadeDetalhe {
  id: string;
  numeroEdital: string;
  orgaoNome: string;
  orgaoCnpj: string;
  uf: string;
  valorEstimado: number;
  dataAbertura: string;
  miniResumo: string;
  resumo: string;
  tipoSistemaCodigo: string;
  parecerIA: "GO" | "AVALIAR" | "NO_GO";
  status: string;
}

interface OportunidadeDetalheProps {
  params: {
    id: string;
  };
}

export default function OportunidadesDetalhePage({ params }: OportunidadeDetalheProps) {
  const router = useRouter();
  const [oportunidade, setOportunidade] = React.useState<OportunidadeDetalhe | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const { id } = params;

  React.useEffect(() => {
    const fetchOportunidade = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/oportunidades/${id}`);
        if (!response.ok) {
          throw new Error("Oportunidade não encontrada");
        }
        const data = await response.json();
        setOportunidade(data.oportunidade);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Um erro desconhecido ocorreu.");
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchOportunidade();
    }
  }, [id]);

  if (loading) {
    return (
      <ModulePageShell routePath={`/oportunidades/${id}`}>
        <Tile style={{ padding: "1.5rem" }}>
          <p>Carregando detalhes da oportunidade...</p>
        </Tile>
      </ModulePageShell>
    );
  }

  if (error) {
    return (
      <ModulePageShell routePath={`/oportunidades/${id}`}>
        <Tile style={{ padding: "1.5rem" }}>
          <p style={{ color: "red" }}>Erro: {error}</p>
          <Button kind="ghost" onClick={() => router.push("/oportunidades")}>
            Voltar para Oportunidades
          </Button>
        </Tile>
      </ModulePageShell>
    );
  }

  if (!oportunidade) {
    return (
      <ModulePageShell routePath={`/oportunidades/${id}`}>
        <Tile style={{ padding: "1.5rem" }}>
          <p>Nenhum detalhe de oportunidade encontrado.</p>
          <Button kind="ghost" onClick={() => router.push("/oportunidades")}>
            Voltar para Oportunidades
          </Button>
        </Tile>
      </ModulePageShell>
    );
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getParecerIAType = (parecer: string) => {
    if (parecer === "GO") return "green";
    if (parecer === "AVALIAR") return "warm-gray";
    if (parecer === "NO_GO") return "red";
    return "gray"; // Default
  };

  return (
    <ModulePageShell routePath={`/oportunidades/${id}`}>
      <Tile style={{ padding: "1.5rem" }} data-testid="oportunidade-detalhe-page">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.5rem" }}>Detalhes da Oportunidade</h2>
          <Button kind="ghost" onClick={() => router.push("/oportunidades")}>
            <ArrowLeft size={16} style={{ marginRight: "0.5rem" }} />
            Voltar
          </Button>
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <p><strong>Número do Edital:</strong> {oportunidade.numeroEdital}</p>
          <p><strong>Órgão:</strong> {oportunidade.orgaoNome}</p>
          <p><strong>UF:</strong> {oportunidade.uf}</p>
          <p>
            <strong>Valor Estimado:</strong>{" "}
            <span style={{ fontFamily: "var(--cds-code-01-font-family, 'IBM Plex Mono', monospace)" }}>
              {formatCurrency(oportunidade.valorEstimado)}
            </span>
          </p>
          <p>
            <strong>Parecer da IA:</strong>{" "}
            <Tag type={getParecerIAType(oportunidade.parecerIA)}>
              {oportunidade.parecerIA}
            </Tag>
          </p>
          <p><strong>Status:</strong> {oportunidade.status}</p>
          <p><strong>Tipo de Sistema:</strong> {oportunidade.tipoSistemaCodigo}</p>
          <p><strong>Resumo Completo:</strong> {oportunidade.resumo}</p>
          <p><strong>Data de Abertura:</strong> <span style={{ fontFamily: "var(--cds-code-01-font-family, 'IBM Plex Mono', monospace)" }}>{oportunidade.dataAbertura}</span></p>
        </div>
      </Tile>
    </ModulePageShell>
  );
}

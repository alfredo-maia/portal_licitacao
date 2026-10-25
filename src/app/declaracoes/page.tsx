"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Button,
  Column,
  FormGroup,
  Grid,
  InlineLoading,
  InlineNotification,
  Select,
  SelectItem,
  Tag,
  TextInput,
  TextArea,
  Tile,
} from "@carbon/react";
import {
  Copy,
  DocumentDownload,
  DocumentPdf,
  Information,
  Printer,
  Reset,
  Template,
} from "@carbon/icons-react";
import { ModulePageShell } from "@/components/shell/module-page-shell";
import { maskCnpj, maskCpf } from "@/lib/masks";
import {
  DECLARACAO_METADATA,
  DECLARACAO_TIPOS,
  type DeclaracaoGeradaResponse,
  type DeclaracaoTipo,
} from "@/server/schemas/declaracao.schema";

interface TemplateItem {
  codigo: DeclaracaoTipo;
  titulo: string;
  fundamentoLegal: string;
  descricao: string;
}

export default function DeclaracoesPage() {
  const [tipoSelecionado, setTipoSelecionado] = useState<DeclaracaoTipo>("HABILITACAO_PLENA");
  const [templates, setTemplates] = useState<TemplateItem[]>(
    DECLARACAO_TIPOS.map((t) => DECLARACAO_METADATA[t]),
  );

  // Form State
  const [numeroEdital, setNumeroEdital] = useState("PE 045/2026-SEDUC");
  const [orgaoNome, setOrgaoNome] = useState("Secretaria de Estado da Educação - Governo de Goiás");
  const [objetoLicitacao, setObjetoLicitacao] = useState("Aquisição de estações de trabalho de alto desempenho e servidores para laboratórios de informática");
  const [empresaRazaoSocial, setEmpresaRazaoSocial] = useState("APONTA TECNOLOGIA E SERVICOS LTDA");
  const [empresaCnpj, setEmpresaCnpj] = useState("12.345.678/0001-90");
  const [empresaEndereco, setEmpresaEndereco] = useState("Av. República do Líbano, 1200, Setor Oeste, Goiânia - GO, CEP 74115-030");
  const [representanteNome, setRepresentanteNome] = useState("Vítor Henrique de Souza");
  const [representanteCpf, setRepresentanteCpf] = useState("123.456.789-00");
  const [representanteRg, setRepresentanteRg] = useState("5432109-SSP/GO");
  const [representanteCargo, setRepresentanteCargo] = useState("Sócio-Administrador");
  const [cidade, setCidade] = useState("Goiânia");
  const [uf, setUf] = useState("GO");
  const [dataDeclaracao, setDataDeclaracao] = useState("2026-10-25");

  // Oportunidades ativas para auto-preenchimento
  const [oportunidades, setOportunidades] = useState<any[]>([]);

  // Generated document state
  const [documentoGerado, setDocumentoGerado] = useState<DeclaracaoGeradaResponse | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [notificacao, setNotificacao] = useState<{ tipo: "success" | "error"; texto: string } | null>(null);

  // Carrega templates e oportunidades ativas
  useEffect(() => {
    fetch("/api/declaracoes/templates")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.templates)) {
          setTemplates(data.templates);
        }
      })
      .catch(() => {});

    fetch("/api/oportunidades?pageSize=10")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.oportunidades)) {
          setOportunidades(data.oportunidades);
        }
      })
      .catch(() => {});

    // Carrega dados societários oficiais de Configurações > Empresa (Item 11.1)
    fetch("/api/configuracoes/empresa")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && data.empresa) {
          const emp = data.empresa;
          if (emp.razaoSocial) setEmpresaRazaoSocial(emp.razaoSocial);
          if (emp.cnpj) setEmpresaCnpj(maskCnpj(emp.cnpj));
          if (emp.endereco) {
            const endCompleto = [emp.endereco, emp.cidade, emp.uf, emp.cep ? `CEP ${emp.cep}` : null]
              .filter(Boolean)
              .join(", ");
            setEmpresaEndereco(endCompleto);
          }
          if (emp.representanteNome) setRepresentanteNome(emp.representanteNome);
          if (emp.representanteCpf) setRepresentanteCpf(maskCpf(emp.representanteCpf));
          if (emp.representanteRg) setRepresentanteRg(emp.representanteRg);
          if (emp.representanteCargo) setRepresentanteCargo(emp.representanteCargo);
          if (emp.cidade) setCidade(emp.cidade);
          if (emp.uf) setUf(emp.uf);
        }
      })
      .catch(() => {});
  }, []);

  const metaAtual = DECLARACAO_METADATA[tipoSelecionado] || templates.find((t) => t.codigo === tipoSelecionado);

  const handleGerar = useCallback(async () => {
    setCarregando(true);
    setNotificacao(null);
    try {
      const res = await fetch("/api/declaracoes/gerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: tipoSelecionado,
          numeroEdital,
          orgaoNome,
          objetoLicitacao,
          empresaRazaoSocial,
          empresaCnpj,
          empresaEndereco,
          representanteNome,
          representanteCpf,
          representanteRg,
          representanteCargo,
          cidade,
          uf,
          dataDeclaracao,
        }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        setDocumentoGerado(data);
      } else {
        setNotificacao({
          tipo: "error",
          texto: data.error || "Erro ao gerar declaração",
        });
      }
    } catch {
      setNotificacao({
        tipo: "error",
        texto: "Erro de comunicação com o servidor ao gerar declaração.",
      });
    } finally {
      setCarregando(false);
    }
  }, [
    tipoSelecionado,
    numeroEdital,
    orgaoNome,
    objetoLicitacao,
    empresaRazaoSocial,
    empresaCnpj,
    empresaEndereco,
    representanteNome,
    representanteCpf,
    representanteRg,
    representanteCargo,
    cidade,
    uf,
    dataDeclaracao,
  ]);

  // Gera a primeira versão automaticamente ao carregar ou mudar tipo
  useEffect(() => {
    handleGerar();
  }, [tipoSelecionado]);

  const handleVincularCertame = (licitacaoId: string) => {
    const selecionada = oportunidades.find((o) => o.id === licitacaoId);
    if (selecionada) {
      setNumeroEdital(selecionada.numeroEdital);
      setOrgaoNome(selecionada.orgaoNome);
      setObjetoLicitacao(selecionada.resumo || selecionada.miniResumo || "");
      setNotificacao({
        tipo: "success",
        texto: `Dados preenchidos automaticamente a partir do certame ${selecionada.numeroEdital}!`,
      });
    }
  };

  const handleCopiarTexto = () => {
    if (documentoGerado?.conteudoTexto) {
      navigator.clipboard.writeText(documentoGerado.conteudoTexto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 3000);
    }
  };

  const handleImprimir = () => {
    window.print();
  };

  const handleBaixarTxt = () => {
    if (!documentoGerado?.conteudoTexto) return;
    const blob = new Blob([documentoGerado.conteudoTexto], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `declaracao_${tipoSelecionado.toLowerCase()}_${numeroEdital.replace(/[^a-zA-Z0-9]/g, "_")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ModulePageShell routePath="/declaracoes" subtitle="Gerador de modelos oficiais.">
      <style>{`
        @media print {
          /* Oculta toda a interface do portal durante a impressão */
          header, aside, nav, .cds--header, .cds--side-nav, .pncp-shell-header, .pncp-split-form, .pncp-no-print {
            display: none !important;
          }
          body, html, main, .cds--content {
            background: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
          }
          #a4-folha-oficial {
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            padding: 2cm !important;
          }
        }

        .a4-container {
          background: #ffffff;
          color: #161616;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
          border: 1px solid #c6c6c6;
          border-radius: 2px;
          min-height: 29.7cm;
          box-sizing: border-box;
          transition: transform 0.2s ease;
        }

        .pncp-meta-callout {
          background: var(--cds-layer-02);
          border-left: 4px solid var(--cds-interactive);
          padding: 1rem;
          margin-bottom: 1.5rem;
        }
      `}</style>

      {/* Header Bar */}
      <div className="pncp-no-print" style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.25rem" }}>
              <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 600 }}>
                Gerador dos 8 Modelos Oficiais de Declaração
              </h1>
              <Tag type="purple" size="md" className="pncp-mono">
                Anexo 5 • Lei nº 14.133/2021
              </Tag>
            </div>
            <p style={{ margin: 0, color: "var(--cds-text-secondary)", fontSize: "0.875rem" }}>
              Split-view dinâmico: preencha as variáveis à esquerda com vínculo aos certames e visualize a folha A4 em tempo real à direita para pronta impressão e assinatura digital.
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Button
              kind="secondary"
              size="md"
              renderIcon={Printer}
              onClick={handleImprimir}
              id="btn-imprimir-a4"
            >
              Imprimir / PDF A4
            </Button>
            <Button
              kind="tertiary"
              size="md"
              renderIcon={Copy}
              onClick={handleCopiarTexto}
              id="btn-copiar-declaracao"
            >
              {copiado ? "Texto Copiado!" : "Copiar Texto"}
            </Button>
            <Button
              kind="ghost"
              size="md"
              renderIcon={DocumentDownload}
              onClick={handleBaixarTxt}
              id="btn-baixar-txt"
            >
              Exportar .TXT
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

      {/* Split View: Formulário à esquerda / Folha A4 à direita */}
      <Grid fullWidth style={{ padding: 0 }}>
        {/* Coluna Esquerda: Formulário de Preenchimento */}
        <Column lg={7} md={8} sm={4} className="pncp-split-form pncp-no-print" style={{ marginBottom: "2rem" }}>
          <Tile style={{ padding: "1.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
              <Template size={20} />
              <h2 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600 }}>
                1. Seleção do Modelo & Variáveis do Certame
              </h2>
            </div>

            <FormGroup legendText="">
              <Select
                id="select-tipo-declaracao"
                labelText="Modelo Oficial de Declaração (Anexo 5 / Lei 14.133)"
                value={tipoSelecionado}
                onChange={(e) => setTipoSelecionado(e.target.value as DeclaracaoTipo)}
                style={{ marginBottom: "1rem" }}
              >
                {templates.map((tpl) => (
                  <SelectItem key={tpl.codigo} value={tpl.codigo} text={`${tpl.titulo}`} />
                ))}
              </Select>
            </FormGroup>

            {metaAtual && (
              <div className="pncp-meta-callout">
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                  <Information size={16} />
                  <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>Fundamentação Legal:</span>
                  <Tag type="blue" size="sm">{metaAtual.fundamentoLegal}</Tag>
                </div>
                <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--cds-text-secondary)" }}>
                  {metaAtual.descricao}
                </p>
              </div>
            )}

            {oportunidades.length > 0 && (
              <FormGroup legendText="" style={{ marginBottom: "1.5rem" }}>
                <Select
                  id="select-vincular-certame"
                  labelText="Auto-preenchimento por Licitação do Pipeline"
                  defaultValue=""
                  onChange={(e) => e.target.value && handleVincularCertame(e.target.value)}
                >
                  <SelectItem value="" text="Selecione um certame para auto-preencher dados..." />
                  {oportunidades.map((op) => (
                    <SelectItem
                      key={op.id}
                      value={op.id}
                      text={`${op.numeroEdital} — ${op.orgaoNome.substring(0, 45)}...`}
                    />
                  ))}
                </Select>
              </FormGroup>
            )}

            <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem", borderBottom: "1px solid var(--cds-border-subtle)", paddingBottom: "0.5rem" }}>
              2. Dados do Processo Licitatório
            </h3>

            <Grid style={{ padding: 0, marginBottom: "1rem" }}>
              <Column lg={8} md={4} sm={4}>
                <TextInput
                  id="input-numero-edital"
                  labelText="Número do Edital / Pregão"
                  value={numeroEdital}
                  onChange={(e) => setNumeroEdital(e.target.value)}
                  placeholder="Ex: PE 042/2026"
                />
              </Column>
              <Column lg={8} md={4} sm={4}>
                <TextInput
                  id="input-orgao-nome"
                  labelText="Órgão Licitante Convocatório"
                  value={orgaoNome}
                  onChange={(e) => setOrgaoNome(e.target.value)}
                  placeholder="Ex: Secretaria de Estado da Saúde"
                />
              </Column>
              <Column lg={16} md={8} sm={4} style={{ marginTop: "0.75rem" }}>
                <TextArea
                  id="input-objeto-licitacao"
                  labelText="Objeto Resumido do Certame"
                  value={objetoLicitacao}
                  onChange={(e) => setObjetoLicitacao(e.target.value)}
                  rows={2}
                  placeholder="Descrição sucinta do objeto do edital"
                />
              </Column>
            </Grid>

            <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem", borderBottom: "1px solid var(--cds-border-subtle)", paddingBottom: "0.5rem" }}>
              3. Dados da Empresa Licitante
            </h3>

            <Grid style={{ padding: 0, marginBottom: "1rem" }}>
              <Column lg={10} md={5} sm={4}>
                <TextInput
                  id="input-empresa-razao"
                  labelText="Razão Social da Empresa"
                  value={empresaRazaoSocial}
                  onChange={(e) => setEmpresaRazaoSocial(e.target.value)}
                />
              </Column>
              <Column lg={6} md={3} sm={4}>
                <TextInput
                  id="input-empresa-cnpj"
                  labelText="CNPJ"
                  value={empresaCnpj}
                  onChange={(e) => setEmpresaCnpj(maskCnpj(e.target.value))}
                />
              </Column>
              <Column lg={16} md={8} sm={4} style={{ marginTop: "0.75rem" }}>
                <TextInput
                  id="input-empresa-endereco"
                  labelText="Endereço Completo da Sede"
                  value={empresaEndereco}
                  onChange={(e) => setEmpresaEndereco(e.target.value)}
                />
              </Column>
            </Grid>

            <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem", borderBottom: "1px solid var(--cds-border-subtle)", paddingBottom: "0.5rem" }}>
              4. Declarante / Representante Legal
            </h3>

            <Grid style={{ padding: 0, marginBottom: "1rem" }}>
              <Column lg={8} md={4} sm={4}>
                <TextInput
                  id="input-representante-nome"
                  labelText="Nome Completo do Declarante"
                  value={representanteNome}
                  onChange={(e) => setRepresentanteNome(e.target.value)}
                />
              </Column>
              <Column lg={8} md={4} sm={4}>
                <TextInput
                  id="input-representante-cargo"
                  labelText="Cargo / Função"
                  value={representanteCargo}
                  onChange={(e) => setRepresentanteCargo(e.target.value)}
                />
              </Column>
              <Column lg={8} md={4} sm={4} style={{ marginTop: "0.75rem" }}>
                <TextInput
                  id="input-representante-cpf"
                  labelText="CPF"
                  value={representanteCpf}
                  onChange={(e) => setRepresentanteCpf(maskCpf(e.target.value))}
                />
              </Column>
              <Column lg={8} md={4} sm={4} style={{ marginTop: "0.75rem" }}>
                <TextInput
                  id="input-representante-rg"
                  labelText="Documento de Identidade (RG)"
                  value={representanteRg}
                  onChange={(e) => setRepresentanteRg(e.target.value)}
                />
              </Column>
            </Grid>

            <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem", borderBottom: "1px solid var(--cds-border-subtle)", paddingBottom: "0.5rem" }}>
              5. Local e Data da Emissão
            </h3>

            <Grid style={{ padding: 0, marginBottom: "1.5rem" }}>
              <Column lg={6} md={3} sm={4}>
                <TextInput
                  id="input-cidade"
                  labelText="Cidade"
                  value={cidade}
                  onChange={(e) => setCidade(e.target.value)}
                />
              </Column>
              <Column lg={4} md={2} sm={4}>
                <TextInput
                  id="input-uf"
                  labelText="UF"
                  value={uf}
                  onChange={(e) => setUf(e.target.value)}
                />
              </Column>
              <Column lg={6} md={3} sm={4}>
                <TextInput
                  id="input-data"
                  type="date"
                  labelText="Data da Emissão"
                  value={dataDeclaracao}
                  onChange={(e) => setDataDeclaracao(e.target.value)}
                />
              </Column>
            </Grid>

            <div style={{ display: "flex", gap: "0.75rem" }}>
              <Button
                kind="primary"
                onClick={handleGerar}
                disabled={carregando}
                id="btn-atualizar-folha-a4"
              >
                {carregando ? <InlineLoading description="Processando..." /> : "Atualizar Folha A4"}
              </Button>
            </div>
          </Tile>
        </Column>

        {/* Coluna Direita: Folha A4 em Tempo Real */}
        <Column lg={9} md={8} sm={4}>
          <div className="pncp-no-print" style={{ marginBottom: "0.75rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--cds-text-secondary)" }}>
              Pré-visualização da Folha A4 Oficial (Padrão Impressão / ICP-Brasil)
            </span>
            <Tag type="cool-gray" size="sm">210 × 297 mm</Tag>
          </div>

          <div
            id="a4-folha-oficial"
            className="a4-container"
            data-testid="folha-a4-preview"
          >
            {documentoGerado?.conteudoHtml ? (
              <div
                dangerouslySetInnerHTML={{ __html: documentoGerado.conteudoHtml }}
              />
            ) : (
              <div style={{ padding: "4rem 2rem", textAlign: "center", color: "#6f6f6f" }}>
                <InlineLoading description="Carregando modelo A4 oficial..." />
              </div>
            )}
          </div>
        </Column>
      </Grid>
    </ModulePageShell>
  );
}

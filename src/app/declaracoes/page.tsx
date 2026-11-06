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
  DocumentView,
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
  const [numeroEdital, setNumeroEdital] = useState("");
  const [orgaoNome, setOrgaoNome] = useState("");
  const [objetoLicitacao, setObjetoLicitacao] = useState("");
  const [empresaRazaoSocial, setEmpresaRazaoSocial] = useState("");
  const [empresaCnpj, setEmpresaCnpj] = useState("");
  const [empresaEndereco, setEmpresaEndereco] = useState("");
  const [representanteNome, setRepresentanteNome] = useState("");
  const [representanteCpf, setRepresentanteCpf] = useState("");
  const [representanteRg, setRepresentanteRg] = useState("");
  const [representanteCargo, setRepresentanteCargo] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [dataDeclaracao, setDataDeclaracao] = useState(() => new Date().toISOString().slice(0, 10));

  // Oportunidades ativas para auto-preenchimento
  const [oportunidades, setOportunidades] = useState<any[]>([]);

  // Generated document state
  const [documentoGerado, setDocumentoGerado] = useState<DeclaracaoGeradaResponse | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [temPapelTimbrado, setTemPapelTimbrado] = useState(false);
  const [temLogo, setTemLogo] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [modalDeclaracaoAberto, setModalDeclaracaoAberto] = useState(false);
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

    fetch("/api/oportunidades?status=MINHAS&pageSize=50")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.oportunidades) && data.oportunidades.length > 0) {
          setOportunidades(data.oportunidades);
          const primeira = data.oportunidades[0];
          if (primeira) {
            setNumeroEdital(primeira.numeroEdital || "");
            setOrgaoNome(primeira.orgaoNome || "");
            setObjetoLicitacao(primeira.miniResumo || primeira.resumo || "");
          }
        }
      })
      .catch(() => {});
  }, []);

  const carregarDadosEmpresa = useCallback(() => {
    fetch("/api/configuracoes/empresa")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && data.empresa) {
          const emp = data.empresa;
          if (emp.razaoSocial) setEmpresaRazaoSocial(emp.razaoSocial);
          if (emp.cnpj) setEmpresaCnpj(maskCnpj(emp.cnpj));
          const logr = emp.logradouro || emp.endereco || "";
          const num = emp.numero ? (logr.includes(emp.numero) ? null : `nº ${emp.numero}`) : null;
          const endCompleto = [
            logr,
            num,
            emp.complemento,
            emp.bairro,
            emp.cidade,
            emp.uf,
            emp.cep ? `CEP ${emp.cep}` : null,
          ]
            .filter(Boolean)
            .join(", ");
          if (endCompleto) {
            setEmpresaEndereco(endCompleto);
          } else if (emp.endereco) {
            setEmpresaEndereco(emp.endereco);
          }
          if (emp.representanteNome) setRepresentanteNome(emp.representanteNome);
          if (emp.representanteCpf) setRepresentanteCpf(maskCpf(emp.representanteCpf));
          if (emp.representanteRg) setRepresentanteRg(emp.representanteRg);
          if (emp.representanteCargo) setRepresentanteCargo(emp.representanteCargo);
          if (emp.cidade) setCidade(emp.cidade);
          if (emp.uf) setUf(emp.uf);
          setTemPapelTimbrado(Boolean(emp.papelTimbradoUrl));
          setTemLogo(Boolean(emp.logoUrl));
        }
      })
      .catch(() => {});
  }, []);

  const temTimbradoOuLogo = Boolean(temPapelTimbrado || temLogo);

  useEffect(() => {
    carregarDadosEmpresa();
    const handleTenantChanged = () => {
      carregarDadosEmpresa();
    };
    window.addEventListener("tenant-changed", handleTenantChanged);
    return () => {
      window.removeEventListener("tenant-changed", handleTenantChanged);
    };
  }, [carregarDadosEmpresa]);

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
          numeroEdital: numeroEdital.trim() || "PE 001/2026",
          orgaoNome: orgaoNome.trim() || "Órgão Público Licitante",
          objetoLicitacao: objetoLicitacao.trim(),
          empresaRazaoSocial: empresaRazaoSocial.trim() || "EMPRESA LICITANTE LTDA",
          empresaCnpj: empresaCnpj.trim() || "00.000.000/0001-00",
          empresaEndereco: empresaEndereco.trim(),
          representanteNome: representanteNome.trim() || "Representante Legal",
          representanteCpf: representanteCpf.trim() || "000.000.000-00",
          representanteRg: representanteRg.trim(),
          representanteCargo: representanteCargo.trim() || "Representante Legal",
          cidade: cidade.trim() || "Goiânia",
          uf: uf.trim() || "GO",
          dataDeclaracao,
        }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        setDocumentoGerado(data);
        setModalDeclaracaoAberto(true);
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
    const conteudo = documentoGerado?.conteudoHtml || document.getElementById("a4-folha-oficial")?.innerHTML;
    if (!conteudo) {
      window.print();
      return;
    }

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
          <title>${documentoGerado?.titulo || metaAtual?.titulo || "Declaração Oficial"}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 10mm 14mm;
            }
            html, body {
              font-family: 'Times New Roman', Times, serif;
              color: #161616;
              margin: 0 !important;
              padding: 0 !important;
              background: #ffffff;
              font-size: 10.5pt;
              line-height: 1.35;
              width: 100%;
              overflow: visible !important;
            }
            * { box-sizing: border-box; }
            .declaracao-a4-documento {
              padding: 0 !important;
              max-width: 100% !important;
              width: 100% !important;
              overflow: visible !important;
            }
            .declaracao-assinatura-bloco {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            h1, h2, h3, h4 { color: #161616; margin-top: 0; margin-bottom: 0.25rem; }
            p { margin-top: 0; margin-bottom: 0.4rem; }
          </style>
        </head>
        <body>
          ${conteudo}
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

  const handleImprimirTimbrado = useCallback(async () => {
    setGerandoPdf(true);
    setNotificacao(null);
    try {
      const payload = {
        tipo: tipoSelecionado,
        numeroEdital: numeroEdital.trim() || "PE 001/2026",
        orgaoNome: orgaoNome.trim() || "Órgão Público Licitante",
        objetoLicitacao: objetoLicitacao.trim(),
        empresaRazaoSocial: empresaRazaoSocial.trim() || "EMPRESA LICITANTE LTDA",
        empresaCnpj: empresaCnpj.trim() || "00.000.000/0001-00",
        empresaEndereco: empresaEndereco.trim(),
        representanteNome: representanteNome.trim() || "Representante Legal",
        representanteCpf: representanteCpf.trim() || "000.000.000-00",
        representanteRg: representanteRg.trim(),
        representanteCargo: representanteCargo.trim() || "Representante Legal",
        cidade: cidade.trim() || "Goiânia",
        uf: uf.trim() || "GO",
        dataDeclaracao,
      };

      const res = await fetch("/api/declaracoes/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const erroJson = await res.json().catch(() => ({}));
        throw new Error(erroJson.error || "Falha ao gerar PDF timbrado");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank");
      if (!win) {
        const a = document.createElement("a");
        a.href = url;
        a.download = `declaracao_${tipoSelecionado.toLowerCase()}_timbrada.pdf`;
        a.click();
      }
      setNotificacao({
        tipo: "success",
        texto: "PDF timbrado oficial gerado com sucesso! Abrindo para impressão...",
      });
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err: any) {
      setNotificacao({
        tipo: "error",
        texto: err?.message || "Erro ao gerar PDF timbrado da declaração.",
      });
    } finally {
      setGerandoPdf(false);
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
          @page {
            size: A4 portrait;
            margin: 10mm 14mm;
          }
          /* Garante que apenas o documento oficial é impresso em 1 única página */
          body * {
            visibility: hidden !important;
          }
          #a4-folha-oficial, #a4-folha-oficial * {
            visibility: visible !important;
          }
          #a4-folha-oficial, .a4-container {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            min-height: 0 !important;
            height: auto !important;
            overflow: visible !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
          }
          .declaracao-assinatura-bloco {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          header, aside, nav, .cds--header, .cds--side-nav, .pncp-shell-header, .pncp-split-form, .pncp-no-print {
            display: none !important;
          }
          body, html, main, .cds--content {
            background: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            overflow: visible !important;
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
              <Tag type="cyan" size="md" className="pncp-mono">
                Anexo 5 • Lei nº 14.133/2021
              </Tag>
            </div>
            <p style={{ margin: 0, color: "var(--cds-text-secondary)", fontSize: "0.875rem" }}>
              Preencha as variáveis abaixo com vínculo automático aos certames e clique em &ldquo;Visualizar Declaração Oficial&rdquo; para revisar, imprimir com papel timbrado oficial ou exportar o texto.
            </p>
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

      <Grid fullWidth style={{ padding: 0 }}>
        <Column lg={16} md={8} sm={4} className="pncp-no-print" style={{ marginBottom: "2rem" }}>
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

            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "1.5rem" }}>
              <Button
                kind="primary"
                size="md"
                renderIcon={DocumentView}
                onClick={handleGerar}
                disabled={carregando}
                id="btn-visualizar-declaracao"
                data-testid="btn-visualizar-declaracao"
              >
                {carregando ? <InlineLoading description="Gerando documento..." /> : "Visualizar Declaração Oficial"}
              </Button>
            </div>
          </Tile>
        </Column>
      </Grid>

      {/* MODAL: Visualizar Declaração Oficial (Padrão Minuta Jurídica TCU) */}
      <Modal
        open={modalDeclaracaoAberto}
        onRequestClose={() => setModalDeclaracaoAberto(false)}
        modalHeading={`Declaração Oficial: ${metaAtual?.titulo || "Modelo Oficial (Lei 14.133/2021)"}`}
        passiveModal
        size="lg"
      >
        <div>
          {/* Barra de Ações Superior do Modal (Remanejada) */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
            <Button
              kind="secondary"
              size="sm"
              renderIcon={Printer}
              onClick={handleImprimir}
              id="btn-imprimir-a4"
              data-testid="btn-imprimir-a4"
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
                onClick={handleImprimirTimbrado}
                disabled={!temTimbradoOuLogo || gerandoPdf}
                id="btn-imprimir-timbrado"
                data-testid="btn-imprimir-timbrado"
              >
                {gerandoPdf ? <InlineLoading description="Gerando..." /> : "Imprimir PDF Timbrado"}
              </Button>
            </div>
            <Button
              kind="tertiary"
              size="sm"
              renderIcon={Copy}
              onClick={handleCopiarTexto}
              id="btn-copiar-declaracao"
              data-testid="btn-copiar-declaracao"
            >
              {copiado ? "Texto Copiado!" : "Copiar Texto"}
            </Button>
            <Button
              kind="ghost"
              size="sm"
              renderIcon={DocumentDownload}
              onClick={handleBaixarTxt}
              id="btn-baixar-txt"
              data-testid="btn-baixar-txt"
            >
              Exportar .TXT
            </Button>
          </div>

          {/* Visualização da Folha Oficial no Modal */}
          <div
            id="a4-folha-oficial"
            data-testid="folha-a4-preview"
            style={{
              background: "#ffffff",
              color: "#161616",
              padding: "2rem",
              borderRadius: "2px",
              border: "1px solid #c6c6c6",
              maxHeight: "65vh",
              overflowY: "auto",
            }}
            dangerouslySetInnerHTML={{
              __html: documentoGerado?.conteudoHtml || "",
            }}
          />
        </div>
      </Modal>
    </ModulePageShell>
  );
}

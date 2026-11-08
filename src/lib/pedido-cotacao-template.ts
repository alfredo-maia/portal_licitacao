import { formatarMoedaBrl } from "@/server/schemas/proposta-calculadora.schema";
import type { DadosEmpresaMinuta } from "@/lib/minuta-juridica";

export interface ItemPedidoCotacao {
  numeroItem: number | string;
  lote?: number | null;
  descricao: string;
  especificacaoDetalhada?: string | null;
  quantidade: number;
  unidadeMedida: string;
  marcaSugerida?: string | null;
}

export interface ConfigPedidoCotacao {
  fornecedorNome?: string;
  contatoFornecedor?: string;
  emailFornecedor?: string;
  telefoneFornecedor?: string;
  prazoResposta?: string;
  modalidadeFrete?: "CIF" | "FOB";
  localEntregaCidade?: string;
  localEntregaUf?: string;
  condicoesPagamento?: string;
  prazoGarantia?: string;
  observacoes?: string;
  ocultarOrgaoEdital: boolean; // Padrão: true (Sigilo Comercial)
}

export interface GerarPedidoCotacaoParams {
  orgaoNome?: string;
  numeroEdital?: string;
  itens: ItemPedidoCotacao[];
  configuracao?: Partial<ConfigPedidoCotacao>;
  empresa?: (DadosEmpresaMinuta & {
    bancoNome?: string | null;
    agencia?: string | null;
    contaCorrente?: string | null;
    chavePix?: string | null;
    telefone?: string | null;
    email?: string | null;
    whatsapp?: string | null;
    papelTimbradoUrl?: string | null;
  }) | null;
  geradoEm?: Date;
}

export function formatarDataExtenso(data = new Date(), cidade = "Goiânia", uf = "GO"): string {
  const meses = [
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
  ];
  const dia = String(data.getDate()).padStart(2, "0");
  const mes = meses[data.getMonth()];
  const ano = data.getFullYear();
  return `${cidade} - ${uf}, ${dia} de ${mes} de ${ano}`;
}

export function gerarConteudoPedidoCotacao(params: GerarPedidoCotacaoParams): {
  conteudoHtml: string;
  conteudoTexto: string;
  whatsappTexto: string;
  titulo: string;
} {
  const { orgaoNome, numeroEdital, itens, configuracao, empresa, geradoEm = new Date() } = params;

  const cfg: ConfigPedidoCotacao = {
    fornecedorNome: configuracao?.fornecedorNome || "",
    contatoFornecedor: configuracao?.contatoFornecedor || "",
    emailFornecedor: configuracao?.emailFornecedor || "",
    telefoneFornecedor: configuracao?.telefoneFornecedor || "",
    prazoResposta: configuracao?.prazoResposta || "Até 3 dias úteis",
    modalidadeFrete: configuracao?.modalidadeFrete || "CIF",
    localEntregaCidade: configuracao?.localEntregaCidade || empresa?.cidade || "Goiânia",
    localEntregaUf: configuracao?.localEntregaUf || empresa?.uf || "GO",
    condicoesPagamento: configuracao?.condicoesPagamento || "Conforme faturamento / entrega",
    prazoGarantia: configuracao?.prazoGarantia || "12 meses padrão de fábrica",
    observacoes: configuracao?.observacoes || "",
    ocultarOrgaoEdital: configuracao?.ocultarOrgaoEdital ?? true,
  };

  const razaoSocial = (empresa?.razaoSocial || "EMPRESA SOLICITANTE LTDA").trim();
  const cnpj = (empresa?.cnpj || "00.000.000/0001-00").trim();
  const cidadeEmpresa = empresa?.cidade || "Goiânia";
  const ufEmpresa = empresa?.uf || "GO";
  const telefoneEmpresa = empresa?.telefone || empresa?.whatsapp || "";
  const emailEmpresa = empresa?.email || "";
  const enderecoEmpresa = [empresa?.endereco, `${cidadeEmpresa}/${ufEmpresa}`].filter(Boolean).join(" - ");

  const tituloDocumento = "SOLICITAÇÃO DE COTAÇÃO DE PREÇOS (RFQ)";

  // 1. GERADOR DE TEXTO PARA WHATSAPP / E-MAIL
  const linhasWhats: string[] = [
    `📋 *${tituloDocumento}*`,
    `*Empresa Solicitante:* ${razaoSocial}`,
    `*CNPJ:* ${cnpj}`,
    cfg.fornecedorNome ? `*Destinatário:* ${cfg.fornecedorNome}` : "*Destinatário:* Ao Departamento Comercial",
    `*Local de Entrega:* ${cfg.localEntregaCidade}/${cfg.localEntregaUf}`,
    `*Modalidade de Frete:* ${cfg.modalidadeFrete === "CIF" ? "CIF (Incluso no valor cotado até o destino)" : "FOB"}`,
    `*Prazo Limite para Resposta:* ${cfg.prazoResposta}`,
    "",
    !cfg.ocultarOrgaoEdital && orgaoNome
      ? `🏛️ *Referência do Certame:* ${orgaoNome} — Edital ${numeroEdital || ""}\n`
      : "",
    "📦 *RELAÇÃO DE ITENS PARA COTAÇÃO:*",
  ];

  itens.forEach((it, idx) => {
    const num = it.numeroItem ?? idx + 1;
    linhasWhats.push(
      `• *Item ${num}*${it.lote ? ` (Lote ${it.lote})` : ""}: ${it.descricao.trim()}`,
      `  *Qtd:* ${it.quantidade} ${it.unidadeMedida}${it.marcaSugerida ? ` | *Ref:* ${it.marcaSugerida}` : ""}`,
      it.especificacaoDetalhada && it.especificacaoDetalhada !== it.descricao
        ? `  *Espec.:* ${it.especificacaoDetalhada.trim().slice(0, 160)}...`
        : "",
      "",
    );
  });

  linhasWhats.push(
    "--------------------------------------------------",
    "📝 *Por favor, responda com:*",
    "1. Marca e Modelo de cada item",
    "2. Preço Unitário e Total (com frete e impostos inclusos)",
    "3. Prazo de Entrega e Garantia",
    "4. Condições de Pagamento e Validade da Cotação",
    "",
    emailEmpresa ? `✉️ Enviar para: ${emailEmpresa}` : "",
    telefoneEmpresa ? `📞 Contato: ${telefoneEmpresa}` : "",
  );

  const whatsappTexto = linhasWhats.filter(Boolean).join("\n");

  // 2. GERADOR DE TEXTO PURO (.TXT)
  const linhasTexto: string[] = [
    razaoSocial.toUpperCase(),
    `CNPJ: ${cnpj} | ${enderecoEmpresa}`,
    emailEmpresa || telefoneEmpresa ? `Contato: ${[emailEmpresa, telefoneEmpresa].filter(Boolean).join(" • ")}` : "",
    "================================================================================",
    tituloDocumento,
    "================================================================================",
    cfg.fornecedorNome ? `Destinatário: ${cfg.fornecedorNome}` : "Destinatário: Ao Departamento Comercial",
    `Local de Entrega: ${cfg.localEntregaCidade}/${cfg.localEntregaUf}`,
    `Frete: ${cfg.modalidadeFrete === "CIF" ? "CIF (Incluso no valor cotado)" : "FOB"}`,
    `Prazo Limite para Resposta: ${cfg.prazoResposta}`,
    `Condições de Pagamento: ${cfg.condicoesPagamento}`,
    `Garantia Solicitada: ${cfg.prazoGarantia}`,
    !cfg.ocultarOrgaoEdital && orgaoNome ? `Órgão Solicitante: ${orgaoNome} | Processo/Edital: ${numeroEdital}` : "",
    cfg.observacoes ? `Observações Comerciais: ${cfg.observacoes}` : "",
    "--------------------------------------------------------------------------------",
    "ITENS SOLICITADOS:",
    "",
  ];

  itens.forEach((it, idx) => {
    const num = it.numeroItem ?? idx + 1;
    linhasTexto.push(
      `Item ${num}${it.lote ? ` (Lote ${it.lote})` : ""}: ${it.descricao}`,
      `Quantidade: ${it.quantidade} ${it.unidadeMedida}${it.marcaSugerida ? ` | Marca de Referência: ${it.marcaSugerida}` : ""}`,
      it.especificacaoDetalhada && it.especificacaoDetalhada !== it.descricao
        ? `Especificação: ${it.especificacaoDetalhada}`
        : "",
      "-> [  ] Marca/Modelo Ofertado: ____________________________________________",
      "-> [  ] Valor Unitário: R$ ______________  |  Valor Total: R$ ____________",
      "",
    );
  });

  linhasTexto.push(
    "--------------------------------------------------------------------------------",
    formatarDataExtenso(geradoEm, cidadeEmpresa, ufEmpresa),
    "",
    "________________________________________________________",
    `${razaoSocial} — Departamento de Suprimentos & Cotações`,
  );

  const conteudoTexto = linhasTexto.filter(Boolean).join("\n");

  // 3. GERADOR DE HTML CORPORATIVO PARA IMPRESSÃO A4
  const linhasTabelaHtml = itens
    .map((it, idx) => {
      const num = it.numeroItem ?? idx + 1;
      return `
        <tr style="page-break-inside: avoid; border-bottom: 1px solid #e0e0e0;">
          <td style="padding: 8px 10px; font-weight: 700; text-align: center; vertical-align: top; width: 45px;">
            ${num}
          </td>
          ${it.lote ? `<td style="padding: 8px 10px; text-align: center; vertical-align: top; width: 45px;">${it.lote}</td>` : ""}
          <td style="padding: 8px 10px; vertical-align: top;">
            <div style="font-weight: 600; font-size: 9pt; color: #161616;">${it.descricao}</div>
            ${
              it.especificacaoDetalhada && it.especificacaoDetalhada !== it.descricao
                ? `<div style="font-size: 8pt; color: #525252; margin-top: 3px; line-height: 1.35;">${it.especificacaoDetalhada}</div>`
                : ""
            }
            ${
              it.marcaSugerida
                ? `<div style="font-size: 7.5pt; color: #0043ce; font-weight: 600; margin-top: 3px;">Marca de Referência: ${it.marcaSugerida}</div>`
                : ""
            }
          </td>
          <td style="padding: 8px 10px; text-align: center; font-weight: 600; vertical-align: top; width: 55px;">
            ${it.quantidade}
          </td>
          <td style="padding: 8px 10px; text-align: center; font-weight: 600; vertical-align: top; width: 50px;">
            ${it.unidadeMedida}
          </td>
          <td style="padding: 8px 10px; vertical-align: top; width: 140px; border-left: 1px dashed #d0d0d0;">
            <div style="height: 22px; border-bottom: 1px dotted #888;"></div>
          </td>
          <td style="padding: 8px 10px; vertical-align: top; width: 85px; border-left: 1px dashed #d0d0d0;">
            <div style="height: 22px; border-bottom: 1px dotted #888;"></div>
          </td>
          <td style="padding: 8px 10px; vertical-align: top; width: 85px; border-left: 1px dashed #d0d0d0;">
            <div style="height: 22px; border-bottom: 1px dotted #888;"></div>
          </td>
        </tr>
      `;
    })
    .join("");

  const temLote = itens.some((it) => it.lote != null);

  const conteudoHtml = `
    <div class="pedido-cotacao-documento" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #161616; line-height: 1.4; padding: 10px 0;">
      <!-- CABEÇALHO DO DOCUMENTO -->
      <div style="border-bottom: 2px solid #0f62fe; padding-bottom: 12px; margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem;">
          <div>
            <h1 style="font-size: 13pt; font-weight: 800; color: #0f62fe; margin: 0; text-transform: uppercase; letter-spacing: 0.5px;">
              ${tituloDocumento}
            </h1>
            <div style="font-size: 8.5pt; color: #525252; margin-top: 3px;">
              Solicitação Formal de Preços & Condições de Fornecimento
            </div>
          </div>
          <div style="text-align: right; font-size: 8pt; color: #525252;">
            <strong>${razaoSocial}</strong><br/>
            CNPJ: ${cnpj}<br/>
            ${cidadeEmpresa}/${ufEmpresa}
          </div>
        </div>
      </div>

      <!-- PAINEL DE DADOS DO DESTINATÁRIO E CONDIÇÕES COMERCIAIS -->
      <div style="background-color: #f4f4f4; border: 1px solid #e0e0e0; border-radius: 4px; padding: 10px 14px; margin-bottom: 16px; font-size: 8.5pt;">
        <div style="display: grid; grid-template-columns: 1.5fr 1fr 1fr; gap: 8px;">
          <div>
            <strong style="color: #525252; text-transform: uppercase; font-size: 7.5pt; display: block;">Destinatário / Fornecedor:</strong>
            <span style="font-size: 9pt; font-weight: 600;">${cfg.fornecedorNome || "Ao Departamento Comercial / Vendas"}</span>
            ${cfg.contatoFornecedor ? `<div style="font-size: 8pt; color: #525252;">A/C: ${cfg.contatoFornecedor}</div>` : ""}
          </div>
          <div>
            <strong style="color: #525252; text-transform: uppercase; font-size: 7.5pt; display: block;">Local de Entrega:</strong>
            <span style="font-weight: 600;">${cfg.localEntregaCidade}/${cfg.localEntregaUf}</span>
            <div style="font-size: 8pt; color: #0043ce; font-weight: 600;">Frete: ${cfg.modalidadeFrete === "CIF" ? "CIF (Incluso até destino)" : "FOB"}</div>
          </div>
          <div>
            <strong style="color: #525252; text-transform: uppercase; font-size: 7.5pt; display: block;">Prazo Limite Resposta:</strong>
            <span style="font-weight: 700; color: #da1e28;">${cfg.prazoResposta}</span>
            <div style="font-size: 8pt; color: #525252;">Garantia: ${cfg.prazoGarantia}</div>
          </div>
        </div>

        ${
          !cfg.ocultarOrgaoEdital && orgaoNome
            ? `
          <div style="border-top: 1px dashed #d0d0d0; margin-top: 8px; padding-top: 6px; font-size: 8pt; color: #393939;">
            <strong>Referência do Certame:</strong> Órgão: ${orgaoNome} • Processo / Edital: ${numeroEdital || "N/I"}
          </div>
        `
            : ""
        }

        ${
          cfg.observacoes
            ? `
          <div style="border-top: 1px dashed #d0d0d0; margin-top: 8px; padding-top: 6px; font-size: 8pt; color: #393939;">
            <strong>Observações de Fornecimento:</strong> ${cfg.observacoes}
          </div>
        `
            : ""
        }
      </div>

      <!-- INSTRUÇÃO AO FORNECEDOR -->
      <div style="font-size: 8pt; color: #525252; margin-bottom: 12px; line-height: 1.35;">
        Solicitamos a apresentação de sua melhor proposta comercial para o fornecimento dos itens abaixo discriminados. 
        Favor preencher as colunas reservadas (<strong>Marca/Modelo Ofertado</strong>, <strong>Valor Unitário</strong> e <strong>Valor Total</strong> com frete e impostos inclusos) e nos retornar por e-mail ou WhatsApp até a data limite.
      </div>

      <!-- TABELA DE ITENS -->
      <table style="width: 100%; border-collapse: collapse; font-size: 8.5pt; margin-bottom: 20px; border: 1px solid #d0d0d0;">
        <thead>
          <tr style="background-color: #0f62fe; color: #ffffff;">
            <th style="padding: 7px 8px; text-align: center; width: 45px; font-size: 8pt;">Item</th>
            ${temLote ? `<th style="padding: 7px 8px; text-align: center; width: 45px; font-size: 8pt;">Lote</th>` : ""}
            <th style="padding: 7px 8px; text-align: left; font-size: 8pt;">Descrição do Produto / Especificação Técnica</th>
            <th style="padding: 7px 8px; text-align: center; width: 55px; font-size: 8pt;">Qtd</th>
            <th style="padding: 7px 8px; text-align: center; width: 50px; font-size: 8pt;">Unid.</th>
            <th style="padding: 7px 8px; text-align: center; width: 140px; font-size: 8pt; background-color: #0043ce;">Marca/Modelo Cotado</th>
            <th style="padding: 7px 8px; text-align: center; width: 85px; font-size: 8pt; background-color: #0043ce;">Valor Unit. (R$)</th>
            <th style="padding: 7px 8px; text-align: center; width: 85px; font-size: 8pt; background-color: #0043ce;">Valor Total (R$)</th>
          </tr>
        </thead>
        <tbody>
          ${linhasTabelaHtml}
        </tbody>
      </table>

      <!-- RODAPÉ & ASSINATURA -->
      <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 24px; padding-top: 12px; border-top: 1px solid #e0e0e0; font-size: 8pt;">
        <div>
          <strong>${razaoSocial}</strong><br/>
          Departamento de Compras e Suprimentos<br/>
          ${[emailEmpresa, telefoneEmpresa].filter(Boolean).join(" • ")}
        </div>
        <div style="text-align: right; color: #525252;">
          ${formatarDataExtenso(geradoEm, cidadeEmpresa, ufEmpresa)}
        </div>
      </div>
    </div>
  `;

  return {
    conteudoHtml,
    conteudoTexto,
    whatsappTexto,
    titulo: tituloDocumento,
  };
}

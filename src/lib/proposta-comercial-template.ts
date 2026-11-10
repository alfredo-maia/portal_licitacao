import {
  consolidarCalculadoraProposta,
  formatarMoedaBrl,
  type ConfiguracaoPropostaInput,
  type ItemCalculadoraInput,
} from "@/server/schemas/proposta-calculadora.schema";
import type { DadosEmpresaMinuta } from "@/lib/minuta-juridica";

const VALIDADE_EXTENSO: Record<number, string> = {
  15: " (quinze)",
  30: " (trinta)",
  45: " (quarenta e cinco)",
  60: " (sessenta)",
  90: " (noventa)",
  120: " (cento e vinte)",
  180: " (cento e oitenta)",
};

export function formatarValidadeDiasExtenso(dias: number): string {
  return VALIDADE_EXTENSO[dias] || "";
}

export function formatarDataExtensoProposta(
  dataStr?: string,
  cidade = "Goiânia",
  uf = "GO",
): string {
  const data = dataStr ? new Date(dataStr.includes("T") ? dataStr : `${dataStr}T12:00:00`) : new Date();
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
  const dia = data.getDate().toString().padStart(2, "0");
  const mes = meses[data.getMonth()];
  const ano = data.getFullYear();
  return `${cidade} - ${uf}, ${dia} de ${mes} de ${ano}`;
}

export interface GerarPropostaParams {
  orgaoNome: string;
  numeroEdital: string;
  objetoLicitacao: string;
  itens: ItemCalculadoraInput[];
  configuracao?: Partial<ConfiguracaoPropostaInput>;
  empresa?: (DadosEmpresaMinuta & {
    bancoNome?: string | null;
    agencia?: string | null;
    contaCorrente?: string | null;
    chavePix?: string | null;
  }) | null;
  geradoEm?: Date;
}

export function gerarConteudoPropostaComercial(params: GerarPropostaParams): {
  conteudoHtml: string;
  conteudoTexto: string;
  titulo: string;
  valorTotalFormatado: string;
} {
  const { orgaoNome, numeroEdital, objetoLicitacao, itens: itensRaw, configuracao, empresa } = params;
  const consolidado = consolidarCalculadoraProposta(itensRaw, configuracao);
  const cfg = consolidado.propostaConfig;

  // Resolução resiliente do Objeto da Licitação (NUNCA fica em branco no Anexo I / Proposta)
  const objetoResolvido = (
    cfg.descricaoGlobal?.trim() ||
    objetoLicitacao?.trim() ||
    itensRaw?.[0]?.descricao?.trim() ||
    "Fornecimento de materiais e/ou serviços especializados conforme especificações do Edital e seus anexos."
  );

  const isReadequada = cfg.tipoTabelaProposta === "PROPOSTA_READEQUADA";
  const tituloDocumento = isReadequada
    ? "PROPOSTA COMERCIAL DE PREÇOS READEQUADA"
    : "PROPOSTA COMERCIAL DE PREÇOS";

  // Determinação do valor total
  let valorTotalNumero = 0;
  if (cfg.modoEmissao === "VALOR_GLOBAL") {
    valorTotalNumero = cfg.valorGlobalManual && cfg.valorGlobalManual > 0
      ? cfg.valorGlobalManual
      : isReadequada ? consolidado.readequadaTotalGeral : consolidado.propostaTotalGeral;
  } else {
    valorTotalNumero = isReadequada ? consolidado.readequadaTotalGeral : consolidado.propostaTotalGeral;
  }
  const valorTotalFormatado = formatarMoedaBrl(valorTotalNumero);

  const razaoSocial = (empresa?.razaoSocial || "EMPRESA LICITANTE LTDA").trim();
  const cnpj = (empresa?.cnpj || "00.000.000/0001-00").trim();
  const enderecoCompleto = [
    empresa?.endereco,
    empresa?.cidade && empresa?.uf ? `${empresa.cidade}/${empresa.uf}` : "",
  ].filter(Boolean).join(" - ");

  const repNome = (empresa?.representanteNome || "Representante Legal").trim();
  const repCargo = (empresa?.representanteCargo || "Sócio-Administrador").trim();
  const repCpf = (empresa?.representanteCpf || "").trim();

  // Dados Bancários: Mescla o cadastrado com o personalizado da proposta
  const bancoNome = (cfg.dadosBancariosPersonalizados?.bancoNome ?? empresa?.bancoNome ?? "").trim();
  const agencia = (cfg.dadosBancariosPersonalizados?.agencia ?? empresa?.agencia ?? "").trim();
  const conta = (cfg.dadosBancariosPersonalizados?.contaCorrente ?? empresa?.contaCorrente ?? "").trim();
  const pix = (cfg.dadosBancariosPersonalizados?.chavePix ?? empresa?.chavePix ?? "").trim();
  const temDadosBancarios = Boolean(bancoNome || agencia || conta || pix);

  const dataExtenso = formatarDataExtensoProposta(
    cfg.dataEmissao || undefined,
    empresa?.cidade || "Goiânia",
    empresa?.uf || "GO",
  );

  // 1. GERAÇÃO TEXTO PURO (.TXT / CLIPBOARD)
  const linhasTexto: string[] = [
    razaoSocial.toUpperCase(),
    `CNPJ: ${cnpj} | ${enderecoCompleto}`,
    "--------------------------------------------------------------------------------",
    `AO ILUSTRÍSSIMO PREGOEIRO E EQUIPE DE CONTRATAÇÃO`,
    `Órgão: ${orgaoNome.toUpperCase()}`,
    `Processo / Edital: ${numeroEdital}`,
    `Objeto: ${objetoResolvido}`,
    "--------------------------------------------------------------------------------",
    tituloDocumento,
    "",
    "Declaramos, sob as penas da lei e em cumprimento ao disposto no Art. 63, §1º da Lei Federal nº 14.133/2021, que na presente proposta estão inclusos todos os custos operacionais, frete, tributos, encargos trabalhistas, previdenciários e comerciais, bem como quaisquer outras despesas necessárias à plena execução do objeto.",
    "",
  ];

  if (cfg.modoEmissao === "VALOR_GLOBAL") {
    const rotulo = cfg.tipoAgrupamentoGlobal === "PRECO_GLOBAL" ? "Preço Global" : (cfg.tituloGlobalCustomizado || "Lote 01");
    linhasTexto.push(`AGRUPAMENTO: ${rotulo}`);
    linhasTexto.push(`DESCRIÇÃO DO OBJETO: ${objetoResolvido}`);
    linhasTexto.push(`VALOR TOTAL PROPOSTO: ${valorTotalFormatado}`);
  } else {
    linhasTexto.push("PLANILHA DETALHADA DE ITENS:");
    for (const it of consolidado.itens) {
      const vUnit = isReadequada ? it.valorUnitarioReadequado : it.propostaUnitaria;
      const vTotal = isReadequada ? it.valorTotalReadequado : it.propostaTotal;
      const marcaTxt = it.marcaModelo ? ` [Marca/Modelo: ${it.marcaModelo}]` : "";
      linhasTexto.push(
        `- Item ${it.numeroItem}: ${it.descricao}${marcaTxt} | Qtd: ${it.quantidade} ${it.unidade} | Unit: ${formatarMoedaBrl(vUnit)} | Total: ${formatarMoedaBrl(vTotal)}`
      );
    }
    linhasTexto.push("");
    linhasTexto.push(`VALOR GLOBAL TOTAL DA PROPOSTA: ${valorTotalFormatado}`);
  }

  linhasTexto.push("");
  linhasTexto.push("CONDIÇÕES COMERCIAIS:");
  linhasTexto.push(`- Validade da Proposta: ${cfg.validadeDias}${formatarValidadeDiasExtenso(cfg.validadeDias)} dias a contar da apresentação.`);
  linhasTexto.push(`- Prazo de Entrega / Início da Execução: ${cfg.prazoEntrega}`);
  linhasTexto.push(`- Condições de Pagamento: ${cfg.condicoesPagamento}`);
  if (cfg.garantiaObservacoes) {
    linhasTexto.push(`- Garantia e Observações: ${cfg.garantiaObservacoes}`);
  }
  if (temDadosBancarios) {
    const bancosPartes = [
      bancoNome ? `Banco: ${bancoNome}` : "",
      agencia ? `Agência: ${agencia}` : "",
      conta ? `Conta Corrente: ${conta}` : "",
      pix ? `Chave PIX: ${pix}` : "",
    ].filter(Boolean).join(" | ");
    linhasTexto.push(`- Dados Bancários para Pagamento: ${bancosPartes}`);
  }

  linhasTexto.push("");
  linhasTexto.push(`${dataExtenso}`);
  linhasTexto.push("");
  linhasTexto.push("_________________________________________________________");
  linhasTexto.push(repNome);
  linhasTexto.push(repCargo);
  if (repCpf) linhasTexto.push(`CPF: ${repCpf}`);
  linhasTexto.push(razaoSocial);

  const conteudoTexto = linhasTexto.join("\n");

  // 2. GERAÇÃO HTML PARA VISUALIZAÇÃO A4 & IMPRESSÃO LIMPA
  const itensHtmlRows = consolidado.itens.map((it) => {
    const vUnit = isReadequada ? it.valorUnitarioReadequado : it.propostaUnitaria;
    const vTotal = isReadequada ? it.valorTotalReadequado : it.propostaTotal;
    return `
      <tr>
        <td style="padding: 6px 8px; border: 1px solid #d0d0d0; text-align: center; font-weight: 600;">${it.numeroItem}</td>
        <td style="padding: 6px 8px; border: 1px solid #d0d0d0;">
          <div>${it.descricao}</div>
          ${it.marcaModelo ? `<div style="font-size: 0.75rem; color: #555; margin-top: 2px;"><strong>Marca/Modelo:</strong> ${it.marcaModelo}</div>` : ""}
        </td>
        <td style="padding: 6px 8px; border: 1px solid #d0d0d0; text-align: center;">${it.unidade}</td>
        <td style="padding: 6px 8px; border: 1px solid #d0d0d0; text-align: center;">${it.quantidade}</td>
        <td style="padding: 6px 8px; border: 1px solid #d0d0d0; text-align: right;">${formatarMoedaBrl(vUnit)}</td>
        <td style="padding: 6px 8px; border: 1px solid #d0d0d0; text-align: right; font-weight: 600;">${formatarMoedaBrl(vTotal)}</td>
      </tr>
    `;
  }).join("");

  const tabelaItensHtml = cfg.modoEmissao === "VALOR_GLOBAL"
    ? `
      <div style="border: 1px solid #d0d0d0; border-radius: 4px; padding: 12px; margin-bottom: 16px; background-color: #fafafa;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <span style="font-weight: 700; font-size: 0.95rem; color: #161616;">
            ${cfg.tipoAgrupamentoGlobal === "PRECO_GLOBAL" ? "Preço Global Único" : (cfg.tituloGlobalCustomizado || "Lote 01")}
          </span>
          <span style="font-weight: 700; font-size: 1.1rem; color: #0f62fe;">${valorTotalFormatado}</span>
        </div>
        <p style="margin: 0; font-size: 0.85rem; color: #393939; line-height: 1.4;">
          ${objetoResolvido}
        </p>
      </div>
    `
    : `
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 0.8125rem;">
        <thead>
          <tr style="background-color: #f4f4f4;">
            <th style="padding: 6px 8px; border: 1px solid #d0d0d0; width: 8%;">Item</th>
            <th style="padding: 6px 8px; border: 1px solid #d0d0d0; width: 44%;">Especificação do Objeto</th>
            <th style="padding: 6px 8px; border: 1px solid #d0d0d0; width: 8%;">Unid.</th>
            <th style="padding: 6px 8px; border: 1px solid #d0d0d0; width: 10%;">Qtd.</th>
            <th style="padding: 6px 8px; border: 1px solid #d0d0d0; width: 15%;">Vlr. Unitário</th>
            <th style="padding: 6px 8px; border: 1px solid #d0d0d0; width: 15%;">Vlr. Total</th>
          </tr>
        </thead>
        <tbody>
          ${itensHtmlRows}
        </tbody>
        <tfoot>
          <tr style="background-color: #f9f9f9; font-weight: 700;">
            <td colspan="5" style="padding: 8px; border: 1px solid #d0d0d0; text-align: right;">VALOR GLOBAL TOTAL DA PROPOSTA:</td>
            <td style="padding: 8px; border: 1px solid #d0d0d0; text-align: right; color: #0f62fe; font-size: 0.95rem;">${valorTotalFormatado}</td>
          </tr>
        </tfoot>
      </table>
    `;

  const dadosBancariosHtml = temDadosBancarios
    ? `
      <div style="margin-top: 8px; padding: 8px 12px; background-color: #f4f4f4; border-left: 3px solid #0f62fe; font-size: 0.8125rem;">
        <strong>Dados Bancários para Liquidação e Pagamento:</strong><br />
        ${[
      bancoNome ? `Banco: <strong>${bancoNome}</strong>` : "",
      agencia ? `Agência: <strong>${agencia}</strong>` : "",
      conta ? `Conta Corrente: <strong>${conta}</strong>` : "",
      pix ? `Chave PIX: <strong>${pix}</strong>` : "",
    ].filter(Boolean).join(" &nbsp;|&nbsp; ")}
      </div>
    `
    : "";

  const conteudoHtml = `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #161616; line-height: 1.45; max-width: 100%;">
      <!-- Cabeçalho Corporativo Limpo -->
      <div style="text-align: center; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 1px solid #e0e0e0;">
        <h2 style="margin: 0; font-size: 1.15rem; font-weight: 700; letter-spacing: 0.5px;">${razaoSocial.toUpperCase()}</h2>
        <div style="font-size: 0.8rem; color: #525252; margin-top: 4px;">
          CNPJ: ${cnpj} ${enderecoCompleto ? `| ${enderecoCompleto}` : ""}
        </div>
      </div>

      <!-- Quadro do Certame -->
      <div style="border-left: 3.5px solid #0f62fe; background-color: #f4f7fb; padding: 10px 14px; margin-bottom: 18px; font-size: 0.825rem;">
        <div style="margin-bottom: 3px;"><strong>Órgão Licitante:</strong> ${orgaoNome.toUpperCase()}</div>
        <div style="margin-bottom: 3px;"><strong>Processo / Edital:</strong> ${numeroEdital}</div>
        <div><strong>Objeto:</strong> ${objetoResolvido}</div>
      </div>

      <!-- Título da Proposta -->
      <div style="text-align: center; margin-bottom: 14px;">
        <h3 style="margin: 0; font-size: 1.05rem; font-weight: 700; letter-spacing: 0.5px;">${tituloDocumento}</h3>
        <div style="font-size: 0.75rem; font-style: italic; color: #525252; margin-top: 2px;">(Fundamento: Lei Federal nº 14.133/2021)</div>
      </div>

      <!-- Declaração Legal -->
      <p style="font-size: 0.85rem; text-align: justify; text-indent: 1.5rem; margin-bottom: 16px;">
        Apresentamos a nossa proposta comercial para o fornecimento dos materiais/serviços objeto do certame referenciado, declarando expressamente, nos termos do Art. 63, §1º da Lei Federal nº 14.133/2021, que nos preços cotados estão inclusos todos os custos operacionais, tributos, fretes, seguros, encargos sociais e trabalhistas incidentes, garantindo a plena exequibilidade da proposta.
      </p>

      <!-- Tabela ou Bloco de Valores -->
      ${tabelaItensHtml}

      <!-- Condições Comerciais -->
      <div style="margin-bottom: 16px; font-size: 0.825rem; line-height: 1.5;">
        <h4 style="margin: 0 0 6px 0; font-size: 0.875rem; font-weight: 700; border-bottom: 1px dashed #d0d0d0; padding-bottom: 3px;">
          CONDIÇÕES COMERCIAIS:
        </h4>
        <ul style="margin: 0; padding-left: 1.25rem;">
          <li><strong>Validade da Proposta:</strong> ${cfg.validadeDias}${formatarValidadeDiasExtenso(cfg.validadeDias)} dias corridos a contar da data de sua entrega.</li>
          <li><strong>Prazo de Entrega / Execução:</strong> ${cfg.prazoEntrega}</li>
          <li><strong>Condições de Pagamento:</strong> ${cfg.condicoesPagamento}</li>
          ${cfg.garantiaObservacoes ? `<li><strong>Garantia e Observações:</strong> ${cfg.garantiaObservacoes}</li>` : ""}
        </ul>
        ${dadosBancariosHtml}
      </div>

      <!-- Bloco de Assinatura Indivisível -->
      <div style="page-break-inside: avoid; break-inside: avoid; margin-top: 28px; text-align: center;">
        <div style="text-align: right; font-size: 0.85rem; margin-bottom: 24px;">
          ${dataExtenso}
        </div>
        <div style="display: inline-block; width: 60%; border-top: 1px solid #161616; padding-top: 6px;">
          <div style="font-weight: 700; font-size: 0.95rem;">${repNome}</div>
          <div style="font-size: 0.825rem; color: #393939;">${repCargo}</div>
          ${repCpf ? `<div style="font-size: 0.775rem; color: #525252;">CPF: ${repCpf}</div>` : ""}
          <div style="font-size: 0.775rem; color: #525252; margin-top: 2px;">${razaoSocial}</div>
        </div>
      </div>
    </div>
  `;

  return {
    conteudoHtml,
    conteudoTexto,
    titulo: `Proposta Comercial - ${numeroEdital}`,
    valorTotalFormatado,
  };
}


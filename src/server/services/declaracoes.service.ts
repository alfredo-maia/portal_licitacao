import {
  DECLARACAO_METADATA,
  DECLARACAO_TIPOS,
  type DeclaracaoGeradaResponse,
  type DeclaracaoGerarInput,
  type DeclaracaoTipo,
} from "@/server/schemas/declaracao.schema";
import { recordAuditLog } from "@/server/audit";

function formatarDataExtenso(dataStr?: string, cidade = "Goiânia", uf = "GO"): string {
  const data = dataStr ? new Date(dataStr) : new Date();
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

export function obterTemplatesDeclaracoes(): typeof DECLARACAO_METADATA[DeclaracaoTipo][] {
  return DECLARACAO_TIPOS.map((tipo) => DECLARACAO_METADATA[tipo]);
}

function gerarTextoEspecifico(tipo: DeclaracaoTipo, input: DeclaracaoGerarInput): { corpoHtml: string; corpoTexto: string } {
  const {
    empresaRazaoSocial,
    empresaCnpj,
    empresaEndereco,
    representanteNome,
    representanteCpf,
    representanteRg,
    representanteCargo,
    numeroEdital,
    orgaoNome,
    objetoLicitacao,
  } = input;

  const enderecoText = empresaEndereco ? `, com sede em ${empresaEndereco}` : "";
  const rgText = representanteRg ? `, RG nº ${representanteRg}` : "";
  const objetoText = objetoLicitacao ? `, cujo objeto é "${objetoLicitacao}"` : "";

  switch (tipo) {
    case "CARTA_CREDENCIAMENTO":
      return {
        corpoTexto: `Pela presente, a empresa ${empresaRazaoSocial}, inscrita no CNPJ sob o nº ${empresaCnpj}${enderecoText}, neste ato representada por seu administrador infra-assinado, CREDENCIA e outorga amplos e gerais poderes a ${representanteNome}, portador(a) do CPF nº ${representanteCpf}${rgText}, ${representanteCargo}, para representá-la perante o órgão ${orgaoNome}, no âmbito do processo licitatório ${numeroEdital}${objetoText}.\n\nO(A) ora credenciado(a) possui poderes especiais e plenos para rubricar e apresentar propostas de preços e documentos de habilitação, formular lances verbais e eletrônicos, manifestar imediata e motivada intenção de recurso, interpor recursos administrativos, transigir, firmar compromissos, renunciar a direitos de prazos recursais, assinar atas e contratos administrativos, e praticar todos os demais atos indispensáveis e necessários ao fiel cumprimento do mandato.`,
        corpoHtml: `<p>Pela presente, a empresa <strong>${empresaRazaoSocial}</strong>, inscrita no CNPJ sob o nº <strong>${empresaCnpj}</strong>${enderecoText}, neste ato representada por seu administrador infra-assinado, <strong>CREDENCIA</strong> e outorga amplos e gerais poderes a <strong>${representanteNome}</strong>, portador(a) do CPF nº <strong>${representanteCpf}</strong>${rgText}, ${representanteCargo}, para representá-la perante o órgão <strong>${orgaoNome}</strong>, no âmbito do processo licitatório <strong>${numeroEdital}</strong>${objetoText}.</p>
<p>O(A) ora credenciado(a) possui poderes especiais e plenos para rubricar e apresentar propostas de preços e documentos de habilitação, formular lances verbais e eletrônicos, manifestar imediata e motivada intenção de recurso, interpor recursos administrativos, transigir, firmar compromissos, renunciar a direitos de prazos recursais, assinar atas e contratos administrativos, e praticar todos os demais atos indispensáveis e necessários ao fiel cumprimento do mandato.</p>`,
      };

    case "ELABORACAO_INDEPENDENTE":
      return {
        corpoTexto: `A empresa ${empresaRazaoSocial}, inscrita no CNPJ sob o nº ${empresaCnpj}, por intermédio de seu representante legal ${representanteNome}, portador do CPF nº ${representanteCpf}, DECLARA, sob as penas da lei e em conformidade com o Art. 9º, inciso III da Lei nº 14.133/2021, que para fins de participação no certame ${numeroEdital}, promovido por ${orgaoNome}:\n\n1. A proposta anexa foi elaborada de maneira totalmente independente e autônoma pelo proponente;\n2. O conteúdo da proposta não foi, no todo ou em parte, informado, discutido ou compartilhado com qualquer outro potencial participante ou concorrente;\n3. Não houve qualquer intenção ou tentativa de influenciar a decisão de outros concorrentes quanto à participação ou precificação neste certame;\n4. O conteúdo da referida proposta não foi revelado a qualquer servidor ou agente público vinculado ao certame antes de sua regular abertura pública.`,
        corpoHtml: `<p>A empresa <strong>${empresaRazaoSocial}</strong>, inscrita no CNPJ sob o nº <strong>${empresaCnpj}</strong>, por intermédio de seu representante legal <strong>${representanteNome}</strong>, portador do CPF nº <strong>${representanteCpf}</strong>, <strong>DECLARA</strong>, sob as penas da lei e em conformidade com o Art. 9º, inciso III da Lei nº 14.133/2021, que para fins de participação no certame <strong>${numeroEdital}</strong>, promovido por <strong>${orgaoNome}</strong>:</p>
<ol>
  <li>A proposta anexa foi elaborada de maneira totalmente independente e autônoma pelo proponente;</li>
  <li>O conteúdo da proposta não foi, no todo ou em parte, informado, discutido ou compartilhado com qualquer outro potencial participante ou concorrente;</li>
  <li>Não houve qualquer intenção ou tentativa de influenciar a decisão de outros concorrentes quanto à participação ou precificação neste certame;</li>
  <li>O conteúdo da referida proposta não foi revelado a qualquer servidor ou agente público vinculado ao certame antes de sua regular abertura pública.</li>
</ol>`,
      };

    case "INEXISTENCIA_FATOS_IMPEDITIVOS":
      return {
        corpoTexto: `A empresa ${empresaRazaoSocial}, inscrita no CNPJ sob o nº ${empresaCnpj}${enderecoText}, por seu representante legal infra-assinado, DECLARA, sob as penalidades cabíveis do Art. 299 do Código Penal e para os fins da Lei Federal nº 14.133/2021 perante ${orgaoNome} (Edital ${numeroEdital}), que:\n\n1. Não incorre em nenhuma das hipóteses de impedimento previstas no Art. 14 da Lei nº 14.133/2021;\n2. Inexistem fatos supervenientes impeditivos à sua habilitação jurídica, qualificação técnica, regularidade fiscal e econômico-financeira;\n3. Não foi declarada inidônea para licitar ou contratar com a Administração Pública direta ou indireta de nenhum ente da Federação;\n4. Não se encontra temporariamente suspensa ou impedida de licitar perante este órgão licitante;\n5. Compromete-se a comunicar imediatamente qualquer evento superveniente modificador das condições presentes.`,
        corpoHtml: `<p>A empresa <strong>${empresaRazaoSocial}</strong>, inscrita no CNPJ sob o nº <strong>${empresaCnpj}</strong>${enderecoText}, por seu representante legal infra-assinado, <strong>DECLARA</strong>, sob as penalidades cabíveis do Art. 299 do Código Penal e para os fins da Lei Federal nº 14.133/2021 perante <strong>${orgaoNome}</strong> (Edital <strong>${numeroEdital}</strong>), que:</p>
<ol>
  <li>Não incorre em nenhuma das hipóteses de impedimento previstas no Art. 14 da Lei nº 14.133/2021;</li>
  <li>Inexistem fatos supervenientes impeditivos à sua habilitação jurídica, qualificação técnica, regularidade fiscal e econômico-financeira;</li>
  <li>Não foi declarada inidônea para licitar ou contratar com a Administração Pública direta ou indireta de nenhum ente da Federação;</li>
  <li>Não se encontra temporariamente suspensa ou impedida de licitar perante este órgão licitante;</li>
  <li>Compromete-se a comunicar imediatamente qualquer evento superveniente modificador das condições presentes.</li>
</ol>`,
      };

    case "NAO_TRABALHO_FORCADO":
      return {
        corpoTexto: `A empresa ${empresaRazaoSocial}, inscrita no CNPJ sob o nº ${empresaCnpj}, por meio de seu representante legal ${representanteNome}, declara para os devidos fins legais, especialmente para atendimento ao Art. 63, inciso IV da Lei Federal nº 14.133/2021 e às Convenções nº 29 e 105 da Organização Internacional do Trabalho (OIT), no âmbito da licitação ${numeroEdital} perante o órgão ${orgaoNome}, que:\n\nNão emprega e não utiliza, sob nenhuma hipótese ou pretexto, trabalho forçado ou degradante, servidão por dívidas ou condições análogas às de escravo em sua cadeia produtiva e de prestação de serviços, assegurando a dignidade da pessoa humana e a estrita observância das normas trabalhistas brasileiras.`,
        corpoHtml: `<p>A empresa <strong>${empresaRazaoSocial}</strong>, inscrita no CNPJ sob o nº <strong>${empresaCnpj}</strong>, por meio de seu representante legal <strong>${representanteNome}</strong>, declara para os devidos fins legais, especialmente para atendimento ao Art. 63, inciso IV da Lei Federal nº 14.133/2021 e às Convenções nº 29 e 105 da Organização Internacional do Trabalho (OIT), no âmbito da licitação <strong>${numeroEdital}</strong> perante o órgão <strong>${orgaoNome}</strong>, que:</p>
<p>Não emprega e não utiliza, sob nenhuma hipótese ou pretexto, trabalho forçado ou degradante, servidão por dívidas ou condições análogas às de escravo em sua cadeia produtiva e de prestação de serviços, assegurando a dignidade da pessoa humana e a estrita observância das normas trabalhistas brasileiras.</p>`,
      };

    case "RENUNCIA_VISTORIA":
      return {
        corpoTexto: `A empresa ${empresaRazaoSocial}, inscrita no CNPJ sob o nº ${empresaCnpj}, participante do certame licitatório ${numeroEdital}, promovido por ${orgaoNome}, por intermédio de seu representante legal, DECLARA, na forma do Art. 67, § 2º da Lei Federal nº 14.133/2021, que:\n\nOpta por NÃO realizar a vistoria técnica prévia e presencial no local de execução dos serviços ou entrega dos bens. Declara ainda que possui pleno conhecimento das condições, peculiaridades, complexidades e dificuldades que envolvem o cumprimento integral do objeto${objetoText}, assumindo integral e exclusivamente os ônus decorrentes dessa opção, renunciando a qualquer direito de reivindicação futura fundada no desconhecimento das condições locais ou de execução.`,
        corpoHtml: `<p>A empresa <strong>${empresaRazaoSocial}</strong>, inscrita no CNPJ sob o nº <strong>${empresaCnpj}</strong>, participante do certame licitatório <strong>${numeroEdital}</strong>, promovido por <strong>${orgaoNome}</strong>, por intermédio de seu representante legal, <strong>DECLARA</strong>, na forma do Art. 67, § 2º da Lei Federal nº 14.133/2021, que:</p>
<p>Opta por <strong>NÃO</strong> realizar a vistoria técnica prévia e presencial no local de execução dos serviços ou entrega dos bens. Declara ainda que possui pleno conhecimento das condições, peculiaridades, complexidades e dificuldades que envolvem o cumprimento integral do objeto${objetoText}, assumindo integral e exclusivamente os ônus decorrentes dessa opção, renunciando a qualquer direito de reivindicação futura fundada no desconhecimento das condições locais ou de execução.</p>`,
      };

    case "HABILITACAO_PLENA":
      return {
        corpoTexto: `A empresa ${empresaRazaoSocial}, inscrita no CNPJ sob o nº ${empresaCnpj}, por meio de seu representante legal infra-assinado, DECLARA expressamente perante o órgão ${orgaoNome}, para fins de habilitação no certame ${numeroEdital}, sob as penas da lei (Art. 63, inciso I da Lei Federal nº 14.133/2021), que cumpre integralmente todos os requisitos e exigências estabelecidos no Edital e seus anexos para a sua regular habilitação jurídica, fiscal, social, trabalhista, qualificação técnica e qualificação econômico-financeira, inexistindo qualquer óbice formal ou fático à contratação com a Administração Pública.`,
        corpoHtml: `<p>A empresa <strong>${empresaRazaoSocial}</strong>, inscrita no CNPJ sob o nº <strong>${empresaCnpj}</strong>, por meio de seu representante legal infra-assinado, <strong>DECLARA</strong> expressamente perante o órgão <strong>${orgaoNome}</strong>, para fins de habilitação no certame <strong>${numeroEdital}</strong>, sob as penas da lei (Art. 63, inciso I da Lei Federal nº 14.133/2021), que cumpre integralmente todos os requisitos e exigências estabelecidos no Edital e seus anexos para a sua regular habilitação jurídica, fiscal, social, trabalhista, qualificação técnica e qualificação econômico-financeira, inexistindo qualquer óbice formal ou fático à contratação com a Administração Pública.</p>`,
      };

    case "ME_EPP":
      return {
        corpoTexto: `A empresa ${empresaRazaoSocial}, inscrita no CNPJ sob o nº ${empresaCnpj}, sediada em ${empresaEndereco || "endereço cadastral"}, por seu representante legal infra-assinado, DECLARA, sob as penas da lei e em cumprimento ao Art. 4º da Lei Federal nº 14.133/2021, que:\n\n1. Enquadra-se na condição de Microempresa (ME) ou Empresa de Pequeno Porte (EPP), nos exatos termos do Art. 3º da Lei Complementar nº 123/2006;\n2. Não se encontra enquadrada em nenhuma das vedações constantes do § 4º do Art. 3º da referida Lei Complementar nº 123/2006;\n3. A receita bruta anual da empresa não excedeu, no ano-calendário anterior, o limite legalmente fixado para o porte empresarial;\n4. Faz jus a todos os benefícios, preferências e tratamentos diferenciados concedidos pela LC 123/2006 e pela Lei 14.133/2021 neste certame (${numeroEdital} perante ${orgaoNome}).`,
        corpoHtml: `<p>A empresa <strong>${empresaRazaoSocial}</strong>, inscrita no CNPJ sob o nº <strong>${empresaCnpj}</strong>, sediada em ${empresaEndereco || "endereço cadastral"}, por seu representante legal infra-assinado, <strong>DECLARA</strong>, sob as penas da lei e em cumprimento ao Art. 4º da Lei Federal nº 14.133/2021, que:</p>
<ol>
  <li>Enquadra-se na condição de Microempresa (ME) ou Empresa de Pequeno Porte (EPP), nos exatos termos do Art. 3º da Lei Complementar nº 123/2006;</li>
  <li>Não se encontra enquadrada em nenhuma das vedações constantes do § 4º do Art. 3º da referida Lei Complementar nº 123/2006;</li>
  <li>A receita bruta anual da empresa não excedeu, no ano-calendário anterior, o limite legalmente fixado para o porte empresarial;</li>
  <li>Faz jus a todos os benefícios, preferências e tratamentos diferenciados concedidos pela LC 123/2006 e pela Lei 14.133/2021 neste certame (<strong>${numeroEdital}</strong> perante <strong>${orgaoNome}</strong>).</li>
</ol>`,
      };

    case "NAO_EMPREGA_MENOR":
      return {
        corpoTexto: `A empresa ${empresaRazaoSocial}, inscrita no CNPJ sob o nº ${empresaCnpj}${enderecoText}, por intermédio de seu representante legal infra-assinado ${representanteNome}, portador(a) do CPF nº ${representanteCpf}, para fins do disposto no inciso VI do Art. 68 da Lei Federal nº 14.133/2021 e no certame licitatório ${numeroEdital} perante ${orgaoNome}, DECLARA expressamente que:\n\nNão emprega menor de dezoito anos em trabalho noturno, perigoso ou insalubre e não emprega menor de dezesseis anos, salvo na condição de aprendiz a partir de quatorze anos, cumprindo integralmente a determinação constitucional do inciso XXXIII do Art. 7º da Constituição da República Federativa do Brasil de 1988.`,
        corpoHtml: `<p>A empresa <strong>${empresaRazaoSocial}</strong>, inscrita no CNPJ sob o nº <strong>${empresaCnpj}</strong>${enderecoText}, por intermédio de seu representante legal infra-assinado <strong>${representanteNome}</strong>, portador(a) do CPF nº <strong>${representanteCpf}</strong>, para fins do disposto no inciso VI do Art. 68 da Lei Federal nº 14.133/2021 e no certame licitatório <strong>${numeroEdital}</strong> perante <strong>${orgaoNome}</strong>, <strong>DECLARA</strong> expressamente que:</p>
<p>Não emprega menor de dezoito anos em trabalho noturno, perigoso ou insalubre e não emprega menor de dezesseis anos, salvo na condição de aprendiz a partir de quatorze anos, cumprindo integralmente a determinação constitucional do inciso XXXIII do Art. 7º da Constituição da República Federativa do Brasil de 1988.</p>`,
      };
  }
}

export async function gerarDeclaracao(
  input: DeclaracaoGerarInput,
  usuarioId?: string | null,
): Promise<DeclaracaoGeradaResponse> {
  const meta = DECLARACAO_METADATA[input.tipo];
  const { corpoHtml, corpoTexto } = gerarTextoEspecifico(input.tipo, input);
  const dataExtenso = formatarDataExtenso(input.dataDeclaracao, input.cidade, input.uf);

  const conteudoHtml = `
<div class="declaracao-a4-documento" style="font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.6; color: #161616; padding: 2.5cm 2.5cm 2.5cm 2.5cm; max-width: 21cm; margin: 0 auto; background: #ffffff; box-sizing: border-box;">
  <header style="border-bottom: 2px solid #161616; padding-bottom: 12px; margin-bottom: 24px; text-align: center;">
    <h2 style="font-size: 14pt; margin: 0; text-transform: uppercase; font-weight: bold; letter-spacing: 0.5px;">${input.empresaRazaoSocial}</h2>
    <p style="font-size: 10pt; margin: 4px 0 0 0; color: #525252;">CNPJ: ${input.empresaCnpj} ${input.empresaEndereco ? `• ${input.empresaEndereco}` : ""}</p>
  </header>

  <div style="margin-bottom: 20px; font-size: 11pt; border-left: 3px solid #0f62fe; padding-left: 12px; background: #f4f4f4; padding: 8px 12px;">
    <div><strong>Órgão Licitante:</strong> ${input.orgaoNome}</div>
    <div><strong>Processo / Edital:</strong> ${input.numeroEdital}</div>
    ${input.objetoLicitacao ? `<div><strong>Objeto:</strong> ${input.objetoLicitacao}</div>` : ""}
  </div>

  <div style="text-align: center; margin: 28px 0 20px 0;">
    <h1 style="font-size: 13pt; margin: 0; text-transform: uppercase; font-weight: bold;">${meta.titulo}</h1>
    <div style="font-size: 10pt; font-style: italic; color: #525252; margin-top: 4px;">Fundamento Legal: ${meta.fundamentoLegal}</div>
  </div>

  <section class="declaracao-corpo" style="text-align: justify; margin-bottom: 40px;">
    ${corpoHtml}
  </section>

  <div style="text-align: right; margin-top: 40px; margin-bottom: 50px; font-size: 11pt;">
    ${dataExtenso}
  </div>

  <div style="text-align: center; margin-top: 60px; page-break-inside: avoid;">
    <div style="display: inline-block; min-width: 350px; border-top: 1px solid #161616; padding-top: 8px;">
      <div style="font-weight: bold; font-size: 11pt;">${input.representanteNome}</div>
      <div style="font-size: 10pt; color: #525252;">${input.representanteCargo}</div>
      <div style="font-size: 9pt; color: #525252;">CPF: ${input.representanteCpf}</div>
      <div style="font-size: 9pt; color: #8d8d8d;">${input.empresaRazaoSocial}</div>
    </div>
  </div>

  <footer style="margin-top: 60px; padding-top: 12px; border-top: 1px dashed #c6c6c6; font-size: 8pt; color: #8d8d8d; display: flex; justify-content: space-between;">
    <span>Emitido via Portal de Licitações (Lei 14.133/2021)</span>
    <span>Integridade do Documento: ${input.tipo} • ${new Date().toISOString().substring(0, 10)}</span>
  </footer>
</div>
`.trim();

  const conteudoTexto = `
${input.empresaRazaoSocial}
CNPJ: ${input.empresaCnpj}

AO: ${input.orgaoNome}
EDITAL: ${input.numeroEdital}
${input.objetoLicitacao ? `OBJETO: ${input.objetoLicitacao}\n` : ""}
${meta.titulo}
(${meta.fundamentoLegal})

${corpoTexto}

${dataExtenso}

___________________________________________
${input.representanteNome}
${input.representanteCargo}
CPF: ${input.representanteCpf}
${input.empresaRazaoSocial}
`.trim();

  // Registro de Auditoria
  await recordAuditLog({
    usuarioId: usuarioId ?? null,
    acao: "DECLARACAO_GERADA",
    entidadeTipo: "DECLARACAO",
    entidadeId: input.tipo,
    depois: {
      tipo: input.tipo,
      numeroEdital: input.numeroEdital,
      orgaoNome: input.orgaoNome,
      empresaCnpj: input.empresaCnpj,
    },
  });

  return {
    ok: true,
    tipo: input.tipo,
    titulo: meta.titulo,
    fundamentoLegal: meta.fundamentoLegal,
    conteudoHtml,
    conteudoTexto,
    dadosPreenchidos: input,
  };
}

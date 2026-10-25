import type { ImpugnacaoItem } from "@/server/schemas/impugnacao.schema";

export function gerarMinutaJuridica(
  impugnacao: ImpugnacaoItem,
  empresa = {
    razaoSocial: "APONTA TECNOLOGIA E SERVICOS LTDA",
    cnpj: "12.345.678/0001-90",
    cidade: "Goiânia",
    uf: "GO",
  },
): { minutaHtml: string; minutaTexto: string } {
  const dataHoje = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const dataAberturaStr = impugnacao.dataAberturaSessao instanceof Date
    ? impugnacao.dataAberturaSessao.toLocaleDateString("pt-BR")
    : new Date(impugnacao.dataAberturaSessao).toLocaleDateString("pt-BR");

  const minutaTexto = `
ILUSTRÍSSIMO(A) SENHOR(A) PREGOEIRO(A) / AGENTE DE CONTRATAÇÃO
${impugnacao.orgaoNome.toUpperCase()}
PROCESSO / EDITAL: ${impugnacao.numeroEdital}
DATA DA SESSÃO PÚBLICA: ${dataAberturaStr}

${empresa.razaoSocial}, pessoa jurídica de direito privado inscrita no CNPJ sob o nº ${empresa.cnpj}, com sede em ${empresa.cidade} - ${empresa.uf}, vem mui respeitosamente, perante Vossa Senhoria, com fulcro no Art. 164 da Lei Federal nº 14.133/2021, interpor a presente

IMPUGNAÇÃO AO EDITAL DE LICITAÇÃO

em face das cláusulas e exigências editalícias a seguir delineadas, pelas razões fáticas e jurídicas que passa a expor:

1. DA TEMPESTIVIDADE
A presente impugnação é tempestiva, visto que apresentada dentro do prazo legal de até 3 (três) dias úteis anteriores à data de abertura da sessão pública, em estrita obediência ao Art. 164 da Lei nº 14.133/2021.

2. DA SÍNTESE DO OBJETO
O presente certame tem por objeto: ${impugnacao.objeto || "Contratação descrita no instrumento convocatório"}.

3. DAS IRREGULARIDADES APONTADAS E DO MOTIVO LEGAL
${impugnacao.motivoLegal}

4. DA FUNDAMENTAÇÃO JURÍDICA E JURISPRUDÊNCIA DO TCU
${impugnacao.fundamentacao}
Conforme remansosa jurisprudência do Tribunal de Contas da União (v.g. Súmula 273/TCU e Acórdãos correlatos), é vedado à Administração incluir exigências que frustrem o caráter competitivo do certame, devendo prevalecer o princípio da isonomia e a busca pela proposta mais vantajosa.

5. DOS PEDIDOS
Ante o exposto, REQUER-SE a Vossa Senhoria:
${impugnacao.pedidos}
Requer-se, ainda, a suspensão do certame até o efetivo julgamento desta impugnação e, caso acatada, a consequente republicação do edital com reabertura de prazos.

Nestes termos,
Pede Deferimento.

${empresa.cidade} - ${empresa.uf}, ${dataHoje}.

___________________________________________________
${empresa.razaoSocial}
CNPJ: ${empresa.cnpj}
`.trim();

  const minutaHtml = `
<div class="minuta-impugnacao" style="font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.6; color: #161616; padding: 2cm; background: #ffffff;">
  <p style="text-align: center; font-weight: bold; margin-bottom: 24px;">
    ILMO(A). SR(A). PREGOEIRO(A) / AGENTE DE CONTRATAÇÃO<br>
    ${impugnacao.orgaoNome.toUpperCase()}<br>
    EDITAL: ${impugnacao.numeroEdital}
  </p>
  <p style="text-align: justify; text-indent: 2cm;">
    <strong>${empresa.razaoSocial}</strong>, inscrita no CNPJ sob o nº ${empresa.cnpj}, vem, com fundamento no Art. 164 da Lei Federal nº 14.133/2021, interpor
  </p>
  <h2 style="text-align: center; font-size: 14pt; margin: 20px 0; font-weight: bold;">IMPUGNAÇÃO AO EDITAL</h2>
  
  <h3 style="font-size: 12pt; font-weight: bold; margin-top: 16px;">1. DA TEMPESTIVIDADE</h3>
  <p style="text-align: justify; text-indent: 2cm;">
    A presente impugnação é manifestamente tempestiva, eis que submetida em prazo superior a 3 (três) dias úteis que antecedem a abertura do certame, nos termos do Art. 164 da Lei nº 14.133/2021.
  </p>

  <h3 style="font-size: 12pt; font-weight: bold; margin-top: 16px;">2. DA IRREGULARIDADE APONTADA</h3>
  <p style="text-align: justify; text-indent: 2cm;">
    ${impugnacao.motivoLegal}
  </p>

  <h3 style="font-size: 12pt; font-weight: bold; margin-top: 16px;">3. DA FUNDAMENTAÇÃO JURÍDICA E SÚMULAS DO TCU</h3>
  <p style="text-align: justify; text-indent: 2cm;">
    ${impugnacao.fundamentacao}
  </p>

  <h3 style="font-size: 12pt; font-weight: bold; margin-top: 16px;">4. DOS PEDIDOS</h3>
  <p style="text-align: justify; text-indent: 2cm;">
    ${impugnacao.pedidos}
  </p>

  <p style="text-align: right; margin-top: 36px;">
    ${empresa.cidade} - ${empresa.uf}, ${dataHoje}.
  </p>
  <div style="text-align: center; margin-top: 48px;">
    <div style="border-top: 1px solid #000; display: inline-block; min-width: 300px; padding-top: 4px;">
      ${empresa.razaoSocial}<br>
      CNPJ: ${empresa.cnpj}
    </div>
  </div>
</div>
`.trim();

  return { minutaHtml, minutaTexto };
}

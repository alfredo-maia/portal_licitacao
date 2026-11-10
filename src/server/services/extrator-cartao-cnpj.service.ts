import {
  cartaoCnpjExtraidoSchema,
  type CartaoCnpjExtraido,
} from "@/server/schemas/cartao-cnpj.schema";
import {
  detectarTipoRealPorBuffer,
  extrairTextoPdf,
} from "./leitor-documentos-certame.service";
import { chamarLlmJsonMultimodal } from "./llm-multimodal.service";

const ROTULOS_RFB_PARADA = [
  "REPÚBLICA FEDERATIVA DO BRASIL",
  "REPUBLICA FEDERATIVA DO BRASIL",
  "CADASTRO NACIONAL DA PESSOA JURÍDICA",
  "CADASTRO NACIONAL DA PESSOA JURIDICA",
  "NÚMERO DE INSCRIÇÃO",
  "NUMERO DE INSCRICAO",
  "COMPROVANTE DE INSCRIÇÃO",
  "COMPROVANTE DE INSCRICAO",
  "DATA DE ABERTURA",
  "NOME EMPRESARIAL",
  "TÍTULO DO ESTABELECIMENTO",
  "TITULO DO ESTABELECIMENTO",
  "PORTE",
  "CÓDIGO E DESCRIÇÃO DA ATIVIDADE ECONÔMICA PRINCIPAL",
  "CODIGO E DESCRICAO DA ATIVIDADE ECONOMICA PRINCIPAL",
  "ATIVIDADE ECONÔMICA PRINCIPAL",
  "ATIVIDADE ECONOMICA PRINCIPAL",
  "CÓDIGO E DESCRIÇÃO DAS ATIVIDADES ECONÔMICAS SECUNDÁRIAS",
  "CODIGO E DESCRICAO DAS ATIVIDADES ECONOMICAS SECUNDARIAS",
  "ATIVIDADES ECONÔMICAS SECUNDÁRIAS",
  "ATIVIDADES ECONOMICAS SECUNDARIAS",
  "CÓDIGO E DESCRIÇÃO DA NATUREZA JURÍDICA",
  "CODIGO E DESCRICAO DA NATUREZA JURIDICA",
  "NATUREZA JURÍDICA",
  "NATUREZA JURIDICA",
  "LOGRADOURO",
  "NÚMERO",
  "NUMERO",
  "COMPLEMENTO",
  "CEP",
  "BAIRRO/DISTRITO",
  "BAIRRO",
  "MUNICÍPIO",
  "MUNICIPIO",
  "UF",
  "ENDEREÇO ELETRÔNICO",
  "ENDERECO ELETRONICO",
  "TELEFONE",
  "ENTE FEDERATIVO RESPONSÁVEL",
  "ENTE FEDERATIVO RESPONSAVEL",
  "SITUAÇÃO CADASTRAL",
  "SITUACAO CADASTRAL",
  "DATA DA SITUAÇÃO CADASTRAL",
  "DATA DA SITUACAO CADASTRAL",
  "MOTIVO DE SITUAÇÃO CADASTRAL",
  "SITUAÇÃO ESPECIAL",
  "DATA DA SITUAÇÃO ESPECIAL",
  "APROVADO PELA INSTRUÇÃO NORMATIVA",
  "EMITIDO NO DIA",
];

function removerAcentos(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function isRotuloRfb(linha: string): boolean {
  const norm = removerAcentos(linha);
  if (!norm) return false;
  return ROTULOS_RFB_PARADA.some(
    (r) => norm === removerAcentos(r) || norm.startsWith(`${removerAcentos(r)}:`),
  );
}

function limparValorRfb(valor?: string | null): string | null {
  if (!valor) return null;
  const limpo = valor.replace(/\s+/g, " ").trim();
  if (
    !limpo ||
    /^\*+$/.test(limpo) ||
    limpo === "-" ||
    /^nao\s+informad[ao]$/i.test(removerAcentos(limpo))
  ) {
    return null;
  }
  return limpo;
}

export function normalizarCep(cep?: string | null): string | null {
  if (!cep) return null;
  const digits = cep.replace(/\D/g, "");
  if (digits.length !== 8) {
    return limparValorRfb(cep);
  }
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export function formatarCnpjPadrao(cnpj?: string | null): string | null {
  if (!cnpj) return null;
  const digits = cnpj.replace(/\D/g, "");
  if (digits.length !== 14) return limparValorRfb(cnpj);
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

/**
 * Converte formatos da Receita Federal como "46.39-7-01 - Descrição" ou "62.01-5-01"
 * para o padrão IBGE usado no Portal ("4639-7/01 - Descrição").
 */
export function normalizarCodigoCnae(raw?: string | null): string | null {
  const valor = limparValorRfb(raw);
  if (!valor) return null;

  const matchComDescricao = valor.match(
    /^(\d{2})\.?(\d{2})[-.]?(\d)[-\/](\d{2})\s*[-–—:]\s*(.+)$/,
  );
  if (matchComDescricao) {
    const [, a, b, c, d, desc] = matchComDescricao;
    return `${a}${b}-${c}/${d} - ${desc.trim()}`;
  }

  const matchApenasCodigo = valor.match(/^(\d{2})\.?(\d{2})[-.]?(\d)[-\/](\d{2})$/);
  if (matchApenasCodigo) {
    const [, a, b, c, d] = matchApenasCodigo;
    return `${a}${b}-${c}/${d}`;
  }

  return valor;
}

function capturarBlocoEntreRotulos(
  linhas: string[],
  padroesInicio: RegExp[],
  maxLinhas = 8,
): string[] {
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    const norm = removerAcentos(linha);
    const match = padroesInicio.some((rx) => rx.test(norm));
    if (!match) continue;

    // Caso o valor esteja na mesma linha após ":"
    const idxDoisPontos = linha.indexOf(":");
    const capturadas: string[] = [];
    if (idxDoisPontos >= 0) {
      const apos = linha.slice(idxDoisPontos + 1).trim();
      if (apos && !isRotuloRfb(apos)) {
        capturadas.push(apos);
      }
    }

    for (let j = i + 1; j < Math.min(linhas.length, i + 1 + maxLinhas); j++) {
      const cand = linhas[j].trim();
      if (!cand) {
        if (capturadas.length > 0) break;
        continue;
      }
      if (isRotuloRfb(cand)) break;
      capturadas.push(cand);
    }

    if (capturadas.length > 0) {
      return capturadas;
    }
  }
  return [];
}

function limparCnaesLista(rawList: Array<string | null | undefined>, principal?: string | null): string[] {
  const principalDigits = principal ? principal.replace(/\D/g, "").slice(0, 7) : "";
  const vistos = new Set<string>();
  const saida: string[] = [];

  for (const raw of rawList) {
    const normalizado = normalizarCodigoCnae(raw);
    if (!normalizado) continue;
    if (/^\d{4}-\d\/\d{2}/.test(normalizado) === false && !/\d/.test(normalizado)) {
      continue;
    }
    const digits = normalizado.replace(/\D/g, "").slice(0, 7);
    if (principalDigits && digits === principalDigits) continue;
    const key = digits || normalizado.toLowerCase();
    if (vistos.has(key)) continue;
    vistos.add(key);
    saida.push(normalizado);
  }

  return saida;
}

/**
 * Parser determinístico (Camada 1) para Cartão CNPJ oficial da Receita Federal do Brasil.
 */
export function extrairDadosCartaoCnpjDeTexto(texto: string): CartaoCnpjExtraido | null {
  if (!texto || !texto.trim()) return null;

  const linhas = texto
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // 1. CNPJ
  let cnpjRaw: string | null = null;
  const blocoInscricao = capturarBlocoEntreRotulos(linhas, [/^NUMERO DE INSCRICAO/], 3);
  for (const item of blocoInscricao) {
    const m = item.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
    if (m) {
      cnpjRaw = m[0];
      break;
    }
  }
  if (!cnpjRaw) {
    const matchGlobalCnpj = texto.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
    if (matchGlobalCnpj) cnpjRaw = matchGlobalCnpj[0];
  }
  const cnpj = formatarCnpjPadrao(cnpjRaw);

  // 2. Razão Social e Nome Fantasia
  const blocoRazao = capturarBlocoEntreRotulos(linhas, [/^NOME EMPRESARIAL/, /^RAZAO SOCIAL/], 3);
  const razaoSocial = limparValorRfb(blocoRazao[0]);

  const blocoFantasia = capturarBlocoEntreRotulos(
    linhas,
    [/^TITULO DO ESTABELECIMENTO/, /^NOME DE FANTASIA/],
    2,
  );
  const nomeFantasia = limparValorRfb(blocoFantasia[0]);

  // 3. CNAE Principal
  const blocoCnaePrincipal = capturarBlocoEntreRotulos(
    linhas,
    [/^(?:CODIGO E DESCRICAO DA )?ATIVIDADE ECONOMICA PRINCIPAL/],
    4,
  );
  const cnaePrincipal = normalizarCodigoCnae(blocoCnaePrincipal[0]);

  // 4. CNAEs Secundários (múltiplas linhas até Natureza Jurídica)
  const blocoCnaesSec = capturarBlocoEntreRotulos(
    linhas,
    [/^(?:CODIGO E DESCRICAO DAS )?ATIVIDADES ECONOMICAS SECUNDARIAS/],
    80,
  );
  // Caso alguma descrição tenha quebrado de linha sem código CNAE, agrupa com a linha anterior
  const cnaesSecAgrupados: string[] = [];
  for (const l of blocoCnaesSec) {
    if (/^\d{2}\.?\d{2}[-.]?\d[-\/]\d{2}/.test(l)) {
      cnaesSecAgrupados.push(l);
    } else if (cnaesSecAgrupados.length > 0 && limparValorRfb(l)) {
      cnaesSecAgrupados[cnaesSecAgrupados.length - 1] += ` ${l.trim()}`;
    }
  }
  const cnaesSecundarios = limparCnaesLista(cnaesSecAgrupados, cnaePrincipal);

  // 5. Endereço (Seção 2)
  const endereco = limparValorRfb(capturarBlocoEntreRotulos(linhas, [/^LOGRADOURO$/], 2)[0]);
  const numero = limparValorRfb(capturarBlocoEntreRotulos(linhas, [/^NUMERO$/], 2)[0]);
  const complemento = limparValorRfb(capturarBlocoEntreRotulos(linhas, [/^COMPLEMENTO$/], 2)[0]);
  const cepRaw = limparValorRfb(capturarBlocoEntreRotulos(linhas, [/^CEP$/], 2)[0]);
  const cep = normalizarCep(cepRaw);
  const bairro = limparValorRfb(capturarBlocoEntreRotulos(linhas, [/^BAIRRO(\/DISTRITO)?$/], 2)[0]);
  const cidade = limparValorRfb(capturarBlocoEntreRotulos(linhas, [/^MUNICIPIO$/], 2)[0]);
  const ufRaw = limparValorRfb(capturarBlocoEntreRotulos(linhas, [/^UF$/], 2)[0]);
  const uf = ufRaw && /^[A-Za-z]{2}$/.test(ufRaw) ? ufRaw.toUpperCase() : null;
  const situacaoCadastral = limparValorRfb(
    capturarBlocoEntreRotulos(linhas, [/^SITUACAO CADASTRAL$/], 2)[0],
  );

  if (!cnpj || !razaoSocial) {
    return null;
  }

  return cartaoCnpjExtraidoSchema.parse({
    cnpj,
    razaoSocial,
    nomeFantasia,
    cnaePrincipal,
    cnaesSecundarios,
    cep,
    endereco,
    numero,
    complemento,
    bairro,
    cidade,
    uf,
    situacaoCadastral,
    origemExtracao: "REGEX_RFB",
  });
}

function camposBasicosCompletos(d: CartaoCnpjExtraido | null): boolean {
  if (!d) return false;
  return Boolean(d.cnpj && d.razaoSocial && d.cnaePrincipal && (d.endereco || d.cidade));
}

/**
 * Extrai dados das Seções 1 e 2 + CNAEs Secundários diretamente de PDF ou imagem (PNG/JPG/WEBP)
 * do Cartão CNPJ oficial, combinando Camada 1 (Parser RFB) e Camada 2 (LLM Multimodal).
 */
export async function extrairDadosCartaoCnpjDeBuffer(params: {
  buffer: Buffer;
  nomeArquivo?: string | null;
  mimeType?: string | null;
}): Promise<CartaoCnpjExtraido> {
  const mimeReal = detectarTipoRealPorBuffer(
    params.buffer,
    params.nomeArquivo,
    params.mimeType,
  );

  let textoPdf = "";
  let parciaisRegex: CartaoCnpjExtraido | null = null;

  if (mimeReal === "application/pdf") {
    try {
      const pdfInfo = await extrairTextoPdf(params.buffer);
      textoPdf = pdfInfo.texto || "";
      parciaisRegex = extrairDadosCartaoCnpjDeTexto(textoPdf);
      if (camposBasicosCompletos(parciaisRegex)) {
        return parciaisRegex!;
      }
    } catch {
      // PDF escaneado ou protegido — cai para LLM Multimodal
    }
  } else if (mimeReal.startsWith("text/")) {
    textoPdf = params.buffer.toString("utf-8");
    parciaisRegex = extrairDadosCartaoCnpjDeTexto(textoPdf);
    if (camposBasicosCompletos(parciaisRegex)) {
      return parciaisRegex!;
    }
  }

  const isMultimodalCompatible =
    mimeReal === "application/pdf" ||
    mimeReal === "image/png" ||
    mimeReal === "image/jpeg" ||
    mimeReal === "image/webp";

  if (isMultimodalCompatible) {
    const llmResp = await chamarLlmJsonMultimodal<{
      cnpj?: string;
      razaoSocial?: string;
      nomeFantasia?: string | null;
      cnaePrincipal?: string | null;
      cnaesSecundarios?: string[];
      cep?: string | null;
      endereco?: string | null;
      numero?: string | null;
      complemento?: string | null;
      bairro?: string | null;
      cidade?: string | null;
      uf?: string | null;
      situacaoCadastral?: string | null;
    }>({
      systemPrompt:
        "Você é um extrator estruturado de documentos fiscais brasileiros. Extraia com fidelidade absoluta todos os campos do Cartão CNPJ (Comprovante de Inscrição e de Situação Cadastral da Receita Federal do Brasil).\n" +
        "Normalize os códigos CNAE para o padrão 'XXXX-X/XX - Descrição' (ex: '46.39-7-01 - Comércio...' -> '4639-7/01 - Comércio...').\n" +
        "Se 'NOME DE FANTASIA' ou 'COMPLEMENTO' constar como '********' ou em branco, retorne null.\n" +
        "Retorne estritamente JSON no formato:\n" +
        "{\n" +
        '  "cnpj": "00.000.000/0000-00",\n' +
        '  "razaoSocial": "RAZAO SOCIAL COMPLETA",\n' +
        '  "nomeFantasia": "string ou null",\n' +
        '  "cnaePrincipal": "XXXX-X/XX - Descrição ou null",\n' +
        '  "cnaesSecundarios": ["XXXX-X/XX - Descrição 1", "XXXX-X/XX - Descrição 2"],\n' +
        '  "cep": "00000-000 ou null",\n' +
        '  "endereco": "Logradouro ou null",\n' +
        '  "numero": "Número ou null",\n' +
        '  "complemento": "string ou null",\n' +
        '  "bairro": "Bairro ou null",\n' +
        '  "cidade": "Município ou null",\n' +
        '  "uf": "XX ou null",\n' +
        '  "situacaoCadastral": "ATIVA ou null"\n' +
        "}",
      userPrompt: textoPdf
        ? `Extraia os dados cadastrais deste Cartão CNPJ. Texto preliminar extraído:\n${textoPdf.slice(0, 12000)}`
        : "Leia visualmente este Cartão CNPJ anexo e extraia todos os campos societários, endereço e todos os CNAEs (principal e secundários).",
      inlineParts: [
        {
          mimeType: mimeReal,
          dataBase64: params.buffer.toString("base64"),
          label: params.nomeArquivo || "cartao-cnpj",
        },
      ],
      temperature: 0.1,
      maxOutputTokens: 4096,
    });

    if (llmResp?.data && (llmResp.data.cnpj || parciaisRegex?.cnpj) && (llmResp.data.razaoSocial || parciaisRegex?.razaoSocial)) {
      const cnaePrincipalFinal =
        normalizarCodigoCnae(llmResp.data.cnaePrincipal) ||
        parciaisRegex?.cnaePrincipal ||
        null;
      const listaBrutaSecundarios = [
        ...(Array.isArray(llmResp.data.cnaesSecundarios) ? llmResp.data.cnaesSecundarios : []),
        ...(parciaisRegex?.cnaesSecundarios || []),
      ];

      return cartaoCnpjExtraidoSchema.parse({
        cnpj: formatarCnpjPadrao(llmResp.data.cnpj) || parciaisRegex!.cnpj,
        razaoSocial:
          limparValorRfb(llmResp.data.razaoSocial) || parciaisRegex!.razaoSocial,
        nomeFantasia:
          limparValorRfb(llmResp.data.nomeFantasia) ??
          parciaisRegex?.nomeFantasia ??
          null,
        cnaePrincipal: cnaePrincipalFinal,
        cnaesSecundarios: limparCnaesLista(listaBrutaSecundarios, cnaePrincipalFinal),
        cep: normalizarCep(llmResp.data.cep) ?? parciaisRegex?.cep ?? null,
        endereco: limparValorRfb(llmResp.data.endereco) ?? parciaisRegex?.endereco ?? null,
        numero: limparValorRfb(llmResp.data.numero) ?? parciaisRegex?.numero ?? null,
        complemento:
          limparValorRfb(llmResp.data.complemento) ?? parciaisRegex?.complemento ?? null,
        bairro: limparValorRfb(llmResp.data.bairro) ?? parciaisRegex?.bairro ?? null,
        cidade: limparValorRfb(llmResp.data.cidade) ?? parciaisRegex?.cidade ?? null,
        uf:
          limparValorRfb(llmResp.data.uf)?.toUpperCase().slice(0, 2) ??
          parciaisRegex?.uf ??
          null,
        situacaoCadastral:
          limparValorRfb(llmResp.data.situacaoCadastral) ??
          parciaisRegex?.situacaoCadastral ??
          null,
        origemExtracao: parciaisRegex ? "HIBRIDO" : "LLM_MULTIMODAL",
      });
    }
  }

  if (parciaisRegex) {
    return parciaisRegex;
  }

  throw new Error(
    "Não foi possível extrair os dados cadastrais do Cartão CNPJ enviado. Verifique se o arquivo é o comprovante oficial da Receita Federal em PDF ou imagem legível.",
  );
}

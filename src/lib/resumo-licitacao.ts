/**
 * Utilitário para higienização e síntese descritiva de títulos/mini-resumos de licitações públicas.
 * Suporta o Motor Duplo (Prioridade 1: IA em lote; Prioridade 2: Heurística Determinística V2 sem cortes).
 */

const STOP_PREFIXES: RegExp[] = [
  /^\s*\[.*?\]\s*[-–—:]*\s*/i,
  /^\s*\((?:portal|sistema|comprasnet|bnc|bll|licitanet|pncp)[^)]*\)\s*[-–—:]*\s*/i,
  /^\s*(?:preg[ãa]o\s+eletr[ôo]nico|concorr[êe]ncia\s+eletr[ôo]nica|dispensa(?:\s+eletr[ôo]nica)?|inexigibilidade|chamamento\s+p[úu]blico)\s*(?:n[.º°o]?\s*[\d\/.-]+)?[^,;-]*[,;-]\s*/i,
  /^\s*(?:visando\s+(?:a|à)|objetivando\s+(?:a|à)|tendo\s+por\s+objeto\s+(?:a|o)?)\s+/i,
  /^\s*constitui\s+objeto\s+(?:da|do|desta|deste)?\s*(?:presente\s+)?licita[çc][ãa]o\s*(?:a|o)?\s*/i,
  /^\s*o\s+objeto\s+(?:da|do|desta|deste)?\s*(?:presente\s+)?licita[çc][ãa]o\s+[ée]\s*(?:a|o)?\s*/i,
  /^\s*sele[çc][ãa]o\s+(?:de\s+proposta\s+mais\s+vantajosa\s+para\s*(?:a|o)?|de\s+empresa(?:\s+(?:especializada|qualificada|t[ée]cnica))?\s+(?:para|visando)\s*(?:a|o)?)\s*/i,
  /^\s*(?:pelo\s+|atrav[ée]s\s+do\s+|mediante\s+)?sistema\s+de\s+registro\s+de\s+pre[çc]os?\s*(?:para|visando)?[^,;-]*[,;-]?\s*/i,
  /^\s*(?:eventual\s+e\s+futura|futura\s+e\s+eventual|futura|eventual)?\s*registro\s+de\s+pre[çc]os?\s+(?:para\s+|visando\s+(?:a\s+)?)?(?:futura\s+e\s+eventual\s+|eventual\s+e\s+futura\s+|eventual\s+|futura\s+)?/i,
  /^\s*(?:futura\s+e\s+eventual\s+|eventual\s+e\s+futura\s+|eventual\s+|futura\s+)?contrata[çc][ãa]o(?:,?\s*mediante\s+sistema\s+de\s+registro\s+de\s+pre[çc]os?,?)?\s+(?:de\s+|para\s+)?/i,
  /^\s*pessoa\s+jur[íi]dica\s+(?:especializada\s+|qualificada\s+)?(?:para|na|no|em)\s+(?:a\s+|o\s+)?/i,
  /^\s*empresa\s+(?:de\s+engenharia\s+|t[ée]cnica\s+|especializada\s+|qualificada\s+|capacitada\s+)?(?:para|na|no|em|visando)\s+(?:a\s+|o\s+)?/i,
  /^\s*empresa\s+(?:de|em)\s+/i,
  /^\s*(?:futura\s+e\s+eventual\s+|eventual\s+)?aquisi[çc][ãa]o\s+de\s+(?:\d+\s+)?(?:\([a-z0-9\s]+\)\s+)?(?:solu[çc][õo]es?\s+tecnol[óo]gicas?\s+integradas?\s+)?(?:destinadas?\s+ao?\s+)?/i,
  /^\s*(?:para\s+(?:a|o)\s+|na\s+|no\s+)?presta[çc][ãa]o\s+de\s+servi[çc]os?\s+(?:t[ée]cnicos?\s+)?(?:especializados?\s+)?(?:de\s+|em\s+|para\s+|na\s+|no\s+)?/i,
  /^\s*servi[çc]os?\s+(?:t[ée]cnicos?\s+)?(?:especializados?\s+)?de\s+/i,
  /^\s*(?:para\s+(?:a|o)\s+)?fornecimento\s+(?:parcelado\s+|cont[íi]nuo\s+)?(?:de\s+)?/i,
  /^\s*implanta[çc][ãa]o\s+(?:e\s+suporte\s+)?de\s+/i,
  /^\s*(?:a|o|os|as)\s+(?=[a-záéíóúãõç]{4,})/i,
  /^\s*[-–—:,]+\s*/,
];

const STOPWORDS_CONECTIVAS = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "para",
  "em",
  "com",
  "e",
  "a",
  "o",
  "as",
  "os",
  "por",
  "na",
  "no",
  "nas",
  "nos",
  "ao",
  "aos",
  "à",
  "às",
  "sob",
]);

const SIGLAS_PRESERVADAS = new Map<string, string>([
  ["ti", "TI"],
  ["rh", "RH"],
  ["bi", "BI"],
  ["erp", "ERP"],
  ["saas", "SaaS"],
  ["vr", "VR"],
  ["pncp", "PNCP"],
  ["suas", "SUAS"],
  ["sus", "SUS"],
  ["e-sus", "e-SUS"],
  ["nfs-e", "NFS-e"],
  ["iptu", "IPTU"],
  ["issqn", "ISSQN"],
  ["rpps", "RPPS"],
  ["led", "LED"],
  ["cftv", "CFTV"],
  ["ubs", "UBS"],
  ["upa", "UPA"],
  ["epi", "EPI"],
  ["epis", "EPIs"],
  ["me/epp", "ME/EPP"],
  ["arla", "ARLA"],
  ["gps", "GPS"],
  ["pnae", "PNAE"],
  ["lgpd", "LGPD"],
]);

const PALAVRAS_CURTAS_VALIDAS = new Set([
  "ti",
  "rh",
  "bi",
  "vr",
  "pc",
  "ar",
  "sal",
  "pao",
  "pão",
  "gas",
  "gás",
  "kit",
  "luz",
  "sol",
  "som",
  "web",
  "app",
  "pix",
  "xml",
  "pdf",
  "doc",
  "sus",
  "cnh",
  "cpf",
  "mei",
  "ubs",
  "upa",
  "led",
  "erp",
  "gps",
  "32",
]);

/**
 * Identifica títulos cortados abruptamente no meio de palavra (ex.: "Elaboração de P",
 * "Revisão do Pl", "Empresa Esp", "Empresa Par", "Execução de C") ou prefixos vazios.
 */
export function pareceTituloTruncadoOuPobre(titulo?: string | null): boolean {
  if (!titulo || typeof titulo !== "string") return true;
  const trimmed = titulo.trim();
  if (trimmed.length < 10) return true;

  if (
    /^(?:empresa(?:\s+(?:esp|par|qualificada|especializada|t[ée]cnica|de\s+engenharia))?(?:\s+para(?:\s+(?:o|a))?\s*(?:fornecimento|execu[çc][ãa]o)?)?|contrata[çc][ãa]o(?:\s+de\s+empresa)?|sele[çc][ãa]o\s+de)\s*$/i.test(
      trimmed,
    )
  ) {
    return true;
  }

  if (
    /^empresa\s+(?:esp|par|qualificada\s+para\s+o\s+fornecimento|especializada\s+para|de\s+engenharia\s+para)/i.test(
      trimmed,
    )
  ) {
    return true;
  }

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;

  const last = tokens[tokens.length - 1];
  const lastLower = last.toLowerCase().replace(/[.,;:!?]+$/, "");

  if (STOPWORDS_CONECTIVAS.has(lastLower)) {
    return true;
  }

  // Detecta corte óbvio no meio da palavra (ex.: "P", "Pl", "Esp", "Par", "C", "Elab", "Aquis")
  if (/^[a-zA-ZÀ-ÿ]$/.test(last)) {
    return true;
  }
  if (
    /^(?:pl|pr|sp|esp|par|contr|elab|exec|fornec|aquis|serv|sis|manut|impl|equip|mater)$/i.test(
      lastLower,
    ) &&
    !PALAVRAS_CURTAS_VALIDAS.has(lastLower)
  ) {
    return true;
  }

  if (lastLower.length <= 2 && !PALAVRAS_CURTAS_VALIDAS.has(lastLower) && !/^\d+$/.test(lastLower)) {
    return true;
  }

  return false;
}

export function limparTextoObjetoLicitacao(objetoRaw: string): string {
  let texto = String(objetoRaw || "")
    .replace(/\[.*?\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  texto = texto.replace(/^[-–—:]+/, "").trim();

  let modificado = true;
  let iteracoes = 0;
  while (modificado && iteracoes < 8) {
    modificado = false;
    iteracoes += 1;
    for (const pat of STOP_PREFIXES) {
      const novo = texto.replace(pat, "").trim();
      if (novo !== texto && novo.length >= 8) {
        texto = novo.replace(/^[-–—:,\s]+/, "").trim();
        modificado = true;
      }
    }
  }

  // Remove parênteses técnicos acessórios ou prefixos residuais
  texto = texto.replace(/^\([A-Z0-9\-_/ ]+\)\s*[-–—:]*/i, "");
  texto = texto.replace(/\((?:c[óo]d|item|lote|anexo|processo)[^)]*\)/gi, " ");
  texto = texto.replace(/[(),;:.]+/g, " ");
  texto = texto.replace(/\s+/g, " ").trim();
  return texto;
}

function formatarPalavraTitulo(palavra: string, idx: number): string {
  const lower = palavra.toLowerCase();
  if (SIGLAS_PRESERVADAS.has(lower)) {
    return SIGLAS_PRESERVADAS.get(lower)!;
  }
  if (idx > 0 && STOPWORDS_CONECTIVAS.has(lower)) {
    return lower;
  }
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Heurística V2 (Prioridade 2): gera título claro respeitando limite por palavra inteira
 * (~78 chars / até 12 palavras), sem jamais cortar palavras ao meio ou deixar preposições órfãs.
 */
export function sintetizarMiniResumo(
  objetoRaw?: string | null,
  tipoSistema?: string | null,
): string {
  if (!objetoRaw || typeof objetoRaw !== "string" || !objetoRaw.trim()) {
    if (tipoSistema && tipoSistema !== "OUTROS") {
      const tipoNome = tipoSistema.replace(/_/g, " ").toLowerCase();
      return `Sistema de ${tipoNome}`;
    }
    return "Licitação de Tecnologia";
  }

  const rawLower = objetoRaw.toLowerCase();

  // 1. Dicionário Semântico de Alta Precisão (TI/Software + compatibilidade retroativa)
  if (rawLower.includes("endpoints") || rawLower.includes("gerenciamento unificado de ativos")) {
    return "Gerenciamento unificado de ativos (endpoints) de TI";
  }
  if (rawLower.includes("realidade virtual") || rawLower.includes("planetário") || rawLower.includes("planetario")) {
    return "Solução de realidade virtual (VR) e simulação astronômica";
  }
  if (rawLower.includes("oracle") || rawLower.includes("banco de dados oracle")) {
    return "Licenciamento de banco de dados corporativo e suporte (Oracle)";
  }
  if (rawLower.includes("google workspace")) {
    return "Subscrição SaaS corporativa Google Workspace em nuvem";
  }
  if (rawLower.includes("atlassian") || rawLower.includes("jira") || rawLower.includes("trello")) {
    return "Licenciamento e subscrição SaaS ecossistema Atlassian (Jira/Trello)";
  }
  if (rawLower.includes("autocad") || rawLower.includes("autodesk") || rawLower.includes("coreldraw") || rawLower.includes("adobe") || rawLower.includes("design visual")) {
    return "Licenciamento de softwares técnicos e design visual";
  }
  if (rawLower.includes("vmware") || (rawLower.includes("virtualização") && rawLower.includes("servidores"))) {
    return "Licenciamento de software de virtualização de servidores (VMware)";
  }
  if (rawLower.includes("portal de governança") || rawLower.includes("gestão de reuniões") || rawLower.includes("colegiados")) {
    return "SaaS de portal de governança corporativa e colegiados";
  }
  if (rawLower.includes("portal institucional")) {
    return "Licenciamento e sustentação de portal institucional em nuvem";
  }
  if (rawLower.includes("cibersegurança") || rawLower.includes("ngfw") || (rawLower.includes("segurança da informação") && rawLower.includes("firewall"))) {
    return "Solução integrada de cibersegurança e proteção de rede";
  }
  if (rawLower.includes("inteligência artificial generativa") || rawLower.includes("ia generativa") || rawLower.includes("plataformas de inteligência artificial")) {
    return "SaaS de acesso a plataformas de Inteligência Artificial";
  }
  if (rawLower.includes("gerenciamento de senhas") || rawLower.includes("painel de senhas") || (rawLower.includes("senhas") && rawLower.includes("autoatendimento"))) {
    return "Sistema de atendimento, gerenciamento e triagem de senhas";
  }
  if (rawLower.includes("regulação e despacho") || rawLower.includes("regulacao e despacho") || rawLower.includes("regulação médica") || rawLower.includes("regulacao medica")) {
    return "Sistema integrado SaaS de regulação médica e despacho";
  }
  if (
    rawLower.includes("assistência social") ||
    rawLower.includes("assistencia social") ||
    ((rawLower.includes("social") || /\bcras\b/i.test(objetoRaw) || /\bcreas\b/i.test(objetoRaw)) && (rawLower.includes("suas") || rawLower.includes("vulnerabilidade")))
  ) {
    const mod = rawLower.includes("saas") ? "SaaS" : "Software";
    return `${mod} de gestão da assistência social (SUAS)`;
  }

  // 2. ERP e Gestão Pública Municipal Integrada
  if (
    rawLower.includes("gestão pública") ||
    rawLower.includes("gestao publica") ||
    rawLower.includes("erp municipal") ||
    (rawLower.includes("sistema integrado") && rawLower.includes("prefeitura")) ||
    (rawLower.includes("erp") && rawLower.includes("prefeitura"))
  ) {
    if (rawLower.includes("loca") || rawLower.includes("locação") || rawLower.includes("locacao")) {
      return "Locação de sistema de gestão pública para prefeitura e secretarias";
    }
    if (rawLower.includes("saas") || rawLower.includes("nuvem")) {
      return "SaaS de gestão pública municipal integrada (ERP)";
    }
    return "Sistema de gestão pública municipal integrada (ERP)";
  }

  // 3. Softwares de Áreas Específicas
  if (rawLower.includes("folha de pagamento") || (rawLower.includes("recursos humanos") && rawLower.includes("sistema") && rawLower.includes("contracheque"))) {
    return "Sistema web de gestão de folha de pagamento e RH";
  }
  if (rawLower.includes("prontuário eletrônico") || rawLower.includes("e-sus") || rawLower.includes("atenção primária") || rawLower.includes("bi em saúde")) {
    return "Sistema de prontuário eletrônico em saúde integrado ao e-SUS";
  }
  if (rawLower.includes("gestão hospitalar") || (rawLower.includes("hospital") && rawLower.includes("leitos"))) {
    return "Sistema de gestão hospitalar integrado e regulação de leitos";
  }
  if (
    rawLower.includes("processos judiciais") ||
    rawLower.includes("processo eletrônico") ||
    rawLower.includes("processos administrativos") ||
    rawLower.includes("1doc") ||
    rawLower.includes("processo digital") ||
    rawLower.includes("gestão eletrônica de documentos")
  ) {
    return "Sistema de processo administrativo eletrônico e gestão documental";
  }
  if (
    rawLower.includes("gestão escolar") ||
    rawLower.includes("portal do aluno") ||
    rawLower.includes("diário eletrônico") ||
    rawLower.includes("escola do legislativo") ||
    rawLower.includes("trilhas de aprendizagem") ||
    rawLower.includes("rede municipal de ensino") ||
    (rawLower.includes("educação") && (rawLower.includes("matrícula") || rawLower.includes("censo escolar") || rawLower.includes("ensino") || rawLower.includes("educacional")))
  ) {
    return "Plataforma de gestão escolar, diário eletrônico e educação digital";
  }
  if (
    rawLower.includes("receitas públicas") ||
    rawLower.includes("auditoria de receitas") ||
    rawLower.includes("tributário") ||
    rawLower.includes("tributos") ||
    rawLower.includes("arrecadação") ||
    rawLower.includes("iptu") ||
    rawLower.includes("nfs-e") ||
    rawLower.includes("issqn")
  ) {
    return "Sistema de gestão tributária municipal, IPTU e NFS-e";
  }
  if (rawLower.includes("previdência") || /\brpps\b/i.test(objetoRaw)) {
    return "Sistema integrado de gestão previdenciária municipal (RPPS)";
  }
  if (rawLower.includes("diário oficial") || rawLower.includes("portal da transparência") || rawLower.includes("transparência pública")) {
    return "Portal da transparência e publicação de diário oficial eletrônico";
  }
  if (
    (rawLower.includes("telemetria") ||
      rawLower.includes("rastreamento") ||
      ((rawLower.includes("sistema") || rawLower.includes("software") || rawLower.includes("informatizado")) &&
        (rawLower.includes("frota") || rawLower.includes("abastecimento")))) &&
    !rawLower.includes("óleo") &&
    !rawLower.includes("oleo") &&
    !rawLower.includes("lubrificante") &&
    !rawLower.includes("pneu")
  ) {
    return "Sistema informatizado de gestão, rastreamento e telemetria de frota";
  }
  if (rawLower.includes("saneamento") && (rawLower.includes("faturamento") || rawLower.includes("comercial") || rawLower.includes("água") || rawLower.includes("esgoto"))) {
    return "Sistema de gestão comercial e faturamento de saneamento básico";
  }
  if (rawLower.includes("datacenter") || rawLower.includes("data center") || rawLower.includes("nuvem privada") || rawLower.includes("sala segura")) {
    return "Expansão de infraestrutura de datacenter corporativo e nuvem";
  }
  if (rawLower.includes("microsoft") || rawLower.includes("windows server") || rawLower.includes("office 365") || /\bm365\b/i.test(objetoRaw)) {
    return "Licenciamento corporativo de softwares e subscrições Microsoft";
  }
  if (
    rawLower.includes("fábrica de software") ||
    rawLower.includes("desenvolvimento de software") ||
    /\bust\b/i.test(objetoRaw) ||
    rawLower.includes("pontos de função") ||
    rawLower.includes("soluções digitais") ||
    rawLower.includes("solucoes digitais")
  ) {
    return "Fábrica de software, sustentação e desenvolvimento sob medida";
  }
  if (rawLower.includes("software como serviço") || rawLower.includes("saas")) {
    return "SaaS e solução tecnológica integrada em nuvem";
  }
  if (rawLower.includes("seicom")) {
    return "Licenciamento de software e subscrições para comunicação";
  }
  if (rawLower.includes("licença de uso") || rawLower.includes("licenciamento")) {
    return "Licenciamento corporativo e subscrição de softwares";
  }

  // 4. Heurística V2 Multissegmento (corte exclusivo em fronteira de palavra completa)
  const textoLimpo = limparTextoObjetoLicitacao(objetoRaw);
  const palavras = textoLimpo.split(" ").filter(Boolean);

  if (palavras.length >= 2) {
    const MAX_CHARS = 78;
    const MAX_PALAVRAS = 12;
    const selecionadas: string[] = [];
    let chars = 0;

    for (const palavra of palavras) {
      if (selecionadas.length >= MAX_PALAVRAS) break;
      const próximoTamanho = chars === 0 ? palavra.length : chars + 1 + palavra.length;
      if (selecionadas.length >= 3 && próximoTamanho > MAX_CHARS) {
        break;
      }
      selecionadas.push(palavra);
      chars = próximoTamanho;
    }

    while (
      selecionadas.length > 2 &&
      STOPWORDS_CONECTIVAS.has(selecionadas[selecionadas.length - 1].toLowerCase())
    ) {
      selecionadas.pop();
    }

    const formatadas = selecionadas.map((w, idx) => formatarPalavraTitulo(w, idx));
    const candidato = formatadas.join(" ");
    if (candidato.length >= 8) {
      return candidato;
    }
  }

  if (palavras.length === 1 && palavras[0].length > 2) {
    return formatarPalavraTitulo(palavras[0], 0);
  }

  if (tipoSistema && tipoSistema !== "OUTROS") {
    const tipoNome = tipoSistema.replace(/_/g, " ").toLowerCase();
    return `Aquisição e Serviços de ${tipoNome}`;
  }

  return "Aquisição e Contratação Pública";
}

export const sintetizarTituloHeuristicoV2 = sintetizarMiniResumo;

/**
 * Escolhe o melhor título para exibição/edição: se `miniResumo` salvo no banco for pobre ou
 * truncado (ex.: "Empresa Esp", "Revisão do Pl") e existir `resumoFallback` mais completo,
 * reconstrói via Heurística V2 sem truncamento.
 */
export function resolverTituloExibicaoLicitacao(
  miniResumo?: string | null,
  resumoFallback?: string | null,
  tipoSistema?: string | null,
): string {
  const mini = (miniResumo || "").replace(/\[.*?\]\s*[-–—:]?\s*/g, "").trim();
  const full = (resumoFallback || "").trim();

  if (mini && !pareceTituloTruncadoOuPobre(mini)) {
    return mini;
  }

  if (full && (!mini || full.length > mini.length)) {
    return sintetizarMiniResumo(full, tipoSistema);
  }

  return sintetizarMiniResumo(mini || full, tipoSistema);
}

/**
 * Utilitário para higienização e síntese descritiva de mini-resumos de licitações públicas de TI/Software.
 * Gera um resumo objetivo do produto/serviço ofertado (ex.: "SaaS de gestão da assistência social (SUAS)",
 * "Locação de sistema de gestão pública para prefeitura e secretarias", "Gerenciamento unificado de ativos (endpoints) de TI").
 */

const STOP_PREFIXES: RegExp[] = [
  /^\s*\[.*?\]\s*[-–—:]*\s*/i,
  /^\s*\(.*?\)\s*[-–—:]*\s*/i,
  /^\s*(?:preg[ãa]o\s+eletr[ôo]nico|concorr[êe]ncia\s+eletr[ôo]nica|dispensa|inexigibilidade)[^,;-]*[,;-]\s*/i,
  /^\s*contrata[çc][ãa]o(?:,?\s*mediante\s+sistema\s+de\s+registro\s+de\s+pre[çc]os?,?)?\s*(?:de\s+|para\s+)?/i,
  /^\s*(?:pelo\s+|atrav[ée]s\s+do\s+|mediante\s+)?sistema\s+de\s+registro\s+de\s+pre[çc]os?[^,;-]*[,;-]?\s*/i,
  /^\s*registro\s+de\s+pre[çc]os?\s+(?:para\s+)?(?:futura\s+e\s+eventual\s+|eventual\s+e\s+futura\s+|eventual\s+|futura\s+)?(?:aquisi[çc][ãa]o|contrata[çc][ãa]o|fornecimento|loca[çc][ãa]o)?\s*(?:de\s+)?/i,
  /^\s*(?:visando\s+a\s+|objetivando\s+a\s+)?(?:eventual\s+)?contrata[çc][ãa]o\s+de\s+empresa\s+(?:especializada\s+)?(?:para\s+|na\s+|em\s+)?(?:a\s+)?/i,
  /^\s*contrata[çc][ãa]o\s+de\s+pessoa\s+jur[íi]dica\s+(?:para\s+|na\s+|em\s+)?/i,
  /^\s*contrata[çc][ãa]o\s+de\s+empresa\s+/i,
  /^\s*contrata[çc][ãa]o\s+de\s+/i,
  /^\s*(?:eventual\s+)?aquisi[çc][ãa]o\s+de\s+(?:\d+\s+)?(?:\([a-z0-9\s]+\)\s+)?(?:solu[çc][õo]es?\s+tecnol[óo]gicas?\s+integradas?\s+)?(?:destinadas?\s+ao?\s+)?/i,
  /^\s*(?:para\s+a?\s*|na?\s*)?presta[çc][ãa]o\s+de\s+servi[çc]os?\s+(?:t[ée]cnicos?\s+)?(?:especializados?\s+)?(?:de\s+|em\s+|para\s+)?/i,
  /^\s*presta[çc][ãa]o\s+de\s+servi[çc]os?\s+(?:de\s+|em\s+|para\s+)?/i,
  /^\s*servi[çc]os?\s+(?:t[ée]cnicos?\s+)?(?:especializados?\s+)?de\s+/i,
  /^\s*(?:para\s+a?\s*)?fornecimento\s+de\s+/i,
  /^\s*implanta[çc][ãa]o\s+(?:e\s+suporte\s+)?de\s+/i,
  /^\s*constitui\s+objeto\s+(?:da|do|desta|deste)?\s*(?:presente\s+)?licita[çc][ãa]o\s*(?:a\s+|o\s+)?/i,
  /^\s*o\s+objeto\s+(?:da|do|desta|deste)?\s*(?:presente\s+)?licita[çc][ãa]o\s+[ée]\s*(?:a\s+|o\s+)?/i,
  /^\s*sele[çc][ãa]o\s+de\s+proposta\s+mais\s+vantajosa\s+para\s*/i,
  /^\s*[-–—:]+\s*/,
];

const STOPWORDS_CONECTIVAS = new Set([
  "de", "da", "do", "das", "dos",
  "para", "em", "com", "e", "a",
  "o", "por", "na", "no", "nas", "nos"
]);

export function sintetizarMiniResumo(
  objetoRaw?: string | null,
  tipoSistema?: string | null
): string {
  if (!objetoRaw || typeof objetoRaw !== "string") {
    if (tipoSistema && tipoSistema !== "OUTROS") {
      const tipoNome = tipoSistema.replace(/_/g, " ").toLowerCase();
      return `Sistema de ${tipoNome}`;
    }
    return "Licitação de Tecnologia";
  }

  const rawLower = objetoRaw.toLowerCase();

  // 1. Dicionário Semântico de Alta Precisão (Baseado no histórico do AV-8 e padrões de mercado)
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
  if (rawLower.includes("frota") || rawLower.includes("abastecimento") || rawLower.includes("telemetria") || rawLower.includes("rastreamento")) {
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

  // 2. Fallback Inteligente: Higienização de Bordões e Extração da Frase Descritiva
  let texto = objetoRaw.replace(/\[.*?\]/g, "").trim();
  texto = texto.replace(/^[-–—:]+/, "").trim();

  let modificado = true;
  let iteracoes = 0;
  while (modificado && iteracoes < 6) {
    modificado = false;
    iteracoes += 1;
    for (const pat of STOP_PREFIXES) {
      const novo = texto.replace(pat, "").trim();
      if (novo !== texto) {
        texto = novo.replace(/^[-–—:,\s]+/, "").trim();
        modificado = true;
      }
    }
  }

  // Remove parênteses soltos e normaliza pontuações internas
  texto = texto.replace(/^\([A-Z0-9\-_/ ]+\)\s*[-–—:]*/i, "");
  texto = texto.replace(/\([A-Z0-9\-_/ ]+\)/g, "");
  texto = texto.replace(/[(),;:.\-]+/g, " ");
  texto = texto.replace(/\s+/g, " ").trim();

  const palavras = texto.split(" ").filter(Boolean);
  if (palavras.length >= 3) {
    const maxP = Math.min(9, palavras.length);
    const selecionadas = palavras.slice(0, maxP);

    while (
      selecionadas.length > 4 &&
      STOPWORDS_CONECTIVAS.has(selecionadas[selecionadas.length - 1].toLowerCase())
    ) {
      selecionadas.pop();
    }

    const formatadas = selecionadas.map((w, idx) => {
      const lower = w.toLowerCase();
      if (idx > 0 && STOPWORDS_CONECTIVAS.has(lower)) {
        return lower;
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    });

    return formatadas.join(" ");
  }

  if (tipoSistema && tipoSistema !== "OUTROS") {
    const tipoNome = tipoSistema.replace(/_/g, " ").toLowerCase();
    return `Sistema de ${tipoNome}`;
  }

  return "Solução de Tecnologia da Informação e Software";
}

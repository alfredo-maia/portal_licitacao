import { z } from "zod";

/**
 * Taxonomia Oficial de 2 Níveis — Árvore Conlicitação (Issue #35):
 * 40 macro-categorias (segmentos) e 188 subatividades (subsegmentos).
 * Os códigos de subatividade (4 dígitos) são os códigos oficiais da referência.
 */
export const MacroSegmentoEnum = z.enum([
  "AGROPECUARIO",
  "ALIMENTACAO",
  "ARMAZENAGEM",
  "ASSESSORIAS",
  "CARTOES",
  "COMBUSTIVEIS",
  "COMUNICACAO_IDENTIFICACAO_VISUAL",
  "CONCESSOES_EXPLORACAO_IMOVEL",
  "CONFECCOES_DECORACAO",
  "DIDATICO",
  "ELETRO_ELETRONICOS_OTICA",
  "EMBALAGENS_E_LACRES",
  "ENGENHARIA_MATERIAIS",
  "ENGENHARIA_SERVICOS",
  "EQUIPAMENTOS_FERRAMENTAS",
  "ESCRITORIO_E_GRAFICA",
  "ESPECIALIZADOS",
  "ESPORTIVOS_MUSICAIS",
  "EVENTOS",
  "FERROVIARIOS",
  "FUNERARIA",
  "HOSPEDAGEM",
  "INFANTIL_PLAYGROUND",
  "INFORMATICA",
  "INSTALACOES",
  "LEILOES",
  "MOBILIARIOS",
  "PASSAGENS",
  "PETROBRAS",
  "PRESTACAO_DE_SERVICOS_MAO_DE_OBRA",
  "PRODUTOS_DE_LIMPEZA",
  "PUBLICIDADE",
  "QUIMICOS",
  "SAUDE",
  "SEGURANCA_PROTECAO",
  "SEGUROS",
  "SISTEMA_DE_VALES",
  "TRANSPORTES_AEREOS",
  "TRANSPORTES_NAUTICOS",
  "TRANSPORTES_RODOVIARIOS",
]);

export type MacroSegmento = z.infer<typeof MacroSegmentoEnum>;

export interface SubcategoriaDef {
  codigo: string;
  nome: string;
  palavrasChave: string[];
}

export interface MacroSegmentoDef {
  codigo: MacroSegmento;
  nome: string;
  descricao: string;
  subcategorias: SubcategoriaDef[];
}

export const CATALOGO_MACRO_SEGMENTOS: Record<MacroSegmento, MacroSegmentoDef> = {
  AGROPECUARIO: {
    codigo: "AGROPECUARIO",
    nome: "Agropecuário",
    descricao: "Conlicitação: Veterinária e vacinas; Rações para animais; Animais",
    subcategorias: [
      {
        codigo: "2301",
        nome: "Veterinária e vacinas",
        palavrasChave: ["veterinaria", "medicamento veterinario", "vacina animal", "vacina antirrabica", "insumo veterinario", "castracao animal", "clinica veterinaria", "zoonoses"],
      },
      {
        codigo: "2302",
        nome: "Rações para animais",
        palavrasChave: ["racao animal", "racoes para animais", "racao canina", "racao felina", "racao bovina", "racao equina", "sal mineral", "forragem", "silagem", "farelo de soja"],
      },
      {
        codigo: "2303",
        nome: "Animais",
        palavrasChave: ["aquisicao de animais", "semoventes", "bovinos", "equinos", "ovinos", "suinos", "alevinos", "matrizes reprodutoras", "caes farejadores"],
      },
      {
        codigo: "2304",
        nome: "Mudas, sementes e outros produtos agrícolas",
        palavrasChave: ["mudas", "sementes", "sementes agricolas", "mudas nativas", "mudas frutiferas", "adubo", "fertilizante", "calcario agricola", "substrato vegetal", "insumos agricolas"],
      },
      {
        codigo: "2305",
        nome: "Inseticida, herbicida e outros",
        palavrasChave: ["inseticida", "herbicida", "fungicida", "defensivo agricola", "agrotoxico", "larvicida", "raticida", "praguicida", "controle de pragas agricolas", "formicida"],
      },
    ],
  },
  ALIMENTACAO: {
    codigo: "ALIMENTACAO",
    nome: "Alimentação",
    descricao: "Conlicitação: Gêneros alimentícios; Cesta básica; Fornecimento de alimentação",
    subcategorias: [
      {
        codigo: "2501",
        nome: "Gêneros alimentícios",
        palavrasChave: ["generos alimenticios", "merenda escolar", "alimentacao escolar", "pnae", "hortifruti", "agricultura familiar", "arroz", "feijao", "carne bovina", "frango congelado", "leite em po", "oleo de soja", "macarrao", "panificacao", "pao frances", "laticinios"],
      },
      {
        codigo: "2502",
        nome: "Cesta básica",
        palavrasChave: ["cesta basica", "cestas basicas", "kit alimentacao", "kits de alimentos", "cesta de natal", "beneficio eventual cesta"],
      },
      {
        codigo: "2503",
        nome: "Fornecimento de alimentação, copa, buffet e café",
        palavrasChave: ["coffee break", "fornecimento de refeicoes", "refeicoes prontas", "marmitex", "quentinha", "buffet", "coquetel", "restaurante popular", "preparo de refeicoes", "lanches prontos", "servico de copa e cozinha"],
      },
      {
        codigo: "2504",
        nome: "Água, bebidas",
        palavrasChave: ["agua mineral", "garrafao de agua", "agua potavel envasada", "refrigerante", "suco integral", "bebidas nao alcoolicas", "polpa de fruta", "agua com gas"],
      },
    ],
  },
  ARMAZENAGEM: {
    codigo: "ARMAZENAGEM",
    nome: "Armazenagem",
    descricao: "Conlicitação: Silos; Tanques; Movimentação de cargas",
    subcategorias: [
      {
        codigo: "1101",
        nome: "Silos, depósitos, armazéns",
        palavrasChave: ["silo", "silos metalicos", "armazem graneleiro", "galpao de armazenagem", "deposito logistico", "porta paletes", "estrutura porta palete"],
      },
      {
        codigo: "1102",
        nome: "Tanques, reservatórios, caixa d'água",
        palavrasChave: ["caixa d agua", "reservatorio metalico", "reservatorio de fibra", "tanque de armazenamento", "tanque estacionario", "cisterna de polietileno", "reservatorio elevado"],
      },
      {
        codigo: "1103",
        nome: "Movimentação de cargas",
        palavrasChave: ["movimentacao de cargas", "carga e descarga", "operacao logistica de armazenagem", "estiva", "transbordo de cargas", "paletizacao"],
      },
      {
        codigo: "1104",
        nome: "Container",
        palavrasChave: ["container", "conteiner", "modulo habitavel", "container maritimo", "locacao de container", "container almoxarifado", "container escritorio"],
      },
      {
        codigo: "1105",
        nome: "Carrinhos em geral, rodízios",
        palavrasChave: ["carrinho de carga", "carrinho plataforma", "carrinho de mao", "carrinho coletor", "rodizio giratorio", "rodizios industriais", "transpalete manual"],
      },
    ],
  },
  ASSESSORIAS: {
    codigo: "ASSESSORIAS",
    nome: "Assessorias",
    descricao: "Conlicitação: Consultoria; Auditoria Independente; Despachantes",
    subcategorias: [
      {
        codigo: "0501",
        nome: "Consultoria, Assessorias técnicas e de apoio, cobranças",
        palavrasChave: ["consultoria tecnica", "assessoria tecnica", "assessoria contabil", "assessoria juridica", "assessoria administrativa", "consultoria especializada", "gestao tributaria", "cobranca administrativa", "apoio tecnico especializado"],
      },
      {
        codigo: "0502",
        nome: "Auditoria Independente",
        palavrasChave: ["auditoria independente", "auditoria contabil", "auditoria externa", "auditoria financeira", "pericia contabil", "demonstracoes contabeis auditadas"],
      },
      {
        codigo: "0503",
        nome: "Despachantes, aduaneiros",
        palavrasChave: ["despachante", "desembaraco aduaneiro", "despacho aduaneiro", "comercio exterior", "importacao aduaneira", "despachante documentalista"],
      },
      {
        codigo: "0504",
        nome: "Tradução, revisão ortográfica",
        palavrasChave: ["traducao juramentada", "traducao simultanea", "interprete de libras", "revisao ortografica", "revisao textual", "versao em lingua estrangeira", "legendagem"],
      },
      {
        codigo: "0505",
        nome: "Telemarketing",
        palavrasChave: ["telemarketing", "call center", "teleatendimento", "central de atendimento telefonico", "atendimento receptivo e ativo", "contact center humano"],
      },
      {
        codigo: "0506",
        nome: "Cursos",
        palavrasChave: ["curso de capacitacao", "treinamento de servidores", "formacao continuada", "oficina pedagogica", "palestra", "workshop", "qualificacao profissional", "aperfeicoamento funcional"],
      },
      {
        codigo: "0507",
        nome: "Concurso Público",
        palavrasChave: ["concurso publico", "processo seletivo publico", "banca examinadora", "organizacao de concurso", "elaboracao de provas", "vestibular"],
      },
      {
        codigo: "0508",
        nome: "Pesquisa de opinião pública",
        palavrasChave: ["pesquisa de opiniao", "pesquisa de satisfacao", "levantamento estatistico", "pesquisa socioeconomica", "censo municipal", "enquete populacional"],
      },
    ],
  },
  CARTOES: {
    codigo: "CARTOES",
    nome: "Cartões",
    descricao: "Conlicitação: Magnético",
    subcategorias: [
      {
        codigo: "2801",
        nome: "Magnético, pvc, crachá e outros",
        palavrasChave: ["cracha em pvc", "cartao magnetico", "cartao de identificacao", "cordao para cracha", "cartao rfid", "cartao smart card", "impressao de crachas", "credencial pvc"],
      },
    ],
  },
  COMBUSTIVEIS: {
    codigo: "COMBUSTIVEIS",
    nome: "Combustíveis",
    descricao: "Conlicitação: GLP - botijões; Combustíveis e Lubrificantes",
    subcategorias: [
      {
        codigo: "2002",
        nome: "GLP - botijões",
        palavrasChave: ["gas glp", "botijao de gas", "gas de cozinha", "gas liquefeito de petroleo", "recarga de glp", "cilindro p45", "botijao p13"],
      },
      {
        codigo: "2001",
        nome: "Combustíveis e Lubrificantes",
        palavrasChave: ["combustivel", "combustiveis", "gasolina comum", "gasolina aditivada", "oleo diesel", "diesel s10", "diesel s500", "etanol hidratado", "alcool combustivel", "oleo lubrificante", "oleos e lubrificantes", "arla 32", "graxa automotiva", "fluido de freio", "abastecimento de frota"],
      },
    ],
  },
  COMUNICACAO_IDENTIFICACAO_VISUAL: {
    codigo: "COMUNICACAO_IDENTIFICACAO_VISUAL",
    nome: "Comunicação/Identificação Visual",
    descricao: "Conlicitação: Painéis",
    subcategorias: [
      {
        codigo: "1001",
        nome: "Painéis, luminosos, faixas, displays, plaqueta patrimonial",
        palavrasChave: ["comunicacao visual", "identificacao visual", "placa de identificacao", "fachada em acm", "totem sinalizador", "banner", "faixa impressa", "adesivagem", "plotagem", "plaqueta patrimonial", "letreiro luminoso", "display acrilico"],
      },
    ],
  },
  CONCESSOES_EXPLORACAO_IMOVEL: {
    codigo: "CONCESSOES_EXPLORACAO_IMOVEL",
    nome: "Concessões/Exploração/Imóvel",
    descricao: "Conlicitação: Estacionamento; Pedágios; Lanchonete",
    subcategorias: [
      {
        codigo: "0601",
        nome: "Estacionamento, zona azul",
        palavrasChave: ["estacionamento rotativo", "zona azul", "exploracao de estacionamento", "patio de estacionamento", "estacionamento rotativo regulamentado", "cobranca de estacionamento"],
      },
      {
        codigo: "0602",
        nome: "Pedágios",
        palavrasChave: ["praca de pedagio", "concessao de pedagio", "operacao de pedagio", "arrecadacao de pedagio", "rodovia pedagiada"],
      },
      {
        codigo: "0603",
        nome: "Lanchonete, restaurante, bar e locação de máquinas de bebidas",
        palavrasChave: ["concessao de lanchonete", "concessao de cantina", "exploracao de restaurante", "locacao de maquina de cafe", "vending machine", "permissao de uso de cantina"],
      },
      {
        codigo: "0604",
        nome: "Áreas em aeroportos",
        palavrasChave: ["area aeroportuaria", "concessao em aeroporto", "hangar aeroportuario", "espaco comercial em aeroporto", "terminal de passageiros aeroporto"],
      },
      {
        codigo: "0605",
        nome: "Áreas em rodoviárias",
        palavrasChave: ["terminal rodoviario", "box em rodoviaria", "area comercial em rodoviaria", "guiche rodoviario", "lojas em terminal rodoviario"],
      },
      {
        codigo: "0606",
        nome: "Banca de jornal",
        palavrasChave: ["banca de jornal", "banca de revistas", "permissao de banca", "quiosque de revistas", "quiosque de jornais"],
      },
      {
        codigo: "0607",
        nome: "Áreas em sacolões",
        palavrasChave: ["sacolao municipal", "box mercado municipal", "feira livre concessao", "ceasa permissao de uso", "boxes de sacolao"],
      },
      {
        codigo: "0608",
        nome: "Bancária/instituição financeira e lotérica",
        palavrasChave: ["folha de pagamento bancaria", "instituicao financeira oficial", "servicos bancarios", "arrecadacao bancaria", "casa loterica", "centralizacao da folha"],
      },
      {
        codigo: "0609",
        nome: "Concessões especiais e outros",
        palavrasChave: ["concessao de uso de bem publico", "permissao remunerada de uso", "cessao onerosa de espaco", "outorga de concessao especial", "concessao de uso"],
      },
      {
        codigo: "0610",
        nome: "Locação e aquisição de Imóveis",
        palavrasChave: ["locacao de imovel", "aluguel de imovel", "aquisicao de imovel", "desapropriacao amigavel", "locacao de sala comercial", "locacao de galpao"],
      },
      {
        codigo: "0611",
        nome: "Concessão/Exploração. privatização: Saneamento, elétrica, viária, gestão prisional e outros",
        palavrasChave: ["parceria publico privada", "concessao de saneamento", "concessao de iluminacao publica", "concessao rodoviaria", "gestao prisional", "desestatizacao"],
      },
    ],
  },
  CONFECCOES_DECORACAO: {
    codigo: "CONFECCOES_DECORACAO",
    nome: "Confecções/Decoração",
    descricao: "Conlicitação: Uniformes e confecções em geral; Aviamentos; Cama",
    subcategorias: [
      {
        codigo: "3201",
        nome: "Uniformes e confecções em geral",
        palavrasChave: ["uniforme escolar", "uniforme profissional", "camiseta personalizada", "camisa polo", "fardamento", "jaleco", "colete de identificacao", "confeccao de vestuario", "agasalho escolar"],
      },
      {
        codigo: "3202",
        nome: "Aviamentos",
        palavrasChave: ["aviamentos", "linha de costura", "ziper", "botao para costura", "elastico textil", "fita de cetim", "agulha de costura", "velcro"],
      },
      {
        codigo: "3203",
        nome: "Cama, mesa e banho",
        palavrasChave: ["cama mesa e banho", "lencol hospitalar", "toalha de banho", "toalha de rosto", "cobertor", "edredom", "travesseiro", "colcha", "fronha"],
      },
      {
        codigo: "3204",
        nome: "Tecidos",
        palavrasChave: ["tecido em metro", "tecidos diversos", "malha fria", "tecido brim", "tnt rolo", "tecido algodao", "tecido oxford"],
      },
      {
        codigo: "3205",
        nome: "Calçados",
        palavrasChave: ["calcados escolares", "tenis escolar", "sapato social", "sandalia", "chinelo", "coturno", "meias escolares"],
      },
      {
        codigo: "3206",
        nome: "Tapeçaria, persianas, cortinas e decoração",
        palavrasChave: ["persiana", "cortina", "tapete", "carpete", "capacho", "tapecaria", "decoracao de ambientes", "pelicula insulfilm"],
      },
      {
        codigo: "3207",
        nome: "Malas, malotes e encerados",
        palavrasChave: ["mochila escolar", "mala de viagem", "malote de lona", "pasta executiva", "lona encerada", "encerado para caminhao", "necessaire"],
      },
    ],
  },
  DIDATICO: {
    codigo: "DIDATICO",
    nome: "Didático",
    descricao: "Conlicitação: Livros e material didático",
    subcategorias: [
      {
        codigo: "2901",
        nome: "Livros e material didático",
        palavrasChave: ["livro didatico", "material didatico", "apostila pedagogica", "acervo bibliografico", "kit pedagogico", "sistema de ensino estruturado", "jogos educativos", "robotica educacional", "kit escolar"],
      },
    ],
  },
  ELETRO_ELETRONICOS_OTICA: {
    codigo: "ELETRO_ELETRONICOS_OTICA",
    nome: "Eletro Eletrônicos/Ótica",
    descricao: "Conlicitação: Cine; Eletrodomésticos; Exaustor e exaustão",
    subcategorias: [
      {
        codigo: "1201",
        nome: "Cine, som, ótica, TV e projetores",
        palavrasChave: ["televisor", "smart tv", "projetor multimidia", "datashow", "tela de projecao", "caixa de som", "microfone sem fio", "mesa de som", "camera fotografica", "oculos de grau", "lentes oftalmicas"],
      },
      {
        codigo: "1202",
        nome: "Eletrodomésticos, ventilador, bebedouro",
        palavrasChave: ["eletrodomestico", "geladeira", "refrigerador", "fogao industrial", "fogao domestico", "forno micro ondas", "bebedouro eletrico", "purificador de agua", "ventilador de parede", "ventilador de coluna", "maquina de lavar roupa", "freezer horizontal", "liquidificador"],
      },
      {
        codigo: "1203",
        nome: "Exaustor e exaustão",
        palavrasChave: ["exaustor industrial", "sistema de exaustao", "coifa industrial", "ventilacao mecanica", "exaustor eolico"],
      },
    ],
  },
  EMBALAGENS_E_LACRES: {
    codigo: "EMBALAGENS_E_LACRES",
    nome: "Embalagens e Lacres",
    descricao: "Conlicitação: Embalagens e lacres em geral; Utensílios de copa e cozinha",
    subcategorias: [
      {
        codigo: "2701",
        nome: "Embalagens e lacres em geral",
        palavrasChave: ["embalagem plastica", "caixa de papelao", "saco plastico", "filme stretch", "fita adesiva embalagem", "lacre de seguranca", "lacre numerado", "bobina picotada", "marmita descartavel aluminio"],
      },
      {
        codigo: "2702",
        nome: "Utensílios de copa e cozinha",
        palavrasChave: ["utensilios de cozinha", "utensilios de copa", "panela industrial", "talheres inox", "prato de vidro", "copo descartavel", "copos descartaveis", "garrafa termica", "bandeja refeitorio", "jarra", "xicara"],
      },
    ],
  },
  ENGENHARIA_MATERIAIS: {
    codigo: "ENGENHARIA_MATERIAIS",
    nome: "ENGENHARIA - Materiais",
    descricao: "Conlicitação: Construção; Hidráulicos; Asfálticos",
    subcategorias: [
      {
        codigo: "0121",
        nome: "Construção, madeiras",
        palavrasChave: ["material de construcao", "materiais de construcao", "cimento portland", "areia lavada", "pedra britada", "tijolo ceramico", "bloco de concreto", "telha fibrocimento", "telha metalica", "vergalhao de aco", "argamassa", "cal hidratada", "madeira serrada", "compensado naval", "tinta acrilica"],
      },
      {
        codigo: "0122",
        nome: "Hidráulicos, saneamento",
        palavrasChave: ["material hidraulico", "materiais hidraulicos", "tubo pvc", "tubulacao pead", "conexao hidraulica", "registro de gaveta", "valvula de retencao", "manilha de concreto", "tampao ferro fundido", "anel de vedacao"],
      },
      {
        codigo: "0123",
        nome: "Asfálticos, concreto",
        palavrasChave: ["massa asfaltica", "asfalto frio", "cimento asfaltico cap", "emulsao asfaltica", "concreto usinado", "artefatos de cimento", "bloco intertravado paver", "meio fio pre moldado"],
      },
      {
        codigo: "0124",
        nome: "Elétricos",
        palavrasChave: ["material eletrico", "materiais eletricos", "cabo eletrico", "fio flexivel", "disjuntor", "luminaria led", "lampada led", "rele fotoeletrico", "eletroduto", "quadro de distribuicao", "poste de concreto"],
      },
      {
        codigo: "0125",
        nome: "Material de Sinalização",
        palavrasChave: ["placa de sinalizacao viaria", "tinta para demarcacao viaria", "tachao refletivo", "cone de sinalizacao", "cavalete viario", "balizador de transito", "defensa metalica"],
      },
    ],
  },
  ENGENHARIA_SERVICOS: {
    codigo: "ENGENHARIA_SERVICOS",
    nome: "ENGENHARIA - Serviços",
    descricao: "Conlicitação: Reformas; Saneamento; Pavimentação",
    subcategorias: [
      {
        codigo: "0101",
        nome: "Reformas, edificações e demolição",
        palavrasChave: ["obra de reforma", "construcao de unidade", "construcao de escola", "ampliacao predial", "reforma predial", "edificacao publica", "demolicao de imovel", "obra civil", "construcao de quadra", "reforma de ubs"],
      },
      {
        codigo: "0102",
        nome: "Saneamento, esgoto, dutos, rede de distribuição de água, rede de gás",
        palavrasChave: ["rede de esgoto", "esgotamento sanitario", "estacao de tratamento de esgoto", "adutora de agua", "rede de distribuicao de agua", "saneamento basico obra", "rede canalizada de gas"],
      },
      {
        codigo: "0103",
        nome: "Pavimentação, drenagem",
        palavrasChave: ["pavimentacao asfaltica", "recapeamento asfaltico", "cbuq", "drenagem pluvial", "galeria de aguas pluviais", "calcamento em paralelepipedo", "pavimentacao intertravada", "tapa buraco", "recuperacao de estradas vicinais", "britagem"],
      },
      {
        codigo: "0104",
        nome: "Muro de arrimo, contenções",
        palavrasChave: ["muro de arrimo", "contencao de encosta", "estabilizacao de talude", "gabiao", "cortina atirantada", "solo grampeado"],
      },
      {
        codigo: "0105",
        nome: "Pontes, obras de arte, viadutos, túneis, passarelas",
        palavrasChave: ["construcao de ponte", "ponte de concreto", "obra de arte especial", "viaduto", "passarela de pedestres", "tunel rodoviario", "bueiro celular"],
      },
      {
        codigo: "0106",
        nome: "Serviços de terraplanagem",
        palavrasChave: ["servico de terraplanagem", "terraplenagem", "movimentacao de terra", "aterro e desaterro", "regularizacao de subleito", "patrolamento de estradas"],
      },
      {
        codigo: "0107",
        nome: "Poços tubulares, artesianos, perfuratriz, mineração, escavação",
        palavrasChave: ["poco artesiano", "poco tubular profundo", "perfuracao de poco", "escavacao mecanizada", "desmonte de rocha", "lavra e mineracao"],
      },
      {
        codigo: "0108",
        nome: "Elétrica, redes, isolação, serviços",
        palavrasChave: ["rede de distribuicao eletrica", "extensao de rede eletrica", "manutencao de iluminacao publica", "subestacao eletrica", "instalacao fotovoltaica usina", "eficiencia energetica"],
      },
      {
        codigo: "0109",
        nome: "Portos, aeroportos",
        palavrasChave: ["obra portuaria", "infraestrutura aeroportuaria", "pista de pouso", "atracadouro", "pier maritimo", "terminal hidroviario"],
      },
      {
        codigo: "0110",
        nome: "Supervisão de obras",
        palavrasChave: ["supervisao de obras", "fiscalizacao de obras", "gerenciamento de obras de engenharia", "acompanhamento tecnico de obra", "gerenciamento e fiscalizacao de obras"],
      },
      {
        codigo: "0111",
        nome: "Projetos de engenharia e arquitetura, maquetes",
        palavrasChave: ["projeto de engenharia", "projeto arquitetonico", "projeto executivo", "projeto estrutural", "modelagem bim", "elaboracao de projetos", "maquete fisica"],
      },
      {
        codigo: "0112",
        nome: "Sinalização viária",
        palavrasChave: ["servico de sinalizacao viaria", "sinalizacao horizontal e vertical", "pintura de faixas de pedestres", "implantacao de sinalizacao", "demarcacao viaria", "sinalizacao de transito"],
      },
      {
        codigo: "0113",
        nome: "Sinalização semafórica, controle do trânsito, radares",
        palavrasChave: ["sinalizacao semaforica", "semaforo inteligente", "fiscalizacao eletronica de transito", "radar de velocidade", "lombada eletronica", "engenharia de trafego"],
      },
    ],
  },
  EQUIPAMENTOS_FERRAMENTAS: {
    codigo: "EQUIPAMENTOS_FERRAMENTAS",
    nome: "Equipamentos/Ferramentas",
    descricao: "Conlicitação: Balanças; Ferramentas e bancadas; Agrícolas",
    subcategorias: [
      {
        codigo: "0701",
        nome: "Balanças",
        palavrasChave: ["balanca digital", "balanca de precisao", "balanca rodoviaria", "balanca antropometrica", "balanca comercial", "pesagem"],
      },
      {
        codigo: "0702",
        nome: "Ferramentas e bancadas",
        palavrasChave: ["ferramentas manuais", "kit de ferramentas", "bancada de trabalho", "furadeira", "parafusadeira", "esmerilhadeira", "serra circular", "alicate", "chave de fenda", "martelo", "rocadeira costal", "motosserra"],
      },
      {
        codigo: "0703",
        nome: "Agrícolas, implementos",
        palavrasChave: ["implemento agricola", "implementos agricolas", "trator agricola", "arado", "grade aradora", "plantadeira", "colheitadeira", "carreta agricola", "pulverizador agricola", "ensiladeira"],
      },
      {
        codigo: "0704",
        nome: "Máquinas pesadas e equipamentos de construção",
        palavrasChave: ["maquinas pesadas", "retroescavadeira", "escavadeira hidraulica", "motoniveladora", "pa carregadeira", "rolo compactador", "trator de esteira", "caminhao basculante", "equipamento de construcao", "locacao de maquinas pesadas"],
      },
      {
        codigo: "0705",
        nome: "Medição em geral",
        palavrasChave: ["instrumento de medicao", "equipamento de medicao", "trena a laser", "teodolito", "estacao total", "multimetro", "termometro industrial", "medidor de vazao", "calibracao de instrumentos", "paquimetro"],
      },
      {
        codigo: "0706",
        nome: "Hidráulicos, compressores e motores, bombas e outros",
        palavrasChave: ["compressor de ar", "motobomba", "bomba centrifuga", "bomba submersa", "motor eletrico", "moto bomba", "bomba dosadora", "hidrojateamento", "lavadora de alta pressao"],
      },
      {
        codigo: "0707",
        nome: "Hidrômetros",
        palavrasChave: ["hidrometro", "hidrometros", "medidor de agua", "medidor de consumo de agua", "troca de hidrometros"],
      },
      {
        codigo: "0708",
        nome: "Energia: geradores, transformadores, painéis e outros",
        palavrasChave: ["gerador de energia", "grupo gerador", "gerador a diesel", "transformador de potencia", "painel eletrico", "nobreak industrial", "banco de baterias estacionarias", "estabilizador de tensao"],
      },
      {
        codigo: "0709",
        nome: "Empilhadeiras, pallets",
        palavrasChave: ["empilhadeira", "paleteira", "pallet", "palete de madeira", "pallets plasticos", "transpaleteira", "carrinho hidraulico"],
      },
    ],
  },
  ESCRITORIO_E_GRAFICA: {
    codigo: "ESCRITORIO_E_GRAFICA",
    nome: "Escritório e Gráfica",
    descricao: "Conlicitação: Materiais de escritório; Equipamentos para escritórios; Copiadora",
    subcategorias: [
      {
        codigo: "3001",
        nome: "Materiais de escritório, expediente, papéis, formulários",
        palavrasChave: ["material de expediente", "material de escritorio", "papel a4", "papel sulfite", "caneta esferografica", "pasta suspensa", "grampeador", "clipes", "envelope", "formularios continuos", "bloco de anotacao", "papelaria", "toner e cartucho", "fita adesiva", "lapis"],
      },
      {
        codigo: "3002",
        nome: "Equipamentos para escritórios, máquinas (fac-símile, mimeógrafo, franqueadora, guilhotina, fragmentadora, contadores, escrever e calcular e outros)",
        palavrasChave: ["fragmentadora de papel", "trituradora de papel", "guilhotina de papel", "maquina de escrever", "calculadora de mesa", "franqueadora", "plastificadora", "maquina de contar cedulas", "encadernadora"],
      },
      {
        codigo: "3003",
        nome: "Copiadora, reprografia, encadernação, leitora, duplicador, plastificação",
        palavrasChave: ["copiadora", "reprografia", "outsourcing de impressao", "locacao de impressoras multifuncionais", "fotocopias", "encadernacao", "plastificacao", "duplicador", "impressao e copias"],
      },
      {
        codigo: "3004",
        nome: "Serviços gráficos, impressos e edições",
        palavrasChave: ["servicos graficos", "servico grafico", "impressos graficos", "impressao de folders", "impressao de panfletos", "cartilhas impressas", "impressao de livros", "banner grafico", "carimbo grafico", "talonarios"],
      },
      {
        codigo: "3005",
        nome: "Máquinas e materiais gráficos, serrilhadora, blocadora, envelopadora, contadora de cédulas e outros",
        palavrasChave: ["guilhotina industrial", "maquina grafica", "blocadora", "envelopadora", "serrilhadora", "contadora de cedulas", "material grafico", "chapa de impressao offset"],
      },
      {
        codigo: "3006",
        nome: "Microfilmagem, arquivamento, gerenciamento eletrônico de documentos (GED), digitalização, biblioteconomia",
        palavrasChave: ["gestao eletronica de documentos", "ged", "digitalizacao de documentos", "digitalizacao de acervo", "microfilmagem", "arquivamento de documentos", "guarda de documentos", "biblioteconomia", "organizacao de arquivo", "tratamento arquivistico"],
      },
      {
        codigo: "3007",
        nome: "Carimbos, chaves",
        palavrasChave: ["carimbo", "carimbos", "chaveiro", "confeccao de chaves", "copias de chaves", "carimbo automatico", "almofada para carimbo"],
      },
    ],
  },
  ESPECIALIZADOS: {
    codigo: "ESPECIALIZADOS",
    nome: "Especializados",
    descricao: "Conlicitação: Satélite; Serviços técnicos; Isolação térmica e acústica",
    subcategorias: [
      {
        codigo: "0401",
        nome: "Satélite, sinais, sistema de posicionamento global, rastreamento, radar aéreo controlador de vôo, sistema de navegação aérea, controle de espaço aéreo",
        palavrasChave: ["rastreamento por satelite", "gps", "sistema de posicionamento global", "radar aereo", "controle de espaco aereo", "sensoriamento remoto", "imagem de satelite", "rastreador veicular"],
      },
      {
        codigo: "0402",
        nome: "Serviços técnicos, topográficos, sondagens, fundações, levantamentos estudos, saneamento ambiental, georreferenciados, inspeções",
        palavrasChave: ["servico topografico", "levantamento topografico", "sondagem de solo", "estudo geotecnico", "georreferenciamento", "inspecao tecnica", "laudo tecnico", "estudo ambiental", "licenciamento ambiental", "levantamento planialtimetrico", "drone para mapeamento"],
      },
      {
        codigo: "0403",
        nome: "Isolação térmica e acústica",
        palavrasChave: ["isolamento termico", "isolamento acustico", "tratamento acustico", "manta termica", "la de rocha", "espuma acustica"],
      },
      {
        codigo: "0404",
        nome: "Caldeiraria, gerador de vapor, trocador de calor",
        palavrasChave: ["caldeiraria", "caldeira", "gerador de vapor", "trocador de calor", "vaso de pressao", "serralheria pesada"],
      },
      {
        codigo: "0405",
        nome: "Usinagem, tornearia, peças sob desenho, mecânica industrial",
        palavrasChave: ["usinagem", "tornearia", "torneiro mecanico", "pecas sob desenho", "mecanica industrial", "fresagem", "soldagem industrial"],
      },
      {
        codigo: "0406",
        nome: "Meteorologia",
        palavrasChave: ["meteorologia", "estacao meteorologica", "pluviometro", "previsao do tempo", "anemometro"],
      },
      {
        codigo: "0407",
        nome: "Cabines Sanitárias, banheiros químicos",
        palavrasChave: ["banheiro quimico", "banheiros quimicos", "cabine sanitaria", "cabines sanitarias", "locacao de banheiros", "sanitario portatil"],
      },
      {
        codigo: "0408",
        nome: "Câmaras frigoríficas, cozinha industrial, lavanderia, limpeza e outros",
        palavrasChave: ["camara frigorifica", "camaras frias", "cozinha industrial", "equipamentos de lavanderia", "lavanderia industrial", "ultracongelador", "equipamento de refrigeracao industrial"],
      },
      {
        codigo: "0409",
        nome: "Irrigação, hidrologia",
        palavrasChave: ["irrigacao", "sistema de irrigacao", "hidrologia", "pivo central", "gotejamento", "microaspersao"],
      },
      {
        codigo: "0410",
        nome: "Tratamento de água, análises de água",
        palavrasChave: ["tratamento de agua", "estacao de tratamento de agua", "analise de agua", "analises de agua", "potabilidade", "cloracao", "analise de potabilidade", "eta compacta"],
      },
      {
        codigo: "0411",
        nome: "Blindagem",
        palavrasChave: ["blindagem", "veiculo blindado", "vidro blindado", "blindagem balistica", "colete balistico", "porta blindada"],
      },
    ],
  },
  ESPORTIVOS_MUSICAIS: {
    codigo: "ESPORTIVOS_MUSICAIS",
    nome: "Esportivos/Musicais",
    descricao: "Conlicitação: Equipamentos e materiais esportivos",
    subcategorias: [
      {
        codigo: "1301",
        nome: "Equipamentos e materiais esportivos, instrumentos musicais, artes",
        palavrasChave: ["material esportivo", "equipamentos esportivos", "bola de futebol", "uniforme esportivo", "instrumento musical", "instrumentos musicais", "violao", "bateria musical", "fanfarra", "trofeu esportivo", "artes plasticas", "material de arte", "tatame", "kit esportivo"],
      },
    ],
  },
  EVENTOS: {
    codigo: "EVENTOS",
    nome: "Eventos",
    descricao: "Conlicitação: Organização de eventos; Cobertura e material fotográfico; Sonorização",
    subcategorias: [
      {
        codigo: "3301",
        nome: "Organização de eventos",
        palavrasChave: ["organizacao de eventos", "realizacao de eventos", "evento institucional", "cerimonial", "festividades", "carnaval", "show artistico", "contratacao de artistas", "estrutura para eventos", "montagem de palco", "tenda para eventos", "feira de negocios"],
      },
      {
        codigo: "3302",
        nome: "Cobertura e material fotográfico, filmagem",
        palavrasChave: ["cobertura fotografica", "servico de fotografia", "filmagem", "video institucional", "producao audiovisual", "material fotografico", "drone filmagem", "transmissao ao vivo"],
      },
      {
        codigo: "3303",
        nome: "Sonorização",
        palavrasChave: ["sonorizacao", "servico de som", "locacao de som", "equipamento de sonorizacao", "sonorizacao de eventos", "caixas acusticas"],
      },
      {
        codigo: "3304",
        nome: "Iluminação",
        palavrasChave: ["iluminacao cenica", "iluminacao de eventos", "locacao de iluminacao", "refletor de palco", "efeitos de iluminacao"],
      },
    ],
  },
  FERROVIARIOS: {
    codigo: "FERROVIARIOS",
    nome: "Ferroviários",
    descricao: "Conlicitação: Serviços",
    subcategorias: [
      {
        codigo: "0801",
        nome: "Serviços, peças e equipamentos",
        palavrasChave: ["ferroviario", "ferroviarios", "ferrovia", "via permanente", "trilhos", "locomotiva", "vagao ferroviario", "material rodante", "dormentes", "metro e trem urbano"],
      },
    ],
  },
  FUNERARIA: {
    codigo: "FUNERARIA",
    nome: "Funerária",
    descricao: "Conlicitação: Urnas",
    subcategorias: [
      {
        codigo: "3601",
        nome: "Urnas, funerários, artigos religiosos",
        palavrasChave: ["urna funeraria", "servico funerario", "servicos funerarios", "caixao", "artigos religiosos", "funeraria", "translado de corpos", "sepultamento", "cremacao", "velorio"],
      },
    ],
  },
  HOSPEDAGEM: {
    codigo: "HOSPEDAGEM",
    nome: "Hospedagem",
    descricao: "Conlicitação: Hotelaria",
    subcategorias: [
      {
        codigo: "1801",
        nome: "Hotelaria",
        palavrasChave: ["hospedagem", "servicos de hotelaria", "diarias de hotel", "hotel", "pousada", "alojamento", "hospedagem de servidores", "diarias em hospedagem"],
      },
    ],
  },
  INFANTIL_PLAYGROUND: {
    codigo: "INFANTIL_PLAYGROUND",
    nome: "Infantil/Playground",
    descricao: "Conlicitação: Brinquedos",
    subcategorias: [
      {
        codigo: "1401",
        nome: "Brinquedos, material infantil, playground",
        palavrasChave: ["brinquedos", "brinquedo educativo", "playground", "parquinho infantil", "material infantil", "brinquedoteca", "escorregador", "balanco infantil", "gangorra", "kit pedagogico infantil", "piscina de bolinhas"],
      },
    ],
  },
  INFORMATICA: {
    codigo: "INFORMATICA",
    nome: "Informática",
    descricao: "Conlicitação: Softwares; Equipamentos e periféricos; Manutenção de equipamentos de informática",
    subcategorias: [
      {
        codigo: "3101",
        nome: "Softwares, sistemas, serviços de rede, serviços técnicos",
        palavrasChave: ["software", "licenciamento de software", "sistema de gestao", "software de gestao", "sistema informatizado", "erp", "saas", "software como servico", "solucao tecnologica", "plataforma digital", "servicos de ti", "servico de tecnologia da informacao", "desenvolvimento de sistemas", "nuvem", "hospedagem de sistema", "banco de dados", "licenca microsoft", "antivirus", "suporte tecnico em ti", "link de internet", "internet dedicada", "fibra optica", "cabeamento estruturado", "rede de dados", "wifi", "seguranca da informacao", "backup em nuvem", "data center", "service desk", "outsourcing de ti", "licencas de software", "assinatura anual de software", "sistema web"],
      },
      {
        codigo: "3102",
        nome: "Equipamentos e periféricos, compra, instalação e locação",
        palavrasChave: ["computador", "computadores", "notebook", "desktop", "microcomputador", "servidor de rede", "monitor de video", "impressora", "scanner de mesa", "tablet", "chromebook", "switch gerenciavel", "roteador", "access point", "estacao de trabalho", "workstation", "memoria ram", "ssd", "nobreak", "periferico", "locacao de computadores", "equipamentos de informatica", "projetor interativo", "lousa digital"],
      },
      {
        codigo: "3103",
        nome: "Manutenção de equipamentos de informática",
        palavrasChave: ["manutencao de computadores", "manutencao de equipamentos de informatica", "assistencia tecnica em informatica", "manutencao de impressoras", "manutencao preventiva de computadores", "reparo de notebooks", "suporte tecnico presencial"],
      },
      {
        codigo: "3104",
        nome: "Suprimentos, formulários",
        palavrasChave: ["suprimentos de informatica", "toner para impressora", "cartucho de tinta", "cartuchos de toner", "fita para impressora", "pen drive", "mouse e teclado", "cabo hdmi", "formulario continuo", "midia de gravacao"],
      },
      {
        codigo: "3105",
        nome: "Sistema URA, correio de voz e outros",
        palavrasChave: ["sistema ura", "unidade de resposta audivel", "correio de voz", "pabx", "central telefonica", "telefonia voip", "telefonia ip", "chatbot de atendimento", "gravacao de chamadas", "discador automatico"],
      },
      {
        codigo: "3106",
        nome: "Relógio de ponto e controle de acesso",
        palavrasChave: ["relogio de ponto", "relogios de ponto", "ponto eletronico", "registro de ponto", "controle de ponto", "controle de acesso", "controle de frequencia biometrico", "leitor biometrico", "coletor biometrico"],
      },
    ],
  },
  INSTALACOES: {
    codigo: "INSTALACOES",
    nome: "Instalações",
    descricao: "Conlicitação: Manutenção predial; Impermeabilização; Estrutura metálica",
    subcategorias: [
      {
        codigo: "0201",
        nome: "Manutenção predial, hidráulica, hidro-sanitárias, elétrica, pisos, pintura, telhados",
        palavrasChave: ["manutencao predial", "manutencao hidraulica", "manutencao eletrica predial", "servicos de pintura", "pintura predial", "troca de piso", "reparo de telhado", "conservacao predial", "servicos de manutencao de edificios", "pequenos reparos"],
      },
      {
        codigo: "0202",
        nome: "Impermeabilização, fachadas",
        palavrasChave: ["impermeabilizacao", "manta asfaltica", "tratamento de fachada", "restauracao de fachadas", "limpeza de fachada", "pintura de fachada"],
      },
      {
        codigo: "0203",
        nome: "Estrutura metálica, andaimes, palco, arquibancadas, abrigos, toldos",
        palavrasChave: ["estrutura metalica", "andaime", "andaimes", "palco metalico", "arquibancada", "arquibancadas", "abrigo de onibus", "toldo", "cobertura metalica", "tenda piramidal", "galpao metalico"],
      },
      {
        codigo: "0204",
        nome: "Ar condicionado, limpeza de dutos",
        palavrasChave: ["ar condicionado", "split", "pmoc", "climatizacao", "limpeza de dutos", "manutencao de aparelhos de ar", "instalacao de ar condicionado", "fancoil", "chiller"],
      },
      {
        codigo: "0205",
        nome: "Elevadores, monta carga, escadas rolantes, esteiras transportadoras",
        palavrasChave: ["elevador", "elevadores", "monta carga", "escada rolante", "esteira transportadora", "plataforma elevatoria", "manutencao de elevadores", "elevador de acessibilidade"],
      },
      {
        codigo: "0206",
        nome: "Vidraçaria, marcenaria, serralheria",
        palavrasChave: ["vidracaria", "marcenaria", "serralheria", "esquadria de aluminio", "porta de vidro", "janela de aluminio", "portao metalico", "grade de ferro", "box de vidro"],
      },
      {
        codigo: "0207",
        nome: "Divisórias",
        palavrasChave: ["divisoria", "divisorias", "divisoria naval", "divisoria de drywall", "forro de gesso", "forro pvc", "painel divisorio", "drywall"],
      },
      {
        codigo: "0208",
        nome: "Segurança: alarme, portas especiais, cofres, circuito de TV (CFTV), catracas, detector de metais, raio-x de bagagem",
        palavrasChave: ["alarme", "sistema de alarme", "cftv", "circuito fechado de tv", "circuito fechado de televisao", "camera de monitoramento", "camera de seguranca", "videomonitoramento", "catraca", "detector de metais", "porta giratoria", "cofre", "raio x de bagagem", "seguranca eletronica", "cerca eletrica", "portao automatico"],
      },
      {
        codigo: "0209",
        nome: "Telecomunicações, sistemas, cabos, telefones, rádio-chamada, transceptores",
        palavrasChave: ["telecomunicacoes", "cabos de telecomunicacoes", "radio comunicador", "radio chamada", "transceptor", "radios comunicadores", "telefones", "torre de telecomunicacoes", "infraestrutura de telecomunicacao", "link de rede", "ramal telefonico", "cabo de rede utp", "central de interfonia"],
      },
      {
        codigo: "0210",
        nome: "Equipamentos e material contra-incêndio e serviços",
        palavrasChave: ["extintor", "extintores", "combate a incendio", "contra incendio", "hidrante", "sprinkler", "sistema de incendio", "recarga de extintores", "mangueira de incendio", "avcb", "brigadista", "detector de fumaca"],
      },
      {
        codigo: "0211",
        nome: "Pára-raios",
        palavrasChave: ["para raios", "spda", "descarga atmosferica", "aterramento", "protecao contra descargas"],
      },
    ],
  },
  LEILOES: {
    codigo: "LEILOES",
    nome: "Leilões",
    descricao: "Conlicitação: Transportes - veículos; Imóveis - casas; Eletrodomésticos",
    subcategorias: [
      {
        codigo: "3701",
        nome: "Transportes - veículos, aeronaves, embarcações, carros, utilitários, caminhões, motos, barcos, navios, helicópteros, aviões e suas respectivas peças",
        palavrasChave: ["veiculos", "carros", "caminhoes", "motocicletas", "onibus", "embarcacoes", "aeronaves", "helicopteros", "automoveis", "utilitarios", "barcos", "veiculos antieconomicos", "pecas de veiculos"],
      },
      {
        codigo: "3702",
        nome: "Imóveis - casas, terrenos, lotes, glebas, apartamentos, prédios, salas comerciais",
        palavrasChave: ["imoveis", "terrenos", "lotes", "glebas", "apartamentos", "predios", "salas comerciais", "casas", "lote urbano"],
      },
      {
        codigo: "3703",
        nome: "Eletrodomésticos, eletro-eletrônicos, reprográficos, equip. informática, ar-condicionado, equip. segurança eletrônica, painéis eletrônicos, extintores, pára-raios, etc.",
        palavrasChave: ["eletrodomesticos", "equipamentos de informatica", "eletroeletronicos", "ar condicionado", "extintores", "paineis eletronicos", "equipamentos de seguranca eletronica", "reprograficos"],
      },
      {
        codigo: "3704",
        nome: "Materiais de construção, saneamento, hidráulicos, elétricos, sinalização",
        palavrasChave: ["materiais de construcao", "materiais hidraulicos", "materiais eletricos", "sinalizacao", "material de saneamento"],
      },
      {
        codigo: "3705",
        nome: "Máquinas, equipamentos e ferramentas: industriais, de engenharia (pesados), irrigação",
        palavrasChave: ["maquinas industriais", "equipamentos pesados", "ferramentas industriais", "equipamentos de irrigacao", "maquinas de engenharia", "tratores"],
      },
      {
        codigo: "3706",
        nome: "Livros, jóias, publicações, perfumes, obras de arte, títulos e ações. Ver observação",
        palavrasChave: ["joias", "livros", "obras de arte", "perfumes", "titulos e acoes", "publicacoes", "relogios de luxo"],
      },
      {
        codigo: "3707",
        nome: "Petrobrás e Ferroviário",
        palavrasChave: ["material petrobras", "material ferroviario", "petrobras ferroviario", "bens da petrobras"],
      },
      {
        codigo: "3708",
        nome: "Inservíveis e Sucatas",
        palavrasChave: ["inservivel", "inserviveis", "sucata", "sucatas", "bens inserviveis", "bens moveis inserviveis", "bens apreendidos", "material em desuso", "bens antieconomicos", "bens ociosos", "sucata ferrosa"],
      },
      {
        codigo: "3709",
        nome: "Animais, materiais e equipamentos agropecuários, veterinários, inseticidas",
        palavrasChave: ["animais", "semoventes", "gado", "bovinos", "equipamentos agropecuarios", "material veterinario"],
      },
      {
        codigo: "3710",
        nome: "Produtos químicos e seus derivados, gases, resíduos, combustíveis e seus derivados",
        palavrasChave: ["produtos quimicos", "residuos", "gases", "combustiveis", "derivados de petroleo", "oleo usado"],
      },
      {
        codigo: "3711",
        nome: "Alimentícios e bebidas",
        palavrasChave: ["alimenticios", "bebidas", "generos alimenticios apreendidos", "produtos alimenticios", "alimentos apreendidos"],
      },
      {
        codigo: "3712",
        nome: "Equipamentos, materiais e instrumentais: médicos, laboratoriais, medicamentos e balanças",
        palavrasChave: ["equipamentos medicos", "instrumentais medicos", "equipamentos laboratoriais", "medicamentos", "balancas"],
      },
      {
        codigo: "3713",
        nome: "Materiais de escritório, didáticos, informática, utensílios domésticos, embalagens, limpeza, cosméticos",
        palavrasChave: ["materiais de escritorio", "material didatico", "utensilios domesticos", "embalagens", "material de limpeza", "cosmeticos"],
      },
      {
        codigo: "3714",
        nome: "Móveis em geral",
        palavrasChave: ["moveis", "mobiliario", "moveis usados", "moveis em geral", "cadeiras e mesas"],
      },
      {
        codigo: "3715",
        nome: "Confecções, malas, calçados, tecidos, esportivos, brinquedos, segurança",
        palavrasChave: ["confeccoes", "malas", "calcados", "tecidos", "artigos esportivos", "brinquedos", "equipamentos de seguranca"],
      },
      {
        codigo: "3716",
        nome: "Funerários",
        palavrasChave: ["funerarios", "urnas funerarias", "artigos funerarios", "caixoes"],
      },
    ],
  },
  MOBILIARIOS: {
    codigo: "MOBILIARIOS",
    nome: "Mobiliários",
    descricao: "Conlicitação: Escritório; Arquivo deslizante; Médico",
    subcategorias: [
      {
        codigo: "3501",
        nome: "Escritório",
        palavrasChave: ["mobiliario de escritorio", "mesa de escritorio", "cadeira giratoria", "cadeira de escritorio", "armario de aco", "gaveteiro", "estacao de trabalho modular", "longarina", "balcao de atendimento", "mesa de reuniao", "poltrona", "estante de aco", "quadro branco", "arquivo de aco"],
      },
      {
        codigo: "3502",
        nome: "Arquivo deslizante",
        palavrasChave: ["arquivo deslizante", "estante deslizante", "arquivo movel", "arquivo compacto", "estante compactavel"],
      },
      {
        codigo: "3503",
        nome: "Médico, laboratorial, cadeira de rodas",
        palavrasChave: ["mobiliario hospitalar", "cama hospitalar", "maca", "cadeira de rodas", "mesa de exame clinico", "armario laboratorial", "bancada laboratorial", "carro de curativo", "mobiliario medico", "cadeira de banho"],
      },
      {
        codigo: "3504",
        nome: "Escolar",
        palavrasChave: ["mobiliario escolar", "carteira escolar", "conjunto aluno", "cadeira escolar", "mesa escolar", "armario escolar", "mesa de professor", "conjunto escolar infantil"],
      },
      {
        codigo: "3505",
        nome: "Quarto, sala, cozinha, clubes/lazer",
        palavrasChave: ["mobiliario residencial", "cama de solteiro", "beliche", "guarda roupa", "sofa", "mesa de cozinha", "armario de cozinha", "mobiliario de lazer", "conjunto de jardim", "colchao"],
      },
    ],
  },
  PASSAGENS: {
    codigo: "PASSAGENS",
    nome: "Passagens",
    descricao: "Conlicitação: Agenciamento de passagens aéreas",
    subcategorias: [
      {
        codigo: "1901",
        nome: "Agenciamento de passagens aéreas, marítimas e terrestres",
        palavrasChave: ["passagens aereas", "passagem aerea", "passagens rodoviarias", "agenciamento de passagens", "agencia de viagens", "emissao de bilhetes", "passagens maritimas", "reserva e emissao de passagens", "bilhete de passagem"],
      },
    ],
  },
  PETROBRAS: {
    codigo: "PETROBRAS",
    nome: "Petrobras",
    descricao: "Conlicitação: Serviços",
    subcategorias: [
      {
        codigo: "0901",
        nome: "Serviços, peças e equipamentos",
        palavrasChave: ["petrobras", "plataforma de petroleo", "material offshore", "equipamentos para petroleo e gas", "refinaria", "pecas para refinaria", "oleo e gas upstream"],
      },
    ],
  },
  PRESTACAO_DE_SERVICOS_MAO_DE_OBRA: {
    codigo: "PRESTACAO_DE_SERVICOS_MAO_DE_OBRA",
    nome: "PRESTAÇÃO DE SERVIÇOS - Mão de Obra",
    descricao: "Conlicitação: Limpeza; Paisagismo; Coleta de lixo e limpeza urbana",
    subcategorias: [
      {
        codigo: "0301",
        nome: "Limpeza, conservação, predial, hospitalar e higienização",
        palavrasChave: ["limpeza e conservacao", "servicos de limpeza", "limpeza predial", "higienizacao", "limpeza hospitalar", "asseio e conservacao", "servente de limpeza", "auxiliar de servicos gerais", "dedetizacao", "desinsetizacao", "desratizacao", "controle de pragas urbanas"],
      },
      {
        codigo: "0302",
        nome: "Paisagismo, jardinagem, plantio, cortes e podas",
        palavrasChave: ["jardinagem", "paisagismo", "poda de arvores", "plantio", "corte de grama", "capina", "rocada", "manutencao de areas verdes", "manutencao de jardins"],
      },
      {
        codigo: "0303",
        nome: "Coleta de lixo e limpeza urbana",
        palavrasChave: ["coleta de lixo", "coleta de residuos solidos", "limpeza urbana", "varricao de ruas", "coleta de entulho", "caminhao compactador", "limpeza de vias publicas", "lixo urbano"],
      },
      {
        codigo: "0304",
        nome: "Incineração, tratamento de resíduos sólidos",
        palavrasChave: ["incineracao", "tratamento de residuos solidos", "destinacao final de residuos", "aterro sanitario", "residuos de servicos de saude", "coleta de residuos hospitalares", "tratamento de residuos"],
      },
      {
        codigo: "0305",
        nome: "Lavagem de roupa",
        palavrasChave: ["lavagem de roupa", "lavanderia hospitalar", "servico de lavanderia", "lavagem de enxoval", "higienizacao de roupas"],
      },
      {
        codigo: "0306",
        nome: "Limpeza de galerias, dutos, dragagem, desassoreamento",
        palavrasChave: ["limpeza de galerias", "limpeza de bocas de lobo", "dragagem", "desassoreamento", "limpeza de canais", "limpeza de fossas", "limpeza de caixas de gordura", "desentupimento"],
      },
      {
        codigo: "0307",
        nome: "Cercamento e alambrado",
        palavrasChave: ["cercamento", "alambrado", "cerca de arame", "instalacao de cercas", "tela de alambrado", "mourao"],
      },
      {
        codigo: "0308",
        nome: "Leitura de hidrômetros, de energia elétrica e gás, coletor de dados",
        palavrasChave: ["leitura de hidrometros", "leitura de medidores", "coletor de dados", "leitura e entrega de faturas", "leiturista"],
      },
      {
        codigo: "0309",
        nome: "Recursos humanos: ascensorista, copa, porteiro, telefonista e outros",
        palavrasChave: ["ascensorista", "copeira", "porteiro", "recepcionista", "telefonista", "mao de obra terceirizada", "terceirizacao de mao de obra", "apoio administrativo terceirizado", "motorista terceirizado", "auxiliar administrativo terceirizado", "garcom", "cozinheiro", "agente de portaria", "servicos continuados com dedicacao exclusiva de mao de obra"],
      },
      {
        codigo: "0310",
        nome: "Serviços de vigilância, armada e desarmada",
        palavrasChave: ["vigilancia armada", "vigilancia desarmada", "vigilancia patrimonial", "seguranca patrimonial", "servicos de vigilancia", "vigilante", "monitoramento 24h", "ronda motorizada", "portaria remota"],
      },
      {
        codigo: "0311",
        nome: "Serviços de digitação",
        palavrasChave: ["digitacao", "servicos de digitacao", "digitador", "digitalizacao de dados", "alimentacao de sistemas manual"],
      },
      {
        codigo: "0312",
        nome: "Administração de creches e hospitalar",
        palavrasChave: ["administracao de creches", "gestao hospitalar", "gestao de unidade de saude", "gerenciamento de hospital", "organizacao social de saude", "gestao de upa"],
      },
      {
        codigo: "0313",
        nome: "Manuseio, tratamento de documentos, distribuição e entrega",
        palavrasChave: ["manuseio de documentos", "distribuicao e entrega", "entrega de correspondencias", "malote", "servico postal", "tratamento de documentos", "boy de entrega", "protocolo de documentos"],
      },
      {
        codigo: "0314",
        nome: "Estágio, estagiários",
        palavrasChave: ["estagio", "estagiarios", "agente de integracao", "bolsa estagio", "contratacao de estagiarios", "programa de estagio"],
      },
    ],
  },
  PRODUTOS_DE_LIMPEZA: {
    codigo: "PRODUTOS_DE_LIMPEZA",
    nome: "Produtos de Limpeza",
    descricao: "Conlicitação: Produtos de higiene",
    subcategorias: [
      {
        codigo: "2401",
        nome: "Produtos de higiene, limpeza e higiene pessoal",
        palavrasChave: ["produtos de limpeza", "material de limpeza", "detergente", "desinfetante", "agua sanitaria", "sabao em po", "sabonete liquido", "papel higienico", "papel toalha", "saco de lixo", "alcool em gel", "alcool 70", "vassoura", "rodo", "esponja", "higiene pessoal", "lixeira", "hipoclorito", "limpa vidros", "luva de limpeza", "shampoo", "creme dental"],
      },
    ],
  },
  PUBLICIDADE: {
    codigo: "PUBLICIDADE",
    nome: "Publicidade",
    descricao: "Conlicitação: Propaganda; Brindes; Publicações",
    subcategorias: [
      {
        codigo: "3401",
        nome: "Propaganda, assessoria de imprensa",
        palavrasChave: ["publicidade", "propaganda", "agencia de publicidade", "campanha publicitaria", "assessoria de imprensa", "marketing institucional", "criacao publicitaria", "veiculacao de campanha", "comunicacao social", "relacoes publicas"],
      },
      {
        codigo: "3402",
        nome: "Brindes, medalhas, troféus, brasões, distintivos",
        palavrasChave: ["brindes", "medalhas", "trofeus", "brasoes", "distintivos", "bottons", "chaveiros personalizados", "canetas personalizadas", "placas de homenagem", "ecobag", "squeeze personalizado"],
      },
      {
        codigo: "3403",
        nome: "Publicações, divulgação, clipping, radiodifusão, assinaturas",
        palavrasChave: ["publicacao oficial", "divulgacao de atos", "clipping", "radiodifusao", "assinatura de jornal", "assinatura de revista", "publicacao em diario oficial", "veiculacao em radio", "insercao em jornal", "publicacoes legais"],
      },
      {
        codigo: "3404",
        nome: "Exploração de espaço publicitário",
        palavrasChave: ["exploracao de espaco publicitario", "mobiliario urbano publicitario", "outdoor", "painel publicitario", "publicidade em abrigos", "espaco publicitario"],
      },
    ],
  },
  QUIMICOS: {
    codigo: "QUIMICOS",
    nome: "Químicos",
    descricao: "Conlicitação: Químicos e produtos para tratamento de água e produtos especiais",
    subcategorias: [
      {
        codigo: "2101",
        nome: "Químicos e produtos para tratamento de água e produtos especiais",
        palavrasChave: ["produtos quimicos", "sulfato de aluminio", "cloro granulado", "hipoclorito de sodio", "policloreto de aluminio", "produtos para tratamento de agua", "reagentes quimicos", "soda caustica", "acido sulfurico", "floculante", "algicida", "produtos para piscina"],
      },
    ],
  },
  SAUDE: {
    codigo: "SAUDE",
    nome: "Saúde",
    descricao: "Conlicitação: Medicamentos; Materiais; Equipamentos e instrumentos",
    subcategorias: [
      {
        codigo: "2201",
        nome: "Medicamentos",
        palavrasChave: ["medicamento", "medicamentos", "farmaco", "farmacos", "farmacia basica", "antibiotico", "antibioticos", "analgesico", "injetavel", "injetaveis", "comprimido", "amoxicilina", "dipirona", "insulina", "vacina", "vacinas", "soro fisiologico", "psicotropico", "anti hipertensivo", "xarope", "pomada", "ampola", "medicamentos controlados", "componente basico da assistencia farmaceutica"],
      },
      {
        codigo: "2202",
        nome: "Materiais, produtos e utensílios médico, hospitalar e laboratorial",
        palavrasChave: ["material hospitalar", "materiais hospitalares", "material medico hospitalar", "medico hospitalar", "material ambulatorial", "materiais ambulatoriais", "insumos hospitalares", "seringa", "seringas", "agulha", "luva de procedimento", "luvas cirurgicas", "gaze", "cateter", "cateteres", "esparadrapo", "atadura", "curativo", "mascara cirurgica", "sonda", "material odontologico", "reagentes laboratoriais", "material laboratorial", "descartaveis hospitalares", "campo cirurgico", "equipo de soro", "fralda geriatrica", "bisturi", "insumos para saude"],
      },
      {
        codigo: "2203",
        nome: "Equipamentos e instrumentos, hospitalares, laboratoriais e científicos",
        palavrasChave: ["equipamento hospitalar", "equipamentos hospitalares", "equipamento medico", "equipamentos medicos", "aparelho de raio x", "autoclave", "desfibrilador", "monitor multiparametrico", "ventilador pulmonar", "ultrassom", "eletrocardiografo", "cadeira odontologica", "oximetro", "equipamento odontologico", "analisador bioquimico", "microscopio", "centrifuga laboratorial", "tomografo", "ressonancia magnetica", "bomba de infusao", "incubadora neonatal", "estetoscopio", "esfigmomanometro", "equipamentos laboratoriais"],
      },
      {
        codigo: "2204",
        nome: "Serviços: engenharia clínica, exame médico ocupacional, admissional, serviços médicos e análises laboratoriais",
        palavrasChave: ["engenharia clinica", "exame medico ocupacional", "exame admissional", "servicos medicos", "plantao medico", "analises laboratoriais", "exames laboratoriais", "exames de imagem", "servico de hemodialise", "consultas medicas especializadas", "manutencao de equipamentos medicos", "servicos de saude", "clinica credenciada", "procedimentos cirurgicos eletivos", "saude ocupacional", "pcmso", "servico de anatomia patologica", "atendimento medico"],
      },
      {
        codigo: "2205",
        nome: "Gases",
        palavrasChave: ["gases medicinais", "gas medicinal", "oxigenio medicinal", "oxigenio hospitalar", "cilindro de oxigenio", "oxido nitroso", "ar comprimido medicinal", "gases hospitalares", "concentrador de oxigenio", "usina de oxigenio", "gas hospitalar"],
      },
      {
        codigo: "2206",
        nome: "Filmes, raio -x, radiológicos",
        palavrasChave: ["filme radiografico", "filmes radiologicos", "chapa de raio x", "revelador radiografico", "fixador radiografico", "material radiologico", "avental de chumbo", "radiologia", "colimador", "filmes de raio x"],
      },
      {
        codigo: "2207",
        nome: "Dieta enteral e parenteral",
        palavrasChave: ["dieta enteral", "dieta parenteral", "nutricao enteral", "nutricao parenteral", "formula infantil", "formulas enterais", "suplemento nutricional", "formula lactea", "modulo nutricional", "fornecimento de dieta"],
      },
    ],
  },
  SEGURANCA_PROTECAO: {
    codigo: "SEGURANCA_PROTECAO",
    nome: "Segurança/Proteção",
    descricao: "Conlicitação: Equipamentos e produtos de proteção individual; Armas",
    subcategorias: [
      {
        codigo: "1501",
        nome: "Equipamentos e produtos de proteção individual",
        palavrasChave: ["equipamento de protecao individual", "equipamentos de protecao individual", "epi", "epis", "capacete de seguranca", "bota de seguranca", "luva de seguranca", "oculos de protecao", "protetor auricular", "mascara pff2", "colete refletivo", "cinto de seguranca", "respirador", "roupa de protecao", "perneira", "avental de raspa", "uniforme de protecao", "equipamento de protecao coletiva", "epc"],
      },
      {
        codigo: "1502",
        nome: "Armas, munições, bélicos e explosivos",
        palavrasChave: ["armas", "arma de fogo", "municao", "municoes", "belicos", "explosivos", "colete a prova de balas", "pistola", "revolver", "gas lacrimogeneo", "armamento nao letal", "espingarda calibre", "cartucho calibre", "algema", "espargidor de pimenta", "taser", "equipamento tatico"],
      },
    ],
  },
  SEGUROS: {
    codigo: "SEGUROS",
    nome: "Seguros",
    descricao: "Conlicitação: Seguros; Assistência Médica",
    subcategorias: [
      {
        codigo: "1601",
        nome: "Seguros",
        palavrasChave: ["seguro", "seguros", "apolice", "seguro de veiculos", "seguro patrimonial", "seguro de vida em grupo", "seguradora", "corretagem de seguros", "seguro predial", "seguro de responsabilidade civil", "seguro garantia", "seguro viagem"],
      },
      {
        codigo: "1602",
        nome: "Assistência Médica",
        palavrasChave: ["assistencia medica", "plano de saude", "plano de assistencia medica", "plano odontologico", "assistencia a saude suplementar", "operadora de plano de saude", "plano de saude coletivo", "auxilio saude"],
      },
    ],
  },
  SISTEMA_DE_VALES: {
    codigo: "SISTEMA_DE_VALES",
    nome: "Sistema de Vales",
    descricao: "Conlicitação: Refeição",
    subcategorias: [
      {
        codigo: "2601",
        nome: "Refeição, combustível, transporte",
        palavrasChave: ["vale refeicao", "vale alimentacao", "auxilio alimentacao", "vale transporte", "vale combustivel", "cartao alimentacao", "cartao refeicao", "gerenciamento de beneficios", "administracao de beneficios", "tickets alimentacao", "cartao beneficio", "gerenciamento de abastecimento por cartao", "cartao combustivel", "cartao de abastecimento"],
      },
    ],
  },
  TRANSPORTES_AEREOS: {
    codigo: "TRANSPORTES_AEREOS",
    nome: "Transportes Aéreos",
    descricao: "Conlicitação: Aquisição",
    subcategorias: [
      {
        codigo: "1721",
        nome: "Aquisição, locação, manutenção e peças para aviões, helicópteros e equipamentos aéreos, transporte internacional",
        palavrasChave: ["aeronave", "aeronaves", "aviao", "avioes", "helicoptero", "helicopteros", "pecas para aeronaves", "manutencao de aeronaves", "locacao de aeronave", "transporte aereo", "transporte aereo internacional", "equipamentos aeronauticos", "voo fretado", "taxi aereo", "asa rotativa", "aeronave remotamente pilotada", "hangaragem"],
      },
    ],
  },
  TRANSPORTES_NAUTICOS: {
    codigo: "TRANSPORTES_NAUTICOS",
    nome: "Transportes Náuticos",
    descricao: "Conlicitação: Aquisição; Docagem; Balsas",
    subcategorias: [
      {
        codigo: "1711",
        nome: "Aquisição, locação, manutenção e peças de equipamentos náuticos, transporte marítimo/fluvial",
        palavrasChave: ["embarcacao", "embarcacoes", "lancha", "barco", "navio", "transporte fluvial", "transporte maritimo", "equipamentos nauticos", "manutencao naval", "motor de popa", "bote inflavel", "pecas navais", "transporte escolar fluvial", "locacao de embarcacao", "voadeira", "barco ambulancia"],
      },
      {
        codigo: "1712",
        nome: "Docagem",
        palavrasChave: ["docagem", "docagem de embarcacao", "dique seco", "reparo naval", "estaleiro", "docagem de navio"],
      },
      {
        codigo: "1713",
        nome: "Balsas",
        palavrasChave: ["balsa", "balsas", "travessia por balsa", "ferry boat", "operacao de balsa", "locacao de balsa", "balsa de travessia", "transporte em balsa"],
      },
    ],
  },
  TRANSPORTES_RODOVIARIOS: {
    codigo: "TRANSPORTES_RODOVIARIOS",
    nome: "Transportes Rodoviários",
    descricao: "Conlicitação: Aquisição de veículos; Serviços de locação de veículos; Serviços de moto-boy e transporte: passageiros",
    subcategorias: [
      {
        codigo: "1701",
        nome: "Aquisição de veículos, caminhões, ônibus, ambulâncias, motos",
        palavrasChave: ["aquisicao de veiculos", "aquisicao de veiculo", "veiculo zero km", "veiculos zero km", "veiculo 0km", "caminhao", "caminhonete", "onibus", "micro onibus", "ambulancia", "ambulancias", "motocicleta", "motocicletas", "van", "automovel", "veiculo tipo", "viatura", "viaturas", "veiculo utilitario", "pick up", "caminhao coletor", "onibus escolar", "veiculos novos", "aquisicao de caminhoes"],
      },
      {
        codigo: "1702",
        nome: "Serviços de locação de veículos, motos",
        palavrasChave: ["locacao de veiculos", "locacao de veiculo", "aluguel de veiculos", "locacao de motocicletas", "locacao de frota", "locacao de automoveis", "locacao de van", "locacao de onibus", "locacao de caminhao", "locacao de carros", "locacao de veiculos com motorista", "locacao de veiculo leve"],
      },
      {
        codigo: "1703",
        nome: "Serviços de moto-boy e transporte: passageiros, documentos",
        palavrasChave: ["moto boy", "motoboy", "servico de motofrete", "transporte de passageiros", "transporte escolar", "transporte de documentos", "transporte de pacientes", "tfd", "transporte de alunos", "transporte rodoviario de passageiros", "fretamento de onibus", "fretamento", "transporte coletivo", "transporte sanitario"],
      },
      {
        codigo: "1704",
        nome: "Serviços de transportes de valores",
        palavrasChave: ["transporte de valores", "carro forte", "transporte de numerario", "custodia de valores", "malote de valores", "escolta armada"],
      },
      {
        codigo: "1705",
        nome: "Manutenção, peças e pneus, veículos, caminhões, ônibus, ambulâncias, motos",
        palavrasChave: ["manutencao de veiculos", "manutencao de frota", "manutencao preventiva de veiculos", "manutencao corretiva de veiculos", "manutencao veicular", "manutencao de caminhoes", "oficina mecanica", "pecas automotivas", "pecas para veiculos", "autopecas", "pneu", "pneus", "camara de ar", "recapagem", "alinhamento e balanceamento", "funilaria e pintura", "bateria automotiva", "filtro de oleo", "pastilha de freio", "amortecedor", "borracharia", "reparo de motor", "gerenciamento de manutencao de frota", "revisao de veiculos", "auto eletrica", "lavagem de veiculos", "servicos de mecanica", "acessorios automotivos", "retifica de motores"],
      },
      {
        codigo: "1706",
        nome: "Carroceria, guinchos, guindastes",
        palavrasChave: ["carroceria", "carrocerias", "guincho", "guinchos", "guindaste", "guindastes", "munck", "reboque de veiculos", "servico de guincho", "plataforma de guincho", "implemento rodoviario", "carroceria de madeira", "basculante", "caixa compactadora", "carroceria tipo bau", "carroceria graneleira"],
      },
      {
        codigo: "1707",
        nome: "Aquisição/serviços de caminhão pipa",
        palavrasChave: ["caminhao pipa", "carro pipa", "operacao carro pipa", "abastecimento de agua por caminhao pipa", "locacao de caminhao pipa", "transporte de agua potavel", "tanque pipa"],
      },
      {
        codigo: "1708",
        nome: "Transporte de cargas: terrestre/aéreo/marítimo",
        palavrasChave: ["transporte de cargas", "transporte de carga", "frete", "servico de frete", "transporte de mercadorias", "transporte de mudancas", "mudanca", "transporte rodoviario de cargas", "logistica de transporte", "transporte de materiais", "transportadora", "transporte de equipamentos", "carga fracionada", "logistica de distribuicao", "entrega de mercadorias"],
      },
    ],
  },
};

/** Índice reverso: código de subatividade → macro-categoria. */
export const MACRO_POR_SUBCATEGORIA: Readonly<Record<string, MacroSegmento>> = Object.freeze(
  Object.fromEntries(
    Object.values(CATALOGO_MACRO_SEGMENTOS).flatMap((macro) =>
      macro.subcategorias.map((sub) => [sub.codigo, macro.codigo] as const),
    ),
  ),
);

export const classificacaoSegmentoSchema = z.object({
  macro: MacroSegmentoEnum,
  subcategorias: z.array(z.string()).default([]),
  score: z.number().min(0).default(0),
  termosCorrespondentes: z.array(z.string()).default([]),
});

export type ClassificacaoSegmento = z.infer<typeof classificacaoSegmentoSchema>;

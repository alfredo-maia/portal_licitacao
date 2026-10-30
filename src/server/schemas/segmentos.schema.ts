import { z } from "zod";

/**
 * Taxonomia Oficial de 2 Níveis - 7 Macro-Segmentos (PRD §1.2 / Plano Mestre SaaS Multi-Tenant)
 */
export const MacroSegmentoEnum = z.enum([
  "SAUDE_MEDICAMENTOS_HOSPITALAR",
  "AUTOMOTIVO_PECAS_FROTAS",
  "OBRAS_CONSTRUCAO_MANUTENCAO",
  "ALIMENTOS_MERENDA_ESCOLAR",
  "TECNOLOGIA_TELECOM",
  "SERVICOS_TERCEIRIZADOS_OPERACIONAIS",
  "MATERIAIS_ESCRITORIO_SUPRIMENTOS",
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
  SAUDE_MEDICAMENTOS_HOSPITALAR: {
    codigo: "SAUDE_MEDICAMENTOS_HOSPITALAR",
    nome: "Saúde, Medicamentos & Hospitalar",
    descricao: "Medicamentos, insumos médicos, hospitalares, descartáveis e gases medicinais",
    subcategorias: [
      {
        codigo: "MEDICAMENTOS_FARMACOS",
        nome: "Medicamentos & Fármacos",
        palavrasChave: ["medicamento", "fármaco", "comprimido", "injetável", "antibiótico", "anestésico", "xarope", "ampola", "dose", "cápsula", "insulina", "soro", "pomada"],
      },
      {
        codigo: "MATERIAIS_HOSPITALARES_DESCARTAVEIS",
        nome: "Materiais Hospitalares & Descartáveis",
        palavrasChave: [
          "material hospitalar",
          "materiais hospitalares",
          "seringa",
          "seringas",
          "luva de procedimento",
          "luvas de procedimento",
          "gaze",
          "algodão",
          "cateter",
          "cateteres",
          "agulha",
          "agulhas",
          "esparadrapo",
          "máscara cirúrgica",
          "máscaras cirúrgicas",
          "bisturi",
          "scalp",
          "atadura",
          "sonda",
          "descartáveis",
          "descartaveis",
        ],
      },
      {
        codigo: "EQUIPAMENTOS_MEDICOS_ODONTOLOGICOS",
        nome: "Equipamentos Médicos & Odontológicos",
        palavrasChave: ["raio-x", "autoclave", "monitor multiparamétrico", "cadeira odontológica", "desfibrilador", "eletrocardiografo", "ventilador pulmonar", "ultrassom", "estetoscópio"],
      },
      {
        codigo: "GASES_MEDICINAIS",
        nome: "Gases Medicinais",
        palavrasChave: ["oxigênio hospitalar", "oxigenio medicinal", "cilindro de oxigênio", "óxido nitroso", "ar comprimido medicinal", "nitrogênio medicinal"],
      },
    ],
  },
  AUTOMOTIVO_PECAS_FROTAS: {
    codigo: "AUTOMOTIVO_PECAS_FROTAS",
    nome: "Automotivo, Peças & Frotas",
    descricao: "Pneus, peças automotivas, lubrificantes e manutenção mecânica de veículos",
    subcategorias: [
      {
        codigo: "PNEUS_CAMARAS_RECAPAGEM",
        nome: "Pneus, Câmaras & Recapagem",
        palavrasChave: ["pneu", "pneus", "câmara de ar", "recapagem", "vulcanização", "aro 14", "aro 15", "aro 16", "aro 17", "radial", "pneu pesado", "pneu agrícola"],
      },
      {
        codigo: "PECAS_AUTOMOTIVAS_ACESSORIOS",
        nome: "Peças Automotivas & Acessórios",
        palavrasChave: ["filtro de óleo", "filtro de ar", "pastilha de freio", "amortecedor", "suspensão", "bateria automotiva", "correia dentada", "vela de ignição", "disco de freio", "farol", "escapamento"],
      },
      {
        codigo: "OLEOS_LUBRIFICANTES_FLUIDOS",
        nome: "Óleos Lubrificantes, Fluidos & Graxas",
        palavrasChave: ["óleo lubrificante", "fluido de freio", "graxa automotiva", "aditivo de radiador", "óleo mineral", "óleo sintético", "15w40", "5w30", "óleo de motor"],
      },
      {
        codigo: "SERVICOS_MECANICOS_MANUTENCAO",
        nome: "Serviços Mecânicos & Manutenção de Frotas",
        palavrasChave: ["manutenção preventiva veicular", "mecânica pesada", "alinhamento e balanceamento", "revisão de frota", "auto elétrica", "reparo de motor", "guincho", "funilaria"],
      },
    ],
  },
  OBRAS_CONSTRUCAO_MANUTENCAO: {
    codigo: "OBRAS_CONSTRUCAO_MANUTENCAO",
    nome: "Obras, Construção Civil & Manutenção",
    descricao: "Materiais básicos, engenharia, pavimentação, instalações elétricas e hidráulicas",
    subcategorias: [
      {
        codigo: "MATERIAIS_BASICOS_CONSTRUCAO",
        nome: "Materiais Básicos de Construção",
        palavrasChave: ["cimento", "areia", "tijolo", "brita", "argamassa", "ferragem armada", "tinta acrílica", "verniz", "bloco cerâmico", "telha", "concreto usinado"],
      },
      {
        codigo: "OBRAS_ENGENHARIA_PAVIMENTACAO",
        nome: "Obras de Engenharia & Pavimentação",
        palavrasChave: ["pavimentação asfáltica", "recapeamento", "drenagem pluvial", "reforma predial", "construção de ponte", "terraplanagem", "obra de engenharia", "contenção de encosta"],
      },
      {
        codigo: "MATERIAIS_ELETRICOS_ILUMINACAO",
        nome: "Materiais Elétricos & Iluminação Pública",
        palavrasChave: ["cabo elétrico", "fio condutor", "disjuntor", "transformador", "luminária led", "poste de concreto", "iluminação pública", "reator", "quadro de comando", "chave blindada"],
      },
      {
        codigo: "MATERIAIS_HIDRAULICOS_SANEAMENTO",
        nome: "Materiais Hidráulicos & Saneamento",
        palavrasChave: ["tubo pvc", "conexão hidráulica", "caixa d'água", "bomba centrífuga", "registro de gaveta", "hidrômetro", "válvula de retenção", "esgoto", "tubulação pead"],
      },
    ],
  },
  ALIMENTOS_MERENDA_ESCOLAR: {
    codigo: "ALIMENTOS_MERENDA_ESCOLAR",
    nome: "Alimentos & Merenda Escolar",
    descricao: "Gêneros não-perecíveis, hortifrúti, carnes, laticínios, panificação e nutrição",
    subcategorias: [
      {
        codigo: "GENEROS_NAO_PERECIVEIS",
        nome: "Gêneros Não-Perecíveis",
        palavrasChave: ["arroz", "feijão", "açúcar cristal", "óleo de soja", "macarrão", "farinha de trigo", "café em pó", "molho de tomate", "sal refinado", "leite em pó", "biscoito"],
      },
      {
        codigo: "HORTIFRUTI_FRESCO",
        nome: "Hortifrúti Fresco",
        palavrasChave: ["hortifruti", "fruta", "verdura", "legume", "banana", "tomate", "cebola", "alface", "laranja", "maçã", "agricultura familiar", "cenoura", "batata"],
      },
      {
        codigo: "CARNES_AVES_PEIXES_FRIOS",
        nome: "Carnes, Aves, Peixes & Frios",
        palavrasChave: ["carne bovina", "frango congelado", "peixe congelado", "leite pasteurizado", "queijo", "manteiga", "ovo", "filé de peito", "carne moída", "iogurte"],
      },
      {
        codigo: "PANIFICACAO_LANCHES",
        nome: "Panificação & Lanches",
        palavrasChave: ["pão francês", "pão de forma", "bolo confeitado", "biscoito doce", "polpa de fruta", "sucos concentrados", "lanche escolar"],
      },
    ],
  },
  TECNOLOGIA_TELECOM: {
    codigo: "TECNOLOGIA_TELECOM",
    nome: "Tecnologia da Informação & Telecom",
    descricao: "Equipamentos de informática, softwares, computação em nuvem, conectividade e suporte",
    subcategorias: [
      {
        codigo: "EQUIPAMENTOS_HARDWARE",
        nome: "Equipamentos & Hardware",
        palavrasChave: ["computador", "notebook", "servidor", "nobreak", "monitor 24", "scanner", "impressora multifuncional", "workstation", "desktop", "memória ram", "ssd"],
      },
      {
        codigo: "SOFTWARES_SAAS_LICENCAS",
        nome: "Softwares, SaaS & Licenças",
        palavrasChave: ["licenciamento de software", "sistema de gestão", "software erp", "licença microsoft", "portal web", "antivírus", "banco de dados", "plataforma saas", "desenvolvimento de software"],
      },
      {
        codigo: "REDES_TELECOMUNICACOES",
        nome: "Redes & Telecomunicações",
        palavrasChave: ["fibra óptica", "switch gerenciável", "roteador corporativo", "link de internet dedicado", "telefonia voip", "cabeamento estruturado", "pabx", "wifi corporativo"],
      },
      {
        codigo: "SERVICOS_TECNICOS_TI",
        nome: "Serviços Técnicos de Suporte & Manutenção de TI",
        palavrasChave: ["suporte técnico em informática", "manutenção de computadores", "outsourcing de ti", "service desk", "gestão de infraestrutura ti", "backup em nuvem"],
      },
    ],
  },
  SERVICOS_TERCEIRIZADOS_OPERACIONAIS: {
    codigo: "SERVICOS_TERCEIRIZADOS_OPERACIONAIS",
    nome: "Serviços Terceirizados & Operacionais",
    descricao: "Limpeza predial, vigilância patrimonial, portaria, recepção e locação de maquinário",
    subcategorias: [
      {
        codigo: "LIMPEZA_CONSERVACAO_PREDIAL",
        nome: "Limpeza, Conservação & Higienização Predial",
        palavrasChave: ["limpeza e conservação", "serviço de higienização predial", "copeiragem", "faxina", "zeladoria", "dedetização", "sanitização ambiental"],
      },
      {
        codigo: "VIGILANCIA_SEGURANCA_ELETRONICA",
        nome: "Vigilância Armada, Desarmada & Segurança Eletrônica",
        palavrasChave: ["vigilância armada", "vigilância desarmada", "segurança patrimonial", "circuito fechado cftv", "monitoramento 24h", "alarme patrimonial", "portaria remota"],
      },
      {
        codigo: "PORTARIA_RECEPCAO_APOIO",
        nome: "Portaria, Recepção & Apoio Administrativo",
        palavrasChave: ["porteiro", "recepcionista", "apoio administrativo terceirizado", "motorista terceirizado", "telefonista", "mensageiro"],
      },
      {
        codigo: "LOCACAO_MAQUINAS_VEICULOS",
        nome: "Locação de Máquinas & Veículos Pesados",
        palavrasChave: ["locação de caminhão", "caminhão pipa", "retroescavadeira", "pá carregadeira", "locação de van", "locação de veículo leve", "caçamba"],
      },
    ],
  },
  MATERIAIS_ESCRITORIO_SUPRIMENTOS: {
    codigo: "MATERIAIS_ESCRITORIO_SUPRIMENTOS",
    nome: "Materiais de Escritório, Mobiliário & Suprimentos",
    descricao: "Papelaria, mobiliário corporativo, descartáveis, uniformes e EPIs",
    subcategorias: [
      {
        codigo: "PAPELARIA_MATERIAL_ESCOLAR",
        nome: "Papelaria & Material Escolar/Escritório",
        palavrasChave: ["papel a4", "caneta esferográfica", "pasta suspensa", "cartucho de toner", "caderno escolar", "grampeador", "lápis de cor", "borracha", "tesoura escolar", "envelope"],
      },
      {
        codigo: "MOBILIARIO_CORPORATIVO_ESCOLAR",
        nome: "Mobiliário Corporativo & Escolar",
        palavrasChave: ["carteira escolar", "mesa de escritório", "cadeira giratória", "armário de aço", "estante", "longarina", "gaveteiro", "quadro branco", "poltrona"],
      },
      {
        codigo: "MATERIAIS_LIMPEZA_DESCARTAVEIS",
        nome: "Materiais de Limpeza & Descartáveis",
        palavrasChave: ["saco de lixo", "papel toalha", "papel higiênico", "detergente", "água sanitária", "desinfetante", "sabão em pó", "copo descartável", "vassoura", "rodo"],
      },
      {
        codigo: "UNIFORMES_CALCADOS_EPIS",
        nome: "Uniformes Profissionais, Calçados & EPIs",
        palavrasChave: ["uniforme profissional", "camisa polo uniforme", "bota de segurança", "calçado de segurança", "óculos de proteção", "capacete de segurança", "colete refletivo", "protetor auricular"],
      },
    ],
  },
};

export const classificacaoSegmentoSchema = z.object({
  macro: MacroSegmentoEnum,
  subcategorias: z.array(z.string()).default([]),
  score: z.number().min(0).default(0),
  termosCorrespondentes: z.array(z.string()).default([]),
});

export type ClassificacaoSegmento = z.infer<typeof classificacaoSegmentoSchema>;

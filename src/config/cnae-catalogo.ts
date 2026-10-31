/**
 * Catálogo Oficial de CNAEs do IBGE mais frequentes em Compras Públicas e Licitações.
 */

export interface CnaeItem {
  codigo: string;
  descricao: string;
}

export const CATALOGO_CNAE: CnaeItem[] = [
  // Alimentos e Bebidas
  { codigo: "1011-2/01", descricao: "Frigorífico - abate de bovinos" },
  { codigo: "1012-1/01", descricao: "Abate de aves" },
  { codigo: "1031-7/00", descricao: "Fabricação de conservas de frutas" },
  { codigo: "1032-5/99", descricao: "Fabricação de conservas de legumes e outros vegetais" },
  { codigo: "1052-0/00", descricao: "Fabricação de laticínios" },
  { codigo: "1064-3/00", descricao: "Fabricação de farinha de milho e derivados" },
  { codigo: "1091-1/01", descricao: "Fabricação de produtos de panificação industrial" },
  { codigo: "1091-1/02", descricao: "Fabricação de produtos de padaria e confeitaria com predominância de produção própria" },
  { codigo: "1096-1/00", descricao: "Fabricação de alimentos e pratos prontos" },
  { codigo: "4639-7/01", descricao: "Comércio atacadista de produtos alimentícios em geral" },
  { codigo: "4637-1/99", descricao: "Comércio atacadista especializado em outros produtos alimentícios" },
  { codigo: "4711-3/02", descricao: "Comércio varejista de mercadorias em geral, com predominância de produtos alimentícios - supermercados" },
  { codigo: "4721-1/02", descricao: "Padaria e confeitaria com predominância de revenda" },
  { codigo: "5620-1/01", descricao: "Fornecimento de alimentos preparados preponderantemente para empresas" },
  { codigo: "5620-1/02", descricao: "Serviços de alimentação para eventos e recepções - bufê" },

  // Saúde, Farmácia e Medicamentos
  { codigo: "2121-1/01", descricao: "Fabricação de medicamentos alopáticos para uso humano" },
  { codigo: "2123-8/00", descricao: "Fabricação de preparações farmacêuticas" },
  { codigo: "3250-7/01", descricao: "Fabricação de instrumentos não-eletrônicos e utensílios para uso médico, cirúrgico, odontológico e de laboratório" },
  { codigo: "3250-7/05", descricao: "Fabricação de materiais para medicina e odontologia" },
  { codigo: "4644-3/01", descricao: "Comércio atacadista de medicamentos e drogas de uso humano" },
  { codigo: "4645-1/01", descricao: "Comércio atacadista de instrumentos e materiais para uso médico, cirúrgico, hospitalar e de laboratórios" },
  { codigo: "4771-7/01", descricao: "Comércio varejista de produtos farmacêuticos, sem manipulação de fórmulas" },
  { codigo: "8610-1/01", descricao: "Atividades de atendimento hospitalar, exceto pronto-socorro e unidades para atendimento a urgências" },
  { codigo: "8621-6/00", descricao: "UTI móvel e serviços móveis de atendimento a urgências" },
  { codigo: "8640-2/02", descricao: "Laboratórios de anatomia patológica e citológica" },

  // Tecnologia da Informação, Software e Telecomunicações
  { codigo: "6201-5/01", descricao: "Desenvolvimento de programas de computador sob encomenda" },
  { codigo: "6202-3/00", descricao: "Desenvolvimento e licenciamento de programas de computador customizáveis" },
  { codigo: "6203-1/00", descricao: "Desenvolvimento e licenciamento de programas de computador não-customizáveis" },
  { codigo: "6204-0/00", descricao: "Consultoria em tecnologia da informação" },
  { codigo: "6209-1/00", descricao: "Suporte técnico, manutenção e outros serviços em tecnologia da informação" },
  { codigo: "6311-9/00", descricao: "Tratamento de dados, provedores de serviços de aplicação e serviços de hospedagem na internet" },
  { codigo: "6319-4/00", descricao: "Portais, provedores de conteúdo e outros serviços de informação na internet" },
  { codigo: "6190-6/01", descricao: "Provedores de acesso às redes de comunicações" },
  { codigo: "4651-6/01", descricao: "Comércio atacadista de equipamentos de informática" },
  { codigo: "4751-2/01", descricao: "Comércio varejista especializado de equipamentos e suprimentos de informática" },

  // Engenharia, Obras e Construção Civil
  { codigo: "4120-4/00", descricao: "Construção de edifícios" },
  { codigo: "4211-1/01", descricao: "Construção de rodovias e ferrovias" },
  { codigo: "4213-8/00", descricao: "Obras de urbanização - ruas, praças e calçadas" },
  { codigo: "4222-7/01", descricao: "Construção de redes de abastecimento de água, coleta de esgoto e construções correlatas" },
  { codigo: "4321-5/00", descricao: "Instalação e manutenção elétrica" },
  { codigo: "4322-3/01", descricao: "Instalações hidráulicas, sanitárias e de gás" },
  { codigo: "7112-0/00", descricao: "Serviços de engenharia" },
  { codigo: "7111-2/00", descricao: "Serviços de arquitetura" },

  // Serviços Terceirizados, Limpeza, Segurança e Conservação
  { codigo: "8121-4/00", descricao: "Limpeza em prédios e em domicílios" },
  { codigo: "8129-0/00", descricao: "Atividades de limpeza não especificadas anteriormente" },
  { codigo: "8130-3/00", descricao: "Atividades paisagísticas" },
  { codigo: "8011-1/01", descricao: "Atividades de vigilância e segurança privada" },
  { codigo: "8020-0/01", descricao: "Atividades de monitoramento de sistemas de segurança eletrônico" },
  { codigo: "7820-5/00", descricao: "Locação de mão-de-obra temporária" },
  { codigo: "8211-3/00", descricao: "Serviços combinados de escritório e apoio administrativo" },

  // Transporte, Logística e Locação de Veículos
  { codigo: "4923-0/02", descricao: "Serviço de transporte de passageiros - locação de automóveis com motorista" },
  { codigo: "4924-8/00", descricao: "Transporte escolar" },
  { codigo: "4930-2/02", descricao: "Transporte rodoviário de carga, exceto produtos perigosos e mudanças, intermunicipal, interestadual e internacional" },
  { codigo: "7711-0/00", descricao: "Locação de automóveis sem condutor" },
  { codigo: "7732-2/01", descricao: "Aluguel de máquinas e equipamentos para construção sem operador" },

  // Material de Escritório, Escolar, Mobiliário e Gráfica
  { codigo: "1811-3/02", descricao: "Impressão de livros, revistas e outras publicações periódicas" },
  { codigo: "1813-0/01", descricao: "Impressão de material para uso publicitário" },
  { codigo: "3101-2/00", descricao: "Fabricação de móveis com predominância de madeira" },
  { codigo: "4647-8/01", descricao: "Comércio atacadista de artigos de escritório e de papelaria" },
  { codigo: "4761-0/03", descricao: "Comércio varejista de artigos de papelaria" },

  // Combustíveis e Lubrificantes
  { codigo: "4681-8/01", descricao: "Comércio atacadista de álcool carburante, biodiesel, gasolina e demais derivados de petróleo" },
  { codigo: "4681-8/05", descricao: "Comércio atacadista de lubrificantes" },
  { codigo: "4731-8/00", descricao: "Comércio varejista de combustíveis para veículos automotores" },
];

export function buscarCnaes(query: string, limite = 20): CnaeItem[] {
  if (!query || !query.trim()) {
    return CATALOGO_CNAE.slice(0, limite);
  }

  const termo = query.trim().toLowerCase();
  const termoLimpo = termo.replace(/\D/g, "");

  return CATALOGO_CNAE.filter((c) => {
    const matchDesc = c.descricao.toLowerCase().includes(termo);
    const matchCod = termoLimpo ? c.codigo.replace(/\D/g, "").includes(termoLimpo) : c.codigo.toLowerCase().includes(termo);
    return matchDesc || matchCod;
  }).slice(0, limite);
}

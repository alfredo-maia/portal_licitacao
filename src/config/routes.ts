export interface AppRoute {
  readonly order: number;
  readonly id: string;
  readonly path: string;
  readonly href: string;
  readonly label: string;
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly badge?: "Em breve";
  readonly isPlaceholder?: boolean;
}

export const APP_ROUTES: readonly AppRoute[] = [
  {
    order: 1,
    id: "dashboard",
    path: "/dashboard",
    href: "/dashboard",
    label: "Dashboard",
    name: "Dashboard",
    title: "Dashboard",
    description:
      "Visão executiva mensal, 4 cards de topo, indicadores de resultado e Top 4 histórico.",
  },
  {
    order: 2,
    id: "oportunidades",
    path: "/oportunidades",
    href: "/oportunidades",
    label: "Oportunidades",
    name: "Oportunidades",
    title: "Oportunidades",
    description:
      "Tabela ordenada por abertura para decisão de participação e cadastro manual.",
  },
  {
    order: 3,
    id: "minhas-licitacoes",
    path: "/minhas-licitacoes",
    href: "/minhas-licitacoes",
    label: "Minhas Licitações",
    name: "Minhas Licitações",
    title: "Minhas Licitações",
    description:
      "Funil operacional das oportunidades em andamento.",
  },
  {
    order: 4,
    id: "calendario",
    path: "/calendario",
    href: "/calendario",
    label: "Calendário",
    name: "Calendário",
    title: "Calendário",
    description:
      "Grade mensal de certames (chips normais/opacos) e alertas de validade de certidões.",
  },
  {
    order: 5,
    id: "portais",
    path: "/portais",
    href: "/portais",
    label: "Portais de Licitações",
    name: "Portais de Licitações",
    title: "Portais de Licitações",
    description:
      "Gestão de credenciais, anuidades e alertas de renovação.",
  },
  {
    order: 6,
    id: "documentacao",
    path: "/documentacao",
    href: "/documentacao",
    label: "Documentação",
    name: "Documentação",
    title: "Documentação",
    description:
      "Repositório de certidões, balanços, diplomas e atestados (ACT) com alerta vermelho/negrito.",
  },
  {
    order: 7,
    id: "declaracoes",
    path: "/declaracoes",
    href: "/declaracoes",
    label: "Declarações",
    name: "Declarações",
    title: "Declarações",
    description:
      "Gerador de modelos oficiais.",
  },
  {
    order: 8,
    id: "impugnacoes",
    path: "/impugnacoes",
    href: "/impugnacoes",
    label: "Impugnações",
    name: "Impugnações",
    title: "Impugnações",
    description:
      "Controle de petições com cálculo automático do prazo de 3 dias úteis (Lei 14.133).",
  },
  {
    order: 9,
    id: "robo-de-lances",
    path: "/robo-de-lances",
    href: "/robo-de-lances",
    label: "Robô de Lances",
    name: "Robô de Lances",
    title: "Robô de Lances",
    description: "Placeholder elegante desabilitado para a fase atual.",
    badge: "Em breve",
    isPlaceholder: true,
  },
  {
    order: 10,
    id: "notificacoes",
    path: "/notificacoes",
    href: "/notificacoes",
    label: "Notificações",
    name: "Notificações",
    title: "Notificações",
    description:
      "Central completa de avisos e notificações (Anexo 3), conectada ao sino global.",
  },
  {
    order: 11,
    id: "configuracoes",
    path: "/configuracoes",
    href: "/configuracoes",
    label: "Configurações",
    name: "Configurações",
    title: "Configurações",
    description:
      "Front-only: Perfil, Dados da Empresa, Equipe (Anexo 4) e aba de Logs (conectada ao DB).",
  },
] as const;

export const ROUTES = APP_ROUTES;
export const OFFICIAL_ROUTES = APP_ROUTES;

export function getRouteByPath(path: string): AppRoute | undefined {
  return APP_ROUTES.find((route) => route.path === path);
}

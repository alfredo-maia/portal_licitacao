export type Role = "DIRETORIA" | "ANALISTA_COMERCIAL" | "OPERADOR";

export type RbacAction =
  | "view"
  | "read"
  | "create"
  | "update"
  | "delete"
  | "decide_go_nogo"
  | "approve_price"
  | "discard"
  | "manage_team"
  | "audit"
  | "upload"
  | "generate_declaration"
  | "impugnar"
  | "export"
  | "licitacao:decide"
  | "licitacao:create";

export type RbacResource =
  | "dashboard"
  | "oportunidades"
  | "minhas-licitacoes"
  | "calendario"
  | "portais"
  | "documentacao"
  | "declaracoes"
  | "impugnacoes"
  | "robo-de-lances"
  | "notificacoes"
  | "configuracoes"
  | "licitacao"
  | "audit_log"
  | "equipe";

export interface RbacUser {
  id?: string;
  name?: string | null;
  email?: string | null;
  role: Role | string;
  ativo?: boolean;
}

/**
 * Matriz contratual de permissões por perfil (PRD §2.3 / sprint-1-spec §2.3):
 * - DIRETORIA: Acesso irrestrito a todas as 11 telas, deliberações GO/No-GO,
 *   aprovação de preços, descarte, gestão da equipe e auditoria total.
 * - ANALISTA_COMERCIAL: Gestão operacional das licitações aceitas, upload de editais,
 *   montagem de propostas, emissão de declarações e impugnações. Na Sprint 1,
 *   passa a deliberar (`licitacao:decide`) e cadastrar manualmente
 *   (`licitacao:create`) na Central de Oportunidades.
 * - OPERADOR: Acompanhamento de calendário, consulta de certidões e download de acervos.
 *   Sem permissão de deliberação nem de cadastro manual (HTTP 403).
 */
export const ROLE_PERMISSIONS_CONTRACT: Readonly<
  Record<Role, readonly RbacAction[]>
> = {
  DIRETORIA: [
    "view",
    "read",
    "create",
    "update",
    "delete",
    "decide_go_nogo",
    "approve_price",
    "discard",
    "manage_team",
    "audit",
    "upload",
    "generate_declaration",
    "impugnar",
    "export",
    "licitacao:decide",
    "licitacao:create",
  ],
  ANALISTA_COMERCIAL: [
    "view",
    "read",
    "create",
    "update",
    "upload",
    "generate_declaration",
    "impugnar",
    "export",
    "licitacao:decide",
    "licitacao:create",
  ],
  OPERADOR: ["view", "read", "export"],
} as const;

/**
 * Contrato de autorização RBAC unificado (PRD §2.3 / sprint-0-spec §2.5).
 * Verifica se o usuário autenticado e ativo possui permissão para executar `action` sobre `resource`.
 */
export function can(
  user: RbacUser | null | undefined,
  action: RbacAction | string,
  resource?: RbacResource | string,
): boolean {
  if (!user || user.ativo === false) {
    return false;
  }

  if (resource !== undefined && resource.trim().length === 0) {
    return false;
  }

  const role = user.role as Role;
  const allowedActions = ROLE_PERMISSIONS_CONTRACT[role];
  if (!allowedActions) {
    return false;
  }

  return allowedActions.includes(action as RbacAction);
}

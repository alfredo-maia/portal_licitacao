export type Role = "SUPERADMIN" | "DIRETORIA" | "ANALISTA_COMERCIAL" | "OPERADOR";

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
  | "licitacao:create"
  | "superadmin:view"
  | "superadmin:manage";

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
  | "equipe"
  | "admin"
  | "superadmin"
  | "saas";

export interface RbacUser {
  id?: string;
  name?: string | null;
  email?: string | null;
  role: Role | string;
  ativo?: boolean;
  isSuperAdmin?: boolean;
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
  SUPERADMIN: [
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
    "superadmin:view",
    "superadmin:manage",
  ],
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

  // SuperAdmin tem acesso irrestrito
  if (user.role === "SUPERADMIN" || user.isSuperAdmin === true) {
    return true;
  }

  const role = user.role as Role;
  const allowedActions = ROLE_PERMISSIONS_CONTRACT[role];
  if (!allowedActions) {
    return false;
  }

  return allowedActions.includes(action as RbacAction);
}

/**
 * Nível hierárquico do perfil:
 * SuperAdmin (4) > Diretoria (3) > Analista Comercial (2) > Operador / Operador Técnico (1)
 */
export function getRoleHierarchyLevel(role: string): number {
  if (role === "SUPERADMIN") return 4;
  if (role === "DIRETORIA") return 3;
  if (role === "ANALISTA_COMERCIAL") return 2;
  return 1;
}

export interface CanManageUserParams {
  actor: { id: string; role: string };
  targetUser?: { id: string; role: string; ativo: boolean };
  action: "create" | "update_role" | "toggle_ativo";
  newRole?: string;
  newAtivo?: boolean;
}

/**
 * Validação estrita de governança RBAC para Gestão da Equipe (Sprint 7 — Item 11.2):
 * - O próprio usuário não pode se inativar.
 * - O próprio usuário não pode mudar o próprio cargo.
 * - Não é permitido mudar o cargo de alguém do mesmo nível de acesso ou superior.
 * - Analista Comercial não pode alterar cargo de Diretoria nem cadastrar usuário Diretoria.
 * - Analista Comercial não pode inativar Diretoria nem outro Analista Comercial.
 * - Operador Técnico não pode realizar nenhuma dessas ações.
 */
export function canManageTeamMember(params: CanManageUserParams): { allowed: boolean; reason?: string } {
  const actorLevel = getRoleHierarchyLevel(params.actor.role);

  // 1. Operador Técnico não pode gerenciar equipe
  if (actorLevel <= 1) {
    return { allowed: false, reason: "Operador Técnico não possui permissão para gerenciar a equipe." };
  }

  // 2. O próprio usuário não pode se inativar
  if (
    params.action === "toggle_ativo" &&
    params.targetUser &&
    params.actor.id === params.targetUser.id &&
    params.newAtivo === false
  ) {
    return { allowed: false, reason: "O próprio usuário não pode inativar sua própria conta." };
  }

  // 3. O próprio usuário não pode alterar seu próprio cargo
  if (
    params.action === "update_role" &&
    params.targetUser &&
    params.actor.id === params.targetUser.id &&
    params.newRole !== params.targetUser.role
  ) {
    return { allowed: false, reason: "O próprio usuário não pode alterar seu próprio cargo." };
  }

  // 4. Cadastro de novo colaborador
  if (params.action === "create") {
    if (params.actor.role === "ANALISTA_COMERCIAL" && params.newRole === "DIRETORIA") {
      return { allowed: false, reason: "Analista Comercial não pode cadastrar um usuário com perfil de Diretoria." };
    }
    return { allowed: true };
  }

  // 5. Edição ou Inativação de colaborador existente
  if (params.targetUser) {
    const targetLevel = getRoleHierarchyLevel(params.targetUser.role);

    // Restrições específicas de Analista Comercial (Sprint 7 — Item 11.3)
    if (params.actor.role === "ANALISTA_COMERCIAL") {
      if (params.action === "update_role" || params.action === "toggle_ativo") {
        return {
          allowed: false,
          reason: "Analista Comercial não possui permissão para alterar cargos ou desativar membros da equipe (exclusivo Diretoria).",
        };
      }
      if (targetLevel >= 3) {
        return { allowed: false, reason: "Analista Comercial não pode alterar ou inativar usuários de nível Diretoria." };
      }
      if (targetLevel === 2) {
        return { allowed: false, reason: "Analista Comercial não pode alterar cargo nem inativar outro Analista Comercial." };
      }
    }

    // Regra horizontal geral: não pode mudar cargo de alguém do mesmo nível ou superior
    if (params.action === "update_role" && actorLevel <= targetLevel) {
      return { allowed: false, reason: "Não é permitido alterar o cargo de alguém do mesmo nível de acesso ou superior." };
    }
  }

  return { allowed: true };
}

/**
 * Abas visíveis em /configuracoes por papel (Sprint 7 — Item 11.2):
 * - Diretoria: Tem acesso a ver as 4 abas (0: Meu Perfil, 1: Empresa, 2: Equipe, 3: Auditoria)
 * - Analista Comercial: Tem acesso a Meu Perfil (0) e Gestão de Equipe (2)
 * - Operador Técnico: Tem acesso apenas ao Meu Perfil (0)
 */
export function getVisibleConfigTabs(role: string): number[] {
  if (role === "DIRETORIA") return [0, 1, 2, 3];
  if (role === "ANALISTA_COMERCIAL") return [0, 2];
  return [0];
}


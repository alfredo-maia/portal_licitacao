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
  | "export";

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
 * Matriz contratual de permissões por perfil (PRD §2.3):
 * - DIRETORIA: Acesso irrestrito a todas as 11 telas, deliberações GO/No-GO,
 *   aprovação de preços, descarte, gestão da equipe e auditoria total.
 * - ANALISTA_COMERCIAL: Gestão operacional das licitações aceitas, upload de editais,
 *   montagem de propostas, emissão de declarações e impugnações.
 * - OPERADOR: Acompanhamento de calendário, consulta de certidões e download de acervos.
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
  ],
  OPERADOR: ["view", "read", "export"],
} as const;

/**
 * Contrato de autorização RBAC unificado.
 * A implementação definitiva (GREEN) pertence à Etapa 3A (AV-28 - Backend).
 */
export function can(
  _user: RbacUser | null | undefined,
  _action: RbacAction | string,
  _resource?: RbacResource | string,
): boolean {
  // Stub contratual para a Fase RED do TDD (Etapa 2 - QA).
  // Será implementado na Etapa 3A (AV-28) pelo Desenvolvedor Backend.
  return false;
}

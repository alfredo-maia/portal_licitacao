/**
 * Barrel de entrada unificado do serviço do Portal ADM ("Deus ex Machina") — Issue #49.
 * Todos os domínios estão modularizados em `./superadmin/{shared,tenants,financeiro,operacional,licitacoes-equipe}`.
 */

export {
  adminPodeAcessar,
  type AdminArea,
} from "@/lib/rbac";

export {
  calcularOnboardingChecklist,
  expandirCotaStorageTenant,
  listarTenantsSuperAdmin,
  type UsuarioPublico,
} from "./superadmin/shared";

export {
  atualizarContaPrincipalSuperAdmin,
  atualizarCotasClienteSuperAdmin,
  listarDisputasCnpjSuperAdmin,
  obterDossieCliente360SuperAdmin,
  obterEspelhamentoClienteSuperAdmin,
  resolverDisputaCnpjSuperAdmin,
  salvarEmpresaClienteSuperAdmin,
  salvarUsuarioClienteSuperAdmin,
} from "./superadmin/tenants";

export {
  atualizarStatusComissaoAfiliadoSuperAdmin,
  consumirCupomMemoriaSuperAdmin,
  executarAcaoFinanceiraSuperAdmin,
  listarAfiliadosSuperAdmin,
  listarCuponsSuperAdmin,
  salvarAfiliadoSuperAdmin,
  salvarCupomSuperAdmin,
  vincularClienteAfiliadoSuperAdmin,
} from "./superadmin/financeiro";

export {
  atualizarConfigWhatsAppSuperAdmin,
  criarAvisoEmMassaSuperAdmin,
  desativarAvisoEmMassaSuperAdmin,
  gerarQrCodeWhatsAppSuperAdmin,
  listarAvisosAtivosParaTenant,
  listarAvisosEmMassaSuperAdmin,
  listarOptOutsWhatsAppSuperAdmin,
  obterConfigWhatsAppSuperAdmin,
  obterMetricasSuperAdmin,
  obterPainelConsumoIaSuperAdmin,
  registrarConsumoIaSuperAdmin,
  removerOptOutWhatsAppSuperAdmin,
} from "./superadmin/operacional";

export {
  excluirLicitacaoGlobalSuperAdmin,
  injetarLicitacaoNoKanbanClienteSuperAdmin,
  listarExecucoesPncpSuperAdmin,
  listarLicitacoesGlobaisSuperAdmin,
  listarLogsAdministrativosSuperAdmin,
  listarUsuariosAdminSuperAdmin,
  salvarLicitacaoManualSuperAdmin,
  salvarUsuarioAdminSuperAdmin,
} from "./superadmin/licitacoes-equipe";

import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ZodError } from "zod";
import { authOptions } from "@/server/auth";
import {
  exigirClienteEmApi,
  type SessionActorClaims,
} from "@/server/auth/client-guard";
import { listHistoricoLicitacoesPaginado } from "@/server/services/historico-licitacoes.service";
import { resolveUserActiveTenantId } from "@/server/services/tenant.service";
import { registrarAcaoValorCliente } from "@/server/services/usage-telemetry.service";
import { isPlanoBasicoRestrito } from "@/lib/subscription-guard";
import {
  obterStatusAssinaturaCliente,
  verificarBloqueioAssinaturaNaRota,
} from "@/server/services/subscription-status.service";

/**
 * `GET /api/historico-licitacoes` (Issue #59):
 * Consulta livre do acervo histórico e geral de licitações (incluindo `OUTROS`,
 * encerradas e em aberto) para qualquer plano de cliente autenticado, com
 * paginação/ordenação 100% SQL e travas de janela máxima de 30 dias e mínimo
 * de 3 caracteres na busca textual.
 */
export async function GET(request: Request) {
  const bloqueioAssinatura = await verificarBloqueioAssinaturaNaRota();
  if (bloqueioAssinatura) return bloqueioAssinatura;

  const session = await getServerSession(authOptions).catch(() => null);
  const guard = exigirClienteEmApi(
    session?.user as SessionActorClaims | undefined,
  );
  if (!guard.ok) return guard.response;

  const user = guard.user;
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());

  try {
    let cookieTenant: string | undefined;
    try {
      const cookieStore = await cookies();
      cookieTenant = cookieStore.get("portal_licitacao_active_tenant")?.value;
    } catch {}
    const preferredTenant = cookieTenant || user.activeTenantId || undefined;
    const tenantId = await resolveUserActiveTenantId(user.id, preferredTenant);

    let restringirAbertasApenasOutros = false;
    try {
      const sub = await obterStatusAssinaturaCliente({ user, cookieTenant });
      restringirAbertasApenasOutros =
        sub.hasTenantRecord && isPlanoBasicoRestrito(sub.evaluation);
    } catch {
      // Fail-open em testes sem banco
    }

    const result = await listHistoricoLicitacoesPaginado(params, tenantId, {
      restringirAbertasApenasOutros,
    });
    void registrarAcaoValorCliente({
      tenantId,
      userId: user.id,
      usuarioNome: user.name,
      usuarioEmail: user.email,
      acao: "busca_historico",
      rota: "/historico-licitacoes",
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          ok: false,
          error: "VALIDATION_ERROR",
          message:
            error.issues[0]?.message ||
            "Parâmetros inválidos para consulta do Histórico de Licitações.",
          issues: error.issues,
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}

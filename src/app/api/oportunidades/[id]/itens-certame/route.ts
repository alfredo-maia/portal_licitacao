import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { RbacUser } from "@/lib/rbac";
import { authOptions, DIRECTORS_SEED } from "@/server/auth";
import {
  getOportunidadeById,
  OportunidadesServiceError,
} from "@/server/services/oportunidades.service";
import { resolveUserActiveTenantId } from "@/server/services/tenant.service";
import {
  resolverContextoContaCota,
  verificarEIncrementarLimiteSilenciosoLicitacao,
} from "@/server/services/analise-ia-participacao.service";
import type { ItemDisputaEdital } from "@/server/schemas/analise-ia.schema";

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function resolveTenantAndUser(request: Request) {
  const session = await getServerSession(authOptions).catch(() => null);
  let user = session?.user as RbacUser | undefined;
  if (!user && process.env.NODE_ENV !== "test" && process.env.VITEST !== "true") {
    user = DIRECTORS_SEED[0] as any;
  }

  let cookieTenant: string | undefined;
  try {
    const cookieStore = await cookies();
    cookieTenant = cookieStore.get("portal_licitacao_active_tenant")?.value;
  } catch {}
  const headerTenant = new URL(request.url).searchParams.get("tenantId");
  const preferredTenant = headerTenant || cookieTenant || (user as any)?.activeTenantId;
  const tenantId = await resolveUserActiveTenantId((user as any)?.id || "", preferredTenant);

  return { user, tenantId };
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const { user, tenantId } = await resolveTenantAndUser(request);

  try {
    const userIdentifier = (user as any)?.id || (user as any)?.email || null;
    const { plano } = await resolverContextoContaCota(tenantId, userIdentifier);

    // Verificação de plano: exclusivo PRO e ENTERPRISE
    if (plano === "BASICO") {
      return NextResponse.json(
        {
          ok: false,
          error: "PLANO_INSUFICIENTE",
          message:
            "A extração e sincronização automática de itens do certame é um recurso exclusivo dos planos Pro e Enterprise. Faça upgrade da sua assinatura para desbloquear esta ferramenta.",
        },
        { status: 403 },
      );
    }

    // Trava silenciosa anti-abuso (máximo 5 chamadas por certame)
    try {
      verificarEIncrementarLimiteSilenciosoLicitacao(
        id,
        String(userIdentifier || tenantId || "anonimo"),
      );
    } catch (err: any) {
      return NextResponse.json(
        {
          ok: false,
          error: err.codigo || "ERRO_PROCESSAMENTO_SISTEMA",
          message:
            err.message ||
            "Ocorreu um erro interno no sistema ao processar esta solicitação automática para esta licitação. Por favor, entre em contato com o nosso suporte técnico.",
        },
        { status: 500 },
      );
    }

    const oportunidade = await getOportunidadeById(id, tenantId);

    // 1. Tentar puxar itens oficiais diretamente do PNCP
    const idPncp = oportunidade.idPncp || "";
    let itensEncontrados: ItemDisputaEdital[] = [];
    let origem: "PNCP" | "IA" | "HISTORICO" = "PNCP";

    if (idPncp) {
      const partes = idPncp.split("-");
      const cnpj = partes[0]
        ? partes[0].replace(/\D/g, "")
        : oportunidade.orgaoCnpj?.replace(/\D/g, "") || "";
      let ano = new Date().getFullYear();
      let sequencial = "1";

      if (partes[2]) {
        const sub = partes[2].split("/");
        const parsedSeq = parseInt(sub[0], 10);
        sequencial = isNaN(parsedSeq) ? "1" : parsedSeq.toString();
        ano = parseInt(sub[1], 10) || ano;
      }

      if (cnpj && sequencial) {
        try {
          const pncpUrl = `https://pncp.gov.br/api/pncp/v1/orgaos/${cnpj}/compras/${ano}/${sequencial}/itens?pagina=1&tamanhoPagina=250`;
          const res = await fetch(pncpUrl, {
            headers: { accept: "*/*" },
            signal: AbortSignal.timeout(6000),
          });

          if (res.ok) {
            const data = await res.json();
            const list: any[] = Array.isArray(data)
              ? data
              : Array.isArray(data?.data)
              ? data.data
              : Array.isArray(data?.itens)
              ? data.itens
              : [];

            if (list.length > 0) {
              itensEncontrados = list.map((it: any, idx: number) => ({
                numeroItem: Number(it.numeroItem) || idx + 1,
                lote: Number(it.numeroLote || it.lote) || 1,
                descricao: String(it.descricao || `Item ${it.numeroItem || idx + 1}`).trim(),
                especificacaoDetalhada:
                  it.descricaoDetalhada || it.especificacao || it.descricao || undefined,
                quantidade: Number(it.quantidade) || 1,
                unidadeMedida: (it.unidadeMedida || "UN").trim().toUpperCase(),
                valorUnitarioEstimado:
                  it.valorUnitarioEstimado != null ? Number(it.valorUnitarioEstimado) : null,
                valorTotalEstimado:
                  it.valorTotal != null
                    ? Number(it.valorTotal)
                    : it.valorUnitarioEstimado && it.quantidade
                    ? Number(it.valorUnitarioEstimado) * Number(it.quantidade)
                    : null,
                marcaExigidaOuReferencia: null,
              }));
              origem = "PNCP";
            }
          }
        } catch {
          // Falha na requisição ao PNCP, continua para o fallback
        }
      }
    }

    // 2. Fallback: Se não encontrou no PNCP, verifica se já existe análise de IA concluída
    if (itensEncontrados.length === 0 && Array.isArray(oportunidade.analisesIA)) {
      const analiseValida = oportunidade.analisesIA.find(
        (a: any) =>
          a.status === "CONCLUIDO" &&
          (a.relatorioJson?.itensDisputa?.length > 0 ||
            a.relatorioJson?.itens?.length > 0 ||
            a.relatorioJson?.listaItens?.length > 0),
      );

      if (analiseValida) {
        const rawItens =
          analiseValida.relatorioJson.itensDisputa ||
          analiseValida.relatorioJson.itens ||
          analiseValida.relatorioJson.listaItens;

        itensEncontrados = rawItens.map((it: any, idx: number) => ({
          numeroItem: Number(it.numeroItem) || idx + 1,
          lote: Number(it.lote) || 1,
          descricao: String(it.descricao || `Item ${idx + 1}`).trim(),
          especificacaoDetalhada: it.especificacaoDetalhada || it.descricao || undefined,
          quantidade: Number(it.quantidade) || 1,
          unidadeMedida: (it.unidadeMedida || "UN").trim().toUpperCase(),
          valorUnitarioEstimado:
            it.valorUnitarioEstimado != null ? Number(it.valorUnitarioEstimado) : null,
          valorTotalEstimado:
            it.valorTotalEstimado != null ? Number(it.valorTotalEstimado) : null,
          marcaExigidaOuReferencia: it.marcaExigidaOuReferencia || null,
        }));
        origem = "IA";
      }
    }

    // 3. Fallback: Se ainda não tiver itens, verificar se a própria oportunidade já possui itens salvos
    if (itensEncontrados.length === 0 && Array.isArray(oportunidade.itens) && oportunidade.itens.length > 0) {
      itensEncontrados = (oportunidade.itens as any[]).map((it: any, idx: number) => ({
        numeroItem: Number(it.numeroItem) || idx + 1,
        lote: Number(it.lote) || 1,
        descricao: String(it.descricao || `Item ${idx + 1}`).trim(),
        especificacaoDetalhada: it.especificacao || it.descricao || undefined,
        quantidade: Number(it.quantidade) || 1,
        unidadeMedida: (it.unidadeMedida || "UN").trim().toUpperCase(),
        valorUnitarioEstimado: it.valorUnitario ? Number(it.valorUnitario) : null,
        valorTotalEstimado: it.valorTotal ? Number(it.valorTotal) : null,
        marcaExigidaOuReferencia: it.marca || null,
      }));
      origem = "HISTORICO";
    }

    // 4. Último fallback: sintetizar do objeto principal
    if (itensEncontrados.length === 0) {
      itensEncontrados = [
        {
          numeroItem: 1,
          lote: 1,
          descricao:
            oportunidade.resumo ||
            oportunidade.miniResumo ||
            "Fornecimento de bens e serviços conforme edital",
          especificacaoDetalhada: oportunidade.resumo || undefined,
          quantidade: 1,
          unidadeMedida: "UN",
          valorUnitarioEstimado: oportunidade.valorEstimado || null,
          valorTotalEstimado: oportunidade.valorEstimado || null,
          marcaExigidaOuReferencia: null,
        },
      ];
      origem = "HISTORICO";
    }

    return NextResponse.json(
      {
        ok: true,
        itens: itensEncontrados,
        totalItens: itensEncontrados.length,
        origem,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof OportunidadesServiceError) {
      return NextResponse.json(
        { ok: false, error: error.code, message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR", message: "Erro ao consultar itens do certame." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  return GET(request, context);
}


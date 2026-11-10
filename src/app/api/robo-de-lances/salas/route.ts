import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { cookies } from "next/headers";
import { authOptions } from "@/server/auth";
import { resolveUserActiveTenantId } from "@/server/services/tenant.service";
import {
  listOportunidades,
  atualizarKanbanStatus,
  OportunidadesServiceError,
} from "@/server/services/oportunidades.service";
import {
  disputaConfigSchema,
  disputaItemRegraSchema,
  validarRegrasDisputa,
} from "@/server/schemas/proposta-calculadora.schema";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function resolverTenantAtivo(
  req: Request,
  bodyTenantId?: string,
): Promise<{ tenantId: string | null; unauthorized: boolean }> {
  const session = await getServerSession(authOptions).catch(() => null);
  let cookieTenant: string | undefined;
  try {
    const cookieStore = await cookies();
    cookieTenant = cookieStore.get("portal_licitacao_active_tenant")?.value;
  } catch {}

  const { searchParams } = new URL(req.url);
  const queryTenant = searchParams.get("tenantId") || req.headers.get("x-tenant-id");
  const userId = (session?.user as any)?.id || "";
  const sessionTenant =
    (session?.user as any)?.activeTenantId || (session?.user as any)?.tenantId;
  const requestedTenant = queryTenant || bodyTenantId || cookieTenant;

  if (userId) {
    const tenantId = await resolveUserActiveTenantId(
      userId,
      requestedTenant,
      sessionTenant,
    );
    return { tenantId, unauthorized: false };
  }

  const isTestEnv =
    process.env.VITEST === "true" || process.env.NODE_ENV === "test";
  if (!isTestEnv) {
    return { tenantId: null, unauthorized: true };
  }

  return { tenantId: requestedTenant || "tenant-default", unauthorized: false };
}

export async function GET(req: Request) {
  try {
    const { tenantId, unauthorized } = await resolverTenantAtivo(req);
    if (unauthorized) {
      return NextResponse.json(
        { ok: false, error: "Não autorizado", salas: [] },
        { status: 401 },
      );
    }
    if (!tenantId) {
      return NextResponse.json(
        { ok: false, error: "Empresa ativa não identificada", salas: [] },
        { status: 403 },
      );
    }

    const oportunidades = await listOportunidades({}, tenantId);

    // Seleciona oportunidades com disputa configurada ou no status EM_DISPUTA
    const salas = oportunidades
      .filter((opp: any) => {
        const temDisputaConfig = Boolean(
          opp.calculadoraDados?.disputaConfig &&
            (opp.calculadoraDados.disputaConfig.identificadorSala ||
              (opp.calculadoraDados.disputaConfig.regrasItens &&
                opp.calculadoraDados.disputaConfig.regrasItens.length > 0)),
        );
        return temDisputaConfig || opp.status === "EM_DISPUTA";
      })
      .map((opp: any) => {
        const disputa = opp.calculadoraDados?.disputaConfig || {};
        const regrasItens = Array.isArray(disputa.regrasItens) ? disputa.regrasItens : [];
        const itensAtivos = regrasItens.filter((r: any) => r.ativoNoRobo).length;

        return {
          id: opp.id,
          titulo: opp.titulo,
          orgao: opp.orgao,
          uf: opp.uf,
          numeroEdital: opp.numeroEdital,
          portal: disputa.portal || "Compras.gov.br",
          identificadorSala: disputa.identificadorSala || opp.numeroEdital || "",
          modoDisputaEdital: disputa.modoDisputaEdital || "ABERTO",
          statusGeral:
            disputa.statusGeral || (opp.status === "EM_DISPUTA" ? "EM_DISPUTA" : "CONFIGURADA"),
          pausaEmergencia: Boolean(disputa.pausaEmergencia),
          tempoRespostaSegundos: disputa.tempoRespostaSegundos || 3,
          segundosFinaisSniper: disputa.segundosFinaisSniper || 10,
          totalItens: opp.calculadoraDados?.itens?.length || regrasItens.length || 1,
          itensAtivosNoRobo: itensAtivos > 0 ? itensAtivos : (regrasItens.length > 0 ? 0 : 1),
          pisoSeguroTotal: opp.lanceMinimo || 0,
          propostaInicialTotal: opp.valorProposta || 0,
          regrasItens,
          dataAbertura: opp.dataAbertura,
          statusKanban: opp.status,
          atualizadoEm: disputa.atualizadoEm || opp.atualizadoEm,
        };
      });

    const tenantRecord = await prisma.tenant
      .findUnique({ where: { id: tenantId }, select: { plano: true } })
      .catch(() => null);

    return NextResponse.json({
      ok: true,
      activeTenantId: tenantId,
      plano: tenantRecord?.plano || "PRO",
      totalSalas: salas.length,
      salas,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Erro ao listar salas do robô de lances",
        salas: [],
      },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const { tenantId, unauthorized } = await resolverTenantAtivo(req);
    if (unauthorized) {
      return NextResponse.json(
        { ok: false, error: "Não autorizado" },
        { status: 401 },
      );
    }
    if (!tenantId) {
      return NextResponse.json(
        { ok: false, error: "Empresa ativa não identificada" },
        { status: 403 },
      );
    }

    const body = await req.json();
    const { licitacaoId, acao, disputaConfig: configUpdate } = body;

    if (!licitacaoId) {
      return NextResponse.json(
        { ok: false, error: "ID da licitação é obrigatório" },
        { status: 400 },
      );
    }

    const oportunidades = await listOportunidades({}, tenantId);
    const opp = oportunidades.find((o) => o.id === licitacaoId);
    if (!opp) {
      return NextResponse.json(
        { ok: false, error: "Oportunidade não encontrada" },
        { status: 404 },
      );
    }

    const calcDados = (opp as any).calculadoraDados || {};
    let novaDisputaConfig = { ...(calcDados.disputaConfig || {}) };

    if (acao === "PAUSAR_EMERGENCIA") {
      novaDisputaConfig.pausaEmergencia = true;
      novaDisputaConfig.statusGeral = "PAUSADA";
    } else if (acao === "RETOMAR_DISPUTA") {
      novaDisputaConfig.pausaEmergencia = false;
      novaDisputaConfig.statusGeral = "EM_DISPUTA";
    } else if (configUpdate) {
      novaDisputaConfig = {
        ...novaDisputaConfig,
        ...configUpdate,
        atualizadoEm: new Date().toISOString(),
      };
    }

    if (Array.isArray(novaDisputaConfig.regrasItens) && novaDisputaConfig.regrasItens.length > 0) {
      const origemDisputa =
        novaDisputaConfig.origemPrecos === "MANUAL" ? "MANUAL" : "CALCULADORA";
      const regrasParsed = novaDisputaConfig.regrasItens.flatMap((r: unknown) => {
        const p = disputaItemRegraSchema.safeParse(r);
        return p.success ? [p.data] : [];
      });
      const validacao = validarRegrasDisputa(regrasParsed, origemDisputa);
      if (
        validacao.itensPisoMaiorIds.length > 0 ||
        (configUpdate && validacao.itensSemValorIds.length > 0)
      ) {
        return NextResponse.json(
          {
            ok: false,
            error:
              validacao.erros[0] ||
              "Valor Mínimo (Piso Seguro) não pode ser maior que a Proposta Inicial.",
          },
          { status: 400 },
        );
      }
    }

    await atualizarKanbanStatus(
      licitacaoId,
      {
        status: opp.status,
        lanceMinimo: (opp as any).lanceMinimo ?? null,
        valorProposta: (opp as any).valorProposta ?? null,
        calculadoraDados: {
          ...calcDados,
          disputaConfig: novaDisputaConfig,
        },
      },
      null,
      undefined,
      tenantId,
    );

    return NextResponse.json({
      ok: true,
      mensagem: "Disputa atualizada com sucesso",
      disputaConfig: novaDisputaConfig,
    });
  } catch (error: any) {
    if (error instanceof OportunidadesServiceError) {
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Erro ao atualizar sala de disputa",
      },
      { status: 500 },
    );
  }
}

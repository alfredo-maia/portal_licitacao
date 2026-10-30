import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/lib/rbac";
import { recordAuditLog } from "@/server/audit";
import {
  ARSENAL_PLAN_MATRIX,
  calculadoraLanceSchema,
  gerarMinutaIaImpugnacaoSchema,
  gerarPropostaComercialSchema,
  inteligenciaPrecosSchema,
  monitorChatPregoeiroSchema,
  relatorioExecutivoMensalSchema,
} from "@/server/schemas/arsenal.schema";
import {
  analisarMensagensChatPregoeiro,
  calcularLanceMinimoEBdi,
  consultarInteligenciaPrecosConcorrentes,
  gerarMinutaImpugnacaoIA,
  gerarPropostaComercialTimbrada,
  gerarRelatorioExecutivoMensal,
} from "@/server/services/arsenal.service";

export const dynamic = "force-dynamic";

const arsenalActionSchema = z.discriminatedUnion("acao", [
  z.object({
    acao: z.literal("CALCULAR_LANCE_BDI"),
    payload: calculadoraLanceSchema,
  }),
  z.object({
    acao: z.literal("GERAR_PROPOSTA_PDF"),
    payload: gerarPropostaComercialSchema,
  }),
  z.object({
    acao: z.literal("MONITORAR_CHAT_PREGOEIRO"),
    payload: monitorChatPregoeiroSchema,
  }),
  z.object({
    acao: z.literal("GERAR_MINUTA_IMPUGNACAO_IA"),
    payload: gerarMinutaIaImpugnacaoSchema,
  }),
  z.object({
    acao: z.literal("CONSULTAR_INTELIGENCIA_PRECOS"),
    payload: inteligenciaPrecosSchema,
  }),
  z.object({
    acao: z.literal("GERAR_RELATORIO_EXECUTIVO"),
    payload: relatorioExecutivoMensalSchema,
  }),
]);

export async function GET() {
  return NextResponse.json({
    ok: true,
    matrixPlanos: ARSENAL_PLAN_MATRIX,
  });
}

export async function POST(req: Request) {
  try {
    const rawBody: unknown = await req.json().catch(() => ({}));
    const defaultActor = {
      id: "usr_diretoria",
      name: "Operador Arsenal",
      role: "DIRETORIA" as const,
      ativo: true,
    };

    if (!can(defaultActor, "view", "robo-de-lances")) {
      return NextResponse.json(
        { ok: false, error: "Acesso negado ao Arsenal de Disputa." },
        { status: 403 },
      );
    }

    const parsed = arsenalActionSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Payload inválido para operação do Arsenal.",
          detalhes: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const command = parsed.data;

    switch (command.acao) {
      case "CALCULAR_LANCE_BDI": {
        const resultado = calcularLanceMinimoEBdi(command.payload);
        return NextResponse.json({ ok: true, resultado });
      }
      case "GERAR_PROPOSTA_PDF": {
        const proposta = gerarPropostaComercialTimbrada(command.payload);
        await recordAuditLog({
          acao: "ARSENAL_PROPOSTA_GERADA",
          entidadeTipo: "proposta_comercial",
          entidadeId: command.payload.numeroEdital,
          depois: {
            orgaoNome: command.payload.orgaoNome,
            valorGlobal: proposta.valorGlobalProposta,
          },
        });
        return NextResponse.json({ ok: true, resultado: proposta });
      }
      case "MONITORAR_CHAT_PREGOEIRO": {
        const analise = await analisarMensagensChatPregoeiro(command.payload);
        await recordAuditLog({
          acao: "ARSENAL_CHAT_MONITORADO",
          entidadeTipo: "chat_pregoeiro",
          entidadeId: command.payload.numeroEdital,
          depois: {
            alertasCriticos: analise.alertasCriticos.length,
            whatsappEnfileirado: analise.whatsappEnfileirado,
          },
        });
        return NextResponse.json({ ok: true, resultado: analise });
      }
      case "GERAR_MINUTA_IMPUGNACAO_IA": {
        const minuta = gerarMinutaImpugnacaoIA(command.payload);
        await recordAuditLog({
          acao: "ARSENAL_MINUTA_IA_GERADA",
          entidadeTipo: "impugnacao_ia",
          entidadeId: command.payload.numeroEdital,
          depois: {
            orgaoNome: command.payload.orgaoNome,
            tesePrincipal: command.payload.tesePrincipal,
          },
        });
        return NextResponse.json({ ok: true, resultado: minuta });
      }
      case "CONSULTAR_INTELIGENCIA_PRECOS": {
        const bi = consultarInteligenciaPrecosConcorrentes(command.payload);
        return NextResponse.json({ ok: true, resultado: bi });
      }
      case "GERAR_RELATORIO_EXECUTIVO": {
        const relatorio = gerarRelatorioExecutivoMensal(command.payload);
        return NextResponse.json({ ok: true, resultado: relatorio });
      }
    }
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Erro ao processar ação do Arsenal";
    return NextResponse.json({ ok: false, error: message }, { status: 403 });
  }
}


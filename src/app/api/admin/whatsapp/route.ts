import { NextRequest, NextResponse } from "next/server";
import { recordAuditLog, runWithAuditActorContext } from "@/server/audit";
import { exigirAdmin, respostaErroAdmin } from "@/server/auth/admin-guard";
import { AdminWhatsAppPostSchema } from "@/server/schemas/superadmin.schema";
import {
  atualizarConfigWhatsAppSuperAdmin,
  gerarQrCodeWhatsAppSuperAdmin,
  listarOptOutsWhatsAppSuperAdmin,
  obterConfigWhatsAppSuperAdmin,
  removerOptOutWhatsAppSuperAdmin,
} from "@/server/services/superadmin.service";
import {
  enfileirarMensagemWhatsApp,
  listarFilaWhatsApp,
  obterStatusInstanciaWhatsApp,
  processarFilaWhatsAppComJitter,
  registrarOptOutWhatsApp,
} from "@/server/services/whatsapp.service";

export const dynamic = "force-dynamic";

/** GET: status da instância, configuração de Jitter, fila e opt-outs. 404 para não administradores. */
export async function GET(req?: Request) {
  const g = await exigirAdmin("whatsapp");
  if (!g.ok) return g.response;
  return runWithAuditActorContext(
    {
      usuarioId: g.actor.id,
      usuarioNome: g.actor.name,
      ip: req?.headers.get("x-forwarded-for") ?? null,
    },
    async () => {
      try {
        const [status, config, fila, optOuts] = await Promise.all([
          obterStatusInstanciaWhatsApp(),
          obterConfigWhatsAppSuperAdmin(),
          listarFilaWhatsApp(50),
          listarOptOutsWhatsAppSuperAdmin(),
        ]);
        return NextResponse.json({
          ...status,
          totalOptOuts: Math.max(status.totalOptOuts, optOuts.length),
          status,
          config,
          fila,
          optOuts,
        });
      } catch (error) {
        return respostaErroAdmin(error, "whatsapp");
      }
    },
  );
}

/**
 * POST `{ acao }`: `qrcode` | `config` | `processar_fila` | `teste` | `optout` | `remover_optout`.
 * Sem `acao` mantém o comportamento legado (enfileirar mensagem).
 */
export async function POST(req: NextRequest) {
  const g = await exigirAdmin("whatsapp", "escrever");
  if (!g.ok) return g.response;
  return runWithAuditActorContext(
    {
      usuarioId: g.actor.id,
      usuarioNome: g.actor.name,
      ip: req.headers.get("x-forwarded-for") ?? null,
    },
    async () => {
      try {
        const parsed = AdminWhatsAppPostSchema.parse(await req.json());

        if ("acao" in parsed && parsed.acao !== undefined) {
          switch (parsed.acao) {
            case "qrcode":
              return NextResponse.json(await gerarQrCodeWhatsAppSuperAdmin());
            case "config": {
              const cfgSource = parsed.config ?? parsed;
              return NextResponse.json(
                await atualizarConfigWhatsAppSuperAdmin({
                  minDelaySegundos: cfgSource.minDelaySegundos,
                  maxDelaySegundos: cfgSource.maxDelaySegundos,
                  limiteDiarioWarmup: cfgSource.limiteDiarioWarmup,
                  janelaInicio: cfgSource.janelaInicio,
                  janelaFim: cfgSource.janelaFim,
                }),
              );
            }
            case "processar_fila":
            case "processar_fila_legacy": {
              const res = await processarFilaWhatsAppComJitter({
                limite: parsed.limite ?? 10,
                simularDelay: false,
                respeitarJanela: true,
              });
              await recordAuditLog({
                usuarioId: g.actor.id,
                usuarioNome: g.actor.name,
                acao: "ADMIN_WHATSAPP_PROCESSAR_FILA",
                entidadeTipo: "WHATSAPP",
                entidadeId: "fila",
                depois: {
                  processados: res.processados.length,
                  totalPendentes: res.totalPendentes,
                  restantesHoje: res.restantesHoje,
                  motivoBloqueio: res.motivoBloqueio ?? null,
                },
              }).catch(() => undefined);
              return NextResponse.json(res);
            }
            case "optout": {
              const res = await registrarOptOutWhatsApp(parsed.telefone, parsed.motivo);
              await recordAuditLog({
                usuarioId: g.actor.id,
                usuarioNome: g.actor.name,
                acao: "ADMIN_WHATSAPP_OPTOUT",
                entidadeTipo: "WHATSAPP",
                entidadeId: res.telefone,
                depois: { motivo: parsed.motivo ?? null },
              }).catch(() => undefined);
              return NextResponse.json(res);
            }
            case "remover_optout":
              return NextResponse.json(await removerOptOutWhatsAppSuperAdmin(parsed.telefone));
            case "teste": {
              const res = await enfileirarMensagemWhatsApp({
                destinatario: parsed.destinatario,
                mensagem: parsed.mensagem,
                tipo: "ALERTA",
              });
              await recordAuditLog({
                usuarioId: g.actor.id,
                usuarioNome: g.actor.name,
                acao: "ADMIN_WHATSAPP_TESTE",
                entidadeTipo: "WHATSAPP",
                entidadeId: res.id,
                depois: { destinatario: res.destinatario, status: res.status },
              }).catch(() => undefined);
              return NextResponse.json(res, { status: 201 });
            }
          }
        }

        const envioLegado = await enfileirarMensagemWhatsApp({
          destinatario: parsed.destinatario,
          mensagem: parsed.mensagem,
          tenantId: parsed.tenantId,
          tipo: parsed.tipo,
          agendadoPara: parsed.agendadoPara,
        });
        return NextResponse.json(envioLegado, { status: 201 });
      } catch (error) {
        return respostaErroAdmin(error, "whatsapp-post");
      }
    },
  );
}

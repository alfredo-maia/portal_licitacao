import { NextRequest, NextResponse } from "next/server";
import { recordAuditLog, runWithAuditActorContext } from "@/server/audit";
import { exigirAdmin, respostaErroAdmin } from "@/server/auth/admin-guard";
import { AdminSuportePostSchema } from "@/server/schemas/superadmin.schema";
import {
  adicionarMensagemTicketSuporte,
  atualizarStatusTicketSuporte,
  listarTicketsSuporte,
} from "@/server/services/suporte.service";
import { atualizarCotasClienteSuperAdmin } from "@/server/services/superadmin.service";

export const dynamic = "force-dynamic";

/** GET: todos os tickets (Lista e Kanban consomem o mesmo payload). */
export async function GET(req?: Request) {
  const g = await exigirAdmin("suporte");
  if (!g.ok) return g.response;
  return runWithAuditActorContext(
    {
      usuarioId: g.actor.id,
      usuarioNome: g.actor.name,
      ip: req?.headers.get("x-forwarded-for") ?? null,
    },
    async () => {
      try {
        const tickets = await listarTicketsSuporte(null, null, { isSuperAdmin: true });
        return NextResponse.json({ tickets });
      } catch (error) {
        return respostaErroAdmin(error, "suporte");
      }
    },
  );
}

/**
 * POST `{ acao: "responder" | "status" | "ajuda_rapida", ticketId, ... }`.
 * `ajuda_rapida` concede recurso ao cliente do ticket (ex.: +IA ou +storage) com 1 clique.
 */
export async function POST(req: NextRequest) {
  const g = await exigirAdmin("suporte", "escrever");
  if (!g.ok) return g.response;
  return runWithAuditActorContext(
    {
      usuarioId: g.actor.id,
      usuarioNome: g.actor.name,
      ip: req.headers.get("x-forwarded-for") ?? null,
    },
    async () => {
      try {
        const parsed = AdminSuportePostSchema.parse(await req.json());
        const actor = {
          id: g.actor.id,
          name: `${g.actor.name} (Suporte)`,
          email: g.actor.email,
          autorTipo: "SUPORTE" as const,
          isSuperAdmin: true,
        };

        if (parsed.acao === "responder") {
          const t = await adicionarMensagemTicketSuporte(
            parsed.ticketId,
            { mensagem: parsed.mensagem },
            actor,
          );
          if (!t) {
            return NextResponse.json({ error: "Ticket não encontrado" }, { status: 404 });
          }
          await recordAuditLog({
            usuarioId: g.actor.id,
            usuarioNome: g.actor.name,
            acao: "ADMIN_SUPORTE_RESPONDER",
            entidadeTipo: "SUPPORT_TICKET",
            entidadeId: t.id,
            tenantId: t.tenantId ?? null,
            depois: { protocolo: t.protocolo, status: t.status },
          }).catch(() => undefined);
          return NextResponse.json({ ticket: t });
        }

        if (parsed.acao === "status") {
          const t = await atualizarStatusTicketSuporte(
            parsed.ticketId,
            parsed.status,
            actor,
          );
          if (!t) {
            return NextResponse.json({ error: "Ticket não encontrado" }, { status: 404 });
          }
          await recordAuditLog({
            usuarioId: g.actor.id,
            usuarioNome: g.actor.name,
            acao: "ADMIN_SUPORTE_STATUS",
            entidadeTipo: "SUPPORT_TICKET",
            entidadeId: t.id,
            tenantId: t.tenantId ?? null,
            depois: { protocolo: t.protocolo, status: parsed.status },
          }).catch(() => undefined);
          return NextResponse.json({ ticket: t });
        }

        const r = await atualizarCotasClienteSuperAdmin({
          tenantId: parsed.tenantId,
          adicionarAiQuota: parsed.adicionarAiQuota,
          adicionarStorageMb: parsed.adicionarStorageMb,
          resetarTravaIaLicitacaoId: parsed.resetarTravaIaLicitacaoId,
        });
        return NextResponse.json(r);
      } catch (error) {
        return respostaErroAdmin(error, "suporte-post");
      }
    },
  );
}

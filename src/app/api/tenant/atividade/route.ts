import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { cookies } from "next/headers";
import { z } from "zod";
import { authOptions } from "@/server/auth";
import {
  exigirClienteEmApi,
  type SessionActorClaims,
} from "@/server/auth/client-guard";
import { resolveUserActiveTenantId } from "@/server/services/tenant.service";
import { registrarAtividadeCliente } from "@/server/services/usage-telemetry.service";

export const dynamic = "force-dynamic";

const AtividadePingSchema = z.object({
  rota: z.string().trim().min(1).max(200),
  modulo: z.string().trim().max(60).optional(),
});

/**
 * `POST /api/tenant/atividade` (Issue #65):
 * Registra presença e navegação diária consolidada (máx. 1 linha por dia/CNPJ/usuário em BRT)
 * e atualiza `Tenant.ultimaAtividadeEm`.
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions).catch(() => null);
    const guard = exigirClienteEmApi(
      session?.user as SessionActorClaims | undefined,
    );
    if (!guard.ok) return guard.response;

    const raw = await request.json().catch(() => ({}));
    const parsed = AtividadePingSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "INVALID_PAYLOAD" },
        { status: 400 },
      );
    }

    let cookieTenant: string | undefined;
    try {
      const cookieStore = await cookies();
      cookieTenant = cookieStore.get("portal_licitacao_active_tenant")?.value;
    } catch {}

    const tenantId = await resolveUserActiveTenantId(
      guard.user.id,
      cookieTenant,
      guard.user.activeTenantId,
    );

    if (tenantId) {
      await registrarAtividadeCliente({
        tenantId,
        userId: guard.user.id,
        usuarioNome: guard.user.name ?? null,
        usuarioEmail: guard.user.email ?? null,
        rota: parsed.data.rota,
        modulo: parsed.data.modulo,
      });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: true }, { status: 200 });
  }
}

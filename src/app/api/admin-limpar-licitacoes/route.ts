import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clearInMemoryLicitacoes } from "@/server/services/licitacoes-store";

export async function POST(request: Request) {
  const secret = request.headers.get("x-admin-secret");
  if (secret !== "pncp_admin_super_secret_token_change_in_production") {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    await prisma.arquivo.deleteMany({}).catch(() => undefined);
    await prisma.repositorioSimilar.deleteMany({}).catch(() => undefined);
    await prisma.analiseStatusParticipacao.deleteMany({}).catch(() => undefined);
    await prisma.licitacaoAtribuido.deleteMany({}).catch(() => undefined);
    await prisma.licitacaoStatusHistorico.deleteMany({}).catch(() => undefined);
    await prisma.impugnacao.deleteMany({}).catch(() => undefined);
    await prisma.notificacao.deleteMany({}).catch(() => undefined);
    const del = await prisma.licitacao.deleteMany({});
    clearInMemoryLicitacoes();
    return NextResponse.json({ ok: true, deleted: del.count });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

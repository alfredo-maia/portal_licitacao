import { NextRequest, NextResponse } from "next/server";
import { recordAuditLog, runWithAuditActorContext } from "@/server/audit";
import { exigirAdmin, respostaErroAdmin } from "@/server/auth/admin-guard";
import {
  AdminLicitacoesPostSchema,
  AdminLicitacoesQuerySchema,
  AdminUpsertLicitacaoSchema,
} from "@/server/schemas/superadmin.schema";
import {
  excluirLicitacaoGlobalSuperAdmin,
  injetarLicitacaoNoKanbanClienteSuperAdmin,
  listarExecucoesPncpSuperAdmin,
  listarLicitacoesGlobaisSuperAdmin,
  salvarLicitacaoManualSuperAdmin,
} from "@/server/services/superadmin.service";
import { executarIngestaoDiariaPncp } from "@/server/services/pncp-ingestao-diaria.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const g = await exigirAdmin("licitacoes");
  if (!g.ok) return g.response;
  return runWithAuditActorContext(
    {
      usuarioId: g.actor.id,
      usuarioNome: g.actor.name,
      ip: req.headers.get("x-forwarded-for") ?? null,
    },
    async () => {
      try {
        const query = AdminLicitacoesQuerySchema.parse({
          busca: req.nextUrl.searchParams.get("busca")?.trim() || undefined,
        });
        const [licitacoes, execucoes] = await Promise.all([
          listarLicitacoesGlobaisSuperAdmin(query.busca),
          listarExecucoesPncpSuperAdmin(15),
        ]);
        return NextResponse.json({ licitacoes, execucoes });
      } catch (error) {
        return respostaErroAdmin(error, "licitacoes");
      }
    },
  );
}

/** POST `{ acao }`: `salvar` | `injetar` | `excluir` | `importar_lote` | `sincronizar_pncp`. */
export async function POST(req: NextRequest) {
  const g = await exigirAdmin("licitacoes", "escrever");
  if (!g.ok) return g.response;
  return runWithAuditActorContext(
    {
      usuarioId: g.actor.id,
      usuarioNome: g.actor.name,
      ip: req.headers.get("x-forwarded-for") ?? null,
    },
    async () => {
      try {
        const parsed = AdminLicitacoesPostSchema.parse(await req.json());
        switch (parsed.acao) {
          case "salvar": {
            const { acao: _acao, ...dadosSalvar } = parsed;
            return NextResponse.json(await salvarLicitacaoManualSuperAdmin(dadosSalvar));
          }
          case "injetar": {
            const { acao: _acao, ...dadosInjetar } = parsed;
            return NextResponse.json(await injetarLicitacaoNoKanbanClienteSuperAdmin(dadosInjetar));
          }
          case "excluir":
            return NextResponse.json(await excluirLicitacaoGlobalSuperAdmin(parsed.id));
          case "importar_lote": {
            const resultados: Array<Record<string, unknown>> = [];
            let sucessos = 0;
            for (const rawItem of parsed.itens) {
              try {
                const validItem = AdminUpsertLicitacaoSchema.parse(rawItem);
                const res = await salvarLicitacaoManualSuperAdmin(validItem);
                resultados.push(res);
                if (res.ok) sucessos++;
              } catch (e: unknown) {
                resultados.push({
                  ok: false,
                  erro: e instanceof Error ? e.message : "Erro ao validar item",
                  numeroEdital:
                    typeof rawItem.numeroEdital === "string" ? rawItem.numeroEdital : undefined,
                });
              }
            }
            await recordAuditLog({
              usuarioId: g.actor.id,
              usuarioNome: g.actor.name,
              acao: "ADMIN_IMPORTAR_LOTE_LICITACOES",
              entidadeTipo: "LICITACAO",
              entidadeId: "lote",
              depois: { total: parsed.itens.length, sucessos },
            }).catch(() => undefined);
            return NextResponse.json({
              ok: true,
              total: parsed.itens.length,
              resultados,
            });
          }
          case "sincronizar_pncp": {
            const r = await executarIngestaoDiariaPncp({
              diasRetroativos: parsed.diasRetroativos,
              dataInicial: parsed.dataInicial,
              dataFinal: parsed.dataFinal,
              origem: "MANUAL",
              usarIa: parsed.usarIa,
            });
            await recordAuditLog({
              usuarioId: g.actor.id,
              usuarioNome: g.actor.name,
              acao: "ADMIN_SINCRONIZAR_PNCP",
              entidadeTipo: "PNCP_INGEST",
              entidadeId: r.id,
              depois: {
                diasRetroativos: parsed.diasRetroativos,
                dataInicial: parsed.dataInicial,
                dataFinal: parsed.dataFinal,
                usarIa: parsed.usarIa,
                criados: r.criados,
                atualizados: r.atualizados,
                status: r.status,
              },
            }).catch(() => undefined);
            return NextResponse.json(r, { status: r.ok ? 200 : 207 });
          }
        }
      } catch (error) {
        return respostaErroAdmin(error, "licitacoes-post");
      }
    },
  );
}

import { NextRequest, NextResponse } from "next/server";
import { runWithAuditActorContext } from "@/server/audit";
import { exigirAdmin, respostaErroAdmin } from "@/server/auth/admin-guard";
import { AdminClientesPatchSchema } from "@/server/schemas/superadmin.schema";
import {
  atualizarContaPrincipalSuperAdmin,
  atualizarCotasClienteSuperAdmin,
  injetarLicitacaoNoKanbanClienteSuperAdmin,
  obterDossieCliente360SuperAdmin,
  obterEspelhamentoClienteSuperAdmin,
  resolverDisputaCnpjSuperAdmin,
  salvarEmpresaClienteSuperAdmin,
  salvarUsuarioClienteSuperAdmin,
} from "@/server/services/superadmin.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET: dossiê 360º do cliente (`?espelho=1` retorna a visão somente-leitura do cliente). */
export async function GET(req: NextRequest, ctx: Ctx) {
  const g = await exigirAdmin("clientes");
  if (!g.ok) return g.response;
  return runWithAuditActorContext(
    {
      usuarioId: g.actor.id,
      usuarioNome: g.actor.name,
      ip: req.headers.get("x-forwarded-for") ?? null,
    },
    async () => {
      try {
        const { id } = await ctx.params;
        if (req.nextUrl.searchParams.get("espelho") === "1") {
          return NextResponse.json(await obterEspelhamentoClienteSuperAdmin(id));
        }
        return NextResponse.json(await obterDossieCliente360SuperAdmin(id));
      } catch (error) {
        return respostaErroAdmin(error, "cliente-360");
      }
    },
  );
}

/**
 * PATCH `{ tipo, ...dados }` — tipo: `conta` | `empresa` | `usuario` | `cotas` | `disputa` | `injetar`.
 * Valida contrato Zod e verifica posse no dossiê do cliente (anti-IDOR). Nunca aceita nem retorna senhas.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const g = await exigirAdmin("clientes", "escrever");
  if (!g.ok) return g.response;
  return runWithAuditActorContext(
    {
      usuarioId: g.actor.id,
      usuarioNome: g.actor.name,
      ip: req.headers.get("x-forwarded-for") ?? null,
    },
    async () => {
      try {
        const { id } = await ctx.params;
        const parsed = AdminClientesPatchSchema.parse(await req.json());
        const dossie = await obterDossieCliente360SuperAdmin(id);

        switch (parsed.tipo) {
          case "conta": {
            const pertence =
              dossie.titular?.id === parsed.userId ||
              dossie.usuarios.some((u) => u.id === parsed.userId);
            if (!pertence) {
              return NextResponse.json(
                { error: "Usuário informado não pertence a este cliente." },
                { status: 403 },
              );
            }
            const { tipo: _tipo, ...dadosConta } = parsed;
            return NextResponse.json(await atualizarContaPrincipalSuperAdmin(dadosConta));
          }
          case "empresa": {
            if (
              parsed.tenantId &&
              !dossie.empresas.some((e) => e.id === parsed.tenantId)
            ) {
              return NextResponse.json(
                { error: "Empresa (CNPJ) informada não pertence a este cliente." },
                { status: 403 },
              );
            }
            if (
              parsed.ownerUserId &&
              dossie.titular?.id !== parsed.ownerUserId &&
              !dossie.usuarios.some((u) => u.id === parsed.ownerUserId)
            ) {
              return NextResponse.json(
                { error: "Titular informado não pertence a este cliente." },
                { status: 403 },
              );
            }
            const { tipo: _tipo, ...dadosEmpresa } = parsed;
            return NextResponse.json(
              await salvarEmpresaClienteSuperAdmin({
                ...dadosEmpresa,
                ownerUserId: dadosEmpresa.ownerUserId ?? dossie.titular?.id ?? null,
              }),
            );
          }
          case "usuario": {
            const targetTenantId = parsed.tenantId || dossie.tenantId;
            if (!dossie.empresas.some((e) => e.id === targetTenantId)) {
              return NextResponse.json(
                { error: "Empresa (CNPJ) informada não pertence a este cliente." },
                { status: 403 },
              );
            }
            if (
              parsed.userId &&
              !dossie.usuarios.some((u) => u.id === parsed.userId)
            ) {
              return NextResponse.json(
                { error: "Usuário informado não pertence a este cliente." },
                { status: 403 },
              );
            }
            const { tipo: _tipo, ...dadosUsuario } = parsed;
            return NextResponse.json(
              await salvarUsuarioClienteSuperAdmin({
                ...dadosUsuario,
                tenantId: targetTenantId,
              }),
            );
          }
          case "cotas": {
            const targetTenantId = parsed.tenantId || dossie.tenantId;
            if (!dossie.empresas.some((e) => e.id === targetTenantId)) {
              return NextResponse.json(
                { error: "Empresa (CNPJ) informada não pertence a este cliente." },
                { status: 403 },
              );
            }
            const { tipo: _tipo, ...dadosCotas } = parsed;
            return NextResponse.json(
              await atualizarCotasClienteSuperAdmin({
                ...dadosCotas,
                tenantId: targetTenantId,
              }),
            );
          }
          case "disputa": {
            if (!dossie.disputas.some((d) => d.id === parsed.disputaId)) {
              return NextResponse.json(
                { error: "Disputa informada não pertence a este cliente." },
                { status: 403 },
              );
            }
            return NextResponse.json(
              await resolverDisputaCnpjSuperAdmin(
                parsed.disputaId,
                parsed.status,
                g.actor.name,
              ),
            );
          }
          case "injetar": {
            const targetTenantId = parsed.tenantId || dossie.tenantId;
            if (!dossie.empresas.some((e) => e.id === targetTenantId)) {
              return NextResponse.json(
                { error: "Empresa (CNPJ) informada não pertence a este cliente." },
                { status: 403 },
              );
            }
            return NextResponse.json(
              await injetarLicitacaoNoKanbanClienteSuperAdmin({
                licitacaoId: parsed.licitacaoId,
                tenantId: targetTenantId,
                statusKanban: parsed.statusKanban,
                notas: parsed.notas,
              }),
            );
          }
        }
      } catch (error) {
        return respostaErroAdmin(error, "cliente-patch");
      }
    },
  );
}

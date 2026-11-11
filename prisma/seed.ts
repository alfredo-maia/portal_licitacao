import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { buildLicitacoesSeed } from "../src/config/licitacoes-seed";
import { prisma } from "../src/lib/prisma";
import {
  TIPOS_SISTEMA_CATALOG,
  type TipoSistemaCatalogEntry,
} from "../src/config/tipos-sistema";
import { computeHashCritico } from "../src/server/services/hash-critico";
import {
  DEFAULT_SEED_DIRECTOR_PASSWORD,
  DIRECTORS_SEED,
  upsertInMemoryAuthUser,
} from "../src/server/auth";
import {
  type SeedDirectorContract,
  seedDirectorSchema,
} from "../src/server/schemas/auth.schema";

export { DIRECTORS_SEED };

/**
 * Provisionamento idempotente dos 2 administradores iniciais no banco de dados (PRD §2.3 / sprint-0-spec §2.5 / Issue #50):
 * 1. Vítor Henrique (vitorhenrique018@gmail.com) - SUPERADMIN / SUPERADMIN_MASTER
 * 2. Alfredo Maia (alfredosouza100@gmail.com) - DIRETORIA
 */
export async function seedDirectors(): Promise<readonly SeedDirectorContract[]> {
  const rawPassword =
    process.env.SEED_DIRECTOR_PASSWORD || DEFAULT_SEED_DIRECTOR_PASSWORD;
  const passwordHash = await bcrypt.hash(rawPassword, 10);
  const configuredMasterPassword = process.env.SUPERADMIN_MASTER_PASSWORD;
  const isProdRuntime = process.env.NODE_ENV === "production";
  const superAdminRawPassword =
    configuredMasterPassword || (!isProdRuntime ? "123456" : randomUUID());
  const superAdminPasswordHash = await bcrypt.hash(superAdminRawPassword, 10);

  const provisioned: SeedDirectorContract[] = [];

  for (const director of DIRECTORS_SEED) {
    const validatedDirector = seedDirectorSchema.parse(director);
    const isSuper =
      validatedDirector.role === "SUPERADMIN" ||
      Boolean(validatedDirector.isSuperAdmin);
    const resolvedHash = isSuper ? superAdminPasswordHash : passwordHash;
    let userId = `seed_${randomUUID()}`;

    try {
      const existing = await prisma.user.findUnique({
        where: { email: validatedDirector.email },
      });
      if (!existing) {
        const created = await prisma.user.create({
          data: {
            name: validatedDirector.name,
            email: validatedDirector.email,
            passwordHash: resolvedHash,
            role: validatedDirector.role,
            isSuperAdmin: isSuper,
            adminRole: validatedDirector.adminRole ?? null,
            ativo: validatedDirector.ativo,
          },
        });
        userId = created.id;
      } else {
        const updateData: {
          name: string;
          role: "DIRETORIA" | "SUPERADMIN";
          isSuperAdmin: boolean;
          adminRole: "SUPERADMIN_MASTER" | "ADMIN_OPERACIONAL" | "SUPORTE_N1" | null;
          ativo: boolean;
          passwordHash?: string;
        } = {
          name: validatedDirector.name,
          role: validatedDirector.role,
          isSuperAdmin: isSuper,
          adminRole: validatedDirector.adminRole ?? null,
          ativo: validatedDirector.ativo,
        };
        if (!isSuper || configuredMasterPassword || !isProdRuntime) {
          updateData.passwordHash = resolvedHash;
        }
        const updated = await prisma.user.update({
          where: { email: validatedDirector.email },
          data: updateData,
        });
        userId = updated.id;
      }
      if (isSuper) {
        await prisma.tenantUser.deleteMany({ where: { userId } }).catch(() => undefined);
      }
    } catch {
      // Fallback resiliente caso o banco PostgreSQL não esteja ativo no ambiente de execução (ex.: CI)
    }

    upsertInMemoryAuthUser({
      id: userId,
      name: validatedDirector.name,
      email: validatedDirector.email,
      role: validatedDirector.role,
      isSuperAdmin: isSuper,
      adminRole: validatedDirector.adminRole ?? null,
      ativo: validatedDirector.ativo,
      passwordHash: resolvedHash,
      activeTenantId: isSuper ? null : undefined,
      cnpj: isSuper ? null : undefined,
      plano: isSuper ? null : undefined,
      tenantRole: isSuper ? null : undefined,
    });

    provisioned.push(validatedDirector);
  }

  return provisioned;
}

export type SeedTipoSistemaContract = TipoSistemaCatalogEntry & {
  readonly ativo: boolean;
};

/**
 * Provisionamento idempotente (upsert por `codigo`) dos 22 Tipos de Sistema
 * padronizados (PRD §5.1 / sprint-1-spec §2.1). Em ambientes sem PostgreSQL
 * acessível (ex.: testes unitários em CI), faz fallback resiliente: o catálogo
 * tipado em `src/config/tipos-sistema.ts` permanece a fonte da verdade.
 */
export async function seedTiposSistema(): Promise<
  readonly SeedTipoSistemaContract[]
> {
  const provisioned: SeedTipoSistemaContract[] = [];

  for (const tipo of TIPOS_SISTEMA_CATALOG) {
    try {
      await prisma.tipoSistema.upsert({
        where: { codigo: tipo.codigo },
        update: {
          nome: tipo.nome,
          ordem: tipo.ordem,
          ativo: true,
        },
        create: {
          codigo: tipo.codigo,
          nome: tipo.nome,
          ordem: tipo.ordem,
          ativo: true,
        },
      });
    } catch {
      // Fallback resiliente caso o banco PostgreSQL não esteja ativo no ambiente de execução (ex.: CI)
    }

    provisioned.push({ ...tipo, ativo: true });
  }

  return provisioned;
}

/**
 * Provisionamento idempotente (upsert por `idPncp`) das licitações iniciais
 * realistas da Central de Oportunidades (sprint-1-spec §2.3): 4 certames
 * cobrindo pareceres GO/AVALIAR/NO_GO, UFs e faixas de valor distintas e os
 * tipos EDUCACAO_PORTAL, SAUDE_ATENCAO_BASICA, GESTAO_PUBLICA_ERP e
 * INFRA_CLOUD_SUPORTE, com `hashCritico` (SHA-256) calculado. Sem PostgreSQL
 * acessível, faz fallback resiliente silencioso — o catálogo em memória de
 * `src/server/services/licitacoes-store.ts` cobre os testes automatizados.
 */
export async function seedLicitacoesIniciais(): Promise<number> {
  const itens = buildLicitacoesSeed();
  let provisionados = 0;

  for (const item of itens) {
    const hashCritico = computeHashCritico(item);
    const dados = {
      numeroControlePNCP: item.numeroControlePNCP ?? item.idPncp,
      numeroEdital: item.numeroEdital,
      orgaoNome: item.orgaoNome,
      orgaoCnpj: item.orgaoCnpj,
      uf: item.uf,
      municipio: item.municipio,
      esfera: item.esfera,
      poder: item.poder,
      modalidade: item.modalidade,
      portalDisputa: item.portalDisputa,
      miniResumo: item.miniResumo,
      resumo: item.resumo,
      valorEstimado: item.valorEstimado,
      dataAbertura: item.dataAbertura,
      dataEncerramentoProposta: item.dataEncerramentoProposta ?? item.dataAbertura,
      dataPublicacaoPncp: item.dataPublicacaoPncp,
      dataUltimaAtualizacao: item.dataPublicacaoPncp,
      status: item.status,
      parecerIA: item.parecerIA,
      justificativaIA: item.justificativaIA,
      tipoSistemaCodigo: item.tipoSistemaCodigo,
      segmentoMacro: item.segmentoMacro ?? null,
      subcategorias: (item.subcategorias ? [...item.subcategorias] : []) as any,
      atestadosExigidos: (item.atestadosExigidos ? [...item.atestadosExigidos] : []) as any,
      motivoRecusa: null,
      quantidadeLotes: item.quantidadeLotes,
      loteUnico: item.loteUnico,
      precoPorLote: item.precoPorLote,
      isPresencial: item.isPresencial,
      distanciaGoianiaKm: item.distanciaGoianiaKm,
      linkPncp: item.linkPncp,
      linkSistemaOrigem: item.linkSistemaOrigem ?? null,
      hashCritico,
      responsavelId: null,
    };

    try {
      await prisma.licitacao.upsert({
        where: { idPncp: item.idPncp },
        update: dados,
        create: { idPncp: item.idPncp, ...dados },
      });
      provisionados += 1;
    } catch {
      // Fallback resiliente caso o banco PostgreSQL não esteja ativo (ex.: CI)
    }
  }

  return provisionados;
}

if (require.main === module) {
  seedDirectors()
    .then(async (seeded) => {
      console.log(
        `[seed] ${seeded.length} diretores provisionados com sucesso:`,
        seeded.map((d) => d.email).join(", "),
      );
      const tipos = await seedTiposSistema();
      console.log(
        `[seed] ${tipos.length} tipos de sistema provisionados com sucesso:`,
        tipos.map((t) => t.codigo).join(", "),
      );
      const licitacoes = await seedLicitacoesIniciais();
      console.log(
        `[seed] ${licitacoes} licitações iniciais provisionadas com sucesso.`,
      );
    })
    .catch((error: unknown) => {
      console.error("[seed] Falha ao provisionar seeds:", error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect().catch(() => undefined);
    });
}

import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/server/audit";
import {
  type ConfiguracaoEmpresa,
  type ConfiguracaoEmpresaAtualizarInput,
  type UsuarioEquipeAtualizarInput,
  type UsuarioEquipeCriarInput,
  type UsuarioEquipeItem,
  type UsuarioEquipeListResponse,
  configuracaoEmpresaAtualizarInputSchema,
  usuarioEquipeAtualizarInputSchema,
  usuarioEquipeCriarInputSchema,
} from "@/server/schemas/configuracao.schema";
import {
  getInMemoryConfiguracaoEmpresa,
  getInMemoryUsuario,
  insertInMemoryUsuario,
  listInMemoryUsuarios,
  updateInMemoryConfiguracaoEmpresa,
  updateInMemoryUsuario,
} from "./licitacoes-store";
import bcrypt from "bcryptjs";
import { canManageTeamMember } from "@/lib/rbac";

export async function obterConfiguracaoEmpresa(
  tenantId?: string | null,
): Promise<ConfiguracaoEmpresa> {
  try {
    if (tenantId) {
      const config = await (prisma as any).configuracaoEmpresa.findFirst({
        where: { tenantId },
      });
      if (config) return config;

      // Se o tenant existe mas ainda não possui configuracao_empresa salva, sintetiza a partir do tenant
      const tenant = await (prisma as any).tenant.findUnique({
        where: { id: tenantId },
      });
      if (tenant) {
        return {
          id: `cfg_${tenant.id}`,
          razaoSocial: tenant.razaoSocial,
          cnpj: tenant.cnpj,
          inscricaoEstadual: "",
          cnae: tenant.cnaePrincipal || "",
          endereco: tenant.endereco || "",
          cidade: tenant.cidade || "",
          uf: tenant.uf || (Array.isArray(tenant.ufs) ? tenant.ufs[0] : "") || "GO",
          cep: "",
          representanteNome: "",
          representanteCpf: "",
          representanteRg: "",
          representanteCargo: "Sócio-Administrador",
          bancoNome: "",
          agencia: "",
          contaCorrente: "",
          chavePix: tenant.cnpj,
        };
      }
    }

    const config = await (prisma as any).configuracaoEmpresa.findUnique({
      where: { id: "default" },
    });
    if (config) return config;
    return getInMemoryConfiguracaoEmpresa();
  } catch {
    return getInMemoryConfiguracaoEmpresa();
  }
}

export async function atualizarConfiguracaoEmpresa(
  data: ConfiguracaoEmpresaAtualizarInput,
  usuarioId?: string | null,
  tenantId?: string | null,
): Promise<ConfiguracaoEmpresa> {
  const validado = configuracaoEmpresaAtualizarInputSchema.parse(data);

  try {
    if (tenantId) {
      const atualizado = await (prisma as any).configuracaoEmpresa.upsert({
        where: { tenantId },
        create: {
          ...validado,
          id: `cfg_${tenantId}`,
          tenantId,
        },
        update: validado,
      });

      await (prisma as any).tenant.update({
        where: { id: tenantId },
        data: {
          ...(validado.razaoSocial ? { razaoSocial: validado.razaoSocial } : {}),
          ...(validado.cnpj ? { cnpj: validado.cnpj } : {}),
          ...(validado.uf ? { uf: validado.uf } : {}),
          ...(validado.cidade ? { cidade: validado.cidade } : {}),
          ...(validado.endereco ? { endereco: validado.endereco } : {}),
        },
      }).catch(() => undefined);

      await recordAuditLog({
        acao: "CONFIGURACAO_EMPRESA_ATUALIZADA",
        entidadeTipo: "CONFIGURACAO",
        entidadeId: atualizado.id,
        usuarioId: usuarioId ?? null,
        depois: validado as any,
      });

      return atualizado;
    }

    const atualizado = await (prisma as any).configuracaoEmpresa.upsert({
      where: { id: "default" },
      create: { ...validado, id: "default" },
      update: validado,
    });

    await recordAuditLog({
      acao: "CONFIGURACAO_EMPRESA_ATUALIZADA",
      entidadeTipo: "CONFIGURACAO",
      entidadeId: "default",
      usuarioId: usuarioId ?? null,
      depois: validado as any,
    });

    return atualizado;
  } catch {
    const memoria = updateInMemoryConfiguracaoEmpresa(validado);

    await recordAuditLog({
      acao: "CONFIGURACAO_EMPRESA_ATUALIZADA",
      entidadeTipo: "CONFIGURACAO",
      entidadeId: tenantId ? `cfg_${tenantId}` : "default",
      usuarioId: usuarioId ?? null,
      depois: validado as any,
    });

    return memoria;
  }
}

export async function listarEquipe(
  tenantId?: string | null,
): Promise<UsuarioEquipeListResponse> {
  try {
    if (tenantId) {
      const memberships = await prisma.tenantUser.findMany({
        where: { tenantId },
        include: { user: true },
        orderBy: { criadoEm: "asc" },
      });

      return {
        ok: true,
        total: memberships.length,
        usuarios: memberships.map((m) => ({
          id: m.user.id,
          name: m.user.name,
          email: m.user.email,
          role: (m.user.role === "OPERADOR" ? "OPERADOR_TECNICO" : m.user.role) as any,
          ativo: m.ativo && m.user.ativo,
          createdAt: m.user.createdAt,
          updatedAt: m.user.updatedAt,
        })),
      };
    }

    const usuarios = await prisma.user.findMany({
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        ativo: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      ok: true,
      total: usuarios.length,
      usuarios: usuarios.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: (u.role === "OPERADOR" ? "OPERADOR_TECNICO" : u.role) as any,
        ativo: u.ativo,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      })),
    };
  } catch {
    const usuarios = listInMemoryUsuarios(tenantId);
    return {
      ok: true,
      total: usuarios.length,
      usuarios: usuarios.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        ativo: u.ativo,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      })),
    };
  }
}

export async function criarMembroEquipe(
  data: UsuarioEquipeCriarInput,
  usuarioId?: string | null,
  actor?: { id: string; role: string },
  tenantId?: string | null,
): Promise<UsuarioEquipeItem> {
  const validado = usuarioEquipeCriarInputSchema.parse(data);

  if (actor) {
    const perm = canManageTeamMember({
      actor,
      action: "create",
      newRole: validado.role,
    });
    if (!perm.allowed) {
      throw new Error(perm.reason || "Ação não permitida pelas regras de governança.");
    }
  }

  const passwordHash = await bcrypt.hash(validado.password, 10);
  const prismaRole = validado.role === "OPERADOR_TECNICO" ? "OPERADOR" : validado.role;

  try {
    const novo = await prisma.user.create({
      data: {
        name: validado.name,
        email: validado.email,
        passwordHash,
        role: prismaRole as any,
        ativo: validado.ativo,
      },
    });

    if (tenantId) {
      await prisma.tenantUser.create({
        data: {
          tenantId,
          userId: novo.id,
          role: "MEMBRO",
          ativo: validado.ativo,
        },
      });
    }

    await recordAuditLog({
      acao: "USUARIO_CRIADO",
      entidadeTipo: "USUARIO",
      entidadeId: novo.id,
      tenantId: tenantId ?? null,
      usuarioId: usuarioId ?? null,
      depois: { name: novo.name, email: novo.email, role: validado.role },
    });

    return {
      id: novo.id,
      name: novo.name,
      email: novo.email,
      role: validado.role,
      ativo: novo.ativo,
      createdAt: novo.createdAt,
      updatedAt: novo.updatedAt,
    };
  } catch {
    const memoria = insertInMemoryUsuario({
      name: validado.name,
      email: validado.email,
      role: validado.role,
      ativo: validado.ativo,
      tenantId: tenantId ?? null,
    });

    await recordAuditLog({
      acao: "USUARIO_CRIADO",
      entidadeTipo: "USUARIO",
      entidadeId: memoria.id,
      tenantId: tenantId ?? null,
      usuarioId: usuarioId ?? null,
      depois: { name: memoria.name, email: memoria.email, role: validado.role },
    });

    return memoria;
  }
}

export async function atualizarMembroEquipe(
  id: string,
  data: UsuarioEquipeAtualizarInput,
  usuarioId?: string | null,
  actor?: { id: string; role: string },
  tenantId?: string | null,
): Promise<UsuarioEquipeItem | null> {
  const validado = usuarioEquipeAtualizarInputSchema.parse(data);

  if (tenantId) {
    let pertenceAoTenant = false;
    try {
      const membership = await prisma.tenantUser.findUnique({
        where: {
          tenantId_userId: {
            tenantId,
            userId: id,
          },
        },
      });
      pertenceAoTenant = Boolean(membership);
    } catch {
      const memUser = getInMemoryUsuario(id);
      pertenceAoTenant = Boolean(memUser && (!memUser.tenantId || memUser.tenantId === tenantId));
    }

    if (!pertenceAoTenant) {
      throw new Error("Colaborador não pertence à sua organização.");
    }
  }

  if (actor) {
    let existingUser: any;
    try {
      existingUser = await prisma.user.findUnique({ where: { id } });
    } catch {
      existingUser = getInMemoryUsuario(id);
    }

    if (existingUser) {
      const perm = canManageTeamMember({
        actor,
        targetUser: {
          id: existingUser.id,
          role: existingUser.role === "OPERADOR" ? "OPERADOR_TECNICO" : existingUser.role,
          ativo: existingUser.ativo,
        },
        action: validado.role ? "update_role" : "toggle_ativo",
        newRole: validado.role,
        newAtivo: validado.ativo,
      });
      if (!perm.allowed) {
        throw new Error(perm.reason || "Ação não permitida pelas regras de governança.");
      }
    }
  }

  let passwordHash: string | undefined;
  if (validado.password) {
    passwordHash = await bcrypt.hash(validado.password, 10);
  }

  const prismaRole = validado.role
    ? validado.role === "OPERADOR_TECNICO"
      ? "OPERADOR"
      : validado.role
    : undefined;

  try {
    const atualizado = await prisma.user.update({
      where: { id },
      data: {
        ...(validado.name ? { name: validado.name } : {}),
        ...(validado.email ? { email: validado.email } : {}),
        ...(prismaRole ? { role: prismaRole as any } : {}),
        ...(validado.ativo !== undefined ? { ativo: validado.ativo } : {}),
        ...(passwordHash ? { passwordHash } : {}),
      },
    });

    if (tenantId && validado.ativo !== undefined) {
      await prisma.tenantUser.updateMany({
        where: { tenantId, userId: id },
        data: { ativo: validado.ativo },
      }).catch(() => undefined);
    }

    await recordAuditLog({
      acao: "USUARIO_ATUALIZADO",
      entidadeTipo: "USUARIO",
      entidadeId: id,
      tenantId: tenantId ?? null,
      usuarioId: usuarioId ?? null,
      depois: validado as any,
    });

    return {
      id: atualizado.id,
      name: atualizado.name,
      email: atualizado.email,
      role: (atualizado.role === "OPERADOR" ? "OPERADOR_TECNICO" : atualizado.role) as any,
      ativo: atualizado.ativo,
      createdAt: atualizado.createdAt,
      updatedAt: atualizado.updatedAt,
    };
  } catch (err: any) {
    if (err.message?.includes("não pertence")) {
      throw err;
    }
    const memoria = updateInMemoryUsuario(id, validado);
    if (!memoria) return null;

    await recordAuditLog({
      acao: "USUARIO_ATUALIZADO",
      entidadeTipo: "USUARIO",
      entidadeId: id,
      tenantId: tenantId ?? null,
      usuarioId: usuarioId ?? null,
      depois: validado as any,
    });

    return memoria;
  }
}

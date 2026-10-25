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

export async function obterConfiguracaoEmpresa(): Promise<ConfiguracaoEmpresa> {
  try {
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
): Promise<ConfiguracaoEmpresa> {
  const validado = configuracaoEmpresaAtualizarInputSchema.parse(data);

  try {
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
      entidadeId: "default",
      usuarioId: usuarioId ?? null,
      depois: validado as any,
    });

    return memoria;
  }
}

export async function listarEquipe(): Promise<UsuarioEquipeListResponse> {
  try {
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
    const usuarios = listInMemoryUsuarios();
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

    await recordAuditLog({
      acao: "USUARIO_CRIADO",
      entidadeTipo: "USUARIO",
      entidadeId: novo.id,
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
    });

    await recordAuditLog({
      acao: "USUARIO_CRIADO",
      entidadeTipo: "USUARIO",
      entidadeId: memoria.id,
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
): Promise<UsuarioEquipeItem | null> {
  const validado = usuarioEquipeAtualizarInputSchema.parse(data);

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

    await recordAuditLog({
      acao: "USUARIO_ATUALIZADO",
      entidadeTipo: "USUARIO",
      entidadeId: id,
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
  } catch {
    const memoria = updateInMemoryUsuario(id, validado);
    if (!memoria) return null;

    await recordAuditLog({
      acao: "USUARIO_ATUALIZADO",
      entidadeTipo: "USUARIO",
      entidadeId: id,
      usuarioId: usuarioId ?? null,
      depois: validado as any,
    });

    return memoria;
  }
}

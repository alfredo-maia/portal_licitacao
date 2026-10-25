import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const usuarios = await prisma.user.findMany({
      where: { ativo: true },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ ok: true, usuarios }, { status: 200 });
  } catch {
    // Fallback if DB offline (seed users)
    const fallback = [
      { id: "usr_vitor", name: "Vítor Henrique", email: "vitorhenrique018@gmail.com", role: "DIRETORIA" },
      { id: "usr_alfredo", name: "Alfredo Souza", email: "alfredosouza100@gmail.com", role: "DIRETORIA" },
    ];
    return NextResponse.json({ ok: true, usuarios: fallback }, { status: 200 });
  }
}

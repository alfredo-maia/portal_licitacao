import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/server/auth";
import { createTenantSchema } from "@/server/schemas/tenant.schema";
import {
  createTenantForUser,
  listTenantsForUser,
  PlanQuotaExceededError,
  TenantCollisionError,
} from "@/server/services/tenant.service";

export async function GET() {
  const session = await getServerSession(authOptions);
  const user = session?.user as
    | { id?: string; email?: string; name?: string }
    | undefined;

  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const memberships = await listTenantsForUser(user.id);
    return NextResponse.json({ ok: true, tenants: memberships }, { status: 200 });
  } catch (error) {
    const err = error as Error;
    return NextResponse.json(
      { ok: false, error: "FETCH_FAILED", message: err.message },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const user = session?.user as
    | { id?: string; email?: string; name?: string; plano?: string }
    | undefined;

  if (!user?.id || !user?.email) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = createTenantSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "VALIDATION_ERROR",
          message: parsed.error.errors[0]?.message || "Dados inválidos para criação do CNPJ.",
          details: parsed.error.format(),
        },
        { status: 400 },
      );
    }

    const tenant = await createTenantForUser({
      userId: user.id,
      userEmail: user.email,
      userName: user.name || "Titular",
      userPlan: (user.plano as any) || parsed.data.plano,
      input: parsed.data,
    });

    return NextResponse.json({ ok: true, tenant }, { status: 201 });
  } catch (error) {
    if (error instanceof TenantCollisionError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.code,
          message: error.message,
        },
        { status: error.statusCode },
      );
    }

    if (error instanceof PlanQuotaExceededError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.code,
          message: error.message,
        },
        { status: error.statusCode },
      );
    }

    const err = error as Error;
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR", message: err.message },
      { status: 500 },
    );
  }
}

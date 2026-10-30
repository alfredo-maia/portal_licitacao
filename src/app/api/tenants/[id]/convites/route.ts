import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/server/auth";
import { inviteMemberSchema } from "@/server/schemas/tenant.schema";
import {
  inviteTeamMember,
  TeamSeatLimitExceededError,
  TenantNotFoundError,
  UnauthorizedTenantActionError,
} from "@/server/services/tenant.service";

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string } | undefined;

  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id: tenantId } = await params;

  try {
    const body = await request.json();
    const parsed = inviteMemberSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "VALIDATION_ERROR",
          message: parsed.error.errors[0]?.message || "E-mail inválido para convite.",
        },
        { status: 400 },
      );
    }

    const convite = await inviteTeamMember({
      tenantId,
      senderUserId: user.id,
      input: parsed.data,
    });

    return NextResponse.json({ ok: true, convite }, { status: 201 });
  } catch (error) {
    if (error instanceof TeamSeatLimitExceededError) {
      return NextResponse.json(
        { ok: false, error: error.code, message: error.message },
        { status: error.statusCode },
      );
    }

    if (error instanceof UnauthorizedTenantActionError) {
      return NextResponse.json(
        { ok: false, error: error.code, message: error.message },
        { status: error.statusCode },
      );
    }

    if (error instanceof TenantNotFoundError) {
      return NextResponse.json(
        { ok: false, error: error.code, message: error.message },
        { status: error.statusCode },
      );
    }

    const err = error as Error;
    return NextResponse.json(
      { ok: false, error: "BAD_REQUEST", message: err.message },
      { status: 400 },
    );
  }
}

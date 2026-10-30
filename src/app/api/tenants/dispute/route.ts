import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/server/auth";
import { disputeClaimCnpjSchema } from "@/server/schemas/tenant.schema";
import { disputeClaimCnpj } from "@/server/services/tenant.service";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const user = session?.user as
    | { id?: string; email?: string }
    | undefined;

  if (!user?.id || !user?.email) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = disputeClaimCnpjSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "VALIDATION_ERROR",
          message: parsed.error.errors[0]?.message || "Dados de contestação inválidos.",
        },
        { status: 400 },
      );
    }

    const result = await disputeClaimCnpj({
      userId: user.id,
      userEmail: user.email,
      input: parsed.data,
    });

    return NextResponse.json({ ok: true, dispute: result }, { status: 200 });
  } catch (error) {
    const err = error as Error;
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR", message: err.message },
      { status: 500 },
    );
  }
}

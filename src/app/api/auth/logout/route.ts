import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ ok: true, message: "Sessão encerrada com sucesso." });

  // Expira os cookies de sessão de forma explícita
  response.cookies.set("portal_licitacao_token", "", {
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  });
  response.cookies.set("next-auth.session-token", "", {
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  });
  response.cookies.set("__Secure-next-auth.session-token", "", {
    path: "/",
    expires: new Date(0),
    maxAge: 0,
    secure: true,
  });

  return response;
}

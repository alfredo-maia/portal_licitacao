import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { realizarCadastroConta } from "@/server/services/cadastro.service";
import { listarPortais } from "@/server/services/portais.service";
import { listarDocumentos } from "@/server/services/documentos.service";
import { listarEquipe, obterConfiguracaoEmpresa } from "@/server/services/configuracoes.service";
import { getDashboardData } from "@/server/services/dashboard.service";
import { resolveUserActiveTenantId } from "@/server/services/tenant.service";
import { POST as logoutPost } from "@/app/api/auth/logout/route";
import { POST as cadastroPost } from "@/app/api/auth/cadastro/route";
import { NextRequest } from "next/server";

describe("Issue #27 — Conta Nova no Cadastro Deve Vir 100% Zerada e Isolada", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("1. Ao cadastrar nova conta, serviços de Portais, Documentos e Equipe devem vir zerados para o novo tenant", async () => {
    const fakeCnpj = "11.222.333/0001-81";
    const fakeEmail = `nova_${Date.now()}@gmail.com`;

    const res = await realizarCadastroConta({
      cnpj: fakeCnpj,
      razaoSocial: "Empresa Nova 100% Zerada LTDA",
      nome: "Carlos Titular",
      email: fakeEmail,
      whatsapp: "(11) 99999-0000",
      senha: "SenhaSegura@2026",
      segmentos: ["ALIMENTOS_MERENDA_ESCOLAR"],
      subsegmentos: [],
      ufs: ["SP"],
      brasilInteiro: false,
    });

    expect(res.ok).toBe(true);
    expect(res.tenantId).toBeDefined();
    expect(res.userId).toBeDefined();

    // 1.1 Portais deve retornar vazio (0 portais)
    const portais = await listarPortais({ tenantId: res.tenantId });
    expect(portais.ok).toBe(true);
    expect(portais.portais).toHaveLength(0);
    expect(portais.total).toBe(0);

    // 1.2 Documentos deve retornar vazio (0 documentos)
    const docs = await listarDocumentos({ tenantId: res.tenantId });
    expect(docs.ok).toBe(true);
    expect(docs.documentos).toHaveLength(0);
    expect(docs.total).toBe(0);

    // 1.3 Equipe deve conter unicamente o novo usuário titular criado
    const equipe = await listarEquipe(res.tenantId, {
      id: res.userId,
      name: "Carlos Titular",
      email: fakeEmail,
      role: "DIRETORIA",
    });
    expect(equipe.ok).toBe(true);
    expect(equipe.usuarios).toHaveLength(1);
    expect(equipe.usuarios[0].email).toBe(fakeEmail);
    expect(equipe.usuarios[0].name).toBe("Carlos Titular");

    // 1.4 Dados da empresa devem refletir exatamente o onboarding
    const cfg = await obterConfiguracaoEmpresa(res.tenantId);
    expect(cfg.razaoSocial).toBe("Empresa Nova 100% Zerada LTDA");
    expect(cfg.cnpj).toBe(fakeCnpj);
  });

  it("2. Endpoint /api/auth/cadastro deve definir cookie portal_licitacao_active_tenant na resposta HTTP", async () => {
    const reqBody = {
      cnpj: "33.000.167/0001-01",
      razaoSocial: "Padaria Nova Esperança LTDA",
      nome: "Maria Padeira",
      email: `maria_${Date.now()}@gmail.com`,
      whatsapp: "(21) 98888-7777",
      senha: "SenhaSegura@2026",
      segmentos: ["ALIMENTOS_MERENDA_ESCOLAR"],
      subsegmentos: [],
      ufs: ["RJ"],
      brasilInteiro: false,
    };

    const req = new NextRequest("http://localhost:3011/api/auth/cadastro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reqBody),
    });

    const response = await cadastroPost(req);
    expect(response.status).toBe(201);

    const setCookieHeader = response.headers.get("set-cookie") || "";
    expect(setCookieHeader).toContain("portal_licitacao_active_tenant=");
  });

  it("3. Endpoint /api/auth/logout deve expirar explicitamente o cookie portal_licitacao_active_tenant", async () => {
    const res = await logoutPost();
    const setCookieHeader = res.headers.get("set-cookie") || "";
    expect(setCookieHeader).toContain("portal_licitacao_active_tenant=");
    expect(setCookieHeader).toContain("Max-Age=0");
  });

  it("4. resolveUserActiveTenantId deve rejeitar cookie forjado de outro tenant e retornar tenant legítimo do usuário", async () => {
    const userId = "usr_novo_cliente_123";
    const tenantLegitimo = "tnt_legitimo_456";
    const tenantAlheioForjado = "tenant_aponta_matriz";

    (vi.spyOn(prisma.tenantUser, "findFirst") as any).mockImplementation(async (args: any) => {
      // Se buscar membership do tenant forjado, retorna null
      if (args.where?.tenantId === tenantAlheioForjado) {
        return null;
      }
      // Se buscar membership do usuário sem tenantId específico, retorna o legítimo
      if (args.where?.userId === userId) {
        return {
          id: "tu_1",
          tenantId: tenantLegitimo,
          userId,
          role: "TITULAR",
          ativo: true,
          criadoEm: new Date(),
        } as any;
      }
      return null;
    });

    const resolved = await resolveUserActiveTenantId(userId, tenantAlheioForjado);
    expect(resolved).toBe(tenantLegitimo);
    expect(resolved).not.toBe(tenantAlheioForjado);
  });

  it("5. Dashboard de novo tenant deve vir com pipeline de deliberação zerado (emPrecificacao: 0, recusadas: 0)", async () => {
    const dashboard = await getDashboardData({
      tenantId: "tnt_novo_zerado_999",
      segmentosTenantAtivo: ["ALIMENTOS_MERENDA_ESCOLAR"],
    });

    expect(dashboard.cards.emPrecificacao.total).toBe(0);
    expect(dashboard.cards.recusadas.total).toBe(0);
    expect(dashboard.resultados.contempladas.total).toBe(0);
    expect(dashboard.resultados.contempladas.valorTotal).toBe(0);
    expect(dashboard.indicadores.volumeEmDisputa).toBe(0);
  });
});

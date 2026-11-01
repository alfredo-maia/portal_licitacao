import { describe, expect, it, beforeEach } from "vitest";
import {
  inMemoryTenants,
  resetInMemoryTenantStorage,
} from "@/server/services/tenant.service";
import { obterConfiguracaoEmpresa } from "@/server/services/configuracoes.service";

describe("Tarefa 3 — Trava para Novo CNPJ sem Segmentos / UFs (#26)", () => {
  beforeEach(() => {
    resetInMemoryTenantStorage();
  });

  it("deve identificar empresa recém-criada sem segmentos configurados", async () => {
    inMemoryTenants.set("tenant_novo_sem_seg", {
      id: "tenant_novo_sem_seg",
      cnpj: "99999999000199",
      razaoSocial: "Nova Empresa Sem Segmentos LTDA",
      plano: "PRO",
      maxCnpjs: 1,
      maxUsers: 2,
      ativo: true,
      segmentos: [],
      ufs: [],
      criadoEm: new Date(),
      updatedAt: new Date(),
    });

    const cfg = await obterConfiguracaoEmpresa("tenant_novo_sem_seg");
    const temSegmentos = Array.isArray(cfg?.segmentos) && cfg.segmentos.length > 0;
    expect(temSegmentos).toBe(false);
  });
});


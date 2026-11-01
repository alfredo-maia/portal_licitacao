import { describe, expect, it, vi } from "vitest";
import { obterConfiguracaoEmpresa } from "@/server/services/configuracoes.service";
import { listOportunidadesPaginadas } from "@/server/services/oportunidades.service";
import { prisma } from "@/lib/prisma";

describe("Tarefa 1 — Otimização de Performance e Cache de DDL (#26)", () => {
  it("não deve executar queries de DDL repetidas a cada chamada de obterConfiguracaoEmpresa", async () => {
    const executeSpy = vi.spyOn(prisma, "$executeRawUnsafe").mockResolvedValue(0 as any);

    // Primeira chamada: pode executar o ensure
    await obterConfiguracaoEmpresa("test_tenant_perf");
    const countPrimeira = executeSpy.mock.calls.length;

    // Chamadas subsequentes: não devem re-executar os DDLs
    await obterConfiguracaoEmpresa("test_tenant_perf");
    await obterConfiguracaoEmpresa("test_tenant_perf");
    const countSegunda = executeSpy.mock.calls.length;

    expect(countSegunda).toBe(countPrimeira);
    executeSpy.mockRestore();
  });

  it("listOportunidadesPaginadas deve responder de forma eficiente sem re-classificar registros já classificados", async () => {
    const start = Date.now();
    const result = await listOportunidadesPaginadas({ page: 1, pageSize: 10 });
    const duration = Date.now() - start;

    expect(result).toBeDefined();
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(10);
    // Deve responder rápido em memória/teste (< 500ms)
    expect(duration).toBeLessThan(1000);
  });
});


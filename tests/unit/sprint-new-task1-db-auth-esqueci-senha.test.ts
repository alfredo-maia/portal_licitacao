import { beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  _resetRateLimit,
  solicitarRecuperacaoSenha,
} from "@/server/services/esqueci-senha.service";

describe("Sprint New — Task 1: DDL Entrypoint, Trial=PRO & Esqueci-Senha Global Rate Limit", () => {
  beforeEach(() => {
    _resetRateLimit();
  });

  it("deve bloquear na 3ª tentativa mesmo quando o cliente digita 3 e-mails diferentes", async () => {
    const ip = "192.168.1.55";
    const r1 = await solicitarRecuperacaoSenha("vitorhenrique018@gmail.com", ip);
    const r2 = await solicitarRecuperacaoSenha("vitorhenrique019@gmail.com", ip);
    const r3 = await solicitarRecuperacaoSenha("vitorhenrique020@gmail.com", ip);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(r3.ok).toBe(false);
    expect(r3.code).toBe("RATE_LIMIT_EXCEEDED");
  });

  it("deve bloquear na 3ª tentativa quando o cliente digita o mesmo e-mail 3 vezes", async () => {
    const ip = "192.168.1.56";
    const r1 = await solicitarRecuperacaoSenha("vitorhenrique018@gmail.com", ip);
    const r2 = await solicitarRecuperacaoSenha("vitorhenrique018@gmail.com", ip);
    const r3 = await solicitarRecuperacaoSenha("vitorhenrique018@gmail.com", ip);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(r3.ok).toBe(false);
    expect(r3.code).toBe("RATE_LIMIT_EXCEEDED");
  });

  it("deve conter todas as colunas de User (cpf, telefone, cep, endereco) e Licitacao (esfera, poder) no docker-entrypoint.cjs", () => {
    const entrypointPath = path.resolve(process.cwd(), "scripts/docker-entrypoint.cjs");
    const content = fs.readFileSync(entrypointPath, "utf-8");

    expect(content).toContain(`ADD COLUMN IF NOT EXISTS "cpf"`);
    expect(content).toContain(`ADD COLUMN IF NOT EXISTS "cep"`);
    expect(content).toContain(`ADD COLUMN IF NOT EXISTS "logradouro"`);
    expect(content).toContain(`ADD COLUMN IF NOT EXISTS "esfera"`);
    expect(content).toContain(`ADD COLUMN IF NOT EXISTS "portalDisputa"`);
    expect(content).toContain(`opaonossopanificadora@gmail.com`);
  });
});


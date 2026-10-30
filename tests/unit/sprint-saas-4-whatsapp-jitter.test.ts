import { describe, it, expect } from "vitest";
import {
  calcWhatsAppJitterSeconds,
  sanitizarTelefoneBR,
  isWhatsAppOptOutMessage,
  formatarMensagemWhatsAppComOptOut,
} from "@/server/schemas/whatsapp.schema";
import {
  enfileirarMensagemWhatsApp,
  processarFilaWhatsAppComJitter,
  registrarOptOutWhatsApp,
  verificarNumeroBloqueadoOptOut,
  obterStatusInstanciaWhatsApp,
} from "@/server/services/whatsapp.service";

describe("Sprint SaaS 4 — Conector WhatsApp com Jitter Humano & Governança Anti-Ban", () => {
  describe("Funções Auxiliares de Sanitização & Jitter", () => {
    it("deve gerar jitter aleatório sempre entre 4 e 9 segundos", () => {
      for (let i = 0; i < 50; i++) {
        const jitter = calcWhatsAppJitterSeconds(4, 9);
        expect(jitter).toBeGreaterThanOrEqual(4);
        expect(jitter).toBeLessThanOrEqual(9);
      }
    });

    it("deve sanitizar telefone brasileiro adicionando DDI 55 quando ausente", () => {
      expect(sanitizarTelefoneBR("(62) 98765-4321")).toBe("5562987654321");
      expect(sanitizarTelefoneBR("62987654321")).toBe("5562987654321");
      expect(sanitizarTelefoneBR("5562987654321")).toBe("5562987654321");
      expect(sanitizarTelefoneBR("+55 62 98765-4321")).toBe("5562987654321");
    });

    it("deve anexar rodapé obrigatório de opt-out sem duplicar se já existir", () => {
      const msgOriginal = "Nova licitação aberta no seu segmento!";
      const formatada = formatarMensagemWhatsAppComOptOut(msgOriginal);

      expect(formatada).toContain("Para pausar estes alertas, responda PAUSAR");

      // Não duplica se já possuir
      const reformatada = formatarMensagemWhatsAppComOptOut(formatada);
      expect(reformatada).toBe(formatada);
    });

    it("deve identificar palavras-chave de opt-out legal", () => {
      expect(isWhatsAppOptOutMessage("PAUSAR")).toBe(true);
      expect(isWhatsAppOptOutMessage("sair")).toBe(true);
      expect(isWhatsAppOptOutMessage("stop")).toBe(true);
      expect(isWhatsAppOptOutMessage("cancelar alertas")).toBe(true);
      expect(isWhatsAppOptOutMessage("gostei da oportunidade")).toBe(false);
    });
  });

  describe("Fila de Mensagens com Jitter & Bloqueio por Opt-Out", () => {
    it("deve enfileirar mensagem com status PENDENTE e jitter calculado", async () => {
      const item = await enfileirarMensagemWhatsApp({
        destinatario: "62999998888",
        mensagem: "Prezado gestor, seu trial está ativo!",
        tipo: "BOAS_VINDAS",
      });

      expect(item.id).toBeDefined();
      expect(item.destinatario).toBe("5562999998888");
      expect(item.status).toBe("PENDENTE");
      expect(item.jitterSegundos).toBeGreaterThanOrEqual(4);
      expect(item.jitterSegundos).toBeLessThanOrEqual(9);
      expect(item.mensagem).toContain("Para pausar estes alertas");
    });

    it("deve rejeitar/pausar envio para números que registraram opt-out", async () => {
      const telefoneOptOut = "5562888887777";
      await registrarOptOutWhatsApp(telefoneOptOut, "Usuário solicitou pausa no chat");

      const bloqueado = await verificarNumeroBloqueadoOptOut(telefoneOptOut);
      expect(bloqueado).toBe(true);

      const envioTentativa = await enfileirarMensagemWhatsApp({
        destinatario: telefoneOptOut,
        mensagem: "Licitação urgente!",
        tipo: "ALERTA",
      });

      expect(envioTentativa.status).toBe("PAUSADO_OPT_OUT");
    });

    it("deve simular processamento da fila com jitter sem falhas", async () => {
      const resultado = await processarFilaWhatsAppComJitter({ limite: 3, simularDelay: false });
      expect(resultado).toBeDefined();
      expect(Array.isArray(resultado.processados)).toBe(true);
    });

    it("deve retornar status da instância e tamanho da fila para o SuperAdmin", async () => {
      const status = await obterStatusInstanciaWhatsApp();
      expect(status.instanciaConectada).toBeDefined();
      expect(typeof status.filaTamanho).toBe("number");
    });
  });
});

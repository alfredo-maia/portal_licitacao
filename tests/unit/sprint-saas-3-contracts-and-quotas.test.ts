import { describe, expect, it } from "vitest";
import {
  ALLOWED_MIME_TYPES,
  COTAS_STORAGE_POR_PLANO,
  MAX_FILE_SIZE_BYTES,
  calcularCotaUsoJusto,
  validarArquivoUploadSchema,
} from "@/server/schemas/storage-r2.schema";

describe("Sprint SaaS 3 — Contratos de Armazenamento R2, Segurança & Uso Justo", () => {
  describe("Validação de Arquivos & Whitelist de Segurança", () => {
    it("deve permitir PDFs e imagens padrão (PNG, JPEG)", () => {
      const pdf = validarArquivoUploadSchema.safeParse({
        nome: "edital-pregao-10-2026.pdf",
        tamanho: 5 * 1024 * 1024,
        mimeType: "application/pdf",
      });
      expect(pdf.success).toBe(true);

      const jpeg = validarArquivoUploadSchema.safeParse({
        nome: "certidao_negativa_fgts.jpg",
        tamanho: 2 * 1024 * 1024,
        mimeType: "image/jpeg",
      });
      expect(jpeg.success).toBe(true);

      const png = validarArquivoUploadSchema.safeParse({
        nome: "contrato_social_assinado.png",
        tamanho: 3 * 1024 * 1024,
        mimeType: "image/png",
      });
      expect(png.success).toBe(true);
    });

    it("deve rejeitar executáveis, zips, planilhas macro e vídeos", () => {
      const executavel = validarArquivoUploadSchema.safeParse({
        nome: "instalador_malicioso.exe",
        tamanho: 1024,
        mimeType: "application/x-msdownload",
      });
      expect(executavel.success).toBe(false);

      const zip = validarArquivoUploadSchema.safeParse({
        nome: "documentos_compactados.zip",
        tamanho: 5000,
        mimeType: "application/zip",
      });
      expect(zip.success).toBe(false);

      const video = validarArquivoUploadSchema.safeParse({
        nome: "apresentacao.mp4",
        tamanho: 10 * 1024 * 1024,
        mimeType: "video/mp4",
      });
      expect(video.success).toBe(false);
    });

    it("deve rejeitar arquivos acima do teto individual de 20 MB", () => {
      const grande = validarArquivoUploadSchema.safeParse({
        nome: "balanco_patrimonial_gigante.pdf",
        tamanho: 21 * 1024 * 1024, // 21 MB
        mimeType: "application/pdf",
      });
      expect(grande.success).toBe(false);
      if (!grande.success) {
        expect(grande.error.issues[0].message).toContain("20 MB");
      }
    });
  });

  describe("Cotas Silenciosas de Uso Justo (Fair Use)", () => {
    it("deve respeitar cotas de 500 MB (Básico), 2 GB (Pro) e 5 GB (Enterprise)", () => {
      expect(COTAS_STORAGE_POR_PLANO.BASICO).toBe(500 * 1024 * 1024);
      expect(COTAS_STORAGE_POR_PLANO.PRO).toBe(2 * 1024 * 1024 * 1024);
      expect(COTAS_STORAGE_POR_PLANO.ENTERPRISE).toBe(5 * 1024 * 1024 * 1024);
    });

    it("deve permitir upload dentro da cota do plano Básico", () => {
      const status = calcularCotaUsoJusto({
        tenantId: "tenant_alpha",
        plano: "BASICO",
        usadoAtualBytes: 100 * 1024 * 1024, // 100 MB
        novosBytes: 15 * 1024 * 1024,       // + 15 MB
      });

      expect(status.excedeuLimite).toBe(false);
      expect(status.percentualUsado).toBe(23);
      expect(status.mensagemAviso).toBeNull();
    });

    it("deve emitir aviso amigável ao ultrapassar a cota de uso justo sem bloquear a operação de suporte", () => {
      const status = calcularCotaUsoJusto({
        tenantId: "tenant_beta",
        plano: "BASICO",
        usadoAtualBytes: 495 * 1024 * 1024, // 495 MB
        novosBytes: 10 * 1024 * 1024,       // + 10 MB = 505 MB (excede 500 MB)
      });

      expect(status.excedeuLimite).toBe(true);
      expect(status.percentualUsado).toBe(100);
      expect(status.mensagemAviso).toContain("Você atingiu a capacidade recomendada do seu cofre");
      expect(status.mensagemAviso).toContain("equipe de suporte");
    });
  });
});

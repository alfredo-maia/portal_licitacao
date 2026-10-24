import { z } from "zod";

export const brandConfigSchema = z.object({
  brandName: z.string().min(1),
  shortName: z.literal("PNCP"),
  tagline: z.literal("Inteligência e Gestão em Licitações Públicas"),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
});

export type BrandConfigContract = z.infer<typeof brandConfigSchema>;

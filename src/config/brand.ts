export const APP_CONFIG = {
  brandName: process.env.NEXT_PUBLIC_APP_NAME || "Portal PNCP",
  shortName: "PNCP",
  tagline: "Inteligência e Gestão em Licitações Públicas",
  version: "1.0.0",
} as const;

export type AppConfig = typeof APP_CONFIG;

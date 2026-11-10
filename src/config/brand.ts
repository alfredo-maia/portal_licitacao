export const APP_CONFIG = {
  brandName: process.env.NEXT_PUBLIC_APP_NAME || "Portal PNCP",
  shortName: "PNCP",
  tagline: "Inteligência e Gestão em Licitações Públicas",
  version: "1.0.0",
  commercialEmail: process.env.NEXT_PUBLIC_COMMERCIAL_EMAIL || "comercial@portalpncp.com.br",
  noreplyEmail: process.env.NEXT_PUBLIC_NOREPLY_EMAIL || "noreply@licita.app.br",
} as const;

export type AppConfig = typeof APP_CONFIG;

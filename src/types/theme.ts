export type CarbonThemeToken = "white" | "g10" | "g90" | "g100";

export type ThemeMode = "light" | "dark";

export const THEME_STORAGE_KEY = "pncp-theme" as const;

export const DEFAULT_CARBON_THEME: CarbonThemeToken = "white";
export const DARK_CARBON_THEME: CarbonThemeToken = "g100";

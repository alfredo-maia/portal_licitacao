"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { GlobalTheme, Theme } from "@carbon/react";
import {
  DARK_CARBON_THEME,
  DEFAULT_CARBON_THEME,
  THEME_STORAGE_KEY,
  type CarbonThemeToken,
  type ThemeMode,
} from "@/types/theme";

export interface ThemeContextValue {
  theme: CarbonThemeToken;
  mode: ThemeMode;
  isDark: boolean;
  setTheme: (nextTheme: CarbonThemeToken) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function normalizeStoredTheme(raw: string | null): CarbonThemeToken | null {
  if (!raw) return null;
  if (raw === "white" || raw === "g10") return raw;
  if (raw === "light") return DEFAULT_CARBON_THEME;
  if (raw === "g90" || raw === "g100") return raw;
  if (raw === "dark") return DARK_CARBON_THEME;
  return null;
}

function getInitialTheme(): CarbonThemeToken {
  if (typeof window === "undefined") {
    return DEFAULT_CARBON_THEME;
  }

  try {
    const stored = normalizeStoredTheme(
      window.localStorage.getItem(THEME_STORAGE_KEY),
    );
    if (stored) {
      return stored;
    }

    if (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    ) {
      return DARK_CARBON_THEME;
    }
  } catch {
    // Fallback para tema claro padrão caso localStorage esteja indisponível
  }

  return DEFAULT_CARBON_THEME;
}

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

function aplicarTemaNoDocumento(target: CarbonThemeToken): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.carbonTheme = target;
  document.documentElement.setAttribute("data-carbon-theme", target);
  const isDk = target === "g90" || target === "g100";
  document.documentElement.style.colorScheme = isDk ? "dark" : "light";
  document.documentElement.style.backgroundColor = isDk ? "#161616" : "#ffffff";
}

function persistirTemaNoStorage(target: CarbonThemeToken): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, target);
  } catch {
    // Ignora erro de escrita em ambiente restrito
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Inicia no tema padrão para casar 100% com SSR sem hydration mismatch;
  // o HTML já herda tokens g100/g90 via CSS antes da hidratação.
  const [theme, setThemeState] = useState<CarbonThemeToken>(DEFAULT_CARBON_THEME);

  useIsomorphicLayoutEffect(() => {
    const resolved = getInitialTheme();
    setThemeState(resolved);
    aplicarTemaNoDocumento(resolved);
  }, []);

  const setTheme = useCallback((nextTheme: CarbonThemeToken) => {
    setThemeState(nextTheme);
    persistirTemaNoStorage(nextTheme);
    aplicarTemaNoDocumento(nextTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const isCurrentlyDark = current === "g90" || current === "g100";
      const nextTheme: CarbonThemeToken = isCurrentlyDark
        ? DEFAULT_CARBON_THEME
        : DARK_CARBON_THEME;

      persistirTemaNoStorage(nextTheme);
      aplicarTemaNoDocumento(nextTheme);

      return nextTheme;
    });
  }, []);

  const isDark = theme === "g90" || theme === "g100";
  const mode: ThemeMode = isDark ? "dark" : "light";

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      mode,
      isDark,
      setTheme,
      toggleTheme,
    }),
    [theme, mode, isDark, setTheme, toggleTheme],
  );

  return (
    <ThemeContext.Provider value={value}>
      <GlobalTheme theme={theme}>
        <Theme className="cds--app-theme-root" theme={theme}>
          {children}
        </Theme>
      </GlobalTheme>
    </ThemeContext.Provider>
  );
}

export function useAppTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    return {
      theme: "g100",
      mode: "dark",
      isDark: true,
      toggleTheme: () => {},
      setTheme: () => {},
    };
  }
  return context;
}

"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
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

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<CarbonThemeToken>(() =>
    getInitialTheme(),
  );

  useEffect(() => {
    const resolved = getInitialTheme();
    setThemeState(resolved);
    if (typeof document !== "undefined") {
      document.documentElement.dataset.carbonTheme = resolved;
      document.documentElement.setAttribute("data-carbon-theme", resolved);
      const isDk = resolved === "g90" || resolved === "g100";
      document.documentElement.style.colorScheme = isDk ? "dark" : "light";
      document.documentElement.style.backgroundColor = isDk ? "#161616" : "#ffffff";
    }
  }, []);

  const setTheme = useCallback((nextTheme: CarbonThemeToken) => {
    setThemeState(nextTheme);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      } catch {
        // Ignora erro de escrita em ambiente restrito
      }
    }
    if (typeof document !== "undefined") {
      document.documentElement.dataset.carbonTheme = nextTheme;
      document.documentElement.setAttribute("data-carbon-theme", nextTheme);
      const isDk = nextTheme === "g90" || nextTheme === "g100";
      document.documentElement.style.colorScheme = isDk ? "dark" : "light";
      document.documentElement.style.backgroundColor = isDk ? "#161616" : "#ffffff";
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const isCurrentlyDark = current === "g90" || current === "g100";
      const nextTheme: CarbonThemeToken = isCurrentlyDark
        ? DEFAULT_CARBON_THEME
        : DARK_CARBON_THEME;

      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
        } catch {
          // Ignora erro de escrita em ambiente restrito
        }
      }
      if (typeof document !== "undefined") {
        document.documentElement.dataset.carbonTheme = nextTheme;
        document.documentElement.setAttribute("data-carbon-theme", nextTheme);
        const isDk = nextTheme === "g90" || nextTheme === "g100";
        document.documentElement.style.colorScheme = isDk ? "dark" : "light";
        document.documentElement.style.backgroundColor = isDk ? "#161616" : "#ffffff";
      }

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
        <Theme theme={theme}>{children}</Theme>
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

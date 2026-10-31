import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { APP_CONFIG } from "@/config/brand";
import { AppShell } from "@/components/shell/app-shell";
import { ThemeProvider } from "@/providers/theme-provider";
import { THEME_STORAGE_KEY } from "@/types/theme";
import "./globals.scss";

export const metadata: Metadata = {
  title: APP_CONFIG.brandName,
  description: APP_CONFIG.tagline,
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#161616" },
  ],
  colorScheme: "light dark",
};

/**
 * Script inline síncrono e bloqueante executado no <head> antes do primeiro paint.
 * Lê a preferência gravada no localStorage (ou prefers-color-scheme do sistema)
 * e injeta imediatamente o atributo `data-carbon-theme` e a classe CSS correspondente
 * na tag <html>, eliminando completamente qualquer FOUC / clarão branco ao carregar.
 */
const themeInitScript = `(function() {
  try {
    var stored = localStorage.getItem("${THEME_STORAGE_KEY}");
    var theme = "white";
    if (stored === "g90" || stored === "g100" || stored === "dark") {
      theme = "g100";
    } else if (stored === "white" || stored === "g10" || stored === "light") {
      theme = "white";
    } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      theme = "g100";
    }
    document.documentElement.setAttribute("data-carbon-theme", theme);
    document.documentElement.style.colorScheme = (theme === "g90" || theme === "g100") ? "dark" : "light";
    document.documentElement.style.backgroundColor = (theme === "g90" || theme === "g100") ? "#161616" : "#ffffff";
  } catch (e) {}
})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light dark" />
        <meta name="theme-color" content="#161616" media="(prefers-color-scheme: dark)" />
        <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
        <script
          id="theme-init-script"
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
      </head>
      <body>
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}

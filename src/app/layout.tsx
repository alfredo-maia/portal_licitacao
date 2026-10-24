import type { Metadata } from "next";
import type { ReactNode } from "react";
import { APP_CONFIG } from "@/config/brand";
import { AppShell } from "@/components/shell/app-shell";
import { ThemeProvider } from "@/providers/theme-provider";
import "./globals.scss";

export const metadata: Metadata = {
  title: APP_CONFIG.brandName,
  description: APP_CONFIG.tagline,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}

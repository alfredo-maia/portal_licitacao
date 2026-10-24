import type { Metadata } from "next";
import type { ReactNode } from "react";
import { APP_CONFIG } from "@/config/brand";

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
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}

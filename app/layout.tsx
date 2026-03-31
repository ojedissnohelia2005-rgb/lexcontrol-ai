import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LexControl AI",
  description: "Cumplimiento inteligente"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-cream text-charcoal">{children}</body>
    </html>
  );
}


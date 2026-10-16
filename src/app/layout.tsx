import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Oportunidades · Panflight", template: "%s · Panflight" },
  description: "Gestão de oportunidades de desenvolvimento de produtos",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import { OrigoShell } from "@/components/origo-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vento OS · ORIGO",
  description: "Órdenes de compra y proveedores.",
  applicationName: "Vento OS",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className="antialiased">
        <OrigoShell>{children}</OrigoShell>
      </body>
    </html>
  );
}

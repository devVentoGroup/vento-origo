"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Panel" },
  { href: "/purchase-orders", label: "Órdenes de compra" },
  { href: "/purchase-orders/new", label: "Nueva orden" },
  { href: "/suppliers", label: "Proveedores" },
];

export function OrigoShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 border-b border-[var(--ui-border)] bg-white/90 backdrop-blur">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2 font-semibold text-[var(--ui-text)]">
              <span className="text-xl text-[var(--ui-brand)]">ORIGO</span>
              <span className="text-sm text-[var(--ui-brand-600)]">Órdenes de compra</span>
            </Link>
            <nav className="hidden gap-1 sm:flex">
              {NAV.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className={`rounded-lg px-3 py-2 text-sm font-medium ${
                    pathname === href || (href !== "/" && pathname.startsWith(href))
                      ? "bg-[var(--ui-brand-soft)] text-[var(--ui-brand-600)]"
                      : "text-[var(--ui-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]"
                  }`}
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </header>
      <main className="flex-1 px-6 py-8">{children}</main>
    </div>
  );
}

import Link from "next/link";

export default function NoAccessPage() {
  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <div className="ui-panel text-center">
        <h1 className="ui-h1">Sin acceso</h1>
        <p className="mt-2 ui-body-muted">
          No tienes permiso para esta sección. Placeholder hasta conectar permisos con Vento OS.
        </p>
        <Link href="/" className="mt-6 inline-block ui-btn ui-btn--brand">
          Ir al Panel
        </Link>
      </div>
    </div>
  );
}

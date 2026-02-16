import Link from "next/link";
import { headers } from "next/headers";

const SHELL_LOGIN_URL = process.env.NEXT_PUBLIC_SHELL_LOGIN_URL || "https://os.ventogroup.co/login";

export default async function LoginPage() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3001";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const returnTo = `${proto}://${host}/`;
  const loginUrl = `${SHELL_LOGIN_URL}?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="ui-panel w-full max-w-md text-center">
        <h1 className="ui-h1">ORIGO</h1>
        <p className="mt-2 ui-body-muted">
          Inicio de sesion con Vento OS. Debes autenticarte en el Hub para acceder a ORIGO.
        </p>
        <div className="mt-4">
          <a href={loginUrl} className="ui-btn ui-btn--brand">
            Ir a Vento OS para iniciar sesion
          </a>
        </div>
        <p className="mt-4 ui-caption">
          Si ya iniciaste sesion en otra pestana, {" "}
          <Link href="/" className="text-[var(--ui-brand-600)] hover:underline">
            vuelve al panel
          </Link>
          .
        </p>
      </div>
    </div>
  );
}


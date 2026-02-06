import { createClient } from "@/lib/supabase/server";
import { VentoChrome } from "./vento-chrome";

type SiteRow = {
  id: string;
  name: string | null;
  site_type: string | null;
};

export async function VentoShell({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;

  let displayName = "Usuario";
  let role: string | null = null;
  let sites: SiteRow[] = [];
  let activeSiteId = "";

  if (user) {
    displayName = user.user_metadata?.full_name ?? user.email ?? "Usuario";
    // Cuando ORIGO tenga tabla employees/employee_sites, descomentar y ajustar:
    // const { data: employeeRow } = await supabase.from("employees").select("role,full_name,alias,site_id").eq("id", user.id).single();
    // role = employeeRow?.role ?? null;
    // displayName = employeeRow?.alias ?? employeeRow?.full_name ?? user.email ?? "Usuario";
    // ... sites desde employee_sites
  }

  return (
    <VentoChrome
      displayName={displayName}
      role={role ?? undefined}
      email={user?.email ?? null}
      sites={sites}
      activeSiteId={activeSiteId}
    >
      {children}
    </VentoChrome>
  );
}

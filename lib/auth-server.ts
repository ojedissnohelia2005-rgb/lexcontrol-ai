import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPER_ADMIN_EMAILS } from "@/types/domain";

export async function isSuperAdminSession(supabase: SupabaseClient, userId: string, sessionEmail: string | null | undefined) {
  const { data: profile } = await supabase.from("profiles").select("rol,email").eq("id", userId).maybeSingle();
  if (profile?.rol === "super_admin") return true;
  const em = String(profile?.email ?? sessionEmail ?? "").toLowerCase();
  return em.length > 0 && SUPER_ADMIN_EMAILS.has(em);
}

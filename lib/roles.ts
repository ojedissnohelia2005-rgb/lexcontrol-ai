import { SUPER_ADMIN_EMAILS } from "@/types/domain";

export function isSuperAdminEmail(email: string | null | undefined) {
  if (!email) return false;
  return SUPER_ADMIN_EMAILS.has(email.toLowerCase());
}


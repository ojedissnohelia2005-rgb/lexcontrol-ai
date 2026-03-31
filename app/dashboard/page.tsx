import { AppShell } from "@/components/AppShell";
import { DashboardClient } from "@/components/dashboard/DashboardClient";

export default function DashboardPage() {
  return (
    <AppShell>
      <DashboardClient />
    </AppShell>
  );
}


import { Topbar } from "@/components/Topbar";
import { BottomNav } from "@/components/BottomNav";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col">
        <div className="border-b border-borderSoft bg-cream">
          <Topbar />
        </div>
        <main className="flex-1 px-6 pb-32 pt-6">{children}</main>
        <BottomNav />
      </div>
    </div>
  );
}


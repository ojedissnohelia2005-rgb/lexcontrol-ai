import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px]">
        <Sidebar />
        <main className="flex-1">
          <div className="border-b border-borderSoft bg-cream">
            <Topbar />
          </div>
          <div className="px-6 pb-10 pt-6">{children}</div>
        </main>
      </div>
    </div>
  );
}


import { AppShell } from "@/components/AppShell";
import { ProcesosDemoClient } from "@/components/procesos/ProcesosDemoClient";

export default function ProcesosPage() {
  return (
    <AppShell>
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">Procesos judiciales</h1>
        <p className="mt-1 text-sm text-charcoal/60">
          Expedientes, ficha IA del caso, plazos COGEP/CC/COA/COIP y notarías — vista demo para presentación.
        </p>
      </div>
      <ProcesosDemoClient />
    </AppShell>
  );
}

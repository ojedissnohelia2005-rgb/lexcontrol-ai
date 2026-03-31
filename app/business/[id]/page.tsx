import { AppShell } from "@/components/AppShell";
import { BusinessMatrix } from "@/components/business/BusinessMatrix";
import { BusinessActivities } from "@/components/business/BusinessActivities";
import { RubroYRegulacionPanel } from "@/components/business/RubroYRegulacionPanel";

export default async function BusinessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold">Negocio</div>
          <div className="mt-1 text-sm text-charcoal/60">Detalle, rubro, vigilancia y matriz específica.</div>
        </div>
        <div className="text-xs text-charcoal/60">ID: {id}</div>
      </div>
      <div className="space-y-6">
        <RubroYRegulacionPanel negocioId={id} />
        <BusinessActivities negocioId={id} />
        <BusinessMatrix negocioId={id} />
      </div>
    </AppShell>
  );
}


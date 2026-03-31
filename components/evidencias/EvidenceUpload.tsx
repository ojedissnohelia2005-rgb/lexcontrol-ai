"use client";

import { useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function EvidenceUpload({
  onUploaded
}: {
  onUploaded: (publicUrlOrPath: string) => void;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    setBusy(true);
    try {
      if (!supabase) throw new Error("Falta configurar Supabase en .env.local");
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("No autenticado");

      // Subida server-side para evitar RLS de storage.objects en el navegador.
      const form = new FormData();
      form.set("file", file);
      form.set("meta", JSON.stringify({ bucket: "evidencias-legales", folder: "evidencias" }));
      const res = await fetch("/api/storage/upload", { method: "POST", body: form });
      const data = (await res.json()) as { ok?: boolean; public_url?: string | null; storage_path?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Error al subir evidencia");
      onUploaded(data.public_url || data.storage_path || file.name);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al subir evidencia");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <label className="block">
        <div className="text-xs text-charcoal/60">Subir archivo a Supabase Storage</div>
        <input
          type="file"
          disabled={busy || !supabase}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.currentTarget.value = "";
          }}
          className="mt-1 block w-full text-sm"
        />
      </label>
      {error ? <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{error}</div> : null}
    </div>
  );
}


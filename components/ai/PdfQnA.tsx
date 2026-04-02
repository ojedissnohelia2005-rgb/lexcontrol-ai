"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { IaMarkdownStream } from "@/components/IaMarkdownStream";
import { labelClasificacionDoc } from "@/lib/normativa-titles";

type DocMini = {
  id: string;
  titulo: string | null;
  fuente_url: string | null;
  storage_path: string | null;
  created_at: string;
  clasificacion_documento?: string | null;
};

export function PdfQnA({ negocioId }: { negocioId: string | null }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [docs, setDocs] = useState<DocMini[]>([]);
  const [scope, setScope] = useState<"all" | "doc">("all");
  const [docId, setDocId] = useState<string>("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [answerStreamId, setAnswerStreamId] = useState(0);

  useEffect(() => {
    if (!negocioId) return;
    if (!supabase) return;
    supabase
      .from("normativa_docs")
      .select("id,titulo,fuente_url,storage_path,created_at")
      .eq("negocio_id", negocioId)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => setDocs((data ?? []) as DocMini[]));
  }, [supabase, negocioId]);

  async function ask() {
    setError(null);
    setAnswer(null);
    setBusy(true);
    try {
      const res = await fetch("/api/qa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          negocio_id: negocioId ?? undefined,
          scope,
          doc_id: scope === "doc" ? docId || undefined : undefined,
          question: q
        })
      });
      const data = (await res.json()) as { answer?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "No se pudo responder");
      setAnswerStreamId((n) => n + 1);
      setAnswer(data.answer ?? "");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl bg-white/95 p-6 shadow-card ring-1 ring-borderSoft backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium">Preguntas sobre normativa (Memoria)</div>
          <div className="mt-1 text-xs text-charcoal/60">
            Puedes preguntar sobre un PDF específico o sobre todos los PDFs cargados del negocio.
          </div>
        </div>
      </div>

      {!negocioId ? (
        <div className="mt-4 rounded-xl bg-cream px-3 py-3 text-sm text-charcoal/70 ring-1 ring-borderSoft">
          Selecciona un negocio para usar la memoria normativa.
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className="block">
          <div className="text-sm font-medium">Ámbito</div>
          <select
            className="mt-2 w-full rounded-xl bg-cream px-3 py-2 text-sm ring-1 ring-borderSoft"
            value={scope}
            onChange={(e) => setScope(e.target.value as "all" | "doc")}
          >
            <option value="all">Todos los PDFs</option>
            <option value="doc">Un PDF específico</option>
          </select>
        </label>

        <label className="block md:col-span-2">
          <div className="text-sm font-medium">PDF</div>
          <select
            className="mt-2 w-full rounded-xl bg-cream px-3 py-2 text-sm ring-1 ring-borderSoft disabled:opacity-60"
            value={docId}
            onChange={(e) => setDocId(e.target.value)}
            disabled={scope !== "doc"}
          >
            <option value="">— Selecciona —</option>
            {docs.map((d) => {
              const cls = d.clasificacion_documento ? labelClasificacionDoc(d.clasificacion_documento) : "";
              const label = [d.titulo ?? d.id, cls ? `(${cls})` : ""].filter(Boolean).join(" ");
              return (
                <option key={d.id} value={d.id}>
                  {label}
                </option>
              );
            })}
          </select>
          <div className="mt-1 text-xs text-charcoal/60">{docs.length} PDFs en memoria</div>
        </label>
      </div>

      <div className="mt-3">
        <label className="block">
          <div className="text-sm font-medium">Pregunta</div>
          <input
            className="mt-2 w-full rounded-xl bg-cream px-3 py-2 text-sm ring-1 ring-borderSoft outline-none focus:ring-2 focus:ring-roseOld"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ej: ¿Cuál es la sanción por incumplir X artículo? ¿Qué evidencia exige?"
          />
        </label>
      </div>

      {error ? <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{error}</div> : null}

      <button
        className="mt-3 rounded-xl bg-sidebarRose px-4 py-2 text-sm font-medium text-cream hover:opacity-90 disabled:opacity-50"
        onClick={() => void ask()}
        disabled={busy || !supabase || !negocioId || !q.trim() || (scope === "doc" && !docId)}
      >
        {busy ? "Consultando..." : "Preguntar"}
      </button>

      {answer ? (
        <div className="mt-4">
          <IaMarkdownStream markdown={answer} streamKey={`pdfqa-${answerStreamId}`} />
        </div>
      ) : null}
    </div>
  );
}


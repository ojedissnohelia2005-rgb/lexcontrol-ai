"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Props = {
  /** Contenido en Markdown (p. ej. respuesta de la IA). */
  markdown: string;
  /** Cambia al abrir otro panel para reiniciar la animación. */
  streamKey: string;
};

/**
 * Muestra texto IA como Markdown formateado con efecto de escritura progresiva
 * (similar a ChatGPT). Reinicia cuando cambia `streamKey` o el texto completo.
 */
export function IaMarkdownStream({ markdown, streamKey }: Props) {
  const [shown, setShown] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const full = markdown ?? "";
    if (!full) {
      setShown("");
      setDone(true);
      return;
    }

    setShown("");
    setDone(false);
    let cancelled = false;
    let idx = 0;
    const len = full.length;
    // ~2–4 s según longitud; máximo cómodo para lectura
    const frameBudget = 140;
    const perFrame = Math.max(2, Math.ceil(len / frameBudget));

    const tick = () => {
      if (cancelled) return;
      if (idx >= len) {
        setShown(full);
        setDone(true);
        return;
      }
      idx = len > 8000 ? Math.min(idx + perFrame * 2, len) : Math.min(idx + perFrame, len);
      setShown(full.slice(0, idx));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return () => {
      cancelled = true;
    };
  }, [markdown, streamKey]);

  return (
    <div className="relative mt-2 min-h-[1.5rem] rounded-xl bg-white/60 px-3 py-3 text-sm ring-1 ring-borderSoft">
      <div
        className={[
          "prose prose-sm max-w-none text-charcoal",
          "prose-headings:mb-2 prose-headings:mt-4 prose-headings:font-semibold prose-headings:text-charcoal first:prose-headings:mt-0",
          "prose-p:my-2 prose-p:leading-relaxed",
          "prose-strong:text-charcoal prose-strong:font-semibold",
          "prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5",
          "prose-a:text-sidebarRose prose-a:underline",
          "prose-code:rounded prose-code:bg-cream prose-code:px-1 prose-code:py-0.5 prose-code:text-[13px]",
          "prose-pre:bg-cream prose-pre:ring-1 prose-pre:ring-borderSoft"
        ].join(" ")}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href, children }) => (
              <a href={href ?? "#"} className="break-all underline" target="_blank" rel="noreferrer">
                {children}
              </a>
            )
          }}
        >
          {shown}
        </ReactMarkdown>
      </div>
      {!done ? (
        <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-charcoal/60 align-middle" aria-hidden />
      ) : null}
    </div>
  );
}

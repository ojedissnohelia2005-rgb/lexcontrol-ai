"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

const markdownComponents: Components = {
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-sidebarRose underline decoration-sidebarRose/35 underline-offset-2 hover:opacity-90"
    >
      {children}
    </a>
  )
};

/** Renders IA / legal guide text as formatted Markdown (Palo Rosa–friendly prose). */
export function MarkdownGuide({ markdown }: { markdown: string }) {
  const src = markdown?.trim() ?? "";
  if (!src) return null;

  return (
    <div
      className={[
        "prose prose-sm max-w-none prose-blockquote:border-l-sidebarRose prose-blockquote:text-charcoal/80",
        "prose-headings:font-semibold prose-headings:text-charcoal prose-headings:tracking-tight",
        "prose-h1:text-lg prose-h1:mb-3 prose-h2:text-base prose-h2:mt-8 prose-h2:mb-2 prose-h3:text-sm prose-h3:mt-6 prose-h3:mb-2 prose-h4:text-sm prose-h4:mt-4",
        "prose-p:text-sm prose-p:leading-relaxed prose-p:text-charcoal/90",
        "prose-li:my-1 prose-li:text-sm prose-li:text-charcoal/90 prose-li:marker:text-sidebarRose",
        "prose-strong:font-semibold prose-strong:text-charcoal",
        "prose-code:rounded-md prose-code:bg-white prose-code:px-1.5 prose-code:py-0.5 prose-code:text-xs prose-code:text-charcoal",
        "prose-pre:bg-white prose-pre:ring-1 prose-pre:ring-borderSoft",
        "[&>*:first-child]:mt-0"
      ].join(" ")}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {src}
      </ReactMarkdown>
    </div>
  );
}

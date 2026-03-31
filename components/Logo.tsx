"use client";

import { useState } from "react";

export function Logo({ size = 28 }: { size?: number }) {
  const [imgOk, setImgOk] = useState(true);

  return (
    <div className="flex items-center gap-2">
      {imgOk ? (
        <img
          src="/lexcontrol-logo.png"
          alt="LexControl AI"
          width={size}
          height={size}
          className="rounded-xl bg-cream ring-1 ring-borderSoft"
          onError={() => setImgOk(false)}
        />
      ) : (
        <div
          className="grid place-items-center rounded-xl bg-roseOld/40 ring-1 ring-borderSoft"
          style={{ width: size, height: size }}
          aria-hidden
        >
          <span className="text-sidebarRose text-lg font-bold">L</span>
        </div>
      )}
      <div className="leading-tight">
        <div className="text-[15px] font-semibold tracking-wide">LEXCONTROL AI</div>
        <div className="text-[11px] text-charcoal/70">CUMPLIMIENTO INTELIGENTE</div>
      </div>
    </div>
  );
}


/**
 * Normaliza respuestas de modelos que envuelven JSON en ```json ... ``` u otro texto.
 */

export function stripAiMarkdownFences(text: string): string {
  let s = text.trim();
  const fenced = s.match(/```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const open = s.match(/```(?:json)?\s*\r?\n/i);
  if (open?.index != null) {
    let rest = s.slice(open.index + open[0].length);
    const close = rest.search(/\r?\n```/);
    if (close >= 0) rest = rest.slice(0, close);
    return rest.trim();
  }
  s = s.replace(/^\s*```(?:json)?\s*\r?\n?/i, "").replace(/\r?\n?```\s*$/i, "");
  return s.trim();
}

/** Extrae un segmento balanceado (respeta strings JSON y escapes). openPos debe apuntar a openCh. */
export function extractBalancedSegment(
  s: string,
  openPos: number,
  openCh: string,
  closeCh: string
): string | null {
  if (openPos < 0 || openPos >= s.length || s[openPos] !== openCh) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = openPos; i < s.length; i++) {
    const c = s[i]!;
    if (inString) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === openCh) depth++;
    else if (c === closeCh) {
      depth--;
      if (depth === 0) return s.slice(openPos, i + 1);
    }
  }
  return null;
}

/** Primer objeto JSON `{...}` balanceado (no usa regex greedy, que suele romper con arrays/objetos anidados). */
export function extractFirstBalancedJsonObject(text: string): string | null {
  const cleaned = stripAiMarkdownFences(text);
  const start = cleaned.indexOf("{");
  if (start < 0) return null;
  return extractBalancedSegment(cleaned, start, "{", "}");
}

function findKeyArrayStart(s: string, key: string): number | null {
  const re = new RegExp(`"${key}"\\s*:`, "i");
  const m = re.exec(s);
  if (!m || m.index === undefined) return null;
  const after = s.slice(m.index + m[0].length);
  const idx = after.search(/\[/);
  if (idx < 0) return null;
  return m.index + m[0].length + idx;
}

/**
 * Si el objeto raíz está truncado o es inválido, intenta aislar "docs" y "items" por separado.
 */
export function salvageJsonArraysFromMapResponse(text: string): {
  docsJson: string | null;
  itemsJson: string | null;
} {
  const cleaned = stripAiMarkdownFences(text);
  const docsStart = findKeyArrayStart(cleaned, "docs");
  const itemsStart = findKeyArrayStart(cleaned, "items");
  const docsJson = docsStart != null ? extractBalancedSegment(cleaned, docsStart, "[", "]") : null;
  const itemsJson = itemsStart != null ? extractBalancedSegment(cleaned, itemsStart, "[", "]") : null;
  return { docsJson, itemsJson };
}

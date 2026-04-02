import OpenAI from "openai";

const DEFAULT_MODEL = "gpt-4o-mini";

let client: OpenAI | null = null;

function getClient() {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Falta OPENAI_API_KEY en el entorno (no expongas esta clave en el código).");
  }
  client = new OpenAI({ apiKey });
  return client;
}

export async function generateAiText(
  prompt: string,
  opts?: { maxOutputTokens?: number }
): Promise<string> {
  const openai = getClient();
  const model = process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;

  const response = await openai.responses.create({
    model,
    input: prompt,
    ...(opts?.maxOutputTokens != null ? { max_output_tokens: opts.maxOutputTokens } : {})
  });

  const first = response.output ? response.output[0] : null;
  if (!first || first.type !== "message") {
    throw new Error("Respuesta de IA vacía o inesperada.");
  }

  const parts = first.content.filter((c) => c.type === "output_text");
  const text = parts.map((p) => p.text).join("\n").trim();
  if (!text) throw new Error("IA devolvió texto vacío.");
  return text;
}


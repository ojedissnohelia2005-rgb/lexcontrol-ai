import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from "@google/generative-ai";

export function getGeminiClient() {
  /** En producción usa GEMINI_API_KEY (solo servidor). NEXT_PUBLIC_ queda como compatibilidad local. */
  const apiKey =
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_GEMINI_API_KEY?.trim() ||
    "";
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY (recomendado) o NEXT_PUBLIC_GEMINI_API_KEY");
  return new GoogleGenerativeAI(apiKey);
}

/** Stable Flash model for generateContent; override with GEMINI_MODEL. Gemini 1.5 IDs are retired on the current API. */
const DEFAULT_GEMINI_FLASH_MODEL = "gemini-2.5-flash";

export function getGeminiFlashModel() {
  const genAI = getGeminiClient();
  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_FLASH_MODEL;
  return genAI.getGenerativeModel({
    model,
    safetySettings: [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
    ]
  });
}


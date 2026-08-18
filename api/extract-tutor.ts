import { GoogleGenAI } from "@google/genai";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { text } = req.body || {};
    if (!text || text.trim() === "") {
      return res.status(200).json({ tutor: null });
    }

    const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
    if (!apiKey) {
      return res.status(500).json({ error: "GEMINI_API_KEY no configurada", tutor: null });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          text: `Analiza el siguiente texto (aportes de foro o conversaciones) y extrae el nombre del tutor, profesor o director del curso si se menciona explícitamente. Responde ÚNICAMENTE con el nombre de la persona (ej. "Carlos Martinez"). Si no se menciona a ningún tutor, profesor, o director, o no estás seguro, responde exactamente con la palabra "NO_ENCONTRADO".\n\nTexto: ${text}`
        }
      ]
    });

    const result = response.text?.trim() || "NO_ENCONTRADO";
    if (result === "NO_ENCONTRADO" || result.toLowerCase().includes("no encontrado") || result.toLowerCase().includes("no_encontrado")) {
      return res.status(200).json({ tutor: null });
    }
    return res.status(200).json({ tutor: result });
  } catch (err: any) {
    console.error("[Vercel /api/extract-tutor ERROR]", err);
    return res.status(500).json({ error: "Error extrayendo tutor", tutor: null });
  }
}

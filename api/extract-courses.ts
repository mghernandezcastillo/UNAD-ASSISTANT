import { GoogleGenAI, Type } from "@google/genai";

export default async function handler(req: any, res: any) {
  // CORS configuration
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
    const { imageBase64, mimeType } = req.body || {};

    if (!imageBase64) {
      return res.status(400).json({ error: "No se proporcionó imagen", courses: [] });
    }

    const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY no está configurada en Vercel.",
        courses: []
      });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const cleanBase64 = imageBase64.includes(",") 
      ? imageBase64.split(",")[1] 
      : imageBase64.replace(/^data:[^;]+;base64,/, "");

    const detectedMime = (mimeType && mimeType.startsWith("image/")) ? mimeType : "image/jpeg";

    const promptText = `
Analiza esta imagen que es una captura de pantalla de los cursos matriculados de la UNAD (Universidad Nacional Abierta y a Distancia).
Extrae la lista completa de todos los cursos que aparecen matriculados.
Para cada curso:
- name: Nombre oficial del curso (ej: "LEGISLACIÓN COMERCIAL Y TRIBUTARIA")
- code: Código o número del curso si aparece (ej: "102011" o "(102011)"), o texto vacío si no se encuentra.
- credits: Número de créditos académicos si aparece (ej: 3), o 0 si no se encuentra.
Retorna únicamente el array JSON estructurado.
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          { inlineData: { mimeType: detectedMime, data: cleanBase64 } },
          { text: promptText },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              code: { type: Type.STRING },
              credits: { type: Type.NUMBER },
            },
            required: ["name"]
          }
        }
      }
    });

    let rawText = (response.text || "").trim();
    if (rawText.startsWith("```json")) {
      rawText = rawText.replace(/^```json/i, "").replace(/```$/, "").trim();
    } else if (rawText.startsWith("```")) {
      rawText = rawText.replace(/^```/i, "").replace(/```$/, "").trim();
    }

    let parsedCourses = [];
    try {
      parsedCourses = JSON.parse(rawText || "[]");
    } catch {
      parsedCourses = [];
    }

    return res.status(200).json({ courses: Array.isArray(parsedCourses) ? parsedCourses : [] });

  } catch (err: any) {
    console.error("[Vercel /api/extract-courses Error]:", err);
    return res.status(500).json({
      error: err?.message || "Error procesando la imagen con IA",
      courses: []
    });
  }
}

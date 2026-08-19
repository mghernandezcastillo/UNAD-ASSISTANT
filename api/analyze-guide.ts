import { GoogleGenAI, Type } from "@google/genai";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const { task, course, guide } = req.body || {};
    
    if (!guide || !guide.base64) {
      return res.status(400).json({ error: "Falta la guía de actividades." });
    }

    const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
    if (!apiKey) {
      return res.status(500).json({ error: "Falta configurar GEMINI_API_KEY en Vercel." });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } },
    });

    const cleanBase64 = guide.base64.includes(",") ? guide.base64.split(",")[1] : guide.base64;
    const mimeType = guide.mimeType || "application/pdf";

    const promptText = `
Eres un tutor experto de la UNAD. Analiza la guía de actividades adjunta para la tarea "${task?.title}" del curso "${course?.name}".
Quiero que me devuelvas un JSON estrictamente estructurado con el análisis de la tarea, pensado para explicárselo a un estudiante de forma muy sencilla y clara, y para identificar qué información adicional se necesita antes de redactar el trabajo final.

Estructura del JSON:
{
  "summary": "Un texto en Markdown muy claro y amigable (máximo 3 párrafos), estilo 'En pocas palabras debes hacer X cosas...'. Explica el núcleo de la actividad sin tecnicismos innecesarios.",
  "deliverableStructure": ["Portada", "Introducción", "Desarrollo del punto X", "Conclusiones", "Bibliografía"],
  "missingInformation": [
    "Identifica qué información ESPECÍFICA debe elegir o proveer el estudiante para hacer el trabajo. Por ejemplo: 'Debes elegir un municipio para analizar', 'Debes escoger un rol en el foro', o 'Necesito los datos de la empresa a analizar'. Sé muy específico."
  ]
}
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          { inlineData: { mimeType, data: cleanBase64 } },
          { text: promptText }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            deliverableStructure: { 
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            missingInformation: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["summary", "deliverableStructure", "missingInformation"]
        }
      }
    });

    let rawText = (response.text || "").trim();
    if (rawText.startsWith("```json")) {
      rawText = rawText.replace(/^```json/i, "").replace(/```$/, "").trim();
    } else if (rawText.startsWith("```")) {
      rawText = rawText.replace(/^```/i, "").replace(/```$/, "").trim();
    }

    const analysis = JSON.parse(rawText);
    return res.status(200).json(analysis);

  } catch (err: any) {
    console.error("[Vercel /api/analyze-guide ERROR]", err);
    return res.status(500).json({ error: err?.message || "Error analizando la guía." });
  }
}

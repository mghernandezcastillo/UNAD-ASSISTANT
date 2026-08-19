import { GoogleGenAI } from "@google/genai";

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
    const { imageBase64 } = req.body || {};
    
    if (!imageBase64) {
      return res.status(400).json({ error: "Falta la imagen del foro." });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    // Clean base64 if it has prefix
    const cleanBase64 = imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                data: cleanBase64,
                mimeType: "image/jpeg",
              },
            },
            {
              text: `Eres un asistente experto en analizar capturas de pantalla de foros académicos universitarios (especialmente de la UNAD).
Tu objetivo es leer la imagen y extraer todo el contenido valioso del foro de manera estructurada.

REGLAS:
1. Extrae los nombres de los participantes que comentan.
2. Extrae las fechas o momentos de los mensajes.
3. Extrae el texto completo de sus aportes, preguntas, roles elegidos o respuestas.
4. Ignora elementos de interfaz irrelevantes (botones de "responder", menús de navegación lateral, logos).
5. Escribe un resumen claro indicando "El estudiante [Nombre] comentó el [Fecha]: [Texto del aporte]".
6. Si hay tablas o información muy técnica, transcríbela fielmente.
7. Mantén el formato limpio, para que pueda ser guardado en la memoria permanente del estudiante.`,
            },
          ],
        },
      ],
      config: {
        temperature: 0.2,
      }
    });

    return res.status(200).json({ 
      text: response.text()
    });
  } catch (error: any) {
    console.error("Error extracting forum text:", error);
    return res.status(500).json({ error: "Error procesando la imagen." });
  }
}

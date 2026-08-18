import express from "express";

const app = express();

// Increase payload limit for base64 audio chunks & images
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Body parser error middleware handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err) {
    console.error("[EXPRESS BODY PARSER ERROR]", err?.message || err);
    return res.status(err?.status === 413 ? 413 : 400).json({
      error: "Payload size too large or malformed body",
      code: "INVALID_REQUEST_BODY",
      transcript: "",
      hasSpeech: false,
    });
  }
  next();
});

const getGeminiApiKey = () =>
  process.env.GOOGLE_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim() || "";

// Load the Gemini SDK only when an AI route is used. This keeps health checks and
// the Vercel function bootstrap independent from the provider SDK.
const getGenAI = async () => {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY or GOOGLE_API_KEY environment variable is missing.");
  }
  const { GoogleGenAI, Type } = await import("@google/genai");
  return {
    ai: new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    }),
    Type,
  };
};

app.get("/api/health", (_req, res) => {
  return res.json({
    status: "ok",
    geminiConfigured: Boolean(getGeminiApiKey()),
  });
});

// API Endpoint: Extract courses from image
app.post("/api/extract-courses", async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body || {};

    if (!imageBase64) {
      return res.status(400).json({ error: "No se recibió ninguna imagen.", courses: [] });
    }

    if (!getGeminiApiKey()) {
      return res.status(503).json({
        error: "Falta configurar GEMINI_API_KEY o GOOGLE_API_KEY en las variables de entorno de Vercel/servidor.",
        code: "GEMINI_API_KEY_MISSING",
        courses: []
      });
    }

    const { ai, Type } = await getGenAI();
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
    } catch (parseError) {
      console.warn("[SERVER /api/extract-courses] Error parsing Gemini JSON:", rawText);
      parsedCourses = [];
    }

    return res.json({ courses: Array.isArray(parsedCourses) ? parsedCourses : [] });

  } catch (err: any) {
    console.error("[SERVER /api/extract-courses]", err);
    return res.status(500).json({ error: err?.message || "Error procesando la imagen con IA", courses: [] });
  }
});

// API Endpoint: Process Task and generate Google Doc
app.post("/api/process-task", async (req, res) => {
  try {
    const { task, course, profile, guide, templates = [], bibliography, forumContext } = req.body || {};
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.split(" ")[1] : null;

    if (!guide || !guide.base64) {
      return res.status(400).json({ error: "Falta la guía." });
    }

    const { ai, Type } = await getGenAI();
    const cleanBase64 = guide.base64.includes(",") ? guide.base64.split(",")[1] : guide.base64;
    
    // We can't directly feed PDF to inlineData unless it's supported by Gemini.
    // Gemini 1.5/2.5 supports application/pdf inlineData!
    const mimeType = guide.mimeType || "application/pdf";

    const promptText = `
Eres un asistente experto para estudiantes de la Universidad Nacional Abierta y a Distancia (UNAD).
Tu objetivo es analizar la guía de actividades y rúbrica de evaluación adjunta para generar el ESQUELETO COMPLETO Y REDACTADO DEL DOCUMENTO a entregar.
- Curso: ${course?.name} (${course?.code})
- Tarea: ${task?.title}
- Tipo: ${task?.type}
- Tutor: ${task?.tutor || "[Nombre del Tutor/Docente]"}
- Estudiante: ${profile?.name}, Programa: ${profile?.program}, CEAD: ${profile?.cead}

REGLAS DE ORO PARA LA GENERACIÓN:
1. DEBES crear la estructura exacta que piden las plantillas y la guía (ej. Portada, Tabla de Contenido, Introducción, Objetivos, Desarrollo, Conclusiones, Referencias, etc.). Si piden más secciones, genéralas.
2. PARA SEPARAR CADA PÁGINA DEL DOCUMENTO, DEBES USAR ESTRICTAMENTE ESTE DELIMITADOR EN UNA LÍNEA NUEVA:
---PAGE_BREAK---
(Ejemplo: [Texto de Portada] \n ---PAGE_BREAK--- \n [Texto de Índice] \n ---PAGE_BREAK--- \n etc.)
3. REDACTA todo el contenido base posible con la información que tienes. Si hay partes donde el estudiante deba insertar imágenes, gráficas o foros, deja el espacio indicado claramente.
4. Aplica NORMAS APA. Para los Títulos de cada página y para cualquier texto importante que consideres que deba ir resaltado en el informe, usa Markdown de negrita (\`**texto**\`). NO uses sintaxis de encabezados como \`#\`.
`;

    console.log("[SERVER /api/process-task] Procesando con Gemini...");
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          { inlineData: { mimeType, data: cleanBase64 } },
          ...templates.map((t: any) => ({ inlineData: { mimeType: t.mimeType || "application/pdf", data: t.base64.includes(",") ? t.base64.split(",")[1] : t.base64 } })),
          { text: promptText + "\n\nCONVERSACIONES FORO:\n" + (forumContext || "N/A") + "\n\nREFERENCIAS:\n" + (bibliography || "N/A") + "\n" + (templates.length > 0 ? "\n\nSe adjuntan plantillas base adicionales. Por favor, asegúrate de utilizarlas como formato base y adaptarlas al contenido requerido." : "") }
        ],
      },
    });

    const markdownText = response.text || "No se pudo generar la respuesta.";

    let docUrl = "";

    // If we have a Google token, try to create a Google Doc!
    if (token && token !== "null" && token !== "undefined" && token.length > 10) {
      console.log("[SERVER /api/process-task] Creando documento en Google Docs...");
      try {
        // Create an empty document
        const createRes = await fetch('https://docs.googleapis.com/v1/documents', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            title: `[UNAD] ${course?.name} - ${task?.title} - ${profile?.name}`
          })
        });
        
        if (createRes.ok) {
          const docData = await createRes.json();
          docUrl = `https://docs.google.com/document/d/${docData.documentId}/edit`;
          
          // 2. Build document parts with proper structure for the real document
          // Split the generated text dynamically by the page break delimiter
          let rawParts = markdownText.split(/---PAGE_BREAK---/gi).map(p => p.trim()).filter(Boolean);
          
          if (rawParts.length === 0) {
            rawParts = [markdownText.trim()];
          }

          // Ensure each part has a newline at the end for Google Docs spacing
          const parts = rawParts.map(p => p + '\n');

          const requests = [];

          // To avoid index shifting, the most robust way in Docs API is to insert 
          // elements in reverse order (from end of document to beginning).
          // If we insert text backwards (Page N, then Page Break at index 1, then Page N-1...)
          // we always insert at index 1!
          
          for (let i = parts.length - 1; i >= 0; i--) {
            let text = parts[i];
            let cleanText = "";
            let boldRanges = [];
            let cursor = 0;
            let match;
            const regex = /\*\*(.*?)\*\*/g;
            while ((match = regex.exec(text)) !== null) {
              cleanText += text.slice(cursor, match.index);
              const startBold = cleanText.length;
              cleanText += match[1];
              const endBold = cleanText.length;
              boldRanges.push({ startIndex: startBold, endIndex: endBold });
              cursor = match.index + match[0].length;
            }
            cleanText += text.slice(cursor);
            
            // We insert at index 1.
            requests.push({
              insertText: {
                location: { index: 1 },
                text: cleanText
              }
            });
            
            // Clean inherited styles from previous pages
            requests.push({
              updateTextStyle: {
                range: { startIndex: 1, endIndex: 1 + cleanText.length },
                textStyle: { bold: false },
                fields: 'bold'
              }
            });

            requests.push({
              updateParagraphStyle: {
                range: { startIndex: 1, endIndex: 1 + cleanText.length },
                paragraphStyle: { alignment: 'START' },
                fields: 'alignment'
              }
            });
            
            // Format the title of the part we just inserted (which starts at index 1)
            // Title is usually the first line. We center it.
            const titleLen = cleanText.indexOf('\n');
            if (i === 0) {
              requests.push({
                updateParagraphStyle: {
                  range: { startIndex: 1, endIndex: 1 + cleanText.length },
                  paragraphStyle: { alignment: 'CENTER' },
                  fields: 'alignment'
                }
              });
            } else {
              if (titleLen > 0) {
                requests.push({
                  updateParagraphStyle: {
                    range: { startIndex: 1, endIndex: 1 + titleLen },
                    paragraphStyle: { alignment: 'CENTER' },
                    fields: 'alignment'
                  }
                });
              }
            }
            
            // Apply bold formatting for all matched ranges
            for (const range of boldRanges) {
              if (range.startIndex < range.endIndex) {
                requests.push({
                  updateTextStyle: {
                    range: { startIndex: 1 + range.startIndex, endIndex: 1 + range.endIndex },
                    textStyle: { bold: true },
                    fields: 'bold'
                  }
                });
              }
            }
            
            // If this isn't the first page, we need to insert a page break BEFORE this page (so, at index 1).
            // Wait, if we are going backwards (Page 7, then Page Break at index 1, then Page 6 at index 1...)
            // Yes! This perfectly preserves the structure.
            if (i > 0) {
              requests.push({
                insertPageBreak: {
                  location: { index: 1 }
                }
              });
            }
          }
          
          await fetch(`https://docs.googleapis.com/v1/documents/${docData.documentId}:batchUpdate`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ requests })
          });
        } else {
          console.error("[SERVER] Fallo crear Doc", await createRes.text());
        }
      } catch (err) {
        console.error("[SERVER] Error de Docs API", err);
      }
    }

    return res.json({ markdown: markdownText.replace(/---PAGE_BREAK---/gi, '\n\n---\n\n'), docUrl });

  } catch (err: any) {
    console.error("[SERVER /api/process-task]", err);
    return res.status(500).json({ error: err.message });
  }
});

// API Endpoint: Transcribe Audio Chunk
app.post("/api/transcribe-chunk", async (req, res) => {
  try {
    const { audioBase64, mimeType, previousContext = "", targetLanguage = "auto" } = req.body || {};

    if (!audioBase64) {
      return res.status(400).json({ error: "No audio data provided." });
    }

    if (!getGeminiApiKey()) {
      return res.status(503).json({
        error: "Gemini no está configurado. Falta GEMINI_API_KEY o GOOGLE_API_KEY en el servidor.",
        code: "GEMINI_API_KEY_MISSING",
        transcript: "",
        hasSpeech: false,
      });
    }

    const { ai, Type } = await getGenAI();

    // Clean base64 string reliably whether it contains data URL prefix or codecs
    const cleanBase64 = audioBase64.includes(",")
      ? audioBase64.split(",")[1]
      : audioBase64.replace(/^data:[^;]+;base64,/, "");

    // Extract base mime type (e.g. "audio/webm" from "audio/webm;codecs=opus")
    let cleanMimeType = (mimeType || "audio/webm").split(";")[0].trim();
    if (!cleanMimeType || cleanMimeType === "application/octet-stream") {
      cleanMimeType = "audio/webm";
    }

    console.log(`[SERVER /api/transcribe-chunk] Recibido chunk de audio (${cleanBase64.length} chars base64, mimeType: ${cleanMimeType})`);

    const promptText = `
Transcribe con absoluta fidelidad y precisión todo el diálogo, voz o habla que se escuche en este fragmento de audio.

INSTRUCCIONES OBLIGATORIAS:
1. Transcribe palabra por palabra en el idioma original en el que se habla (principalmente Inglés, español opcional como secundario).
2. Si el usuario solicitó idioma objetivo '${targetLanguage}' y no es 'auto', adecúa la transcripción o tradúcela si es apropiado, pero prioriza reflejar fielmente lo que se dice.
3. Si el fragmento contiene habla comprensible, establece "hasSpeech": true y pon el texto transcrito en "transcript".
4. Si el fragmento contiene solo silencio, ruido de fondo, estática o música sin voz, establece "transcript": "" y "hasSpeech": false.
5. Contexto reciente para coherencia: "${previousContext.slice(-200)}"

Responde estrictamente en formato JSON.
`;

    const modelsToTry = ["gemini-2.5-flash", "gemini-flash-latest"];
    let jsonText = "";
    const providerErrors: string[] = [];

    for (const modelName of modelsToTry) {
      try {
        console.log(`[SERVER /api/transcribe-chunk] Intentando transcripción con modelo: ${modelName}`);
        const response = await ai.models.generateContent({
          model: modelName,
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: cleanMimeType,
                  data: cleanBase64,
                },
              },
              {
                text: promptText,
              },
            ],
          },
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                transcript: {
                  type: Type.STRING,
                  description: "El texto transcrito exacto de este fragmento de audio.",
                },
                detectedLanguage: {
                  type: Type.STRING,
                  description: "El idioma detectado (ej: 'Español', 'Inglés').",
                },
                speaker: {
                  type: Type.STRING,
                  description: "Identificación o etiqueta del hablante si se puede inferir.",
                },
                hasSpeech: {
                  type: Type.BOOLEAN,
                  description: "Indica si se detectó voz o habla comprensible.",
                },
              },
              required: ["transcript", "hasSpeech"],
            },
          },
        });

        if (response.text) {
          jsonText = response.text;
          console.log(`[SERVER /api/transcribe-chunk] Éxito con ${modelName} (schema):`, jsonText.slice(0, 100));
          break;
        }
      } catch (err: any) {
        console.warn(`[SERVER /api/transcribe-chunk] Modelo ${modelName} con schema falló:`, err?.message || err);
        providerErrors.push(`${modelName} (schema): ${err?.message || String(err)}`);

        // Fallback without explicit schema
        try {
          const responseSimple = await ai.models.generateContent({
            model: modelName,
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType: cleanMimeType,
                    data: cleanBase64,
                  },
                },
                {
                  text: `${promptText}\n\nDevuelve ÚNICAMENTE un objeto JSON válido con los campos: "transcript" (string), "detectedLanguage" (string), "speaker" (string), "hasSpeech" (boolean).`,
                },
              ],
            },
          });

          if (responseSimple.text) {
            jsonText = responseSimple.text;
            console.log(`[SERVER /api/transcribe-chunk] Éxito con ${modelName} (sin schema):`, jsonText.slice(0, 100));
            break;
          }
        } catch (err2: any) {
          console.warn(`[SERVER /api/transcribe-chunk] Modelo ${modelName} sin schema falló:`, err2?.message || err2);
          providerErrors.push(`${modelName} (simple): ${err2?.message || String(err2)}`);
        }
      }
    }

    // A provider failure is not silence. Return an error so the UI can explain it.
    if (!jsonText) {
      console.error("[SERVER /api/transcribe-chunk] Todos los intentos fallaron:", providerErrors);
      return res.status(502).json({
        error: "Gemini no pudo procesar el fragmento de audio. Revisa la clave, la cuota y los permisos del modelo.",
        code: "TRANSCRIPTION_PROVIDER_ERROR",
        transcript: "",
        hasSpeech: false,
      });
    }

    let parsed = { transcript: "", detectedLanguage: "Español", speaker: "", hasSpeech: false };
    try {
      // Clean potential code block backticks if prompt returns markdown ```json
      const sanitized = jsonText.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
      parsed = JSON.parse(sanitized);
    } catch {
      parsed.transcript = jsonText;
      parsed.hasSpeech = Boolean(jsonText.trim());
    }

    console.log(`[SERVER /api/transcribe-chunk RESULT] Transcrito: "${parsed.transcript}", Speech: ${parsed.hasSpeech}, Lenguaje: ${parsed.detectedLanguage}`);

    return res.json(parsed);
  } catch (error: any) {
    console.error("Error in /api/transcribe-chunk:", error);
    return res.status(500).json({
      error: "Ocurrió un error interno al procesar el audio.",
      code: "TRANSCRIPTION_INTERNAL_ERROR",
      transcript: "",
      hasSpeech: false,
    });
  }
});

// API Endpoint: Summarize & Extract Insights from Transcript
app.post("/api/summarize-transcript", async (req, res) => {
  try {
    const { fullTranscript } = req.body;

    if (!fullTranscript || !fullTranscript.trim()) {
      return res.status(400).json({ error: "Transcripción vacía." });
    }

    const { ai, Type } = await getGenAI();

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `
Analiza la siguiente transcripción en tiempo real tomada de una pestaña o audio y genera un resumen ejecutivo estructurado en español.

Transcripción:
"""
${fullTranscript}
"""

Responde estrictamente en JSON con el siguiente formato:
{
  "summary": "Resumen conciso en 2-3 oraciones clave.",
  "keyPoints": ["Punto clave 1", "Punto clave 2", "Punto clave 3"],
  "topics": ["Tema 1", "Tema 2"],
  "actionItems": ["Conclusión o elemento relevante 1"]
}
`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            keyPoints: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            topics: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            actionItems: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ["summary", "keyPoints", "topics"],
        },
      },
    });

    const result = JSON.parse(response.text || "{}");
    return res.json(result);
  } catch (error: any) {
    console.error("[SERVER /api/summarize-transcript ERROR]", error?.message || error);
    return res.json({
      summary: "No se pudo generar el resumen en este momento.",
      keyPoints: [],
      topics: [],
      actionItems: [],
      error: error?.message,
    });
  }
});

// API Endpoint: Translate Transcript Segment or Full
app.post("/api/translate-transcript", async (req, res) => {
  try {
    const { text, targetLanguage = "Inglés" } = req.body || {};

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Texto vacío." });
    }

    const { ai } = await getGenAI();

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Traduce de manera fluida y precisa el siguiente texto al idioma ${targetLanguage}. Mantén el tono natural y la puntuación adecuada:\n\n"${text}"`,
    });

    return res.json({ translatedText: response.text?.trim() || text });
  } catch (error: any) {
    console.error("[SERVER /api/translate-transcript ERROR]", error?.message || error);
    return res.json({ translatedText: req.body?.text || "", error: error?.message });
  }
});

// API Endpoint: Ask Questions about the Transcript and Screen
app.post("/api/chat-transcript", async (req, res) => {
  try {
    const { fullTranscript, question, imageBase64 } = req.body || {};

    if (!question || !question.trim()) {
      return res.status(400).json({ error: "Pregunta vacía." });
    }

    const { ai } = await getGenAI();

    const promptText = `
Eres VoxStream, un asistente IA en vivo para análisis de pantalla y audio transmitido.
Responde de forma clara, directa, precisa y útil. Si hay preguntas de opción múltiple, examen o ejercicios en pantalla, proporciona la respuesta directa primero.

Transcripción acumulada del audio en vivo:
"""
${fullTranscript || "(Sin transcripción de audio previa)"}
"""

Pregunta o instrucción del usuario:
${question}
`;

    let contentsPayload: any;

    if (imageBase64) {
      const cleanBase64 = imageBase64.includes(",")
        ? imageBase64.split(",")[1]
        : imageBase64.replace(/^data:[^;]+;base64,/, "");
      contentsPayload = {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: cleanBase64,
            },
          },
          {
            text: promptText,
          },
        ],
      };
    } else {
      contentsPayload = promptText;
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: contentsPayload,
    });

    return res.json({ answer: response.text?.trim() || "No pude generar una respuesta." });
  } catch (error: any) {
    console.error("[SERVER /api/chat-transcript ERROR]", error?.message || error);
    return res.json({ answer: "Ocurrió un inconveniente al procesar la pregunta. Inténtalo de nuevo." });
  }
});

// API Endpoint: Fast Vision Query for Screen/Tab Captures (Exam Helper)
app.post("/api/fast-vision-query", async (req, res) => {
  try {
    const { imageBase64, prompt, mode = "fast_answer" } = req.body || {};

    if (!imageBase64) {
      return res.status(400).json({ error: "No se proporcionó imagen de la pantalla." });
    }

    const { ai } = await getGenAI();

    // Clean base64 image data
    const cleanBase64 = imageBase64.includes(",")
      ? imageBase64.split(",")[1]
      : imageBase64.replace(/^data:[^;]+;base64,/, "");

    let systemInstruction = "";
    if (mode === "fast_answer") {
      systemInstruction = `
Eres un asistente de evaluación y respuesta rápida de pantalla.
Analiza la imagen capturada de la pestaña en vivo y responde la pregunta o ejercicio que aparece en pantalla de forma ULTRA CONCISA, RÁPIDA Y EXACTA.
- Si es una pregunta de opción múltiple (A, B, C, D), indica PRIMERO en negrita la opción correcta con una breve justificación de 1 frase.
- Si es un problema o concepto, da la solución directa primero.
- Sé extremadamente breve, claro y directo. Sin saludos ni rodeos innecesarios.
`;
    } else if (mode === "explain") {
      systemInstruction = `
Analiza la captura de pantalla y explica el concepto o gráfica mostrado de manera muy concisa en 2 o 3 viñetas breves.
`;
    } else {
      systemInstruction = `
Responde de forma clara, directa y concisa a la consulta del usuario basándote en la captura de la pantalla enviada.
`;
    }

    const userQuery = prompt || "Analiza el contenido visible y responde la pregunta o ejercicio mostrado.";

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: cleanBase64,
            },
          },
          {
            text: `${systemInstruction}\n\nConsulta específica: ${userQuery}`,
          },
        ],
      },
    });

    return res.json({
      answer: response.text?.trim() || "No se detectó una pregunta clara en la imagen.",
    });
  } catch (error: any) {
    console.error("[SERVER /api/fast-vision-query ERROR]", error?.message || error);
    return res.json({ answer: "No se pudo analizar la imagen de pantalla en este momento." });
  }
});

app.post("/api/extract-tutor", async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || text.trim() === "") {
      return res.json({ tutor: null });
    }
    const { ai } = await getGenAI();
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ text: `Analiza el siguiente texto (aportes de foro o conversaciones) y extrae el nombre del tutor, profesor o director del curso si se menciona explícitamente. Responde ÚNICAMENTE con el nombre de la persona (ej. "Carlos Martinez"). Si no se menciona a ningún tutor, profesor, o director, o no estás seguro, responde exactamente con la palabra "NO_ENCONTRADO".\n\nTexto: ${text}` }]
    });

    const result = response.text?.trim() || "NO_ENCONTRADO";
    if (result === "NO_ENCONTRADO" || result.toLowerCase().includes("no encontrado") || result.toLowerCase().includes("no_encontrado")) {
      return res.json({ tutor: null });
    }
    return res.json({ tutor: result });
  } catch (err: any) {
    console.error("[SERVER /api/extract-tutor ERROR]", err);
    return res.status(500).json({ error: "Error extrayendo tutor" });
  }
});

export default app;

app.post("/api/task-chat", async (req, res) => {
  try {
    const { task, course, profile, history, forumContext, image, guideBase64, additionalFilesBase64 } = req.body || {};
    const { ai } = await getGenAI();

    let systemInstruction = `Eres un asistente experto para estudiantes de la Universidad Nacional Abierta y a Distancia (UNAD). 
Estás ayudando al estudiante ${profile?.name} (${profile?.program}) con la tarea "${task?.title}" del curso "${course?.name}".
Responde de forma útil, directa, y ayúdale a corregir, redactar, o mejorar lo que necesite para su tarea.`;

    // Convert history into GenAI format
    // Exclude the most recent message because that's what we will send as 'contents'.
    const recentMessage = history[history.length - 1];
    
    // We can just format the history as a single text block for context if needed, or use proper chat sessions.
    // For simplicity with generateContent, let's inject history into the prompt:
    let conversationContext = "Historial de conversación:\n";
    for (let i = 0; i < history.length - 1; i++) {
      conversationContext += `${history[i].role === 'user' ? 'Estudiante' : 'IA'}: ${history[i].content}\n\n`;
    }

    if (forumContext) {
      conversationContext += `Contexto de la actividad (Foro/Apuntes guardados): \n${forumContext}\n\n`;
    }

    let promptParts: any[] = [];
    
    // Add files to context if available
    if (guideBase64) {
      const mimeType = "application/pdf";
      const cleanBase64 = guideBase64.includes(",") ? guideBase64.split(",")[1] : guideBase64;
      promptParts.push({ text: "A continuación se adjunta la Guía de Actividades oficial de la tarea:" });
      promptParts.push({ inlineData: { mimeType, data: cleanBase64 } });
    }
    if (additionalFilesBase64 && additionalFilesBase64.length > 0) {
       promptParts.push({ text: "A continuación se adjuntan los Anexos/Plantillas adicionales de la tarea:" });
       additionalFilesBase64.forEach((file: string) => {
          const cleanBase64 = file.includes(",") ? file.split(",")[1] : file;
          promptParts.push({ inlineData: { mimeType: "application/pdf", data: cleanBase64 } });
       });
    }

    const { groupDraftText, groupDraftBase64 } = req.body || {};
    let hasGroupDraft = false;
    if (groupDraftText) {
       promptParts.push({ text: `AVANCE ACTUAL DEL TRABAJO GRUPAL (Texto):\n${groupDraftText}\n` });
       hasGroupDraft = true;
    }
    if (groupDraftBase64) {
       const cleanBase64 = groupDraftBase64.includes(",") ? groupDraftBase64.split(",")[1] : groupDraftBase64;
       promptParts.push({ text: "AVANCE ACTUAL DEL TRABAJO GRUPAL (Documento adjunto):" });
       promptParts.push({ inlineData: { mimeType: "application/pdf", data: cleanBase64 } });
       hasGroupDraft = true;
    }

    if (hasGroupDraft) {
       promptParts.push({ text: "INSTRUCCIÓN ESPECIAL (TRABAJO GRUPAL COLABORATIVO): El estudiante ha proporcionado un 'Avance del Grupo'. Tu rol NO es generar un documento nuevo desde cero. Debes: 1. Leer el avance de los demás. 2. Compararlo con la Guía de Actividades y la Rúbrica. 3. Identificar qué falta. 4. Redactar ÚNICAMENTE la porción o aporte que el estudiante debe agregar para completar el trabajo, listo para copiar y pegar sin borrar ni dañar el trabajo de los demás." });
    }

    if (image) {
      promptParts.push({ inlineData: { mimeType: 'image/jpeg', data: image } });
      promptParts.push({ text: `${systemInstruction}\n\n${conversationContext}\n\nEl estudiante ha enviado una captura de pantalla junto con este mensaje:\nEstudiante: ${recentMessage.content}\nIA:` });
    } else {
      promptParts.push({ text: `${systemInstruction}\n\n${conversationContext}\n\nEstudiante: ${recentMessage.content}\nIA:` });
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: promptParts,
    });

    return res.json({ answer: response.text?.trim() || "Lo siento, no pude procesar eso." });
  } catch (error: any) {
    console.error("[SERVER /api/task-chat ERROR]", error);
    return res.status(500).json({ answer: "Error al comunicarse con el asistente." });
  }
});

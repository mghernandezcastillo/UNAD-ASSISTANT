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
    const { task, course, profile, guide, templates = [], bibliography, forumContext } = req.body || {};
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.split(" ")[1] : null;

    if (!guide || !guide.base64) {
      return res.status(400).json({ error: "Falta la guía de actividades." });
    }

    const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
    if (!apiKey) {
      return res.status(500).json({ error: "Falta configurar GEMINI_API_KEY en Vercel." });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const cleanBase64 = guide.base64.includes(",") ? guide.base64.split(",")[1] : guide.base64;
    const mimeType = guide.mimeType || "application/pdf";

    const promptText = `
Eres un asistente experto para estudiantes de la Universidad Nacional Abierta y a Distancia (UNAD).
Tu objetivo es analizar la guía de actividades y rúbrica de evaluación adjunta para generar el ESQUELETO COMPLETO Y REDACTADO DEL DOCUMENTO a entregar.
- Curso: ${course?.name || "Curso"} (${course?.code || ""})
- Tarea: ${task?.title || "Tarea"}
- Tipo: ${task?.type || "Individual"}
- Tutor: ${task?.tutor || "[Nombre del Tutor/Docente]"}
- Estudiante: ${profile?.name || "Estudiante"}, Programa: ${profile?.program || "Programa"}, CEAD: ${profile?.cead || "CEAD"}

REGLAS DE ORO PARA LA GENERACIÓN:
1. DEBES crear la estructura exacta que piden las plantillas y la guía (ej. Portada, Tabla de Contenido, Introducción, Objetivos, Desarrollo, Conclusiones, Referencias, etc.). Si piden más secciones, genéralas.
2. PARA SEPARAR CADA PÁGINA DEL DOCUMENTO, DEBES USAR ESTRICTAMENTE ESTE DELIMITADOR EN UNA LÍNEA NUEVA:
---PAGE_BREAK---
(Ejemplo: [Texto de Portada] \n ---PAGE_BREAK--- \n [Texto de Índice] \n ---PAGE_BREAK--- \n etc.)
3. REDACTA todo el contenido base posible con la información que tienes. Si hay partes donde el estudiante deba insertar imágenes, gráficas o foros, deja el espacio indicado claramente.
4. Aplica NORMAS APA. Para los Títulos de cada página y para cualquier texto importante que consideres que deba ir resaltado en el informe, usa Markdown de negrita (\`**texto**\`). NO uses sintaxis de encabezados como \`#\`.
`;

    console.log("[Vercel /api/process-task] Procesando con Gemini...");
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          { inlineData: { mimeType, data: cleanBase64 } },
          ...templates.map((t: any) => ({
            inlineData: {
              mimeType: t.mimeType || "application/pdf",
              data: t.base64.includes(",") ? t.base64.split(",")[1] : t.base64
            }
          })),
          { text: promptText + "\n\nCONVERSACIONES FORO:\n" + (forumContext || "N/A") + "\n\nREFERENCIAS:\n" + (bibliography || "N/A") + "\n" + (templates.length > 0 ? "\n\nSe adjuntan plantillas base adicionales. Por favor, asegúrate de utilizarlas como formato base y adaptarlas al contenido requerido." : "") }
        ],
      },
    });

    const markdownText = response.text || "No se pudo generar la respuesta.";
    let docUrl = "";

    // If we have a Google token, try to create a Google Doc!
    if (token && token !== "null" && token !== "undefined" && token.length > 10) {
      try {
        const createRes = await fetch('https://docs.googleapis.com/v1/documents', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            title: `[UNAD] ${course?.name || "Curso"} - ${task?.title || "Tarea"} - ${profile?.name || "Estudiante"}`
          })
        });
        
        if (createRes.ok) {
          const docData = await createRes.json();
          docUrl = `https://docs.google.com/document/d/${docData.documentId}/edit`;
          
          let rawParts = markdownText.split(/---PAGE_BREAK---/gi).map(p => p.trim()).filter(Boolean);
          if (rawParts.length === 0) rawParts = [markdownText.trim()];
          const parts = rawParts.map(p => p + '\n');
          const requests = [];

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
            
            requests.push({
              insertText: {
                location: { index: 1 },
                text: cleanText
              }
            });
            
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
        }
      } catch (err) {
        console.error("[Vercel /api/process-task Docs Error]", err);
      }
    }

    return res.status(200).json({
      markdown: markdownText.replace(/---PAGE_BREAK---/gi, '\n\n---\n\n'),
      docUrl
    });

  } catch (err: any) {
    console.error("[Vercel /api/process-task ERROR]", err);
    return res.status(500).json({ error: err?.message || "Error procesando tarea" });
  }
}

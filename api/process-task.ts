import { GoogleGenAI } from "@google/genai";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization"
  );

  if (req.method === "OPTIONS") { return res.status(200).end(); }
  if (req.method !== "POST") { return res.status(405).json({ error: "Method not allowed" }); }

  try {
    const { task, course, profile, guide, templates = [], bibliography, forumContext, chatHistory = [] } = req.body || {};
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.split(" ")[1] : null;

    if (!guide || !guide.base64) { return res.status(400).json({ error: "Falta la guía de actividades." }); }

    const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
    if (!apiKey) { return res.status(500).json({ error: "Falta configurar GEMINI_API_KEY en Vercel." }); }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } },
    });

    const cleanBase64 = guide.base64.includes(",") ? guide.base64.split(",")[1] : guide.base64;
    const mimeType = guide.mimeType || "application/pdf";

    let historyText = "";
    if (chatHistory.length > 0) {
      historyText = "INFORMACIÓN Y CONTEXTO PROPORCIONADO POR EL ESTUDIANTE EN EL CHAT PREVIO:\n";
      chatHistory.forEach((msg: any) => {
        if (msg.role === 'user') historyText += `Estudiante: ${msg.content}\n`;
      });
      historyText += "USAR ESTA INFORMACIÓN OBLIGATORIAMENTE PARA DESARROLLAR EL CONTENIDO DEL TRABAJO.\n\n";
    }

    const promptText = `
Eres un asistente experto en NORMAS APA 7ma edición para estudiantes de la UNAD.
Debes generar el documento ESQUELETO FINAL COMPLETO según la guía de actividades y rúbrica.
- Curso: ${course?.name || "Curso"} (${course?.code || ""})
- Tarea: ${task?.title || "Tarea"}
- Tipo: ${task?.type || "Individual"}
- Tutor: ${task?.tutor || "[Nombre del Tutor]"}
- Estudiante: ${profile?.name || "Estudiante"}
- Programa: ${profile?.program || "Programa"}

${historyText}

REGLAS ESTRICTAS DE NORMAS APA Y GENERACIÓN:
1. PORTADA: Debe ser la primera página. Totalmente centrada. Usa espacios en blanco al inicio para que el texto empiece un poco más abajo. Incluye Título (en negrita), tu Nombre, Universidad, Escuela, Programa, Nombre del curso, Tutor y Año.
2. DELIMITADOR DE PÁGINA: Debes separar CADA PÁGINA O SECCIÓN con este delimitador EXACTO en una línea nueva:
---PAGE_BREAK---
3. ESTRUCTURA: Revisa qué pide la guía y crea esa estructura exacta (Introducción, Objetivos, Desarrollo, etc.).
4. REDACCIÓN Y PÁRRAFOS: Escribe párrafos académicos. Justifica/Alinea a la izquierda según APA, los títulos principales van centrados en negrita, los secundarios a la izquierda en negrita. Usa **texto** para negritas. IMPORTANTE: NO uses sintaxis markdown de viñetas (* o -) a menos que sea estrictamente necesario. Usa párrafos de texto continuo. No uses # para los títulos.
5. REFERENCIAS BIBLIOGRÁFICAS: Haz la lista al final en estricto formato APA 7.
6. IMÁGENES Y CAPTURAS DE PANTALLA: Como eres una IA generadora de texto, no puedes pegar las capturas de pantalla personales del estudiante. Si la guía exige evidencias gráficas (ej. capturas del foro, mapas conceptuales, diagramas), DEBES dejar un espacio claramente visible usando este formato exacto: **[📸 INSERTAR AQUÍ CAPTURA DE PANTALLA: Descripción exacta de lo que el estudiante debe pegar aquí]**.
`;

    console.log("[Vercel /api/process-task] Procesando con Gemini...");
    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro", // Changed to pro for better formatting capabilities
      contents: {
        parts: [
          { inlineData: { mimeType, data: cleanBase64 } },
          ...templates.map((t: any) => ({
            inlineData: {
              mimeType: t.mimeType || "application/pdf",
              data: t.base64.includes(",") ? t.base64.split(",")[1] : t.base64
            }
          })),
          { text: promptText + "\n\nCONVERSACIONES/APORTES FORO (Utilízalos en el desarrollo):\n" + (forumContext || "N/A") + "\n\nREFERENCIAS PROPORCIONADAS:\n" + (bibliography || "N/A") }
        ],
      },
    });

    const markdownText = response.text || "No se pudo generar la respuesta.";
    let docUrl = "";

    if (token && token !== "null" && token !== "undefined" && token.length > 10) {
      try {
        const createRes = await fetch('https://docs.googleapis.com/v1/documents', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: `[UNAD] ${course?.name || "Curso"} - ${task?.title || "Tarea"} - ${profile?.name || "Estudiante"}` })
        });
        
        if (!createRes.ok) {
          const errData = await createRes.json().catch(() => ({}));
          const errorMsg = errData?.error?.message || '';
          if (errorMsg.includes('insufficient authentication scopes')) {
            throw new Error('Permisos insuficientes: Al iniciar sesión con Google debes marcar TODAS las casillas de Google Docs y Drive para que la IA pueda crear el documento. Da clic en "Generar Documento" nuevamente y asegúrate de marcarlas.');
          }
          console.error("[Vercel /api/process-task Docs Error]:", errorMsg);
        } else {
          const docData = await createRes.json();
          docUrl = `https://docs.google.com/document/d/${docData.documentId}/edit`;
          
          let rawParts = markdownText.split(/---PAGE_BREAK---/gi).map(p => p.trim()).filter(Boolean);
          if (rawParts.length === 0) rawParts = [markdownText.trim()];
          const parts = rawParts.map(p => p + '\n');
          const requests = [];

          // APA Defaults for the entire document
          requests.push({
            updateDocumentStyle: {
              documentStyle: {
                marginTop: { magnitude: 72, unit: 'PT' }, // 1 inch
                marginBottom: { magnitude: 72, unit: 'PT' },
                marginRight: { magnitude: 72, unit: 'PT' },
                marginLeft: { magnitude: 72, unit: 'PT' }
              },
              fields: 'marginTop,marginBottom,marginRight,marginLeft'
            }
          });

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
            
            // Insert text
            requests.push({
              insertText: {
                location: { index: 1 },
                text: cleanText
              }
            });
            
            // Global APA Font per part (Times New Roman, 12pt)
            requests.push({
              updateTextStyle: {
                range: { startIndex: 1, endIndex: 1 + cleanText.length },
                textStyle: { 
                  weightedFontFamily: { fontFamily: 'Times New Roman' },
                  fontSize: { magnitude: 12, unit: 'PT' },
                  bold: false
                },
                fields: 'weightedFontFamily,fontSize,bold'
              }
            });

            // Normal paragraphs: Left aligned, First line indent, Double spacing
            let indentFirstLine = 36; // 0.5 inch
            let indentStart = 0;
            let alignment = 'START';
            
            const lowerText = cleanText.toLowerCase();
            
            // Cover Page (Part 0) or References Page special formatting
            if (i === 0) {
              indentFirstLine = 0;
              alignment = 'CENTER';
            } else if (lowerText.includes('referencias') || lowerText.includes('bibliografía')) {
               // Hanging indent for references
               indentFirstLine = 0;
               indentStart = 36; 
            }

            requests.push({
              updateParagraphStyle: {
                range: { startIndex: 1, endIndex: 1 + cleanText.length },
                paragraphStyle: { 
                  alignment,
                  indentFirstLine: { magnitude: indentFirstLine, unit: 'PT' },
                  indentStart: { magnitude: indentStart, unit: 'PT' },
                  lineSpacing: 200, // Double spaced
                },
                fields: 'alignment,indentFirstLine,indentStart,lineSpacing'
              }
            });
            
            // Center titles (assume first line is title unless it's cover)
            if (i !== 0) {
               const titleLen = cleanText.indexOf('\n');
               if (titleLen > 0) {
                  requests.push({
                    updateParagraphStyle: {
                      range: { startIndex: 1, endIndex: 1 + titleLen },
                      paragraphStyle: { alignment: 'CENTER', indentFirstLine: { magnitude: 0, unit: 'PT' } },
                      fields: 'alignment,indentFirstLine'
                    }
                  });
               }
            }
            
            // Apply bold formatting
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

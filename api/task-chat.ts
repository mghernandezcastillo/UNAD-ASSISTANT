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
    const { task, course, profile, history = [], forumContext, image, guideBase64, additionalFilesBase64, groupDraftText, groupDraftBase64 } = req.body || {};
    const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
    
    if (!apiKey) {
      return res.status(500).json({ answer: "Falta configurar GEMINI_API_KEY en Vercel." });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const systemInstruction = `Eres un asistente experto para estudiantes de la Universidad Nacional Abierta y a Distancia (UNAD). 
Estás ayudando al estudiante ${profile?.name || 'Estudiante'} (${profile?.program || 'UNAD'}) con la tarea "${task?.title || 'Tarea'}" del curso "${course?.name || 'Curso'}".
Responde de forma útil, directa, y ayúdale a corregir, redactar, o mejorar lo que necesite para su tarea.`;

    let conversationContext = "Historial de conversación:\n";
    if (history.length > 1) {
      for (let i = 0; i < history.length - 1; i++) {
        conversationContext += `${history[i].role === 'user' ? 'Estudiante' : 'IA'}: ${history[i].content}\n\n`;
      }
    }

    if (course?.globalMemory) {
      conversationContext += `MEMORIA ACUMULATIVA DEL CURSO (Historial de este semestre para esta materia):\n${course.globalMemory}\n\n`;
    }

    if (forumContext) {
      conversationContext += `Contexto del Foro Actual (Aportes recientes):\n${forumContext}\n\n`;
    }

    const promptParts: any[] = [];
    
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

    const recentMessage = history.length > 0 ? history[history.length - 1] : { content: "Hola" };

    if (image) {
      const cleanImg = image.includes(",") ? image.split(",")[1] : image;
      promptParts.push({ inlineData: { mimeType: 'image/jpeg', data: cleanImg } });
      promptParts.push({ text: `${systemInstruction}\n\n${conversationContext}\n\nEl estudiante ha enviado una captura de pantalla junto con este mensaje:\nEstudiante: ${recentMessage.content}\nIA:` });
    } else {
      promptParts.push({ text: `${systemInstruction}\n\n${conversationContext}\n\nEstudiante: ${recentMessage.content}\nIA:` });
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: promptParts,
    });

    return res.status(200).json({ answer: response.text?.trim() || "Lo siento, no pude procesar eso." });
  } catch (error: any) {
    console.error("[Vercel /api/task-chat ERROR]", error);
    return res.status(500).json({ answer: "Error al comunicarse con el asistente." });
  }
}

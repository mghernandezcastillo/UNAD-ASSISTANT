import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ArrowLeft, FileText, Upload, Sparkles, Monitor, Play, Check, Send } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useGoogleLogin } from '@react-oauth/google';
import localforage from 'localforage';

export function TaskView() {
  const { courseId, taskId } = useParams<{ courseId: string; taskId: string }>();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [task, setTask] = useState<any>(null);
  const [course, setCourse] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // UI State
  const [isProcessing, setIsProcessing] = useState(false);
  const [guideFile, setGuideFile] = useState<File | null>(null);
  const [rubricFile, setRubricFile] = useState<File | null>(null);
  const [additionalFiles, setAdditionalFiles] = useState<File[]>([]);
  const [bibliography, setBibliography] = useState<string>('');
  const [forumContext, setForumContext] = useState<string>('');
  const [groupDraftText, setGroupDraftText] = useState<string>('');
  const [groupDraftFile, setGroupDraftFile] = useState<File | null>(null);
  
  const [chatHistory, setChatHistory] = useState<{role: 'user'|'assistant', content: string}[]>([]);
  const [chatMessage, setChatMessage] = useState('');
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);

  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const googleLogin = useGoogleLogin({
    scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/presentations',
    prompt: 'consent',
    onSuccess: (tokenResponse) => {
      sessionStorage.setItem('googleAccessToken', tokenResponse.access_token);
      processTaskWithToken(tokenResponse.access_token);
    },
    onError: () => {
      setIsProcessing(false);
      alert('Se requiere acceso a Google Workspace para generar los documentos.');
    }
  });

  const analyzeGuide = async () => {
    if (!guideFile) return;
    setIsAnalyzing(true);
    setChatHistory(prev => [...prev, { role: 'assistant', content: 'Analizando la guía de actividades para extraer lo más importante...' }]);
    try {
      const guideBase64 = await toBase64(guideFile);
      const res = await fetch('/api/analyze-guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task, course, guide: { base64: guideBase64, mimeType: guideFile.type } })
      });
      const data = await res.json();
      if (data.error) {
        setChatHistory(prev => [...prev, { role: 'assistant', content: `Error: ${data.error}` }]);
      } else {
        setAnalysis(data);
        const md = `**Análisis de la Tarea**\n\n${data.summary}\n\n**Estructura del entregable:**\n${data.deliverableStructure.map((s: string) => `- ${s}`).join('\n')}\n\n**¡Importante! Antes de generar el documento final, por favor respóndeme lo siguiente por el chat:**\n${data.missingInformation.map((m: string) => `- ${m}`).join('\n')}`;
        setChatHistory(prev => [...prev, { role: 'assistant', content: md }]);
      }
    } catch (e) {
      setChatHistory(prev => [...prev, { role: 'assistant', content: 'Ocurrió un error al analizar la guía.' }]);
    } finally {
      setIsAnalyzing(false);
    }
  };

  useEffect(() => {
    if (taskId) {
      localforage.getItem<File>(`task-${taskId}-guide`).then(f => {
        if (f) setGuideFile(f);
      });
      localforage.getItem<File>(`task-${taskId}-rubric`).then(f => {
        if (f) setRubricFile(f);
      });
      localforage.getItem<File[]>(`task-${taskId}-additional`).then(f => {
        if (f) setAdditionalFiles(f);
      });
      localforage.getItem<File>(`task-${taskId}-draft`).then(f => {
        if (f) setGroupDraftFile(f);
      });
    }
  }, [taskId]);

  const [isExtracting, setIsExtracting] = useState(false);

  const captureForumAndExtract = async () => {
    try {
      setIsExtracting(true);
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      
      const tempVideo = document.createElement('video');
      tempVideo.srcObject = stream;
      tempVideo.play();
      
      // Wait for stream to settle
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const canvas = document.createElement('canvas');
      canvas.width = tempVideo.videoWidth;
      canvas.height = tempVideo.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(tempVideo, 0, 0, canvas.width, canvas.height);
        const base64Image = canvas.toDataURL('image/jpeg').split(',')[1];
        
        // Stop stream immediately
        stream.getTracks().forEach(t => t.stop());
        
        setChatHistory(prev => [...prev, { role: 'assistant', content: 'Extrayendo información del foro desde la captura...' }]);
        
        const res = await fetch('/api/extract-forum', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64Image })
        });
        
        const data = await res.json();
        if (data.text) {
          const newContext = forumContext ? forumContext + '\n\n' + data.text : data.text;
          setForumContext(newContext);
          
          // Save to task
          await updateDoc(doc(db, 'courses', courseId!, 'tasks', taskId!), {
             forumContext: newContext
          });

          // Append to course's global memory
          const courseDocRef = doc(db, 'courses', courseId!);
          const courseSnap = await getDoc(courseDocRef);
          if (courseSnap.exists()) {
             const currentMemory = courseSnap.data().globalMemory || '';
             const updatedMemory = currentMemory ? currentMemory + '\n\n' + data.text : data.text;
             await updateDoc(courseDocRef, { globalMemory: updatedMemory });
          }

          setChatHistory(prev => [...prev, { role: 'assistant', content: '¡Texto extraído! Se ha guardado en la memoria global del curso y en el contexto de esta tarea.' }]);
        } else {
          setChatHistory(prev => [...prev, { role: 'assistant', content: 'No se pudo extraer texto. Intenta de nuevo.' }]);
        }
      }
    } catch (err) {
      console.error(err);
      setChatHistory(prev => [...prev, { role: 'assistant', content: 'Extracción cancelada o fallida.' }]);
    } finally {
      setIsExtracting(false);
    }
  };

  const saveContextToDb = async () => {
    if (!user || !taskId) return;
    try {
      let currentTutor = task?.tutor || '';
      if (!currentTutor && forumContext.trim()) {
        try {
          const res = await fetch('/api/extract-tutor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: forumContext })
          });
          const data = await res.json();
          if (data.tutor) {
            currentTutor = data.tutor;
            setTask((prev: any) => ({ ...prev, tutor: currentTutor }));
          }
        } catch (e) {
          console.error('Error extracting tutor:', e);
        }
      }

      await updateDoc(doc(db, 'users', user.uid, 'tasks', taskId), {
        forumContext,
        bibliography,
        groupDraftText,
        ...(currentTutor ? { tutor: currentTutor } : {})
      });
    } catch (e) { console.error('Error saving context', e); }
  };

  useEffect(() => {
    if (user && courseId && taskId) {
      fetchData();
    }
  }, [user, courseId, taskId]);

  const fetchData = async () => {
    try {
      const taskSnap = await getDoc(doc(db, 'users', user!.uid, 'tasks', taskId!));
      if (taskSnap.exists()) {
        const taskData = taskSnap.data();
        setTask(taskData);
        setForumContext(taskData.forumContext || '');
        setBibliography(taskData.bibliography || '');
        setGroupDraftText(taskData.groupDraftText || '');
      } else {
        navigate(`/course/${courseId}`);
        return;
      }
      
      const courseSnap = await getDoc(doc(db, 'users', user!.uid, 'courses', courseId!));
      if (courseSnap.exists()) {
        setCourse(courseSnap.data());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleGuideUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setGuideFile(file);
      localforage.setItem(`task-${taskId}-guide`, file);
    }
  };

  const clearGuideFile = () => {
    setGuideFile(null);
    localforage.removeItem(`task-${taskId}-guide`);
  };

  const handleRubricUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setRubricFile(file);
      localforage.setItem(`task-${taskId}-rubric`, file);
    }
  };

  const clearRubricFile = () => {
    setRubricFile(null);
    localforage.removeItem(`task-${taskId}-rubric`);
  };

  const handleAdditionalFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setAdditionalFiles(prev => {
        const newFiles = [...prev, ...files];
        const uniqueFiles = newFiles.filter((v, i, a) => a.findIndex(t => (t.name === v.name)) === i);
        localforage.setItem(`task-${taskId}-additional`, uniqueFiles);
        return uniqueFiles;
      });
    }
  };

  const clearAdditionalFiles = () => {
    setAdditionalFiles([]);
    localforage.removeItem(`task-${taskId}-additional`);
  };

  const handleGroupDraftUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setGroupDraftFile(file);
      localforage.setItem(`task-${taskId}-draft`, file);
    }
  };

  const clearGroupDraftFile = () => {
    setGroupDraftFile(null);
    localforage.removeItem(`task-${taskId}-draft`);
  };

  const toBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });

  const processTaskWithToken = async (token: string) => {
    setChatHistory([{ role: 'assistant', content: 'Analizando guía de actividades y creando documento...' }]);
    try {
      const guideBase64 = await toBase64(guideFile!);
      
      let globalTemplates: any[] = [];
      try {
        const type = task.type === 'collaborative' ? 'collaborative' : 'individual';
        const templateSnap = await getDoc(doc(db, 'users', user!.uid, 'templates', type));
        if (templateSnap.exists()) {
          globalTemplates.push(templateSnap.data());
        }
      } catch (e) {
        console.error('Error fetching global template', e);
      }
      
      let rubricTemplate = null;
      if (rubricFile) {
        rubricTemplate = { base64: await toBase64(rubricFile), mimeType: rubricFile.type, name: rubricFile.name };
      }
      
      const localTemplates = await Promise.all(additionalFiles.map(async (f) => ({ base64: await toBase64(f), mimeType: f.type, name: f.name })));
      const allTemplates = [...globalTemplates, ...localTemplates];
      if (rubricTemplate) {
        allTemplates.push(rubricTemplate);
      }
      
      const effectiveProfile = course?.programOverride ? { ...profile, program: course.programOverride } : profile;

      const res = await fetch('/api/process-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          task,
          course,
          profile: effectiveProfile,
          guide: { base64: guideBase64, mimeType: guideFile!.type },
          templates: allTemplates,
          bibliography,
          forumContext,
          chatHistory // <-- Pass the chat history so the AI has context from Step 1
        })
      });
      
      const data = await res.json();
      if (data.error) {
        setChatHistory([{ role: 'assistant', content: `Error: ${data.error}` }]);
      } else {
        setChatHistory([{ role: 'assistant', content: data.markdown }]);
        if (data.docUrl) {
          await updateDoc(doc(db, 'users', user!.uid, 'tasks', taskId!), {
            docUrl: data.docUrl,
            status: 'in-progress',
            updatedAt: Date.now()
          });
          setTask({ ...task, docUrl: data.docUrl, status: 'in-progress' });
        }
      }
    } catch (err: any) {
      console.error(err);
      setChatHistory([{ role: 'assistant', content: 'Error procesando la tarea.' }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const sendChatMessage = async () => {
    if (!chatMessage.trim()) return;
    const newHistory = [...chatHistory, { role: 'user' as const, content: chatMessage }];
    setChatHistory(newHistory);
    setChatMessage('');
    
    try {
      let guideBase64 = null;
      if (guideFile) {
         try { guideBase64 = await toBase64(guideFile); } catch (e) {}
      }
      let additionalFilesBase64 = [];
      if (additionalFiles.length > 0) {
         for (const file of additionalFiles) {
             try {
                 additionalFilesBase64.push(await toBase64(file));
             } catch (e) {}
         }
      }
      
      let groupDraftBase64 = null;
      if (groupDraftFile) {
         try { groupDraftBase64 = await toBase64(groupDraftFile); } catch (e) {}
      }

      const effectiveProfile = course?.programOverride ? { ...profile, program: course.programOverride } : profile;

      const res = await fetch('/api/task-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task,
          course,
          profile: effectiveProfile,
          history: newHistory,
          forumContext,
          guideBase64,
          additionalFilesBase64,
          groupDraftText,
          groupDraftBase64
        })
      });
      const data = await res.json();
      setChatHistory([...newHistory, { role: 'assistant', content: data.answer || 'Sin respuesta' }]);
    } catch (err) {
      console.error(err);
      setChatHistory([...newHistory, { role: 'assistant', content: 'Error de conexión con el asistente.' }]);
    }
  };

  const generateTaskAssistance = async () => {
    if (!guideFile) {
      alert('Sube la guía de actividades primero.');
      return;
    }
    
    setIsProcessing(true);
    const token = sessionStorage.getItem('googleAccessToken');
    if (!token) {
      googleLogin(); // Triggers the popup
    } else {
      processTaskWithToken(token);
    }
  };

  const toggleScreenShare = async () => {
    if (screenStream) {
      screenStream.getTracks().forEach(t => t.stop());
      setScreenStream(null);
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        setScreenStream(stream);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        stream.getVideoTracks()[0].onended = () => {
          setScreenStream(null);
        };
      } catch (err) {
        console.error(err);
      }
    }
  };

  const captureAndAnalyze = async (customPrompt?: string) => {
    if (!videoRef.current) return;
    
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const base64Image = canvas.toDataURL('image/jpeg').split(',')[1];
    
    const userMessage = customPrompt || '[Captura de pantalla enviada para análisis]';
    const newHistory = [...chatHistory, { role: 'user' as const, content: userMessage }];
    setChatHistory(newHistory);
    
    try {
      let guideBase64 = null;
      if (guideFile) {
         try { guideBase64 = await toBase64(guideFile); } catch (e) {}
      }
      let additionalFilesBase64 = [];
      if (additionalFiles.length > 0) {
         for (const file of additionalFiles) {
             try {
                 additionalFilesBase64.push(await toBase64(file));
             } catch (e) {}
         }
      }

      let groupDraftBase64 = null;
      if (groupDraftFile) {
         try { groupDraftBase64 = await toBase64(groupDraftFile); } catch (e) {}
      }

      const effectiveProfile = course?.programOverride ? { ...profile, program: course.programOverride } : profile;
      const res = await fetch('/api/task-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task,
          course,
          profile: effectiveProfile,
          history: newHistory,
          forumContext,
          image: base64Image,
          guideBase64,
          additionalFilesBase64,
          groupDraftText,
          groupDraftBase64
        })
      });
      const data = await res.json();
      setChatHistory([...newHistory, { role: 'assistant', content: data.answer || 'Sin respuesta' }]);
    } catch (err) {
      console.error(err);
      setChatHistory([...newHistory, { role: 'assistant', content: 'Error analizando la imagen.' }]);
    }
  };

  if (loading || !task) return <div className="min-h-screen bg-slate-50 dark:bg-[#020617] text-slate-500 dark:text-slate-400 p-6">Cargando...</div>;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#020617] text-slate-800 dark:text-slate-100 flex flex-col md:flex-row">
      {/* Sidebar */}
      <div className="w-full md:w-1/3 border-r border-slate-200 dark:border-slate-800 p-6 overflow-y-auto max-h-screen bg-slate-900/50">
        <button onClick={() => navigate(`/course/${courseId}`)} className="flex items-center space-x-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-900 dark:text-white mb-6">
          <ArrowLeft className="w-5 h-5" />
          <span>Volver al curso</span>
        </button>

        <h1 className="text-2xl font-bold mb-1">{task.title}</h1>
        <p className="text-cyan-600 dark:text-cyan-400 text-sm mb-6">{task.type === 'individual' ? 'Individual' : 'Colaborativa'}</p>

        <div className="space-y-6">
          <div className="bg-slate-200 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <h3 className="font-semibold mb-3">1. Guía de Actividades</h3>
            <label className="w-full flex items-center justify-center space-x-2 bg-slate-300 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 py-2 px-4 rounded-lg cursor-pointer transition-colors">
              <Upload className="w-4 h-4" />
              <span className="text-sm truncate max-w-[200px]">{guideFile ? guideFile.name : 'Subir archivo (PDF/Doc/Img)'}</span>
              <input type="file" onChange={handleGuideUpload} className="hidden" />
            </label>
            {guideFile && (
               <div className="flex justify-end mt-2">
                 <button onClick={clearGuideFile} className="text-xs text-red-400 hover:text-red-300">
                   Eliminar archivo
                 </button>
               </div>
            )}
          </div>

          <div className="bg-slate-200 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <h3 className="font-semibold mb-3">2. Rúbrica de Evaluación (Opcional)</h3>
            <label className="w-full flex items-center justify-center space-x-2 bg-slate-300 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 py-2 px-4 rounded-lg cursor-pointer transition-colors">
              <Upload className="w-4 h-4" />
              <span className="text-sm truncate max-w-[200px]">{rubricFile ? rubricFile.name : 'Subir archivo (PDF/Doc/Img)'}</span>
              <input type="file" onChange={handleRubricUpload} className="hidden" />
            </label>
            {rubricFile && (
               <div className="flex justify-end mt-2">
                 <button onClick={clearRubricFile} className="text-xs text-red-400 hover:text-red-300">
                   Eliminar archivo
                 </button>
               </div>
            )}
          </div>

          <div className="bg-slate-200 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <h3 className="font-semibold mb-3">3. Archivos adicionales (Opcional)</h3>
            <label className="w-full flex items-center justify-center space-x-2 bg-slate-300 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 py-2 px-4 rounded-lg cursor-pointer transition-colors">
              <Upload className="w-4 h-4" />
              <span className="text-sm">Subir archivos</span>
              <input type="file" multiple onChange={handleAdditionalFiles} className="hidden" />
            </label>
            {additionalFiles.length > 0 && (
              <div className="flex items-center justify-between mt-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">{additionalFiles.length} archivos guardados en memoria</p>
                <button onClick={clearAdditionalFiles} className="text-xs text-red-400 hover:text-red-300">
                  Limpiar anexos
                </button>
              </div>
            )}
          </div>

          <div className="bg-slate-200 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <h3 className="font-semibold mb-3 flex items-center justify-between">
               <span>3. Referentes y Foro (Memoria Súper)</span>
               <button 
                  onClick={captureForumAndExtract}
                  disabled={isExtracting}
                  className="flex items-center space-x-1 bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs py-1.5 px-3 rounded-lg transition-colors font-medium"
               >
                  <Monitor className="w-3.5 h-3.5" />
                  <span>{isExtracting ? 'Extrayendo...' : 'Extraer Foro de Pantalla'}</span>
               </button>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Los datos extraídos se guardarán en la "Memoria Acumulativa" de este curso para que la IA lo recuerde en tareas futuras.</p>
            <textarea
              value={bibliography}
              onChange={e => setBibliography(e.target.value)}
              onBlur={saveContextToDb}
              placeholder="Pega aquí los contenidos o referentes bibliográficos..."
              className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-3 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:border-cyan-500 mb-3 h-20 resize-none"
            />
            <textarea
              value={forumContext}
              onChange={e => setForumContext(e.target.value)}
              onBlur={saveContextToDb}
              placeholder="Pega aquí aportes de compañeros en el foro..."
              className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-3 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:border-cyan-500 h-20 resize-none"
            />
          </div>

          <div className="bg-slate-200 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <h3 className="font-semibold mb-3">4. Avance del Grupo (Auditoría)</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Sube el documento de tus compañeros para saber qué falta y generar tu aporte sin dañar el de ellos.</p>
            <label className="w-full flex items-center justify-center space-x-2 bg-slate-300 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 py-2 px-4 rounded-lg cursor-pointer transition-colors mb-3">
              <Upload className="w-4 h-4" />
              <span className="text-sm truncate max-w-[200px]">{groupDraftFile ? groupDraftFile.name : 'Subir avance (.docx/pdf/img)'}</span>
              <input type="file" onChange={handleGroupDraftUpload} className="hidden" />
            </label>
            {groupDraftFile && (
               <div className="flex justify-end mb-3">
                 <button onClick={clearGroupDraftFile} className="text-xs text-red-400 hover:text-red-300">
                   Eliminar archivo de avance
                 </button>
               </div>
            )}
            <textarea
              value={groupDraftText}
              onChange={e => setGroupDraftText(e.target.value)}
              onBlur={saveContextToDb}
              placeholder="O pega aquí el texto del avance de tus compañeros..."
              className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-3 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:border-cyan-500 h-20 resize-none"
            />
          </div>

          {!analysis ? (
            <button
              onClick={analyzeGuide}
              disabled={isAnalyzing || !guideFile}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-300 dark:bg-slate-800 disabled:text-slate-500 text-white font-medium py-3 rounded-xl flex items-center justify-center space-x-2 transition-colors shadow-lg shadow-indigo-900/20"
            >
              <Sparkles className="w-5 h-5" />
              <span>{isAnalyzing ? 'Analizando Guía...' : 'Paso 1: Analizar Guía de Actividades'}</span>
            </button>
          ) : (
            <div className="space-y-3">
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-sm text-emerald-600 dark:text-emerald-400">
                <p><strong>Guía analizada.</strong> Responde por el chat lo que pide la IA antes de generar el documento final.</p>
              </div>
              <button
                onClick={generateTaskAssistance}
                disabled={isProcessing}
                className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-300 dark:bg-slate-800 disabled:text-slate-500 text-slate-900 dark:text-white font-medium py-3 rounded-xl flex items-center justify-center space-x-2 transition-colors shadow-lg shadow-cyan-900/20"
              >
                <FileText className="w-5 h-5" />
                <span>{isProcessing ? 'Procesando Documento...' : 'Paso 2: Generar Documento Final APA'}</span>
              </button>
            </div>
          )}

          {task.docUrl && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
              <h3 className="text-green-400 font-semibold flex items-center space-x-2 mb-2">
                <Check className="w-4 h-4" />
                <span>Documento Creado</span>
              </h3>
              <a href={task.docUrl} target="_blank" rel="noreferrer" className="text-sm text-cyan-600 dark:text-cyan-400 hover:underline break-all">
                Abrir en Google Docs
              </a>
            </div>
          )}

          <div className="bg-slate-200 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
             <h3 className="font-semibold mb-3">Herramientas</h3>
             <button onClick={toggleScreenShare} className={`w-full py-2 px-4 rounded-lg flex items-center justify-center space-x-2 transition-colors ${screenStream ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-slate-300 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'}`}>
                <Monitor className="w-4 h-4" />
                <span>{screenStream ? 'Detener Compartir' : 'Compartir Pantalla (Exámenes/Foro)'}</span>
             </button>
             {screenStream && (
                <>
                <div className="mt-3 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700">
                  <video ref={videoRef} autoPlay playsInline muted className="w-full aspect-video object-cover bg-black" />
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2">
                  <button onClick={() => captureAndAnalyze("Analiza esta pregunta de examen o quiz y proporcióname la respuesta correcta con una breve justificación.")} className="w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold flex items-center justify-center space-x-2 transition-colors">
                    <Sparkles className="w-4 h-4" />
                    <span>Resolver Pregunta</span>
                  </button>
                  <button onClick={() => captureAndAnalyze("Explícame de forma detallada qué concepto o información clave se muestra en esta pantalla para poder estudiarlo.")} className="w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold flex items-center justify-center space-x-2 transition-colors">
                    <Sparkles className="w-4 h-4" />
                    <span>Explicar Pantalla</span>
                  </button>
                  <button onClick={() => captureAndAnalyze("Analiza este comentario de foro o participación y sugiéreme cómo responder o enriquecer la discusión académicamente.")} className="w-full py-2 px-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold flex items-center justify-center space-x-2 transition-colors">
                    <Sparkles className="w-4 h-4" />
                    <span>Analizar Foro</span>
                  </button>
                </div>
                </>
             )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="w-full md:w-2/3 flex flex-col h-screen bg-slate-50 dark:bg-[#020617]">
        <div className="flex-1 p-6 overflow-y-auto">
          {chatHistory.length > 0 ? (
            <div className="space-y-6 mb-4">
              {chatHistory.map((msg, idx) => (
                <div key={idx} className={`p-6 rounded-xl ${msg.role === 'assistant' ? 'bg-slate-200 dark:bg-slate-900 border border-slate-200 dark:border-slate-800' : 'bg-cyan-900/20 border border-cyan-900/30 ml-12'}`}>
                  {msg.role === 'user' && <div className="font-semibold text-cyan-600 dark:text-cyan-400 mb-2">Tú</div>}
                  {msg.role === 'assistant' && <div className="font-semibold text-amber-400 mb-2 flex items-center space-x-2"><Sparkles className="w-4 h-4"/><span>Asistente IA</span></div>}
                  <div className="prose prose-invert prose-cyan max-w-none">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-500">
              <Sparkles className="w-16 h-16 mb-4 opacity-50" />
              <h2 className="text-xl font-medium">Asistente IA UNAD</h2>
              <p className="max-w-md text-center mt-2">Sube la guía de la actividad y haz clic en "Generar Asistencia" para que la IA construya el plan de trabajo y el documento de entrega.</p>
            </div>
          )}
        </div>
        
        {/* Chat Input */}
        <div className="p-4 bg-slate-200 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
          <div className="flex space-x-2">
            <input 
              type="text" 
              value={chatMessage}
              onChange={e => setChatMessage(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendChatMessage()}
              placeholder="Ej: El profesor me pidió corregir el punto 2..." 
              className="flex-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-cyan-500"
            />
            <button 
              onClick={sendChatMessage}
              disabled={!chatMessage.trim()}
              className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-300 dark:bg-slate-800 disabled:text-slate-500 text-slate-900 dark:text-white p-3 rounded-xl transition-colors flex items-center justify-center"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

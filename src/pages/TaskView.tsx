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
  const [additionalFiles, setAdditionalFiles] = useState<File[]>([]);
  const [bibliography, setBibliography] = useState<string>('');
  const [forumContext, setForumContext] = useState<string>('');
  const [groupDraftText, setGroupDraftText] = useState<string>('');
  const [groupDraftFile, setGroupDraftFile] = useState<File | null>(null);
  
  const [chatHistory, setChatHistory] = useState<{role: 'user'|'assistant', content: string}[]>([]);
  const [chatMessage, setChatMessage] = useState('');
  
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const googleLogin = useGoogleLogin({
    scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/presentations',
    onSuccess: (tokenResponse) => {
      sessionStorage.setItem('googleAccessToken', tokenResponse.access_token);
      processTaskWithToken(tokenResponse.access_token);
    },
    onError: () => {
      setIsProcessing(false);
      alert('Se requiere acceso a Google Workspace para generar los documentos.');
    }
  });

  useEffect(() => {
    if (taskId) {
      localforage.getItem<File>(`task-${taskId}-guide`).then(f => {
        if (f) setGuideFile(f);
      });
      localforage.getItem<File[]>(`task-${taskId}-additional`).then(f => {
        if (f) setAdditionalFiles(f);
      });
      localforage.getItem<File>(`task-${taskId}-draft`).then(f => {
        if (f) setGroupDraftFile(f);
      });
    }
  }, [taskId]);

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
      
      const localTemplates = await Promise.all(additionalFiles.map(async (f) => ({ base64: await toBase64(f), mimeType: f.type, name: f.name })));
      
      const effectiveProfile = course?.programOverride ? { ...profile, program: course.programOverride } : profile;

      const res = await fetch('/api/process-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          task,
          course,
          profile: effectiveProfile,
          guide: { base64: guideBase64, mimeType: guideFile!.type },
          templates: [...globalTemplates, ...localTemplates],
          bibliography,
          forumContext
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

  const captureAndAnalyze = async () => {
    if (!videoRef.current) return;
    
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const base64Image = canvas.toDataURL('image/jpeg').split(',')[1];
    
    const newHistory = [...chatHistory, { role: 'user' as const, content: '[Captura de pantalla enviada para análisis]' }];
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

  if (loading || !task) return <div className="min-h-screen bg-[#020617] text-slate-400 p-6">Cargando...</div>;

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 flex flex-col md:flex-row">
      {/* Sidebar */}
      <div className="w-full md:w-1/3 border-r border-slate-800 p-6 overflow-y-auto max-h-screen bg-slate-900/50">
        <button onClick={() => navigate(`/course/${courseId}`)} className="flex items-center space-x-2 text-slate-400 hover:text-white mb-6">
          <ArrowLeft className="w-5 h-5" />
          <span>Volver al curso</span>
        </button>

        <h1 className="text-2xl font-bold mb-1">{task.title}</h1>
        <p className="text-cyan-400 text-sm mb-6">{task.type === 'individual' ? 'Individual' : 'Colaborativa'}</p>

        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <h3 className="font-semibold mb-3">1. Guía de Actividades y Rúbrica</h3>
            <label className="w-full flex items-center justify-center space-x-2 bg-slate-800 hover:bg-slate-700 py-2 px-4 rounded-lg cursor-pointer transition-colors">
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

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <h3 className="font-semibold mb-3">2. Archivos adicionales (Opcional)</h3>
            <label className="w-full flex items-center justify-center space-x-2 bg-slate-800 hover:bg-slate-700 py-2 px-4 rounded-lg cursor-pointer transition-colors">
              <Upload className="w-4 h-4" />
              <span className="text-sm">Subir archivos</span>
              <input type="file" multiple onChange={handleAdditionalFiles} className="hidden" />
            </label>
            {additionalFiles.length > 0 && (
              <div className="flex items-center justify-between mt-2">
                <p className="text-xs text-slate-400">{additionalFiles.length} archivos guardados en memoria</p>
                <button onClick={clearAdditionalFiles} className="text-xs text-red-400 hover:text-red-300">
                  Limpiar anexos
                </button>
              </div>
            )}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <h3 className="font-semibold mb-3">3. Referentes y Foro (Opcional)</h3>
            <textarea
              value={bibliography}
              onChange={e => setBibliography(e.target.value)}
              onBlur={saveContextToDb}
              placeholder="Pega aquí los contenidos o referentes bibliográficos..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-slate-100 focus:outline-none focus:border-cyan-500 mb-3 h-20 resize-none"
            />
            <textarea
              value={forumContext}
              onChange={e => setForumContext(e.target.value)}
              onBlur={saveContextToDb}
              placeholder="Pega aquí aportes de compañeros en el foro..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-slate-100 focus:outline-none focus:border-cyan-500 h-20 resize-none"
            />
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <h3 className="font-semibold mb-3">4. Avance del Grupo (Auditoría)</h3>
            <p className="text-xs text-slate-400 mb-3">Sube el documento de tus compañeros para saber qué falta y generar tu aporte sin dañar el de ellos.</p>
            <label className="w-full flex items-center justify-center space-x-2 bg-slate-800 hover:bg-slate-700 py-2 px-4 rounded-lg cursor-pointer transition-colors mb-3">
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
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-slate-100 focus:outline-none focus:border-cyan-500 h-20 resize-none"
            />
          </div>

          <button
            onClick={generateTaskAssistance}
            disabled={isProcessing || !guideFile}
            className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-medium py-3 rounded-xl flex items-center justify-center space-x-2 transition-colors shadow-lg shadow-cyan-900/20"
          >
            <Sparkles className="w-5 h-5" />
            <span>{isProcessing ? 'Procesando...' : 'Generar Asistencia'}</span>
          </button>

          {task.docUrl && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
              <h3 className="text-green-400 font-semibold flex items-center space-x-2 mb-2">
                <Check className="w-4 h-4" />
                <span>Documento Creado</span>
              </h3>
              <a href={task.docUrl} target="_blank" rel="noreferrer" className="text-sm text-cyan-400 hover:underline break-all">
                Abrir en Google Docs
              </a>
            </div>
          )}

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
             <h3 className="font-semibold mb-3">Herramientas</h3>
             <button onClick={toggleScreenShare} className={`w-full py-2 px-4 rounded-lg flex items-center justify-center space-x-2 transition-colors ${screenStream ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-slate-800 hover:bg-slate-700 text-slate-200'}`}>
                <Monitor className="w-4 h-4" />
                <span>{screenStream ? 'Detener Compartir' : 'Compartir Pantalla (Exámenes/Foro)'}</span>
             </button>
             {screenStream && (
                <>
                <div className="mt-3 rounded-lg overflow-hidden border border-slate-700">
                  <video ref={videoRef} autoPlay playsInline muted className="w-full aspect-video object-cover bg-black" />
                </div>
                <button onClick={captureAndAnalyze} className="w-full mt-3 py-2 px-4 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold flex items-center justify-center space-x-2">
                  <Sparkles className="w-4 h-4" />
                  <span>Analizar Captura</span>
                </button>
                </>
             )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="w-full md:w-2/3 flex flex-col h-screen bg-[#020617]">
        <div className="flex-1 p-6 overflow-y-auto">
          {chatHistory.length > 0 ? (
            <div className="space-y-6 mb-4">
              {chatHistory.map((msg, idx) => (
                <div key={idx} className={`p-6 rounded-xl ${msg.role === 'assistant' ? 'bg-slate-900 border border-slate-800' : 'bg-cyan-900/20 border border-cyan-900/30 ml-12'}`}>
                  {msg.role === 'user' && <div className="font-semibold text-cyan-400 mb-2">Tú</div>}
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
        <div className="p-4 bg-slate-900 border-t border-slate-800">
          <div className="flex space-x-2">
            <input 
              type="text" 
              value={chatMessage}
              onChange={e => setChatMessage(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendChatMessage()}
              placeholder="Ej: El profesor me pidió corregir el punto 2..." 
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:border-cyan-500"
            />
            <button 
              onClick={sendChatMessage}
              disabled={!chatMessage.trim()}
              className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-500 text-white p-3 rounded-xl transition-colors flex items-center justify-center"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

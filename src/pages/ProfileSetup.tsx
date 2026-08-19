import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { Upload, CheckCircle2, FileText, Play, X, ExternalLink } from 'lucide-react';
import { useGoogleLogin } from '@react-oauth/google';

export function ProfileSetup() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [individualTemplateName, setIndividualTemplateName] = useState(profile?.individualTemplateName || '');
  const [collaborativeTemplateName, setCollaborativeTemplateName] = useState(profile?.collaborativeTemplateName || '');

  // Modal test drive
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [isTestingDocs, setIsTestingDocs] = useState(false);
  const [testDocUrl, setTestDocUrl] = useState('');

  const [formData, setFormData] = useState({
    name: profile?.name || user?.displayName || '',
    idDocument: profile?.idDocument || '',
    age: profile?.age || '',
    program: profile?.program || 'PROFESIONAL EN SEGURIDAD Y SALUD EN EL TRABAJO',
    country: profile?.country || 'Colombia',
    city: profile?.city || 'Bogotá',
    cead: profile?.cead || 'José Acevedo y Gomez',
    school: profile?.school || 'ECISA - Escuela de Ciencias de la Salud',
    zone: profile?.zone || 'ZONA CENTRO BOGOTÁ CUNDINAMARCA',
    center: profile?.center || 'José Acevedo y Gomez',
    visualGenerationMode: profile?.visualGenerationMode || 'image_first'
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>, type: 'individual' | 'collaborative') => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    
    setLoading(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const base64 = reader.result as string;
        await setDoc(doc(db, 'users', user.uid, 'templates', type), {
          name: file.name,
          mimeType: file.type,
          base64: base64,
          updatedAt: Date.now()
        });
        
        if (type === 'individual') setIndividualTemplateName(file.name);
        else setCollaborativeTemplateName(file.name);
        
        // Update profile with the name
        await setDoc(doc(db, 'users', user.uid), {
          [`${type}TemplateName`]: file.name
        }, { merge: true });
        
        await refreshProfile();
      } catch (err) {
        console.error(err);
        alert('Error guardando plantilla. ' + err);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const testGoogleLogin = useGoogleLogin({
    scope: 'https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/drive.file',
    prompt: 'consent',
    onSuccess: async (tokenResponse) => {
      try {
        setIsTestingDocs(true);
        const token = tokenResponse.access_token;
        
        // 1. Create blank doc
        const createRes = await fetch('https://docs.googleapis.com/v1/documents', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            title: `[UNAD Prueba] Documento Modelo - ${formData.name || 'Estudiante'}`
          })
        });
        
        if (!createRes.ok) {
          const errData = await createRes.json().catch(() => ({}));
          console.error('Google Docs API Error:', errData);
          const errorMsg = errData?.error?.message || '';
          if (errorMsg.includes('insufficient authentication scopes')) {
            throw new Error('IMPORTANTE: Al iniciar sesión con Google, debes marcar la casilla "Ver, crear y editar todos tus archivos de Google Docs" (Select all) para permitir que la app cree el documento. Por favor, intenta de nuevo y marca las casillas.');
          }
          throw new Error(errorMsg || 'Error creando documento en Google Docs');
        }
        const docData = await createRes.json();
        const newUrl = `https://docs.google.com/document/d/${docData.documentId}/edit`;
        
        // 2. Build document parts with proper structure
        const parts = [
          // Page 1: Cover
          `Fase 4 - Derechos y Deberes Tributarios en Personas Naturales y Jurídicas\n\n\n\nEstudiante:\n${formData.name || 'Estudiante'}\n\n\nGrupo:\n[Número de Grupo]\n\n\nDocente:\n[Nombre del Docente/Tutor]\n\n\nUniversidad Nacional Abierta y a Distancia - UNAD\n${formData.school || "Escuela"}\nPrograma ${formData.program || "Programa"}\n${new Date().getFullYear()}\n`,
          // Page 2: Index
          `Contenido\n\nIntroducción ........................................................................................ 3\nObjetivos ........................................................................................... 4\nDesarrollo de la Actividad .................................................................. 5\nConclusiones .................................................................................... 6\nReferencias ....................................................................................... 7\n`,
          // Page 3: Introduction
          `Introducción\n\nLa legislación laboral, comercial y tributaria desempeña un papel fundamental en el desarrollo de la actividad empresarial, ya que establece las normas que regulan el funcionamiento de las organizaciones y el cumplimiento de sus obligaciones frente al Estado. Su adecuada aplicación favorece la transparencia, la seguridad jurídica y el crecimiento sostenible de las empresas.\n`,
          // Page 4: Objectives
          `Objetivos\n\nObjetivo General\nReconocer la importancia de la legislación laboral, comercial y tributaria como elementos que influyen en la actividad empresarial, mediante el análisis de las obligaciones legales y contables establecidas en la normatividad.\n\nObjetivos específicos\n- Utilizar como referencia para el desarrollo del presente trabajo la forma jurídica seleccionada.\n- Identificar los principales impuestos nacionales y obligaciones tributarias.\n`,
          // Page 5: Development
          `Desarrollo de la Actividad\n\nLa legislación comercial, laboral y tributaria constituye un componente esencial para el adecuado funcionamiento de las empresas. De acuerdo con Castro de Cifuentes (2016), el conocimiento del derecho comercial permite comprender el marco jurídico que orienta la actividad empresarial.\n\nEn este contexto, el conocimiento de las obligaciones tributarias permite a las empresas actuar de manera responsable, prevenir riesgos legales y fortalecer su competitividad en el mercado.\n`,
          // Page 6: Conclusions
          `Conclusiones\n\nEl desarrollo de esta actividad ha permitido comprender de forma práctica las responsabilidades tributarias y legales que asumen las empresas en Colombia, reconociendo que la contabilidad y el pago oportuno de impuestos no son solo una obligación legal sino una herramienta clave para la administración de recursos y el crecimiento empresarial sostenible.\n`,
          // Page 7: References
          `Referencias\n\nBeltrán, J. M. (2020). Fundamentos Legales del Tributo. Repositorio Institucional UNAD.\n\nCamacho Rodríguez, L. D., & Rodríguez Riaño, A. P.. (Eds.). (2024). El perfil emprendedor. Sello Editorial UNAD.\n\nCastro de Cifuentes, M. (2016). Derecho Comercial. Bogotá. D:C: Ediciones Uniandes.\n`
        ];

        const requests = [];

        for (let i = parts.length - 1; i >= 0; i--) {
          requests.push({
            insertText: {
              location: { index: 1 },
              text: parts[i]
            }
          });
          
          requests.push({
            updateTextStyle: {
              range: { startIndex: 1, endIndex: 1 + parts[i].length },
              textStyle: { bold: false },
              fields: 'bold'
            }
          });

          requests.push({
            updateParagraphStyle: {
              range: { startIndex: 1, endIndex: 1 + parts[i].length },
              paragraphStyle: { alignment: 'START' },
              fields: 'alignment'
            }
          });
          
          const titleLen = parts[i].indexOf('\n');
          
          if (i === 0) {
            requests.push({
              updateParagraphStyle: {
                range: { startIndex: 1, endIndex: 1 + parts[i].length },
                paragraphStyle: { alignment: 'CENTER' },
                fields: 'alignment'
              }
            });
            requests.push({
              updateTextStyle: {
                range: { startIndex: 1, endIndex: 1 + titleLen },
                textStyle: { bold: true },
                fields: 'bold'
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
              requests.push({
                updateTextStyle: {
                  range: { startIndex: 1, endIndex: 1 + titleLen },
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

        setTestDocUrl(newUrl);
      } catch (err) {
        console.error(err);
        alert('Error en la prueba: ' + err);
      } finally {
        setIsTestingDocs(false);
      }
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    try {
      setLoading(true);
      setError('');
      
      const dataToSave: any = {
        userId: user.uid,
        name: formData.name,
        idDocument: formData.idDocument,
        age: parseInt(formData.age) || 0,
        program: formData.program,
        country: formData.country,
        city: formData.city,
        cead: formData.cead,
        school: formData.school,
        zone: formData.zone,
        center: formData.center,
        visualGenerationMode: formData.visualGenerationMode,
        updatedAt: Date.now(),
      };
      
      if (!profile?.createdAt) {
        dataToSave.createdAt = Date.now();
      }

      await setDoc(doc(db, 'users', user.uid), dataToSave, { merge: true });
      await refreshProfile();
      navigate('/');
    } catch (err: any) {
      setError('Error al guardar el perfil: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#020617] p-4 flex items-center justify-center">
      <div className="max-w-2xl w-full bg-slate-200 dark:bg-slate-900 rounded-2xl shadow-xl p-8 border border-slate-200 dark:border-slate-800">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-6">Completa tu perfil UNAD</h1>
        
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-6 text-red-400 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Nombre Completo</label>
              <input required type="text" name="name" value={formData.name} onChange={handleChange} className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-cyan-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Documento de Identidad</label>
              <input required type="text" name="idDocument" value={formData.idDocument} onChange={handleChange} className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-cyan-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Edad</label>
              <input required type="number" name="age" value={formData.age} onChange={handleChange} className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-cyan-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Programa (ej. Administración, Ingeniería)</label>
              <input required type="text" name="program" value={formData.program} onChange={handleChange} className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-cyan-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">País</label>
              <input required type="text" name="country" value={formData.country} onChange={handleChange} className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-cyan-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Ciudad</label>
              <input required type="text" name="city" value={formData.city} onChange={handleChange} className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-cyan-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">CEAD</label>
              <input required type="text" name="cead" value={formData.cead} onChange={handleChange} className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-cyan-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Escuela</label>
              <input required type="text" name="school" value={formData.school} onChange={handleChange} className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-cyan-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Zona</label>
              <input required type="text" name="zone" value={formData.zone} onChange={handleChange} className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-cyan-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Centro</label>
              <input required type="text" name="center" value={formData.center} onChange={handleChange} className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-cyan-500" />
            </div>
          </div>

                    <div className="pt-6 pb-2 border-t border-slate-200 dark:border-slate-800 mt-6">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">Preferencias de Generación Visual</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Elige cómo quieres que la IA maneje elementos visuales como presentaciones (diapositivas) y mapas conceptuales.</p>
            
            <div className="space-y-3">
              <label className={`flex p-4 border rounded-xl cursor-pointer transition-colors ${formData.visualGenerationMode === 'image_first' ? 'bg-cyan-50 dark:bg-cyan-900/20 border-cyan-500' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                <div className="flex items-center h-5">
                  <input type="radio" name="visualGenerationMode" value="image_first" checked={formData.visualGenerationMode === 'image_first'} onChange={handleChange} className="w-4 h-4 text-cyan-600 border-slate-300 focus:ring-cyan-500" />
                </div>
                <div className="ml-3 text-sm">
                  <span className="font-semibold text-slate-900 dark:text-slate-100 block">Modo Todo en Uno (Predeterminado)</span>
                  <span className="text-slate-500 dark:text-slate-400">La IA genera una imagen horizontal (16:9) completa con el diseño, los textos, títulos y tu nombre integrado. Lista para copiar y pegar directamente en la diapositiva o documento.</span>
                </div>
              </label>

              <label className={`flex p-4 border rounded-xl cursor-pointer transition-colors ${formData.visualGenerationMode === 'structured' ? 'bg-cyan-50 dark:bg-cyan-900/20 border-cyan-500' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                <div className="flex items-center h-5">
                  <input type="radio" name="visualGenerationMode" value="structured" checked={formData.visualGenerationMode === 'structured'} onChange={handleChange} className="w-4 h-4 text-cyan-600 border-slate-300 focus:ring-cyan-500" />
                </div>
                <div className="ml-3 text-sm">
                  <span className="font-semibold text-slate-900 dark:text-slate-100 block">Modo Estructurado (Recomendado)</span>
                  <span className="text-slate-500 dark:text-slate-400">La IA escribe el texto perfecto y editable directamente en el documento, y dibuja los mapas mediante diagramas exactos. Las imágenes solo se usan como fondos o decoración sin texto.</span>
                </div>
              </label>
            </div>
          </div>

          <div className="pt-6 pb-2 border-t border-slate-200 dark:border-slate-800 mt-6">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">Plantillas Base Globales</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Estas plantillas se usarán por defecto para generar tus trabajos en todos los cursos.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                <h3 className="font-semibold text-sm mb-2">Plantilla Trabajo Individual</h3>
                <label className={`w-full flex items-center justify-center space-x-2 py-2 px-4 rounded-lg cursor-pointer transition-colors border ${individualTemplateName ? 'bg-cyan-900/30 border-cyan-800 hover:bg-cyan-900/50' : 'bg-slate-200 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-300 dark:bg-slate-800 border-slate-300 dark:border-slate-700'}`}>
                  {individualTemplateName ? <CheckCircle2 className="w-4 h-4 text-cyan-600 dark:text-cyan-400" /> : <Upload className="w-4 h-4" />}
                  <span className={`text-sm truncate max-w-[200px] ${individualTemplateName ? 'text-cyan-600 dark:text-cyan-400' : ''}`}>
                    {individualTemplateName ? `Subido: ${individualTemplateName}` : 'Subir plantilla (.docx, .pdf)'}
                  </span>
                  <input type="file" onChange={(e) => handleFile(e, 'individual')} className="hidden" accept=".pdf,.doc,.docx" />
                </label>
              </div>
              <div className="bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                <h3 className="font-semibold text-sm mb-2">Plantilla Trabajo Colaborativo</h3>
                <label className={`w-full flex items-center justify-center space-x-2 py-2 px-4 rounded-lg cursor-pointer transition-colors border ${collaborativeTemplateName ? 'bg-cyan-900/30 border-cyan-800 hover:bg-cyan-900/50' : 'bg-slate-200 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-300 dark:bg-slate-800 border-slate-300 dark:border-slate-700'}`}>
                  {collaborativeTemplateName ? <CheckCircle2 className="w-4 h-4 text-cyan-600 dark:text-cyan-400" /> : <Upload className="w-4 h-4" />}
                  <span className={`text-sm truncate max-w-[200px] ${collaborativeTemplateName ? 'text-cyan-600 dark:text-cyan-400' : ''}`}>
                    {collaborativeTemplateName ? `Subido: ${collaborativeTemplateName}` : 'Subir plantilla (.docx, .pdf)'}
                  </span>
                  <input type="file" onChange={(e) => handleFile(e, 'collaborative')} className="hidden" accept=".pdf,.doc,.docx" />
                </label>
              </div>
            </div>
            
            <div className="mt-6 flex justify-center">
              <button 
                type="button"
                onClick={() => setIsTestModalOpen(true)}
                className="flex items-center space-x-2 text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:text-cyan-300 text-sm font-medium bg-cyan-950/30 px-4 py-2 rounded-full border border-cyan-900/50 transition-colors"
              >
                <FileText className="w-4 h-4" />
                <span>Probar generación de documento en Docs</span>
              </button>
            </div>
          </div>

<div className="pt-4 border-t border-slate-200 dark:border-slate-800">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-cyan-600 hover:bg-cyan-500 text-slate-900 dark:text-white font-medium py-3 px-4 rounded-xl transition-colors disabled:opacity-50"
            >
              {loading ? 'Guardando...' : 'Guardar y Continuar'}
            </button>
          </div>
        </form>
      </div>

      {isTestModalOpen && (
        <div className="fixed inset-0 bg-white/60 dark:bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-200 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-xl relative">
            <button onClick={() => { setIsTestModalOpen(false); setTestDocUrl(''); }} className="absolute top-4 right-4 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-900 dark:text-white">
              <X className="w-6 h-6" />
            </button>
            <div className="mb-6 flex flex-col items-center text-center mt-4">
              <div className="w-16 h-16 bg-blue-500/20 text-blue-400 rounded-full flex items-center justify-center mb-4">
                <FileText className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">Prueba de Integración Docs</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                Aquí validaremos que tu cuenta de Google esté conectada correctamente y probaremos cómo la IA generará un documento en tu Google Drive usando la estructura de tus plantillas (con texto de prueba y Lorem Ipsum).
              </p>
            </div>
            
            {!testDocUrl ? (
              <button 
                onClick={() => testGoogleLogin()}
                disabled={isTestingDocs}
                className="w-full bg-blue-600 hover:bg-blue-500 text-slate-900 dark:text-white font-medium py-3 px-4 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
              >
                {isTestingDocs ? (
                  <span>Generando documento...</span>
                ) : (
                  <>
                    <Play className="w-5 h-5" />
                    <span>Hacer prueba en Google Docs</span>
                  </>
                )}
              </button>
            ) : (
              <div className="space-y-4">
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 text-green-400 text-sm text-center font-medium flex items-center justify-center space-x-2">
                  <CheckCircle2 className="w-5 h-5" />
                  <span>¡Documento creado exitosamente!</span>
                </div>
                <a 
                  href={testDocUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full bg-slate-300 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-medium py-3 px-4 rounded-xl transition-colors flex items-center justify-center space-x-2"
                >
                  <ExternalLink className="w-5 h-5" />
                  <span>Abrir Documento Creado</span>
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { collection, query, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { Plus, BookOpen, LogOut, Upload, Trash2, Edit2, AlertTriangle, X, Sparkles, Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Course {
  courseId: string;
  name: string;
  code: string;
  credits: number;
}

export function Dashboard() {
  const { user, profile, logout } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const navigate = useNavigate();

  // Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');

  // Reset Modal State
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetText, setResetText] = useState('');
  const [resetError, setResetError] = useState('');

  // Delete Course Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [courseToDelete, setCourseToDelete] = useState<string | null>(null);

  // Test Task Modal State
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [testCourseName, setTestCourseName] = useState('');
  const [testTaskName, setTestTaskName] = useState('');
  const [testTutorName, setTestTutorName] = useState('');
  const [testTaskType, setTestTaskType] = useState('individual');
  const [testCareer, setTestCareer] = useState('');
  const [testCustomCareer, setTestCustomCareer] = useState('');

  useEffect(() => {
    fetchCourses();
  }, [user]);

  const fetchCourses = async () => {
    if (!user) return;
    try {
      const q = query(collection(db, 'users', user.uid, 'courses'));
      const snapshot = await getDocs(q);
      const fetchedCourses: Course[] = [];
      snapshot.forEach(doc => {
        fetchedCourses.push({ courseId: doc.id, ...doc.data() } as Course);
      });
      setCourses(fetchedCourses);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    try {
      setUploading(true);
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64data = reader.result as string;
        const res = await fetch('/api/extract-courses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64data, mimeType: file.type })
        });
        const data = await res.json();
        
        if (data.courses && data.courses.length > 0) {
          // Save to Firestore
          for (const course of data.courses) {
            const courseId = `course_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            await setDoc(doc(db, 'users', user.uid, 'courses', courseId), {
              courseId,
              userId: user.uid,
              name: course.name,
              code: course.code || '',
              credits: course.credits || 0,
              createdAt: Date.now(),
              updatedAt: Date.now()
            });
          }
          await fetchCourses();
        } else {
          alert('No se encontraron cursos en la imagen.');
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      alert('Error procesando imagen');
    } finally {
      setUploading(false);
      if (e.target) e.target.value = '';
    }
  };

  const deleteCourse = async () => {
    if (!user || !courseToDelete) return;
    await deleteDoc(doc(db, 'users', user.uid, 'courses', courseToDelete));
    setIsDeleteModalOpen(false);
    setCourseToDelete(null);
    await fetchCourses();
  };

  const openEditModal = (course: Course) => {
    setEditingCourse(course);
    setEditName(course.name);
    setEditCode(course.code || '');
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editingCourse) return;
    
    try {
      await setDoc(doc(db, 'users', user.uid, 'courses', editingCourse.courseId), {
        name: editName,
        code: editCode,
        updatedAt: Date.now()
      }, { merge: true });
      setIsEditModalOpen(false);
      await fetchCourses();
    } catch (err) {
      console.error(err);
      alert('Error editando el curso');
    }
  };

  const executeReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (resetText !== 'BORRAR') {
      setResetError('La palabra no coincide. Escribe BORRAR.');
      return;
    }

    setLoading(true);
    try {
      // 1. Delete all tasks
      const tasksQ = query(collection(db, 'users', user.uid, 'tasks'));
      const tasksSnap = await getDocs(tasksQ);
      for (const taskDoc of tasksSnap.docs) {
        await deleteDoc(taskDoc.ref);
      }
      
      // 2. Delete all courses
      const coursesQ = query(collection(db, 'users', user.uid, 'courses'));
      const coursesSnap = await getDocs(coursesQ);
      for (const courseDoc of coursesSnap.docs) {
        await deleteDoc(courseDoc.ref);
      }

      // 3. Delete user profile
      await deleteDoc(doc(db, 'users', user.uid));
      
      alert('Cuenta reiniciada correctamente.');
      window.location.reload();
    } catch (err) {
      console.error(err);
      alert('Error al reiniciar la cuenta.');
      setLoading(false);
    }
  };

  const handleCreateTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setLoading(true);
    try {
      const cName = testCourseName.trim() || 'Materia de Prueba';
      const tName = testTaskName.trim() || 'Actividad de Prueba';
      const finalCareer = testCareer === 'Otro' ? testCustomCareer.trim() : testCareer;
      
      const courseId = `course_test_${Date.now()}`;
      await setDoc(doc(db, 'users', user.uid, 'courses', courseId), {
        courseId,
        userId: user.uid,
        name: cName,
        code: 'TEST-000',
        credits: 0,
        programOverride: finalCareer || null,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });

      const taskId = `task_test_${Date.now()}`;
      await setDoc(doc(db, 'users', user.uid, 'tasks', taskId), {
        taskId,
        courseId,
        userId: user.uid,
        title: tName,
        description: '',
        status: 'pending',
        type: testTaskType,
        tutor: testTutorName,
        docUrl: '',
        createdAt: Date.now(),
        updatedAt: Date.now()
      });

      setIsTestModalOpen(false);
      setTestCourseName('');
      setTestTaskName('');
      setTestTutorName('');
      navigate(`/course/${courseId}/task/${taskId}`);
    } catch (err) {
      console.error(err);
      alert('Error creando la actividad de prueba');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 p-6">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-100">Mis Cursos UNAD</h1>
            <p className="text-slate-400">Hola, {profile?.name}</p>
          </div>
          <div className="flex items-center space-x-4">
            <button onClick={() => setIsTestModalOpen(true)} className="flex items-center space-x-2 text-cyan-400 hover:text-cyan-300 text-sm font-medium transition-colors">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Prueba Rápida</span>
            </button>
            <div className="w-px h-6 bg-slate-800"></div>
            <button onClick={() => { setResetText(''); setResetError(''); setIsResetModalOpen(true); }} className="flex items-center space-x-2 text-red-400 hover:text-red-300 text-sm font-medium transition-colors">
              <AlertTriangle className="w-4 h-4" />
              <span className="hidden sm:inline">Reiniciar Cuenta</span>
            </button>
            <div className="w-px h-6 bg-slate-800"></div>
            <button onClick={() => navigate('/setup')} className="text-slate-400 hover:text-white text-sm font-medium">
              Editar Perfil
            </button>
            <button onClick={logout} className="flex items-center space-x-2 text-slate-400 hover:text-white">
              <LogOut className="w-5 h-5" />
              <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
        </header>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold mb-2">Importar cursos</h2>
            <p className="text-slate-400 text-sm">Sube un pantallazo de tu listado de cursos del campus virtual.</p>
          </div>
          <label className="cursor-pointer bg-cyan-600 hover:bg-cyan-500 text-white font-medium py-2 px-4 rounded-xl transition-colors flex items-center space-x-2">
            <Upload className="w-5 h-5" />
            <span>{uploading ? 'Analizando...' : 'Subir Imagen'}</span>
            <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" disabled={uploading} />
          </label>
        </div>

        {loading ? (
          <div className="text-center text-slate-400 py-12">Cargando cursos...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map(course => (
              <div key={course.courseId} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-cyan-500/50 transition-colors group">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-cyan-500/10 rounded-xl">
                    <BookOpen className="w-6 h-6 text-cyan-400" />
                  </div>
                  <div className="flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEditModal(course)} className="text-blue-400 hover:text-blue-300">
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button onClick={() => { setCourseToDelete(course.courseId); setIsDeleteModalOpen(true); }} className="text-red-400 hover:text-red-300">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                <h3 className="font-semibold text-lg mb-1 line-clamp-2">{course.name}</h3>
                {course.code && <p className="text-slate-400 text-sm mb-4">Código: {course.code}</p>}
                
                <button
                  onClick={() => navigate(`/course/${course.courseId}`)}
                  className="w-full mt-4 bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2"
                >
                  <span>Ver Actividades</span>
                </button>
              </div>
            ))}

            {courses.length === 0 && (
              <div className="col-span-full text-center py-12 border-2 border-dashed border-slate-800 rounded-2xl">
                <BookOpen className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400">Aún no tienes cursos agregados.</p>
                <p className="text-slate-500 text-sm">Sube un pantallazo para comenzar.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {isEditModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Editar Curso</h2>
              <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Nombre del curso</label>
                <input required type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-slate-100 focus:outline-none focus:border-cyan-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Código del curso</label>
                <input required type="text" value={editCode} onChange={(e) => setEditCode(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-slate-100 focus:outline-none focus:border-cyan-500" />
              </div>
              <div className="pt-4 flex justify-end space-x-3">
                <button type="button" onClick={() => setIsEditModalOpen(false)} className="px-4 py-2 text-slate-400 hover:text-white transition-colors">Cancelar</button>
                <button type="submit" className="bg-cyan-600 hover:bg-cyan-500 text-white font-medium py-2 px-4 rounded-lg transition-colors">Guardar Cambios</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h2 className="text-xl font-bold mb-4">Eliminar Curso</h2>
            <p className="text-slate-400 mb-6">¿Seguro que deseas eliminar este curso y todas sus actividades?</p>
            <div className="flex justify-end space-x-3">
              <button onClick={() => setIsDeleteModalOpen(false)} className="px-4 py-2 text-slate-400 hover:text-white transition-colors">Cancelar</button>
              <button onClick={deleteCourse} className="bg-red-600 hover:bg-red-500 text-white font-medium py-2 px-4 rounded-lg transition-colors">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {isResetModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-red-500 flex items-center gap-2"><AlertTriangle className="w-6 h-6"/> PELIGRO</h2>
              <button onClick={() => setIsResetModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>
            <p className="text-slate-300 mb-4">¿Estás completamente seguro de que deseas borrar TODOS tus cursos, actividades y perfil de usuario? Esta acción NO se puede deshacer.</p>
            <form onSubmit={executeReset} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Escribe la palabra BORRAR en mayúsculas para confirmar:</label>
                <input required type="text" value={resetText} onChange={(e) => setResetText(e.target.value)} placeholder="BORRAR" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-slate-100 focus:outline-none focus:border-red-500" />
                {resetError && <p className="text-red-400 text-sm mt-1">{resetError}</p>}
              </div>
              <div className="pt-4 flex justify-end space-x-3">
                <button type="button" onClick={() => setIsResetModalOpen(false)} className="px-4 py-2 text-slate-400 hover:text-white transition-colors">Cancelar</button>
                <button type="submit" className="bg-red-600 hover:bg-red-500 text-white font-medium py-2 px-4 rounded-lg transition-colors">Reiniciar Cuenta Definitivamente</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {isTestModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-cyan-400 flex items-center gap-2"><Sparkles className="w-5 h-5"/> Actividad de Prueba</h2>
              <button onClick={() => setIsTestModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>
            <p className="text-slate-400 text-sm mb-6">
              Crea una materia y actividad genérica rápidamente para probar la generación de documentos y la IA.
            </p>
            <form onSubmit={handleCreateTest} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Nombre de la Materia (Opcional)</label>
                <input type="text" value={testCourseName} onChange={(e) => setTestCourseName(e.target.value)} placeholder="Ej. Herramientas Digitales" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-slate-100 focus:outline-none focus:border-cyan-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Carrera / Programa (Opcional)</label>
                <select value={testCareer} onChange={(e) => setTestCareer(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-slate-100 focus:outline-none focus:border-cyan-500 mb-2">
                  <option value="">Usar mi carrera por defecto</option>
                  <option value="Ingeniería de Sistemas">Ingeniería de Sistemas</option>
                  <option value="Ingeniería Industrial">Ingeniería Industrial</option>
                  <option value="Ingeniería Electrónica">Ingeniería Electrónica</option>
                  <option value="Psicología">Psicología</option>
                  <option value="Administración de Empresas">Administración de Empresas</option>
                  <option value="Contaduría Pública">Contaduría Pública</option>
                  <option value="Agronomía">Agronomía</option>
                  <option value="Zootecnia">Zootecnia</option>
                  <option value="Comunicación Social">Comunicación Social</option>
                  <option value="Derecho">Derecho</option>
                  <option value="Otro">Otro...</option>
                </select>
                {testCareer === 'Otro' && (
                  <input type="text" value={testCustomCareer} onChange={(e) => setTestCustomCareer(e.target.value)} placeholder="Escribe el nombre de la carrera" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-slate-100 focus:outline-none focus:border-cyan-500" />
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Nombre de la Actividad (Opcional)</label>
                <input type="text" value={testTaskName} onChange={(e) => setTestTaskName(e.target.value)} placeholder="Ej. Tarea 1 - Reconocimiento" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-slate-100 focus:outline-none focus:border-cyan-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Tipo de Actividad</label>
                <select value={testTaskType} onChange={(e) => setTestTaskType(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-slate-100 focus:outline-none focus:border-cyan-500">
                  <option value="individual">Individual</option>
                  <option value="collaborative">Colaborativa</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Nombre del Tutor (Opcional)</label>
                <input type="text" value={testTutorName} onChange={(e) => setTestTutorName(e.target.value)} placeholder="Ej. Juan Pérez" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-slate-100 focus:outline-none focus:border-cyan-500" />
              </div>
              <div className="pt-4 flex justify-end space-x-3">
                <button type="button" onClick={() => setIsTestModalOpen(false)} className="px-4 py-2 text-slate-400 hover:text-white transition-colors">Cancelar</button>
                <button type="submit" className="bg-cyan-600 hover:bg-cyan-500 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center space-x-2">
                  <Play className="w-4 h-4" />
                  <span>Empezar Prueba</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

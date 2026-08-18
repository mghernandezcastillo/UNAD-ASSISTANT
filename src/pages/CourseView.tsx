import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { collection, query, getDocs, doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { ArrowLeft, FileText, Plus, Trash2, Edit2, X } from 'lucide-react';

export function CourseView() {
  const { courseId } = useParams<{ courseId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [course, setCourse] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalType, setModalType] = useState('individual');
  const [modalTutor, setModalTutor] = useState('');
  const [editingTask, setEditingTask] = useState<any>(null);

  // Delete Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);

  useEffect(() => {
    if (user && courseId) {
      fetchCourseData();
    }
  }, [user, courseId]);

  const fetchCourseData = async () => {
    if (!user || !courseId) return;
    try {
      const courseSnap = await getDoc(doc(db, 'users', user.uid, 'courses', courseId));
      if (courseSnap.exists()) {
        setCourse(courseSnap.data());
      } else {
        navigate('/');
        return;
      }

      const q = query(collection(db, 'users', user.uid, 'tasks'));
      const snapshot = await getDocs(q);
      const fetchedTasks: any[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.courseId === courseId) {
          fetchedTasks.push({ taskId: doc.id, ...data });
        }
      });
      setTasks(fetchedTasks);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openNewTaskModal = () => {
    setEditingTask(null);
    setModalTitle('');
    setModalType('individual');
    setModalTutor('');
    setIsModalOpen(true);
  };

  const openEditTaskModal = (task: any) => {
    setEditingTask(task);
    setModalTitle(task.title);
    setModalType(task.type || 'individual');
    setModalTutor(task.tutor || '');
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !courseId || !modalTitle.trim()) return;

    try {
      if (editingTask) {
        // Edit existing
        await setDoc(doc(db, 'users', user.uid, 'tasks', editingTask.taskId), {
          title: modalTitle,
          type: modalType,
          tutor: modalTutor,
          updatedAt: Date.now()
        }, { merge: true });
      } else {
        // Create new
        const taskId = `task_${Date.now()}`;
        await setDoc(doc(db, 'users', user.uid, 'tasks', taskId), {
          taskId,
          courseId,
          userId: user.uid,
          title: modalTitle,
          description: '',
          status: 'pending',
          type: modalType,
          tutor: modalTutor,
          docUrl: '',
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      }
      setIsModalOpen(false);
      await fetchCourseData();
    } catch (err) {
      console.error(err);
      alert('Error guardando la actividad');
    }
  };

  const deleteTask = async () => {
    if (!user || !taskToDelete) return;
    await deleteDoc(doc(db, 'users', user.uid, 'tasks', taskToDelete));
    setIsDeleteModalOpen(false);
    setTaskToDelete(null);
    await fetchCourseData();
  };

  if (loading) return <div className="min-h-screen bg-slate-50 dark:bg-[#020617] text-slate-500 dark:text-slate-400 p-6">Cargando...</div>;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#020617] text-slate-800 dark:text-slate-100 p-6">
      <div className="max-w-4xl mx-auto">
        <button onClick={() => navigate('/')} className="flex items-center space-x-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-900 dark:text-white mb-6">
          <ArrowLeft className="w-5 h-5" />
          <span>Volver a mis cursos</span>
        </button>

        <header className="bg-slate-200 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 mb-8">
          <h1 className="text-3xl font-bold mb-2">{course?.name}</h1>
          <p className="text-slate-500 dark:text-slate-400">Código: {course?.code} | Créditos: {course?.credits}</p>
        </header>

        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold">Actividades</h2>
          <button onClick={openNewTaskModal} className="bg-cyan-600 hover:bg-cyan-500 text-slate-900 dark:text-white font-medium py-2 px-4 rounded-lg flex items-center space-x-2 transition-colors">
            <Plus className="w-5 h-5" />
            <span>Nueva Actividad</span>
          </button>
        </div>

        <div className="space-y-4">
          {tasks.map(task => (
            <div key={task.taskId} className="bg-slate-200 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex items-center justify-between group">
              <div className="flex items-center space-x-4">
                <div className={`p-3 rounded-xl ${task.status === 'completed' ? 'bg-green-500/10 text-green-400' : 'bg-slate-300 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{task.title}</h3>
                  <div className="flex items-center space-x-3 text-sm mt-1">
                    <span className={`px-2 py-0.5 rounded-full ${task.type === 'individual' ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'}`}>
                      {task.type === 'individual' ? 'Individual' : 'Colaborativa'}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full ${task.status === 'completed' ? 'bg-green-500/10 text-green-400' : 'bg-amber-500/10 text-amber-400'}`}>
                      {task.status === 'completed' ? 'Completada' : 'En Progreso'}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => navigate(`/course/${courseId}/task/${task.taskId}`)}
                  className="bg-slate-300 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-900 dark:text-white py-2 px-4 rounded-lg transition-colors"
                >
                  Abrir
                </button>
                <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEditTaskModal(task)} className="p-2 text-blue-400 hover:text-blue-300">
                    <Edit2 className="w-5 h-5" />
                  </button>
                  <button onClick={() => { setTaskToDelete(task.taskId); setIsDeleteModalOpen(true); }} className="p-2 text-red-400 hover:text-red-300">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {tasks.length === 0 && (
            <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              <p className="text-slate-500 dark:text-slate-400">No hay actividades registradas en este curso.</p>
            </div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-white/60 dark:bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-200 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">{editingTask ? 'Editar Actividad' : 'Nueva Actividad'}</h2>
              <button onClick={closeModal} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-900 dark:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleSaveTask} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Nombre de la Actividad</label>
                <input
                  required
                  type="text"
                  value={modalTitle}
                  onChange={(e) => setModalTitle(e.target.value)}
                  placeholder="ej. Fase 1 - Reconocimiento"
                  className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Tipo de Actividad</label>
                <select
                  value={modalType}
                  onChange={(e) => setModalType(e.target.value)}
                  className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-cyan-500"
                >
                  <option value="individual">Individual</option>
                  <option value="collaborative">Colaborativa</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Nombre del Tutor</label>
                <input
                  type="text"
                  value={modalTutor}
                  onChange={(e) => setModalTutor(e.target.value)}
                  placeholder="ej. Juan Pérez"
                  className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="pt-4 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-900 dark:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-cyan-600 hover:bg-cyan-500 text-slate-900 dark:text-white font-medium py-2 px-4 rounded-lg transition-colors"
                >
                  {editingTask ? 'Guardar Cambios' : 'Crear Actividad'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-white/60 dark:bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-200 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h2 className="text-xl font-bold mb-4">Eliminar Actividad</h2>
            <p className="text-slate-500 dark:text-slate-400 mb-6">¿Seguro que deseas eliminar esta actividad?</p>
            <div className="flex justify-end space-x-3">
              <button onClick={() => setIsDeleteModalOpen(false)} className="px-4 py-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-900 dark:text-white transition-colors">Cancelar</button>
              <button onClick={deleteTask} className="bg-red-600 hover:bg-red-500 text-slate-900 dark:text-white font-medium py-2 px-4 rounded-lg transition-colors">Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

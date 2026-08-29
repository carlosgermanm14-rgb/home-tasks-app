import { useState } from 'react';
import { Zap } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';

// 1. SOLUCIÓN: Definimos exactamente qué forma tiene showToast
interface AdminPanelProps {
  session: Session;
  darkMode: boolean;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const AdminPanel = ({ session, darkMode, showToast }: AdminPanelProps) => {
  const [triggerLoading, setTriggerLoading] = useState(false);

  const handleManualTrigger = async () => {
    setTriggerLoading(true);
    showToast('Iniciando envío manual secuencial...', 'info');
    try {
      const response = await fetch('/api/trigger-notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` }
      });
      const data = await response.json();
      if (response.ok && data.success) showToast(data.message, 'success');
      else showToast(data.error || 'Error al disparar notificaciones', 'error');
    } catch (error) {
      console.error(error);
      showToast('Error de red al conectar con la API', 'error');
    } finally {
      setTriggerLoading(false);
    }
  };

  return (
    <section className={`mb-6 p-4 rounded-2xl border ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
      <h2 className={`text-xs font-bold tracking-wider uppercase mb-3 pl-1 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>Panel de Control (Admin)</h2>
      <button onClick={handleManualTrigger} disabled={triggerLoading} className={`w-full flex items-center justify-center gap-2 font-semibold text-white py-3.5 rounded-xl text-sm shadow-md transition-all active:scale-95 disabled:opacity-50 ${darkMode ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-indigo-700 hover:bg-indigo-600'}`}>
        <Zap className="w-4 h-4" />
        {triggerLoading ? 'Enviando secuencialmente...' : 'Disparar Notificaciones Dinámicas'}
      </button>
    </section>
  );
};
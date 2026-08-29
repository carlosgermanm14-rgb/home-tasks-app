import { CheckCircle2, AlertCircle, Zap } from 'lucide-react';

export type ToastData = {
  message: string;
  type: 'success' | 'error' | 'info';
  action?: { label: string; onClick: () => void; };
} | null;

export const ToastNotification = ({ toast }: { toast: ToastData }) => {
  if (!toast) return null;
  const bgColor = toast.type === 'success' ? 'bg-emerald-950' : toast.type === 'error' ? 'bg-rose-950' : 'bg-indigo-950';
  const textColor = toast.type === 'success' ? 'text-emerald-300' : toast.type === 'error' ? 'text-rose-300' : 'text-indigo-300';
  const borderColor = toast.type === 'success' ? 'border-emerald-500/30' : toast.type === 'error' ? 'border-rose-500/30' : 'border-indigo-500/30';

  return (
    <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-4 py-2.5 rounded-full shadow-2xl text-sm font-medium animate-in slide-in-from-top-4 fade-in duration-300 backdrop-blur-md ${bgColor} ${textColor} ${borderColor} border`}>
      <div className="flex items-center gap-2">
        {toast.type === 'success' && <CheckCircle2 className="w-4 h-4" />}
        {toast.type === 'error' && <AlertCircle className="w-4 h-4" />}
        {toast.type === 'info' && <Zap className="w-4 h-4" />}
        <span className="text-slate-200">{toast.message}</span>
      </div>
      {toast.action && (
        <button onClick={toast.action.onClick} className="ml-1 px-2.5 py-0.5 rounded-full bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 text-xs font-bold border border-indigo-500/40 transition-colors uppercase tracking-wider">
          {toast.action.label}
        </button>
      )}
    </div>
  );
};
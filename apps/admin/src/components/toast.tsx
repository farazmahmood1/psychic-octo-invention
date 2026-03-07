import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from 'react';
import { X, CheckCircle, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Toast {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface ToastContextValue {
  toast: (type: Toast['type'], message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((type: Toast['type'], message: string) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, type, message }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast: t, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(t.id), 4000);
    return () => clearTimeout(timer);
  }, [t.id, onDismiss]);

  const icons = {
    success: <CheckCircle className="h-4 w-4 text-green-500" />,
    error: <AlertTriangle className="h-4 w-4 text-destructive" />,
    info: <Info className="h-4 w-4 text-blue-500" />,
  };

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border bg-background px-4 py-3 shadow-lg',
        'animate-in slide-in-from-right fade-in duration-200',
        'min-w-[300px] max-w-[400px]',
      )}
    >
      {icons[t.type]}
      <p className="flex-1 text-sm">{t.message}</p>
      <button onClick={() => onDismiss(t.id)} className="text-muted-foreground hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

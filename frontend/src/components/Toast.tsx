import { useEffect, useState, useCallback, createContext, useContext } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

// ── Types ──
type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  duration: number;
}

interface ToastContextType {
  toast: (type: ToastType, message: unknown, duration?: number) => void;
  success: (message: unknown) => void;
  error: (message: unknown) => void;
  warning: (message: unknown) => void;
  info: (message: unknown) => void;
}

// ── Stringify helper ──
function stringify(val: unknown): string {
  if (val === null || val === undefined) return String(val);
  if (typeof val === 'string') return val;
  if (val instanceof Error) return val.message;
  try {
    const s = JSON.stringify(val, null, 2);
    return s.length > 500 ? s.slice(0, 500) + '...' : s;
  } catch {
    return String(val);
  }
}

// ── Context ──
const ToastContext = createContext<ToastContextType | null>(null);

export function useToast(): ToastContextType {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback: 如果 ToastProvider 还没包住，降级用 alert
    return {
      toast: (_t, msg) => alert(stringify(msg)),
      success: (msg) => alert(stringify(msg)),
      error: (msg) => alert(stringify(msg)),
      warning: (msg) => alert(stringify(msg)),
      info: (msg) => alert(stringify(msg)),
    };
  }
  return ctx;
}

// ── Error formatting helper ──
export function fmtErr(err: Record<string, unknown>, fallback?: string | number): string {
  const val = err.detail ?? err.error ?? err.message;
  if (val === undefined || val === null) return String(fallback ?? 'unknown error');
  if (typeof val === 'string') return val;
  try { return JSON.stringify(val); } catch { return String(val); }
}

// ── Global imperative API ──
let _globalToast: ToastContextType | null = null;

export function toast(type: ToastType, message: unknown, duration?: number) {
  if (_globalToast) _globalToast.toast(type, message, duration);
  else alert(stringify(message));
}
export function toastSuccess(message: unknown) { toast('success', message); }
export function toastError(message: unknown, context?: string) {
  if (context) {
    const msgStr = typeof message === 'string' ? message : JSON.stringify(message);
    toast('error', `${context}: ${msgStr}`);
  } else {
    toast('error', message);
  }
}
export function toastWarning(message: unknown) { toast('warning', message); }
export function toastInfo(message: unknown) { toast('info', message); }

// ── Style configs ──
const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const STYLES = {
  success: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-300',
  error: 'bg-red-500/15 border-red-500/30 text-red-700 dark:text-red-300',
  warning: 'bg-amber-500/15 border-amber-500/30 text-amber-700 dark:text-amber-300',
  info: 'bg-blue-500/15 border-blue-500/30 text-blue-700 dark:text-blue-300',
};

const DURATIONS: Record<ToastType, number> = {
  success: 3000,
  error: 5000,
  warning: 4000,
  info: 3000,
};

let _idCounter = 0;

// ── Single Toast ──
function ToastEntry({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const Icon = ICONS[item.type];

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(onDismiss, 300);
    }, item.duration);
    return () => clearTimeout(timer);
  }, [item.duration, onDismiss]);

  return (
    <div
      className={`flex items-start gap-2.5 px-4 py-3 rounded-lg border shadow-lg backdrop-blur-sm max-w-[420px] transition-all duration-300 ${
        STYLES[item.type]
      } ${visible && !exiting ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'}`}
    >
      <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <pre className="text-sm flex-1 min-w-0 whitespace-pre-wrap break-words font-sans leading-relaxed">{item.message}</pre>
      <button
        onClick={() => { setExiting(true); setTimeout(onDismiss, 300); }}
        className="flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity mt-0.5"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── Provider ──
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((type: ToastType, message: unknown, duration?: number) => {
    const id = ++_idCounter;
    const msg = stringify(message);
    const dur = duration ?? DURATIONS[type];
    setToasts(prev => [...prev.slice(-4), { id, type, message: msg, duration: dur }]); // max 5
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const ctx: ToastContextType = {
    toast: addToast,
    success: (msg) => addToast('success', msg),
    error: (msg) => addToast('error', msg),
    warning: (msg) => addToast('warning', msg),
    info: (msg) => addToast('info', msg),
  };

  // Expose global
  _globalToast = ctx;

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      {/* Toast container — fixed top-right */}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto">
            <ToastEntry item={t} onDismiss={() => dismiss(t.id)} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

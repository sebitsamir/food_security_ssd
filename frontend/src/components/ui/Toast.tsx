'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

type ToastFn = (message: string) => void;
const ToastContext = createContext<ToastFn>(() => undefined);

export const useToast = (): ToastFn => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const toast = useCallback<ToastFn>((m) => {
    clearTimeout(timer.current);
    setMessage(m);
    setVisible(true);
    timer.current = setTimeout(() => setVisible(false), 3400);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  const value = useMemo(() => toast, [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-none fixed bottom-[calc(24px+env(safe-area-inset-bottom))] left-1/2 z-[80] max-w-[calc(100vw-32px)] -translate-x-1/2 rounded-xl bg-btn px-[18px] py-3 text-center text-sm font-medium text-btn-tx shadow-[0_14px_34px_-10px_rgba(0,0,0,.5)] transition-[opacity,transform] duration-200 ${visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}
      >
        {visible ? message : ''}
      </div>
    </ToastContext.Provider>
  );
}

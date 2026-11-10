"use client";
import React, { useEffect } from "react";
import { CheckCircle, XCircle, Loader2, AlertCircle, X } from "lucide-react";

const ToastNotification = ({ 
  type = "info", 
  message, 
  isVisible, 
  onClose, 
  duration = 4000,
  autoClose = true 
}) => {
  useEffect(() => {
    if (isVisible && autoClose && type !== "loading") {
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [isVisible, autoClose, duration, onClose, type]);

  if (!isVisible) return null;

  const icons = {
    success: <CheckCircle className="h-5 w-5 text-success" />,
    error: <XCircle className="h-5 w-5 text-destructive" />,
    loading: <Loader2 className="h-5 w-5 animate-spin text-primary motion-reduce:animate-none" />,
    warning: <AlertCircle className="h-5 w-5 text-warning" />,
    info: <AlertCircle className="h-5 w-5 text-info" />,
  };

  const backgrounds = {
    success: "bg-success/10 border-success/25",
    error: "bg-destructive/10 border-destructive/25",
    loading: "bg-primary/10 border-primary/25",
    warning: "bg-warning/10 border-warning/25",
    info: "bg-info/10 border-info/25",
  };

  const textColors = {
    success: "text-success",
    error: "text-destructive",
    loading: "text-foreground",
    warning: "text-warning",
    info: "text-info",
  };

  return (
    <div className="fixed inset-x-4 top-4 z-[100] animate-in slide-in-from-top-5 duration-300 sm:left-auto sm:right-4 sm:inset-x-auto">
      <div 
        className={`
          ${backgrounds[type]} 
          flex w-full max-w-md items-start gap-3 rounded-xl border shadow-xl
          p-4 sm:min-w-[320px]
          backdrop-blur-sm
        `}
      >
        <div className={`rounded-full p-2 ${
          type === 'success' ? 'bg-success/10' :
          type === 'error' ? 'bg-destructive/10' :
          type === 'loading' ? 'bg-primary/10' :
          type === 'warning' ? 'bg-warning/10' : 'bg-info/10'
        }`}>
          {icons[type]}
        </div>
        <div className={`min-w-0 flex-1 ${textColors[type]}`}>
          <div className="font-semibold mb-1">
            {type === 'success' ? '¡Éxito!' : 
             type === 'error' ? 'Error' : 
             type === 'loading' ? 'Procesando...' : 
             'Atención'}
          </div>
          <div className="text-sm opacity-90">{message}</div>
        </div>
        {type !== "loading" && (
          <button 
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-current transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Cerrar notificación"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};

export default ToastNotification;


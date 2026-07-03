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
    success: <CheckCircle className="w-5 h-5 text-green-600" />,
    error: <XCircle className="w-5 h-5 text-red-600" />,
    loading: <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />,
    warning: <AlertCircle className="w-5 h-5 text-amber-600" />,
  };

  const backgrounds = {
    success: "bg-gradient-to-r from-green-50 to-emerald-50 border-green-200",
    error: "bg-gradient-to-r from-red-50 to-pink-50 border-red-200",
    loading: "bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200",
    warning: "bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200",
  };

  const textColors = {
    success: "text-green-800",
    error: "text-red-800",
    loading: "text-blue-800",
    warning: "text-amber-800",
  };

  return (
    <div className="fixed top-4 right-4 z-[100] animate-in slide-in-from-top-5 duration-300">
      <div 
        className={`
          ${backgrounds[type]} 
          border-2 rounded-xl shadow-2xl 
          min-w-[320px] max-w-md 
          p-4 
          flex items-start gap-3
          backdrop-blur-sm
        `}
      >
        <div className={`p-2 rounded-full ${
          type === 'success' ? 'bg-green-100' : 
          type === 'error' ? 'bg-red-100' : 
          type === 'loading' ? 'bg-blue-100' : 
          'bg-amber-100'
        }`}>
          {icons[type]}
        </div>
        <div className={`flex-1 ${textColors[type]}`}>
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
            onClick={onClose}
            className="p-1 hover:bg-black/5 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};

export default ToastNotification;


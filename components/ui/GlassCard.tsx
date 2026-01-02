
import React from 'react';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  intensity?: 'low' | 'medium' | 'high';
  border?: boolean;
  hoverEffect?: boolean;
  onClick?: () => void;
}

export const GlassCard: React.FC<GlassCardProps> = ({ 
  children, 
  className = "", 
  intensity = 'medium',
  border = true,
  hoverEffect = false,
  onClick
}) => {
  const bgIntensity = {
    low: 'bg-white dark:bg-slate-900',
    medium: 'bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl',
    high: 'bg-white/40 dark:bg-slate-900/40 backdrop-blur-2xl'
  };

  const borderClass = border 
    ? 'border border-slate-200/60 dark:border-slate-700/60 shadow-xl' 
    : 'border-none shadow-none';

  const hoverClass = hoverEffect
    ? 'transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:border-indigo-300 dark:hover:border-indigo-700 cursor-pointer group'
    : '';

  return (
    <div 
      onClick={onClick}
      className={`
        ${bgIntensity[intensity]} 
        ${borderClass} 
        ${hoverClass}
        rounded-[2.5rem] 
        relative overflow-hidden
        ${className}
      `}
    >
      {/* Effet de lueur interne subtil */}
      {hoverEffect && <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/0 to-white/5 dark:to-white/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />}
      
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
};

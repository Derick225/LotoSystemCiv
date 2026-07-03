
import React from 'react';
import { getNumberColor } from '../constants';
import { useNexusStore } from '../store/useNexusStore';

export interface NumberBallProps {
  number: number;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  glow?: boolean;
  confidence?: number;
  isAttractor?: boolean;
  selected?: boolean;
}

export const NumberBall: React.FC<NumberBallProps> = React.memo(({ 
  number, 
  size = 'md', 
  glow, 
  confidence, 
  isAttractor, 
  selected 
}) => {

  const sizes = { 
    xs: 'w-6 h-6 text-[10px]',
    sm: 'w-8 h-8 text-xs', 
    md: 'w-10 h-10 md:w-12 md:h-12 text-base md:text-lg', 
    lg: 'w-12 h-12 md:w-16 md:h-16 text-xl md:text-2xl',
    xl: 'w-14 h-14 sm:w-16 sm:h-16 md:w-24 md:h-24 text-2xl md:text-4xl'
  };
  
  return (
    <div 
      className={`
        ${sizes[size]} ${getNumberColor(number)}
        rounded-full flex items-center justify-center font-black text-white
        border-2 shadow-2xl transition-all hover:scale-110 cursor-pointer select-none
        ${glow || isAttractor ? 'animate-glow ring-4 ring-indigo-500/50' : ''}
        ${selected ? 'ring-4 ring-white border-white' : ''}
        ${confidence && confidence > 80 ? 'shadow-indigo-500/40' : ''}
      `}
      onClick={(e) => {
        e.stopPropagation();
        const setInspectingNumber = useNexusStore.getState().setInspectingNumber;
        setInspectingNumber(number);
      }}
    >
      {number}
      {confidence !== undefined && size !== 'sm' && (
        <div className="absolute -top-1 -right-1 bg-white text-indigo-900 text-[10px] px-1 rounded-md font-bold shadow-sm">
          {Math.round(confidence)}%
        </div>
      )}
    </div>
  );
});

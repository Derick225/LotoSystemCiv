
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
  const setHoveredNumber = useNexusStore(state => state.setHoveredNumber);

  const sizes = { 
    xs: 'w-6 h-6 text-[10px]',
    sm: 'w-8 h-8 text-xs', 
    md: 'w-12 h-12 text-lg', 
    lg: 'w-16 h-16 text-2xl',
    xl: 'w-24 h-24 text-4xl'
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
        e.stopPropagation(); // Empêche la propagation pour ne pas fermer immédiatement si imbriqué
        setHoveredNumber(number);
      }}
    >
      {number}
      {confidence !== undefined && size !== 'sm' && (
        <div className="absolute -top-1 -right-1 bg-white text-indigo-900 text-[8px] px-1 rounded-md font-bold shadow-sm">
          {Math.round(confidence)}%
        </div>
      )}
    </div>
  );
});

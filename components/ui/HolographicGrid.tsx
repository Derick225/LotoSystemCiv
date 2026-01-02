
import React from 'react';

export const HolographicGrid: React.FC = () => {
    return (
        <div className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden">
            {/* Grille de fond perspective */}
            <div 
                className="absolute inset-0 opacity-10 dark:opacity-20"
                style={{
                    backgroundImage: `
                        linear-gradient(to right, rgba(99, 102, 241, 0.1) 1px, transparent 1px),
                        linear-gradient(to bottom, rgba(99, 102, 241, 0.1) 1px, transparent 1px)
                    `,
                    backgroundSize: '40px 40px',
                    transform: 'perspective(500px) rotateX(20deg) scale(1.5)',
                    transformOrigin: 'top center'
                }}
            ></div>
            
            {/* Vignette Radiale */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#020617_90%)]"></div>
            
            {/* Particules flottantes (simulées en CSS) */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-[128px] animate-pulse-slow"></div>
            <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-purple-600/10 rounded-full blur-[96px] animate-pulse-slow" style={{ animationDelay: '2s' }}></div>
        </div>
    );
};

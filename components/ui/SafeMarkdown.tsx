
import React from 'react';

interface SafeMarkdownProps {
    text: string;
    className?: string;
}

/**
 * SafeMarkdown v3.0 - Secure React Parser
 * Remplace dangerouslySetInnerHTML par une construction d'éléments React sûre.
 * Previent les attaques XSS tout en supportant le formatage basique.
 */
export const SafeMarkdown: React.FC<SafeMarkdownProps> = ({ text, className }) => {
    if (!text) return null;

    // Fonction de parsing d'une ligne pour le gras, l'italique et le code
    const parseInline = (lineContent: string, lineKey: string) => {
        const parts = lineContent.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);
        
        return parts.map((part, index) => {
            const key = `${lineKey}-${index}`;
            
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={key} className="text-indigo-300 font-bold">{part.slice(2, -2)}</strong>;
            }
            if (part.startsWith('*') && part.endsWith('*')) {
                return <em key={key} className="text-slate-400">{part.slice(1, -1)}</em>;
            }
            if (part.startsWith('`') && part.endsWith('`')) {
                return <code key={key} className="bg-slate-800 px-1 py-0.5 rounded text-indigo-400 font-mono text-[10px]">{part.slice(1, -1)}</code>;
            }
            return <span key={key}>{part}</span>;
        });
    };

    return (
        <div className={`space-y-1 ${className}`}>
            {text.split('\n').map((line, index) => {
                const key = `line-${index}`;
                const trimmed = line.trim();

                // Gestion des Titres H3
                if (trimmed.startsWith('### ')) {
                    return (
                        <h3 key={key} className="text-sm font-black text-white uppercase tracking-widest mt-4 mb-2 border-l-2 border-indigo-500 pl-3">
                            {parseInline(trimmed.replace('### ', ''), key)}
                        </h3>
                    );
                }
                
                // Gestion des Titres H2
                if (trimmed.startsWith('## ')) {
                    return (
                        <h2 key={key} className="text-base font-black text-white uppercase tracking-tighter mt-6 mb-3">
                            {parseInline(trimmed.replace('## ', ''), key)}
                        </h2>
                    );
                }

                // Gestion des Listes
                if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                    return (
                        <div key={key} className="flex items-start gap-2 mb-1.5 ml-2">
                            <span className="text-indigo-500 mt-1.5 shrink-0">•</span>
                            <span className="text-slate-300 text-xs leading-relaxed">
                                {parseInline(trimmed.replace(/^[\-\*] /, ''), key)}
                            </span>
                        </div>
                    );
                }

                // Lignes vides
                if (trimmed === '') {
                    return <div key={key} className="h-2" />;
                }

                // Paragraphes standard
                return (
                    <p key={key} className="text-slate-400 text-xs leading-relaxed mb-2 text-justify">
                        {parseInline(line, key)}
                    </p>
                );
            })}
        </div>
    );
};

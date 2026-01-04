
import React from 'react';

interface SafeMarkdownProps {
    text: string;
    className?: string;
}

/**
 * Moteur de rendu Markdown Sécurisé v2.0
 * Supporte : Titres (###), Listes (-), Gras (**), Italique (*), Code (`)
 */
export const SafeMarkdown: React.FC<SafeMarkdownProps> = ({ text, className }) => {
    if (!text) return null;

    const parseLine = (line: string, index: number) => {
        let content = line;
        
        // Sécurisation HTML basique
        content = content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // Formatage Inline
        content = content
            .replace(/\*\*(.*?)\*\*/g, '<strong class="text-indigo-300 font-bold">$1</strong>') // Gras
            .replace(/\*(.*?)\*/g, '<em class="text-slate-400">$1</em>') // Italique
            .replace(/`(.*?)`/g, '<code class="bg-slate-800 px-1 py-0.5 rounded text-indigo-400 font-mono text-[10px]">$1</code>'); // Code

        // Détection de structure
        if (line.startsWith('### ')) {
            return (
                <h3 
                    key={index} 
                    className="text-sm font-black text-white uppercase tracking-widest mt-4 mb-2 border-l-2 border-indigo-500 pl-3"
                    dangerouslySetInnerHTML={{ __html: content.replace('### ', '') }} 
                />
            );
        }
        
        if (line.startsWith('## ')) {
            return (
                <h2 
                    key={index} 
                    className="text-base font-black text-white uppercase tracking-tighter mt-6 mb-3"
                    dangerouslySetInnerHTML={{ __html: content.replace('## ', '') }} 
                />
            );
        }

        if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
            return (
                <div key={index} className="flex items-start gap-2 mb-1.5 ml-2">
                    <span className="text-indigo-500 mt-1.5">•</span>
                    <span 
                        className="text-slate-300 text-xs leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: content.replace(/^[\-\*] /, '') }} 
                    />
                </div>
            );
        }

        if (line.trim() === '') {
            return <div key={index} className="h-2" />;
        }

        return (
            <p 
                key={index} 
                className="text-slate-400 text-xs leading-relaxed mb-2 text-justify"
                dangerouslySetInnerHTML={{ __html: content }} 
            />
        );
    };

    return (
        <div className={`space-y-1 ${className}`}>
            {text.split('\n').map((line, index) => parseLine(line, index))}
        </div>
    );
};

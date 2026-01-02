import React from 'react';

interface SafeMarkdownProps {
    text: string;
    className?: string;
}

/**
 * Affiche un texte de manière sécurisée en autorisant uniquement un sous-ensemble très limité de formatage Markdown.
 * 1. Échappe toutes les balises HTML.
 * 2. Applique le formatage **gras** via `<strong>`.
 */
export const SafeMarkdown: React.FC<SafeMarkdownProps> = ({ text, className }) => {
    const createMarkup = (line: string) => {
        // Échappe d'abord les caractères HTML pour la sécurité
        const sanitized = line
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
        
        // Applique ensuite un formatage sûr
        const formatted = sanitized.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

        return { __html: formatted };
    };

    return (
        <div className={className}>
          {text.split('\n').map((line, index) => (
            line.trim() === '' 
              ? <br key={index} /> 
              : <p key={index} dangerouslySetInnerHTML={createMarkup(line)} />
          ))}
        </div>
    );
};

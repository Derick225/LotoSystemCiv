import React from 'react';

interface DarkModeToggleProps {
  theme: string;
  setTheme: (theme: string) => void;
}

export const DarkModeToggle: React.FC<DarkModeToggleProps> = ({ theme, setTheme }) => {
  const themes = [
    { name: 'light', icon: '☀️' },
    { name: 'dark', icon: '🌙' },
    { name: 'system', icon: '💻' }
  ];

  const cycleTheme = () => {
    const currentIndex = themes.findIndex(t => t.name === theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    setTheme(themes[nextIndex].name);
  };
  
  const currentTheme = themes.find(t => t.name === theme);

  return (
    <button
      onClick={cycleTheme}
      className="p-2 rounded-full bg-gray-200 dark:bg-gray-700 text-xl"
      aria-label={`Changer le thème, actuel: ${theme}`}
    >
      {currentTheme?.icon}
    </button>
  );
};
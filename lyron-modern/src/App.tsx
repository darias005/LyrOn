import { useState } from 'react';
import './index.css';

function App() {
  const [isDarkMode, setIsDarkMode] = useState(false);

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
  };

  return (
    <div className={`${isDarkMode ? 'dark' : ''} h-[500px] w-[350px]`}>
      
      {/* Contenedor principal de la extensión */}
      <aside className="h-full w-full 
                        bg-white/70 dark:bg-black/70 
                        backdrop-blur-md 
                        transition-colors duration-300
                        flex flex-col p-6">
        
        {/* Cabecera */}
        <div className="flex justify-between items-center mb-6 border-b border-gray-300 dark:border-gray-700 pb-3">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
            🎵 LyrOn
          </h1>
          
          {/* Botón Modo Oscuro/Claro */}
          <button 
            onClick={toggleTheme}
            className="p-2 rounded-full bg-white/50 dark:bg-gray-800 hover:bg-white dark:hover:bg-gray-700 transition-all text-xl cursor-pointer"
            title="Cambiar tema"
          >
            {isDarkMode ? '☀️' : '🌙'}
          </button>
        </div>

        {/* Contenido principal */}
        <div className="flex-1 flex flex-col gap-4 text-gray-800 dark:text-gray-200">
          
          {/* Tarjeta de canción actual */}
          <div className="p-4 rounded-xl bg-white/50 dark:bg-gray-800/50 shadow-sm border border-white/20 dark:border-gray-600/30">
            <h2 className="text-xs uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400 mb-1">
              Reproduciendo ahora
            </h2>
            <p className="font-medium truncate">Esperando a YouTube/Spotify...</p>
          </div>
          
          {/* Área de letras */}
          <div className="p-4 rounded-xl bg-white/50 dark:bg-gray-800/50 shadow-sm border border-white/20 dark:border-gray-600/30 flex-1 overflow-y-auto flex items-center justify-center text-center">
            <p className="opacity-60 italic">
              Aquí irán las letras sincronizadas en tiempo real.
            </p>
          </div>
          
        </div>
      </aside>
    </div>
  );
}

export default App;
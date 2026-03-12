import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

function App({ onClose }: { onClose?: () => void }) {
  // CONFIGURACIÓN: Si es false, la extensión se cierra en otras pestañas al abrirse en una nueva.
  // Si es true, permite tener el contenedor flotante en múltiples pestañas a la vez.
  const IsPayableUser = true;

  const [isDarkMode, setIsDarkMode] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(window.location.href);
  
  // Agrupamos artista y título en un solo estado
  const [songData, setSongData] = useState({ artist: '', title: '' });
  const [lyrics, setLyrics] = useState('');
  const [isLoadingLyrics, setIsLoadingLyrics] = useState(false);

  const [lyricsType, setLyricsType] = useState<'plain' | 'synced' | null>(null);
  const [syncedLines, setSyncedLines] = useState<{ time: number; text: string }[]>([]);
  const [currentLineIndex, setCurrentLineIndex] = useState<number>(-1);
  
  // 🎙️ NUEVO: Referencia directa al contenedor del scroll
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 0. Lógica para limitar a una sola pestaña si NO es PayableUser
  // Usamos useState para la inicialización lazy, garantizando que StrictMode
  // no genere un nuevo ID si el componente se desmonta y monta rápidamente
  const [instanceId] = useState(() => Math.random().toString(36).substring(2, 9));

  useEffect(() => {
    if (IsPayableUser) return; // Si es premium, permite múltiples instancias sin problema
    
    // Al abrirse (montarse), reclama ser la instancia activa
    chrome.storage.local.set({ activeLyronInstance: instanceId });

    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.activeLyronInstance) {
        // Si el valor cambió y no es nuestro ID, es que otra pestaña se abrió
        const newId = changes.activeLyronInstance.newValue;
        if (newId && newId !== instanceId) {
          if (onClose) onClose(); // Cerramos esta instancia
        }
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, [IsPayableUser, onClose]);

  // 1. Escuchar posibles cambios de URL en páginas SPA como YouTube
  useEffect(() => {
    let lastUrl = window.location.href;
    const observer = new MutationObserver(() => {
      const url = window.location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        setCurrentUrl(url);
      }
    });
    observer.observe(document, { subtree: true, childList: true });
    return () => observer.disconnect();
  }, []);

  // 2. Extraer el título del video o la canción (Inteligente con MediaSession)
  useEffect(() => {
    if (!currentUrl.includes('youtube.com/watch') && !currentUrl.includes('spotify.com')) {
      setSongData({ artist: '', title: '' });
      return;
    }

    const getCleanMetadata = () => {
      // Intento A: El estándar de oro (Media Session API)
      if (navigator.mediaSession && navigator.mediaSession.metadata) {
        const { title, artist } = navigator.mediaSession.metadata;
        if (title) return { cleanTitle: title, cleanArtist: artist || '' };
      }

      // Intento B: Fallback buscando en el DOM de YouTube
      const titleElement = document.querySelector('h1.ytd-watch-metadata yt-formatted-string');
      if (titleElement && titleElement.textContent) return { cleanTitle: titleElement.textContent, cleanArtist: '' };
      
      const pageTitle = document.title.replace(' - YouTube', '');
      if (pageTitle !== 'YouTube') return { cleanTitle: pageTitle, cleanArtist: '' };
      
      return { cleanTitle: '', cleanArtist: '' };
    };

    // Usamos un intervalo porque los metadatos de MediaSession a veces
    // tardan 1 o 2 segundos en aparecer después de que carga la página
    const interval = setInterval(() => {
      const data = getCleanMetadata();
      
      if (data.cleanTitle) {
        setSongData(prev => {
          // Solo actualizamos el estado si realmente cambió la canción
          // Esto evita re-renderizados infinitos
          if (prev.title !== data.cleanTitle || prev.artist !== data.cleanArtist) {
            return { artist: data.cleanArtist, title: data.cleanTitle };
          }
          return prev;
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [currentUrl]);

  // 🚨 ESPÍA DE YOUTUBE: Sincronización en tiempo real
  useEffect(() => {
    if (lyricsType !== 'synced' || syncedLines.length === 0) return;

    const videoElement = document.querySelector('video');
    if (!videoElement) return;

    // Solo nos encargamos de actualizar el ÍNDICE ACTIVO aquí
    const interval = setInterval(() => {
      const currentTime = videoElement.currentTime;
      
      let activeIdx = -1;
      for (let i = 0; i < syncedLines.length; i++) {
        if (currentTime >= syncedLines[i].time) {
          activeIdx = i;
        } else {
          break;
        }
      }

      if (activeIdx !== currentLineIndex) {
        setCurrentLineIndex(activeIdx);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [lyricsType, syncedLines, currentLineIndex]);

  // 🎙️ NUEVO: Lógica de Autoscroll (Reacciona cuando cambia la línea)
  useEffect(() => {
    if (lyricsType !== 'synced' || currentLineIndex < 0) return;
    
    const containerEl = scrollContainerRef.current;
    if (!containerEl) return;

    // 🚨 EL CAMBIO CLAVE: Buscamos DENTRO del contenedor, no en el documento global
    const lineEl = containerEl.querySelector(`#lyric-line-${currentLineIndex}`) as HTMLElement;
    
    if (lineEl) {
      // Calculamos cuánto hay que desplazar para que la línea quede en el medio
      const containerAltura = containerEl.clientHeight;
      
      // Calculamos la posición destino
      // lineEl.offsetTop nos da la posición de la línea relativa a su contenedor padre
      const scrollPosDestino = lineEl.offsetTop - (containerAltura / 2) + (lineEl.clientHeight / 2);
      
      // Hacemos el scroll manual específicamente a nuestro contenedor div
      containerEl.scrollTo({
        top: Math.max(0, scrollPosDestino),
        behavior: 'smooth'
      });
    }
  }, [currentLineIndex, lyricsType]);


  // 🚨 ACTUALIZADO: Pedir las letras y parsear los tiempos
  useEffect(() => {
    if (!songData.title) return;

    setIsLoadingLyrics(true);
    setLyricsType(null);
    setSyncedLines([]);
    setCurrentLineIndex(-1);
    const displayName = songData.artist ? `${songData.artist} - ${songData.title}` : songData.title;
    setLyrics(`Buscando letras para:\n${displayName}...`);

    // Nos comunicamos con background.ts
    chrome.runtime.sendMessage(
      { action: "fetch_lyrics", title: songData.title, artist: songData.artist },
      (response) => {
        setIsLoadingLyrics(false);
        if (response && response.success) {
          setLyricsType(response.type); 
          
          if (response.type === 'synced') {
            // Convierte [00:15.22] a datos usables
            const lines = response.syncedLyrics.split('\n'); // <--- AHORA USA syncedLyrics
            const timeRegex = /\[(\d{2}):(\d{2}\.\d{2,3})\]/;
            const parsedLines = [];
            
            for (const line of lines) {
              const match = line.match(timeRegex);
              if (match) {
                const minutes = parseInt(match[1], 10);
                const seconds = parseFloat(match[2]);
                const time = minutes * 60 + seconds;
                const text = line.replace(timeRegex, '').trim();
                if (text) parsedLines.push({ time, text });
              }
            }
            setSyncedLines(parsedLines);
            setLyrics(response.plainLyrics); // <--- Guardamos también la letra limpia
          } else {
            setLyrics(response.lyrics); 
          }
        } else {
          setLyrics(response?.error || 'No se encontró la letra.');
        }
      }
    );
  }, [songData]);

  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  // Texto a mostrar en la tarjeta de "Reproduciendo ahora"
  const nowPlayingText = songData.title 
    ? (songData.artist ? `${songData.artist} - ${songData.title}` : songData.title)
    : (currentUrl.includes('youtube.com/watch') ? 'Cargando datos...' : 'Esperando música...');

  return (
    <motion.div 
      drag
      dragMomentum={false}
      className={`${isDarkMode ? 'dark' : ''} h-[500px] w-[350px] bg-transparent pointer-events-auto`}
    >
      
      {/* Contenedor principal de la extensión */}
      <aside className="h-full w-full 
                        bg-white/40 dark:bg-black/60
                        backdrop-blur-xl backdrop-brightness-25 dark:backdrop-brightness-100
                        border border-white/40 dark:border-white/10
                        shadow-2xl
                        transition-all duration-300
                        flex flex-col rounded-2xl overflow-hidden cursor-move">
        
        {/* Cabecera / Handler para arrastrar */}
        <div className="flex justify-between items-center p-4 border-b border-gray-300/50 dark:border-gray-700/50 bg-white/20 dark:bg-black/20 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="text-gray-500 dark:text-gray-400 cursor-grab active:cursor-grabbing text-3xl">⋮⋮</span>
            <h1 className="text-xl font-bold text-gray-800 dark:text-white drop-shadow-sm select-none">🎵 LyrOn</h1>
          </div>
          
          {/* Botón Modo Oscuro/Claro */}
          <button 
            onClick={toggleTheme}
            onPointerDown={(e) => e.stopPropagation()} // Para que no se arrastre al hacer clic
            className="p-1.5 rounded-full bg-white/50 dark:bg-gray-800 hover:bg-white dark:hover:bg-gray-700 transition-all text-md cursor-pointer"
            title="Cambiar tema"
          >
            {isDarkMode ? '☀️' : '🌙'}
          </button>
        </div>

        {/* Contenido principal */}
        <div className="flex-1 flex flex-col gap-4 text-gray-800 dark:text-gray-200 p-6 pt-4 cursor-default min-h-0" onPointerDown={(e) => e.stopPropagation()}>
          
          <div className="p-4 rounded-xl bg-white/50 dark:bg-gray-800/50 shadow-sm border border-white/20 dark:border-gray-600/30 shrink-0">
            <h2 className="text-xs uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400 mb-1">Reproduciendo ahora</h2>
            <p className="font-medium truncate" title={nowPlayingText}>{nowPlayingText}</p>
          </div>
          
          <div 
            ref={scrollContainerRef}
            className="p-4 rounded-xl bg-white/50 dark:bg-gray-800/50 shadow-sm border border-white/20 dark:border-gray-600/30 flex-1 overflow-y-auto custom-scrollbar min-h-0 relative"
          >
            
            {isLoadingLyrics ? (
              <div className="h-full flex items-center justify-center">
                <p className="opacity-60 italic animate-pulse text-center whitespace-pre-wrap">{lyrics}</p>
              </div>
            ) : lyricsType === 'synced' ? (
              // 🚨 RENDERIZADO KARAOKE 
              <div className="w-full flex flex-col gap-3 pb-[200px] pt-10">
                {syncedLines.map((line, idx) => {
                  const isActive = idx === currentLineIndex;
                  return (
                    <p 
                      key={idx} 
                      id={`lyric-line-${idx}`}
                      className={`text-center leading-relaxed transition-all duration-300 ${
                        isActive 
                          ? 'text-lg font-bold text-black dark:text-white drop-shadow-md scale-105' 
                          : 'text-sm font-medium text-gray-500 dark:text-gray-400 opacity-60'
                      }`}
                    >
                      {line.text}
                    </p>
                  );
                })}
              </div>
            ) : (
              // RENDERIZADO NORMAL (Letras.com)
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-center w-full pb-6 pt-2 font-medium">
                {lyrics || "No hay letras para mostrar."}
              </p>
            )}

          </div>
          
        </div>
      </aside>
    </motion.div>
  );
}

export default App;
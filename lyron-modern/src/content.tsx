import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import tailwindStyles from './index.css?inline'; 

function InjectedExtension() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const messageListener = (request: any) => {
      if (request.action === 'toggle_lyron') {
        setIsVisible(prev => !prev);
      }
    };
    chrome.runtime.onMessage.addListener(messageListener);
    
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, []);

  if (!isVisible) return null;

  return <App onClose={() => setIsVisible(false)} />;
}

// Evitamos inicializar multiples veces si el script se vuelve a inyectar
if (!document.getElementById('lyron-extension-host')) {
  console.log("¡LyrOn inyectando interfaz (Shadow DOM) en esta página! 🎵");

  // 1. Crear el contenedor "host"
  const hostElement = document.createElement('div');
  hostElement.id = 'lyron-extension-host';
  
  hostElement.style.position = 'fixed';
  hostElement.style.bottom = '20px';
  hostElement.style.right = '20px';
  hostElement.style.zIndex = '999999';
  hostElement.style.pointerEvents = 'none'; // EVITA QUE BLOQUEE CLICS EN YOUTUBE
  
  document.body.appendChild(hostElement);

  // 2. Crear el Shadow DOM para encapsular Tailwind
  const shadowRoot = hostElement.attachShadow({ mode: 'open' });

  // 3. Inyectar los estilos de Tailwind
  const styleElement = document.createElement('style');
  styleElement.textContent = tailwindStyles;
  shadowRoot.appendChild(styleElement);

  // 4. Crear el contenedor de React
  const reactRoot = document.createElement('div');
  reactRoot.id = 'lyron-react-root';
  reactRoot.style.pointerEvents = 'none';
  shadowRoot.appendChild(reactRoot);

  createRoot(reactRoot).render(
    <StrictMode>
      <InjectedExtension />
    </StrictMode>
  );
}

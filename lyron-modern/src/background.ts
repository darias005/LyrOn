/// <reference types="chrome" />
import * as cheerio from 'cheerio';

chrome.action.onClicked.addListener((tab: chrome.tabs.Tab) => {
  if (tab.id) {
    chrome.tabs.sendMessage(tab.id, { action: "toggle_lyron" }).catch(() => {
      // The content script might not be loaded yet or the page might not support it
      console.log("Could not send message to tab. Is the content script injected?");
    });
  }
});

// ... (tu código anterior de manejo de pestañas toggle_lyron / show_lyron) ...

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "fetch_lyrics") {
    
    // 🚨 CAMBIO 1: Ya no mezclamos el texto aquí. Mandamos el título y artista tal cual llegan.
    console.log(`Buscando: Título: "${request.title}" | Artista: "${request.artist}"`);

    buscarLetraEnLetrasCom(request.title, request.artist)
      .then(resultado => {
        sendResponse(resultado);
      })
      .catch(error => {
        console.error("Error en el proceso:", error);
        sendResponse({ success: false, error: "Ocurrió un error al buscar la letra." });
      });

    return true; 
  }
});

// Función principal de Web Scraping
// Función principal que Orquesta las búsquedas
async function buscarLetraEnLetrasCom(title: string, artist?: string) {
  try {
    // ==========================================
    // FASE 0: Función ayudante para limpiar basura
    // ==========================================
    const limpiarTexto = (texto: string) => {
      if (!texto) return '';
      let t = texto.replace(/\s*-\s*topic\b/gi, '').replace(/\btopic\b/gi, '');
      t = t.replace(/\[.*?\]|\(.*?\)/g, '');
      const palabrasBasura = ['official video', 'official audio', 'lyric video', 'lyrics', 'letra', 'remastered', 'live', 'en vivo','Topic'];
      palabrasBasura.forEach(p => {
        t = t.replace(new RegExp(`\\b${p}\\b`, 'gi'), '');
      });
      return t.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    };

    // Limpiamos el título y el artista de forma independiente
    const tituloLimpio = limpiarTexto(title);
    const artistaLimpio = limpiarTexto(artist || '');

    if (!tituloLimpio) return { success: false, error: "Título inválido." };

    // ==========================================
    // FASE 1: INTENTO A (LRCLIB - Letras Sincronizadas con /api/get)
    // ==========================================
    try {
      let lrclibUrl = '';
      
      if (artistaLimpio) {
        // Formateamos con el "+" en lugar de "%20" usando replace
        const artistParam = encodeURIComponent(artistaLimpio).replace(/%20/g, '+');
        const trackParam = encodeURIComponent(tituloLimpio).replace(/%20/g, '+');
        
        // Usamos tu endpoint estricto /get
        lrclibUrl = `https://lrclib.net/api/get?artist_name=${artistParam}&track_name=${trackParam}`;
      } else {
        // Fallback al /search si no tenemos artista (el /get obliga a tener ambos)
        lrclibUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(tituloLimpio).replace(/%20/g, '+')}`;
      }

      console.log("Consultando LRCLIB:", lrclibUrl);
      const lrclibResponse = await fetch(lrclibUrl);
      
      // Si la petición fue exitosa (código 200)
      if (lrclibResponse.ok) {
        const data = await lrclibResponse.json();
        
        // Si usamos /get, devuelve un objeto directo. Si usamos /search, devuelve un Array.
        const cancion = Array.isArray(data) ? data.find((c: any) => c.syncedLyrics) : data;
        
        if (cancion && cancion.syncedLyrics) {
          console.log("¡Letra sincronizada encontrada en LRCLIB!");
          return { 
            success: true, 
            type: 'synced', 
            syncedLyrics: cancion.syncedLyrics,
            // Proveemos también plainLyrics para mostrar en la interfaz normal
            plainLyrics: cancion.plainLyrics || cancion.syncedLyrics.replace(/\[\d{2}:\d{2}\.\d{2,3}\]\s*/g, '') 
          };
        }
      } else {
        console.log(`LRCLIB devolvió error ${lrclibResponse.status}, cayendo a Letras.com...`);
      }
    } catch (e) {
      console.log("Fallo total de red en LRCLIB, cayendo a Letras.com...", e);
    }

    // ==========================================
    // FASE 2: INTENTO B (Letras.com - Fallback Texto Plano)
    // ==========================================
    console.log("Buscando texto plano en Letras.com...");
    
    // Letras.com sí necesita que le mandemos todo junto
    const queryParaLetrasCom = artistaLimpio ? `${artistaLimpio} ${tituloLimpio}` : tituloLimpio;
    const solrUrl = `https://solr.sscdn.co/letras/m1/?q=${encodeURIComponent(queryParaLetrasCom)}&wt=json&callback=LetrasSug`;
    
    const solrResponse = await fetch(solrUrl);
    const solrText = await solrResponse.text(); 

    const startIndex = solrText.indexOf('{');
    const endIndex = solrText.lastIndexOf('}');
    if (startIndex === -1 || endIndex === -1) return { success: false, error: "Fallo Letras.com" };

    const solrData = JSON.parse(solrText.substring(startIndex, endIndex + 1));
    const cancion = solrData.response?.docs?.find((doc: any) => doc.t === "2");
    
    if (!cancion) return { success: false, error: "Letra no encontrada" };

    const letraUrl = `https://www.letras.com/${cancion.dns}/${cancion.url}/`;
    const htmlText = await (await fetch(letraUrl)).text();
    const $ = cheerio.load(htmlText);
    const contenedorLetra = $('.lyric-original').length ? $('.lyric-original') : $('.lyric');
    contenedorLetra.find('br').replaceWith('\n');
    
    return { success: true, type: 'plain', lyrics: contenedorLetra.text().trim() };

  } catch (error) {
    return { success: false, error: "Error general en la búsqueda." };
  }
}
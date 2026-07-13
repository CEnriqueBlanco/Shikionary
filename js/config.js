// CONFIGURACIÓN DE GOOGLE SHEETS (Sincronización en la nube)
export const GOOGLE_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbwliI-YwdoEO4C8QZMs9CHgv7HtAOQRt3-b_QIWNQa5GZpTVf_ERBhXOF5rPapJ8dbI/exec';

// Global State object to share references between modules
export const state = {
    savedWords: [],
    activeWordData: null,
    activeTense: 'present',
    activeSearchMode: 'word',
    activeSectionFilter: 'all',
    availableSections: ['General'],
    musicPlaylist: [],
    currentTrackIndex: -1,
    isShuffle: false,
    isRepeat: false,
    preloadedTrackData: null,
    preloadedTrackIndex: -1,
    isPreloading: false
};

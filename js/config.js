// CONFIGURACIÓN DE GOOGLE SHEETS (Sincronización en la nube)
export const GOOGLE_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbyqu9-JonYa2H3F-SJaGDvjV1HGIYklsMncrJIqHk5jrA4F-fZWbF7RWb0UMXg0Z0Hu/exec';

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
    isPreloading: false,
    activeMusicSource: 'radio', // Can be 'api-lofi', 'api-ambient', 'radio', 'radio-jpop', or 'drive'
    activeAudioId: 'music-audio-direct' // Set to music-audio-direct initially since radio is the default
};

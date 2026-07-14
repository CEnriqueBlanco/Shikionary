// CONFIGURACIÓN DE GOOGLE SHEETS (Sincronización en la nube)
export const GOOGLE_SHEETS_URL = 'https://script.google.com/macros/s/AKfycby3u0tDvYrgjmevA59kFKAHn3ePazoQML6e3ZkyePtXqnfBjjSZ6H87mGAH418ADmUf/exec';

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
    activeAudioId: 'music-audio-direct', // Set to music-audio-direct initially since radio is the default
    translationPair: localStorage.getItem('shike_lang_pair') || 'en|es',
    currentUser: localStorage.getItem('shike_user') || ''
};

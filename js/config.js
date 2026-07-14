// CONFIGURACIÓN DE GOOGLE SHEETS (Sincronización en la nube)
export const GOOGLE_SHEETS_URL = 'https://script.google.com/macros/s/AKfycby_7725kBueBhzeqAounhv4DySflAVO1OrRsWMK-tp-bwc6KthM86J8vzg5_1QRC0tV/exec';

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

// CONFIGURACIÓN DE GOOGLE SHEETS (Sincronización en la nube)
// Reemplaza esto con el enlace de tu Web App de Google Apps Script (termina en /exec)
const GOOGLE_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbwliI-YwdoEO4C8QZMs9CHgv7HtAOQRt3-b_QIWNQa5GZpTVf_ERBhXOF5rPapJ8dbI/exec';

// CONFIGURACIÓN DE GITHUB (Opcional - Alternativa)
const GITHUB_TOKEN = 'PEGA_TU_TOKEN_AQUI'; 
const GITHUB_USERNAME = 'CEnriqueBlanco';
const GITHUB_REPO = 'Shikionary';
const GITHUB_BRANCH = 'main';

// Global State
let savedWords = [];
let gitConfig = null;
let fileSha = null; // Store the SHA of words.json required for GitHub API updates
let activeWordData = null; // Store the last translated word info
let activeTense = 'present'; // Store currently selected tense (present, past, future)
let activeSearchMode = 'word'; // Store search mode: 'word' or 'phrase'
let activeSectionFilter = 'all'; // Filter words: 'all' or specific section name
let availableSections = ['General']; // List of available sections
let musicPlaylist = [];
let currentTrackIndex = -1;
let isShuffle = false;
let isRepeat = false;
let preloadedTrackData = null;
let preloadedTrackIndex = -1;
let isPreloading = false;

// DOM Elements
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const btnClear = document.getElementById('btn-clear');
const btnSubmit = document.getElementById('btn-submit');
const resultCard = document.getElementById('result-card');
const welcomeCard = document.getElementById('welcome-card');
const loadingSpinner = document.getElementById('loading-spinner');

// Card elements
const resultWordEn = document.getElementById('result-word-en');
const resultPhonetic = document.getElementById('result-phonetic');
const btnAudio = document.getElementById('btn-audio');
const audioPronunciation = document.getElementById('audio-pronunciation');
const resultWordEs = document.getElementById('result-word-es');
const examplesList = document.getElementById('examples-list');
const saveSectionSelect = document.getElementById('save-section-select');
const btnSaveWord = document.getElementById('btn-save-word');
const searchSuggestions = document.getElementById('search-suggestions');

// Sidebar and list elements
const vocabularyList = document.getElementById('vocabulary-list');
const savedCount = document.getElementById('saved-count');
const filterInput = document.getElementById('filter-input');
const filterSectionSelect = document.getElementById('filter-section-select');
const divergenceMeter = document.getElementById('divergence-meter');

// Login and Theme elements
const btnThemeToggle = document.getElementById('btn-theme-toggle');
const loginScreen = document.getElementById('login-screen');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const syncStatus = document.getElementById('sync-status');
const syncStatusText = document.getElementById('sync-status-text');

// Music Player Elements
const musicAudio = document.getElementById('music-audio');
const btnPlayPause = document.getElementById('btn-play-pause');
const btnPrevTrack = document.getElementById('btn-prev-track');
const btnNextTrack = document.getElementById('btn-next-track');
const btnShuffle = document.getElementById('btn-shuffle');
const btnRepeat = document.getElementById('btn-repeat');
const progressBar = document.getElementById('progress-bar');
const volumeBar = document.getElementById('volume-bar');
const currentTimeEl = document.getElementById('current-time');
const totalTimeEl = document.getElementById('total-time');
const currentTrackNameEl = document.getElementById('current-track-name');
const playlistSelect = document.getElementById('playlist-select');
const musicTrackCount = document.getElementById('music-track-count');

// Initialize App
window.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    initEventListeners();
    loadWordsData();
    loadMusicData();
});

// Event Listeners Initialization
function initEventListeners() {
    // Search form submit
    searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const query = searchInput.value.trim();
        if (query) translateWord(query);
    });

    // Search Mode Toggle click (Word vs Phrase)
    const modeButtons = document.querySelectorAll('.btn-mode');
    modeButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            modeButtons.forEach(b => b.classList.remove('active'));
            const clickedBtn = e.target.closest('.btn-mode');
            clickedBtn.classList.add('active');
            activeSearchMode = clickedBtn.getAttribute('data-mode');
            
            if (activeSearchMode === 'phrase') {
                searchInput.placeholder = "Escribe una frase u oración en inglés...";
            } else {
                searchInput.placeholder = "Escribe una palabra en inglés...";
            }
            searchInput.focus();
        });
    });

    // Tense tabs click using event delegation
    document.addEventListener('click', (e) => {
        const tab = e.target.closest('.tab-tense');
        if (tab) {
            const tabs = document.querySelectorAll('.tab-tense');
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const newTense = tab.getAttribute('data-tense');
            if (newTense !== activeTense) {
                activeTense = newTense;
                if (activeWordData) {
                    changeTenseForActiveWord(activeTense);
                }
            }
        }
    });

    // Clear search input & Autocomplete suggestions as user types using Datamuse API
    let suggestionsTimeout;
    searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim();
        btnClear.style.display = searchInput.value ? 'block' : 'none';

        clearTimeout(suggestionsTimeout);
        const lowerQuery = query.toLowerCase();

        if (lowerQuery.length > 0) {
            suggestionsTimeout = setTimeout(async () => {
                try {
                    const response = await fetch(`https://api.datamuse.com/sug?s=${encodeURIComponent(lowerQuery)}`);
                    if (response.ok) {
                        const matches = await response.json();
                        const slicedMatches = matches.slice(0, 5);
                        
                        if (slicedMatches.length > 0) {
                            searchSuggestions.innerHTML = '';
                            slicedMatches.forEach(match => {
                                const div = document.createElement('div');
                                div.className = 'suggestion-item';
                                div.innerHTML = `
                                    <span>${match.word}</span>
                                    <span class="suggestion-translation"><i class="fa-solid fa-language"></i> Traducir</span>
                                `;
                                div.addEventListener('click', () => {
                                    searchInput.value = match.word;
                                    searchSuggestions.style.display = 'none';
                                    translateWord(match.word);
                                });
                                searchSuggestions.appendChild(div);
                            });
                            searchSuggestions.style.display = 'block';
                        } else {
                            searchSuggestions.style.display = 'none';
                        }
                    }
                } catch (err) {
                    console.error('Error fetching suggestions:', err);
                }
            }, 300);
        } else {
            searchSuggestions.style.display = 'none';
        }
    });

    btnClear.addEventListener('click', () => {
        searchInput.value = '';
        btnClear.style.display = 'none';
        searchSuggestions.style.display = 'none'; // Hide suggestions
        searchInput.focus();
    });

    // Close suggestions dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !searchSuggestions.contains(e.target)) {
            searchSuggestions.style.display = 'none';
        }
    });

    // Save word button click
    btnSaveWord.addEventListener('click', () => {
        if (activeWordData) {
            toggleSaveWord(activeWordData);
        }
    });

    // Audio button click
    btnAudio.addEventListener('click', () => {
        if (audioPronunciation.src) {
            audioPronunciation.play().catch(err => console.log('Audio playback error:', err));
        }
    });

    // Filtering vocabulary list
    filterInput.addEventListener('input', (e) => {
        renderVocabularyList(e.target.value.trim());
    });

    // Filter section select change
    filterSectionSelect.addEventListener('change', (e) => {
        activeSectionFilter = e.target.value;
        renderVocabularyList(filterInput.value.trim());
    });

    // Save section select change (create new section)
    saveSectionSelect.addEventListener('change', (e) => {
        if (e.target.value === 'new-section') {
            const newSec = prompt('Escribe el nombre de la nueva sección:');
            if (newSec && newSec.trim() !== '') {
                const cleanedSec = newSec.trim();
                if (!availableSections.includes(cleanedSec)) {
                    availableSections.push(cleanedSec);
                    updateSectionDropdowns();
                }
                saveSectionSelect.value = cleanedSec;
            } else {
                saveSectionSelect.value = 'General';
            }
        }
    });

    // Theme Toggle click
    btnThemeToggle.addEventListener('click', () => {
        const isDark = document.body.classList.toggle('dark-mode');
        const icon = btnThemeToggle.querySelector('i');
        if (isDark) {
            icon.className = 'fa-solid fa-sun';
            localStorage.setItem('kurisu_theme', 'dark');
        } else {
            icon.className = 'fa-solid fa-moon';
            localStorage.setItem('kurisu_theme', 'light');
        }
    });

    // Login form submit handler
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value.trim();
        
        if (username === 'Shike' && password === 'gasaipedro1') {
            localStorage.setItem('shike_authenticated', 'true');
            loginScreen.style.display = 'none';
        } else {
            loginError.style.display = 'block';
        }
    });

    // Initialize music player event listeners
    initMusicPlayerListeners();
}

// Settings management (Initialize Git config automatically)
function loadSettings() {
    // Load theme preference
    const savedTheme = localStorage.getItem('kurisu_theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        const icon = btnThemeToggle.querySelector('i');
        if (icon) icon.className = 'fa-solid fa-sun';
    }

    // Check Authentication state
    const isAuthenticated = localStorage.getItem('shike_authenticated');
    if (isAuthenticated === 'true') {
        loginScreen.style.display = 'none';
    } else {
        loginScreen.style.display = 'flex';
    }

    // Check configuration priority
    if (GOOGLE_SHEETS_URL && GOOGLE_SHEETS_URL !== 'PEGA_TU_ENLACE_DE_GOOGLE_APPS_SCRIPT_AQUI') {
        updateSyncStatus('configured');
    } else if (GITHUB_TOKEN && GITHUB_TOKEN !== 'PEGA_TU_TOKEN_AQUI') {
        gitConfig = {
            username: GITHUB_USERNAME,
            repo: GITHUB_REPO,
            branch: GITHUB_BRANCH,
            token: GITHUB_TOKEN
        };
        updateSyncStatus('configured');
    } else {
        gitConfig = null;
        updateSyncStatus('local');
    }
}

// Update UI Sincronización Status Bar
function updateSyncStatus(status, message = '') {
    syncStatus.className = 'sync-status';
    
    const isGoogle = GOOGLE_SHEETS_URL && GOOGLE_SHEETS_URL !== 'PEGA_TU_ENLACE_DE_GOOGLE_APPS_SCRIPT_AQUI';
    const targetService = isGoogle ? 'Google Sheets' : 'GitHub';
    
    if (status === 'local') {
        syncStatus.classList.add('local-mode');
        syncStatus.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <span id="sync-status-text">Guardado local activo (No sincronizado con ${targetService})</span>`;
    } else if (status === 'syncing') {
        syncStatus.classList.add('syncing');
        syncStatus.innerHTML = `<i class="fa-solid fa-arrows-rotate fa-spin"></i> <span id="sync-status-text">Sincronizando con ${targetService}...</span>`;
    } else if (status === 'synced') {
        syncStatus.classList.add('synced');
        syncStatus.innerHTML = `<i class="fa-solid fa-cloud-check"></i> <span id="sync-status-text">Sincronizado con ${targetService} con éxito</span>`;
    } else if (status === 'configured') {
        syncStatus.classList.add('synced');
        syncStatus.innerHTML = `<i class="fa-solid fa-circle-check"></i> <span id="sync-status-text">Conectado a ${targetService}</span>`;
    } else if (status === 'error') {
        syncStatus.classList.add('error');
        syncStatus.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <span id="sync-status-text">Error: ${message || `No se pudo sincronizar con ${targetService}`}</span>`;
    }
}

// Load Words Data from Google Sheets, GitHub or localStorage
async function loadWordsData() {
    const isGoogle = GOOGLE_SHEETS_URL && GOOGLE_SHEETS_URL !== 'PEGA_TU_ENLACE_DE_GOOGLE_APPS_SCRIPT_AQUI';
    
    if (isGoogle) {
        updateSyncStatus('syncing');
        try {
            const response = await fetch(GOOGLE_SHEETS_URL);
            if (response.ok) {
                savedWords = await response.json();
                localStorage.setItem('kurisu_words_backup', JSON.stringify(savedWords));
                updateSyncStatus('synced');
            } else {
                throw new Error('Servidor retornó código de error');
            }
        } catch (err) {
            console.error('Error loading data from Google Sheets:', err);
            const backup = localStorage.getItem('kurisu_words_backup');
            savedWords = backup ? JSON.parse(backup) : [];
            updateSyncStatus('error', 'Error de conexión con Google Sheets. Usando respaldo local.');
        }
    } else if (gitConfig) {
        updateSyncStatus('syncing');
        try {
            let data = await fetchFromGitHub('Traductor/words.json');
            if (!data) {
                data = await fetchFromGitHub('words.json');
            }
            
            if (data) {
                savedWords = JSON.parse(data.content);
                fileSha = data.sha;
                localStorage.setItem('kurisu_words_backup', JSON.stringify(savedWords));
                updateSyncStatus('synced');
            } else {
                savedWords = [];
                fileSha = null;
                updateSyncStatus('synced', 'Base de datos vacía inicializada');
            }
        } catch (err) {
            console.error('Error loading data from GitHub:', err);
            const backup = localStorage.getItem('kurisu_words_backup');
            savedWords = backup ? JSON.parse(backup) : [];
            updateSyncStatus('error', 'Error de conexión. Usando respaldo local.');
        }
    } else {
        // Local mode
        const localData = localStorage.getItem('kurisu_local_words');
        savedWords = localData ? JSON.parse(localData) : [];
        updateSyncStatus('local');
    }
    
    // Extract unique sections from loaded words
    availableSections = ['General'];
    savedWords.forEach(w => {
        if (w.section && w.section.trim() !== '' && !availableSections.includes(w.section)) {
            availableSections.push(w.section);
        }
    });
    updateSectionDropdowns();
    
    renderVocabularyList();
}

// Save Words Data to Google Sheets, GitHub or localStorage
async function saveWordsData() {
    const isGoogle = GOOGLE_SHEETS_URL && GOOGLE_SHEETS_URL !== 'PEGA_TU_ENLACE_DE_GOOGLE_APPS_SCRIPT_AQUI';
    
    if (isGoogle) {
        updateSyncStatus('syncing');
        try {
            await fetch(GOOGLE_SHEETS_URL, {
                method: 'POST',
                mode: 'no-cors', // Prevents CORS preflight block
                headers: {
                    'Content-Type': 'text/plain'
                },
                body: JSON.stringify(savedWords)
            });
            // Since mode: 'no-cors' does not let us read the status, we assume success after fetch resolves
            localStorage.setItem('kurisu_words_backup', JSON.stringify(savedWords));
            updateSyncStatus('synced');
        } catch (err) {
            console.error('Error saving data to Google Sheets:', err);
            updateSyncStatus('error', 'Error de conexión con Google Sheets.');
        }
    } else if (gitConfig) {
        updateSyncStatus('syncing');
        try {
            const path = window.loadedPath || 'Traductor/words.json';
            const sha = await writeToGitHub(path, JSON.stringify(savedWords, null, 2), fileSha);
            if (sha) {
                fileSha = sha;
            }
            localStorage.setItem('kurisu_words_backup', JSON.stringify(savedWords));
            updateSyncStatus('synced');
        } catch (err) {
            console.error('Error saving data to GitHub:', err);
            updateSyncStatus('error', 'Error al guardar. Cambios guardados localmente.');
            localStorage.setItem('kurisu_words_backup', JSON.stringify(savedWords));
        }
    } else {
        localStorage.setItem('kurisu_local_words', JSON.stringify(savedWords));
        updateSyncStatus('local');
    }
    
    renderVocabularyList(filterInput.value.trim());
}

// GitHub API Helpers
async function fetchFromGitHub(filePath) {
    const url = `https://api.github.com/repos/${gitConfig.username}/${gitConfig.repo}/contents/${filePath}?ref=${gitConfig.branch}`;
    const headers = {
        'Authorization': `token ${gitConfig.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Cache-Control': 'no-cache'
    };
    
    try {
        const response = await fetch(url, { headers });
        if (response.status === 404) {
            return null; // File not found
        }
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        // Decode base64 content
        // We use decodeURIComponent(escape(atob(content))) to support UTF-8 special characters (Spanish accents) correctly!
        const decodedContent = decodeURIComponent(escape(window.atob(data.content.replace(/\s/g, ''))));
        
        window.loadedPath = filePath; // Save loaded path
        return {
            content: decodedContent,
            sha: data.sha
        };
    } catch (e) {
        if (filePath === 'Traductor/words.json') {
            // Let caller try root words.json
            return null;
        }
        throw e;
    }
}

async function writeToGitHub(filePath, content, sha) {
    const url = `https://api.github.com/repos/${gitConfig.username}/${gitConfig.repo}/contents/${filePath}`;
    const headers = {
        'Authorization': `token ${gitConfig.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
    };
    
    // Encode UTF-8 safely to base64
    const base64Content = btoa(unescape(encodeURIComponent(content)));
    
    const body = {
        message: `Actualización de vocabulario: ${savedWords.length} palabras`,
        content: base64Content,
        branch: gitConfig.branch
    };
    
    if (sha) {
        body.sha = sha;
    }
    
    const response = await fetch(url, {
        method: 'PUT',
        headers,
        body: JSON.stringify(body)
    });
    
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data.content.sha;
}

// Helper to generate structured sentences (Affirmative, Negative, Interrogative) by Tense
function getStructuredTemplates(word, partOfSpeech, tense = 'present') {
    const w = word.toLowerCase().trim();
    const pos = partOfSpeech ? partOfSpeech.toLowerCase() : 'noun';
    
    // Check if it's a multi-word phrase (contains spaces)
    if (w.includes(' ')) {
        if (tense === 'past') {
            return [
                { type: 'Afirmativo', en: `Yesterday, he decided to ${w}.` },
                { type: 'Negativo', en: `We did not need to ${w} last week.` },
                { type: 'Interrogativo', en: `Did you have to ${w} in that situation?` }
            ];
        } else if (tense === 'future') {
            return [
                { type: 'Afirmativo', en: `I think you will have to ${w} tomorrow.` },
                { type: 'Negativo', en: `They will not try to ${w} next time.` },
                { type: 'Interrogativo', en: `Will we need to ${w} in the future?` }
            ];
        } else { // present
            return [
                { type: 'Afirmativo', en: `It is important to ${w} when learning.` },
                { type: 'Negativo', en: `You do not need to ${w} in this case.` },
                { type: 'Interrogativo', en: `Do you think it is normal to ${w}?` }
            ];
        }
    }
    
    if (pos === 'verb') {
        if (tense === 'past') {
            return [
                { type: 'Afirmativo', en: `He decided to ${w} the documents yesterday.` },
                { type: 'Negativo', en: `We did not ${w} the goal last week.` },
                { type: 'Interrogativo', en: `Did you ${w} that yesterday?` }
            ];
        } else if (tense === 'future') {
            return [
                { type: 'Afirmativo', en: `I will ${w} the project tomorrow.` },
                { type: 'Negativo', en: `They will not ${w} the truth next time.` },
                { type: 'Interrogativo', en: `Will you ${w} this lesson later?` }
            ];
        } else { // present
            return [
                { type: 'Afirmativo', en: `I always try to ${w} and learn new things.` },
                { type: 'Negativo', en: `She does not ${w} in her spare time.` },
                { type: 'Interrogativo', en: `Do you want to ${w} this project?` }
            ];
        }
    } else if (pos === 'adjective') {
        if (tense === 'past') {
            return [
                { type: 'Afirmativo', en: `That lecture was very ${w} yesterday.` },
                { type: 'Negativo', en: `The initial plan was not ${w} at all.` },
                { type: 'Interrogativo', en: `Was the explanation clear and ${w}?` }
            ];
        } else if (tense === 'future') {
            return [
                { type: 'Afirmativo', en: `This new system will be very ${w}.` },
                { type: 'Negativo', en: `The next exam will not be ${w}.` },
                { type: 'Interrogativo', en: `Will it be ${w} to complete this task?` }
            ];
        } else { // present
            return [
                { type: 'Afirmativo', en: `This topic is very ${w} for the project.` },
                { type: 'Negativo', en: `The overall results were not ${w} enough.` },
                { type: 'Interrogativo', en: `Is the explanation clear and ${w}?` }
            ];
        }
    } else { // noun or anything else
        if (tense === 'past') {
            return [
                { type: 'Afirmativo', en: `He bought a new ${w} yesterday.` },
                { type: 'Negativo', en: `We did not have a ${w} last year.` },
                { type: 'Interrogativo', en: `Where was the ${w} yesterday?` }
            ];
        } else if (tense === 'future') {
            return [
                { type: 'Afirmativo', en: `We will buy a new ${w} tomorrow.` },
                { type: 'Negativo', en: `There will not be any ${w} next week.` },
                { type: 'Interrogativo', en: `Will you need a ${w} for the trip?` }
            ];
        } else { // present
            return [
                { type: 'Afirmativo', en: `We need a good ${w} to finish the job.` },
                { type: 'Negativo', en: `There is no ${w} available right now.` },
                { type: 'Interrogativo', en: `Do you know where the ${w} is?` }
            ];
        }
    }
}

// Generate examples array and translate them in real-time
async function generateAndTranslateExamples(word, partOfSpeech, tense) {
    const templates = getStructuredTemplates(word, partOfSpeech, tense);
    let examples = [];
    
    for (const temp of templates) {
        let exampleEs = '';
        try {
            const exTransUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(temp.en)}&langpair=en|es`;
            const exTransRes = await fetch(exTransUrl);
            if (exTransRes.ok) {
                const exTransData = await exTransRes.json();
                exampleEs = exTransData.responseData.translatedText;
            }
        } catch (e) {
            console.log('Error translating example:', e);
            exampleEs = 'Traducción no disponible';
        }
        examples.push({
            type: temp.type,
            en: temp.en,
            es: exampleEs
        });
    }
    return examples;
}

// Switch examples tense for currently displayed word
async function changeTenseForActiveWord(tense) {
    if (!activeWordData) return;
    
    examplesList.innerHTML = '<li style="border-left: none; text-align: center; background: none; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Generando ejemplos en ' + (tense === 'present' ? 'presente' : tense === 'past' ? 'pasado' : 'futuro') + '...</li>';
    
    let examples = [];
    if (tense === 'present' && activeWordData.realExamples && activeWordData.realExamples.length > 0) {
        examples = activeWordData.realExamples;
    } else {
        examples = await generateAndTranslateExamples(activeWordData.wordEn, activeWordData.partOfSpeech, tense);
    }
    
    activeWordData.examples = examples;
    renderActiveWordExamples();
}

// Render only the examples list on the result card
function renderActiveWordExamples() {
    examplesList.innerHTML = '';
    if (activeWordData && activeWordData.examples) {
        activeWordData.examples.forEach(ex => {
            const li = document.createElement('li');
            const typeClass = ex.type ? ex.type.toLowerCase() : 'afirmativo';
            li.innerHTML = `
                <span class="example-type ${typeClass}">${ex.type || 'Afirmativo'}</span>
                <span class="example-en">${ex.en}</span>
                <span class="example-es">${ex.es}</span>
            `;
            examplesList.appendChild(li);
        });
    }
}

// Translator Engine: translate English word to Spanish, fetch details and examples
async function translateWord(word) {
    word = word.trim().toLowerCase();
    showLoading(true);
    
    activeWordData = null;
    
    try {
        // 1. Fetch Translation (English to Spanish) from MyMemory
        const translationUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|es`;
        const transResponse = await fetch(translationUrl);
        let translationText = '';
        if (transResponse.ok) {
            const transData = await transResponse.json();
            translationText = transData.responseData.translatedText;
            if (translationText.toLowerCase() === word) {
                translationText = '(Traducción no encontrada)';
            }
        } else {
            translationText = 'Error al obtener traducción';
        }

        // 2. Fetch Dictionary Details (Pronunciation and Examples) from Free Dictionary API (Only for single words)
        let phoneticText = '';
        let audioUrl = '';
        let partOfSpeech = 'noun';
        let realExamples = [];

        if (activeSearchMode === 'word' && !word.includes(' ')) {
            const dictUrl = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
            const dictResponse = await fetch(dictUrl);
            
            if (dictResponse.ok) {
                const dictData = await dictResponse.json();
                const entry = dictData[0];
                
                // Extract phonetic string
                phoneticText = entry.phonetic || '';
                if (!phoneticText && entry.phonetics && entry.phonetics.length > 0) {
                    phoneticText = entry.phonetics.find(p => p.text)?.text || '';
                }

                // Extract audio pronunciation
                if (entry.phonetics && entry.phonetics.length > 0) {
                    const audioObj = entry.phonetics.find(p => p.audio && p.audio.trim() !== '');
                    if (audioObj) {
                        audioUrl = audioObj.audio;
                    }
                }
                
                // Get first part of speech
                if (entry.meanings && entry.meanings.length > 0) {
                    partOfSpeech = entry.meanings[0].partOfSpeech || 'noun';
                }
                
                // Extract real examples from Dictionary API
                let rawExamples = [];
                for (const item of dictData) {
                    if (!item.meanings) continue;
                    for (const meaning of item.meanings) {
                        if (!meaning.definitions) continue;
                        for (const def of meaning.definitions) {
                            if (def.example && def.example.trim() !== '') {
                                rawExamples.push({
                                    type: meaning.partOfSpeech || 'Ejemplo',
                                    en: def.example.trim()
                                });
                            }
                        }
                    }
                }
                
                // Remove duplicates
                const seen = new Set();
                const uniqueRawExamples = [];
                for (const ex of rawExamples) {
                    const norm = ex.en.toLowerCase();
                    if (!seen.has(norm)) {
                        seen.add(norm);
                        uniqueRawExamples.push(ex);
                    }
                }
                
                // Translate first 3 examples in parallel
                const selectedExamples = uniqueRawExamples.slice(0, 3);
                if (selectedExamples.length > 0) {
                    const translationPromises = selectedExamples.map(async (ex) => {
                        let translatedEs = 'Traducción no disponible';
                        try {
                            const exTransUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(ex.en)}&langpair=en|es`;
                            const exTransRes = await fetch(exTransUrl);
                            if (exTransRes.ok) {
                                const exTransData = await exTransRes.json();
                                translatedEs = exTransData.responseData.translatedText;
                            }
                        } catch (e) {
                            console.log('Error translating real example:', e);
                        }
                        return {
                            type: ex.type,
                            en: ex.en,
                            es: translatedEs,
                            isReal: true
                        };
                    });
                    
                    realExamples = await Promise.all(translationPromises);
                }
            }
        }

        // Use real examples if found, otherwise generate fallback structured templates
        const examples = realExamples.length > 0 ? realExamples : await generateAndTranslateExamples(word, partOfSpeech, activeTense);

        // Set the active word data
        activeWordData = {
            wordEn: word,
            wordEs: translationText,
            phonetic: phoneticText,
            audio: audioUrl,
            partOfSpeech: partOfSpeech,
            examples: examples,
            realExamples: realExamples
        };

        // Render result card
        displayResult(activeWordData);

    } catch (error) {
        console.error('Translation error:', error);
        alert('Ocurrió un error al consultar los servidores de traducción.');
    } finally {
        showLoading(false);
    }
}

// Display Result Card
function displayResult(data) {
    resultWordEn.textContent = data.wordEn;
    resultPhonetic.textContent = data.phonetic || '/--/';
    resultWordEs.textContent = data.wordEs;
    
    // Audio configuration
    if (data.audio) {
        audioPronunciation.src = data.audio;
        btnAudio.style.display = 'inline-flex';
    } else {
        audioPronunciation.removeAttribute('src');
        btnAudio.style.display = 'none';
    }

    // Sync tabs UI to activeTense
    const tabs = document.querySelectorAll('.tab-tense');
    tabs.forEach(t => {
        if (t.getAttribute('data-tense') === activeTense) {
            t.classList.add('active');
        } else {
            t.classList.remove('active');
        }
    });

    // Set Save Section Dropdown to match current word's section (if saved)
    if (data.section) {
        saveSectionSelect.value = data.section;
    } else {
        saveSectionSelect.value = 'General';
    }

    // Render examples list
    renderActiveWordExamples();

    // Update Save button icon/text
    updateSaveButtonState(data.wordEn);

    // Hide welcome, show results card
    welcomeCard.style.display = 'none';
    resultCard.style.display = 'block';
}

function updateSaveButtonState(wordEn) {
    const isSaved = savedWords.some(w => w.wordEn.toLowerCase() === wordEn.toLowerCase());
    if (isSaved) {
        btnSaveWord.innerHTML = '<i class="fa-solid fa-bookmark"></i> Guardada';
        btnSaveWord.classList.remove('btn-accent');
        btnSaveWord.style.backgroundColor = 'var(--text-muted)';
        btnSaveWord.style.color = '#fff';
    } else {
        btnSaveWord.innerHTML = '<i class="fa-regular fa-bookmark"></i> Guardar';
        btnSaveWord.classList.add('btn-accent');
        btnSaveWord.style.backgroundColor = '';
        btnSaveWord.style.color = '';
    }
}

// Toggle Save / Delete Word
function toggleSaveWord(wordData) {
    const index = savedWords.findIndex(w => w.wordEn.toLowerCase() === wordData.wordEn.toLowerCase());
    
    if (index >= 0) {
        // Remove
        savedWords.splice(index, 1);
    } else {
        // Add
        const selectedSec = saveSectionSelect.value || 'General';
        wordData.section = selectedSec;
        savedWords.unshift(wordData);
        
        // Ensure new section is loaded in dropdowns if not present
        if (!availableSections.includes(selectedSec)) {
            availableSections.push(selectedSec);
            updateSectionDropdowns();
        }
    }
    
    updateSaveButtonState(wordData.wordEn);
    saveWordsData();
}

// Render Saved Vocabulary list
function renderVocabularyList(filterText = '') {
    vocabularyList.innerHTML = '';
    
    const filtered = savedWords.filter(w => {
        // 1. Filter by Section
        const wordSec = w.section || 'General';
        if (activeSectionFilter !== 'all' && wordSec !== activeSectionFilter) {
            return false;
        }
        
        // 2. Filter by Search Text
        if (!filterText) return true;
        const text = filterText.toLowerCase();
        return w.wordEn.toLowerCase().includes(text) || w.wordEs.toLowerCase().includes(text);
    });

    savedCount.textContent = savedWords.length;
    updateDivergenceMeter();

    if (filtered.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'empty-list-message';
        emptyMsg.innerHTML = filterText 
            ? `<p>No se encontraron palabras para "${filterText}".</p>` 
            : `<p>No tienes palabras en esta sección.</p>`;
        vocabularyList.appendChild(emptyMsg);
        return;
    }

    filtered.forEach(w => {
        const item = document.createElement('div');
        item.className = 'vocab-item';
        
        // Clicking item displays it in translator panel
        item.addEventListener('click', (e) => {
            if (e.target.closest('.btn-delete-word')) return;
            
            activeWordData = w;
            displayResult(w);
            searchInput.value = w.wordEn;
            btnClear.style.display = 'block';
        });

        item.innerHTML = `
            <div class="vocab-item-word">
                <span class="item-en">${w.wordEn}</span>
                <span class="item-es">${w.itemEs || w.wordEs}</span>
            </div>
            <div class="vocab-item-actions">
                <button class="btn-delete-word" title="Eliminar palabra">
                    <i class="fa-regular fa-trash-can"></i>
                </button>
            </div>
        `;

        // Delete button logic
        const btnDelete = item.querySelector('.btn-delete-word');
        btnDelete.addEventListener('click', () => {
            savedWords = savedWords.filter(item => item.wordEn.toLowerCase() !== w.wordEn.toLowerCase());
            if (activeWordData && activeWordData.wordEn.toLowerCase() === w.wordEn.toLowerCase()) {
                updateSaveButtonState(w.wordEn);
            }
            saveWordsData();
        });

        vocabularyList.appendChild(item);
    });
}

// Update both Select dropdowns (Save Card and Filter Bar)
function updateSectionDropdowns() {
    const currentSaveVal = saveSectionSelect.value;
    saveSectionSelect.innerHTML = '';
    availableSections.forEach(sec => {
        const opt = document.createElement('option');
        opt.value = sec;
        opt.textContent = sec;
        saveSectionSelect.appendChild(opt);
    });
    const newOpt = document.createElement('option');
    newOpt.value = 'new-section';
    newOpt.textContent = '+ Nueva Sección...';
    saveSectionSelect.appendChild(newOpt);
    
    if (availableSections.includes(currentSaveVal)) {
        saveSectionSelect.value = currentSaveVal;
    } else {
        saveSectionSelect.value = 'General';
    }

    const currentFilterVal = filterSectionSelect.value;
    filterSectionSelect.innerHTML = '<option value="all">Todas las secciones</option>';
    availableSections.forEach(sec => {
        const opt = document.createElement('option');
        opt.value = sec;
        opt.textContent = sec;
        filterSectionSelect.appendChild(opt);
    });
    
    if (currentFilterVal === 'all' || availableSections.includes(currentFilterVal)) {
        filterSectionSelect.value = currentFilterVal;
        activeSectionFilter = currentFilterVal;
    } else {
        filterSectionSelect.value = 'all';
        activeSectionFilter = 'all';
    }
}

// Nixie Tube Divergence calculation (Easter Egg!)
function updateDivergenceMeter() {
    const baseDivergence = 1.048596;
    const shiftPerWord = 0.000023;
    const currentDivergence = baseDivergence + (savedWords.length * shiftPerWord);
    divergenceMeter.textContent = currentDivergence.toFixed(6);
}

// Loader helper
function showLoading(isLoading) {
    if (isLoading) {
        loadingSpinner.style.display = 'block';
        welcomeCard.style.display = 'none';
        resultCard.style.display = 'none';
        btnSubmit.disabled = true;
    } else {
        loadingSpinner.style.display = 'none';
        btnSubmit.disabled = false;
    }
}

// Load Music Data from Google Apps Script Web App
async function loadMusicData() {
    playlistSelect.innerHTML = '<option value="">Cargando canciones...</option>';
    musicTrackCount.textContent = '0';
    
    // Check if GOOGLE_SHEETS_URL is configured
    const isGoogle = GOOGLE_SHEETS_URL && GOOGLE_SHEETS_URL !== 'PEGA_TU_ENLACE_DE_GOOGLE_APPS_SCRIPT_AQUI';
    if (!isGoogle) {
        playlistSelect.innerHTML = '<option value="">Apps Script no configurado</option>';
        return;
    }
    
    try {
        const response = await fetch(`${GOOGLE_SHEETS_URL}?action=getMusic`);
        if (response.ok) {
            musicPlaylist = await response.json();
            
            if (musicPlaylist && musicPlaylist.length > 0 && !musicPlaylist.error) {
                musicTrackCount.textContent = musicPlaylist.length;
                playlistSelect.innerHTML = '<option value="">Selecciona una canción...</option>';
                
                musicPlaylist.forEach((track, index) => {
                    const opt = document.createElement('option');
                    opt.value = index;
                    opt.textContent = track.name;
                    playlistSelect.appendChild(opt);
                });
            } else {
                playlistSelect.innerHTML = '<option value="">Carpeta vacía o error en Apps Script</option>';
            }
        } else {
            playlistSelect.innerHTML = '<option value="">Error al cargar música</option>';
        }
    } catch (err) {
        console.error('Error fetching music:', err);
        playlistSelect.innerHTML = '<option value="">Error de conexión</option>';
    }
}

// Initialize Music Player Event Listeners
function initMusicPlayerListeners() {
    // Play/Pause button click
    btnPlayPause.addEventListener('click', togglePlayPause);
    
    // Prev track button click
    btnPrevTrack.addEventListener('click', prevTrack);
    
    // Next track button click
    btnNextTrack.addEventListener('click', nextTrack);

    // Shuffle button click
    btnShuffle.addEventListener('click', () => {
        isShuffle = !isShuffle;
        btnShuffle.classList.toggle('active', isShuffle);
    });
    
    // Repeat button click
    btnRepeat.addEventListener('click', () => {
        isRepeat = !isRepeat;
        btnRepeat.classList.toggle('active', isRepeat);
    });
    
    // Playlist select dropdown change
    playlistSelect.addEventListener('change', (e) => {
        const index = parseInt(e.target.value);
        if (!isNaN(index) && index >= 0 && index < musicPlaylist.length) {
            playTrack(index);
        }
    });
    
    // Update progress bar as audio plays
    musicAudio.addEventListener('timeupdate', () => {
        if (musicAudio.duration) {
            const pct = (musicAudio.currentTime / musicAudio.duration) * 100;
            progressBar.value = pct;
            currentTimeEl.textContent = formatTime(musicAudio.currentTime);
            
            // Preload the next track when current song reaches 80% progress
            if (pct > 80) {
                triggerNextTrackPreload();
            }
        }
    });
    
    // Track duration loaded
    musicAudio.addEventListener('durationchange', () => {
        if (musicAudio.duration) {
            totalTimeEl.textContent = formatTime(musicAudio.duration);
        }
    });
    
    // Click on progress bar to scrub
    progressBar.addEventListener('input', (e) => {
        if (musicAudio.duration) {
            const time = (e.target.value / 100) * musicAudio.duration;
            musicAudio.currentTime = time;
        }
    });
    
    // Volume bar change
    volumeBar.addEventListener('input', (e) => {
        const vol = e.target.value / 100;
        musicAudio.volume = vol;
    });
    
    // Auto-advance to next track when song ends
    musicAudio.addEventListener('ended', nextTrack);
}

// Play a specific track index
async function playTrack(index) {
    if (index < 0 || index >= musicPlaylist.length) return;
    
    // Stop any current playback immediately
    musicAudio.pause();
    
    currentTrackIndex = index;
    playlistSelect.value = index;
    
    const track = musicPlaylist[index];
    currentTrackNameEl.textContent = "Cargando canción...";
    
    try {
        let base64Data;
        if (preloadedTrackIndex === index && preloadedTrackData) {
            base64Data = preloadedTrackData;
            // Clear preload cache
            preloadedTrackData = null;
            preloadedTrackIndex = -1;
        } else {
            // Fetch the audio file as Base64 from Google Apps Script to bypass Google Drive's strict CORS/cookie restrictions
            const response = await fetch(`${GOOGLE_SHEETS_URL}?action=getTrack&id=${track.id}`);
            if (!response.ok) throw new Error("Network response was not ok");
            base64Data = await response.text();
        }
        
        // Check if the server returned an error message instead of audio data
        if (base64Data.trim().startsWith('error:') || base64Data.trim().startsWith('{"error"')) {
            throw new Error("Server error: " + base64Data);
        }
        
        // Clean Base64 string by removing quotes, newlines, and invalid characters
        base64Data = base64Data.trim();
        if (base64Data.startsWith('"') && base64Data.endsWith('"')) {
            base64Data = base64Data.slice(1, -1);
        }
        base64Data = base64Data.replace(/[^A-Za-z0-9\+\/\=]/g, "");
        
        // Convert Base64 to Blob
        const sliceSize = 1024;
        const byteCharacters = atob(base64Data);
        const byteArrays = [];
        
        for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
            const slice = byteCharacters.slice(offset, offset + sliceSize);
            const byteNumbers = new Array(slice.length);
            for (let i = 0; i < slice.length; i++) {
                byteNumbers[i] = slice.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            byteArrays.push(byteArray);
        }
        
        const blob = new Blob(byteArrays, { type: track.mimeType || 'audio/mpeg' });
        
        // Revoke old URL if exists to free memory
        if (musicAudio.src && musicAudio.src.startsWith('blob:')) {
            URL.revokeObjectURL(musicAudio.src);
        }
        
        const blobUrl = URL.createObjectURL(blob);
        musicAudio.src = blobUrl;
        
        currentTrackNameEl.textContent = track.name;
        
        // Play audio
        musicAudio.play()
            .then(() => {
                btnPlayPause.innerHTML = '<i class="fa-solid fa-pause"></i>';
                btnPlayPause.className = 'btn-player-control btn-play';
            })
            .catch(err => {
                if (err.name !== 'AbortError') {
                    console.error('Playback error:', err);
                    currentTrackNameEl.textContent = "Error al reproducir canción";
                }
            });
            
        // Preload next track
        triggerNextTrackPreload();
    } catch (error) {
        console.error('Error fetching track:', error);
        if (error.message.includes('máximo') || error.message.includes('supera') || error.message.includes('size')) {
            currentTrackNameEl.textContent = "Canción muy grande (>25MB)";
        } else {
            currentTrackNameEl.textContent = "Error al cargar desde Drive";
        }
    }
}

// Toggle Play/Pause state
function togglePlayPause() {
    if (currentTrackIndex === -1 && musicPlaylist.length > 0) {
        playTrack(0);
        return;
    }
    
    if (musicAudio.paused) {
        musicAudio.play()
            .then(() => {
                btnPlayPause.innerHTML = '<i class="fa-solid fa-pause"></i>';
            })
            .catch(err => console.error(err));
    } else {
        musicAudio.pause();
        btnPlayPause.innerHTML = '<i class="fa-solid fa-play"></i>';
    }
}

// Skip to next track
function nextTrack() {
    if (musicPlaylist.length === 0) return;
    
    if (isRepeat) {
        playTrack(currentTrackIndex);
        return;
    }
    
    if (isShuffle) {
        const randomIndex = Math.floor(Math.random() * musicPlaylist.length);
        playTrack(randomIndex);
        return;
    }
    
    let nextIndex = currentTrackIndex + 1;
    if (nextIndex >= musicPlaylist.length) {
        nextIndex = 0; // Loop back to start
    }
    playTrack(nextIndex);
}

// Go to previous track
function prevTrack() {
    if (musicPlaylist.length === 0) return;
    
    if (isShuffle) {
        const randomIndex = Math.floor(Math.random() * musicPlaylist.length);
        playTrack(randomIndex);
        return;
    }
    
    let prevIndex = currentTrackIndex - 1;
    if (prevIndex < 0) {
        prevIndex = musicPlaylist.length - 1; // Go to end
    }
    playTrack(prevIndex);
}

// Helper to format seconds into MM:SS
function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

// Get the index of the next track depending on Shuffle / Repeat state
function getNextTrackIndex() {
    if (musicPlaylist.length === 0) return -1;
    if (isRepeat) return currentTrackIndex;
    if (isShuffle) {
        if (musicPlaylist.length === 1) return 0;
        let randomIndex = currentTrackIndex;
        while (randomIndex === currentTrackIndex) {
            randomIndex = Math.floor(Math.random() * musicPlaylist.length);
        }
        return randomIndex;
    }
    let nextIndex = currentTrackIndex + 1;
    if (nextIndex >= musicPlaylist.length) {
        nextIndex = 0;
    }
    return nextIndex;
}

// Trigger background preload for the next song
function triggerNextTrackPreload() {
    const nextIndex = getNextTrackIndex();
    if (nextIndex !== -1 && nextIndex !== preloadedTrackIndex) {
        preloadTrack(nextIndex);
    }
}

// Fetch track base64 data in the background and store it in cache
async function preloadTrack(index) {
    if (index < 0 || index >= musicPlaylist.length) return;
    if (isPreloading || preloadedTrackIndex === index) return;
    
    isPreloading = true;
    try {
        const track = musicPlaylist[index];
        const response = await fetch(`${GOOGLE_SHEETS_URL}?action=getTrack&id=${track.id}`);
        if (response.ok) {
            const base64Data = await response.text();
            if (!base64Data.trim().startsWith('error:') && !base64Data.trim().startsWith('{"error"')) {
                preloadedTrackData = base64Data;
                preloadedTrackIndex = index;
                console.log(`[Preloader] Track "${track.name}" preloaded successfully in background.`);
            }
        }
    } catch (err) {
        console.error('[Preloader] Error preloading track:', err);
    } finally {
        isPreloading = false;
    }
}

// Global State
let savedWords = [];
let gitConfig = null;
let fileSha = null; // Store the SHA of words.json required for GitHub API updates
let activeWordData = null; // Store the last translated word info
let activeTense = 'present'; // Store currently selected tense (present, past, future)

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
const btnSaveWord = document.getElementById('btn-save-word');

// Sidebar and list elements
const vocabularyList = document.getElementById('vocabulary-list');
const savedCount = document.getElementById('saved-count');
const filterInput = document.getElementById('filter-input');
const divergenceMeter = document.getElementById('divergence-meter');

// Settings modal and theme elements
const btnThemeToggle = document.getElementById('btn-theme-toggle');
const btnSettings = document.getElementById('btn-settings');
const settingsModal = document.getElementById('settings-modal');
const btnCloseSettings = document.getElementById('btn-close-settings');
const settingsForm = document.getElementById('settings-form');
const btnClearSettings = document.getElementById('btn-clear-settings');
const syncStatus = document.getElementById('sync-status');
const syncStatusText = document.getElementById('sync-status-text');

// Initialize App
window.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    initEventListeners();
    loadWordsData();
});

// Event Listeners Initialization
function initEventListeners() {
    // Search form submit
    searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const query = searchInput.value.trim();
        if (query) translateWord(query);
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

    // Clear search input
    searchInput.addEventListener('input', () => {
        btnClear.style.display = searchInput.value ? 'block' : 'none';
    });

    btnClear.addEventListener('click', () => {
        searchInput.value = '';
        btnClear.style.display = 'none';
        searchInput.focus();
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

    // Settings Modal toggles
    btnSettings.addEventListener('click', () => {
        openSettingsModal();
    });

    btnCloseSettings.addEventListener('click', () => {
        closeSettingsModal();
    });

    // Close modal on overlay click
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            closeSettingsModal();
        }
    });

    // Settings form submit
    settingsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        saveSettings();
    });

    // Clear settings
    btnClearSettings.addEventListener('click', () => {
        clearSettings();
    });
}

// Settings management (localStorage for credentials)
function loadSettings() {
    // Load theme preference
    const savedTheme = localStorage.getItem('kurisu_theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        const icon = btnThemeToggle.querySelector('i');
        if (icon) icon.className = 'fa-solid fa-sun';
    }

    const savedConfig = localStorage.getItem('kurisu_git_config');
    if (savedConfig) {
        gitConfig = JSON.parse(savedConfig);
        document.getElementById('github-username').value = gitConfig.username || '';
        document.getElementById('github-repo').value = gitConfig.repo || '';
        document.getElementById('github-branch').value = gitConfig.branch || 'main';
        document.getElementById('github-token').value = gitConfig.token || '';
        updateSyncStatus('configured');
    } else {
        updateSyncStatus('local');
    }
}

function saveSettings() {
    const username = document.getElementById('github-username').value.trim();
    const repo = document.getElementById('github-repo').value.trim();
    const branch = document.getElementById('github-branch').value.trim() || 'main';
    const token = document.getElementById('github-token').value.trim();

    if (!username || !repo || !token) {
        alert('Por favor, rellene todos los campos obligatorios.');
        return;
    }

    gitConfig = { username, repo, branch, token };
    localStorage.setItem('kurisu_git_config', JSON.stringify(gitConfig));
    closeSettingsModal();
    updateSyncStatus('syncing');
    loadWordsData();
}

function clearSettings() {
    if (confirm('¿Estás seguro de que deseas desconectar la sincronización de GitHub? Se usará el almacenamiento local.')) {
        localStorage.removeItem('kurisu_git_config');
        gitConfig = null;
        fileSha = null;
        
        // Reset settings form fields
        document.getElementById('github-username').value = '';
        document.getElementById('github-repo').value = '';
        document.getElementById('github-branch').value = 'main';
        document.getElementById('github-token').value = '';
        
        closeSettingsModal();
        updateSyncStatus('local');
        
        // Reload words from localStorage
        loadWordsData();
    }
}

function openSettingsModal() {
    settingsModal.style.display = 'flex';
}

function closeSettingsModal() {
    settingsModal.style.display = 'none';
}

// Update UI Sincronización Status Bar
function updateSyncStatus(status, message = '') {
    syncStatus.className = 'sync-status';
    
    if (status === 'local') {
        syncStatus.classList.add('local-mode');
        syncStatusText.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Guardado local activo (No sincronizado con GitHub)';
    } else if (status === 'syncing') {
        syncStatus.classList.add('syncing');
        syncStatusText.innerHTML = '<i class="fa-solid fa-arrows-rotate fa-spin"></i> Sincronizando con GitHub...';
    } else if (status === 'synced') {
        syncStatus.classList.add('synced');
        syncStatusText.innerHTML = '<i class="fa-solid fa-cloud-check"></i> Sincronizado con GitHub con éxito';
    } else if (status === 'configured') {
        syncStatus.classList.add('synced');
        syncStatusText.innerHTML = '<i class="fa-solid fa-circle-check"></i> Conectado a GitHub';
    } else if (status === 'error') {
        syncStatus.classList.add('error');
        syncStatusText.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Error: ${message || 'No se pudo sincronizar'}`;
    }
}

// Load Words Data from GitHub or localStorage
async function loadWordsData() {
    if (gitConfig) {
        updateSyncStatus('syncing');
        try {
            // We try loading words.json first from Traductor/words.json then from words.json (root)
            let data = await fetchFromGitHub('Traductor/words.json');
            if (!data) {
                data = await fetchFromGitHub('words.json');
            }
            
            if (data) {
                savedWords = JSON.parse(data.content);
                fileSha = data.sha;
                localStorage.setItem('kurisu_words_backup', JSON.stringify(savedWords)); // Always keep a local copy
                updateSyncStatus('synced');
            } else {
                // If file does not exist, initialize empty array
                savedWords = [];
                fileSha = null;
                updateSyncStatus('synced', 'Base de datos vacía inicializada');
            }
        } catch (err) {
            console.error('Error loading data from GitHub:', err);
            // Fallback to local backup
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
    
    renderVocabularyList();
}

// Save Words Data to GitHub or localStorage
async function saveWordsData() {
    if (gitConfig) {
        updateSyncStatus('syncing');
        try {
            // Determine path to write to: if fileSha was loaded from words.json, write to words.json, else default to Traductor/words.json
            // Let's check which path we should write to. We'll write to 'Traductor/words.json' by default, or 'words.json'.
            // To be extremely consistent, let's write to whichever path we successfully loaded, or default to 'Traductor/words.json'
            let writePath = 'Traductor/words.json';
            
            // Let's verify where the file was originally loaded. If we had loaded words.json, we can check.
            // Actually, we can check if file is at root or in Traductor/ directory. Let's write to both, or choose path.
            // Let's just try to update Traductor/words.json, and if it fails or if fileSha belongs to root, update root.
            // Let's remember the path we loaded. We will store it in window.loadedPath.
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
    
    renderVocabularyList();
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
    const w = word.toLowerCase();
    const pos = partOfSpeech ? partOfSpeech.toLowerCase() : 'noun';
    
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
    
    const examples = await generateAndTranslateExamples(activeWordData.wordEn, activeWordData.partOfSpeech, tense);
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

        // 2. Fetch Dictionary Details (Pronunciation and Examples) from Free Dictionary API
        const dictUrl = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
        const dictResponse = await fetch(dictUrl);
        
        let phoneticText = '';
        let audioUrl = '';
        let partOfSpeech = 'noun';

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
        }

        // Generate customized examples for the selected tense (Affirmative, Negative, Interrogative)
        const examples = await generateAndTranslateExamples(word, partOfSpeech, activeTense);

        // Set the active word data
        activeWordData = {
            wordEn: word,
            wordEs: translationText,
            phonetic: phoneticText,
            audio: audioUrl,
            partOfSpeech: partOfSpeech,
            examples: examples
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
        savedWords.unshift(wordData);
    }
    
    updateSaveButtonState(wordData.wordEn);
    saveWordsData();
}

// Render Saved Vocabulary list
function renderVocabularyList(filterText = '') {
    vocabularyList.innerHTML = '';
    
    const filtered = savedWords.filter(w => {
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
            : `<p>No tienes palabras guardadas en esta línea temporal.</p>`;
        vocabularyList.appendChild(emptyMsg);
        return;
    }

    filtered.forEach(w => {
        const item = document.createElement('div');
        item.className = 'vocab-item';
        
        // Clicking item displays it in translator panel
        item.addEventListener('click', (e) => {
            // Prevent display trigger if delete button is clicked
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

// Nixie Tube Divergence calculation (Easter Egg!)
// 1.048596 is the Steins;Gate worldline. Each saved word alters divergence.
function updateDivergenceMeter() {
    const baseDivergence = 1.048596;
    const shiftPerWord = 0.000023; // Tiny shift per saved word
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

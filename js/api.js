import { GOOGLE_SHEETS_URL, state } from './config.js';

// Update UI Sincronización Status Bar
export function updateSyncStatus(status, message = '') {
    const syncStatus = document.getElementById('sync-status');
    if (!syncStatus) return;
    
    syncStatus.className = 'sync-status';
    const targetService = 'Google Sheets';
    
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

// Load Words Data from Google Sheets or localStorage
export async function loadWordsData(callbacks = {}) {
    const isGoogle = GOOGLE_SHEETS_URL && GOOGLE_SHEETS_URL !== 'PEGA_TU_ENLACE_DE_GOOGLE_APPS_SCRIPT_AQUI';
    
    if (isGoogle) {
        updateSyncStatus('syncing');
        try {
            const response = await fetch(GOOGLE_SHEETS_URL);
            if (response.ok) {
                state.savedWords = await response.json();
                localStorage.setItem('kurisu_words_backup', JSON.stringify(state.savedWords));
                updateSyncStatus('synced');
            } else {
                throw new Error('Servidor retornó código de error');
            }
        } catch (err) {
            console.error('Error loading data from Google Sheets:', err);
            const backup = localStorage.getItem('kurisu_words_backup');
            state.savedWords = backup ? JSON.parse(backup) : [];
            updateSyncStatus('error', 'Error de conexión con Google Sheets. Usando respaldo local.');
        }
    } else {
        // Local mode
        const localData = localStorage.getItem('kurisu_local_words');
        state.savedWords = localData ? JSON.parse(localData) : [];
        updateSyncStatus('local');
    }
    
    // Extract unique sections from loaded words
    state.availableSections = ['General'];
    state.savedWords.forEach(w => {
        if (w.section && w.section.trim() !== '' && !state.availableSections.includes(w.section)) {
            state.availableSections.push(w.section);
        }
    });
    
    if (callbacks.updateSectionDropdowns) callbacks.updateSectionDropdowns();
    if (callbacks.renderVocabularyList) callbacks.renderVocabularyList();
}

// Save Words Data to Google Sheets or localStorage
export async function saveWordsData(callbacks = {}) {
    const isGoogle = GOOGLE_SHEETS_URL && GOOGLE_SHEETS_URL !== 'PEGA_TU_ENLACE_DE_GOOGLE_APPS_SCRIPT_AQUI';
    
    if (isGoogle) {
        updateSyncStatus('syncing');
        try {
            await fetch(GOOGLE_SHEETS_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: {
                    'Content-Type': 'text/plain'
                },
                body: JSON.stringify(state.savedWords)
            });
            localStorage.setItem('kurisu_words_backup', JSON.stringify(state.savedWords));
            updateSyncStatus('synced');
        } catch (err) {
            console.error('Error saving data to Google Sheets:', err);
            updateSyncStatus('error', 'Error de conexión con Google Sheets.');
        }
    } else {
        localStorage.setItem('kurisu_local_words', JSON.stringify(state.savedWords));
        updateSyncStatus('local');
    }
    
    if (callbacks.renderVocabularyList) callbacks.renderVocabularyList();
}

// Translator Engine: translate English word to Spanish, fetch details and examples
export async function translateWord(word, callbacks = {}) {
    word = word.trim().toLowerCase();
    if (callbacks.showLoading) callbacks.showLoading(true);
    
    state.activeWordData = null;
    
    try {
        let isWordInDictionary = false;
        
        // 1. Fetch Translation (English to Spanish) from MyMemory
        const translationUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|es`;
        const transResponse = await fetch(translationUrl);
        let translationText = '';
        if (transResponse.ok) {
            const transData = await transResponse.json();
            translationText = transData.responseData.translatedText;
        } else {
            translationText = 'Error al obtener traducción';
        }

        // 2. Fetch Dictionary Details (Pronunciation and Examples) from Free Dictionary API (Only for single words)
        let phoneticText = '';
        let audioUrl = '';
        let partOfSpeech = 'noun';
        let realExamples = [];
        let baseSentence = null;
        let meanings = [];

        if (state.activeSearchMode === 'word' && !word.includes(' ')) {
            const dictUrl = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
            const dictResponse = await fetch(dictUrl);
            
            if (dictResponse.ok) {
                isWordInDictionary = true;
                const dictData = await dictResponse.json();
                const entry = dictData[0];
                
                phoneticText = entry.phonetic || '';
                if (!phoneticText && entry.phonetics && entry.phonetics.length > 0) {
                    phoneticText = entry.phonetics.find(p => p.text)?.text || '';
                }

                if (entry.phonetics && entry.phonetics.length > 0) {
                    const audioObj = entry.phonetics.find(p => p.audio && p.audio.trim() !== '');
                    if (audioObj) {
                        audioUrl = audioObj.audio;
                    }
                }
                
                if (entry.meanings && entry.meanings.length > 0) {
                    partOfSpeech = entry.meanings[0].partOfSpeech || 'noun';
                    
                    meanings = entry.meanings.map(m => {
                        return {
                            partOfSpeech: m.partOfSpeech || '',
                            definitions: m.definitions ? m.definitions.map(d => d.definition).slice(0, 2) : [],
                            synonyms: m.synonyms || []
                        };
                    });
                }
                
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
                
                const seen = new Set();
                const uniqueRawExamples = [];
                for (const ex of rawExamples) {
                    const norm = ex.en.toLowerCase();
                    if (!seen.has(norm)) {
                        seen.add(norm);
                        uniqueRawExamples.push(ex);
                    }
                }
                
                if (uniqueRawExamples.length > 0) {
                    baseSentence = uniqueRawExamples[0].en;
                }
                
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

        // Validate translation vs source word (support identical loanwords like gadget -> gadget)
        if (translationText.toLowerCase() === word.toLowerCase()) {
            if (state.activeSearchMode === 'word' && !word.includes(' ')) {
                if (!isWordInDictionary) {
                    translationText = '(Traducción no encontrada)';
                }
            } else {
                translationText = '(Traducción no encontrada)';
            }
        }

        // Generate customized examples for all tenses
        let examples = [];
        if (callbacks.generateAndTranslateExamples) {
            examples = await callbacks.generateAndTranslateExamples(word, partOfSpeech, state.activeTense, baseSentence);
        }

        // Check if this word is already saved to load its existing notes
        const savedWord = state.savedWords.find(w => w.wordEn.toLowerCase() === word.toLowerCase());
        const existingNotes = savedWord ? (savedWord.notes || '') : '';

        // Set the active word data
        state.activeWordData = {
            wordEn: word,
            wordEs: translationText,
            phonetic: phoneticText,
            audio: audioUrl,
            partOfSpeech: partOfSpeech,
            baseSentence: baseSentence,
            examples: examples,
            realExamples: realExamples,
            meanings: meanings,
            notes: existingNotes,
            section: savedWord ? (savedWord.section || 'General') : 'General'
        };

        if (callbacks.displayResult) callbacks.displayResult(state.activeWordData);

    } catch (error) {
        console.error('Translation error:', error);
        alert('Ocurrió un error al consultar los servidores de traducción.');
    } finally {
        if (callbacks.showLoading) callbacks.showLoading(false);
    }
}

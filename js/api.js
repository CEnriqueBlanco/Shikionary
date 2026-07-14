import { GOOGLE_SHEETS_URL, state } from './config.js';
import { showAlert } from './modal.js';

function parseStoredWords(rawValue) {
    if (!rawValue) return [];
    try {
        const parsed = JSON.parse(rawValue);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.warn('Ignoring invalid locally stored vocabulary:', error.message);
        return [];
    }
}

function selectAmericanPronunciation(entries) {
    const safeEntries = Array.isArray(entries) ? entries : [];
    const phonetics = safeEntries.flatMap(entry => entry.phonetics || []);
    const isUsAudio = item => item.audio?.trim() && /[-_]us\.(mp3|ogg|wav)(?:\?|$)/i.test(item.audio);
    const isUkAudio = item => item.audio?.trim() && /[-_]uk\.(mp3|ogg|wav)(?:\?|$)/i.test(item.audio);
    const audioItem = phonetics.find(isUsAudio)
        || phonetics.find(item => item.audio?.trim() && !isUkAudio(item))
        || phonetics.find(item => item.audio?.trim());
    const matchingEntry = safeEntries.find(entry => (entry.phonetics || []).includes(audioItem)) || safeEntries[0] || {};
    const phonetic = audioItem?.text
        || matchingEntry.phonetic
        || matchingEntry.phonetics?.find(item => item.text)?.text
        || phonetics.find(item => item.text)?.text
        || '';

    return { phonetic, audio: audioItem?.audio || '' };
}

function inferSavedLangpair(word, fallbackPair) {
    if (word.langpair) return word.langpair;

    let audio = '';
    try {
        audio = typeof word.audio === 'string' ? decodeURIComponent(word.audio).toLocaleLowerCase() : '';
    } catch {
        audio = String(word.audio || '').toLocaleLowerCase();
    }
    const learnedLanguage = audio.includes('dictionaryapi.dev') || /\/en\//i.test(audio)
        ? 'en'
        : (audio.includes('wikimedia.org') ? 'de' : '');
    if (!learnedLanguage) return fallbackPair;

    const normalize = value => String(value || '').toLocaleLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]/gu, '');
    const normalizedAudio = normalize(audio);
    const source = normalize(word.wordEn);
    const translation = normalize(word.wordEs);
    if (translation && normalizedAudio.includes(translation)) return `es|${learnedLanguage}`;
    if (source && normalizedAudio.includes(source)) return `${learnedLanguage}|es`;
    return fallbackPair;
}

export async function fetchGermanWiktionaryAudio(word) {
    if (!word || word.includes(' ')) return '';

    try {
        const apiBase = 'https://de.wiktionary.org/w/api.php';
        const filesUrl = `${apiBase}?action=parse&page=${encodeURIComponent(word)}&prop=images&format=json&origin=*`;
        const filesResponse = await fetch(filesUrl);
        if (!filesResponse.ok) return '';

        const filesData = await filesResponse.json();
        const files = filesData?.parse?.images || [];
        const audioFile = files.find(file => /\.(ogg|oga|mp3|wav)$/i.test(file));
        if (!audioFile) return '';

        const audioInfoUrl = `${apiBase}?action=query&titles=${encodeURIComponent(`File:${audioFile}`)}&prop=imageinfo&iiprop=url&format=json&origin=*`;
        const audioInfoResponse = await fetch(audioInfoUrl);
        if (!audioInfoResponse.ok) return '';

        const audioInfoData = await audioInfoResponse.json();
        const page = Object.values(audioInfoData?.query?.pages || {})[0];
        return page?.imageinfo?.[0]?.url || '';
    } catch (error) {
        console.warn('Wiktionary audio unavailable:', error.message);
        return '';
    }
}

export async function fetchWordPronunciation(word, langCode) {
    if (!word || word.includes(' ')) return { phonetic: '', audio: '' };
    if (langCode === 'de') {
        return { phonetic: '', audio: await fetchGermanWiktionaryAudio(word) };
    }
    if (langCode !== 'en') return { phonetic: '', audio: '' };

    try {
        const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
        if (!response.ok) return { phonetic: '', audio: '' };
        const entries = await response.json();
        return selectAmericanPronunciation(entries);
    } catch (error) {
        console.warn('Dictionary pronunciation unavailable:', error.message);
        return { phonetic: '', audio: '' };
    }
}

export async function fetchAlternativeDescription(word, langCode) {
    if (!word || !langCode) return '';

    try {
        // English Wiktionary exposes structured entries for many languages;
        // their definition text is in English, which we then show in Spanish.
        const url = `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`;
        const response = await fetch(url);
        if (!response.ok) return '';
        const data = await response.json();
        const languageEntries = data[langCode] || [];
        const rawDefinition = languageEntries
            .flatMap(entry => entry.definitions || [])
            .find(item => item.definition)?.definition;
        if (!rawDefinition) return '';

        const parsed = new DOMParser().parseFromString(rawDefinition, 'text/html');
        const englishDefinition = parsed.body.textContent?.trim() || '';
        if (!englishDefinition) return '';

        const translationUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(englishDefinition)}&langpair=en|es`;
        const translationResponse = await fetch(translationUrl);
        if (!translationResponse.ok) return englishDefinition;
        const translationData = await translationResponse.json();
        return translationData.responseData?.translatedText?.trim() || englishDefinition;
    } catch (error) {
        console.warn('Alternative definition unavailable:', error.message);
        return '';
    }
}

export async function generatePairExamples(word, langpair, tense = 'present') {
    const fromCode = langpair.split('|')[0];
    const templates = {
        es: {
            present: [
                `Hoy trabajo con ${word} en este proyecto.`,
                `No puedo continuar sin ${word}.`,
                `¿Dónde puedo encontrar ${word}?`
            ],
            past: [
                `Ayer trabajé con ${word} en este proyecto.`,
                `No pude continuar sin ${word}.`,
                `¿Dónde encontraste ${word}?`
            ],
            future: [
                `Mañana trabajaré con ${word} en este proyecto.`,
                `No podré continuar sin ${word}.`,
                `¿Dónde encontrarás ${word}?`
            ]
        },
        de: {
            present: [
                `Heute arbeite ich mit ${word} an diesem Projekt.`,
                `Ohne ${word} kann ich nicht weitermachen.`,
                `Wo kann ich ${word} finden?`
            ],
            past: [
                `Gestern habe ich mit ${word} an diesem Projekt gearbeitet.`,
                `Ohne ${word} konnte ich nicht weitermachen.`,
                `Wo hast du ${word} gefunden?`
            ],
            future: [
                `Morgen werde ich mit ${word} an diesem Projekt arbeiten.`,
                `Ohne ${word} werde ich nicht weitermachen können.`,
                `Wo wirst du ${word} finden?`
            ]
        },
        en: {
            present: [
                `Today I am working with ${word} on this project.`,
                `I cannot continue without ${word}.`,
                `Where can I find ${word}?`
            ],
            past: [
                `Yesterday I worked with ${word} on this project.`,
                `I could not continue without ${word}.`,
                `Where did you find ${word}?`
            ],
            future: [
                `Tomorrow I will work with ${word} on this project.`,
                `I will not be able to continue without ${word}.`,
                `Where will you find ${word}?`
            ]
        }
    };
    const types = ['Afirmativo', 'Negativo', 'Interrogativo'];
    const sentences = templates[fromCode]?.[tense] || templates.en[tense] || templates.en.present;

    return Promise.all(sentences.map(async (src, index) => {
        let translated = src;
        try {
            const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(src)}&langpair=${langpair}`;
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                const candidate = data.responseData?.translatedText;
                if (candidate && candidate.toLowerCase() !== src.toLowerCase()) translated = candidate;
            }
        } catch (error) {
            console.warn('Example translation unavailable:', error.message);
        }
        return { type: types[index], en: src, es: translated };
    }));
}

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

// User Registration API Call
export async function registerUserAPI(username, password) {
    if (!GOOGLE_SHEETS_URL) return { success: false, message: 'URL de Google Sheets no configurada.' };
    try {
        const response = await fetch(GOOGLE_SHEETS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action: 'register', username, password })
        });
        if (response.ok) {
            return await response.json();
        }
        return { success: false, message: 'Servidor no disponible.' };
    } catch (e) {
        console.error(e);
        return { success: false, message: 'Error de conexión.' };
    }
}

// User Login API Call
export async function loginUserAPI(username, password) {
    if (!GOOGLE_SHEETS_URL) return { success: false, message: 'URL de Google Sheets no configurada.' };
    try {
        const response = await fetch(GOOGLE_SHEETS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action: 'login', username, password })
        });
        if (response.ok) {
            return await response.json();
        }
        return { success: false, message: 'Servidor no disponible.' };
    } catch (e) {
        console.error(e);
        return { success: false, message: 'Error de conexión.' };
    }
}

// Load Words Data from Google Sheets or localStorage
export async function loadWordsData(callbacks = {}) {
    const isGoogle = GOOGLE_SHEETS_URL && GOOGLE_SHEETS_URL !== 'PEGA_TU_ENLACE_DE_GOOGLE_APPS_SCRIPT_AQUI';
    
    if (isGoogle && state.currentUser) {
        updateSyncStatus('syncing');
        try {
            const url = `${GOOGLE_SHEETS_URL}?action=load&username=${encodeURIComponent(state.currentUser)}`;
            const response = await fetch(url);
            if (response.ok) {
                const remoteWords = await response.json();
                if (!Array.isArray(remoteWords)) throw new Error('El servidor devolvió datos de vocabulario inválidos');
                const previousBackup = parseStoredWords(localStorage.getItem(`kurisu_words_backup_${state.currentUser}`));
                state.savedWords = remoteWords.map(word => {
                    const cached = previousBackup.find(item =>
                        item.wordEn?.toLocaleLowerCase() === word.wordEn?.toLocaleLowerCase()
                        && item.wordEs?.toLocaleLowerCase() === word.wordEs?.toLocaleLowerCase()
                    );
                    return {
                        ...word,
                        langpair: word.langpair || cached?.langpair || inferSavedLangpair(word, state.translationPair || 'en|es')
                    };
                });
                localStorage.setItem(`kurisu_words_backup_${state.currentUser}`, JSON.stringify(state.savedWords));
                updateSyncStatus('synced');
            } else {
                throw new Error('Servidor retornó código de error');
            }
        } catch (err) {
            console.error('Error loading data from Google Sheets:', err);
            const backup = localStorage.getItem(`kurisu_words_backup_${state.currentUser}`);
            state.savedWords = parseStoredWords(backup);
            updateSyncStatus('error', 'Error de conexión con Google Sheets. Usando respaldo local.');
        }
    } else {
        // Local mode
        const localKey = state.currentUser ? `kurisu_local_words_${state.currentUser}` : 'kurisu_local_words';
        const localData = localStorage.getItem(localKey);
        state.savedWords = parseStoredWords(localData);
        state.savedWords.forEach(word => {
            word.langpair = inferSavedLangpair(word, state.translationPair || 'en|es');
        });
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
    
    if (isGoogle && state.currentUser) {
        updateSyncStatus('syncing');
        try {
            await fetch(GOOGLE_SHEETS_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: {
                    'Content-Type': 'text/plain'
                },
                body: JSON.stringify({
                    action: 'save',
                    username: state.currentUser,
                    words: state.savedWords
                })
            });
            localStorage.setItem(`kurisu_words_backup_${state.currentUser}`, JSON.stringify(state.savedWords));
            updateSyncStatus('synced');
        } catch (err) {
            console.error('Error saving data to Google Sheets:', err);
            updateSyncStatus('error', 'Error de conexión con Google Sheets.');
        }
    } else {
        const localKey = state.currentUser ? `kurisu_local_words_${state.currentUser}` : 'kurisu_local_words';
        localStorage.setItem(localKey, JSON.stringify(state.savedWords));
        updateSyncStatus('local');
    }
    
    if (callbacks.renderVocabularyList) callbacks.renderVocabularyList();
}

// Translator Engine: translate English/German word to Spanish, fetch details and examples
export async function translateWord(word, callbacks = {}) {
    word = word.trim().toLowerCase();
    if (callbacks.showLoading) callbacks.showLoading(true);
    
    state.activeWordData = null;
    
    try {
        let isWordInDictionary = false;
        
        // 1. Fetch Translation using active translation pair from MyMemory
        const langpair = state.translationPair || 'en|es';
        const translationUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=${langpair}`;
        const transResponse = await fetch(translationUrl);
        let translationText = '';
        let translationAlternatives = [];
        if (transResponse.ok) {
            const transData = await transResponse.json();
            
            // Try to find the best match from the matches array.
            // MyMemory's responseData can sometimes return garbage from user contributions.
            // We pick the highest-quality match that:
            //   1. Is not equal to the source word
            //   2. For single-word searches, preferably is also a single word (avoids "hola como estas?")
            let bestMatch = null;
            if (transData.matches && transData.matches.length > 0) {
                const sorted = [...transData.matches].sort((a, b) => parseFloat(b.quality) - parseFloat(a.quality));
                const isSingleWord = !word.includes(' ');
                
                if (isSingleWord) {
                    // Prefer a direct lexical translation. MyMemory sometimes
                    // gives compounds a slightly higher score (for example,
                    // "Zuhause-Gefühl" instead of "Haus" for "casa").
                    bestMatch = sorted.find(m => {
                        const t = m.translation ? m.translation.trim() : '';
                        return t
                            && t.toLowerCase() !== word.toLowerCase()
                            && /^[\p{L}\p{M}]+$/u.test(t);
                    });

                    // Allow compounds only when no simple dictionary word exists.
                    if (!bestMatch) {
                        bestMatch = sorted.find(m => {
                            const t = m.translation ? m.translation.trim() : '';
                            return t && t.toLowerCase() !== word.toLowerCase() && !t.includes(' ');
                        });
                    }

                    // Finally fall back to a phrase when that is all the API has.
                    if (!bestMatch) {
                        bestMatch = sorted.find(m => m.translation && m.translation.trim().toLowerCase() !== word.toLowerCase());
                    }
                } else {
                    bestMatch = sorted.find(m => m.translation && m.translation.trim().toLowerCase() !== word.toLowerCase());
                }
            }
            
            if (bestMatch) {
                translationText = bestMatch.translation.trim();
            } else {
                translationText = transData.responseData.translatedText;
            }

            const targetLanguage = langpair.split('|')[1];
            const candidates = [translationText, ...(transData.matches || [])
                .filter(match => parseFloat(match.quality) >= 50)
                .map(match => match.translation?.trim())];
            const seenTranslations = new Set();
            translationAlternatives = candidates
                .filter(Boolean)
                .map(candidate => {
                    if (/^[A-ZÀ-Þ]{2,}$/u.test(candidate)) {
                        return candidate.charAt(0) + candidate.slice(1).toLocaleLowerCase(targetLanguage);
                    }
                    return candidate;
                })
                .filter(candidate => {
                    const normalized = candidate.toLocaleLowerCase(targetLanguage);
                    if (normalized === word.toLocaleLowerCase(langpair.split('|')[0]) || seenTranslations.has(normalized)) return false;
                    seenTranslations.add(normalized);
                    return true;
                })
                .slice(0, 5);
        } else {
            translationText = 'Error al obtener traducción';
        }

        // 2. Fetch Dictionary Details (Only for English single words)
        let phoneticText = '';
        let audioUrl = '';
        let partOfSpeech = 'noun';
        let realExamples = [];
        let baseSentence = null;
        let meanings = [];

        const [fromCode, toCode] = langpair.split('|');
        const englishLookupWord = fromCode === 'en'
            ? word
            : (toCode === 'en' ? translationText.trim().toLowerCase() : '');

        // DictionaryAPI only supports English. Query either the English source
        // or an English translation (for example, Spanish -> English).
        if (englishLookupWord && state.activeSearchMode === 'word' && !englishLookupWord.includes(' ')) {
            const dictUrl = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(englishLookupWord)}`;
            const dictResponse = await fetch(dictUrl);
            
            if (dictResponse.ok) {
                isWordInDictionary = true;
                const dictData = await dictResponse.json();
                const entry = dictData[0];
                const pronunciation = selectAmericanPronunciation(dictData);
                phoneticText = pronunciation.phonetic;
                audioUrl = pronunciation.audio;
                
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

        const germanLookupWord = fromCode === 'de'
            ? word
            : (toCode === 'de' ? translationText.trim() : '');

        if (!audioUrl && germanLookupWord && state.activeSearchMode === 'word') {
            audioUrl = await fetchGermanWiktionaryAudio(germanLookupWord);
        }

        // Validate translation vs source word
        if (translationText.toLowerCase() === word.toLowerCase()) {
            if (state.activeSearchMode === 'word' && !word.includes(' ')) {
                if (!isWordInDictionary) {
                    translationText = '(Traducción no encontrada)';
                }
            } else {
                translationText = '(Traducción no encontrada)';
            }
        }

        // Generate customized examples
        let examples = [];
        if (langpair === 'en|es' && callbacks.generateAndTranslateExamples) {
            // English to Spanish: use the full NLP template generator
            examples = await callbacks.generateAndTranslateExamples(word, partOfSpeech, state.activeTense, baseSentence);
        } else {
            examples = await generatePairExamples(word, langpair, state.activeTense);
        }

        // Check if this word is already saved to load its existing notes
        const savedWord = state.savedWords.find(w =>
            w.wordEn.toLowerCase() === word.toLowerCase()
            && (w.langpair || langpair) === langpair
        );
        const existingNotes = savedWord ? (savedWord.notes || '') : '';

        // Set the active word data
        state.activeWordData = {
            wordEn: word,
            wordEs: translationText,
            translationAlternatives: translationAlternatives,
            phonetic: phoneticText,
            audio: audioUrl,
            partOfSpeech: partOfSpeech,
            baseSentence: baseSentence,
            examples: examples,
            realExamples: realExamples,
            meanings: meanings,
            notes: existingNotes,
            langpair: langpair,
            section: savedWord ? (savedWord.section || 'General') : 'General'
        };

        if (callbacks.displayResult) callbacks.displayResult(state.activeWordData);

    } catch (error) {
        console.error('Translation error:', error);
        showAlert('Ocurrió un error al consultar los servidores de traducción.', 'Error de Red', 'error');

    } finally {
        if (callbacks.showLoading) callbacks.showLoading(false);
    }
}

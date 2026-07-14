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

const ENGLISH_IRREGULAR_VERBS = {
    be: ['am / is / are', 'was / were', 'been'], begin: ['begins', 'began', 'begun'],
    break: ['breaks', 'broke', 'broken'], bring: ['brings', 'brought', 'brought'],
    buy: ['buys', 'bought', 'bought'], come: ['comes', 'came', 'come'],
    do: ['does', 'did', 'done'], drink: ['drinks', 'drank', 'drunk'],
    drive: ['drives', 'drove', 'driven'], eat: ['eats', 'ate', 'eaten'],
    feel: ['feels', 'felt', 'felt'], find: ['finds', 'found', 'found'],
    get: ['gets', 'got', 'gotten'], give: ['gives', 'gave', 'given'],
    go: ['goes', 'went', 'gone'], have: ['has', 'had', 'had'],
    hear: ['hears', 'heard', 'heard'], keep: ['keeps', 'kept', 'kept'],
    know: ['knows', 'knew', 'known'], leave: ['leaves', 'left', 'left'],
    make: ['makes', 'made', 'made'], meet: ['meets', 'met', 'met'],
    read: ['reads', 'read', 'read'], run: ['runs', 'ran', 'run'],
    say: ['says', 'said', 'said'], see: ['sees', 'saw', 'seen'],
    sing: ['sings', 'sang', 'sung'], sit: ['sits', 'sat', 'sat'],
    speak: ['speaks', 'spoke', 'spoken'], take: ['takes', 'took', 'taken'],
    think: ['thinks', 'thought', 'thought'], write: ['writes', 'wrote', 'written']
};

function regularEnglishForms(verb) {
    const doublesFinalConsonant = /^[^aeiou]*[aeiou][^aeiouwxy]$/i.test(verb);
    const thirdPerson = /(?:s|sh|ch|x|z|o)$/i.test(verb) ? `${verb}es`
        : (/[^aeiou]y$/i.test(verb) ? `${verb.slice(0, -1)}ies` : `${verb}s`);
    const past = verb.endsWith('e') ? `${verb}d`
        : (/[^aeiou]y$/i.test(verb) ? `${verb.slice(0, -1)}ied`
            : (doublesFinalConsonant ? `${verb}${verb.slice(-1)}ed` : `${verb}ed`));
    const gerund = verb.endsWith('ie') ? `${verb.slice(0, -2)}ying`
        : (verb.endsWith('e') && !verb.endsWith('ee') ? `${verb.slice(0, -1)}ing`
            : (doublesFinalConsonant ? `${verb}${verb.slice(-1)}ing` : `${verb}ing`));
    return [thirdPerson, past, past, gerund];
}

export async function fetchVerbConjugations(word, langCode, partOfSpeech = '') {
    const term = String(word || '').trim().toLocaleLowerCase(langCode);
    const pos = String(partOfSpeech).toLowerCase();
    if (!term) return { title: '', items: [] };

    if (term.includes(' ')) {
        return {
            title: 'Información de la expresión',
            items: [
                { label: 'Tipo', value: 'Frase o expresión' },
                { label: 'Extensión', value: `${term.split(/\s+/).length} palabras` },
                { label: 'Consejo de uso', value: 'Apréndela como una unidad completa' }
            ]
        };
    }

    if (langCode === 'en') {
        if (pos === 'noun') {
            const irregularPlurals = { child: 'children', foot: 'feet', man: 'men', mouse: 'mice', person: 'people', tooth: 'teeth', woman: 'women' };
            const uncountable = new Set(['advice', 'equipment', 'furniture', 'information', 'knowledge', 'money', 'news', 'research', 'rice', 'water']);
            const plural = uncountable.has(term) ? 'normalmente incontable' : (irregularPlurals[term]
                || (/(?:s|sh|ch|x|z)$/i.test(term) ? `${term}es`
                    : (/[^aeiou]y$/i.test(term) ? `${term.slice(0, -1)}ies` : `${term}s`)));
            const article = /^[aeiou]/i.test(term) ? `an ${term}` : `a ${term}`;
            return { title: 'Información del sustantivo', items: [
                { label: 'Singular', value: term }, { label: 'Plural', value: plural },
                { label: 'Artículo indefinido', value: article }
            ] };
        }
        if (pos === 'adjective') {
            const irregular = { good: ['better', 'best'], bad: ['worse', 'worst'], far: ['farther / further', 'farthest / furthest'] }[term];
            const short = term.length <= 6 && !term.includes('-');
            const doublesFinal = /^[^aeiou]*[aeiou][^aeiouwxy]$/i.test(term);
            const comparative = irregular?.[0] || (short ? (/[^aeiou]y$/i.test(term) ? `${term.slice(0, -1)}ier`
                : (term.endsWith('e') ? `${term}r` : (doublesFinal ? `${term}${term.slice(-1)}er` : `${term}er`))) : `more ${term}`);
            const superlative = irregular?.[1] || (short ? (/[^aeiou]y$/i.test(term) ? `${term.slice(0, -1)}iest`
                : (term.endsWith('e') ? `${term}st` : (doublesFinal ? `${term}${term.slice(-1)}est` : `${term}est`))) : `most ${term}`);
            return { title: 'Grados del adjetivo', items: [
                { label: 'Positivo', value: term }, { label: 'Comparativo', value: comparative },
                { label: 'Superlativo', value: superlative }
            ] };
        }
        if (pos !== 'verb') return { title: 'Información gramatical', items: [{ label: 'Categoría', value: pos || 'Palabra' }] };
        const verb = term;
        const irregular = ENGLISH_IRREGULAR_VERBS[verb];
        const [third, past, participle, gerund] = irregular
            ? [...irregular, verb === 'be' ? 'being' : regularEnglishForms(verb)[3]]
            : regularEnglishForms(verb);
        return { title: 'Conjugación', items: [
            { label: 'Infinitivo', value: `to ${verb}` },
            { label: 'Presente (he/she/it)', value: third },
            { label: 'Pasado', value: past },
            { label: 'Participio pasado', value: participle },
            { label: 'Gerundio', value: gerund }
        ] };
    }

    if (langCode !== 'de') return { title: '', items: [] };
    try {
        const url = `https://de.wiktionary.org/w/api.php?action=parse&page=${encodeURIComponent(word)}&prop=wikitext&format=json&origin=*`;
        const response = await fetch(url);
        if (!response.ok) return { title: '', items: [] };
        const source = (await response.json())?.parse?.wikitext?.['*'] || '';
        const read = key => {
            const match = source.match(new RegExp(`\\|\\s*${key}\\s*=\\s*([^\\n|}]*)`, 'i'));
            return match?.[1]?.replace(/\[\[|\]\]/g, '').replace(/<[^>]+>/g, '').trim() || '';
        };
        if (/Deutsch Verb Übersicht/i.test(source)) return { title: 'Conjugación', items: [
            { label: 'Infinitivo', value: read('Infinitiv') || word },
            { label: 'Presente (ich)', value: read('Präsens_ich') },
            { label: 'Presente (er/sie/es)', value: read('Präsens_er, sie, es') },
            { label: 'Pasado (ich)', value: read('Präteritum_ich') },
            { label: 'Participio II', value: read('Partizip II') },
            { label: 'Imperativo', value: read('Imperativ Singular') }
        ].filter(item => item.value && item.value !== '—') };
        if (/Deutsch Substantiv Übersicht/i.test(source)) {
            const genderCode = read('Genus');
            const gender = { m: 'masculino (der)', f: 'femenino (die)', n: 'neutro (das)' }[genderCode] || genderCode;
            return { title: 'Información del sustantivo', items: [
                { label: 'Género y artículo', value: gender },
                { label: 'Nominativo singular', value: read('Nominativ Singular') || word },
                { label: 'Nominativo plural', value: read('Nominativ Plural') }
            ].filter(item => item.value && item.value !== '—') };
        }
        if (/Deutsch Adjektiv Übersicht/i.test(source)) return { title: 'Grados del adjetivo', items: [
            { label: 'Positivo', value: read('Positiv') || word },
            { label: 'Comparativo', value: read('Komparativ') },
            { label: 'Superlativo', value: read('Superlativ') }
        ].filter(item => item.value && item.value !== '—') };
        return { title: '', items: [] };
    } catch (error) {
        console.warn('German conjugation unavailable:', error.message);
        return { title: '', items: [] };
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
        const learnedLanguage = fromCode === 'es' ? toCode : fromCode;
        const learnedWord = fromCode === 'es' ? translationText.trim() : word;
        const grammar = await fetchVerbConjugations(learnedWord, learnedLanguage, partOfSpeech);

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
            conjugations: grammar.items,
            grammarTitle: grammar.title,
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

import { state } from './config.js';
import { toggleSpeechRecognition } from './voice.js';
import { saveWordsData } from './api.js';
import { showAlert } from './modal.js';

let reviewQueue = [];
let currentReviewIndex = 0;
let isCardFlipped = false;

const BUILTIN_DECKS = {
    'en-a1': { language: 'en', pair: 'en|es', offset: 0, limit: 2000, url: 'https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt' },
    'en-a2': { language: 'en', pair: 'en|es', offset: 2000, limit: 2000, url: 'https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt' },
    'en-b1': { language: 'en', pair: 'en|es', offset: 4000, limit: 2000, url: 'https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt' },
    'en-b2': { language: 'en', pair: 'en|es', offset: 6000, limit: 2000, url: 'https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt' },
    'en-c1': { language: 'en', pair: 'en|es', offset: 8000, limit: 2000, url: 'https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt' },
    'de-a1': { language: 'de', pair: 'de|es', offset: 0, limit: 2000, url: 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2016/de/de_50k.txt' },
    'de-a2': { language: 'de', pair: 'de|es', offset: 2000, limit: 2000, url: 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2016/de/de_50k.txt' },
    'de-b1': { language: 'de', pair: 'de|es', offset: 4000, limit: 2000, url: 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2016/de/de_50k.txt' },
    'de-b2': { language: 'de', pair: 'de|es', offset: 6000, limit: 2000, url: 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2016/de/de_50k.txt' },
    'de-c1': { language: 'de', pair: 'de|es', offset: 8000, limit: 2000, url: 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2016/de/de_50k.txt' }
};

function storageSuffix() {
    return state.currentUser || 'local';
}

function readJson(key, fallback = {}) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
}

function progressKey() { return `shike_deck_progress_${storageSuffix()}`; }
function cacheKey() { return `shike_deck_cache_${storageSuffix()}`; }

async function loadBuiltinDeck(deckId) {
    const config = BUILTIN_DECKS[deckId];
    const response = await fetch(config.url);
    if (!response.ok) throw new Error('No se pudo descargar el mazo');
    const rows = (await response.text()).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const words = rows.map(line => line.split(/\s+/)[0]).filter(word => /^[\p{L}\p{M}'-]+$/u.test(word));
    return words.slice(config.offset, config.offset + config.limit).map((word, index) => ({
        id: `${deckId}-${config.offset + index + 1}`,
        wordEn: word,
        wordEs: '',
        langpair: config.pair,
        examples: [],
        notes: '',
        deckId,
        rank: config.offset + index + 1
    }));
}

function selectScheduledCards(cards, limit) {
    const progress = readJson(progressKey());
    const now = Date.now();
    const due = cards.filter(card => progress[card.id]?.due <= now);
    const fresh = cards.filter(card => !progress[card.id]);
    const pool = [...due.sort((a, b) => progress[a.id].due - progress[b.id].due), ...fresh.sort(() => Math.random() - 0.5)];
    return pool.slice(0, limit);
}

export async function startReviewSession(options = {}) {
    const deckId = options.deck || 'saved';
    const sessionLimit = options.limit || 20;
    let wordsToReview = [];

    if (deckId !== 'saved') {
        try {
            wordsToReview = selectScheduledCards(await loadBuiltinDeck(deckId), sessionLimit);
        } catch (error) {
            showAlert('No se pudo cargar el mazo. Comprueba tu conexión.', 'Biblioteca de tarjetas', 'error');
            return;
        }
        if (wordsToReview.length === 0) {
            showAlert('No hay tarjetas pendientes en este mazo por ahora.', 'Repaso al día', 'success');
            return;
        }
    } else if (state.savedWords.length === 0) {
        showAlert('No tienes palabras guardadas para repasar.', 'Time Loop Review', 'warning');
        return;
    } else {
        wordsToReview = [...state.savedWords];
        if (state.activeSectionFilter !== 'all') {
            wordsToReview = wordsToReview.filter(w => (w.section || 'General') === state.activeSectionFilter);
        }
    }

    if (wordsToReview.length === 0) {
        showAlert('No hay palabras guardadas en la sección seleccionada.', 'Time Loop Review', 'warning');
        return;
    }

    // Shuffle review queue
    reviewQueue = deckId === 'saved' ? wordsToReview.sort(() => Math.random() - 0.5) : wordsToReview;
    currentReviewIndex = 0;
    isCardFlipped = false;

    // Toggle views
    document.querySelector('.app-container').classList.add('in-review');
    document.getElementById('review-screen').style.display = 'flex';
    document.querySelector('.main-workspace').style.display = 'none';
    document.querySelector('.main-header').style.display = 'none';

    renderCurrentReviewCard();
}

export function closeReviewSession() {
    document.querySelector('.app-container').classList.remove('in-review');
    document.getElementById('review-screen').style.display = 'none';
    document.querySelector('.main-workspace').style.display = 'grid';
    document.querySelector('.main-header').style.display = 'flex';
    
    // Clear state
    reviewQueue = [];
}

export function flipReviewCard() {
    const cardInner = document.querySelector('.flashcard-inner');
    if (!cardInner) return;
    
    isCardFlipped = !isCardFlipped;
    cardInner.classList.toggle('flipped', isCardFlipped);
}

export function markReviewWord(success, callbacks = {}) {
    if (reviewQueue.length === 0) return;

    const currentWord = reviewQueue[currentReviewIndex];

    if (currentWord.id) {
        const allProgress = readJson(progressKey());
        const previous = allProgress[currentWord.id] || { interval: 0, correct: 0, wrong: 0 };
        const interval = success ? (previous.interval === 0 ? 1 : Math.min(Math.round(previous.interval * 2.2), 180)) : 0;
        allProgress[currentWord.id] = {
            interval,
            due: Date.now() + interval * 86400000,
            correct: previous.correct + (success ? 1 : 0),
            wrong: previous.wrong + (success ? 0 : 1),
            lastReviewed: Date.now()
        };
        localStorage.setItem(progressKey(), JSON.stringify(allProgress));
    }

    if (success) {
        // Success: remove from the review queue
        reviewQueue.splice(currentReviewIndex, 1);
        
        // Show success animation/sound or just proceed
        showFeedbackEffect(true);
    } else {
        // Fail (Time Loop): move to the end of the queue
        const failedWord = reviewQueue.splice(currentReviewIndex, 1)[0];
        reviewQueue.push(failedWord);
        
        showFeedbackEffect(false);
    }

    // Reset card flip status before rendering next
    isCardFlipped = false;
    const cardInner = document.querySelector('.flashcard-inner');
    if (cardInner) cardInner.classList.remove('flipped');

    // Check if review finished
    if (reviewQueue.length === 0) {
        showAlert('¡Línea Temporal corregida con éxito! Has repasado todas las palabras.', '¡Misión Completada! ✓', 'success').then(() => {
            closeReviewSession();
            if (callbacks.renderVocabularyList) callbacks.renderVocabularyList();
        });
        return;
    }

    // Adjust index if needed
    if (currentReviewIndex >= reviewQueue.length) {
        currentReviewIndex = 0;
    }

    // Wait slightly for transition
    setTimeout(() => {
        renderCurrentReviewCard();
    }, 200);
}

function showFeedbackEffect(isSuccess) {
    const reviewScreen = document.getElementById('review-screen');
    const effectClass = isSuccess ? 'feedback-success' : 'feedback-fail';
    
    reviewScreen.classList.add(effectClass);
    setTimeout(() => {
        reviewScreen.classList.remove(effectClass);
    }, 400);
}

async function enrichBuiltinCard(word) {
    if (!word.id || word.wordEs) return;
    const cache = readJson(cacheKey());
    if (cache[word.id]) {
        word.wordEs = cache[word.id];
        return;
    }
    const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(word.wordEn)}&langpair=${word.langpair}`);
    if (!response.ok) return;
    const translation = (await response.json())?.responseData?.translatedText?.trim();
    if (translation && translation.toLocaleLowerCase() !== word.wordEn.toLocaleLowerCase()) {
        word.wordEs = translation;
        cache[word.id] = translation;
        localStorage.setItem(cacheKey(), JSON.stringify(cache));
    }
}

async function renderCurrentReviewCard() {
    const word = reviewQueue[currentReviewIndex];
    if (!word) return;
    await enrichBuiltinCard(word);

    // Update Progress
    const progressEl = document.getElementById('review-progress-text');
    if (progressEl) {
        progressEl.textContent = `Palabras pendientes: ${reviewQueue.length}`;
    }
    const scheduleHint = document.getElementById('review-schedule-hint');
    if (scheduleHint) scheduleHint.textContent = word.deckId ? `Mazo ${word.deckId.toUpperCase()} · frecuencia #${word.rank}` : 'Mazo personal';

    // Determine source language from the word's saved langpair or fall back to current state
    const wordPair = word.langpair || localStorage.getItem('shike_lang_pair') || 'en|es';
    const fromCode = wordPair.split('|')[0];
    const toCode   = wordPair.split('|')[1];
    const langLabels = { en: 'INGLÉS', de: 'ALEMÁN', es: 'ESPAÑOL', fr: 'FRANCÉS', it: 'ITALIANO' };
    const ttsLang   = { en: 'en-US',  de: 'de-DE',  es: 'es-ES',  fr: 'fr-FR',  it: 'it-IT' };
    const isSrcSpanish = fromCode === 'es';
    const learningCode = isSrcSpanish ? toCode : fromCode;
    const foreignWord = isSrcSpanish ? word.wordEs : word.wordEn;
    const spanishWord = isSrcSpanish ? word.wordEn : (word.wordEs || 'Traducción no disponible');
    const langLabel = langLabels[learningCode] || learningCode.toUpperCase();
    const ttsCode = ttsLang[learningCode] || 'en-US';

    // Update front card label to show correct language
    const frontLabel = document.querySelector('.flashcard-front .flashcard-label');
    if (frontLabel) frontLabel.textContent = `PALABRA EN ${langLabel}`;

    // Render Front Card
    const frontWord = document.getElementById('review-front-word');
    const frontPhonetic = document.getElementById('review-front-phonetic');
    if (frontWord) frontWord.textContent = foreignWord;

    // Only show phonetic if there's real data
    if (frontPhonetic) {
        if (word.phonetic && word.phonetic.trim() !== '' && word.phonetic !== '/--/') {
            frontPhonetic.textContent = word.phonetic;
            frontPhonetic.style.display = 'inline';
        } else {
            frontPhonetic.textContent = '';
            frontPhonetic.style.display = 'none';
        }
    }

    // The review card only plays the recording persisted with this word.
    const reviewAudioBtn = document.getElementById('review-btn-audio');
    if (reviewAudioBtn) {
        const newAudioBtn = reviewAudioBtn.cloneNode(true);
        reviewAudioBtn.parentNode.replaceChild(newAudioBtn, reviewAudioBtn);
        const savedAudioUrl = typeof word.audio === 'string' ? word.audio.trim() : '';
        newAudioBtn.style.display = savedAudioUrl ? 'flex' : 'none';
        newAudioBtn.title = savedAudioUrl
            ? 'Reproducir audio guardado'
            : 'Esta palabra no tiene audio guardado';

        newAudioBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!savedAudioUrl) return;

            const audio = new Audio(savedAudioUrl);
            audio.play().catch(error => {
                console.error('No se pudo reproducir el audio guardado:', savedAudioUrl, error);
            });
        });
    }

    // Render Back Card
    const backTranslation = document.getElementById('review-back-translation');
    const backWordEn = document.getElementById('review-back-word-en');
    const backExamples = document.getElementById('review-back-examples');
    const backNotes = document.getElementById('review-back-notes');
    
    if (backTranslation) backTranslation.textContent = `${spanishWord} / ${foreignWord}`;
    if (backWordEn) {
        backWordEn.textContent = '';
        backWordEn.style.display = 'none';
    }
    
    // Render examples list
    if (backExamples) {
        backExamples.innerHTML = '';
        const examplesToRender = word.examples || [];
        examplesToRender.slice(0, 2).forEach(ex => {
            const li = document.createElement('li');
            const sourceExample = document.createElement('span');
            sourceExample.className = 'review-ex-en';
            sourceExample.textContent = ex.en || '';
            const translatedExample = document.createElement('span');
            translatedExample.className = 'review-ex-es';
            translatedExample.textContent = ex.es || '';
            li.append(sourceExample, translatedExample);
            backExamples.appendChild(li);
        });
    }

    // Render Notes and add listener to update word notes
    if (backNotes) {
        backNotes.value = word.notes || '';
        backNotes.oninput = (e) => {
            word.notes = e.target.value;
            // Update in savedWords
            const wordPair = word.langpair || localStorage.getItem('shike_lang_pair') || 'en|es';
            const mainWord = state.savedWords.find(w =>
                w.wordEn.toLowerCase() === word.wordEn.toLowerCase()
                && (w.langpair || wordPair) === wordPair
            );
            if (mainWord) {
                mainWord.notes = e.target.value;
                // Auto-save debounced or on change
                saveWordsData();
            }
        };
    }

    // Set up voice recognition in review card
    const micBtn = document.getElementById('review-btn-mic');
    const statusFeedback = document.getElementById('review-voice-status');
    
    if (statusFeedback) {
        statusFeedback.textContent = '';
        statusFeedback.className = 'voice-status-feedback';
    }

    if (micBtn) {
        // Clone button to remove previous event listeners
        const newMicBtn = micBtn.cloneNode(true);
        micBtn.parentNode.replaceChild(newMicBtn, micBtn);
        
        newMicBtn.addEventListener('click', () => {
            toggleSpeechRecognition(foreignWord, newMicBtn, (result) => {
                if (statusFeedback) {
                    if (result.success) {
                        statusFeedback.textContent = `¡Excelente pronunciación! (${result.spoken})`;
                        statusFeedback.className = 'voice-status-feedback success';
                        // Flip card automatically on successful pronunciation!
                        if (!isCardFlipped) {
                            setTimeout(() => {
                                flipReviewCard();
                            }, 800);
                        }
                    } else {
                        statusFeedback.textContent = `Escuché: "${result.spoken}". Inténtalo de nuevo.`;
                        statusFeedback.className = 'voice-status-feedback fail';
                    }
                }
            }, ttsCode);
        });
    }
}

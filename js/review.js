import { state } from './config.js';
import { toggleSpeechRecognition } from './voice.js';
import { saveWordsData } from './api.js';
import { showAlert } from './modal.js';

let reviewQueue = [];
let currentReviewIndex = 0;
let isCardFlipped = false;

export function startReviewSession(onCloseCallback) {
    if (state.savedWords.length === 0) {
        showAlert('No tienes palabras guardadas para repasar.', 'Time Loop Review', 'warning');
        return;
    }

    // Filter by active section filter if selected
    let wordsToReview = [...state.savedWords];
    if (state.activeSectionFilter !== 'all') {
        wordsToReview = wordsToReview.filter(w => (w.section || 'General') === state.activeSectionFilter);
    }

    if (wordsToReview.length === 0) {
        showAlert('No hay palabras guardadas en la sección seleccionada.', 'Time Loop Review', 'warning');
        return;
    }

    // Shuffle review queue
    reviewQueue = wordsToReview.sort(() => Math.random() - 0.5);
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

function renderCurrentReviewCard() {
    const word = reviewQueue[currentReviewIndex];
    if (!word) return;

    // Update Progress
    const progressEl = document.getElementById('review-progress-text');
    if (progressEl) {
        progressEl.textContent = `Palabras pendientes: ${reviewQueue.length}`;
    }

    // Determine source language from the word's saved langpair or fall back to current state
    const wordPair = word.langpair || localStorage.getItem('shike_lang_pair') || 'en|es';
    const fromCode = wordPair.split('|')[0];
    const toCode   = wordPair.split('|')[1];
    const langLabels = { en: 'INGLÉS', de: 'ALEMÁN', es: 'ESPAÑOL', fr: 'FRANCÉS', it: 'ITALIANO' };
    const ttsLang   = { en: 'en-US',  de: 'de-DE',  es: 'es-ES',  fr: 'fr-FR',  it: 'it-IT' };
    const langLabel = langLabels[fromCode] || fromCode.toUpperCase();

    // The audio ALWAYS speaks the foreign language (English or German), NEVER Spanish.
    // Rule: if source is Spanish, speak the TRANSLATION in target language.
    //       otherwise speak the source word in source language.
    const isSrcSpanish = fromCode === 'es';
    const ttsText  = isSrcSpanish ? word.wordEs  : word.wordEn;
    const ttsCode  = isSrcSpanish ? (ttsLang[toCode]   || 'en-US')
                                  : (ttsLang[fromCode] || 'en-US');

    // Update front card label to show correct language
    const frontLabel = document.querySelector('.flashcard-front .flashcard-label');
    if (frontLabel) frontLabel.textContent = `PALABRA EN ${langLabel}`;

    // Render Front Card
    const frontWord = document.getElementById('review-front-word');
    const frontPhonetic = document.getElementById('review-front-phonetic');
    if (frontWord) frontWord.textContent = word.wordEn;

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

    // Wire up audio button — always pronounces in English or German, never Spanish
    const reviewAudioBtn = document.getElementById('review-btn-audio');
    if (reviewAudioBtn) {
        const newAudioBtn = reviewAudioBtn.cloneNode(true);
        reviewAudioBtn.parentNode.replaceChild(newAudioBtn, reviewAudioBtn);
        newAudioBtn.addEventListener('click', (e) => {
            e.stopPropagation();

            const speakWithBrowser = () => {
                if (!ttsText || !('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
                    console.warn('Speech synthesis is not supported by this browser.');
                    return;
                }

                const language = ttsCode.split('-')[0];
                const utterance = new SpeechSynthesisUtterance(ttsText);
                utterance.lang = ttsCode;
                const voices = window.speechSynthesis.getVoices();
                const best = voices.find(v => v.lang === ttsCode && !v.localService)
                          || voices.find(v => v.lang.startsWith(language));
                if (best) utterance.voice = best;
                window.speechSynthesis.cancel();
                window.speechSynthesis.speak(utterance);
            };

            // Prefer a saved DictionaryAPI/Wiktionary recording.
            if (word.audio) {
                const audio = new Audio(word.audio);
                audio.play().catch(speakWithBrowser);
                return;
            }

            speakWithBrowser();
        });
    }

    // Render Back Card
    const backTranslation = document.getElementById('review-back-translation');
    const backWordEn = document.getElementById('review-back-word-en');
    const backExamples = document.getElementById('review-back-examples');
    const backNotes = document.getElementById('review-back-notes');
    
    if (backWordEn) backWordEn.textContent = word.wordEn;
    if (backTranslation) backTranslation.textContent = word.wordEs;
    
    // Render examples list
    if (backExamples) {
        backExamples.innerHTML = '';
        const examplesToRender = word.examples || [];
        examplesToRender.slice(0, 2).forEach(ex => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span class="review-ex-en">${ex.en}</span>
                <span class="review-ex-es">${ex.es}</span>
            `;
            backExamples.appendChild(li);
        });
    }

    // Render Notes and add listener to update word notes
    if (backNotes) {
        backNotes.value = word.notes || '';
        backNotes.oninput = (e) => {
            word.notes = e.target.value;
            // Update in savedWords
            const mainWord = state.savedWords.find(w => w.wordEn.toLowerCase() === word.wordEn.toLowerCase());
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
            toggleSpeechRecognition(word.wordEn, newMicBtn, (result) => {
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
            });
        });
    }
}

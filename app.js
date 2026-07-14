import { state } from './js/config.js';
import { loadWordsData, saveWordsData, translateWord, updateSyncStatus, registerUserAPI, loginUserAPI, generatePairExamples, fetchWordPronunciation, fetchAlternativeDescription } from './js/api.js';
import { generateAndTranslateExamples, capitalize } from './js/nlp.js';
import { updateDivergenceMeter } from './js/nixie.js';
import { toggleSpeechRecognition } from './js/voice.js';
import { startReviewSession, closeReviewSession, flipReviewCard, markReviewWord } from './js/review.js';
import { initAudioVisualizer, loadMusicData, playTrack, togglePlayPause, nextTrack, prevTrack } from './js/music.js';
import { initPomodoro } from './js/pomodoro.js';

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
const translationAlternatives = document.getElementById('translation-alternatives');
const examplesList = document.getElementById('examples-list');
const definitionsSection = document.getElementById('definitions-section');
const definitionsList = document.getElementById('definitions-list');
const conjugationSection = document.getElementById('conjugation-section');
const conjugationList = document.getElementById('conjugation-list');
const grammarTitle = document.getElementById('grammar-title');
const saveSectionSelect = document.getElementById('save-section-select');
const btnSaveWord = document.getElementById('btn-save-word');
const searchSuggestions = document.getElementById('search-suggestions');
const btnMic = document.getElementById('btn-mic');
const labNotesTextarea = document.getElementById('lab-notes-textarea');

// Sidebar and list elements
const vocabularyList = document.getElementById('vocabulary-list');
const savedCount = document.getElementById('saved-count');
const filterInput = document.getElementById('filter-input');
const filterSectionSelect = document.getElementById('filter-section-select');

// Login and Theme elements
const btnThemeToggle = document.getElementById('btn-theme-toggle');
const loginScreen = document.getElementById('login-screen');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const currentUserBadge = document.getElementById('current-user-badge');
const currentUserName = document.getElementById('current-user-name');

// Music Player Elements
const btnPlayPause = document.getElementById('btn-play-pause');
const btnPrevTrack = document.getElementById('btn-prev-track');
const btnNextTrack = document.getElementById('btn-next-track');
const btnShuffle = document.getElementById('btn-shuffle');
const btnRepeat = document.getElementById('btn-repeat');
const btnMusicSource = document.getElementById('btn-music-source');
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
    initAudioVisualizer();
    initPomodoro();
    
    // Load words data using our API module with callbacks to update UI
    loadWordsData({
        updateSectionDropdowns: updateSectionDropdowns,
        renderVocabularyList: renderVocabularyList
    });
    
    // Load music tracks
    loadMusicData(playlistSelect, musicTrackCount);
});

// ─── Pronunciation Engine ─────────────────────────────────────────────────────
// Uses a saved dictionary recording when available and otherwise uses the
// browser's SpeechSynthesis API.
//
// @param {string} word         – The word/phrase to speak.
// @param {string} langCode     – 'en', 'de', 'es', etc.
// @param {string} [nativeAudio] – URL to a native MP3 (optional, only used for English).
function speakWord(word, langCode, nativeAudio = '') {
    if (!word) return;

    // 1. Prefer a native DictionaryAPI/Wiktionary recording when available
    if (nativeAudio) {
        const audio = document.getElementById('audio-pronunciation');
        if (audio) {
            audio.src = nativeAudio;
            audio.play().catch(() => speakWordTTS(word, langCode));
            return;
        }
    }

    // 2. Browser SpeechSynthesis (Google Translate TTS blocks browser CORS requests)
    speakWordTTS(word, langCode);
}

// Helper: speak using Web Speech API with best available voice for given language
function speakWordTTS(word, langCode) {
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
        console.warn('Speech synthesis is not supported by this browser.');
        return;
    }

    const localeMap = { en: 'en-US', de: 'de-DE', es: 'es-ES', fr: 'fr-FR', it: 'it-IT' };
    const locale = localeMap[langCode] || 'en-US';
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = locale;
    // Pick best available voice for this locale
    const voices = window.speechSynthesis.getVoices();
    const best = voices.find(v => v.lang === locale && !v.localService)
              || voices.find(v => v.lang.startsWith(langCode));
    if (best) utterance.voice = best;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
}


function initEventListeners() {
    // Search form submit
    searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const query = searchInput.value.trim();
        if (query) {
            translateWord(query, {
                showLoading: showLoading,
                generateAndTranslateExamples: generateAndTranslateExamples,
                displayResult: displayResult
            });
        }
    });

    // Search Mode Toggle click (Word vs Phrase)
    const modeButtons = document.querySelectorAll('.btn-mode');
    modeButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            modeButtons.forEach(b => b.classList.remove('active'));
            const clickedBtn = e.target.closest('.btn-mode');
            clickedBtn.classList.add('active');
            state.activeSearchMode = clickedBtn.getAttribute('data-mode');
            
            if (state.activeSearchMode === 'phrase') {
                searchInput.placeholder = "Escribe una frase u oración en inglés...";
            } else {
                searchInput.placeholder = "Escribe una palabra en inglés...";
            }
            searchInput.focus();
        });
    });

    // Tense tabs click using event delegation
    document.addEventListener('click', async (e) => {
        const tab = e.target.closest('.tab-tense');
        if (tab) {
            const tabs = document.querySelectorAll('.tab-tense');
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const newTense = tab.getAttribute('data-tense');
            if (newTense !== state.activeTense) {
                state.activeTense = newTense;
                if (state.activeWordData) {
                    await handleTenseChange(state.activeTense);
                }
            }
        }
    });

    // Voice recognition button
    btnMic.addEventListener('click', () => {
        if (state.activeWordData) {
            // Create status span if not exists
            let statusFeedback = document.getElementById('voice-status-main');
            if (!statusFeedback) {
                statusFeedback = document.createElement('span');
                statusFeedback.id = 'voice-status-main';
                statusFeedback.className = 'voice-status-feedback';
                btnMic.parentNode.appendChild(statusFeedback);
            }
            statusFeedback.textContent = '';
            statusFeedback.className = 'voice-status-feedback';

            const [fromCode, toCode] = (state.activeWordData.langpair || state.translationPair || 'en|es').split('|');
            const practiceText = fromCode === 'es' ? state.activeWordData.wordEs : state.activeWordData.wordEn;
            const practiceLocale = { en: 'en-US', de: 'de-DE', es: 'es-ES' }[fromCode === 'es' ? toCode : fromCode] || 'en-US';
            toggleSpeechRecognition(practiceText, btnMic, (result) => {
                if (result.success) {
                    statusFeedback.textContent = `¡Pronunciación correcta!`;
                    statusFeedback.className = 'voice-status-feedback success';
                } else {
                    statusFeedback.textContent = `Escuché: "${result.spoken}"`;
                    statusFeedback.className = 'voice-status-feedback fail';
                }
            }, practiceLocale);
        }
    });

    // Lab notes text area update (auto-saves notes as user types)
    let notesTimeout;
    labNotesTextarea.addEventListener('input', (e) => {
        if (state.activeWordData) {
            state.activeWordData.notes = e.target.value;
            
            // Sync notes to the saved words list
            const activePair = state.activeWordData.langpair || state.translationPair || 'en|es';
            const savedWordIndex = state.savedWords.findIndex(w =>
                w.wordEn.toLowerCase() === state.activeWordData.wordEn.toLowerCase()
                && (w.langpair || activePair) === activePair
            );
            if (savedWordIndex >= 0) {
                state.savedWords[savedWordIndex].notes = e.target.value;
                
                // Debounce saving to Sheets/localStorage to avoid excessive traffic
                clearTimeout(notesTimeout);
                notesTimeout = setTimeout(() => {
                    saveWordsData();
                }, 1000);
            }
        }
    });

    // Autocomplete suggestions as user types according to source language
    let suggestionsTimeout;
    searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim();
        if (btnClear) btnClear.style.display = searchInput.value ? 'block' : 'none';

        clearTimeout(suggestionsTimeout);
        const lowerQuery = query.toLowerCase();

        if (lowerQuery.length > 0) {
            suggestionsTimeout = setTimeout(async () => {
                try {
                    const pair = state.translationPair || 'en|es';
                    const fromLang = pair.split('|')[0];
                    let slicedMatches = [];

                    if (fromLang === 'en') {
                        // Use Datamuse for English
                        const response = await fetch(`https://api.datamuse.com/sug?s=${encodeURIComponent(lowerQuery)}`);
                        if (response.ok) {
                            const matches = await response.json();
                            slicedMatches = matches.slice(0, 5);
                        }
                    } else {
                        // Use Wikipedia OpenSearch for other languages (German/Spanish)
                        const wikiUrl = `https://${fromLang}.wikipedia.org/w/api.php?action=opensearch&format=json&limit=10&search=${encodeURIComponent(lowerQuery)}&origin=*`;
                        const response = await fetch(wikiUrl);
                        if (response.ok) {
                            const wikiData = await response.json();
                            const suggestionsList = wikiData[1] || [];
                            const seenSuggestions = new Set();
                            slicedMatches = suggestionsList
                                // Wikipedia adds article qualifiers such as
                                // "Madera (material)"; they are not part of the word.
                                .map(item => item.replace(/\s*\([^)]*\)\s*$/u, '').trim())
                                .filter(item => {
                                    const normalized = item.toLocaleLowerCase(fromLang);
                                    if (!item || seenSuggestions.has(normalized)) return false;
                                    seenSuggestions.add(normalized);
                                    return true;
                                })
                                .sort((a, b) => {
                                    const aExact = a.toLocaleLowerCase(fromLang) === lowerQuery;
                                    const bExact = b.toLocaleLowerCase(fromLang) === lowerQuery;
                                    return Number(bExact) - Number(aExact);
                                })
                                .slice(0, 5)
                                .map(item => ({ word: item }));
                        }
                    }
                    
                    if (slicedMatches.length > 0) {
                        searchSuggestions.innerHTML = '';
                        slicedMatches.forEach(match => {
                            const div = document.createElement('div');
                            div.className = 'suggestion-item';
                            const wordSpan = document.createElement('span');
                            wordSpan.textContent = match.word;
                            const actionSpan = document.createElement('span');
                            actionSpan.className = 'suggestion-translation';
                            actionSpan.innerHTML = '<i class="fa-solid fa-language"></i> Traducir';
                            div.append(wordSpan, actionSpan);
                            div.addEventListener('click', () => {
                                searchInput.value = match.word;
                                searchSuggestions.style.display = 'none';
                                translateWord(match.word, {
                                    showLoading: showLoading,
                                    generateAndTranslateExamples: generateAndTranslateExamples,
                                    displayResult: displayResult
                                });
                            });
                            searchSuggestions.appendChild(div);
                        });
                        searchSuggestions.style.display = 'block';
                    } else {
                        searchSuggestions.style.display = 'none';
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
        searchSuggestions.style.display = 'none';
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
        if (state.activeWordData) {
            toggleSaveWord(state.activeWordData);
        }
    });

    // Audio button click — always pronounces in the FOREIGN language (English or German), never Spanish
    btnAudio.addEventListener('click', () => {
        if (!state.activeWordData) return;
        const pair = state.activeWordData.langpair || state.translationPair || 'en|es';
        const fromCode = pair.split('|')[0];
        const toCode   = pair.split('|')[1];

        // If source is Spanish, speak the TRANSLATION (foreign word); otherwise speak the source word
        const isSrcSpanish = fromCode === 'es';
        const ttsText = isSrcSpanish
            ? (state.activeWordData.wordEs || '')
            : (state.activeWordData.wordEn || '');
        const ttsLangCode = isSrcSpanish ? toCode : fromCode; // 'en' or 'de'

        speakWord(ttsText, ttsLangCode, state.activeWordData.audio);
    });

    // Filtering vocabulary list
    filterInput.addEventListener('input', (e) => {
        renderVocabularyList(e.target.value.trim());
    });

    // Filter section select change
    filterSectionSelect.addEventListener('change', (e) => {
        state.activeSectionFilter = e.target.value;
        renderVocabularyList(filterInput.value.trim());
    });

    // Save section select change (create new section)
    saveSectionSelect.addEventListener('change', (e) => {
        if (e.target.value === 'new-section') {
            const newSec = prompt('Escribe el nombre de la nueva sección:');
            if (newSec && newSec.trim() !== '') {
                const cleanedSec = newSec.trim();
                if (!state.availableSections.includes(cleanedSec)) {
                    state.availableSections.push(cleanedSec);
                    updateSectionDropdowns();
                }
                saveSectionSelect.value = cleanedSec;
                if (state.activeWordData) {
                    state.activeWordData.section = cleanedSec;
                    // If word is saved, update section in list
                    const activePair = state.activeWordData.langpair || state.translationPair || 'en|es';
                    const savedWord = state.savedWords.find(w =>
                        w.wordEn.toLowerCase() === state.activeWordData.wordEn.toLowerCase()
                        && (w.langpair || activePair) === activePair
                    );
                    if (savedWord) {
                        savedWord.section = cleanedSec;
                        saveWordsData();
                    }
                }
            } else {
                saveSectionSelect.value = 'General';
            }
        } else {
            if (state.activeWordData) {
                state.activeWordData.section = e.target.value;
                const activePair = state.activeWordData.langpair || state.translationPair || 'en|es';
                const savedWord = state.savedWords.find(w =>
                    w.wordEn.toLowerCase() === state.activeWordData.wordEn.toLowerCase()
                    && (w.langpair || activePair) === activePair
                );
                if (savedWord) {
                    savedWord.section = e.target.value;
                    saveWordsData();
                }
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

    // Login Mode toggle (Register vs Login)
    let authMode = 'login'; // Can be 'login' or 'register'
    const linkToggleMode = document.getElementById('link-toggle-mode');
    const loginInstruction = document.getElementById('login-instruction');
    const btnLoginSubmit = document.getElementById('btn-login-submit');
    const loginSuccessMsg = document.getElementById('login-success');

    if (linkToggleMode) {
        linkToggleMode.addEventListener('click', (e) => {
            e.preventDefault();
            loginError.style.display = 'none';
            if (loginSuccessMsg) loginSuccessMsg.style.display = 'none';
            if (authMode === 'login') {
                authMode = 'register';
                loginInstruction.textContent = 'Cree una nueva cuenta';
                btnLoginSubmit.textContent = 'Registrarse';
                linkToggleMode.textContent = '¿Ya tienes cuenta? Inicia sesión aquí';
            } else {
                authMode = 'login';
                loginInstruction.textContent = 'Ingrese credenciales de acceso';
                btnLoginSubmit.textContent = 'Acceder';
                linkToggleMode.textContent = '¿No tienes cuenta? Regístrate aquí';
            }
        });
    }

    // Login/Register form submit handler
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginError.style.display = 'none';
        if (loginSuccessMsg) loginSuccessMsg.style.display = 'none';
        
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value.trim();
        
        if (!username || !password) return;
        
        btnLoginSubmit.disabled = true;
        const originalText = btnLoginSubmit.textContent;
        btnLoginSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando...';

        try {
            if (authMode === 'register') {
                const res = await registerUserAPI(username, password);
                if (res && res.success) {
                    if (loginSuccessMsg) {
                        loginSuccessMsg.style.display = 'block';
                        loginSuccessMsg.textContent = res.message || 'Usuario registrado con éxito.';
                    }
                    // Switch back to login mode automatically
                    authMode = 'login';
                    loginInstruction.textContent = 'Ingrese credenciales de acceso';
                    btnLoginSubmit.textContent = 'Acceder';
                    linkToggleMode.textContent = '¿No tienes cuenta? Regístrate aquí';
                    document.getElementById('login-password').value = '';
                } else {
                    loginError.style.display = 'block';
                    loginError.textContent = res ? res.message : 'Error al registrar usuario.';
                }
            } else {
                const res = await loginUserAPI(username, password);
                if (res && res.success) {
                    localStorage.setItem('shike_user', res.username);
                    state.currentUser = res.username;
                    updateCurrentUserUI();
                    
                    if (res.language) {
                        state.activeLanguage = res.language;
                        localStorage.setItem('shike_lang', res.language);
                    }
                    
                    updateLanguageUI();
                    
                    // Load the user's specific vocabulary list
                    await loadWordsData({
                        updateSectionDropdowns: updateSectionDropdowns,
                        renderVocabularyList: renderVocabularyList
                    });

                    loginScreen.style.display = 'none';
                } else {
                    loginError.style.display = 'block';
                    loginError.textContent = res ? res.message : 'Usuario o contraseña incorrectos.';
                }
            }
        } catch (err) {
            console.error(err);
            loginError.style.display = 'block';
            loginError.textContent = 'Error de conexión con el servidor.';
        } finally {
            btnLoginSubmit.disabled = false;
            btnLoginSubmit.textContent = originalText;
        }
    });

    // Language Pair Selector Listener
    const langPairSelect = document.getElementById('lang-pair-select');
    if (langPairSelect) {
        langPairSelect.addEventListener('change', (e) => {
            state.translationPair = e.target.value;
            localStorage.setItem('shike_lang_pair', state.translationPair);
            updateLanguageUI();
            
            // Clear current card search suggestions and inputs if switching language
            searchInput.value = '';
            if (btnClear) btnClear.style.display = 'none';
            welcomeCard.style.display = 'block';
            resultCard.style.display = 'none';
        });
    }

    // Logout Listener
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            localStorage.removeItem('shike_user');
            state.currentUser = '';
            updateCurrentUserUI();
            state.savedWords = [];
            renderVocabularyList();
            loginScreen.style.display = 'flex';
            document.getElementById('login-username').value = '';
            document.getElementById('login-password').value = '';
        });
    }

    // Music Player Event listeners
    btnPlayPause.addEventListener('click', () => togglePlayPause(btnPlayPause, playlistSelect, currentTrackNameEl));
    btnPrevTrack.addEventListener('click', () => prevTrack(playlistSelect, currentTrackNameEl, btnPlayPause));
    btnNextTrack.addEventListener('click', () => nextTrack(playlistSelect, currentTrackNameEl, btnPlayPause));
    
    btnShuffle.addEventListener('click', () => {
        state.isShuffle = !state.isShuffle;
        btnShuffle.classList.toggle('active', state.isShuffle);
    });
    
    btnRepeat.addEventListener('click', () => {
        state.isRepeat = !state.isRepeat;
        btnRepeat.classList.toggle('active', state.isRepeat);
    });
    
    btnMusicSource.addEventListener('click', async () => {
        if (btnMusicSource.disabled) return;
        btnMusicSource.disabled = true;
        
        try {
            if (state.activeMusicSource === 'api-lofi') {
                state.activeMusicSource = 'api-ambient';
            } else if (state.activeMusicSource === 'api-ambient') {
                state.activeMusicSource = 'radio';
            } else if (state.activeMusicSource === 'radio') {
                state.activeMusicSource = 'radio-jpop';
            } else if (state.activeMusicSource === 'radio-jpop') {
                state.activeMusicSource = 'drive';
            } else {
                state.activeMusicSource = 'api-lofi';
            }
            await loadMusicData(playlistSelect, musicTrackCount);
            
            // Automatically play the first track of the new source
            if (state.musicPlaylist.length > 0) {
                playTrack(0, playlistSelect, currentTrackNameEl, btnPlayPause);
            }
        } catch (err) {
            console.error('Error switching music source:', err);
        } finally {
            btnMusicSource.disabled = false;
        }
    });
    
    playlistSelect.addEventListener('change', (e) => {
        const index = parseInt(e.target.value);
        if (!isNaN(index) && index >= 0 && index < state.musicPlaylist.length) {
            playTrack(index, playlistSelect, currentTrackNameEl, btnPlayPause);
        }
    });
    
    const musicAudio = document.getElementById('music-audio');
    const musicAudioDirect = document.getElementById('music-audio-direct');
    
    function bindAudioEvents(audio) {
        audio.addEventListener('timeupdate', () => {
            if (audio.id !== state.activeAudioId) return;
            if (audio.duration && isFinite(audio.duration)) {
                const pct = (audio.currentTime / audio.duration) * 100;
                progressBar.value = pct;
                currentTimeEl.textContent = formatTime(audio.currentTime);
            } else {
                currentTimeEl.textContent = formatTime(audio.currentTime);
            }
        });
        
        audio.addEventListener('durationchange', () => {
            if (audio.id !== state.activeAudioId) return;
            if (audio.duration && isFinite(audio.duration)) {
                totalTimeEl.textContent = formatTime(audio.duration);
            } else {
                totalTimeEl.textContent = 'En Vivo';
            }
        });
        
        audio.addEventListener('ended', () => {
            if (audio.id !== state.activeAudioId) return;
            nextTrack(playlistSelect, currentTrackNameEl, btnPlayPause);
        });
    }
    
    if (musicAudio && musicAudioDirect) {
        bindAudioEvents(musicAudio);
        bindAudioEvents(musicAudioDirect);
    }
    
    progressBar.addEventListener('input', (e) => {
        const activeAudio = document.getElementById(state.activeAudioId);
        if (activeAudio && activeAudio.duration && isFinite(activeAudio.duration)) {
            const time = (e.target.value / 100) * activeAudio.duration;
            activeAudio.currentTime = time;
        }
    });
    
    volumeBar.addEventListener('input', (e) => {
        const vol = e.target.value / 100;
        if (musicAudio) musicAudio.volume = vol;
        if (musicAudioDirect) musicAudioDirect.volume = vol;
    });

    // Flashcard Time Loop Review listeners
    const btnStartReview = document.getElementById('btn-start-review');
    const reviewDeckModal = document.getElementById('review-deck-modal');
    const closeReviewDeckModal = () => { reviewDeckModal.style.display = 'none'; };
    btnStartReview.addEventListener('click', () => {
        const selectedPair = state.translationPair || 'en|es';
        const reviewLanguage = selectedPair.includes('de') ? 'de' : 'en';
        const deckSelect = document.getElementById('review-deck-select');
        deckSelect.querySelectorAll('optgroup[data-review-language]').forEach(group => {
            const shouldHide = group.dataset.reviewLanguage !== reviewLanguage;
            group.hidden = shouldHide;
            group.disabled = shouldHide;
            group.querySelectorAll('option').forEach(option => {
                option.hidden = shouldHide;
                option.disabled = shouldHide;
            });
        });
        const selectedDeckLanguage = deckSelect.value.split('-')[0];
        if (deckSelect.value !== 'saved' && selectedDeckLanguage !== reviewLanguage) {
            deckSelect.value = `${reviewLanguage}-a1`;
        }
        reviewDeckModal.style.display = 'flex';
    });
    document.getElementById('btn-close-review-deck-modal').addEventListener('click', closeReviewDeckModal);
    document.getElementById('btn-cancel-review-deck').addEventListener('click', closeReviewDeckModal);
    reviewDeckModal.addEventListener('click', (event) => {
        if (event.target === reviewDeckModal) closeReviewDeckModal();
    });
    document.getElementById('btn-confirm-review-deck').addEventListener('click', () => {
        const deck = document.getElementById('review-deck-select')?.value || 'saved';
        closeReviewDeckModal();
        startReviewSession({ deck, limit: 20 });
    });

    const btnCloseReview = document.getElementById('btn-close-review');
    btnCloseReview.addEventListener('click', () => closeReviewSession());

    const btnFlipCardFront = document.getElementById('btn-flip-card-front');
    btnFlipCardFront.addEventListener('click', () => flipReviewCard());

    const btnFlipCardBack = document.getElementById('btn-flip-card-back');
    btnFlipCardBack.addEventListener('click', () => flipReviewCard());

    const btnReviewSuccess = document.getElementById('btn-review-success');
    btnReviewSuccess.addEventListener('click', () => markReviewWord(true, {
        renderVocabularyList: renderVocabularyList
    }));

    const btnReviewFail = document.getElementById('btn-review-fail');
    btnReviewFail.addEventListener('click', () => markReviewWord(false));
}

// Load Theme & Auth Settings
function loadSettings() {
    const savedTheme = localStorage.getItem('kurisu_theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        const icon = btnThemeToggle.querySelector('i');
        if (icon) icon.className = 'fa-solid fa-sun';
    }

    updateLanguageUI();
    updateCurrentUserUI();

    if (state.currentUser) {
        loginScreen.style.display = 'none';
    } else {
        loginScreen.style.display = 'flex';
    }
}

function updateCurrentUserUI() {
    if (!currentUserBadge || !currentUserName) return;

    if (state.currentUser) {
        currentUserName.textContent = state.currentUser;
        currentUserBadge.style.display = 'inline-flex';
    } else {
        currentUserName.textContent = '';
        currentUserBadge.style.display = 'none';
    }
}

// Update UI elements depending on active language pair
function updateLanguageUI() {
    const langPairSelect = document.getElementById('lang-pair-select');
    if (langPairSelect) {
        langPairSelect.value = state.translationPair;
    }
    
    // Set appropriate placeholder based on translation direction
    const pair = state.translationPair || 'en|es';
    const fromLang = pair.split('|')[0];
    
    if (fromLang === 'de') {
        searchInput.placeholder = 'Escribe una palabra en alemán...';
    } else if (fromLang === 'es') {
        searchInput.placeholder = 'Escribe una palabra en español...';
    } else {
        searchInput.placeholder = 'Escribe una palabra en inglés...';
    }
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

// Display Result Card
function displayResult(data) {
    resultWordEn.textContent = data.wordEn;
    
    // Only show phonetic if it has real data
    if (data.phonetic && data.phonetic.trim() !== '') {
        resultPhonetic.textContent = data.phonetic;
        resultPhonetic.style.display = 'inline';
    } else {
        resultPhonetic.textContent = '';
        resultPhonetic.style.display = 'none';
    }
    
    resultWordEs.textContent = data.wordEs;
    renderTranslationAlternatives(data);
    
    const audioPronunciation = document.getElementById('audio-pronunciation');
    if (data.audio) {
        audioPronunciation.src = data.audio;
        btnAudio.title = 'Escuchar pronunciación';
    } else {
        audioPronunciation.removeAttribute('src');
        btnAudio.title = 'Escuchar pronunciación (síntesis de voz)';
    }
    // Always show audio button — falls back to browser text-to-speech for non-English
    btnAudio.style.display = 'inline-flex';

    // Populate Lab Notes textarea
    labNotesTextarea.value = data.notes || '';

    // Clear voice practice status label
    const mainVoiceStatus = document.getElementById('voice-status-main');
    if (mainVoiceStatus) {
        mainVoiceStatus.textContent = '';
        mainVoiceStatus.className = 'voice-status-feedback';
    }

    // Render definitions & synonyms
    if (data.meanings && data.meanings.length > 0) {
        definitionsList.innerHTML = '';
        data.meanings.forEach(m => {
            if (m.definitions && m.definitions.length > 0) {
                m.definitions.forEach(def => {
                    const div = document.createElement('div');
                    div.className = 'definition-item';

                    const header = document.createElement('div');
                    header.className = 'definition-header';
                    const partOfSpeech = document.createElement('span');
                    partOfSpeech.className = 'definition-pos';
                    partOfSpeech.textContent = m.partOfSpeech || '';
                    header.appendChild(partOfSpeech);

                    const description = document.createElement('p');
                    description.className = 'definition-desc';
                    description.textContent = def;
                    div.append(header, description);

                    if (m.synonyms && m.synonyms.length > 0) {
                        const synonyms = document.createElement('div');
                        synonyms.className = 'definition-syns';
                        synonyms.append('Sinónimos: ');
                        m.synonyms.slice(0, 5).forEach(synonym => {
                            const tag = document.createElement('span');
                            tag.className = 'definition-syn-tag';
                            tag.textContent = synonym;
                            synonyms.appendChild(tag);
                        });
                        div.appendChild(synonyms);
                    }
                    definitionsList.appendChild(div);
                });
            }
        });
        definitionsSection.style.display = 'block';
    } else {
        definitionsList.innerHTML = '';
        definitionsSection.style.display = 'none';
    }

    conjugationList.innerHTML = '';
    if (Array.isArray(data.conjugations) && data.conjugations.length > 0) {
        grammarTitle.textContent = data.grammarTitle || 'Información gramatical';
        data.conjugations.forEach(form => {
            const item = document.createElement('div');
            item.className = 'conjugation-item';
            const label = document.createElement('span');
            label.className = 'conjugation-label';
            label.textContent = form.label;
            const value = document.createElement('strong');
            value.className = 'conjugation-value';
            value.textContent = form.value;
            item.append(label, value);
            conjugationList.appendChild(item);
        });
        conjugationSection.style.display = 'block';
    } else {
        conjugationSection.style.display = 'none';
    }

    const tabs = document.querySelectorAll('.tab-tense');
    tabs.forEach(t => {
        if (t.getAttribute('data-tense') === state.activeTense) {
            t.classList.add('active');
        } else {
            t.classList.remove('active');
        }
    });

    saveSectionSelect.value = data.section || 'General';
    renderActiveWordExamples();
    updateSaveButtonState(data.wordEn);

    welcomeCard.style.display = 'none';
    resultCard.style.display = 'block';
}

function renderTranslationAlternatives(data) {
    if (!translationAlternatives) return;
    translationAlternatives.innerHTML = '';

    const alternatives = [...new Set([data.wordEs, ...(data.translationAlternatives || [])].filter(Boolean))];
    if (alternatives.length < 2) {
        translationAlternatives.style.display = 'none';
        return;
    }

    alternatives.forEach(alternative => {
        const optionCard = document.createElement('div');
        optionCard.className = 'translation-option-card';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `translation-option${alternative === data.wordEs ? ' active' : ''}`;
        button.textContent = alternative;
        button.addEventListener('click', async () => {
            data.wordEs = alternative;
            resultWordEs.textContent = alternative;

            const [fromCode, toCode] = (data.langpair || state.translationPair || 'en|es').split('|');
            if (fromCode === 'es' && (toCode === 'en' || toCode === 'de')) {
                data.phonetic = '';
                data.audio = '';
                const pronunciation = await fetchWordPronunciation(alternative, toCode);
                data.phonetic = pronunciation.phonetic;
                data.audio = pronunciation.audio;
                if (pronunciation.phonetic) {
                    resultPhonetic.textContent = pronunciation.phonetic;
                    resultPhonetic.style.display = 'inline';
                } else {
                    resultPhonetic.textContent = '';
                    resultPhonetic.style.display = 'none';
                }
                if (pronunciation.audio) {
                    audioPronunciation.src = pronunciation.audio;
                } else {
                    audioPronunciation.removeAttribute('src');
                }
            }

            const selectedPair = data.langpair || state.translationPair || 'en|es';
            const savedEntry = state.savedWords.find(word =>
                word.wordEn.toLowerCase() === data.wordEn.toLowerCase()
                && (word.langpair || selectedPair) === selectedPair
            );
            if (savedEntry) {
                Object.assign(savedEntry, data);
                await saveWordsData({ renderVocabularyList });
            }

            renderTranslationAlternatives(data);
        });

        const description = document.createElement('p');
        description.className = 'translation-option-description';
        const descriptions = data.alternativeDescriptions || (data.alternativeDescriptions = {});
        if (Object.hasOwn(descriptions, alternative)) {
            description.textContent = descriptions[alternative] || 'Sin descripción disponible.';
        } else {
            description.textContent = 'Buscando significado…';
            const targetCode = (data.langpair || state.translationPair || 'en|es').split('|')[1];
            fetchAlternativeDescription(alternative, targetCode).then(text => {
                descriptions[alternative] = text;
                description.textContent = text || 'Sin descripción disponible.';
            });
        }

        optionCard.append(button, description);
        translationAlternatives.appendChild(optionCard);
    });
    translationAlternatives.style.display = 'grid';
}

// Render only the examples list on the result card
function renderActiveWordExamples() {
    examplesList.innerHTML = '';
    if (state.activeWordData && state.activeWordData.examples) {
        state.activeWordData.examples.forEach(ex => {
            const li = document.createElement('li');
            const typeClass = ex.type ? ex.type.toLowerCase() : 'afirmativo';
            const type = document.createElement('span');
            type.className = `example-type ${typeClass}`;
            type.textContent = ex.type || 'Afirmativo';
            const source = document.createElement('span');
            source.className = 'example-en';
            source.textContent = ex.en || '';
            const translated = document.createElement('span');
            translated.className = 'example-es';
            translated.textContent = ex.es || '';
            li.append(type, source, translated);
            examplesList.appendChild(li);
        });
    }
}

// Switch examples tense for currently displayed word
async function handleTenseChange(tense) {
    if (!state.activeWordData) return;
    
    examplesList.innerHTML = '<li style="border-left: none; text-align: center; background: none; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Generando ejemplos en ' + (tense === 'present' ? 'presente' : tense === 'past' ? 'pasado' : 'futuro') + '...</li>';
    
    const langpair = state.activeWordData.langpair || state.translationPair || 'en|es';
    const examples = langpair === 'en|es'
        ? await generateAndTranslateExamples(state.activeWordData.wordEn, state.activeWordData.partOfSpeech, tense, state.activeWordData.baseSentence)
        : await generatePairExamples(state.activeWordData.wordEn, langpair, tense);
    state.activeWordData.examples = examples;
    renderActiveWordExamples();
}

function updateSaveButtonState(wordEn, langpair = state.activeWordData?.langpair || state.translationPair || 'en|es') {
    const isSaved = state.savedWords.some(w =>
        w.wordEn.toLowerCase() === wordEn.toLowerCase()
        && (w.langpair || langpair) === langpair
    );
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
    const wordPair = wordData.langpair || state.translationPair || 'en|es';
    const index = state.savedWords.findIndex(w =>
        w.wordEn.toLowerCase() === wordData.wordEn.toLowerCase()
        && (w.langpair || wordPair) === wordPair
    );
    
    if (index >= 0) {
        state.savedWords.splice(index, 1);
    } else {
        const selectedSec = saveSectionSelect.value || 'General';
        wordData.section = selectedSec;
        state.savedWords.unshift(wordData);
        
        if (!state.availableSections.includes(selectedSec)) {
            state.availableSections.push(selectedSec);
            updateSectionDropdowns();
        }
    }
    
    updateSaveButtonState(wordData.wordEn, wordPair);
    saveWordsData({
        renderVocabularyList: renderVocabularyList
    });
}

// Render Saved Vocabulary list
export function renderVocabularyList(filterText = '') {
    vocabularyList.innerHTML = '';
    
    const filtered = state.savedWords.filter(w => {
        const wordSec = w.section || 'General';
        if (state.activeSectionFilter !== 'all' && wordSec !== state.activeSectionFilter) {
            return false;
        }
        if (!filterText) return true;
        const text = filterText.toLowerCase();
        return w.wordEn.toLowerCase().includes(text) || w.wordEs.toLowerCase().includes(text);
    });

    savedCount.textContent = state.savedWords.length;
    
    // Animate divergence meter
    updateDivergenceMeter();

    if (filtered.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'empty-list-message';
        const message = document.createElement('p');
        message.textContent = filterText
            ? `No se encontraron palabras para "${filterText}".`
            : 'No tienes palabras en esta sección.';
        emptyMsg.appendChild(message);
        vocabularyList.appendChild(emptyMsg);
        return;
    }

    filtered.forEach(w => {
        const item = document.createElement('div');
        item.className = 'vocab-item';
        
        item.addEventListener('click', (e) => {
            if (e.target.closest('.btn-delete-word')) return;
            
            state.activeWordData = w;
            displayResult(w);
            searchInput.value = w.wordEn;
            btnClear.style.display = 'block';
        });

        const words = document.createElement('div');
        words.className = 'vocab-item-word';
        const sourceWord = document.createElement('span');
        sourceWord.className = 'item-en';
        sourceWord.textContent = w.wordEn;
        const translatedWord = document.createElement('span');
        translatedWord.className = 'item-es';
        translatedWord.textContent = w.wordEs;
        words.append(sourceWord, translatedWord);

        const actions = document.createElement('div');
        actions.className = 'vocab-item-actions';
        const btnDelete = document.createElement('button');
        btnDelete.className = 'btn-delete-word';
        btnDelete.title = 'Eliminar palabra';
        btnDelete.innerHTML = '<i class="fa-regular fa-trash-can"></i>';
        actions.appendChild(btnDelete);
        item.append(words, actions);

        btnDelete.addEventListener('click', () => {
            const wordPair = w.langpair || state.translationPair || 'en|es';
            state.savedWords = state.savedWords.filter(item => !(
                item.wordEn.toLowerCase() === w.wordEn.toLowerCase()
                && (item.langpair || wordPair) === wordPair
            ));
            if (state.activeWordData
                && state.activeWordData.wordEn.toLowerCase() === w.wordEn.toLowerCase()
                && (state.activeWordData.langpair || wordPair) === wordPair) {
                updateSaveButtonState(w.wordEn, wordPair);
            }
            saveWordsData({
                renderVocabularyList: renderVocabularyList
            });
        });

        vocabularyList.appendChild(item);
    });
}

// Update both Select dropdowns
function updateSectionDropdowns() {
    const currentSaveVal = saveSectionSelect.value;
    saveSectionSelect.innerHTML = '';
    state.availableSections.forEach(sec => {
        const opt = document.createElement('option');
        opt.value = sec;
        opt.textContent = sec;
        saveSectionSelect.appendChild(opt);
    });
    const newOpt = document.createElement('option');
    newOpt.value = 'new-section';
    newOpt.textContent = '+ Nueva Sección...';
    saveSectionSelect.appendChild(newOpt);
    
    if (state.availableSections.includes(currentSaveVal)) {
        saveSectionSelect.value = currentSaveVal;
    } else {
        saveSectionSelect.value = 'General';
    }

    const currentFilterVal = filterSectionSelect.value;
    filterSectionSelect.innerHTML = '<option value="all">Todas las secciones</option>';
    state.availableSections.forEach(sec => {
        const opt = document.createElement('option');
        opt.value = sec;
        opt.textContent = sec;
        filterSectionSelect.appendChild(opt);
    });
    
    if (currentFilterVal === 'all' || state.availableSections.includes(currentFilterVal)) {
        filterSectionSelect.value = currentFilterVal;
        state.activeSectionFilter = currentFilterVal;
    } else {
        filterSectionSelect.value = 'all';
        state.activeSectionFilter = 'all';
    }
}

// Helper to format seconds into MM:SS
function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

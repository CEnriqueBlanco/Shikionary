import { state } from './js/config.js';
import { loadWordsData, saveWordsData, translateWord, updateSyncStatus } from './js/api.js';
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
const examplesList = document.getElementById('examples-list');
const definitionsSection = document.getElementById('definitions-section');
const definitionsList = document.getElementById('definitions-list');
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

// Event Listeners Initialization
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

            toggleSpeechRecognition(state.activeWordData.wordEn, btnMic, (result) => {
                if (result.success) {
                    statusFeedback.textContent = `¡Pronunciación correcta!`;
                    statusFeedback.className = 'voice-status-feedback success';
                } else {
                    statusFeedback.textContent = `Escuché: "${result.spoken}"`;
                    statusFeedback.className = 'voice-status-feedback fail';
                }
            });
        }
    });

    // Lab notes text area update (auto-saves notes as user types)
    let notesTimeout;
    labNotesTextarea.addEventListener('input', (e) => {
        if (state.activeWordData) {
            state.activeWordData.notes = e.target.value;
            
            // Sync notes to the saved words list
            const savedWordIndex = state.savedWords.findIndex(w => w.wordEn.toLowerCase() === state.activeWordData.wordEn.toLowerCase());
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

    // Autocomplete suggestions as user types using Datamuse API
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

    // Audio button click
    btnAudio.addEventListener('click', () => {
        const audioPronunciation = document.getElementById('audio-pronunciation');
        if (audioPronunciation && audioPronunciation.src) {
            audioPronunciation.play().catch(err => console.log('Audio playback error:', err));
        }
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
                    const savedWord = state.savedWords.find(w => w.wordEn.toLowerCase() === state.activeWordData.wordEn.toLowerCase());
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
                const savedWord = state.savedWords.find(w => w.wordEn.toLowerCase() === state.activeWordData.wordEn.toLowerCase());
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
    btnStartReview.addEventListener('click', () => startReviewSession());

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

    const isAuthenticated = localStorage.getItem('shike_authenticated');
    if (isAuthenticated === 'true') {
        loginScreen.style.display = 'none';
    } else {
        loginScreen.style.display = 'flex';
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
    resultPhonetic.textContent = data.phonetic || '/--/';
    resultWordEs.textContent = data.wordEs;
    
    const audioPronunciation = document.getElementById('audio-pronunciation');
    if (data.audio) {
        audioPronunciation.src = data.audio;
        btnAudio.style.display = 'inline-flex';
    } else {
        audioPronunciation.removeAttribute('src');
        btnAudio.style.display = 'none';
    }

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
                    
                    let synsHtml = '';
                    if (m.synonyms && m.synonyms.length > 0) {
                        const synsList = m.synonyms.slice(0, 5).map(s => `<span class="definition-syn-tag">${s}</span>`).join('');
                        synsHtml = `<div class="definition-syns">Sinónimos: ${synsList}</div>`;
                    }
                    
                    div.innerHTML = `
                        <div class="definition-header">
                            <span class="definition-pos">${m.partOfSpeech}</span>
                        </div>
                        <p class="definition-desc">${def}</p>
                        ${synsHtml}
                    `;
                    definitionsList.appendChild(div);
                });
            }
        });
        definitionsSection.style.display = 'block';
    } else {
        definitionsList.innerHTML = '';
        definitionsSection.style.display = 'none';
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

// Render only the examples list on the result card
function renderActiveWordExamples() {
    examplesList.innerHTML = '';
    if (state.activeWordData && state.activeWordData.examples) {
        state.activeWordData.examples.forEach(ex => {
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

// Switch examples tense for currently displayed word
async function handleTenseChange(tense) {
    if (!state.activeWordData) return;
    
    examplesList.innerHTML = '<li style="border-left: none; text-align: center; background: none; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Generando ejemplos en ' + (tense === 'present' ? 'presente' : tense === 'past' ? 'pasado' : 'futuro') + '...</li>';
    
    const examples = await generateAndTranslateExamples(state.activeWordData.wordEn, state.activeWordData.partOfSpeech, tense, state.activeWordData.baseSentence);
    state.activeWordData.examples = examples;
    renderActiveWordExamples();
}

function updateSaveButtonState(wordEn) {
    const isSaved = state.savedWords.some(w => w.wordEn.toLowerCase() === wordEn.toLowerCase());
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
    const index = state.savedWords.findIndex(w => w.wordEn.toLowerCase() === wordData.wordEn.toLowerCase());
    
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
    
    updateSaveButtonState(wordData.wordEn);
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
        emptyMsg.innerHTML = filterText 
            ? `<p>No se encontraron palabras para "${filterText}".</p>` 
            : `<p>No tienes palabras en esta sección.</p>`;
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

        item.innerHTML = `
            <div class="vocab-item-word">
                <span class="item-en">${w.wordEn}</span>
                <span class="item-es">${w.wordEs}</span>
            </div>
            <div class="vocab-item-actions">
                <button class="btn-delete-word" title="Eliminar palabra">
                    <i class="fa-regular fa-trash-can"></i>
                </button>
            </div>
        `;

        const btnDelete = item.querySelector('.btn-delete-word');
        btnDelete.addEventListener('click', () => {
            state.savedWords = state.savedWords.filter(item => item.wordEn.toLowerCase() !== w.wordEn.toLowerCase());
            if (state.activeWordData && state.activeWordData.wordEn.toLowerCase() === w.wordEn.toLowerCase()) {
                updateSaveButtonState(w.wordEn);
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

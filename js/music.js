import { GOOGLE_SHEETS_URL, state } from './config.js';

let audioCtx = null;
let analyser = null;
let source = null;
let visualizerAnimationId = null;

// Initialize Visualizer canvas
export function initAudioVisualizer() {
    const audio = document.getElementById('music-audio');
    const canvas = document.getElementById('audio-visualizer');
    if (!audio || !canvas) return;

    const ctx = canvas.getContext('2d');
    
    // Set canvas dimensions
    canvas.width = canvas.parentElement.clientWidth || 300;
    canvas.height = 60;

    // We initialize the AudioContext on play because browsers block autoplay contexts
    function setupAudioContext() {
        if (audioCtx) return;
        
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = 64; // Small size for simple wave representation
            
            source = audioCtx.createMediaElementSource(audio);
            source.connect(analyser);
            analyser.connect(audioCtx.destination);
            
            draw();
        } catch (e) {
            console.error('AudioContext failed to initialize:', e);
        }
    }

    // Trigger on play
    audio.addEventListener('play', () => {
        setupAudioContext();
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    });

    // Draw function
    function draw() {
        visualizerAnimationId = requestAnimationFrame(draw);
        if (!analyser) return;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteTimeDomainData(dataArray);

        ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--nixie-bg').trim() || '#151110';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.lineWidth = 2;
        ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--nixie-glow').trim() || '#FF5E13';
        ctx.beginPath();

        const sliceWidth = canvas.width * 1.0 / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / 128.0;
            const y = v * canvas.height / 2;

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }

            x += sliceWidth;
        }

        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();
    }
    
    // Handle window resize
    window.addEventListener('resize', () => {
        canvas.width = canvas.parentElement.clientWidth || 300;
    });
}

// Load Music Data from Google Apps Script Web App
export async function loadMusicData(playlistSelect, musicTrackCount) {
    playlistSelect.innerHTML = '<option value="">Cargando canciones...</option>';
    musicTrackCount.textContent = '0';
    
    const isGoogle = GOOGLE_SHEETS_URL && GOOGLE_SHEETS_URL !== 'PEGA_TU_ENLACE_DE_GOOGLE_APPS_SCRIPT_AQUI';
    if (!isGoogle) {
        playlistSelect.innerHTML = '<option value="">Apps Script no configurado</option>';
        return;
    }
    
    try {
        const response = await fetch(`${GOOGLE_SHEETS_URL}?action=getMusic`);
        if (response.ok) {
            state.musicPlaylist = await response.json();
            
            if (state.musicPlaylist && state.musicPlaylist.length > 0 && !state.musicPlaylist.error) {
                musicTrackCount.textContent = state.musicPlaylist.length;
                playlistSelect.innerHTML = '<option value="">Selecciona una canción...</option>';
                
                state.musicPlaylist.forEach((track, index) => {
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

// Play a specific track index
export async function playTrack(index, playlistSelect, currentTrackNameEl, btnPlayPause) {
    if (index < 0 || index >= state.musicPlaylist.length) return;
    
    const musicAudio = document.getElementById('music-audio');
    if (!musicAudio) return;

    // Stop current playback
    musicAudio.pause();
    
    state.currentTrackIndex = index;
    playlistSelect.value = index;
    
    const track = state.musicPlaylist[index];
    currentTrackNameEl.textContent = "Cargando canción...";
    
    try {
        let base64Data;
        if (state.preloadedTrackIndex === index && state.preloadedTrackData) {
            base64Data = state.preloadedTrackData;
            state.preloadedTrackData = null;
            state.preloadedTrackIndex = -1;
        } else {
            const response = await fetch(`${GOOGLE_SHEETS_URL}?action=getTrack&id=${track.id}`);
            if (!response.ok) throw new Error("Network response was not ok");
            base64Data = await response.text();
        }
        
        if (base64Data.trim().startsWith('error:') || base64Data.trim().startsWith('{"error"')) {
            throw new Error("Server error: " + base64Data);
        }
        
        base64Data = base64Data.trim();
        if (base64Data.startsWith('"') && base64Data.endsWith('"')) {
            base64Data = base64Data.slice(1, -1);
        }
        base64Data = base64Data.replace(/[^A-Za-z0-9\+\/\=]/g, "");
        
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
        
        if (musicAudio.src && musicAudio.src.startsWith('blob:')) {
            URL.revokeObjectURL(musicAudio.src);
        }
        
        const blobUrl = URL.createObjectURL(blob);
        musicAudio.src = blobUrl;
        
        currentTrackNameEl.textContent = track.name;
        
        musicAudio.play()
            .then(() => {
                btnPlayPause.innerHTML = '<i class="fa-solid fa-pause"></i>';
            })
            .catch(err => {
                if (err.name !== 'AbortError') {
                    console.error('Playback error:', err);
                    currentTrackNameEl.textContent = "Error al reproducir canción";
                }
            });
            
        triggerNextTrackPreload();
    } catch (error) {
        console.error('Error fetching track:', error);
        currentTrackNameEl.textContent = "Error al cargar canción";
    }
}

export function togglePlayPause(btnPlayPause, playlistSelect, currentTrackNameEl) {
    const musicAudio = document.getElementById('music-audio');
    if (!musicAudio) return;

    if (state.currentTrackIndex === -1 && state.musicPlaylist.length > 0) {
        playTrack(0, playlistSelect, currentTrackNameEl, btnPlayPause);
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

export function nextTrack(playlistSelect, currentTrackNameEl, btnPlayPause) {
    if (state.musicPlaylist.length === 0) return;
    
    if (state.isRepeat) {
        playTrack(state.currentTrackIndex, playlistSelect, currentTrackNameEl, btnPlayPause);
        return;
    }
    
    if (state.isShuffle) {
        const randomIndex = Math.floor(Math.random() * state.musicPlaylist.length);
        playTrack(randomIndex, playlistSelect, currentTrackNameEl, btnPlayPause);
        return;
    }
    
    let nextIndex = state.currentTrackIndex + 1;
    if (nextIndex >= state.musicPlaylist.length) {
        nextIndex = 0;
    }
    playTrack(nextIndex, playlistSelect, currentTrackNameEl, btnPlayPause);
}

export function prevTrack(playlistSelect, currentTrackNameEl, btnPlayPause) {
    if (state.musicPlaylist.length === 0) return;
    
    if (state.isShuffle) {
        const randomIndex = Math.floor(Math.random() * state.musicPlaylist.length);
        playTrack(randomIndex, playlistSelect, currentTrackNameEl, btnPlayPause);
        return;
    }
    
    let prevIndex = state.currentTrackIndex - 1;
    if (prevIndex < 0) {
        prevIndex = state.musicPlaylist.length - 1;
    }
    playTrack(prevIndex, playlistSelect, currentTrackNameEl, btnPlayPause);
}

function getNextTrackIndex() {
    if (state.musicPlaylist.length === 0) return -1;
    if (state.isRepeat) return state.currentTrackIndex;
    if (state.isShuffle) {
        if (state.musicPlaylist.length === 1) return 0;
        let randomIndex = state.currentTrackIndex;
        while (randomIndex === state.currentTrackIndex) {
            randomIndex = Math.floor(Math.random() * state.musicPlaylist.length);
        }
        return randomIndex;
    }
    let nextIndex = state.currentTrackIndex + 1;
    if (nextIndex >= state.musicPlaylist.length) {
        nextIndex = 0;
    }
    return nextIndex;
}

function triggerNextTrackPreload() {
    const nextIndex = getNextTrackIndex();
    if (nextIndex !== -1 && nextIndex !== state.preloadedTrackIndex) {
        preloadTrack(nextIndex);
    }
}

async function preloadTrack(index) {
    if (index < 0 || index >= state.musicPlaylist.length) return;
    if (state.isPreloading || state.preloadedTrackIndex === index) return;
    
    state.isPreloading = true;
    try {
        const track = state.musicPlaylist[index];
        const response = await fetch(`${GOOGLE_SHEETS_URL}?action=getTrack&id=${track.id}`);
        if (response.ok) {
            const base64Data = await response.text();
            if (!base64Data.trim().startsWith('error:') && !base64Data.trim().startsWith('{"error"')) {
                state.preloadedTrackData = base64Data;
                state.preloadedTrackIndex = index;
                console.log(`[Preloader] Track "${track.name}" preloaded in background.`);
            }
        }
    } catch (err) {
        console.error('[Preloader] Error preloading track:', err);
    } finally {
        state.isPreloading = false;
    }
}

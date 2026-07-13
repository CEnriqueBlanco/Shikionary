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

    // Draw initial flat line immediately on load
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--nixie-bg').trim() || '#151110';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2;
    ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--nixie-glow').trim() || '#FF5E13';
    ctx.beginPath();
    ctx.moveTo(0, canvas.height / 2);
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();

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

// Load Music Data from Google Apps Script Web App and public Lofi API
export async function loadMusicData(playlistSelect, musicTrackCount) {
    playlistSelect.innerHTML = '<option value="">Cargando canciones...</option>';
    musicTrackCount.textContent = '0';
    
    // Toggle the button icon and title based on source
    const btnMusicSource = document.getElementById('btn-music-source');
    if (btnMusicSource) {
        if (state.activeMusicSource === 'api-lofi') {
            btnMusicSource.innerHTML = '<i class="fa-solid fa-music"></i>';
            btnMusicSource.title = "Origen: Lofi Beats (Cambiar a Ambient)";
        } else if (state.activeMusicSource === 'api-ambient') {
            btnMusicSource.innerHTML = '<i class="fa-solid fa-leaf"></i>';
            btnMusicSource.title = "Origen: Ambient Focus (Cambiar a Lofi Radio)";
        } else if (state.activeMusicSource === 'radio') {
            btnMusicSource.innerHTML = '<i class="fa-solid fa-radio"></i>';
            btnMusicSource.title = "Origen: Radio Lofi 24/7 (Cambiar a J-Pop Radio)";
        } else if (state.activeMusicSource === 'radio-jpop') {
            btnMusicSource.innerHTML = '<i class="fa-solid fa-compact-disc"></i>';
            btnMusicSource.title = "Origen: J-Pop Radio 24/7 (Cambiar a Drive)";
        } else {
            btnMusicSource.innerHTML = '<i class="fa-solid fa-cloud"></i>';
            btnMusicSource.title = "Origen: Google Drive (Cambiar a Lofi Beats)";
        }
    }
    
    let tracks = [];
    
    if (state.activeMusicSource === 'api-lofi') {
        // 1. Fetch live Lofi tracks from Hearthis.at public music API
        try {
            const randomPage = Math.floor(Math.random() * 10) + 1; // Lower range for stability
            const apiResponse = await fetch(`https://api-v2.hearthis.at/categories/lofi/?page=${randomPage}&count=25`);
            if (apiResponse.ok) {
                let data = await apiResponse.json();
                // Safe fallback: if page is empty, load page 1
                if (!Array.isArray(data) || data.length === 0) {
                    const fallback = await fetch("https://api-v2.hearthis.at/categories/lofi/?page=1&count=25");
                    if (fallback.ok) data = await fallback.json();
                }
                if (Array.isArray(data)) {
                    tracks = data.map(track => ({
                        name: "🎵 " + (track.title || "Lofi Beat"),
                        id: "hearthis-lofi-" + track.id,
                        url: track.preview_url || track.stream_url,
                        isRadio: true
                    }));
                }
            }
        } catch (apiErr) {
            console.warn("Lofi API fetch failed:", apiErr);
        }
    } else if (state.activeMusicSource === 'api-ambient') {
        // 2. Fetch Ambient/Relax tracks from Hearthis.at public music API
        try {
            const randomPage = Math.floor(Math.random() * 5) + 1; // Ambient is smaller, keep page <= 5
            const apiResponse = await fetch(`https://api-v2.hearthis.at/categories/ambient/?page=${randomPage}&count=25`);
            if (apiResponse.ok) {
                let data = await apiResponse.json();
                // Safe fallback: if page is empty, load page 1
                if (!Array.isArray(data) || data.length === 0) {
                    const fallback = await fetch("https://api-v2.hearthis.at/categories/ambient/?page=1&count=25");
                    if (fallback.ok) data = await fallback.json();
                }
                if (Array.isArray(data)) {
                    tracks = data.map(track => ({
                        name: "🌿 " + (track.title || "Ambient Sound"),
                        id: "hearthis-ambient-" + track.id,
                        url: track.preview_url || track.stream_url,
                        isRadio: true
                    }));
                }
            }
        } catch (apiErr) {
            console.warn("Ambient API fetch failed:", apiErr);
        }
    } else if (state.activeMusicSource === 'radio') {
        // 3. Load the working Lofi Hip Hop Radio 24/7 stream (Zeno.fm)
        tracks = [
            {
                name: "📻 Radio Lofi Hip Hop 24/7",
                id: "radio-chillhop",
                url: "https://stream.zeno.fm/0r0xa792kwzuv",
                isRadio: true
            }
        ];
    } else if (state.activeMusicSource === 'radio-jpop') {
        // 4. Load J-Pop Radio 24/7 (Weebio J-Pop stream on Zeno.fm)
        tracks = [
            {
                name: "📻 Radio J-Pop 24/7",
                id: "radio-jpop",
                url: "https://stream.zeno.fm/0aeg7ksv81zuv",
                isRadio: true
            }
        ];
    } else {
        // 3. Fetch user's Google Drive tracks
        const isGoogle = GOOGLE_SHEETS_URL && GOOGLE_SHEETS_URL !== 'PEGA_TU_ENLACE_DE_GOOGLE_APPS_SCRIPT_AQUI';
        if (isGoogle) {
            try {
                const response = await fetch(`${GOOGLE_SHEETS_URL}?action=getMusic`);
                if (response.ok) {
                    const result = await response.json();
                    if (result && Array.isArray(result) && !result.error) {
                        // Filter out tracks larger than 25MB (to prevent Google Drive antivirus blocks)
                        tracks = result.filter(track => {
                            if (!track.size) return true;
                            // Handle bytes, KB, or MB formats safely
                            const sizeInMB = track.size > 1000000 ? track.size / (1024 * 1024) : (track.size > 1000 ? track.size / 1024 : track.size);
                            return sizeInMB < 25;
                        });
                    }
                }
            } catch (err) {
                console.error('Error fetching music from Drive:', err);
            }
        }
    }
    
    // Set playlist using the fetched tracks
    state.musicPlaylist = tracks;
    musicTrackCount.textContent = state.musicPlaylist.length;
    
    playlistSelect.innerHTML = '';
    if (state.musicPlaylist.length > 0) {
        const defaultOpt = document.createElement('option');
        defaultOpt.value = "";
        defaultOpt.textContent = "Selecciona una canción...";
        playlistSelect.appendChild(defaultOpt);
        
        state.musicPlaylist.forEach((track, index) => {
            const opt = document.createElement('option');
            opt.value = index;
            opt.textContent = track.name;
            playlistSelect.appendChild(opt);
        });
    } else {
        playlistSelect.innerHTML = '<option value="">No hay canciones disponibles</option>';
    }
}

// Play a specific track index
export async function playTrack(index, playlistSelect, currentTrackNameEl, btnPlayPause) {
    if (index < 0 || index >= state.musicPlaylist.length) return;
    
    const musicAudio = document.getElementById('music-audio');
    const musicAudioDirect = document.getElementById('music-audio-direct');
    if (!musicAudio || !musicAudioDirect) return;

    // Stop current playback on both elements
    musicAudio.pause();
    musicAudioDirect.pause();
    
    state.currentTrackIndex = index;
    playlistSelect.value = index;
    
    const track = state.musicPlaylist[index];
    currentTrackNameEl.textContent = "Cargando canción...";
    
    // Toggle progress bar visibility for live radio streams vs files
    const progressContainer = document.querySelector('.player-progress-container');
    if (progressContainer) {
        if (track.isRadio) {
            progressContainer.style.setProperty('display', 'none', 'important');
        } else {
            progressContainer.style.setProperty('display', 'flex', 'important');
        }
    }

    try {
        if (track.isRadio) {
            // Direct playback for radio/API streams (bypasses CORS restrictions)
            state.activeAudioId = 'music-audio-direct';
            
            musicAudioDirect.src = track.url;
            currentTrackNameEl.textContent = track.name;
            
            musicAudioDirect.play()
                .then(() => {
                    btnPlayPause.innerHTML = '<i class="fa-solid fa-pause"></i>';
                })
                .catch(err => {
                    if (err.name !== 'NotAllowedError' && err.name !== 'AbortError') {
                        console.error('Playback error:', err);
                        currentTrackNameEl.textContent = "Error al reproducir audio";
                    }
                });
            return; // Skip standard drive loading logic
        }

        // Standard Drive loading logic (uses music-audio which has AudioContext)
        state.activeAudioId = 'music-audio';
        let base64Data = null;
        let useFallback = false;
        
        try {
            if (state.preloadedTrackIndex === index && state.preloadedTrackData) {
                base64Data = state.preloadedTrackData;
                state.preloadedTrackData = null;
                state.preloadedTrackIndex = -1;
            } else {
                const response = await fetch(`${GOOGLE_SHEETS_URL}?action=getTrack&id=${track.id}`);
                if (!response.ok) throw new Error("Fetch failed");
                base64Data = await response.text();
            }
            
            // Abort if the user changed tracks or sources during the asynchronous fetch
            if (state.currentTrackIndex !== index) return;
            
            if (base64Data.trim().startsWith('error:') || base64Data.trim().startsWith('{"error"')) {
                throw new Error("Size limit or server error");
            }
        } catch (fetchErr) {
            // Abort if track changed
            if (state.currentTrackIndex !== index) return;
            console.warn("Apps Script download failed (likely due to size limit). Using Google Drive direct stream fallback:", fetchErr);
            useFallback = true;
        }

        if (useFallback || !base64Data) {
            // FALLBACK: Load directly from Google Drive stream URL
            if (musicAudio.src && musicAudio.src.startsWith('blob:')) {
                URL.revokeObjectURL(musicAudio.src);
            }
            musicAudio.src = `https://docs.google.com/uc?export=download&id=${track.id}`;
            currentTrackNameEl.textContent = track.name + " (Direct Stream)";
        } else {
            // Normal Base64 blob load
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
        }
        
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
    const activeAudio = document.getElementById(state.activeAudioId);
    if (!activeAudio) return;

    if (state.currentTrackIndex === -1 && state.musicPlaylist.length > 0) {
        playTrack(0, playlistSelect, currentTrackNameEl, btnPlayPause);
        return;
    }
    
    if (activeAudio.paused) {
        activeAudio.play()
            .then(() => {
                btnPlayPause.innerHTML = '<i class="fa-solid fa-pause"></i>';
            })
            .catch(err => {
                if (err.name !== 'AbortError') {
                    console.error(err);
                }
            });
    } else {
        activeAudio.pause();
        btnPlayPause.innerHTML = '<i class="fa-solid fa-play"></i>';
    }
}

export async function nextTrack(playlistSelect, currentTrackNameEl, btnPlayPause) {
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
        // Reached the end of the playlist! Fetch a new random batch of lofi songs
        currentTrackNameEl.textContent = "Obteniendo nuevas canciones...";
        const musicTrackCount = document.getElementById('music-track-count');
        await loadMusicData(playlistSelect, musicTrackCount);
        
        // Start playing the first track of the new batch
        if (state.musicPlaylist.length > 0) {
            playTrack(0, playlistSelect, currentTrackNameEl, btnPlayPause);
        }
        return;
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

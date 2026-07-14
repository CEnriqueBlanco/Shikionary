import { state } from './config.js';
import { showAlert } from './modal.js';

let timerId = null;
let timeLeft = 25 * 60; // 25 minutes default
let isRunning = false;
let currentMode = 'work'; // 'work', 'short', 'long'

const modeTimes = {
    work: 25 * 60,
    short: 5 * 60,
    long: 15 * 60
};

export function initPomodoro() {
    const timeDisplay = document.getElementById('pomodoro-time');
    const modeSelect = document.getElementById('pomo-mode-select');
    const btnStart = document.getElementById('btn-pomo-start');
    const btnReset = document.getElementById('btn-pomo-reset');

    // Custom Modal elements
    const pomoModal = document.getElementById('pomo-modal');
    const btnCloseModal = document.getElementById('btn-close-pomo-modal');
    const btnCancelModal = document.getElementById('btn-cancel-pomo-time');
    const btnSaveModal = document.getElementById('btn-save-pomo-time');
    const customInput = document.getElementById('pomo-custom-input');

    if (!timeDisplay || !btnStart || !btnReset) return;

    // Enable single-click to open custom modal duration customizer
    timeDisplay.style.cursor = 'pointer';
    timeDisplay.title = "Haz clic para personalizar el tiempo";
    timeDisplay.addEventListener('click', () => {
        if (pomoModal && customInput) {
            customInput.value = Math.ceil(timeLeft / 60);
            pomoModal.style.display = 'flex';
            customInput.focus();
            customInput.select();
        }
    });

    const hideModal = () => {
        if (pomoModal) pomoModal.style.display = 'none';
    };

    if (btnCloseModal) btnCloseModal.addEventListener('click', hideModal);
    if (btnCancelModal) btnCancelModal.addEventListener('click', hideModal);
    
    // Close modal when clicking outside the content box
    if (pomoModal) {
        pomoModal.addEventListener('click', (e) => {
            if (e.target === pomoModal) hideModal();
        });
    }

    // Save customized duration
    if (btnSaveModal && customInput) {
        btnSaveModal.addEventListener('click', () => {
            const mins = parseInt(customInput.value);
            if (!isNaN(mins) && mins > 0 && mins <= 180) {
                // Mutate the active mode duration so it persists on Reset and mode switches!
                modeTimes[currentMode] = mins * 60;
                timeLeft = modeTimes[currentMode];
                
                isRunning = false;
                if (timerId) {
                    clearInterval(timerId);
                    timerId = null;
                }
                btnStart.innerHTML = '<i class="fa-solid fa-play"></i>';
                updateDisplay();
                hideModal();
            } else {
                showAlert('Por favor, ingresa un número de minutos válido entre 1 y 180.', 'Tiempo inválido', 'warning');
            }
        });

        // Allow pressing Enter key to save
        customInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                btnSaveModal.click();
            }
        });
    }

    function updateDisplay() {
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        timeDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    function switchMode(mode) {
        currentMode = mode;
        timeLeft = modeTimes[mode];
        isRunning = false;
        if (timerId) {
            clearInterval(timerId);
            timerId = null;
        }
        btnStart.innerHTML = '<i class="fa-solid fa-play"></i>';
        
        if (modeSelect) {
            modeSelect.value = mode;
        }
        
        updateDisplay();
    }

    if (modeSelect) {
        modeSelect.addEventListener('change', (e) => {
            switchMode(e.target.value);
        });
    }

    btnStart.addEventListener('click', () => {
        if (isRunning) {
            isRunning = false;
            if (timerId) {
                clearInterval(timerId);
                timerId = null;
            }
            btnStart.innerHTML = '<i class="fa-solid fa-play"></i>';
        } else {
            isRunning = true;
            btnStart.innerHTML = '<i class="fa-solid fa-pause"></i>';
            timerId = setInterval(() => {
                if (timeLeft > 0) {
                    timeLeft--;
                    updateDisplay();
                } else {
                    isRunning = false;
                    clearInterval(timerId);
                    timerId = null;
                    btnStart.innerHTML = '<i class="fa-solid fa-play"></i>';
                    
                    playAlarmSound();
                    pauseMusic();
                    
                    const messages = {
                        work: "¡Buen trabajo! Hora de tomar un descanso.",
                        short: "El descanso corto ha terminado. ¡A estudiar!",
                        long: "El descanso largo ha terminado. ¡Regresemos al trabajo!"
                    };
                    showAlert(messages[currentMode], '⏱ Pomodoro', 'info').then(() => {
                        // Auto switch modes
                        if (currentMode === 'work') {
                            switchMode('short');
                        } else {
                            switchMode('work');
                        }
                    });
                }
            }, 1000);
        }
    });

    btnReset.addEventListener('click', () => {
        switchMode(currentMode);
    });

    updateDisplay();
}

function playAlarmSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
        
        osc.start();
        
        setTimeout(() => {
            osc.stop();
            audioCtx.close();
        }, 1200);
    } catch (e) {
        console.error('Synthesized alarm beep failed:', e);
    }
}

function pauseMusic() {
    const activeAudio = document.getElementById(state.activeAudioId);
    if (activeAudio && !activeAudio.paused) {
        activeAudio.pause();
        const btnPlayPause = document.getElementById('btn-play-pause');
        if (btnPlayPause) {
            btnPlayPause.innerHTML = '<i class="fa-solid fa-play"></i>';
        }
    }
}

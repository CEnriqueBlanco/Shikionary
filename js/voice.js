// Voice Recognition module for pronunciation practice
import { showAlert } from './modal.js';
let recognition = null;
let isListening = false;

export function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        console.warn('Reconocimiento de voz no soportado en este navegador.');
        return false;
    }
    
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-US'; // Practice pronunciation in English!
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    return true;
}

export function toggleSpeechRecognition(targetWord, btnMic, onResult, langCode = 'en-US') {
    if (!recognition) {
        if (!initSpeechRecognition()) {
            showAlert('El reconocimiento de voz no está soportado en este navegador. Te recomendamos usar Google Chrome.', 'Voz no compatible', 'error');
            return;
        }
    }

    recognition.lang = langCode;

    if (isListening) {
        recognition.stop();
        return;
    }

    isListening = true;
    btnMic.classList.add('recording');
    btnMic.innerHTML = '<i class="fa-solid fa-microphone fa-spin"></i>';
    btnMic.setAttribute('title', 'Escuchando... Di la palabra mostrada.');

    recognition.onresult = (event) => {
        const spokenWord = event.results[0][0].transcript.toLocaleLowerCase().trim().replace(/[^\p{L}\p{N}\s]/gu, '');
        const cleanTarget = targetWord.toLocaleLowerCase().trim().replace(/[^\p{L}\p{N}\s]/gu, '');
        
        const isMatch = spokenWord === cleanTarget;
        onResult({
            success: isMatch,
            spoken: spokenWord,
            target: cleanTarget,
            confidence: event.results[0][0].confidence
        });
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        btnMic.classList.remove('recording');
        btnMic.innerHTML = '<i class="fa-solid fa-microphone"></i>';
        isListening = false;
        
        let errorMsg = 'Error al grabar.';
        if (event.error === 'no-speech') errorMsg = 'No se detectó voz. Inténtalo de nuevo.';
        else if (event.error === 'not-allowed') errorMsg = 'Permiso denegado para usar el micrófono.';
        showAlert(errorMsg, 'Error de Grabación', 'error');
    };

    recognition.onend = () => {
        btnMic.classList.remove('recording');
        btnMic.innerHTML = '<i class="fa-solid fa-microphone"></i>';
        btnMic.setAttribute('title', 'Escuchar pronunciación por micrófono');
        isListening = false;
    };

    try {
        recognition.start();
    } catch (e) {
        console.error(e);
    }
}

// Voice Recognition module for pronunciation practice
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

export function toggleSpeechRecognition(targetWord, btnMic, onResult) {
    if (!recognition) {
        if (!initSpeechRecognition()) {
            alert('El reconocimiento de voz no está soportado en este navegador. Te recomendamos usar Google Chrome.');
            return;
        }
    }

    if (isListening) {
        recognition.stop();
        return;
    }

    isListening = true;
    btnMic.classList.add('recording');
    btnMic.innerHTML = '<i class="fa-solid fa-microphone fa-spin"></i>';
    btnMic.setAttribute('title', 'Escuchando... Di la palabra en inglés.');

    recognition.onresult = (event) => {
        const spokenWord = event.results[0][0].transcript.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '');
        const cleanTarget = targetWord.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '');
        
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
        alert(errorMsg);
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

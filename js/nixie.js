import { state } from './config.js';

// Nixie Tube Divergence calculation with flicker animation and World Line tracking
export function updateDivergenceMeter() {
    const divergenceMeter = document.getElementById('divergence-meter');
    const divergenceContainer = document.querySelector('.divergence-container');
    if (!divergenceMeter) return;

    const baseDivergence = 1.048596;
    const shiftPerWord = 0.000023;
    const targetDivergence = baseDivergence + (state.savedWords.length * shiftPerWord);
    
    // Nixie Tube Flicker Animation
    let iterations = 0;
    const maxIterations = 15;
    const intervalTime = 30; // 30ms between numbers

    // Add class for neon glow pulsing during change
    divergenceMeter.classList.add('nixie-updating');
    
    const interval = setInterval(() => {
        // Generate random fake divergence during transition
        const fakeVal = (Math.random() * 2).toFixed(6);
        divergenceMeter.textContent = fakeVal;
        
        iterations++;
        if (iterations >= maxIterations) {
            clearInterval(interval);
            divergenceMeter.textContent = targetDivergence.toFixed(6);
            divergenceMeter.classList.remove('nixie-updating');
            
            // Update World Line Tooltip/Label
            updateWorldLineInfo(state.savedWords.length, targetDivergence);
        }
    }, intervalTime);
}

function updateWorldLineInfo(wordCount, divergence) {
    const container = document.querySelector('.divergence-container');
    if (!container) return;

    let lineName = 'Línea Alfa (α)';
    let description = 'Atracción de línea de campo fuerte. Kurisu te observa con escepticismo.';
    let themeColorClass = 'worldline-alpha';

    if (wordCount >= 20 && wordCount < 50) {
        lineName = 'Línea Beta (β)';
        description = 'El futuro es incierto. El laboratorio sigue investigando nuevas palabras.';
        themeColorClass = 'worldline-beta';
    } else if (wordCount >= 50) {
        lineName = 'Línea Steins;Gate';
        description = '¡El camino al futuro ideal está abierto! Operación Skuld completada.';
        themeColorClass = 'worldline-sg';
    }

    container.setAttribute('title', `Divergencia: ${divergence.toFixed(6)}%\nLínea Actual: ${lineName}\n${description}`);
    
    // Set class to divergence container
    container.classList.remove('worldline-alpha', 'worldline-beta', 'worldline-sg');
    container.classList.add(themeColorClass);
}

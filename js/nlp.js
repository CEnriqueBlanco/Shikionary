// Helper to capitalize string
export function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// Helper to generate structured sentences (Affirmative, Negative, Interrogative) by Tense
export function getStructuredTemplates(word, partOfSpeech, tense = 'present') {
    const w = word.toLowerCase().trim();
    const pos = partOfSpeech ? partOfSpeech.toLowerCase() : 'noun';
    
    // Check if it's a multi-word phrase (contains spaces)
    if (w.includes(' ')) {
        if (tense === 'past') {
            return [
                { type: 'Afirmativo', en: `Yesterday, he decided to ${w}.` },
                { type: 'Negativo', en: `We did not need to ${w} last week.` },
                { type: 'Interrogativo', en: `Did you have to ${w} in that situation?` }
            ];
        } else if (tense === 'future') {
            return [
                { type: 'Afirmativo', en: `I think you will have to ${w} tomorrow.` },
                { type: 'Negativo', en: `They will not try to ${w} next time.` },
                { type: 'Interrogativo', en: `Will we need to ${w} in the future?` }
            ];
        } else { // present
            return [
                { type: 'Afirmativo', en: `It is important to ${w} when learning.` },
                { type: 'Negativo', en: `You do not need to ${w} in this case.` },
                { type: 'Interrogativo', en: `Do you think it is normal to ${w}?` }
            ];
        }
    }
    
    if (pos === 'verb') {
        if (tense === 'past') {
            return [
                { type: 'Afirmativo', en: `He decided to ${w} the documents yesterday.` },
                { type: 'Negativo', en: `We did not ${w} the goal last week.` },
                { type: 'Interrogativo', en: `Did you ${w} that yesterday?` }
            ];
        } else if (tense === 'future') {
            return [
                { type: 'Afirmativo', en: `I will ${w} the project tomorrow.` },
                { type: 'Negativo', en: `They will not ${w} the truth next time.` },
                { type: 'Interrogativo', en: `Will you ${w} this lesson later?` }
            ];
        } else { // present
            return [
                { type: 'Afirmativo', en: `I always try to ${w} and learn new things.` },
                { type: 'Negativo', en: `She does not ${w} in her spare time.` },
                { type: 'Interrogativo', en: `Do you want to ${w} this project?` }
            ];
        }
    } else if (pos === 'adjective') {
        if (tense === 'past') {
            return [
                { type: 'Afirmativo', en: `That lecture was very ${w} yesterday.` },
                { type: 'Negativo', en: `The initial plan was not ${w} at all.` },
                { type: 'Interrogativo', en: `Was the explanation clear and ${w}?` }
            ];
        } else if (tense === 'future') {
            return [
                { type: 'Afirmativo', en: `This new system will be very ${w}.` },
                { type: 'Negativo', en: `The next exam will not be ${w}.` },
                { type: 'Interrogativo', en: `Will it be ${w} to complete this task?` }
            ];
        } else { // present
            return [
                { type: 'Afirmativo', en: `This topic is very ${w} for the project.` },
                { type: 'Negativo', en: `The overall results were not ${w} enough.` },
                { type: 'Interrogativo', en: `Is the explanation clear and ${w}?` }
            ];
        }
    } else { // noun or anything else
        if (tense === 'past') {
            return [
                { type: 'Afirmativo', en: `He bought a new ${w} yesterday.` },
                { type: 'Negativo', en: `We did not have a ${w} last year.` },
                { type: 'Interrogativo', en: `Where was the ${w} yesterday?` }
            ];
        } else if (tense === 'future') {
            return [
                { type: 'Afirmativo', en: `We will buy a new ${w} tomorrow.` },
                { type: 'Negativo', en: `There will not be any ${w} next week.` },
                { type: 'Interrogativo', en: `Will you need a ${w} for the trip?` }
            ];
        } else { // present
            return [
                { type: 'Afirmativo', en: `We need a good ${w} to finish the job.` },
                { type: 'Negativo', en: `There is no ${w} available right now.` },
                { type: 'Interrogativo', en: `Do you know where the ${w} is?` }
            ];
        }
    }
}

// Generate Question structure based on auxiliary verbs and NLP analysis
export function makeQuestionNLP(sentence, tense) {
    let cleanSentence = sentence.trim().replace(/\.$/, '');
    if (typeof nlp === 'undefined') return cleanSentence + "?";
    
    let doc = nlp(cleanSentence);
    let words = cleanSentence.split(/\s+/);
    if (words.length === 0) return sentence + "?";
    
    const auxVerbs = ["is", "am", "are", "was", "were", "will", "would", "should", "could", "can", "have", "has", "had", "do", "does", "did"];
    
    let auxIndex = -1;
    let foundAux = null;
    for (let i = 0; i < words.length; i++) {
        let normalizedWord = words[i].toLowerCase().replace(/[^a-z]/g, '');
        if (auxVerbs.includes(normalizedWord)) {
            foundAux = words[i];
            auxIndex = i;
            break;
        }
    }
    
    if (foundAux && auxIndex !== -1) {
        let rest = words.filter((_, idx) => idx !== auxIndex);
        return `${capitalize(foundAux)} ${rest.join(' ')}?`;
    }
    
    let verbText = "";
    try {
        let verbList = doc.verbs().json();
        if (verbList && verbList.length > 0) {
            verbText = verbList[0].text;
        }
    } catch (e) {}
    
    let aux = "Do";
    if (tense === 'past') {
        aux = "Did";
    } else {
        if (verbText && verbText.toLowerCase().endsWith('s') && !verbText.toLowerCase().endsWith('ss')) {
            aux = "Does";
        }
    }
    
    if (verbText) {
        let baseVerb = verbText;
        try {
            baseVerb = nlp(verbText).verbs().toInfinitive().text() || verbText;
        } catch (e) {}
        
        let verbIdx = words.findIndex(w => w.toLowerCase().replace(/[^a-z]/g, '') === verbText.toLowerCase().replace(/[^a-z]/g, ''));
        if (verbIdx !== -1) {
            words[verbIdx] = baseVerb;
        }
    }
    
    return `${aux} ${words.join(' ')}?`;
}

// Transform sentence using compromise.js
export function transformSentenceNLP(sentence, tense) {
    if (typeof nlp === 'undefined') {
        console.warn('compromise.js is not loaded');
        return null;
    }
    
    try {
        let cleanSentence = sentence.trim().replace(/\.$/, '');
        let doc = nlp(cleanSentence);
        
        // 1. Change Tense
        if (tense === 'past') {
            doc.verbs().toPastTense();
        } else if (tense === 'future') {
            doc.verbs().toFutureTense();
        } else {
            doc.verbs().toPresentTense();
        }
        
        let affirmative = doc.text();
        
        // 2. Generate Negative
        let negDoc = nlp(affirmative);
        negDoc.sentences().toNegative();
        let negative = negDoc.text();
        
        // 3. Generate Interrogative
        let question = makeQuestionNLP(affirmative, tense);
        
        return {
            affirmative: capitalize(affirmative.trim() + "."),
            negative: capitalize(negative.trim() + "."),
            interrogative: capitalize(question.trim())
        };
    } catch (err) {
        console.error('Error in NLP sentence transformation:', err);
        return null;
    }
}

// Generate examples array and translate them in real-time
export async function generateAndTranslateExamples(word, partOfSpeech, tense, baseSentence = null) {
    let templates = [];
    
    if (baseSentence) {
        const transformed = transformSentenceNLP(baseSentence, tense);
        if (transformed) {
            templates = [
                { type: 'Afirmativo', en: transformed.affirmative },
                { type: 'Negativo', en: transformed.negative },
                { type: 'Interrogativo', en: transformed.interrogative }
            ];
        }
    }
    
    if (templates.length === 0) {
        templates = getStructuredTemplates(word, partOfSpeech, tense);
    }
    
    let examples = [];
    
    for (const temp of templates) {
        let exampleEs = '';
        try {
            const exTransUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(temp.en)}&langpair=en|es`;
            const exTransRes = await fetch(exTransUrl);
            if (exTransRes.ok) {
                const exTransData = await exTransRes.json();
                exampleEs = exTransData.responseData.translatedText;
            }
        } catch (e) {
            console.log('Error translating example:', e);
            exampleEs = 'Traducción no disponible';
        }
        examples.push({
            type: temp.type,
            en: temp.en,
            es: exampleEs
        });
    }
    return examples;
}

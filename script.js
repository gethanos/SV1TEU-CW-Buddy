/*
Copyright (c) 2026 Georgalas Athanasios Antonios, SV1TEU

This software is released under the MIT License.
See the LICENSE file in the repository root for full license text.
*/

// Morse code mapping
const morseMap = {
    'A':'.-', 'B':'-...', 'C':'-.-.', 'D':'-..', 'E':'.', 'F':'..-.', 'G':'--.',
    'H':'....', 'I':'..', 'J':'.---', 'K':'-.-', 'L':'.-..', 'M':'--',
    'N':'-.', 'O':'---', 'P':'.--.', 'Q':'--.-', 'R':'.-.', 'S':'...', 'T':'-',
    'U':'..-', 'V':'...-', 'W':'.--', 'X':'-..-', 'Y':'-.--', 'Z':'--..',
    '0':'-----', '1':'.----', '2':'..---', '3':'...--', '4':'....-',
    '5':'.....', '6':'-....', '7':'--...', '8':'---..', '9':'----.',
    '/':'-..-.', '?':'..--..', '=':'-...-', '.':'.-.-.-', ',':'--..--'
};

// Templates
const templates = {
  // Mid‑QSO “next overs” (no CQ, no SK — meant for the middle of a contact)
  short: [
    "{DX} DE {MY} KN",
    "{DX} DE {MY} UR RST {RST} {RST} KN",
    "TNX FER CALL {DX} DE {MY} KN"
  ],

  // Full QSO / friendly ragchew (includes close)
  relaxed: [
    "CQ CQ CQ DE {MY} {MY} K",
    "{DX} DE {MY} KN",
    "{DX} DE {MY} UR RST {RST} {RST} KN",
    "{NAME_LINE}",
    "{QTH_LINE}",
    "{RIG_LINE}",
    "{INFO_END_RELAXED}",
    "TNX FER QSO 73 DE {MY} SK"
  ],

  // Formal / common CW etiquette (structured, explicit ending)
  formal: [
    "CQ CQ CQ DE {MY} {MY} K",
    "{DX} DE {MY} KN",
    "{DX} DE {MY} UR RST {RST} {RST} KN",
    "{NAME_LINE}",
    "{QTH_LINE}",
    "{INFO_END_FORMAL}",
    "TNX FER QSO {DX} DE {MY} 73 SK"
  ]
};
// State
let textPlayback = {
    isPlaying: false,
    type: 'phonetic',
    speed: 1.0,
    currentUtterance: null
};

let cwPlayback = {
    isPlaying: false,
    type: 'cw',
    wpm: 15,
    frequency: 700,
    audioContext: null
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupControls();
    loadProfile();
    updateOutput();
    
    // Add real-time listeners
    const inputs = ['myCall', 'dxCall', 'myRST', 'myName', 'myQTH', 'myRIG', 'profile', 'hwcpy', 'qsoText'];
    inputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('input', updateOutput);
            element.addEventListener('change', updateOutput);
        }
    });
});

function setupControls() {
    // Text speed
    const textSpeed = document.getElementById('text-speed');
    const textSpeedValue = document.getElementById('text-speed-value');
    textSpeed.addEventListener('input', (e) => {
        const speed = parseFloat(e.target.value);
        textSpeedValue.textContent = `${speed.toFixed(1)}x`;
        textPlayback.speed = speed;
    });
    
    // CW speed
    const cwSpeed = document.getElementById('cw-speed');
    const cwSpeedValue = document.getElementById('cw-speed-value');
    cwSpeed.addEventListener('input', (e) => {
        const wpm = parseInt(e.target.value);
        cwSpeedValue.textContent = `${wpm} WPM`;
        cwPlayback.wpm = wpm;
    });
    
    // CW frequency
    const cwFrequency = document.getElementById('cw-frequency');
    const cwFrequencyValue = document.getElementById('cw-frequency-value');
    cwFrequency.addEventListener('input', (e) => {
        const freq = parseInt(e.target.value);
        cwFrequencyValue.textContent = `${freq} Hz`;
        cwPlayback.frequency = freq;
    });
    
    // Profile change
    document.getElementById('profile').addEventListener('change', loadProfile);
}

function loadProfile() {
    const profile = document.getElementById('profile').value;
    const qsoTextArea = document.getElementById('qsoText');
    
    if (profile === 'custom') {
        qsoTextArea.placeholder = 'Write your custom QSO template here...';
    } else {
        qsoTextArea.value = templates[profile].join('\n');
        updateOutput();
    }
}

function updateOutput() {
    const myRST = document.getElementById('myRST').value.trim().toUpperCase();
    const data = {
        MY: document.getElementById('myCall').value.toUpperCase().trim(),
        DX: document.getElementById('dxCall').value.toUpperCase().trim(),
        RST: myRST || '5NN',
        NAME: document.getElementById('myName').value.toUpperCase().trim(),
        QTH: document.getElementById('myQTH').value.toUpperCase().trim(),
        RIG: document.getElementById('myRIG').value.toUpperCase().trim()
    };

    if (!data.MY || !data.DX) {
        document.getElementById('expandedText').innerHTML = 'Generated text will appear here...';
        document.getElementById('morseOutput').textContent = 'Generated Morse code will appear here...';
        return;
    }

    // Create the special lines only if data exists
    data.NAME_LINE = data.NAME ? `NAME ${data.NAME} ${data.NAME}` : '';
    data.QTH_LINE = data.QTH ? `QTH ${data.QTH} ${data.QTH}` : '';
    data.RIG_LINE = data.RIG ? `RIG ${data.RIG}` : '';
   // Add a handover marker only if at least one info line exists
   const hasInfo = Boolean(data.NAME_LINE || data.QTH_LINE || data.RIG_LINE);
   data.INFO_END_RELAXED = hasInfo ? 'BK' : '';
   data.INFO_END_FORMAL  = hasInfo ? 'KN' : '';

    // Get template
    const templateText = document.getElementById('qsoText').value;
    let lines = templateText.split('\n').filter(line => line.trim());
    
    if (lines.length === 0) {
        document.getElementById('expandedText').innerHTML = 'Generated text will appear here...';
        document.getElementById('morseOutput').textContent = 'Generated Morse code will appear here...';
        return;
    }

    // Process lines and filter out empty ones after substitution
    lines = lines
        .map(line => {
            for (const key in data) {
                if (data[key]) {
                    line = line.replaceAll(`{${key}}`, data[key]);
                }
            }
            return line.trim();
        })
        .filter(line => {
            // Filter out lines that are just empty placeholders
            // This removes lines like "NAME  " or "QTH  " when data is empty
            if (line === '' || line === 'NAME' || line === 'QTH' || line === 'RIG') {
                return false;
            }
            // Filter out lines that only contain template variables that weren't replaced
            if (line.includes('{') && line.includes('}')) {
                return false;
            }
            return true;
        });

    // Add HW CPY line if checked
    if (document.getElementById('hwcpy').checked) {
        lines.push(`HW CPY? ${data.DX} DE ${data.MY} KN`);
    }

    // Final filter to remove any empty lines
    lines = lines.filter(l => l.trim() !== '');

    // Format expanded text
    const expanded = lines.join('\n');
    const highlightedText = expanded.replace(
        new RegExp(`\\b(${data.MY}|${data.DX}|CQ)\\b`, 'gi'),
        '<span class="callsign">$1</span>'
    );
    document.getElementById('expandedText').innerHTML = highlightedText || 'No content generated';
    
    // Store for playback
    window.expandedTextForPlayback = expanded;
    
    // Generate Morse code
    const morseLines = [];
    const rawMorseSequences = [];
    
    for (const line of lines) {
        const morseWords = [];
        const words = line.split(' ');
        
        for (const word of words) {
            const morseChars = [];
            for (const char of word.toUpperCase()) {
                const morse = morseMap[char] || '';
                morseChars.push(morse);
                rawMorseSequences.push(morse);
            }
            morseWords.push(morseChars.join(' '));
        }
        morseLines.push(morseWords.join(' / '));
    }
    
    // Store for playback
    window.rawMorseForPlayback = rawMorseSequences;
    
    document.getElementById('morseOutput').textContent = morseLines.join('\n') || 'No Morse code generated';
}

// Text Playback - Simplified (phonetic disabled for Firefox)
function setTextPlaybackType(type) {
    textPlayback.type = type;
    document.getElementById('text-phonetic-btn').classList.toggle('active', type === 'phonetic');
    document.getElementById('text-normal-btn').classList.toggle('active', type === 'normal');
}

function playText() {
    if (textPlayback.isPlaying) {
        stopTextPlayback();
        return;
    }
    
    const text = window.expandedTextForPlayback;
    if (!text) return;
    
    textPlayback.isPlaying = true;
    updatePlaybackUI('text', true);
    
    // Always use normal playback for now (phonetic disabled for Firefox)
    const cleanText = stripHtml(text);
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = textPlayback.speed;
    utterance.onend = () => {
        textPlayback.currentUtterance = null;
        stopTextPlayback();
    };
    utterance.onerror = () => {
        textPlayback.currentUtterance = null;
        stopTextPlayback();
    };
    textPlayback.currentUtterance = utterance;
    speechSynthesis.speak(utterance);
}

function stripHtml(html) {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return temp.textContent || temp.innerText || '';
}

function stopTextPlayback() {
    if (textPlayback.isPlaying) {
        textPlayback.isPlaying = false;
        if (textPlayback.currentUtterance) {
            speechSynthesis.cancel();
            textPlayback.currentUtterance = null;
        }
        updatePlaybackUI('text', false);
    }
}

// CW Playback
function setMorsePlaybackType(type) {
    cwPlayback.type = type;
    document.getElementById('morse-cw-btn').classList.toggle('active', type === 'cw');
    document.getElementById('morse-phonetic-btn').classList.toggle('active', type === 'phonetic');
}

function playCW() {
    if (cwPlayback.type === 'phonetic') {
        playText();
        return;
    }
    
    if (cwPlayback.isPlaying) {
        stopCWPlayback();
        return;
    }
    
    const rawMorseSequences = window.rawMorseForPlayback;
    if (!rawMorseSequences || rawMorseSequences.length === 0) return;
    
    cwPlayback.isPlaying = true;
    updatePlaybackUI('morse', true);
    
    playMorseSequence(rawMorseSequences, 0);
}

function playMorseSequence(sequences, index) {
    if (!cwPlayback.isPlaying || index >= sequences.length) {
        stopCWPlayback();
        return;
    }
    
    const morse = sequences[index];
    if (!morse) {
        setTimeout(() => playMorseSequence(sequences, index + 1), 100);
        return;
    }
    
    let delay = 0;
    const ditDuration = 1200 / cwPlayback.wpm; // ms
    
    // Play each symbol
    for (let i = 0; i < morse.length; i++) {
        const symbol = morse[i];
        if (symbol === '.') {
            setTimeout(() => playBeep(cwPlayback.frequency, ditDuration), delay);
            delay += ditDuration;
        } else if (symbol === '-') {
            setTimeout(() => playBeep(cwPlayback.frequency, ditDuration * 3), delay);
            delay += ditDuration * 3;
        }
        delay += ditDuration; // Intra-character gap
    }
    
    // Inter-character gap
    delay += ditDuration * 2;
    
    setTimeout(() => playMorseSequence(sequences, index + 1), delay);
}

function playBeep(frequency, duration) {
    try {
        if (!cwPlayback.audioContext) {
            cwPlayback.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        const oscillator = cwPlayback.audioContext.createOscillator();
        const gainNode = cwPlayback.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(cwPlayback.audioContext.destination);
        
        oscillator.frequency.value = frequency;
        oscillator.type = 'sine';
        
        const now = cwPlayback.audioContext.currentTime;
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.3, now + 0.001);
        gainNode.gain.setValueAtTime(0.3, now + duration/1000 - 0.001);
        gainNode.gain.linearRampToValueAtTime(0, now + duration/1000);
        
        oscillator.start(now);
        oscillator.stop(now + duration/1000);
    } catch (error) {
        console.error('Audio error:', error);
    }
}

function stopCWPlayback() {
    if (cwPlayback.isPlaying) {
        cwPlayback.isPlaying = false;
        updatePlaybackUI('morse', false);
    }
}

// UI Functions
function updatePlaybackUI(type, isPlaying) {
    const playBtn = document.getElementById(`play-${type === 'text' ? 'text' : 'morse'}-btn`);
    const stopBtn = document.getElementById(`stop-${type === 'text' ? 'text' : 'morse'}-btn`);
    const statusDot = document.getElementById(`${type}-status-dot`);
    const statusText = document.getElementById(`${type}-status-text`);
    
    if (isPlaying) {
        playBtn.disabled = true;
        stopBtn.disabled = false;
        statusDot.classList.add('playing');
        statusText.textContent = 'Playing';
    } else {
        playBtn.disabled = false;
        stopBtn.disabled = true;
        statusDot.classList.remove('playing');
        statusText.textContent = 'Ready';
    }
}

function copyToClipboard(elementId) {
    const element = document.getElementById(elementId);
    let text = '';
    
    if (elementId === 'expandedText') {
        text = stripHtml(element.innerHTML);
    } else {
        text = element.textContent || '';
    }
    
    navigator.clipboard.writeText(text).then(() => {
        // Simple feedback
        const original = elementId === 'expandedText' ? element.innerHTML : element.textContent;
        if (elementId === 'expandedText') {
            element.innerHTML = '✓ Copied!';
        } else {
            element.textContent = '✓ Copied!';
        }
        setTimeout(() => {
            if (elementId === 'expandedText') {
                element.innerHTML = original;
            } else {
                element.textContent = original;
            }
        }, 1000);
    });
}

// Cleanup
window.addEventListener('beforeunload', () => {
    stopTextPlayback();
    stopCWPlayback();
    if (cwPlayback.audioContext) {
        cwPlayback.audioContext.close();
    }
});

// Pause playback when page is hidden
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        stopTextPlayback();
        stopCWPlayback();
    }
});

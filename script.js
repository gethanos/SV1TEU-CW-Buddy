/*
Copyright (c) 2026 Georgalas Athanasios Antonios, SV1TEU

This software is released under the MIT License.
See the LICENSE file in the repository root for full license text.
*/

// ---------------------------------------------------------------------------
// Morse code mapping (standard characters)
// ---------------------------------------------------------------------------
const morseMap = {
    'A':'.-',    'B':'-...',  'C':'-.-.',  'D':'-..',   'E':'.',
    'F':'..-.',  'G':'--.',   'H':'....',  'I':'..',    'J':'.---',
    'K':'-.-',   'L':'.-..',  'M':'--',    'N':'-.',    'O':'---',
    'P':'.--.',  'Q':'--.-',  'R':'.-.',   'S':'...',   'T':'-',
    'U':'..-',   'V':'...-',  'W':'.--',   'X':'-..-',  'Y':'-.--',
    'Z':'--..',
    '0':'-----', '1':'.----', '2':'..---', '3':'...--', '4':'....-',
    '5':'.....', '6':'-....', '7':'--...', '8':'---..', '9':'----.',
    '/':'-..-.',  '?':'..--..',  '=':'-...-',  '.':'.-.-.-',  ',':'--..--'
};

// ---------------------------------------------------------------------------
// Prosign map — sequences sent WITHOUT intra-character gaps (fused)
// The token format used in templates is <XX>
// ---------------------------------------------------------------------------
const prosignMap = {
    '<AR>': '.-.-.',    // End of message / over (A+R fused)
    '<AS>': '.-...',    // Wait / stand by   (A+S fused)
    '<BT>': '-...-',    // Break / separator  (B+T fused) — same as =
    '<KA>': '-.-.-',    // Starting signal    (K+A fused) — common in formal CW
    '<KN>': '-.--.',    // Go ahead, specific station only (K+N fused)
    '<SK>': '...-.-',   // End of contact     (S+K fused) — alias of <VA>
    '<VA>': '...-.-',   // End of contact     (V+A fused) — correct ITU prosign
    '<VE>': '...-.',    // Obsolete / rarely used
    '<R>':  '.-.'       // Understood / acknowledged (ITU formal)
};

// ---------------------------------------------------------------------------
// Human-readable labels for the toolkit panel
// ---------------------------------------------------------------------------
const prosignLabels = {
    '<KA>': { label: 'KA',  title: 'Starting signal — attention / beginning of transmission (formal procedure)', type: 'ITU formal', usage: 'rare, formal traffic, training' },
    '<AR>': { label: 'AR',  title: 'End of message (no invitation to reply)', type: 'ITU formal', usage: 'standard end of message in CW' },
    '<KN>': { label: 'KN',  title: 'Go ahead — specific station only (operational, non-ITU)', type: 'operational', usage: 'common in amateur directed QSOs' },
    '<BT>': { label: 'BT',  title: 'Separator / break between sections', type: 'ITU formal', usage: 'message structuring' },
    '<AS>': { label: 'AS',  title: 'Wait / stand by', type: 'ITU formal', usage: 'pause or pending message' },
    '<VA>': { label: 'VA',  title: 'End of transmission — no reply expected (formal ITU signal)', type: 'ITU formal', usage: 'bulletins, announcements, final transmission; formal QSO closure' },
    '<SK>': { label: 'SK',  title: 'End of contact (common amateur prosign; same signal as VA)', type: 'amateur operational', usage: 'common QSO closing in amateur CW; identical Morse to VA' },
    '<R>':  { label: 'R',   title: 'Understood / acknowledged (ITU formal)', type: 'ITU formal', usage: 'acknowledgment of message' }
};

// NATO phonetic alphabet — used only for callsign expansion in TTS mode
// ---------------------------------------------------------------------------
const phoneticAlphabet = {
    'A': 'Alpha',    'B': 'Bravo',    'C': 'Charlie', 'D': 'Delta',
    'E': 'Echo',     'F': 'Foxtrot',  'G': 'Golf',    'H': 'Hotel',
    'I': 'India',    'J': 'Juliet',   'K': 'Kilo',    'L': 'Lima',
    'M': 'Mike',     'N': 'November', 'O': 'Oscar',   'P': 'Papa',
    'Q': 'Quebec',   'R': 'Romeo',    'S': 'Sierra',  'T': 'Tango',
    'U': 'Uniform',  'V': 'Victor',   'W': 'Whiskey', 'X': 'X-ray',
    'Y': 'Yankee',   'Z': 'Zulu',
    '0': 'Zero',     '1': 'One',      '2': 'Two',     '3': 'Three',
    '4': 'Four',     '5': 'Five',     '6': 'Six',     '7': 'Seven',
    '8': 'Eight',    '9': 'Niner'
};

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------
const templates = {
    // Mid-QSO "next overs" — plain abbreviations are fine here
    short: [
        "{DX} DE {MY} KN",
        "{DX} DE {MY} UR RST {RST} {RST} KN",
        "TNX FER CALL {DX} DE {MY} KN"
    ],

    // Full QSO / friendly ragchew — plain abbreviations
    relaxed: [
        "CQ CQ CQ DE {MY} {MY} K",
        "{DX} DE {MY} KN",
        "{DX} DE {MY} UR RST {RST} {RST} KN",
        "NAME {NAME} {NAME}",
        "QTH {QTH} {QTH}",
        "RIG {RIG}",
        "TNX FER QSO 73 DE {MY} SK"
    ],

    // Formal / correct ITU procedure — full prosign usage
    formal: [
        "<KA> CQ CQ CQ DE {MY} {MY} {MY} <AR> K",
        "<KA> {DX} DE {MY} <KN>",
        "<KA> {DX} DE {MY} <BT> UR RST {RST} {RST}{INFO} <BT> HW CPY {DX} DE {MY} <KN>",
        "<KA> TNX FER QSO {DX} 73 DE {MY} <VA>"
    ]
};

// ---------------------------------------------------------------------------
// Playback state
// ---------------------------------------------------------------------------
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
    audioContext: null,
    scheduledTimeouts: []   // all pending setTimeout IDs so Stop can cancel them
};

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    setupControls();
    loadProfile();
    updateOutput();
    buildProsignToolkit();

    const inputs = ['myCall', 'dxCall', 'myRST', 'myName', 'myQTH', 'myRIG', 'profile', 'hwcpy', 'qsoText'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', updateOutput);
            el.addEventListener('change', updateOutput);
        }
    });
});

function setupControls() {
    const textSpeed = document.getElementById('text-speed');
    const textSpeedValue = document.getElementById('text-speed-value');
    textSpeed.addEventListener('input', e => {
        const speed = parseFloat(e.target.value);
        textSpeedValue.textContent = `${speed.toFixed(1)}x`;
        textPlayback.speed = speed;
    });

    const cwSpeed = document.getElementById('cw-speed');
    const cwSpeedValue = document.getElementById('cw-speed-value');
    cwSpeed.addEventListener('input', e => {
        const wpm = parseInt(e.target.value);
        cwSpeedValue.textContent = `${wpm} WPM`;
        cwPlayback.wpm = wpm;
    });

    const cwFrequency = document.getElementById('cw-frequency');
    const cwFrequencyValue = document.getElementById('cw-frequency-value');
    cwFrequency.addEventListener('input', e => {
        const freq = parseInt(e.target.value);
        cwFrequencyValue.textContent = `${freq} Hz`;
        cwPlayback.frequency = freq;
    });

    document.getElementById('profile').addEventListener('change', loadProfile);
}

function loadProfile() {
    const profile = document.getElementById('profile').value;
    const qsoTextArea = document.getElementById('qsoText');

    if (profile === 'custom') {
        qsoTextArea.value = '';
        qsoTextArea.placeholder = 'Write your custom QSO template here...';
        updateOutput();
    } else {
        qsoTextArea.value = templates[profile].join('\n');
        updateOutput();
    }
}

// ---------------------------------------------------------------------------
// Tokenizer — splits a line into an array of tokens.
// Each token is either a prosign object { prosign: '<XX>', morse: '...' }
// or a plain string (word or character sequence).
// ---------------------------------------------------------------------------
function tokenizeLine(line) {
    // Match prosign tokens like <AR>, <KA>, <R> etc., or regular words
    const prosignPattern = /(<(?:AR|AS|BT|KA|KN|SK|VA|VE|R)>)/gi;
    const parts = line.split(prosignPattern);
    const tokens = [];
    for (const part of parts) {
        const upper = part.toUpperCase();
        if (prosignMap[upper] !== undefined) {
            tokens.push({ type: 'prosign', token: upper, morse: prosignMap[upper] });
        } else if (part.trim() !== '') {
            // Split into words, each word becomes a token
            const words = part.trim().split(/\s+/);
            for (const word of words) {
                if (word) tokens.push({ type: 'word', token: word });
            }
        }
    }
    return tokens;
}

// ---------------------------------------------------------------------------
// Generate Morse for a single word (character by character, with intra gaps)
// Returns array of symbol strings e.g. ['.-', '-...']
// ---------------------------------------------------------------------------
function wordToMorseSymbols(word) {
    const symbols = [];
    for (const ch of word.toUpperCase()) {
        const m = morseMap[ch];
        if (m) symbols.push(m);
    }
    return symbols;
}

// ---------------------------------------------------------------------------
// updateOutput
// ---------------------------------------------------------------------------
function updateOutput() {
    const myRST = document.getElementById('myRST').value.trim().toUpperCase();
    const data = {
        MY:   document.getElementById('myCall').value.toUpperCase().trim(),
        DX:   document.getElementById('dxCall').value.toUpperCase().trim(),
        RST:  myRST || '5NN',
        NAME: document.getElementById('myName').value.toUpperCase().trim(),
        QTH:  document.getElementById('myQTH').value.toUpperCase().trim(),
        RIG:  document.getElementById('myRIG').value.toUpperCase().trim()
    };

    if (!data.MY || !data.DX) {
        document.getElementById('expandedText').innerHTML = 'Generated text will appear here...';
        document.getElementById('morseOutput').textContent = 'Generated Morse code will appear here...';
        return;
    }

    // Build {INFO} — formal template uses this to inject only filled fields with <BT> separators
    let infoBlock = '';
    if (data.NAME) infoBlock += ` <BT> NAME ${data.NAME} ${data.NAME}`;
    if (data.QTH)  infoBlock += ` <BT> QTH ${data.QTH} ${data.QTH}`;
    if (data.RIG)  infoBlock += ` <BT> RIG ${data.RIG}`;
    data.INFO = infoBlock;

    const profile = document.getElementById('profile').value;
    const isFormal = profile === 'formal';

    const templateText = document.getElementById('qsoText').value;
    let lines = templateText.split('\n').filter(l => l.trim());

    // Substitute all {PLACEHOLDER} tokens
    lines = lines.map(line => {
        for (const key in data) {
            if (data[key] !== undefined) {
                line = line.replaceAll(`{${key}}`, data[key]);
            }
        }
        return line.trim();
    });

    // Drop lines with unfilled placeholders (field was empty) or bare label lines
    lines = lines.filter(line => {
        if (!line) return false;
        if (line.includes('{') && line.includes('}')) return false;
        if (/^(NAME|QTH|RIG)\s*$/i.test(line)) return false;
        return true;
    });

    // For relaxed/short: fold NAME/QTH/RIG into the RST line, then remove standalone info lines
    if (!isFormal) {
        const hasName = Boolean(data.NAME);
        const hasQTH  = Boolean(data.QTH);
        const hasRIG  = Boolean(data.RIG);
        if (hasName || hasQTH || hasRIG) {
            let patched = false;
            lines = lines.map(line => {
                if (!patched && /UR RST/i.test(line) && /\bKN\b/i.test(line)) {
                    let infoStr = '';
                    if (hasName) infoStr += ` NAME ${data.NAME} ${data.NAME}`;
                    if (hasQTH)  infoStr += ` QTH ${data.QTH} ${data.QTH}`;
                    if (hasRIG)  infoStr += ` RIG ${data.RIG}`;
                    patched = true;
                    return line.replace(/\bKN\b/i, '').trim() + infoStr + ' BK';
                }
                return line;
            });
            lines = lines.filter(line =>
                !(hasName && /^NAME\s+\S/i.test(line)) &&
                !(hasQTH  && /^QTH\s+\S/i.test(line))  &&
                !(hasRIG  && /^RIG\s+\S/i.test(line))
            );
        }
    }

    // HW CPY for non-formal (formal template already includes it inline)
    if (!isFormal && document.getElementById('hwcpy').checked) {
        const hwLine = `HW CPY? ${data.DX} DE ${data.MY} KN`;
        const tnxIndex = lines.findIndex(l => l.trim().toUpperCase().startsWith('TNX'));
        if (tnxIndex >= 0) lines.splice(tnxIndex, 0, hwLine);
        else lines.push(hwLine);
    }

    lines = lines.filter(l => l.trim() !== '');

    // ---- Build expanded text display ----
    // Prosigns rendered with special styling <span class="prosign">⟨AR⟩</span>
    const displayLines = lines.map(line => {
        // First highlight prosigns
        let display = line.replace(
            /(<(?:AR|AS|BT|KA|KN|SK|VA|VE|R)>)/gi,
            (m) => `<span class="prosign">\u27E8${m.slice(1,-1).toUpperCase()}\u27E9</span>`
        );
        // Then highlight callsigns
        display = display.replace(
            new RegExp(`\\b(${data.MY}|${data.DX}|CQ)\\b`, 'gi'),
            '<span class="callsign">$1</span>'
        );
        return display;
    });

    const expanded = lines.join('\n');
    document.getElementById('expandedText').innerHTML = displayLines.join('\n') || 'No content generated';
    window.expandedTextForPlayback = expanded;

    // Store the callsigns so playText() knows which tokens to spell out
    window.callsignsForPhonetic = [data.MY, data.DX];

    // ---- Build Morse code display + playback sequence ----
    // playback sequence: array of { symbols: string[], prosign: bool }
    const morseDisplayLines = [];
    const playbackSequence = [];  // [{symbols: [...], isProsign: bool}, ...]

    for (const line of lines) {
        const tokens = tokenizeLine(line);
        const morseParts = [];

        for (let t = 0; t < tokens.length; t++) {
            const tok = tokens[t];
            if (tok.type === 'prosign') {
                // Display prosign morse as plain dots/dashes — no brackets
                morseParts.push(tok.morse);
                playbackSequence.push({ symbols: [tok.morse], isProsign: true });
            } else {
                const syms = wordToMorseSymbols(tok.token);
                if (syms.length) {
                    morseParts.push(syms.join(' '));
                    // Each symbol in a word gets its own entry with inter-symbol gap
                    playbackSequence.push({ symbols: syms, isProsign: false });
                }
            }
        }
        morseDisplayLines.push(morseParts.join(' / '));
    }

    window.playbackSequenceForCW = playbackSequence;
    document.getElementById('morseOutput').textContent =
        morseDisplayLines.join('\n') || 'No Morse code generated';
}

// ---------------------------------------------------------------------------
// Prosign bar — compact chips below the textarea, click to insert at cursor
// ---------------------------------------------------------------------------
function buildProsignToolkit() {
    const container = document.getElementById('prosign-toolkit-buttons');
    if (!container) return;

    Object.entries(prosignLabels).forEach(([token, info]) => {
        const btn = document.createElement('button');
        btn.className = 'prosign-btn';
        btn.textContent = `⟨${info.label}⟩`;
        btn.addEventListener('click', () => insertProsign(token));
        btn.addEventListener('mouseenter', () => {
            const tip = document.getElementById('prosign-tooltip');
            if (tip) tip.textContent = info.title;
        });
        btn.addEventListener('mouseleave', () => {
            const tip = document.getElementById('prosign-tooltip');
            if (tip) tip.textContent = '';
        });
        container.appendChild(btn);
    });
}

function insertProsign(token) {
    const ta = document.getElementById('qsoText');
    if (!ta) return;
    const start = ta.selectionStart;
    const end   = ta.selectionEnd;
    const val   = ta.value;
    const before = (start > 0 && val[start - 1] !== ' ') ? ' ' : '';
    const after  = (end < val.length && val[end] !== ' ') ? ' ' : '';
    ta.value = val.slice(0, start) + before + token + after + val.slice(end);
    const newPos = start + before.length + token.length + after.length;
    ta.setSelectionRange(newPos, newPos);
    ta.focus();
    updateOutput();
}

// ---------------------------------------------------------------------------
// CW Playback engine
// ---------------------------------------------------------------------------
function setTextPlaybackType(type) {
    textPlayback.type = type;
    document.getElementById('text-phonetic-btn').classList.toggle('active', type === 'phonetic');
    document.getElementById('text-normal-btn').classList.toggle('active', type === 'normal');
}

// Spell out a callsign character by character using NATO phonetic alphabet.
// e.g. "SV1TEU" → "Sierra Victor One Tango Echo Uniform"
function callsignToPhonetic(callsign) {
    return callsign.toUpperCase().split('').map(ch => phoneticAlphabet[ch] || ch).join(' ');
}

// Replace only the MY and DX callsigns in the text with their phonetic form.
// Everything else (CQ, DE, RST, names, etc.) is left for TTS to read naturally.
function expandCallsignsToPhonetic(text, callsigns) {
    // Strip prosign tokens — they are not spoken
    let result = text.replace(/<(?:AR|AS|BT|KA|KN|SK|VA|VE|R)>/gi, '');

    for (const cs of callsigns) {
        if (!cs) continue;
        const phonetic = callsignToPhonetic(cs);
        // Replace whole-word occurrences only
        result = result.replace(new RegExp(`\\b${cs}\\b`, 'gi'), phonetic);
    }
    return result;
}

function playText() {
    if (textPlayback.isPlaying) { stopTextPlayback(); return; }
    const raw = window.expandedTextForPlayback;
    if (!raw) return;

    textPlayback.isPlaying = true;
    updatePlaybackUI('text', true);

    const plainText = stripHtml(raw);
    const spokenText = (textPlayback.type === 'phonetic')
        ? expandCallsignsToPhonetic(plainText, window.callsignsForPhonetic || [])
        : plainText.replace(/<(?:AR|AS|BT|KA|KN|SK|VA|VE|R)>/gi, '');

    const utterance = new SpeechSynthesisUtterance(spokenText);
    utterance.rate = textPlayback.speed;
    utterance.onend  = () => { textPlayback.currentUtterance = null; stopTextPlayback(); };
    utterance.onerror = () => { textPlayback.currentUtterance = null; stopTextPlayback(); };
    textPlayback.currentUtterance = utterance;
    speechSynthesis.speak(utterance);
}

function stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
}

function stopTextPlayback() {
    if (textPlayback.isPlaying) {
        textPlayback.isPlaying = false;
        if (textPlayback.currentUtterance) { speechSynthesis.cancel(); textPlayback.currentUtterance = null; }
        updatePlaybackUI('text', false);
    }
}

function setMorsePlaybackType(type) {
    cwPlayback.type = type;
    document.getElementById('morse-cw-btn').classList.toggle('active', type === 'cw');
    document.getElementById('morse-phonetic-btn').classList.toggle('active', type === 'phonetic');
}

function playCW() {
    if (cwPlayback.type === 'phonetic') { playText(); return; }
    if (cwPlayback.isPlaying) { stopCWPlayback(); return; }

    const seq = window.playbackSequenceForCW;
    if (!seq || seq.length === 0) return;

    cwPlayback.isPlaying = true;
    cwPlayback.scheduledTimeouts = [];
    updatePlaybackUI('morse', true);
    playSequence(seq, () => stopCWPlayback());
}

// ---------------------------------------------------------------------------
// Core sequence player — handles both prosign (fused) and normal words
// seq: [{symbols: string[], isProsign: bool}, ...]
// onDone: optional callback
// ---------------------------------------------------------------------------
function playSequence(seq, onDone) {
    const dit = 1200 / cwPlayback.wpm; // ms per dit
    let cursor = 0; // absolute time cursor in ms

    for (let i = 0; i < seq.length; i++) {
        const item = seq[i];

        if (item.isProsign) {
            // Prosign: single fused Morse string e.g. '.-.-.'
            // Play dot/dash with intra-symbol gaps but NO intra-character gap between letters
            const s = item.symbols[0];
            for (let k = 0; k < s.length; k++) {
                const sym = s[k];
                if (sym === '.') {
                    scheduleBeep(cursor, dit);
                    cursor += dit;
                } else if (sym === '-') {
                    scheduleBeep(cursor, dit * 3);
                    cursor += dit * 3;
                }
                // intra-symbol gap after every element except last
                if (k < s.length - 1) cursor += dit;
            }
            // Inter-element gap after prosign (3 dits = inter-character gap)
            cursor += dit * 3;

        } else {
            // Normal word: each symbol is one character's morse e.g. '.-'
            for (let s = 0; s < item.symbols.length; s++) {
                const charMorse = item.symbols[s];
                for (let k = 0; k < charMorse.length; k++) {
                    const sym = charMorse[k];
                    if (sym === '.') {
                        scheduleBeep(cursor, dit);
                        cursor += dit;
                    } else if (sym === '-') {
                        scheduleBeep(cursor, dit * 3);
                        cursor += dit * 3;
                    }
                    // intra-character gap (1 dit) between dots/dashes within same char
                    if (k < charMorse.length - 1) cursor += dit;
                }
                // inter-character gap (3 dits total; we already consumed 1 dit above)
                cursor += dit * 2;
            }
            // inter-word gap (7 dits total; we already have 3 from last char gap)
            cursor += dit * 4;
        }
    }

    if (onDone) {
        setTimeout(onDone, cursor + 100);
    }
}

function scheduleBeep(delayMs, durationMs) {
    const id = setTimeout(() => playBeep(cwPlayback.frequency, durationMs), delayMs);
    cwPlayback.scheduledTimeouts.push(id);
}

function playBeep(frequency, duration) {
    try {
        if (!cwPlayback.audioContext) {
            cwPlayback.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        const osc  = cwPlayback.audioContext.createOscillator();
        const gain = cwPlayback.audioContext.createGain();
        osc.connect(gain);
        gain.connect(cwPlayback.audioContext.destination);
        osc.frequency.value = frequency;
        osc.type = 'sine';
        const now = cwPlayback.audioContext.currentTime;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.3, now + 0.001);
        gain.gain.setValueAtTime(0.3, now + duration/1000 - 0.001);
        gain.gain.linearRampToValueAtTime(0, now + duration/1000);
        osc.start(now);
        osc.stop(now + duration/1000);
    } catch (err) {
        console.error('Audio error:', err);
    }
}

function stopCWPlayback() {
    if (cwPlayback.isPlaying) {
        cwPlayback.isPlaying = false;
        cwPlayback.scheduledTimeouts.forEach(id => clearTimeout(id));
        cwPlayback.scheduledTimeouts = [];
        updatePlaybackUI('morse', false);
    }
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------
function updatePlaybackUI(type, isPlaying) {
    const key = type === 'text' ? 'text' : 'morse';
    const playBtn   = document.getElementById(`play-${key}-btn`);
    const stopBtn   = document.getElementById(`stop-${key}-btn`);
    const statusDot = document.getElementById(`${type}-status-dot`);
    const statusTxt = document.getElementById(`${type}-status-text`);

    if (isPlaying) {
        playBtn.disabled = true;
        stopBtn.disabled = false;
        statusDot.classList.add('playing');
        statusTxt.textContent = 'Playing';
    } else {
        playBtn.disabled = false;
        stopBtn.disabled = true;
        statusDot.classList.remove('playing');
        statusTxt.textContent = 'Ready';
    }
}

function copyToClipboard(elementId) {
    const el = document.getElementById(elementId);
    const text = elementId === 'expandedText'
        ? stripHtml(el.innerHTML).replace(/[⟨⟩]/g, '')
        : (el.textContent || '');

    navigator.clipboard.writeText(text).then(() => {
        const original = elementId === 'expandedText' ? el.innerHTML : el.textContent;
        if (elementId === 'expandedText') el.innerHTML = '✓ Copied!';
        else el.textContent = '✓ Copied!';
        setTimeout(() => {
            if (elementId === 'expandedText') el.innerHTML = original;
            else el.textContent = original;
        }, 1000);
    });
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------
window.addEventListener('beforeunload', () => {
    stopTextPlayback();
    stopCWPlayback();
    if (cwPlayback.audioContext) cwPlayback.audioContext.close();
});

document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stopTextPlayback(); stopCWPlayback(); }
});

# SV1TEU CW Buddy — Help / How to Use

## 1) QSO Configuration

### QSO Mode
Select a QSO style for your contact:
- **Short (Mid‑QSO overs):** for ongoing contacts, not starting or ending.
- **Relaxed (Full QSO / Ragchew):** a complete, friendly QSO including info and closing.
- **Formal (Correct ITU Procedure & Prosigns):** a fully structured QSO using correct ITU prosigns (`<KA>`, `<AR>`, `<BT>`, `<KN>`, `<VA>`) for proper on-air etiquette.
- **Write your own (Custom):** type any CW exchange lines you want; one per line.

### QSO Template Placeholders
You can use curly-brace codes in templates:
- `{MY}` = your callsign
- `{DX}` = the other station's callsign
- `{RST}` = signal report (defaults to 5NN if empty)
- `{NAME}`, `{QTH}`, `{RIG}` = personal info (omitted if left empty)
- `{INFO}` = used in the Formal template to inject all filled fields (`NAME`, `QTH`, `RIG`) as `<BT>`-separated blocks automatically

**Procedure hints for Relaxed/Short:** Write `K` (over), `KN` (only you reply), `BK` (break/over), or `SK` (end) anywhere in your lines.

### Prosign Toolkit
Below the template textarea you'll find a row of clickable prosign buttons: `⟨KA⟩ ⟨AR⟩ ⟨KN⟩ ⟨BT⟩ ⟨AS⟩ ⟨VA⟩ ⟨SK⟩ ⟨VE⟩`

Click any button to insert that prosign at the cursor position in your template. Hover over a button to see a description of what it means. Prosigns are fused characters — they are sent without the normal inter-character gap, as per ITU procedure.

| Prosign | Meaning |
|---------|---------|
| `<KA>` | Starting signal — begin transmission (EU formal) |
| `<AR>` | End of message / passing over |
| `<KN>` | Go ahead — specific station only |
| `<BT>` | Break / separator between sections |
| `<AS>` | Wait / stand by |
| `<VA>` | End of QSO / sign off (correct ITU prosign) |
| `<SK>` | End of QSO — common alias for VA |
| `<VE>` | Understood |

## 2) Station Information
Fill in your station details and the "DX" station for the template to expand with real info.

Check **"Include final HW CPY? line"** to have this appended before the closing line:
`HW CPY? {DX} DE {MY} KN`

> In **Formal** mode, the HW CPY line is already built into the template inline — the checkbox is ignored.

## 3) Expanded Text Panel
Shows the result of your template with all placeholders filled in. Prosigns are highlighted as `⟨AR⟩` and callsigns are visually distinguished.

- **Copy:** copies the complete QSO text to clipboard
- **Playback type:**
  - *Phonetic:* reads the text aloud, spelling out both callsigns letter by letter using the NATO phonetic alphabet (e.g. `SV1TEU` → *Sierra Victor One Tango Echo Uniform*). All other words are read naturally.
  - *Normal:* reads the raw text as-is via browser speech synthesis.
- **Speed:** adjust the speech rate (0.5× – 2.0×)

## 4) Morse Code Panel
Shows your QSO rendered as Morse code (dots and dashes). Words are separated by `/` and lines by a line break. Prosigns appear as their fused Morse sequence without brackets.

- **Copy:** copies the Morse code to clipboard
- **Playback type:**
  - *CW Tone:* plays the Morse as an audio tone at your chosen WPM and frequency
  - *Phonetic:* switches to the same phonetic speech playback as the Expanded Text panel
- **Speed (WPM):** 5 – 40 WPM
- **Tone Frequency:** 300 – 1200 Hz

**Tip:** If playback won't start, click or tap anywhere on the page first — browsers require a user gesture before allowing audio.

## 5) CW Decoder (Microphone) — How to Use

### Quick Start
1. Click **Decode** above the Expanded Text panel.
2. Allow the microphone prompt if it appears.
3. Place a CW signal (from a speaker, rig, or a YouTube video) near the mic.
4. Watch the waterfall and the decoded text appear live.

**To stop:** click **Stop**.

### Decoder engines
Choose the engine with the selector next to **Decode**:

- **Auto** (default): uses the **AI** engine, except in **Formal** QSO mode, where it uses **Classic** so prosigns can be checked. Falls back to Classic automatically if the AI engine cannot load or cannot keep up on your device.
- **AI (DeepCW):** a neural network decoder ([DeepCW](https://github.com/e04/deepcw-engine) by e04). Much more robust to noise, fading and weak signals. On first use it downloads about 4 MB (model and runtime), then it is cached. Text appears about 2–3 seconds behind the audio, because it decodes in overlapping windows; the latest, not yet confirmed characters are shown dimmed.
- **Classic:** the multi-speed timing decoder (5–33 WPM, 10 decoders in parallel). Instant, word-by-word output, decodes prosigns as `<AR>`, `<KN>`, `<SK>`, `<KA>`, `<AS>`, `<VE>` and `=` (BT). Needs a clean signal.

### Waterfall and tuning
The waterfall shows the audio spectrum from 300 to 1500 Hz, newest on the right. Signals appear as bright horizontal traces.

- **Automatic tuning (AI engine):** the decoder finds the strongest CW signal and follows it (cyan line).
- **Pick a signal:** click on its trace to lock the AI decoder to that frequency (yellow line). Useful when several signals are present.
- **Back to automatic:** double-click the waterfall.

The status line shows the frequency, its signal-to-noise ratio and the tuning state: *locked*, *hold* (signal faded, keeping the last frequency) or *manual*.

### Known limits
- **AI engine and prosigns:** the model has no prosign symbols. `<BT>`, `<AR>`, `<KN>` and `<SK>`/`<VA>` usually appear as the letter pairs `BT`, `AR`, `KN`, `SK`; `<KA>`, `<AS>` and `<VE>` are often wrong. Use the Classic engine (or Formal mode in Auto) to check prosigns.
- **AI engine below ~10 WPM:** letters are correct, but word spacing can be wrong (e.g. `C Q DE`).
- **Classic engine:** needs a strong, clean signal; it struggles with noise and fading.
- **Classic engine, Show all:** check **Show all** to see every speed decoder's output and confidence score.

### For Best Results
- Use a clear, steady tone, not too loud and not distorted.
- Reduce background noise as much as possible.
- Try headphones or a direct audio feed if room echo or feedback is a problem.
- If you see an "Open in browser" warning, open the page in Chrome, Firefox, or Safari. Social app in-app browsers do not allow full microphone access.

### Troubleshooting
- **No mic permission?** Check browser settings and ensure the page is served over HTTPS.
- **No signal or only dots/garbage?** Disable any "Enhancements" or noise reduction on your microphone input, especially on Windows via _Settings → System → Sound → Input → Audio enhancements_.
- **Works on phone/tablet but not Windows?** Speech enhancement settings are likely suppressing the tones. Disable them in Windows Sound settings.
- **Decoder stuck, out of sync, or you switched to a very different signal?** Click **Stop**, then **Decode**. For persistent issues, reload the page.
- **AI engine says "unavailable" or falls back to Classic?** The model or runtime could not load, or your device is too slow. Classic still works; try another browser or device for AI.
- **Decoder won't start in Facebook/Instagram?** Tap "⋮" or "Share" and open in a real browser.

---
*If you have decoder or audio setup trouble, review the tips in this file.*

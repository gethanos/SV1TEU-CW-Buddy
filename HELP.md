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
4. Watch the decoded words appear live in the overlay panel.

**To stop:** click **Stop**.

### Understanding the Decoder Overlay
- **Live Decoding:** the system listens for CW, auto-detects speed, and decodes the strongest transmission live.
- **Multiple speeds:** the decoder analyzes all common QRQ and QRS speeds (5–33 WPM) simultaneously for best accuracy.
- **Best result only:** by default you see the most confident decoder result.
- **Show all decoders:** check **Show all** to see every decoder's output and confidence score — handy for tricky signals or learning.
- **Signal Status:** visual indicator shows whether a CW tone is present and its detected frequency.
- **Reset:** use **STOP** and **DECODE** if the decoder gets stuck, falls out of sync, or you switch to a very different signal.

### For Best Results
- Use a clear, steady tone — not too loud, not distorted.
- Reduce background noise as much as possible.
- Try headphones or a direct audio feed if room echo or feedback is a problem.
- Keep a consistent WPM (the decoder can follow moderate changes).
- If you see an "Open in browser" warning, open the page in Chrome, Firefox, or Safari — social app in-app browsers do not allow full microphone access.

### Troubleshooting
- **No mic permission?** Check browser settings and ensure the page is served over HTTPS.
- **No signal or only dots/garbage?** Disable any "Enhancements" or noise reduction on your microphone input — especially on Windows via _Settings → System → Sound → Input → Audio enhancements_.
- **Works on phone/tablet but not Windows?** Speech enhancement settings are likely suppressing the tones. Disable them in Windows Sound settings.
- **Output stuck or frozen?** Hit **Reset**. For persistent issues, reload the page.
- **Decoder won't start in Facebook/Instagram?** Tap "⋮" or "Share" and open in a real browser.

---
*If you have decoder or audio setup trouble, review the tips in this file.*

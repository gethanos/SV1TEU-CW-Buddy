# SV1TEU CW Buddy — Help / How to Use

## 1) QSO Configuration

### QSO Mode
Select a QSO style for your contact:
- **Short (Mid‑QSO overs):** for ongoing contacts, not starting or ending.
- **Relaxed (Full QSO / Ragchew):** a complete, friendly QSO including info and closing.
- **Formal (Procedure / Etiquette):** a structured, etiquette-focused flow with explicit handover and closing.
- **Write your own (Custom):** type any CW exchange lines you want; one per line.

### QSO Template Placeholders
You can use curly-brace codes in templates:
- `{MY}` = your callsign
- `{DX}` = the other station’s callsign
- `{RST}` = signal report (defaults to 5NN if empty)
- `{NAME}`, `{QTH}`, `{RIG}` = personal info (will be omitted if empty)
- `{NAME_LINE}`, `{QTH_LINE}`, `{RIG_LINE}` = corresponding lines only shown if filled

**Procedure hints:** Write `K` (over), `KN` (only you reply), `BK` (break/over), or `SK` (end) anywhere in your lines.

## 2) Station Information

Fill in your station details and the “DX” station for the template to expand with real info. Check “Include final HW CPY? line” to have this appended at the end:  
`HW CPY? {DX} DE {MY} KN`

## 3) Expanded Text Panel
Shows the result of your template with all details filled in.  
- **Copy:** Copy the complete QSO text  
- **Playback:** Listen to the text via browser speech (with adjustable speed)

## 4) Morse Code Panel
- Shows your QSO rendered as Morse code (dots/dashes)
- **Copy:** Copy the Morse code
- **CW Playback:** Play Morse via browser tone, customize WPM and pitch

**Tip:** If playback won’t start, interact (click/tap the page)—browsers require a gesture.

## 5) CW Decoder (Microphone) — How to Use

### Quick Start:
1. Click **Decode** above the “Expanded Text” panel.
2. Allow the microphone prompt if it appears.
3. Place a CW signal (audio from speaker, rig, or YouTube) near the mic.
4. Watch the decoded words appear live in the overlay panel.

**To stop:** Click **Stop** again.

### Understanding the Decoder Overlay

- **Live Decoding:** The system listens for CW, auto-detects speed, and decodes the strongest “transmission” live.
- **Multiple speeds:** The decoder analyzes all common QRQ and QRS speeds (5–33WPM) at once for best accuracy.
- **Best result only:** By default, you see the “best guess” decoder (most likely and confident result).
- **Show all decoders:** Check **Show all** to see every decoder’s output and score (handy for tricky signals or learning).
- **Signal Status:** Visual indicator shows if a CW tone is present and its detected frequency.
- **Reset:** Use the **Reset** button if the decoder gets “stuck,” out of sync, or you change to a radically different signal.

### For Best Results
- Use a clear, steady tone--not too loud, not distorted.
- Reduce background noise as much as possible.
- Try headphones or direct feed if room echo or feedback is a problem.
- Keep a consistent WPM (but the decoder can follow moderate changes).
- If the overlay issues an “Open in browser” warning, open in Chrome, Firefox, or Safari (not social app browsers) for full microphone access.

### Troubleshooting

- **No mic permission?** Check browser settings, ensure HTTPS.
- **No signal or only dots/garbage?** Disable any “Enhancements” or noise reduction on your microphone input, especially on Windows via _Settings → System → Sound → Input → ‘Audio enhancements’_.
- **Works on phone/tablet, not Windows?** Usually “speech enhancement” settings are suppressing tones. Disable it in your Windows settings
- **No output or output stuck?** Hit **Reset**. For persistent issues, reload the page.
- **Decoder won’t start in Facebook/Instagram?** Tap “⋮” or “Share” and open in a real browser.

---

If you have decoder or audio setup trouble, review this file’s tips.

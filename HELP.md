# SV1TEU CW Buddy — Help / How to Use

## 1) QSO Configuration
### QSO Mode
- **Short QSO**: a quick minimal contact template
- **Relaxed QSO**: a longer “ragchew” style template
- **Custom Template**: write your own template text

### QSO Template (Custom Template)
Write one QSO line per line.

Supported placeholders:
- `{MY}` = your callsign
- `{DX}` = remote callsign
- `{RST}` = RST report (defaults to 5NN if empty)
- `{NAME}` = your name (optional)
- `{QTH}` = your QTH/location (optional)
- `{RIG}` = your rig/power/antenna (optional)

Auto-generated optional lines (used by the built-in Relaxed template):
- `{NAME_LINE}` becomes `NAME ...` only if you entered a name
- `{QTH_LINE}` becomes `QTH ...` only if you entered a QTH
- `{RIG_LINE}` becomes `RIG ...` only if you entered rig info

If an optional field is empty, its line is automatically removed from the final output.

## 2) Station Information
Fill in:
- **Your Callsign** (required)
- **Remote Callsign** (required)
- **RST Report** (optional; default is 5NN)
- **Name / QTH / Rig** (optional)

### “Include final HW CPY? line”
When enabled, it appends:
`HW CPY? {DX} DE {MY} KN`

## 3) Expanded Text (right panel)
This shows the fully expanded QSO text (after placeholders are replaced).

Buttons / controls:
- **Copy**: copies the expanded text to clipboard
- **Playback**:
  - **Play** reads the expanded text using your browser’s text-to-speech
  - **Speed** controls reading speed

## 4) Morse Code (right panel)
This shows the generated Morse for the expanded text.

Buttons / controls:
- **Copy**: copies the Morse output to clipboard
- **Playback**:
  - **CW Tone** plays Morse as tones
  - **Speed (WPM)** adjusts Morse speed
  - **Tone Frequency** adjusts pitch (Hz)
  - **Play CW / Stop** controls playback

Tip: If playback doesn’t start, interact with the page first (some browsers require a user gesture before audio).

## 5) Decode (microphone CW decoder)
Use the **Decode** button above the “Expanded Text” card.

Steps:
1. Click **Decode**
2. Allow microphone permission in the browser prompt
3. Play/receive CW audio near your microphone (best around the CW audio range)
4. Decoded text appears in the small overlay area

Tips for better decoding:
- Use a clear CW tone (not too loud, not distorted)
- Reduce background noise
- If possible, use headphones and route audio cleanly (to avoid room echo)
- Keep a consistent WPM

To stop decoding:
- Click **Stop**

## Troubleshooting
- **No microphone prompt / not working**: check browser permissions (site settings) and ensure HTTPS.
- **No audio playback**: your browser may block audio until you click somewhere on the page first.
- **Decoder inaccurate**: try a cleaner tone, less noise, and consistent speed.

## ⚠️ Important: Facebook / Instagram In-App Browser

If you open this page from **Facebook or Instagram**, it may open inside their built-in browser.

⚠️ **The CW Decoder will NOT work there.**

Reason:
- Facebook’s in-app browser does **not fully support microphone access**
- Web Audio + getUserMedia() is blocked or unreliable

### ✅ Solution
Open the page in a real browser:
- Tap the **⋮ menu** (or “Open in browser”)
- Choose **Chrome**, **Firefox**, or **Safari**

Once opened in a normal browser, the **Decode (microphone)** function works normally.

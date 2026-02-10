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

### Reset (decoder)
If decoding becomes unstable over time (for example it appears “stuck” on signal or stops reacting correctly), use **Reset** (next to the Decode/Stop button) while the decoder is running.

## Troubleshooting
- **No microphone prompt / not working**: check browser permissions (site settings) and ensure HTTPS.
- **No audio playback**: your browser may block audio until you click somewhere on the page first.
- **Decoder inaccurate**: try a cleaner tone, less noise, and consistent speed.

## ⚠️ Important: Windows: decoder shows no signal (mic works, but CW tone is “removed”)

If the decoder works on Android/Linux but shows **no signal on Windows**, Windows or the browser is often applying **speech-oriented audio processing** that can suppress steady tones like CW (noise suppression, echo cancellation, “enhancements”, auto gain, etc.).

### Fix 1 — Disable Windows microphone “enhancements”
1. Open **Settings → System → Sound**
2. Under **Input**, select the microphone you are using
3. Turn **Audio enhancements** **Off** (or disable any “Enhancements” / “Signal processing” options)
4. Also disable options like **Noise suppression**, **Echo cancellation**, **Automatic gain control** if your device driver/control panel exposes them (Realtek, headset software, etc.)
5. Reload the page and try decoding again

### Fix 2 — Disable browser/driver noise suppression features (if available)
Some headsets/webcams and software suites apply additional processing even when Windows enhancements are off. If you have tools like **Realtek Audio Console**, headset vendor apps, **Krisp**, Discord/Teams processing, etc., temporarily disable their noise suppression / echo cancellation and re-test.

### Fix 3 — Use a different input device
If your current input is a **Bluetooth headset mic** or a **webcam mic**, try switching to a wired microphone or the built-in “Microphone Array”. Then select the same device in:
- **Windows Sound input device**, and
- the browser’s **site microphone** selection

### Tip — Confirm the mic is actually receiving audio
In **Settings → System → Sound → Input**, speak or play a CW tone near the mic and confirm the **input level meter moves**. If it moves in Windows but the decoder shows nothing, it is almost always audio processing suppressing the tone.

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

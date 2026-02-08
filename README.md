# SV1TEU CW Buddy

SV1TEU CW Buddy is a small web app to help amateur radio operators generate and decode Morse (CW) for practice and real contacts (QSOs).

It can:
- Generate QSO text from templates (Short / Relaxed / Custom)
- Convert the generated text to Morse code
- Play Morse as a CW tone (WPM + tone frequency adjustable)
- Decode CW from your microphone input (browser-based)

## Live app
https://vle.cited.gr/apps/cw

## Files
- `index.html` — UI layout
- `styles.css` — styling
- `script.js` — template expansion, Morse generation, playback, UI actions
- `cw-decoder.js` — microphone CW decoder (browser Audio APIs)

## License
MIT License — see the `LICENSE` file.
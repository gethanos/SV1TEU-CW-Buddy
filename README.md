# SV1TEU CW Buddy

A web-based CW (Morse Code) training and QSO assistant for radio amateurs.


Designed for:
- CW practice
- QSO text generation
- Live CW audio playback
- CW decoding via microphone

## 🚀 SV1TEU CW Buddy v1.7 Released!
Brand-new CW decoder with multi-speed decoding (5–33 WPM), auto-locking best speed, live frequency tracking, smarter scoring, cleaner UI, and major stability improvements.

## 🚀 Live Demo
https://cw-buddy.sv1teu.me/

## ✨ Features
- Generate realistic CW QSO text
- Adjustable WPM and tone frequency
- Play CW audio directly in the browser
- Decode CW from microphone input with two engines:
  - **AI** (neural network, [DeepCW](https://github.com/e04/deepcw-engine) by e04): robust to noise and fading
  - **Classic** (multi-speed timing decoder): instant output, decodes prosigns
- Waterfall display with click-to-tune
- No installation – works in modern browsers

## 🧑‍🚀 Who is this for?
- Amateur radio operators learning or practicing CW
- Operators who want realistic CW QSO practice
- Anyone interested in Morse Code and Web Audio

## 📘 Before you ask for help 🙂

CW decoding in a browser is tricky by nature.

If you experience **decoder issues**, microphone problems, or unexpected behavior,
please **read the `HELP.md` file first**.

📘 Decoder Help: [HELP.md](HELP.md)

It contains:
- Decoder limitations and expectations
- Audio & microphone setup tips
- Common mistakes and how to fix them
- A dedicated **Troubleshooting** section with real solutions

👉 Most decoder issues are already covered there.
 
## Files
- `index.html` — UI layout
- `styles.css` — styling
- `script.js` — template expansion, Morse generation, playback, UI actions
- `cw-decoder.js`: Classic microphone CW decoder (browser Audio APIs)
- `decoder-controller.js`: Decode button, engine selection and fallback, microphone
- `decoder-ui.css`: styles for the engine selector and waterfall
- `waterfall.js`: scrolling waterfall with click-to-tune
- `ai-capture-worklet.js`: AudioWorklet: anti-alias filter and resampling to 3200 Hz
- `ai-decoder-worker.js`: Web Worker running the AI model (ONNX Runtime Web)
- `ai-decoder-core.js`: AI pipeline: tone finder, spectrogram, stitching, CTC decoding
- `models/deepcw-narrow.onnx`: DeepCW narrow-band model (e04, MIT)
- `vendor/ort/`: ONNX Runtime Web 1.24.3 (fetch with `scripts/fetch-ort.sh`)
- `NOTICE`: third-party attributions and licences

## Credits

- **DeepCW** by **e04**: the AI decoder uses the DeepCW narrow-band model
  (`models/deepcw-narrow.onnx`) from [deepcw-engine](https://github.com/e04/deepcw-engine),
  and `ai-decoder-core.js` adapts its decoding pipeline (spectrogram, normalization,
  posterior stitching, CTC decoding). The tone finder and the waterfall are based on ideas
  from [web-deep-cw-decoder](https://github.com/e04/web-deep-cw-decoder).
  Try the full DeepCW decoder at [deepcw.cc](https://deepcw.cc/). MIT License.
- **ONNX Runtime Web** by Microsoft runs the model in the browser (`vendor/ort/`). MIT License.
- **Font Awesome Free** icons, loaded from cdnjs. Icons CC BY 4.0, fonts SIL OFL 1.1, code MIT.

Full licence texts for third-party components are in [`NOTICE`](NOTICE).

## License
MIT License: see the `LICENSE` file. Third-party components (DeepCW model, ONNX Runtime Web) are listed in `NOTICE`.

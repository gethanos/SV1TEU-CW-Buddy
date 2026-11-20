# SV1TEU CW Buddy

Decode CW from your microphone and get your reply ready to send, as text and Morse. Practice full QSOs at any speed. It runs in the browser, works offline, and audio never leaves your device.

**Live:** [cw-buddy.sv1teu.me](https://cw-buddy.sv1teu.me/) · **Help:** [HELP.md](HELP.md)

## What it does

**Decode**
- Two decoders: an **AI** engine (the DeepCW neural model) that copies weak, noisy and fading signals, and a **Classic** multi-speed decoder that is instant and decodes prosigns. **Auto** picks the right one and falls back to Classic on slow devices.
- A **waterfall** with automatic tuning; click a signal to decode it.
- **Your reply**, built as you listen: it picks out their callsign, whether they are calling you, your report, their name and QTH, and writes the over to send back (Short, Relaxed or Formal) with the Morse under every line. The RST you send is estimated from the received signal and clearly marked as an estimate.

**Practice**
- QSO templates (Short, Relaxed, Formal ITU procedure, or your own) filled with your station details.
- Prosigns (`<KA>`, `<AR>`, `<BT>`, `<KN>`, `<SK>`, ...) sent as single characters.
- Play as CW (5 to 40 WPM, 300 to 1200 Hz) with word-by-word highlighting, or as voice with phonetic callsigns.

## Run it yourself

Any static web server works. For a laptop or a Raspberry Pi in the field, use the included server; no internet connection is needed:

```bash
git clone https://github.com/gethanos/SV1TEU-CW-Buddy.git
cd SV1TEU-CW-Buddy
python3 scripts/serve.py            # browser on this machine: http://localhost:8000
python3 scripts/serve.py --https    # phones on the same Wi-Fi: https://<this-ip>:8443
```

Browsers only allow the microphone on `https://` or `localhost`. `--https` creates a self-signed certificate (needs `openssl`); accept the warning once per device. On your own web server, make sure `.mjs` is served as `text/javascript` and `.wasm` as `application/wasm`.

## Project layout

| Path | Purpose |
|---|---|
| `index.html`, `app.css`, `app.js` | Page, styles, screens and settings |
| `practice.js`, `reply.js` | Practice over builder; Your reply (reads the decode, builds the reply) |
| `cw-core.js` | Morse tables, CW tone player, speech |
| `decoder-controller.js`, `waterfall.js` | Microphone, engine choice and fallback, waterfall |
| `ai-decoder-*.js`, `ai-capture-worklet.js`, `splitter.js` | AI engine: audio capture, model runner, word splitter |
| `cw-decoder.js` | Classic engine |
| `models/`, `vendor/` | DeepCW model, ONNX Runtime Web, fonts (refresh with `scripts/fetch-*.sh`) |
| `scripts/serve.py` | Offline web server |
| `tests/` | `node tests/splitter.test.js`, `node tests/reply.test.js` |

## Credits

- AI decoding uses the **DeepCW** model and pipeline by **e04** ([deepcw-engine](https://github.com/e04/deepcw-engine), [web-deep-cw-decoder](https://github.com/e04/web-deep-cw-decoder)), MIT License.
- Model runtime: **ONNX Runtime Web** by Microsoft, MIT License. Fonts: **Inter** and **JetBrains Mono**, SIL OFL 1.1.

Full licence texts are in [NOTICE](NOTICE).

## License

MIT © Georgalas Athanasios Antonios, SV1TEU. See [LICENSE](LICENSE).

# SV1TEU CW Buddy: Help

CW Buddy has two screens, **Decode** and **Practice**, plus **Settings** (the gear button). On a phone, the screens are in the tab bar at the bottom.

## 1) Decode

Decode listens to CW through your microphone, shows what it hears, and builds the reply you can send back.

### Start decoding
1. Click **Start decoding** and allow the microphone when the browser asks.
2. Play CW near the microphone: from your rig's speaker, a WebSDR or a recording.
3. Watch the waterfall and the decoded text. Click **Stop decoding** when you're done.

The bar at the top shows what the decoder is doing:
- **Listening · AI** or **Listening · Classic**: which engine is running.
- **700 Hz**: the frequency of the signal being decoded.
- **SNR 18 dB**: how far the signal is above the noise (AI engine only).
- **Locked · auto**, **Holding** or **Manual**: tuning state. *Holding* means the signal faded and the decoder keeps listening on the last frequency.
- **Input**: microphone level. If it stays near zero, check the microphone and volume.

### Waterfall and tuning
The waterfall shows the audio spectrum from 300 to 1500 Hz, newest on the right. A CW signal is a bright horizontal trace.

- **Automatic tuning** is on whenever you start decoding: the AI engine finds the strongest CW signal and follows it (cyan line).
- **Pick a signal:** click its trace to tune the AI engine to it (amber line). Useful when several signals are on screen.
- **Back to automatic:** press **Auto tune** above the waterfall (or double-click the waterfall).
- The **Classic** engine tunes itself and does not use click-to-tune.

### Decoded text
- **Dimmed** characters are not confirmed yet; they firm up within about 2 seconds.
- **Underlined** words are the ones used to build your reply: their callsign (cyan), your report (amber), their name and QTH (grey).
- **Copy** and **Clear** are next to the heading. Clear also resets Your reply.

### Your reply
Your reply is built from what was decoded, as text with the Morse under each line, ready to send.

**What it reads from the decoded text**
- **Their callsign**, from `… DE SV1TJN`. If they call `CQ`, the reply answers the CQ.
- **Whether they are calling you** (`SV1TEU DE SV1TJN`) or working someone else.
- **Your report**, after `RST` or `UR` (cut numbers like `5NN` are understood), only when they are calling you.
- **Their name** after `NAME` or `OP`, and **their QTH** after `QTH`.
- **The end of the contact** (`73`, `TU`, `SK`, `TNX FER QSO`): the reply then says goodbye.
- **Other callsigns** heard appear as chips; **Reply to this** switches the reply to that station.

**Fields you can change**
- **Their callsign** fills in automatically; type over it to reply to someone else.
- **RST you send** is marked:
  - **Estimated**: worked out from the received signal's SNR (AI engine). It is an estimate from the audio, not your rig's S-meter: the audio level depends on your receiver, its volume and the microphone, so treat it as a suggestion.
  - **Default**: no estimate available (for example with the Classic engine), so the usual `5NN`.
  - **Edited**: your own report. It stays until a new station is decoded.
- **Your details** (name, QTH, rig) come from the Practice screen; set them once there.

**Reply style:** *Short* (one line), *Relaxed* (full over with your details) or *Formal* (ITU procedure with prosigns).

**Sending:** **Play reply as CW** plays it at your speed and tone, highlighting the word being sent. **Voice** reads it aloud. **Copy text** and **Copy Morse** copy it.

### Decoder engines
Choose in the bar (desktop) or in Settings:

| Engine | Best for | Notes |
|---|---|---|
| **Auto** (recommended) | Everyday use | AI by default; Classic in Formal mode and when the device is too slow for AI |
| **AI (DeepCW)** | Weak, noisy or fading signals | Text lags about 2 s; downloads about 4 MB on first use |
| **Classic** | Prosigns, slow practice | Instant word-by-word; needs a clean, strong signal |

**AI engine and prosigns:** the AI model has no prosign symbols. `<BT>`, `<AR>`, `<KN>` and `<SK>`/`<VA>` usually come out as the letters `BT`, `AR`, `KN`, `SK`; `<KA>`, `<AS>` and `<VE>` are often wrong. Use Classic (or Formal mode with Auto) to check prosigns.

**AI engine at slow speed:** below about 10 WPM the model can split words (`C Q DE`). A word splitter repairs callsigns, reports and common QSO words. Random practice groups are never re-spaced; for slow Koch practice, Classic is the better choice.

**Classic engine, Show all:** in Settings, *Show all speed decoders* shows each of the 10 speed decoders and its score.

## 2) Practice

Practice builds an over from a template and your station details, and plays it as CW or voice.

### QSO mode
- **Short:** overs for the middle of a contact.
- **Relaxed:** a complete, friendly QSO with name, QTH, rig and closing.
- **Formal:** ITU procedure with prosigns (`<KA>`, `<AR>`, `<BT>`, `<KN>`, `<VA>`).
- **Custom:** your own template, one line per over.

### Station details
Your callsign, their callsign, the RST you send, and optionally your name, QTH and rig. Your details are remembered in this browser and also used by Your reply. Tick **End with "HW CPY?"** to add `HW CPY? {DX} DE {MY} KN` before the closing line (Formal mode already includes it).

### Template and prosigns
Templates use these placeholders:
- `{MY}`: your callsign. `{DX}`: their callsign.
- `{RST}`: the report (`5NN` if empty).
- `{NAME}`, `{QTH}`, `{RIG}`: your details (lines are dropped when the field is empty).
- `{INFO}`: Formal mode only; inserts the filled details as `<BT>`-separated blocks.

In Relaxed and Short you can write `K` (over), `KN` (only you reply), `BK` (back to you) or `SK` (end) anywhere.

The prosign buttons insert a prosign at the cursor. Prosigns are sent as one character, without the gap between letters:

| Prosign | Meaning |
|---|---|
| `<KA>` | Starting signal: beginning of a transmission (formal) |
| `<AR>` | End of message |
| `<KN>` | Go ahead, named station only |
| `<BT>` | Separator between parts of a message |
| `<AS>` | Wait, stand by |
| `<VA>` | End of work, no reply expected (ITU) |
| `<SK>` | End of contact (amateur use; same signal as VA) |
| `<VE>` | Understood (rare on the air today) |

### Your over and the player
Your over shows each line as text with its Morse underneath (untick **Show Morse** to hide it). The player plays it as **CW tone** at your **Speed** (5 to 40 WPM) and **Tone** (300 to 1200 Hz), highlighting each word as it is sent, or as **Voice**.

## 3) Settings
- **Decoder engine:** Auto, AI or Classic (see above).
- **Microphone:** choose the input, such as a USB sound card from your rig. Names appear after you have allowed the microphone once.
- **Show all speed decoders:** Classic engine diagnostics.
- **Voice playback:** spell callsigns phonetically (`SV1TEU` → *Sierra Victor One Tango Echo Uniform*) and the speaking speed.

## 4) Offline use (Raspberry Pi in the field)
Everything the app needs is in the repository, so it runs without an internet connection:

```bash
python3 scripts/serve.py            # browser on the same machine: http://localhost:8000
python3 scripts/serve.py --https    # phones on the Pi's Wi-Fi:     https://<pi-ip>:8443
```

Browsers only allow the microphone on `https://` or `localhost`, so other devices need `--https`; accept the certificate warning once per device. Voice playback needs a speech voice installed on the device.

## 5) Tips and troubleshooting
- **Best results:** a clear, steady tone, not too loud and not distorted; as little background noise as possible. A direct audio cable from the rig beats a microphone in a noisy room.
- **No microphone prompt, or "Microphone blocked"?** Allow the microphone in the browser's site settings, and make sure the page is on `https://` or `localhost`.
- **Only dots, nothing, or garbage?** Turn off microphone "enhancements" and noise suppression, especially on Windows: *Settings → System → Sound → Input → Audio enhancements*.
- **Auto switched to Classic?** The AI model could not load, or the device fell behind. If it fell behind, AI is tried again the next time you start decoding. Classic keeps working meanwhile.
- **Wrong signal decoded?** Click the right trace on the waterfall, or press **Auto tune** to go back to automatic tuning.
- **Callsign not filled in?** It fills in once a callsign is decoded after `DE` (or sent twice), and stays until a new station is decoded or you press Clear. You can always type it.
- **Decoder confused after a big change?** Click Stop decoding, then Start decoding. Reload the page if it persists.
- **Facebook or Instagram in-app browser?** Open the page in a real browser: Android ⋮ → Open in browser; iPhone Share → Open in Safari.

*Questions or decoder feedback: open an issue on [GitHub](https://github.com/gethanos/SV1TEU-CW-Buddy/issues).*

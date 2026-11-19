# SoundDrop

Share short text messages and contact cards with nearby devices using only sound.
No internet, Wi-Fi, Bluetooth or pairing.

One device plays the message as a quick series of tones; every nearby device that is listening
picks it up through its microphone and turns the tones back into text. In **Silent mode** the
tones are above 17,500 Hz, which most people cannot hear.

**Live site:** https://bhajanth13.github.io/SOUND-DROP/

CS1309 Web Technology mini project, RV University, Mysuru.
Bhajanth V (2RUA26CSE0021), B.Tech CSE, Section A. Guide: Soujanya K V.

## Features

- **Send** a text message or a contact card, with form validation and a 120-byte limit
- **Audible** (1,500–4,038 Hz) and **Silent** (17,500–19,192 Hz) modes
- **Receive** with automatic mode detection, signal strength and an inbox
- **Works offline and installs as an app** (Service Worker + web app manifest)
- Compact Bootstrap layout: every page fits on one phone screen, light and dark mode

## Built with as little JavaScript as possible

| Job | Done by |
|---|---|
| The three pages and moving between them | HTML sections + CSS `:target` (no JavaScript) |
| Showing the fields for Text or Contact card, and the hint for each mode | CSS `:has()` (no JavaScript) |
| Checking the form (required, length, phone pattern, email) | HTML5 validation + Bootstrap styles (no JavaScript) |
| Look, layout, light and dark colours | Bootstrap 5 + `style.css` |
| Making and hearing sound, FFT, checksum | JavaScript: `modem.js` |
| Size meter, status, received message, inbox, progress | JavaScript: `app.js` |

There is no framework and no build step: GitHub Pages serves these files exactly as they are.

## Files

| File | What it does |
|---|---|
| `index.html` | The whole app: navbar, the Home, Send and Receive sections, the Send form with its HTML5 checks, and templates for a received message. |
| `style.css` | The few styles added to Bootstrap: accent colour, page switching with `:target`, format and mode switching with `:has()`, round Listen button, small-screen rules. |
| `bootstrap.min.css` | Bootstrap 5.3.3, kept in the project so the app also works offline. |
| `modem.js` | **The sound engine.** Tone settings, CRC-16, `encode()` / `transmit()` (sender), the detector, the FFT in an AudioWorklet, `decodeFrame()` / `createReceiver()` (receiver), and `pack()` / `unpack()` for the two message formats. |
| `app.js` | Connects the page to the sound engine: size meter, sending and its progress, listening, status, the received message and the inbox; registers the Service Worker. |
| `sw.js` | Service Worker: saves the app's files so it opens offline. |
| `manifest.webmanifest` | App name, icons and colours, so the site can be installed like an app. |
| `icon.svg`, `icons/` | The logo and the app icons (192 px, 512 px, iPhone). |
| `.nojekyll` | Tells GitHub Pages to serve the files exactly as they are. |

## Run it locally

Any static web server works, for example:

```
python -m http.server 8000
```

then open http://localhost:8000. (The microphone needs `localhost` or HTTPS.)

## How the signal works

| Part | Detail |
|---|---|
| Modulation | 19-tone MFSK: 16 tones carry 4 bits each, plus REPEAT, START and END |
| Speed | 100 ms per tone: 40 bits per second |
| Frame | START, 0.6 s calibration sweep and sync, length byte, UTF-8 payload (up to 120 bytes), CRC-16, END |
| Calibration | The receiver measures how loud each tone arrives and boosts weak tones |
| Receiver | AudioWorklet running a 1,024-point FFT every 5 ms on the audio thread |
| Clock | None needed: a repeated value is sent as REPEAT, so every tone change is a new symbol |
| Echo | The tone still ringing in the room is ignored; a new tone must beat it by 3 dB |

`index.html?loopback` sends the sound straight into the receiver of the same page, for testing without a microphone.

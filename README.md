# SoundDrop

Share short messages, links and contact cards with nearby devices using only sound.
No internet, Wi-Fi, Bluetooth or pairing.

One device plays the message as a quick series of tones; every nearby device that is listening
picks it up through its microphone and turns the tones back into text. In **Silent mode** the
tones are above 17,500 Hz, which most people cannot hear.

**Live site:** https://bhajanth13.github.io/SOUND-DROP/

CS1309 Web Technology mini project, RV University, Mysuru.
Bhajanth V (2RUA26CSE0021), B.Tech CSE, Section A. Guide: Soujanya K V.

## Features

- **Send** text, a link or a contact card, with form validation and a 120-byte limit
- **Audible** (1,500–4,038 Hz) and **Silent** (17,500–19,192 Hz) modes
- **Receive** with automatic mode detection, a live frequency spectrum and an inbox
- **Works offline and installs as an app** (Service Worker + web app manifest)
- Simple Bootstrap interface for phones and laptops, light and dark mode

## Technology

| Layer | Used for |
|---|---|
| HTML, CSS, JavaScript | Structure, styling and all signal processing |
| React 18 | Pages, components, one shared audio engine (React Context) |
| Bootstrap 5.3 | Layout, buttons, forms and validation styles, colour modes |
| Web Audio API | Tone generation (OscillatorNode) and FFT analysis (AudioWorklet) |
| MediaDevices | Microphone access (getUserMedia) |
| Service Worker + manifest | Offline use and installing on the home screen |
| Vite | Development server and production build |
| GitHub Pages | HTTPS hosting, required by phones for microphone access |

## Project structure

```
app/src/main.jsx                   entry point: Bootstrap, colour mode, install prompt, Service Worker
app/src/App.jsx                    navbar and page switching
app/src/hooks/useHashRoute.js      #/send -> "send"
app/src/hooks/SoundDropContext.jsx audio engine: send, listen, inbox
app/src/lib/modem.js               encoder, transmitter, FFT detector, decoder
app/src/lib/formats.js             message formats and validation
app/src/pages/                     Home, Send, Receive
app/src/components/                Field, MessageCard, SpectrumView, InstallApp
app/public/sw.js                   Service Worker
app/public/manifest.webmanifest    app name and icons for installing
index.html, assets/, sw.js         built site served by GitHub Pages
```

## Build

```
cd app
npm install
npm run dev      # development server
npm run build    # builds app/dist and copies it to the repository root
```

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

# SoundDrop

Share short messages, links, Wi-Fi details and contact cards between nearby devices using only sound.
No internet, Wi-Fi, Bluetooth or pairing.

One device plays the message as a quick series of tones; every nearby device that is listening
picks it up through its microphone and turns the tones back into text. In **Silent mode** the
tones sit above 17,500 Hz, which most people cannot hear.

**Live site:** https://bhajanth13.github.io/SOUND-DROP/

CS1309 Web Technology mini project, RV University, Mysuru.
Bhajanth V (RVUM26CSE062), B.Tech CSE, Section A. Guide: Soujanya K V.

## Features

- **Send** text, a link, Wi-Fi details or a contact card, with form validation and a 120-byte size check
- **Audible** (1,500–4,038 Hz) and **Silent** (17,500–19,192 Hz) modes, Normal (100 ms) and Fast (60 ms) speeds
- **Receive** with automatic mode detection, a live frequency spectrum and an inbox table
- **Range Test Lab**: a 14–21 kHz sweep test that shows which frequencies a speaker and microphone pair can use
- **Works offline** after the first visit (Service Worker)
- Light and dark themes, responsive from phone to desktop
- Test log on every page, saved as a .txt file for comparing devices

## Technology

| Layer | Used for |
|---|---|
| HTML, CSS, JavaScript | Structure, styling and all signal processing |
| React 18 | Pages, reusable components, one shared audio engine (React Context) |
| Bootstrap 5.3 | Grid, navbar, forms and validation styles, tables, colour modes |
| Web Audio API | Tone generation (OscillatorNode) and FFT analysis (AudioWorklet, AnalyserNode) |
| MediaDevices | Microphone access (getUserMedia) |
| Service Worker | Offline use |
| Vite | Development server and production build |
| GitHub Pages | HTTPS hosting, required by phones for microphone access |

## Project structure

```
app/                     React source (Vite project)
  src/main.jsx           entry point, theme, Service Worker registration
  src/App.jsx            layout and hash routing
  src/hooks/             SoundDropContext (audio engine), useHashRoute
  src/pages/             Home, Send, Receive, Range Test Lab, How it works
  src/components/        NavBar, ModeSettings, Field, MessageCard, InboxTable, SpectrumView, LogPanel
  src/lib/modem.js       encoder, transmitter and receiver (MFSK modem)
  src/lib/formats.js     message formats and validation
  public/sw.js           Service Worker
  scripts/publish.mjs    copies the build to the repository root
index.html, assets/, sw.js   built site served by GitHub Pages
prototype/               the earlier single-page prototype (v0.3)
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
| Modulation | 19-tone MFSK: 16 tones carry 4 bits each, plus REPEAT, START and END tones |
| Frame | START, length byte, UTF-8 payload (up to 120 bytes), CRC-8, END |
| Sender | One phase-continuous oscillator, so there are no clicks |
| Receiver | AudioWorklet running a 1,024-point FFT every 5 ms (AnalyserNode fallback) |
| Clock | None needed: a repeated value is sent as REPEAT, so every tone change is a new symbol |
| Echo | The tone still ringing in the room is ignored; a new tone must beat it by 3 dB |

### Developer test mode

`index.html?loopback&mute` routes the sender straight into the receiver inside one page, without
speakers or a microphone. Add `&reverb=0.5&wet=2` for room echo, `&noise=0.004` for background noise,
`&engine=analyser` for the fallback receiver, or `&nosw` to skip the Service Worker.

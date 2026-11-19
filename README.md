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
- **Audible** (1,500–4,038 Hz) and **Silent** (17,500–19,192 Hz) modes, at **Normal** or **Fast** speed
- **Password lock:** optional AES-GCM encryption; only someone with the password can open the message
- **Error correction:** Reed-Solomon repairs up to 4 misheard bytes before the CRC-16 check
- **Receive** with automatic mode detection, signal strength and a saved inbox
- **Use what you receive:** copy it, share it, or save a contact card to the phone's contacts (.vcf)
- **Works offline and installs as an app** (Service Worker + web app manifest)
- **New look (Bootstrap 5 + custom CSS):** the message is drawn as its real tones (a strip that fills while sending), a Listen button with rings while listening, a signal meter, two-column pages on laptops; every page fits on one phone screen, light and dark mode

## Files

The repository has two parts: the **source code** in `app/`, and the **built website** in the root
folder, which is what GitHub Pages serves. Edit only `app/`; `npm run build` writes the root files.

### Source code (`app/`)

| File | What it does |
|---|---|
| `app/src/modem.js` | **The heart of the project.** Everything that turns a message into sound and back: the tone settings and speeds, CRC-16 and Reed-Solomon, `encode()` / `transmit()` (sender), the detector, the FFT in an AudioWorklet, `decodeFrame()` / `createReceiver()` (receiver), the two message formats with validation and vCard, and the password lock (Web Crypto). |
| `app/src/SoundDropContext.jsx` | The audio engine shared by all pages (React Context): one AudioContext, `send()`, listening on the microphone, the saved inbox, opening locked messages. |
| `app/src/pages.jsx` | The three pages (Home, Send, Receive) and their small parts: form field, toggle buttons, message card with Copy / Save contact / Share, locked-message card, Install card. |
| `app/src/main.jsx` | Where the app starts: light/dark mode, the install offer, page routing (`#/send`), the navbar, and the Service Worker. |
| `app/src/app.css` | The look on top of Bootstrap: light and dark colour variables, the tone strip, numbered steps, the Listen button and its rings, the signal meter, small-screen rules. |
| `app/index.html` | The single HTML page; React draws the app into it. |
| `app/public/sw.js` | Service Worker: saves the app's files so it opens offline. |
| `app/public/manifest.webmanifest` | App name, icons and colours, so the site can be installed like an app. |
| `app/public/icon.svg`, `app/public/icons/` | The logo and the app icons (192 px, 512 px, iPhone). |
| `app/vite.config.js` | Build settings: builds straight into the repository root with fixed file names. |
| `app/package.json`, `app/package-lock.json` | The libraries used (React, Bootstrap, Vite), their exact versions, and the `dev` / `build` commands. |
| `app/.gitignore` | Keeps `node_modules/` out of Git. |

### Built website (repository root, written by `npm run build`)

| File | What it is |
|---|---|
| `index.html` | The built page that GitHub Pages serves. |
| `assets/app.js`, `assets/app.css` | All the JavaScript and all the CSS, each bundled into one file. |
| `sw.js`, `manifest.webmanifest`, `icon.svg`, `icons/` | Copies of the files in `app/public/`. |
| `.nojekyll` | Tells GitHub Pages to serve the files exactly as they are. |
| `README.md` | This file. |

## Build

```
cd app
npm install
npm run dev      # development server
npm run build    # builds the website into the repository root
```

## How the signal works

| Part | Detail |
|---|---|
| Modulation | 19-tone MFSK: 16 tones carry 4 bits each, plus REPEAT, START and END |
| Speed | Normal: 100 ms per tone, 40 bits per second. Fast: 50 ms per tone, 80 bits per second |
| Frame | START, 0.6 s calibration sweep and sync, length byte, payload (up to 120 bytes), CRC-16, 8 Reed-Solomon bytes, END |
| Error correction | Reed-Solomon over GF(256), 8 repair bytes: fixes up to 4 wrong bytes; the CRC-16 then confirms the message |
| Password lock | AES-GCM 256-bit, key from the password with PBKDF2 (100,000 rounds, SHA-256); adds 37 bytes |
| Calibration | The receiver measures how loud each tone arrives and boosts weak tones |
| Receiver | AudioWorklet running a 1,024-point FFT every 5 ms on the audio thread |
| Clock | None needed: a repeated value is sent as REPEAT, so every tone change is a new symbol |
| Echo | The tone still ringing in the room is ignored; a new tone must beat it by 3 dB |

`index.html?loopback` sends the sound straight into the receiver of the same page, for testing without a microphone.

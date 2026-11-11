# SoundDrop

Send short messages between devices using only sound. No internet, Wi-Fi, Bluetooth or pairing.

One device plays the message as a quick series of tones; every nearby device that is listening
picks it up through its microphone and turns the tones back into text. In **Silent mode** the
tones sit above about 17,000 Hz, which most people cannot hear.

Web Technology (CS1309) mini project, RV University.
Bhajanth V (RVUM26CSE062), B.Tech CSE, Section A.

## Try it

1. Open the site on two devices (both pages must be loaded once while online; GitHub Pages serves it over HTTPS, which phones need for microphone access).
2. On the receiving device, choose **Receive** and tap **Start listening**.
3. On the sending device, type a short sentence, pick **Audible** or **Silent**, and tap **Send through sound**.
4. Turn on airplane mode on both devices if you want to prove that no network is used.

Each device keeps a test log of everything sent and received. Use **Save log (.txt)** after testing.

`lab.html` is the Tone Lab, which checks which high frequencies a given speaker and microphone can handle.

## How it works (prototype v0.2)

| Part | Detail |
|---|---|
| Modulation | 19-tone MFSK: 16 tones carry 4 bits each, plus REPEAT, START and END tones |
| Audible band | 1,500 – 4,038 Hz (141 Hz apart) |
| Silent band | 17,500 – 19,192 Hz (94 Hz apart) |
| Symbol length | 100 ms (Normal) or 60 ms (Fast) |
| Frame | START, length byte, UTF-8 payload (up to 120 bytes), CRC-8, END |
| Sender | Web Audio API, one phase-continuous oscillator (no clicks) |
| Receiver | Microphone into an AudioWorklet: Hann-windowed Goertzel filters at every tone, analysed every 5 ms on the audio thread (falls back to an AnalyserNode where AudioWorklet is missing) |
| Echo handling | The tone still ringing in the room is ignored; a new symbol must stand out from the other tones and beat the ringing tone by 3 dB |

A repeated nibble is sent as the REPEAT tone, so two neighbouring symbols are never the same tone.
The receiver therefore needs no clock: every change of the strongest tone is a new symbol.
The receiver detects both modes automatically.

### Files

- `index.html` – the app (Send and Receive views)
- `modem.js` – encoder, transmitter and receiver
- `app.js` – user interface and test log
- `lab.html` – Tone Lab frequency sweep test

### Developer test mode

`index.html?loopback&mute` routes the sender straight into the receiver inside one page, without
speakers or a microphone, for checking the encoder and decoder.
Add `&reverb=0.5&wet=2` to simulate room echo, or `&engine=analyser` to force the fallback receiver.

# Bluetooth microphone experiment

Baseline: `edd5212` on `main`. Experiment: `experiment/ble-audio`.

This branch adds onboard microphone audio over the existing local BLE connection.
Hold Space (queue) or Ctrl+Space (steer), speak for up to 10 seconds, and release.
The device records first, then transfers the compressed clip. Expect a delay after
release. USB continues using its existing microphone path.

## Scope and limits

- 16 kHz mono, IMA ADPCM (4 bits/sample, low nibble first, initial predictor/index 0).
- At most 80,000 compressed bytes (10 seconds), allocated only for a recording.
- The bridge advertises `bleAudio: true` in hello/connection messages. An older
  bridge cannot enable Bluetooth capture on the experimental firmware.
- Each recording gets a random session ID. Data packets have a sequence number,
  and acknowledgments stay on BLE even if USB reconnects during the recording.
- Stop-and-wait delivery retries a packet after 1.5 seconds, at most five sends.
  The bridge deduplicates retries and validates byte count and FNV-1a checksum
  before decoding or transcribing. Incomplete audio is never submitted.
- The device times out after 90 seconds; the bridge abandons an incomplete
  session after 20 seconds without activity. No automatic recording replay.
- Notification chunks use the negotiated MTU, capped at 180 bytes, falling back
  to 20 bytes before negotiation. Commands share the existing BLE service.
- Spoken confirmations are suppressed during recording and transfer.
- Task targeting is pinned when the start message arrives. Active-window title
  detection still depends on the macOS helper; an ambiguous task blocks sending.
- Nearby BLE clients can use this channel, as in the baseline. It is not a
  paired/authenticated private audio channel; secure pairing is follow-up work.

## Verification

Run bridge tests with `cd bridge && npm test`; build firmware with
`cd firmware && ../.venv/bin/pio run`.

The host-side encoder check uses the exact firmware codec:

```sh
c++ -std=c++11 bridge/test/ima-encode.cpp -o /tmp/cardputer-ima-encode
# Provide 16 kHz signed little-endian mono PCM, then decode with bridge/src/ble-audio.js.
/tmp/cardputer-ima-encode input.pcm output.ima
```

A local synthesized phrase was encoded with that C++ encoder, decoded by the
Node bridge, and transcribed successfully with the existing English Whisper model.

The diagnostic endpoint sends a deterministic 4,096-byte payload from the real
Cardputer over Bluetooth, checks every byte and the checksum, and never opens a
task or submits a prompt. It works with USB still plugged in:

```sh
curl -X POST -H 'X-Cardputer-UI: 1' http://127.0.0.1:8378/api/voice/ble-test
curl http://127.0.0.1:8378/status
```

The `bleAudio` status field reports completion, bytes, packets, duplicate retries,
and elapsed time. A transfer test is not proof of microphone quality or correct
queue/steer delivery; those require a spoken test on battery power.

Measured on the physical Cardputer on October 3, 2026: **4,096 bytes in 929 ms,
11 packets, zero duplicate retries**, with USB still connected and audio test
traffic explicitly routed through BLE. Firmware flash completed with hash
verification. The bridge has 52 passing tests. At this measured rate a full
10-second clip may take roughly 18 seconds to transfer after release; throughput
optimization and uninterrupted microphone capture still need device testing.

The local Whisper failure was a missing configured model. An existing
`ggml-base.en.bin` was verified and configured locally (configuration is ignored
by Git). This is English-only; multilingual use needs a suitable model.

## Return to the baseline

Switch to `main`, rebuild and flash its firmware, then restart the bridge. Local
configuration, short names, and prompts are ignored or stored outside Git. Keep
the repaired local Whisper model configuration when returning to the baseline.

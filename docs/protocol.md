# Cardputer bridge protocol v1

Firmware and bridge exchange newline-delimited JSON over the Cardputer USB CDC
serial port at 115200 baud. Every message contains `v: 1` and a `t` type.
Unknown types and fields are ignored so both sides can grow independently.

## Device to Mac

```json
{"v":1,"t":"hello","device":"cardputer","firmware":"0.6.0"}
{"v":1,"t":"action","id":"chat.open","slot":3,"gesture":"single"}
{"v":1,"t":"action","id":"request.approve"}
{"v":1,"t":"action","id":"answer.read","slot":3}
{"v":1,"t":"audio.start","rate":16000,"delivery":"queue"}
{"v":1,"t":"audio.start","rate":16000,"delivery":"steer"}
{"v":1,"t":"audio","data":"BASE64_PCM_S16LE_MONO"}
{"v":1,"t":"audio.end"}
```

Actions are semantic. App-specific shortcuts and UI safety checks belong in
the Mac bridge, not the firmware.

## Mac to device

```json
{"v":1,"t":"hello","protocol":1,"bridge":"0.6.0","capabilities":["chats","actions","model-metadata","rolling-recent","task-aliases","active-window","voice.offline","voice.release-submit","safe-approvals","prompt-shortcuts","sound.settings","speech.playback","answer.summary"]}
{"v":1,"t":"connection","bridge":true,"codex":true}
{"v":1,"t":"chat","slot":3,"title":"USB fix","model":"gpt-5.6-sol","reasoning":"high","state":"thinking","selected":true}
{"v":1,"t":"prompt.shortcuts","shortcuts":[{"key":"d","label":"DEPLOY"},{"key":"b","label":"BUILD"}]}
{"v":1,"t":"voice.state","state":"processing"}
{"v":1,"t":"type","text":"Run the tests and fix the failure.","submit":"queue"}
{"v":1,"t":"type","text":"Change direction and test the API first.","submit":"steer"}
{"v":1,"t":"toast","msg":"new task: start typing"}
{"v":1,"t":"cue","id":"complete"}
{"v":1,"t":"sound.settings","mode":"hybrid","volume":45}
{"v":1,"t":"speech.begin","bytes":2802,"format":"wav"}
{"v":1,"t":"speech.chunk","data":"BASE64_WAV_CHUNK"}
{"v":1,"t":"speech.end"}
{"v":1,"t":"ping"}
```

Chat state is one of `unassigned`, `idle`, `thinking`, `complete`,
`requires_input`, or `error`. Voice state is `idle`, `listening`, `processing`,
`preview`, or `error`.

Sound mode is `hybrid`, `tones`, or `mute`. Speech playback is an 8 kHz,
unsigned 8-bit mono WAV capped at 96 KiB and split into 2 KiB binary chunks
before base64 encoding. Firmware keeps the WAV buffer alive until asynchronous
speaker playback completes. Starting microphone capture cancels playback.

`delivery: queue` becomes an Enter submission after transcription.
`delivery: steer` becomes Command+Enter. The bridge activates the visible Codex
window, focuses its composer, and then asks the Cardputer HID endpoint to type
and submit the text. It does not open or retarget a recent-task tile.

The device declares the bridge offline after eight seconds without a received
message. The bridge pings every three seconds and reconnects to USB serial every
two seconds.

## Safety rules

- Protocol actions never contain arbitrary shell commands.
- Codex state is observed read-only; deck state is saved separately.
- Approval actions require Codex to be frontmost and exactly one matching
  visible, enabled request button.
- Microphone audio is written only to a mode-0600 temporary WAV, then deleted
  after transcription.
- Speech synthesis uses mode-0600 temporary input/audio inside a mode-0700
  directory and deletes it immediately after conversion.

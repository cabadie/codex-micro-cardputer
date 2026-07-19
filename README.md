# Codex Micro for Cardputer

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

An open-source M5Stack Cardputer implementation inspired by the OpenAI x Work
Louder Codex Micro experience for the Codex desktop app on macOS. It uses the
Cardputer's screen, keyboard, microphone, speaker, battery, USB HID, and USB
serial connection.

This is an independent community project. It is not affiliated with, endorsed
by, or supported by OpenAI, Work Louder, or M5Stack. “Codex,” “Codex Micro,”
and related marks belong to their respective owners.

## What works now

- Tile 1 is a permanent `ACTIVE WINDOW` route. Tiles 2 through 6 continuously
  show the five most recently modified visible Codex tasks.
- Tiles distinguish unassigned, idle, thinking, complete/unread, requires
  input, and error states.
- Tile labels use the current Codex sidebar task names from
  `~/.codex/session_index.jsonl`, with a database-title fallback.
- The selected voice/action target has a steady purple double border; thinking
  and voice states animate. The footer alternates its task name and
  model/reasoning.
- `1` activates the currently visible Codex window without changing tasks.
  Keys `2` through `6` open their displayed recent task, keep it selected, and
  double press foregrounds Codex.
- The default Micro actions are represented: Fast, Approve, Decline,
  Continue, push-to-talk, and Send.
- The four Micro stick actions are represented by the Cardputer Fn directions.
- Hold-to-talk and double-tap-to-latch use the onboard microphone. Offline
  Whisper sends automatically on release: Space queues, while Ctrl+Space
  steers the active run.
- Bookmarked tasks show their active model and reasoning effort. `m` opens the
  model picker, while `;` and `.` decrease and increase reasoning.
- The onboard speaker gives quiet lifecycle cues plus spoken confirmations such
  as Sent, Steered, Approved, Declined, and confirmed reasoning/model changes.
- `s` reads a very short, outcome-first summary of the selected task's latest
  completed answer through the Cardputer speaker. Summarization is local and
  does not create another model turn.
- Three focused device layers exist in this order: Codex Micro, Custom, and
  Typing. `Tab` cycles through only those three.
- Custom offers all 47 unmodified printable keys for mnemonic named prompts,
  isolated from the built-in Codex Micro mappings. For example, `d` can mean
  Deploy in Custom while remaining Decline in Codex Micro. Prompts can queue,
  steer, or remain as editable drafts, and may explicitly invoke installed
  skills with `$skill-name`.
- Without the bridge, the Typing layer remains a normal USB keyboard.
- Approve and Decline only press one exact, visible, enabled Codex request
  button. Ambiguous or absent UI fails closed.

## Controls

Tap `Tab` to cycle layers. The default Codex layer uses:

| Key | Action |
|---|---|
| `1` | Activate the visible Codex window; never switch tasks |
| `2` to `6` | Open the displayed recent task and keep it selected; double press to foreground Codex |
| `f` | Toggle Fast mode |
| `a` / `d` | Safely approve / decline a visible request |
| `c` | Continue in a new task |
| Hold `Space` | Record; release to transcribe and queue with Enter |
| Hold `Ctrl+Space` | Record; release to transcribe and steer with Command+Enter |
| Double-tap `Space` | Latch recording; tap again to stop |
| `Enter` | Send composer text |
| `p` | Toggle Plan mode |
| `b` | Toggle sidebar |
| `r` | Open review |
| `n` / `g` | New task / search tasks |
| `,` / `/` | Previous / next task |
| `m` | Open the model picker |
| `s` | Speak a short summary of the selected task's latest completed answer |
| `;` / `.` | Decrease / increase reasoning effort |
| `` ` `` | Cancel current composer action |
| Fn-left/right | Back / forward |
| Fn-up/down | Plan / sidebar |

### Cardputer Console

Open [http://127.0.0.1:8378/](http://127.0.0.1:8378/) while the bridge is
running. Tile 1 remains `ACTIVE WINDOW`; tiles 2 through 6 are a live preview of
the five most recently modified user-visible Codex tasks. Internal review agents
and subagents are excluded. **New Codex task** opens a fresh task, which joins the
deck once Codex records its first update.

The **Task short names** library lists up to 50 recent tasks, including tasks
that have moved beyond the five visible tiles. Each task can have an optional
Cardputer-only name of up to 24 characters. The alias is stored by task ID, so it
returns whenever that task comes back onto the deck. **Use Codex name** removes
the local alias; neither action changes the title inside Codex.

The console's **Speaker feedback** panel selects Hybrid, Tones only, or Muted;
sets speaker volume and the installed macOS voice; and controls the speech rate
and maximum answer-summary length. **Test speaker** sends a live confirmation
to the connected Cardputer.

The same console includes **Prompt shortcuts**. Pick any available key, give it
a display name of up to 12 characters, paste a prompt of up to 4,000 characters,
and choose **Queue immediately**, **Steer immediately**, or **Leave as draft**.
Purple keycaps are assigned; unassigned keycaps remain available. Custom is
isolated from Codex Micro, so mnemonic letters can overlap safely with built-in
actions. Tap `Tab` once from Codex Micro to enter Custom; tap it again for a
normal Typing keyboard. The searchable task library keeps short names attached
to Codex task IDs even after tasks move off the five-tile deck. Modifier
combinations pass through normally instead of firing macros.

## Requirements

- macOS with the Codex desktop app installed
- M5Stack Cardputer and a data-capable USB-C cable
- Node.js 22 or newer
- Xcode Command Line Tools (`xcode-select --install`)
- Python 3 and PlatformIO Core for firmware builds
- `whisper-cli` from [whisper.cpp](https://github.com/ggml-org/whisper.cpp) and
  a compatible GGML model for offline voice

## Quick start

Clone the repository and run the Mac bridge:

```sh
git clone https://github.com/cabadie/codex-micro-cardputer.git
cd codex-micro-cardputer/bridge
npm install
npm run build:helpers
npm test
npm start
```

Keep that terminal open for the first test. The bridge automatically discovers
the Cardputer, reads Codex metadata from `~/.codex/state_5.sqlite` without
modifying it, and serves the local console and diagnostics at:

- [http://127.0.0.1:8378/](http://127.0.0.1:8378/)
- [http://127.0.0.1:8378/status](http://127.0.0.1:8378/status)

For daily use, stop the foreground bridge and install the included macOS user
service. The installer resolves the repository and Node paths automatically,
installs dependencies, builds the Swift helpers, runs the tests, and starts the
bridge at login:

```sh
cd codex-micro-cardputer
./scripts/install-macos-service.sh
```

Runtime logs live in `~/.codex-cardputer/bridge.log` and
`~/.codex-cardputer/bridge-error.log`.

### macOS permissions

The bridge uses USB HID for ordinary typing and narrowly scoped macOS helpers
for app integration. In **System Settings > Privacy & Security**:

1. Under **Accessibility**, allow the terminal or Node process that runs the
   bridge and add `bridge/bin/codex-ax` for guarded Approve/Decline actions.
2. Under **Screen & System Audio Recording**, add
   `bridge/bin/codex-visible-task`. It reads the visible Codex task header when
   recording begins so voice remains pinned to the original task.

Rebuilding a helper can cause macOS to request permission again because these
development binaries are not code-signed. If a visible title cannot be matched
unambiguously, voice delivery stops safely rather than guessing another task.

The bridge works with defaults and does not require `config.json`. The default
`rolling` agent source reserves slot 1 and fills slots 2 through 6 with the five
most recently modified visible tasks. Existing `stable` configurations migrate
to `rolling`, and their tile nicknames become task-level aliases. To customize
the bridge, copy `bridge/config.example.json` to `bridge/config.json`; `null` path values mean
“use the detected default.” Legacy `recent` and `custom` sources remain supported.

## Configure offline voice

The bridge looks for `whisper-cli` or `whisper-cpp` on `PATH`. Put a compatible
GGML model at the default local-only path:

```text
bridge/tools/models/ggml-small.bin
```

Model binaries are ignored by Git. Follow the official
[whisper.cpp instructions](https://github.com/ggml-org/whisper.cpp) for current
build and model-download steps. To use a different binary or model, copy
`bridge/config.example.json` to `bridge/config.json`, set
`voice.whisperModel`, and optionally configure `voice.whisperCommand` as an argv
array with `{file}` where the temporary WAV path belongs.

No audio or transcript is sent to an online service in offline mode.

Spoken feedback also stays local. The bridge extracts the last completed answer
from its read-only Codex rollout, strips Markdown, code, links, and citations,
keeps the first outcome-oriented sentence within the configured word limit,
and uses the macOS `say` voice. Mode-0600 temporary text/audio files are deleted
immediately after conversion to a compact 8 kHz WAV for USB playback.

The official Codex Micro stops recording on release, prepares the prompt, and
waits for its Codex key before sending. This Cardputer build intentionally uses
release-to-send: plain Space queues, and Ctrl+Space steers. Voice always focuses
and submits to the composer in the currently visible Codex window; it never
opens or retargets a recent-task tile as a side effect of sending.

## Build and flash firmware

Install PlatformIO in a project-local Python virtual environment, then build
and flash:

```sh
cd codex-micro-cardputer
python3 -m venv .venv
.venv/bin/python -m pip install -U platformio
cd firmware
../.venv/bin/pio run
../.venv/bin/pio run -t upload
```

If normal upload cannot enter the bootloader, briefly open the Cardputer's
USB serial port at 1200 baud or use its documented bootloader-button sequence,
then rerun upload against the newly enumerated port.

## Privacy and local data

- The bridge binds its console only to `127.0.0.1`.
- Codex task metadata and rollout files are read-only.
- Cardputer aliases, shortcuts, and sound settings live in
  `~/.codex-cardputer/state.json` with local-user permissions.
- Microphone audio uses a mode-0600 temporary WAV and is deleted after
  transcription.
- Private configuration, compiled helpers, dependencies, firmware builds,
  models, logs, and runtime state are excluded from Git.

## Contributing

Issues and pull requests are welcome. Please read
[`CONTRIBUTING.md`](CONTRIBUTING.md) before contributing. Security-sensitive
reports should follow [`SECURITY.md`](SECURITY.md).

## License

Released under the [MIT License](LICENSE).

## Current parity boundary

This build deliberately does not impersonate official hardware inside Codex
Settings. It reproduces user-facing behavior through documented shortcuts,
task links, read-only local task metadata, USB HID, and guarded Accessibility.

Still to close for full Micro parity:

- pinned and priority task-source policies
- complete composer-control navigation beyond the current direct model and
  reasoning actions
- runtime remapping for built-in Codex Micro actions
- signed, login-starting Mac app packaging and compatibility diagnostics
- Bluetooth HID/data transport, remembered hosts, and wireless battery state
- broader end-to-end regression coverage across Codex desktop updates

The detailed product contract and remaining milestones are in
[`PLAN.md`](PLAN.md). The wire format is documented in
[`docs/protocol.md`](docs/protocol.md).

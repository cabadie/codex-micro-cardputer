# Codex Micro for Cardputer

## Product vision

Build a Cardputer experience that reproduces the user-visible behavior of the
OpenAI x Work Louder Codex Micro as closely as the hardware allows, while using
the Cardputer's screen, microphone, speaker, battery, and full keyboard to make
the experience more informative and portable.

The ChatGPT desktop app on macOS is the primary product target. Codex CLI,
Claude Code, and generic keyboard modes are secondary layers added only after
the Codex Desktop experience is coherent.

Official behavior reference:

- https://learn.chatgpt.com/docs/features/codex-micro
- https://learn.chatgpt.com/docs/reference/commands

## Clean-start rule

The existing top-level `firmware/` and `bridge/` projects remain an untouched
prototype and implementation reference.

Code is copied into this project only when it has a clear role in the new
architecture and can be covered by a test or hardware verification step. The
new project must not inherit the old action map, profile model, status model, or
CLI-first assumptions wholesale.

Useful pieces to evaluate for reuse:

- ESP32-S3 USB HID and CDC initialization
- Cardputer keyboard scanning and modifier handling
- 240 x 135 canvas rendering
- CDC JSON-lines framing
- Cardputer PDM microphone capture
- Whisper transcription plumbing as an optional voice mode
- serial reconnect and heartbeat logic

Pieces to redesign:

- Codex Desktop actions and safety gates
- chat assignment and switching
- status derivation
- screen information architecture and animation
- push-to-talk state machine
- command customization
- virtual analog-stick and dial interaction
- Bluetooth transport and pairing

## Product principles

1. **Match the real Micro first.** The default layer and default actions follow
   the shipped Codex Micro rather than an imagined macro pad.
2. **Design for glances.** A user should understand all six chats, the selected
   chat, recording state, connection state, and current control mode without
   opening ChatGPT.
3. **Send intents, not fragile keystroke recipes.** Firmware emits actions such
   as `request.approve`; the Mac bridge chooses the safest current mechanism.
4. **Fail closed for consequential actions.** Approve and decline do nothing
   unless the bridge can prove the expected Codex request is present.
5. **Preserve focus.** A single Agent Key changes the selected chat without
   stealing focus when possible; a double press intentionally foregrounds it.
6. **Work without the bridge.** The device remains a usable keyboard and shows
   a clear degraded/offline state.
7. **Do not write into Codex private state.** Local Codex files may be observed
   read-only where appropriate; assignments and deck state live in our config.
8. **Treat app updates as expected.** All app-specific behavior has capability
   checks and an explicit compatibility test.

## Target experience

### Startup

1. Show the Cardputer Micro wordmark and firmware version.
2. Establish USB or Bluetooth keyboard transport.
3. Connect to the Mac bridge.
4. Confirm the ChatGPT desktop app and compatibility adapter.
5. Populate six chat tiles and open the Codex layer.

Startup must identify degraded states precisely: `keyboard only`, `bridge
offline`, `Codex unavailable`, or `Codex connected`.

### Main screen

The default screen is a 3 x 2 grid of Codex chats.

Each tile shows:

- slot number
- shortened chat title or project name
- status color and icon
- selected/pulsing state
- unread marker

Status semantics match Codex Micro:

| State | Display treatment | Meaning |
|---|---|---|
| Unassigned | Dim/off | No chat follows this slot |
| Idle | White | Chat is idle |
| Thinking | Blue animation | ChatGPT is working |
| Complete | Green | Completed with an unread update |
| Requires input | Amber pulse | Approval or response is required |
| Error | Red | The chat failed or was aborted |

The top bar shows profile/layer, transport, bridge, Codex connection, and
battery. The bottom bar shows context-sensitive control hints.

### Agent Keys

Number keys 1 through 6 reproduce the six Agent Keys.

- Single press: select and open the assigned chat without foregrounding
  ChatGPT when the app permits it.
- Double press within 350 ms: select the chat and foreground ChatGPT.
- Unassigned custom slot: create a new chat and assign it after creation.
- Opening a completed chat clears the deck's local unread marker.

Agent source modes:

- Most recent chats
- Pinned chats
- Priority chats
- Custom assignments

### Default Command Keys

The Codex layer exposes the six shipped defaults prominently:

| Cardputer control | Default action |
|---|---|
| `f` | Toggle Fast mode |
| `a` | Approve the current request |
| `d` | Decline the current request |
| `c` | Continue the current chat in a new chat |
| Hold `space` | Push-to-talk |
| `enter` | Send the composer message |

These controls must remain available even if the user adds secondary command
layers.

### Virtual analog stick

The Cardputer has no analog stick, so the Fn-marked direction keys provide the
same four default actions:

| Direction | Default action |
|---|---|
| Up | Toggle Plan mode |
| Right | Forward in app history |
| Down | Show or hide the sidebar |
| Left | Back in app history |

Each direction is customizable through the bridge configurator.

### Virtual dial

Two adjacent keys act as dial-left and dial-right. A modified Enter acts as
dial press; Escape cancels the open control.

Supported modes:

- Composer navigation
- Reasoning only

When a composer control is open, the screen changes to a focused control view
showing the current option, adjacent options, and cancel affordance.

### Push-to-talk

The default experience uses the Cardputer microphone, which is an intentional
enhancement over the Micro's computer microphone.

Interaction:

- Hold Space to record; release to stop, transcribe, and queue automatically.
- Hold Ctrl+Space to record; release to stop, transcribe, and steer the active
  run automatically.
- Double-tap within 350 ms to latch recording.
- Press Space again to stop latched recording.
- Show a sea-green listening animation.
- Show a moving white processing animation.
- Bind each recording to the task selected when recording begins.

This is a deliberate Cardputer enhancement. The official Micro stops on
release and waits for the Codex key to send the prepared prompt; the Cardputer
uses release-to-send because its Ctrl modifier gives Queue and Steer distinct,
memorable gestures.

Voice modes:

1. Cardputer mic with local/offline transcription
2. Cardputer mic with a configurable transcription provider
3. Codex Desktop dictation using the Mac microphone

Transcripts are not sent automatically unless the user explicitly enables an
auto-send preference.

### Speaker feedback

Use short, quiet, distinct cues for:

- connected/disconnected
- recording start/stop
- transcript ready
- approval requested
- task completed
- error

Sound is configurable and must respect a mute setting. Repetitive status
updates are rate-limited so six active chats do not become noisy.

## Architecture

### Firmware

Responsibilities:

- Cardputer input scanning
- USB HID and CDC transport
- future BLE HID and BLE data transport
- screen rendering and animation
- microphone capture and audio chunk streaming
- speaker cues
- local preferences and cached presentation state
- keyboard-only fallback

Firmware sends semantic actions rather than app-specific key sequences whenever
the bridge is connected.

### Mac bridge

Responsibilities:

- discover and reconnect to the Cardputer
- verify the ChatGPT desktop app and its bundle identifier
- dispatch Codex actions using documented shortcuts first
- perform guarded Accessibility actions only when necessary
- open specific chats through supported/current app links
- maintain the six-slot assignment policy
- observe task metadata and activity without modifying Codex state
- derive unread, input-required, and error states
- transcribe Cardputer audio
- serve the local configurator
- expose diagnostics and compatibility status

### Protocol

Use versioned newline-delimited JSON.

Examples:

```json
{"v":1,"t":"action","id":"chat.open","slot":3,"gesture":"single"}
{"v":1,"t":"action","id":"request.approve"}
{"v":1,"t":"chat","slot":3,"threadId":"...","title":"USB fix","state":"thinking"}
{"v":1,"t":"voice","state":"processing"}
{"v":1,"t":"device","battery":82,"transport":"usb"}
```

Both sides advertise capabilities after connection so unsupported actions can
be hidden or disabled rather than failing silently.

### Proposed layout

```text
codex-micro-cardputer/
  PLAN.md
  README.md
  docs/
    ux-spec.md
    protocol.md
    compatibility.md
  firmware/
    platformio.ini
    src/
      app.cpp
      input/
      protocol/
      screen/
      voice/
      sound/
      transport/
  bridge/
    package.json
    src/
      index.js
      device/
      codex/
      chats/
      macos/
      voice/
      config/
    test/
  configurator/
  fixtures/
```

## Delivery plan

### Milestone 0: UX specification and compatibility probe

- Freeze the physical key map for the default Codex layer.
- Inventory available Codex Desktop shortcuts and commands.
- Prototype safe approve/decline detection.
- Prototype background chat switching.
- Define the protocol and state machine.
- Create static screen mockups for all core states.

Exit condition: every default Micro interaction has an implementation strategy
or an explicit, documented limitation.

### Milestone 1: One-chat vertical slice

- Boot and connection UI
- USB HID plus CDC
- One configured Codex chat
- Single and double press behavior
- Idle, thinking, complete, input, and error states
- Fast, approve, decline, continue, PTT, and send actions
- Safe failure behavior when Codex is not ready

Exit condition: one real Codex Desktop chat can be controlled end to end from
the Cardputer without using the Mac keyboard.

### Milestone 2: Six-chat dashboard

- Six slots
- Most recent and custom assignment sources
- Titles, status animations, selected pulse, and unread clearing
- Empty-slot new-chat behavior
- Priority ordering
- Pinned-source adapter or a clearly labeled deck-managed fallback

Exit condition: the Cardputer is useful as a glanceable six-chat controller
through a normal working day.

### Milestone 3: Interaction parity

- Hold and latched push-to-talk
- Transcript preview, send, and discard
- Virtual analog directions
- Composer-navigation and reasoning-only dial modes
- Context-sensitive screen views
- Speaker cues and mute

Exit condition: all default user-visible Micro controls are represented.

### Milestone 4: Customization and layers

- Local configurator
- Agent source and custom assignments
- Command Key and direction remapping
- Six total layers
- Codex CLI, Claude, and typing layers
- Brightness, idle timeout, voice, and sound preferences
- Config import/export

Exit condition: normal customization requires no firmware rebuild.

### Milestone 5: Wireless and device polish

- BLE HID
- BLE bridge data channel
- battery reporting
- three remembered Bluetooth hosts
- pairing UI
- idle sleep and wake behavior
- reconnect recovery
- optional over-the-air firmware update path

Exit condition: core operation works over USB and Bluetooth with clear battery
and connection feedback.

### Milestone 6: Compatibility hardening

- Automated bridge tests with recorded, sanitized Codex events
- firmware input/state tests where practical
- approval safety regression tests
- disconnect and reconnect tests
- compatibility probe for ChatGPT updates
- documented degraded behavior when a private app detail changes

## Acceptance checklist

The project is feature-complete when:

- Six Agent Keys implement the official single/double semantics.
- Most recent, pinned, priority, and custom assignment modes are available or a
  documented limitation has a deliberate fallback.
- All six status meanings are visually distinct.
- The selected chat visibly pulses.
- All six default Command Key actions work in Codex Desktop.
- Approve and decline cannot target the wrong app or an absent request.
- Hold and latched PTT work with the Cardputer microphone.
- Transcript processing and ready states are visible and audible.
- Virtual analog and dial actions match the Micro's defaults.
- Six layers are configurable without recompiling firmware.
- Brightness, idle timeout, battery, USB, and Bluetooth states are represented.
- Keyboard-only fallback remains usable when the bridge is unavailable.

## Known boundaries

- The Cardputer cannot reproduce the physical feel of the Micro's analog stick,
  rotary dial, or illuminated keycaps; it reproduces their functions and uses
  the display for richer feedback.
- Native appearance in ChatGPT's **Settings > Codex Micro** depends on an
  undocumented hardware protocol. Functional parity does not depend on
  impersonating the official device.
- Exact background switching and status fidelity depend on the integration
  points exposed by the installed ChatGPT version. The bridge must capability-
  check these behaviors and degrade explicitly.

## First build target

Start with Milestone 0, then implement one narrow end-to-end slice:

1. Cardputer boots into the six-tile screen.
2. Slot 1 points to one configured Codex chat.
3. Pressing `1` opens it; double-pressing foregrounds ChatGPT.
4. Starting and completing a real Codex turn changes the tile blue then green.
5. Holding Space records from the Cardputer mic and queues the transcript when
   released.
6. Holding Ctrl+Space records and steers the active run when released.
7. Approve and Decline work only against a verified visible request.

Do not expand to six chats or Bluetooth until this slice is reliable.

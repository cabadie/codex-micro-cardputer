#include <M5Cardputer.h>
#include <algorithm>
#include <vector>

#include "app_types.h"
#include "ble_transport.h"
#include "hid_out.h"
#include "protocol.h"
#include "screen.h"
#include "sound.h"
#include "voice.h"

static std::vector<char> previousWord;
static bool previousEnter = false;
static bool previousDelete = false;
static bool previousTab = false;
static bool previousSpace = false;

static uint32_t lastChatTapMs = 0;
static int8_t lastChatTapSlot = -1;
static int8_t lastSelectedSlot = 1;

static bool voiceLatched = false;
static bool pendingVoiceStop = false;
static bool suppressSpaceRelease = false;
static uint32_t voiceStopDeadlineMs = 0;
static uint32_t lastHelloMs = 0;
static uint32_t lastBatteryMs = 0;

static void selectLocalSlot(int slot) {
    lastSelectedSlot = slot;
    for (int index = 0; index < 6; index++) g_ui.chats[index].selected = index == slot - 1;
    screenDirty();
}

static void openChatSlot(int slot) {
    uint32_t now = millis();
    bool isDouble = lastChatTapSlot == slot && now - lastChatTapMs <= 350;
    selectLocalSlot(slot);
    protocolAction("chat.open", slot, isDouble ? "double" : "single");
    lastChatTapSlot = slot;
    lastChatTapMs = now;
}

static void sendAction(const char* id) {
    if (protocolConnected()) {
        protocolAction(id);
    } else {
        screenToast("bridge required");
        soundCue("error");
    }
}

static int selectedSlot() {
    return lastSelectedSlot >= 1 && lastSelectedSlot <= 6 ? lastSelectedSlot : 1;
}

static void readLatestAnswer() {
    if (protocolConnected()) {
        protocolAction("answer.read", selectedSlot());
    } else {
        screenToast("bridge required");
        soundCue("error");
    }
}

static void handleDirection(char key) {
    switch (key) {
        case ';': sendAction("plan.toggle"); break;
        case '/': sendAction("history.forward"); break;
        case '.': sendAction("sidebar.toggle"); break;
        case ',': sendAction("history.back"); break;
    }
}

static void handleCodexKey(char key, const Keyboard_Class::KeysState& state) {
    if (key >= '1' && key <= '6') {
        openChatSlot(key - '0');
        return;
    }
    switch (key) {
        case 'f': sendAction("fast.toggle"); break;
        case 'a': sendAction("request.approve"); break;
        case 'd': sendAction("request.decline"); break;
        case 'c': sendAction("chat.continue"); break;
        case 'p': sendAction("plan.toggle"); break;
        case 'b': sendAction("sidebar.toggle"); break;
        case 'r': sendAction("review.open"); break;
        case 'n': sendAction("chat.new"); break;
        case 'g': sendAction("chat.search"); break;
        case 'm': sendAction("model.open"); break;
        case 's': readLatestAnswer(); break;
        case ',': sendAction("chat.previous"); break;
        case '/': sendAction("chat.next"); break;
        case ';': sendAction("reasoning.decrease"); break;
        case '.': sendAction("reasoning.increase"); break;
        case '`': sendAction("composer.cancel"); break;
        default: hidChar(key); break;
    }
}

static void handleKeyDown(char key, const Keyboard_Class::KeysState& state) {
    if (key == ' ') return;  // Space has its own voice/typing gesture below.
    if (state.fn && (key == ';' || key == '.' || key == ',' || key == '/')) {
        handleDirection(key);
        return;
    }

    if (g_ui.layer == LAYER_CUSTOM) {
        if (state.ctrl || state.opt || state.alt || state.fn || state.shift) {
            hidPassChar(key, state.ctrl, state.opt, state.alt);
        } else if (promptShortcutForKey(key)) {
            protocolPromptShortcut(key);
        } else {
            screenToast("key not assigned");
            soundCue("error");
        }
        return;
    }
    if (g_ui.layer == LAYER_TYPING) {
        hidPassChar(key, state.ctrl, state.opt, state.alt);
        return;
    }
    if (g_ui.layer == LAYER_CODEX) {
        handleCodexKey(key, state);
        return;
    }
}

static void beginVoiceGesture(bool steer) {
    if (!protocolConnected()) {
        screenToast("bridge required for voice");
        soundCue("error");
        suppressSpaceRelease = true;
        return;
    }
    if (!protocolVoiceSupported()) {
        screenToast("voice needs USB");
        soundCue("error");
        suppressSpaceRelease = true;
        return;
    }
    if (voiceLatched) {
        voiceLatched = false;
        pendingVoiceStop = false;
        suppressSpaceRelease = true;
        voiceStop();
        return;
    }
    if (pendingVoiceStop && millis() < voiceStopDeadlineMs) {
        pendingVoiceStop = false;
        voiceLatched = true;
        screenToast("hands-free recording");
        return;
    }
    voiceStart(steer);
}

static void endVoiceGesture() {
    if (suppressSpaceRelease) {
        suppressSpaceRelease = false;
        return;
    }
    if (!voiceActive() || voiceLatched) return;
    pendingVoiceStop = true;
    voiceStopDeadlineMs = millis() + 350;
}

static void handleEnter() {
    if (g_ui.voice == VOICE_PREVIEW) {
        protocolAction("voice.send");
    } else if (g_ui.layer == LAYER_TYPING || !protocolConnected()) {
        hidTap(KEY_RETURN);
    } else {
        protocolAction("composer.send");
    }
}

static void handleDelete() {
    if (g_ui.voice == VOICE_PREVIEW || g_ui.voice == VOICE_ERROR) {
        protocolAction("voice.discard");
        g_ui.voice = VOICE_IDLE;
        g_ui.voicePreview = "";
        screenDirty();
    } else if (g_ui.layer == LAYER_TYPING) {
        hidTap(KEY_BACKSPACE);
    } else {
        sendAction("composer.cancel");
    }
}

static void initializeModel() {
    g_ui.layer = LAYER_CODEX;
    g_ui.voice = VOICE_IDLE;
    g_ui.voiceSteer = false;
    g_ui.voicePreview = "";
    g_ui.bridgeConnected = false;
    g_ui.codexConnected = false;
    g_ui.battery = -1;
    g_ui.promptShortcutCount = 0;
    for (ChatSlot& chat : g_ui.chats) {
        chat.title[0] = 0;
        chat.model[0] = 0;
        chat.reasoning[0] = 0;
        chat.state = CHAT_UNASSIGNED;
        chat.selected = false;
    }
}

void setup() {
    auto config = M5.config();
    M5Cardputer.begin(config, true);
    M5Cardputer.Display.setRotation(1);
    M5Cardputer.Display.setBrightness(72);
    initializeModel();
    hidBegin();
    screenBegin();
    screenToast("starting wireless");
    const bool bluetoothReady = bleTransportBegin();
    soundBegin();
    protocolBegin();
    voiceBegin();
    if (bluetoothReady) {
        screenToast("Codex Micro ready");
    } else {
        char message[32];
        snprintf(message, sizeof(message), "BLE recovery stage %u", bleTransportRecoveredStage());
        screenToast(message);
    }
}

void loop() {
    M5Cardputer.update();
    bleTransportLoop();
    protocolLoop();
    soundLoop();
    voicePump();

    uint32_t now = millis();
    if (pendingVoiceStop && now >= voiceStopDeadlineMs) {
        pendingVoiceStop = false;
        voiceStop();
    }
    if (!protocolConnected() && now - lastHelloMs > 3000) {
        lastHelloMs = now;
        protocolHello();
    }
    if (now - lastBatteryMs > 5000) {
        lastBatteryMs = now;
        g_ui.battery = M5Cardputer.Power.getBatteryLevel();
        if (g_ui.battery >= 0) bleTransportSetBattery((uint8_t)g_ui.battery);
        screenDirty();
    }

    // The keyboard library can occasionally miss the change edge when the mic
    // and USB transport are busy. Poll the live Space state while recording so
    // release-to-send cannot remain stuck in Listening.
    if (voiceActive() && previousSpace && !voiceLatched) {
        auto liveState = M5Cardputer.Keyboard.keysState();
        if (!liveState.space) {
            endVoiceGesture();
            previousSpace = false;
        }
    }

    if (M5Cardputer.Keyboard.isChange()) {
        auto state = M5Cardputer.Keyboard.keysState();
        for (char key : state.word) {
            if (std::find(previousWord.begin(), previousWord.end(), key) == previousWord.end()) {
                handleKeyDown(key, state);
            }
        }
        if (state.enter && !previousEnter) handleEnter();
        if (state.del && !previousDelete) handleDelete();
        if (state.tab && !previousTab && g_ui.voice == VOICE_IDLE) {
            g_ui.layer = (Layer)((g_ui.layer + 1) % LAYER_COUNT);
            screenToast(layerName(g_ui.layer));
            screenDirty();
        }
        if (state.space && !previousSpace) {
            if (g_ui.layer == LAYER_TYPING) hidChar(' ');
            else if (g_ui.voice == VOICE_PREVIEW) {}
            else beginVoiceGesture(state.ctrl);
        }
        if (!state.space && previousSpace && g_ui.layer != LAYER_TYPING) endVoiceGesture();

        previousWord.assign(state.word.begin(), state.word.end());
        previousEnter = state.enter;
        previousDelete = state.del;
        previousTab = state.tab;
        previousSpace = state.space;
    }

    screenLoop();
    delay(5);
}

#include "protocol.h"

#include <Arduino.h>
#include <ArduinoJson.h>
#include <mbedtls/base64.h>
#include <string.h>

#include "app_types.h"
#include "ble_transport.h"
#include "hid_out.h"
#include "screen.h"
#include "sound.h"

static uint32_t lastSerialReceiveMs = 0;
static uint32_t lastBleReceiveMs = 0;
static char serialInputBuffer[8192];
static size_t serialInputLength = 0;
static char bleInputBuffer[8192];
static size_t bleInputLength = 0;
static unsigned char audioBase64[5500];
static unsigned char speechDecoded[2200];
static bool speechTransferAccepted = false;

static ChatState parseState(const char* value) {
    if (!value) return CHAT_UNASSIGNED;
    if (!strcmp(value, "idle")) return CHAT_IDLE;
    if (!strcmp(value, "thinking")) return CHAT_THINKING;
    if (!strcmp(value, "complete")) return CHAT_COMPLETE;
    if (!strcmp(value, "requires_input")) return CHAT_REQUIRES_INPUT;
    if (!strcmp(value, "error")) return CHAT_ERROR;
    return CHAT_UNASSIGNED;
}

static VoiceUiState parseVoiceState(const char* value) {
    if (!value || !strcmp(value, "idle")) return VOICE_IDLE;
    if (!strcmp(value, "listening")) return VOICE_LISTENING;
    if (!strcmp(value, "processing")) return VOICE_PROCESSING;
    if (!strcmp(value, "preview")) return VOICE_PREVIEW;
    return VOICE_ERROR;
}

enum ProtocolTransport : uint8_t { TRANSPORT_USB, TRANSPORT_BLE };
static ProtocolTransport lastReceivedTransport = TRANSPORT_USB;

static bool recently(uint32_t value) {
    return value && millis() - value < 8000;
}

static ProtocolTransport activeTransport() {
    // The bridge only writes to its chosen transport. Remembering the source of
    // the latest valid message makes failover immediate instead of waiting for
    // the old transport's heartbeat timeout.
    if (lastReceivedTransport == TRANSPORT_BLE && recently(lastBleReceiveMs)) return TRANSPORT_BLE;
    if (lastReceivedTransport == TRANSPORT_USB && recently(lastSerialReceiveMs)) return TRANSPORT_USB;
    return recently(lastSerialReceiveMs) ? TRANSPORT_USB : TRANSPORT_BLE;
}

static void sendLine(const char* line) {
    if (!line) return;
    if (activeTransport() == TRANSPORT_USB || !bleTransportConnected()) Serial.println(line);
    else bleTransportSendLine(line);
}

static void handleMessage(char* line, ProtocolTransport transport) {
    JsonDocument document;
    if (deserializeJson(document, line)) return;
    if (transport == TRANSPORT_BLE) lastBleReceiveMs = millis();
    else lastSerialReceiveMs = millis();
    lastReceivedTransport = transport;
    g_ui.bridgeConnected = true;
    const char* type = document["t"];
    if (!type) return;

    if (!strcmp(type, "hello") || !strcmp(type, "ping")) {
        g_ui.codexConnected = true;
    } else if (!strcmp(type, "connection")) {
        g_ui.bridgeConnected = document["bridge"] | g_ui.bridgeConnected;
        g_ui.codexConnected = document["codex"] | g_ui.codexConnected;
    } else if (!strcmp(type, "chat")) {
        int slot = document["slot"] | 0;
        if (slot >= 1 && slot <= 6) {
            ChatSlot& chat = g_ui.chats[slot - 1];
            const char* title = document["title"] | "";
            strncpy(chat.title, title, sizeof(chat.title) - 1);
            chat.title[sizeof(chat.title) - 1] = 0;
            const char* model = document["model"] | "";
            strncpy(chat.model, model, sizeof(chat.model) - 1);
            chat.model[sizeof(chat.model) - 1] = 0;
            const char* reasoning = document["reasoning"] | "";
            strncpy(chat.reasoning, reasoning, sizeof(chat.reasoning) - 1);
            chat.reasoning[sizeof(chat.reasoning) - 1] = 0;
            ChatState previous = chat.state;
            chat.state = parseState(document["state"] | "unassigned");
            chat.selected = document["selected"] | false;
            if (previous != CHAT_UNASSIGNED && previous != chat.state && g_ui.voice == VOICE_IDLE) {
                if (chat.state == CHAT_COMPLETE) soundCue("complete");
                if (chat.state == CHAT_REQUIRES_INPUT) soundCue("input");
                if (chat.state == CHAT_ERROR) soundCue("error");
            }
            screenDirty();
        }
    } else if (!strcmp(type, "prompt.shortcuts")) {
        g_ui.promptShortcutCount = 0;
        for (JsonObject item : document["shortcuts"].as<JsonArray>()) {
            if (g_ui.promptShortcutCount >= MAX_PROMPT_SHORTCUTS) break;
            const char* key = item["key"] | "";
            const char* label = item["label"] | "";
            if (!key[0] || key[1] || !label[0]) continue;
            PromptShortcut& shortcut = g_ui.promptShortcuts[g_ui.promptShortcutCount++];
            shortcut.key = key[0];
            strncpy(shortcut.label, label, sizeof(shortcut.label) - 1);
            shortcut.label[sizeof(shortcut.label) - 1] = 0;
        }
        screenDirty();
    } else if (!strcmp(type, "toast")) {
        screenToast(document["msg"] | "");
    } else if (!strcmp(type, "voice.state")) {
        g_ui.voice = parseVoiceState(document["state"] | "idle");
        if (g_ui.voice == VOICE_ERROR) screenToast(document["msg"] | "voice error");
        screenDirty();
    } else if (!strcmp(type, "voice.preview")) {
        g_ui.voicePreview = String(document["text"] | "");
        g_ui.voice = VOICE_PREVIEW;
        screenDirty();
    } else if (!strcmp(type, "sound.settings")) {
        soundSetMode(document["mode"] | "hybrid");
        soundSetVolume((uint8_t)(document["volume"] | 45));
    } else if (!strcmp(type, "speech.begin")) {
        speechTransferAccepted = soundSpeechBegin((size_t)(document["bytes"] | 0));
    } else if (!strcmp(type, "speech.chunk")) {
        if (!speechTransferAccepted) return;
        const char* encoded = document["data"] | "";
        size_t decodedLength = 0;
        if (!encoded[0] || mbedtls_base64_decode(
            speechDecoded,
            sizeof(speechDecoded),
            &decodedLength,
            (const unsigned char*)encoded,
            strlen(encoded)
        ) != 0 || !soundSpeechAppend(speechDecoded, decodedLength)) {
            speechTransferAccepted = false;
            soundSpeechCancel();
        }
    } else if (!strcmp(type, "speech.end")) {
        if (speechTransferAccepted && !soundSpeechEnd()) screenToast("speech playback failed");
        speechTransferAccepted = false;
    } else if (!strcmp(type, "type")) {
        const char* text = document["text"] | "";
        if (text[0]) hidText(text);
        const char* submit = document["submit"] | "";
        if (!strcmp(submit, "steer")) hidTapMod(KEY_RETURN, KEY_LEFT_GUI);
        else if (!strcmp(submit, "queue") || (document["enter"] | false)) hidTap(KEY_RETURN);
    } else if (!strcmp(type, "shortcut")) {
        bool command = false;
        bool shift = false;
        bool option = false;
        bool control = false;
        for (JsonVariant modifier : document["modifiers"].as<JsonArray>()) {
            const char* name = modifier.as<const char*>();
            if (!name) continue;
            if (!strcmp(name, "command")) command = true;
            else if (!strcmp(name, "shift")) shift = true;
            else if (!strcmp(name, "option")) option = true;
            else if (!strcmp(name, "control")) control = true;
        }
        hidShortcut(document["key"] | "", command, shift, option, control);
    } else if (!strcmp(type, "cue")) {
        soundCue(document["id"] | "");
    }
}

void protocolBegin() {
    Serial.begin(115200);
    protocolHello();
}

bool protocolConnected() {
    return recently(lastSerialReceiveMs) || recently(lastBleReceiveMs);
}

bool protocolUsingBle() {
    return protocolConnected() && activeTransport() == TRANSPORT_BLE;
}

bool protocolVoiceSupported() {
    return protocolConnected() && activeTransport() == TRANSPORT_USB;
}

const char* protocolTransportName() { return protocolUsingBle() ? "BLE" : "USB"; }

void protocolHello() {
    static const char* hello = "{\"v\":1,\"t\":\"hello\",\"device\":\"cardputer\",\"firmware\":\"0.7.0\",\"transports\":[\"usb\",\"ble\"]}";
    Serial.println(hello);
    bleTransportSendLine(hello);
}

void protocolAction(const char* id, int slot, const char* gesture) {
    JsonDocument document;
    document["v"] = 1;
    document["t"] = "action";
    document["id"] = id;
    if (slot > 0) document["slot"] = slot;
    if (gesture) document["gesture"] = gesture;
    String line;
    serializeJson(document, line);
    sendLine(line.c_str());
}

void protocolPromptShortcut(char key) {
    JsonDocument document;
    document["v"] = 1;
    document["t"] = "action";
    document["id"] = "prompt.run";
    char keyText[2] = {key, 0};
    document["key"] = keyText;
    String line;
    serializeJson(document, line);
    sendLine(line.c_str());
}

void protocolAudioStart(uint32_t rate, const char* delivery) {
    Serial.printf(
        "{\"v\":1,\"t\":\"audio.start\",\"rate\":%u,\"delivery\":\"%s\"}\n",
        (unsigned)rate,
        delivery ? delivery : "queue"
    );
}

void protocolAudioChunk(const unsigned char* data, size_t length) {
    // voice.cpp sends at most 4096 bytes per chunk. A fixed buffer avoids
    // allocating/freeing several kilobytes on every microphone packet.
    if (length > 4096) return;
    const size_t outputSize = ((length + 2) / 3) * 4 + 8;
    if (outputSize > sizeof(audioBase64)) return;
    size_t encodedLength = 0;
    if (mbedtls_base64_encode(audioBase64, outputSize, &encodedLength, data, length) == 0) {
        Serial.print("{\"v\":1,\"t\":\"audio\",\"data\":\"");
        Serial.write(audioBase64, encodedLength);
        Serial.println("\"}");
    }
}

void protocolAudioEnd() {
    Serial.println("{\"v\":1,\"t\":\"audio.end\"}");
}

void protocolLoop() {
    while (Serial.available()) {
        char value = (char)Serial.read();
        if (value == '\n' || serialInputLength >= sizeof(serialInputBuffer) - 1) {
            serialInputBuffer[serialInputLength] = 0;
            serialInputLength = 0;
            handleMessage(serialInputBuffer, TRANSPORT_USB);
        } else if (value != '\r') {
            serialInputBuffer[serialInputLength++] = value;
        }
    }
    if (g_ui.bridgeConnected && !protocolConnected()) {
        soundCue("disconnected");
        g_ui.bridgeConnected = false;
        g_ui.codexConnected = false;
        screenDirty();
    }
}

void protocolReceiveBle(const uint8_t* data, size_t length) {
    for (size_t index = 0; index < length; index++) {
        const char value = (char)data[index];
        if (value == '\n' || bleInputLength >= sizeof(bleInputBuffer) - 1) {
            bleInputBuffer[bleInputLength] = 0;
            bleInputLength = 0;
            handleMessage(bleInputBuffer, TRANSPORT_BLE);
        } else if (value != '\r') {
            bleInputBuffer[bleInputLength++] = value;
        }
    }
}

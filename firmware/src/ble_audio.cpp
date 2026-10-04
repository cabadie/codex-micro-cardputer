#include "ble_audio.h"
#include <Arduino.h>
#include <esp_system.h>
#include <mbedtls/base64.h>
#include "ble_transport.h"
#include "ima_adpcm.h"
#include "app_types.h"
#include "screen.h"

// Bounded first experiment: capture up to ten seconds, transfer after release.
static constexpr size_t CAPACITY = 80000;
static constexpr size_t PACKET = 384;
static uint8_t* audio = nullptr;
static size_t used = 0, offset = 0;
static uint32_t id = 0, sentAt = 0, startedAt = 0, checksum = 2166136261u;
static int seq = -1;
static unsigned retries = 0;
static bool begun = false, finished = false, steerMode = false, testing = false;
static ImaEncoder encoder;

bool bleAudioBusy() { return audio != nullptr; }
void bleAudioCancel() { free(audio); audio = nullptr; }

static void failed(const char* reason) {
    char line[140];
    snprintf(line, sizeof(line), "{\"t\":\"ble.audio.abort\",\"id\":%u}", id);
    bleTransportSendLine(line);
    bleAudioCancel();
    g_ui.voice = VOICE_ERROR;
    screenToast(reason);
    screenDirty();
}

bool bleAudioBegin(bool steer, bool test) {
    if (audio || !bleTransportConnected()) return false;
    audio = (uint8_t*)malloc(test ? 4096 : CAPACITY);
    if (!audio) { screenToast("not enough audio memory"); return false; }
    id = esp_random();
    if (!id) id = 1;
    used = offset = 0;
    checksum = 2166136261u;
    seq = -1; retries = 0; sentAt = 0; startedAt = millis();
    begun = finished = false; steerMode = steer; testing = test;
    encoder = ImaEncoder{};
    if (test) {
        for (size_t i = 0; i < 4096; ++i) {
            audio[used++] = (uint8_t)((i * 31 + 7) & 255);
            checksum = (checksum ^ audio[i]) * 16777619u;
        }
        finished = true;
        g_ui.voice = VOICE_PROCESSING;
        screenToast("BLE audio link test");
    }
    return true;
}

bool bleAudioAppend(const int16_t* samples, size_t count) {
    if (!audio || finished) return false;
    for (size_t i = 0; i + 1 < count; i += 2) {
        if (used >= CAPACITY) return false;
        const uint8_t low = encoder.encode(samples[i]);
        const uint8_t high = encoder.encode(samples[i + 1]);
        audio[used++] = low | (high << 4);
        checksum = (checksum ^ audio[used - 1]) * 16777619u;
    }
    return used < CAPACITY;
}

void bleAudioFinish() {
    if (!audio) return;
    finished = true;
    screenToast("sending Bluetooth audio");
}

void bleAudioAck(uint32_t receivedId, int receivedSeq) {
    if (!audio || id != receivedId || seq != receivedSeq || !sentAt) return;
    if (seq == -1) { begun = true; seq = 0; }
    else if (seq == -2) { bleAudioCancel(); return; }
    else { offset += min(PACKET, used - offset); seq++; }
    sentAt = 0; retries = 0;
}

void bleAudioPump() {
    if (!audio) return;
    if (!bleTransportConnected()) { failed("Bluetooth disconnected"); return; }
    if (millis() - startedAt > 90000) { failed("Bluetooth audio timed out"); return; }
    if (sentAt && millis() - sentAt < 1500) return;
    if (begun && !finished) return;
    if (++retries > 5) { failed("Bluetooth packet timeout"); return; }
    char line[700];
    if (!begun) {
        snprintf(line, sizeof(line), "{\"t\":\"ble.audio.begin\",\"id\":%u,\"codec\":\"ima4\",\"rate\":16000,\"delivery\":\"%s\",\"test\":%s}", id, steerMode ? "steer" : "queue", testing ? "true" : "false");
    } else if (offset < used) {
        unsigned char encoded[520]; size_t length = 0;
        mbedtls_base64_encode(encoded, sizeof(encoded), &length, audio + offset, min(PACKET, used - offset));
        encoded[length] = 0;
        snprintf(line, sizeof(line), "{\"t\":\"ble.audio.data\",\"id\":%u,\"seq\":%d,\"data\":\"%s\"}", id, seq, encoded);
    } else {
        seq = -2;
        snprintf(line, sizeof(line), "{\"t\":\"ble.audio.end\",\"id\":%u,\"bytes\":%u,\"checksum\":%u}", id, (unsigned)used, checksum);
    }
    sentAt = millis();
    if (!bleTransportSendLine(line)) failed("Bluetooth send failed");
}

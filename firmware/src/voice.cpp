#include "voice.h"

#include <M5Cardputer.h>

#include "app_types.h"
#include "protocol.h"
#include "screen.h"
#include "sound.h"
#include "ble_audio.h"

static constexpr size_t CHUNK_SAMPLES = 2048;
static constexpr uint32_t SAMPLE_RATE = 16000;
static constexpr uint32_t MAX_RECORDING_MS = 90000;
static constexpr uint32_t DRAIN_TIMEOUT_MS = 750;

static int16_t buffers[2][CHUNK_SAMPLES];
static bool active = false;
static uint8_t head = 0;
static uint8_t pending = 0;
static uint32_t startedAtMs = 0;
static bool wireless = false;

void voiceBegin() {}

bool voiceStart(bool steer) {
    if (active) return true;
    if (bleAudioBusy() || g_ui.voice == VOICE_PROCESSING) return false;
    wireless = protocolUsingBle();
    if (wireless && !bleAudioBegin(steer)) return false;
    soundSpeechCancel();
    soundCue("record.start");
    M5Cardputer.Speaker.end();
    if (!M5Cardputer.Mic.begin()) {
        if (wireless) bleAudioCancel();
        M5Cardputer.Speaker.begin();
        soundBegin();
        g_ui.voice = VOICE_ERROR;
        screenToast("microphone failed");
        return false;
    }
    active = true;
    startedAtMs = millis();
    head = 0;
    M5Cardputer.Mic.record(buffers[0], CHUNK_SAMPLES, SAMPLE_RATE);
    M5Cardputer.Mic.record(buffers[1], CHUNK_SAMPLES, SAMPLE_RATE);
    pending = 2;
    g_ui.voice = VOICE_LISTENING;
    g_ui.voiceSteer = steer;
    g_ui.voicePreview = "";
    if (!wireless) protocolAudioStart(SAMPLE_RATE, steer ? "steer" : "queue");
    else screenToast("Bluetooth voice: max 10s");
    screenDirty();
    return true;
}

void voicePump() {
    bleAudioPump();
    if (!active) return;
    if (wireless && !bleAudioBusy()) {
        active = false;
        M5Cardputer.Mic.end();
        pending = 0;
        M5Cardputer.Speaker.begin();
        soundBegin();
        return;
    }
    if (millis() - startedAtMs >= MAX_RECORDING_MS) {
        screenToast("voice auto-stop");
        voiceStop();
        return;
    }
    while (pending > M5Cardputer.Mic.isRecording()) {
        if (wireless) {
            if (!bleAudioAppend(buffers[head], CHUNK_SAMPLES)) {
                // This completed buffer has been consumed; don't drain it twice.
                head ^= 1;
                pending--;
                voiceStop();
                return;
            }
        } else protocolAudioChunk((const unsigned char*)buffers[head], CHUNK_SAMPLES * sizeof(int16_t));
        M5Cardputer.Mic.record(buffers[head], CHUNK_SAMPLES, SAMPLE_RATE);
        head ^= 1;
    }
}

void voiceStop() {
    if (!active) return;
    active = false;
    const uint32_t drainDeadline = millis() + DRAIN_TIMEOUT_MS;
    while (pending > 0 && (int32_t)(drainDeadline - millis()) > 0) {
        uint8_t inFlight = M5Cardputer.Mic.isRecording();
        while (pending > inFlight) {
            if (wireless) bleAudioAppend(buffers[head], CHUNK_SAMPLES);
            else protocolAudioChunk((const unsigned char*)buffers[head], CHUNK_SAMPLES * sizeof(int16_t));
            head ^= 1;
            pending--;
        }
        delay(1);
    }
    M5Cardputer.Mic.end();
    pending = 0;
    M5Cardputer.Speaker.begin();
    soundBegin();
    soundCue("record.stop");
    g_ui.voice = VOICE_PROCESSING;
    if (wireless) bleAudioFinish();
    else protocolAudioEnd();
    screenDirty();
}

bool voiceActive() { return active; }

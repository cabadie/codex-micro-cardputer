#include "voice.h"

#include <M5Cardputer.h>

#include "app_types.h"
#include "protocol.h"
#include "screen.h"
#include "sound.h"

static constexpr size_t CHUNK_SAMPLES = 2048;
static constexpr uint32_t SAMPLE_RATE = 16000;

static int16_t buffers[2][CHUNK_SAMPLES];
static bool active = false;
static uint8_t head = 0;
static uint8_t pending = 0;

void voiceBegin() {}

bool voiceStart(bool steer) {
    if (active) return true;
    soundSpeechCancel();
    soundCue("record.start");
    M5Cardputer.Speaker.end();
    if (!M5Cardputer.Mic.begin()) {
        M5Cardputer.Speaker.begin();
        soundBegin();
        g_ui.voice = VOICE_ERROR;
        screenToast("microphone failed");
        return false;
    }
    active = true;
    head = 0;
    M5Cardputer.Mic.record(buffers[0], CHUNK_SAMPLES, SAMPLE_RATE);
    M5Cardputer.Mic.record(buffers[1], CHUNK_SAMPLES, SAMPLE_RATE);
    pending = 2;
    g_ui.voice = VOICE_LISTENING;
    g_ui.voiceSteer = steer;
    g_ui.voicePreview = "";
    protocolAudioStart(SAMPLE_RATE, steer ? "steer" : "queue");
    screenDirty();
    return true;
}

void voicePump() {
    if (!active) return;
    while (pending > M5Cardputer.Mic.isRecording()) {
        protocolAudioChunk((const unsigned char*)buffers[head], CHUNK_SAMPLES * sizeof(int16_t));
        M5Cardputer.Mic.record(buffers[head], CHUNK_SAMPLES, SAMPLE_RATE);
        head ^= 1;
    }
}

void voiceStop() {
    if (!active) return;
    active = false;
    while (pending > 0) {
        uint8_t inFlight = M5Cardputer.Mic.isRecording();
        while (pending > inFlight) {
            protocolAudioChunk((const unsigned char*)buffers[head], CHUNK_SAMPLES * sizeof(int16_t));
            head ^= 1;
            pending--;
        }
        delay(1);
    }
    M5Cardputer.Mic.end();
    M5Cardputer.Speaker.begin();
    soundBegin();
    soundCue("record.stop");
    g_ui.voice = VOICE_PROCESSING;
    protocolAudioEnd();
    screenDirty();
}

bool voiceActive() { return active; }

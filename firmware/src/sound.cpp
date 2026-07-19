#include "sound.h"

#include <M5Cardputer.h>
#include <string.h>
#include <vector>

enum SoundMode : uint8_t {
    SOUND_HYBRID = 0,
    SOUND_TONES,
    SOUND_MUTED,
};

static constexpr size_t MAX_SPEECH_BYTES = 96 * 1024;
static SoundMode soundMode = SOUND_HYBRID;
static uint8_t soundVolume = 45;
static uint32_t lastAmbientCueMs = 0;
static std::vector<uint8_t> speechBuffer;
static bool speechReceiving = false;
static bool speechPlaying = false;

void soundBegin() {
    M5Cardputer.Speaker.setVolume(soundVolume);
}

void soundLoop() {
    if (speechPlaying && !M5Cardputer.Speaker.isPlaying()) {
        speechPlaying = false;
        speechBuffer.clear();
    }
}

void soundSetMode(const char* mode) {
    if (mode && !strcmp(mode, "mute")) soundMode = SOUND_MUTED;
    else if (mode && !strcmp(mode, "tones")) soundMode = SOUND_TONES;
    else soundMode = SOUND_HYBRID;
    if (soundMode != SOUND_HYBRID) soundSpeechCancel();
}

void soundSetVolume(uint8_t volume) {
    soundVolume = volume > 100 ? 100 : volume;
    M5Cardputer.Speaker.setVolume(soundVolume);
}

void soundSetMuted(bool value) { soundSetMode(value ? "mute" : "hybrid"); }
bool soundMuted() { return soundMode == SOUND_MUTED; }

static void note(float frequency, uint32_t duration) {
    if (soundMode == SOUND_MUTED) return;
    M5Cardputer.Speaker.tone(frequency, duration);
    delay(duration + 8);
}

void soundCue(const char* id) {
    if (soundMode == SOUND_MUTED || !id) return;
    const bool ambient = !strcmp(id, "complete") || !strcmp(id, "input");
    if (ambient) {
        const uint32_t now = millis();
        if (lastAmbientCueMs && now - lastAmbientCueMs < 900) return;
        lastAmbientCueMs = now;
    }
    if (!strcmp(id, "connected")) {
        note(660, 45);
        note(880, 55);
    } else if (!strcmp(id, "disconnected")) {
        note(620, 55);
        note(390, 75);
    } else if (!strcmp(id, "record.start")) {
        note(720, 45);
    } else if (!strcmp(id, "record.stop")) {
        note(520, 45);
    } else if (!strcmp(id, "ready")) {
        note(740, 40);
        note(990, 65);
    } else if (!strcmp(id, "input")) {
        note(700, 50);
        note(700, 50);
    } else if (!strcmp(id, "complete")) {
        note(660, 35);
        note(830, 55);
    } else if (!strcmp(id, "error")) {
        note(260, 90);
    } else if (!strcmp(id, "steer")) {
        note(760, 30);
        note(1030, 45);
    } else if (!strcmp(id, "control")) {
        note(820, 28);
    } else if (!strcmp(id, "confirm")) {
        note(1040, 42);
    }
}

bool soundSpeechBegin(size_t expectedBytes) {
    if (soundMode != SOUND_HYBRID || expectedBytes < 44 || expectedBytes > MAX_SPEECH_BYTES) return false;
    M5Cardputer.Speaker.stop();
    speechBuffer.clear();
    speechBuffer.reserve(expectedBytes);
    speechReceiving = true;
    speechPlaying = false;
    return true;
}

bool soundSpeechAppend(const uint8_t* data, size_t length) {
    if (!speechReceiving || !data || !length || speechBuffer.size() + length > MAX_SPEECH_BYTES) {
        soundSpeechCancel();
        return false;
    }
    speechBuffer.insert(speechBuffer.end(), data, data + length);
    return true;
}

bool soundSpeechEnd() {
    speechReceiving = false;
    if (soundMode != SOUND_HYBRID || speechBuffer.size() < 44 ||
        memcmp(speechBuffer.data(), "RIFF", 4) || memcmp(speechBuffer.data() + 8, "WAVE", 4)) {
        soundSpeechCancel();
        return false;
    }
    speechPlaying = M5Cardputer.Speaker.playWav(
        speechBuffer.data(), speechBuffer.size(), 1, 0, true
    );
    if (!speechPlaying) speechBuffer.clear();
    return speechPlaying;
}

void soundSpeechCancel() {
    if (speechPlaying) M5Cardputer.Speaker.stop();
    speechReceiving = false;
    speechPlaying = false;
    speechBuffer.clear();
}

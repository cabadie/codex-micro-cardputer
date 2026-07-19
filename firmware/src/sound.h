#pragma once

#include <stddef.h>
#include <stdint.h>

void soundBegin();
void soundLoop();
void soundCue(const char* id);
void soundSetMode(const char* mode);
void soundSetVolume(uint8_t volume);
void soundSetMuted(bool muted);
bool soundMuted();
bool soundSpeechBegin(size_t expectedBytes);
bool soundSpeechAppend(const uint8_t* data, size_t length);
bool soundSpeechEnd();
void soundSpeechCancel();

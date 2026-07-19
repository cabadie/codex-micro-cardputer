#pragma once

#include <stddef.h>
#include <stdint.h>

void protocolBegin();
void protocolLoop();
bool protocolConnected();
void protocolHello();
void protocolAction(const char* id, int slot = 0, const char* gesture = nullptr);
void protocolPromptShortcut(char key);
void protocolAudioStart(uint32_t rate, const char* delivery);
void protocolAudioChunk(const unsigned char* data, size_t length);
void protocolAudioEnd();

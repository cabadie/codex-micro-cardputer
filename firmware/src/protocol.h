#pragma once

#include <stddef.h>
#include <stdint.h>

void protocolBegin();
void protocolLoop();
bool protocolConnected();
bool protocolUsingBle();
bool protocolVoiceSupported();
const char* protocolTransportName();
void protocolReceiveBle(const uint8_t* data, size_t length);
void protocolHello();
void protocolAction(const char* id, int slot = 0, const char* gesture = nullptr);
void protocolPromptShortcut(char key);
void protocolAudioStart(uint32_t rate, const char* delivery);
void protocolAudioChunk(const unsigned char* data, size_t length);
void protocolAudioEnd();

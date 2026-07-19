#pragma once

#include <USBHIDKeyboard.h>
#include <stdint.h>

void hidBegin();
void hidTap(uint8_t key);
void hidTapMod(uint8_t key, uint8_t modifier1, uint8_t modifier2 = 0);
void hidChar(char value);
void hidText(const char* text);
void hidPassChar(char value, bool control, bool option, bool command);
void hidShortcut(const char* key, bool command, bool shift, bool option, bool control);

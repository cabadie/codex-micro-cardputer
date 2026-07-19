#include "hid_out.h"

#include <Arduino.h>
#include <USB.h>
#include <string.h>

static USBHIDKeyboard keyboard;

void hidBegin() {
    keyboard.begin();
    USB.begin();
}

void hidTap(uint8_t key) {
    keyboard.press(key);
    delay(8);
    keyboard.releaseAll();
}

void hidTapMod(uint8_t key, uint8_t modifier1, uint8_t modifier2) {
    if (modifier1) keyboard.press(modifier1);
    if (modifier2) keyboard.press(modifier2);
    delay(4);
    keyboard.press(key);
    delay(8);
    keyboard.releaseAll();
}

void hidChar(char value) { keyboard.write((uint8_t)value); }

void hidText(const char* text) {
    while (*text) {
        keyboard.write((uint8_t)*text++);
        delay(5);
    }
}

void hidPassChar(char value, bool control, bool option, bool command) {
    if (!(control || option || command)) {
        keyboard.write((uint8_t)value);
        return;
    }
    if (control) keyboard.press(KEY_LEFT_CTRL);
    if (option) keyboard.press(KEY_LEFT_ALT);
    if (command) keyboard.press(KEY_LEFT_GUI);
    delay(4);
    keyboard.write((uint8_t)value);
    delay(4);
    keyboard.releaseAll();
}

void hidShortcut(const char* key, bool command, bool shift, bool option, bool control) {
    if (!key || !key[0]) return;
    if (command) keyboard.press(KEY_LEFT_GUI);
    if (shift) keyboard.press(KEY_LEFT_SHIFT);
    if (option) keyboard.press(KEY_LEFT_ALT);
    if (control) keyboard.press(KEY_LEFT_CTRL);
    delay(4);

    uint8_t code = 0;
    if (!strcmp(key, "enter")) code = KEY_RETURN;
    else if (!strcmp(key, "escape")) code = KEY_ESC;
    else if (!strcmp(key, "tab")) code = KEY_TAB;
    else if (!strcmp(key, "backspace")) code = KEY_BACKSPACE;
    else if (!strcmp(key, "left")) code = KEY_LEFT_ARROW;
    else if (!strcmp(key, "right")) code = KEY_RIGHT_ARROW;
    else if (!strcmp(key, "up")) code = KEY_UP_ARROW;
    else if (!strcmp(key, "down")) code = KEY_DOWN_ARROW;
    else if (!key[1]) code = (uint8_t)key[0];

    if (code) {
        keyboard.press(code);
        delay(8);
    }
    keyboard.releaseAll();
}

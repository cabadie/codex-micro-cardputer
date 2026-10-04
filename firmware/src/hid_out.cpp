#include "hid_out.h"

#include <Arduino.h>
#include <USB.h>
#include <string.h>

#include "ble_transport.h"
#include "protocol.h"

static USBHIDKeyboard keyboard;

static bool useBle() { return protocolUsingBle() && bleHidConnected(); }

static void press(uint8_t key) {
    if (useBle()) bleHidPress(key);
    else keyboard.press(key);
}

static void releaseAll() {
    if (useBle()) bleHidReleaseAll();
    else keyboard.releaseAll();
}

static void write(uint8_t value) {
    if (useBle()) bleHidWrite(value);
    else keyboard.write(value);
}

void hidBegin() {
    keyboard.begin();
    USB.begin();
}

void hidTap(uint8_t key) {
    press(key);
    delay(8);
    releaseAll();
}

void hidTapMod(uint8_t key, uint8_t modifier1, uint8_t modifier2) {
    if (modifier1) press(modifier1);
    if (modifier2) press(modifier2);
    delay(4);
    press(key);
    delay(8);
    releaseAll();
}

void hidChar(char value) { write((uint8_t)value); }

void hidText(const char* text) {
    while (*text) {
        write((uint8_t)*text++);
        delay(5);
    }
}

void hidPassChar(char value, bool control, bool option, bool command) {
    if (!(control || option || command)) {
        write((uint8_t)value);
        return;
    }
    if (control) press(KEY_LEFT_CTRL);
    if (option) press(KEY_LEFT_ALT);
    if (command) press(KEY_LEFT_GUI);
    delay(4);
    write((uint8_t)value);
    delay(4);
    releaseAll();
}

void hidShortcut(const char* key, bool command, bool shift, bool option, bool control) {
    if (!key || !key[0]) return;
    if (command) press(KEY_LEFT_GUI);
    if (shift) press(KEY_LEFT_SHIFT);
    if (option) press(KEY_LEFT_ALT);
    if (control) press(KEY_LEFT_CTRL);
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
        press(code);
        delay(8);
    }
    releaseAll();
}

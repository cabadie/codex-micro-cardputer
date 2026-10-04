#include "screen.h"

#include <M5Cardputer.h>
#include <string.h>

#include "app_types.h"
#include "protocol.h"

static M5Canvas canvas(&M5Cardputer.Display);
static bool dirty = true;
static uint32_t lastDrawMs = 0;
static uint32_t toastUntilMs = 0;
static char toastMessage[48] = "";

static const uint16_t STATE_COLORS[CHAT_STATE_COUNT] = {
    0x3186,  // unassigned: dim gray
    0xFFFF,  // idle: white
    0x3C9F,  // thinking: blue
    0x07E8,  // complete: green
    0xFDC0,  // requires input: amber
    0xF986,  // error: red
};

static const char* legendLine1() {
    switch (g_ui.layer) {
        case LAYER_CODEX: return "1:active 2-6:recent";
        case LAYER_CUSTOM: return "press an assigned prompt key";
        case LAYER_TYPING: return "all keys type normally";
        default: return "";
    }
}

static const char* legendLine2() {
    switch (g_ui.layer) {
        case LAYER_CODEX: return "space:queue ^space:steer s:answer";
        case LAYER_CUSTOM: return "tab:typing  manage in console";
        case LAYER_TYPING: return "tab:next layer  fn:modifiers";
        default: return "tab:next layer";
    }
}

static void shortTitle(const char* source, char* destination, size_t length) {
    if (!source || !source[0]) {
        strncpy(destination, "-", length);
        destination[length - 1] = 0;
        return;
    }
    strncpy(destination, source, length - 1);
    destination[length - 1] = 0;
}

static void drawTopBar() {
    canvas.fillRect(0, 0, 240, 16, 0x2104);
    canvas.setTextColor(0xFFFF, 0x2104);
    canvas.setCursor(4, 4);
    canvas.print(layerName(g_ui.layer));

    canvas.setCursor(145, 4);
    if (g_ui.bridgeConnected && g_ui.codexConnected) {
        canvas.setTextColor(0x07E8, 0x2104);
        canvas.print("CODEX");
    } else if (g_ui.bridgeConnected) {
        canvas.setTextColor(0xFDC0, 0x2104);
        canvas.print("BRIDGE");
    } else {
        canvas.setTextColor(0x8410, 0x2104);
        canvas.print("KEYBOARD");
    }
    if (g_ui.bridgeConnected) {
        canvas.setCursor(181, 4);
        canvas.setTextColor(0x841F, 0x2104);
        canvas.print(protocolTransportName());
    }
    if (g_ui.battery >= 0) {
        canvas.setCursor(211, 4);
        canvas.printf("%d", g_ui.battery);
    }
}

static void drawChats() {
    const bool pulse = ((millis() / 280) & 1) == 0;
    for (int index = 0; index < 6; index++) {
        const ChatSlot& chat = g_ui.chats[index];
        int x = (index % 3) * 80 + 1;
        int y = 19 + (index / 3) * 35;
        uint16_t background = 0x18E3;
        canvas.fillRoundRect(x, y, 78, 32, 4, background);

        uint16_t color = STATE_COLORS[chat.state];
        int radius = chat.state == CHAT_THINKING && pulse ? 5 : 4;
        canvas.fillCircle(x + 9, y + 10, radius, color);
        if (chat.selected) {
            canvas.drawRoundRect(x, y, 78, 32, 4, 0x841F);
            canvas.drawRoundRect(x + 1, y + 1, 76, 30, 3, 0x841F);
        }

        canvas.setTextColor(0xFFFF, background);
        canvas.setCursor(x + 18, y + 6);
        canvas.printf("%d", index + 1);
        char title[12];
        shortTitle(chat.title, title, sizeof(title));
        canvas.setTextColor(chat.state == CHAT_UNASSIGNED ? 0x8410 : 0xC618, background);
        canvas.setCursor(x + 6, y + 20);
        canvas.print(title);
    }
}

static void drawPromptShortcuts() {
    for (int index = 0; index < 6; index++) {
        int x = (index % 3) * 80 + 1;
        int y = 19 + (index / 3) * 35;
        uint16_t background = 0x18E3;
        canvas.fillRoundRect(x, y, 78, 32, 4, background);
        if (index >= g_ui.promptShortcutCount) continue;
        const PromptShortcut& shortcut = g_ui.promptShortcuts[index];
        canvas.setTextColor(0x841F, background);
        canvas.setCursor(x + 6, y + 7);
        canvas.printf("%c", shortcut.key >= 'a' && shortcut.key <= 'z' ? shortcut.key - 32 : shortcut.key);
        char label[10];
        shortTitle(shortcut.label, label, sizeof(label));
        canvas.setTextColor(0xFFFF, background);
        canvas.setCursor(x + 18, y + 7);
        canvas.print(label);
        canvas.setTextColor(0x630C, background);
        canvas.setCursor(x + 6, y + 21);
        canvas.print("PROMPT");
    }
}

static void drawSelectedModel() {
    if (g_ui.layer == LAYER_CUSTOM) {
        canvas.setCursor(4, 123);
        canvas.setTextColor(0x841F, TFT_BLACK);
        canvas.printf("%d shortcut%s", g_ui.promptShortcutCount, g_ui.promptShortcutCount == 1 ? "" : "s");
        if (g_ui.promptShortcutCount > 6) {
            canvas.setTextColor(0xC618, TFT_BLACK);
            canvas.printf("  +%d more", g_ui.promptShortcutCount - 6);
        }
        return;
    }
    const ChatSlot* selected = nullptr;
    int selectedSlot = 0;
    for (int index = 0; index < 6; index++) {
        if (g_ui.chats[index].selected) {
            selected = &g_ui.chats[index];
            selectedSlot = index + 1;
            break;
        }
    }
    canvas.setCursor(4, 123);
    if (selected && (((millis() / 1800) & 1) == 0 || !selected->model[0])) {
        canvas.setTextColor(0x841F, TFT_BLACK);
        canvas.printf("TARGET %d  ", selectedSlot);
        canvas.setTextColor(0xC618, TFT_BLACK);
        canvas.print(selected->title);
    } else if (selected && selected->model[0]) {
        canvas.setTextColor(0x841F, TFT_BLACK);
        canvas.printf("TARGET %d  ", selectedSlot);
        canvas.setTextColor(0xC618, TFT_BLACK);
        canvas.print(selected->model);
        if (selected->reasoning[0]) {
            canvas.setTextColor(0xC618, TFT_BLACK);
            canvas.print("  ");
            canvas.print(selected->reasoning);
        }
    } else {
        canvas.setTextColor(0x630C, TFT_BLACK);
        canvas.print("Tab: next layer");
    }
}

static void drawVoiceOverlay() {
    canvas.fillSprite(TFT_BLACK);
    uint32_t now = millis();

    if (g_ui.voice == VOICE_LISTENING) {
        canvas.setTextColor(0x36D3, TFT_BLACK);
        canvas.setTextSize(2);
        canvas.setCursor(55, 30);
        canvas.print("LISTENING");
        canvas.setTextSize(1);
        for (int bar = 0; bar < 9; bar++) {
            int height = 8 + ((now / 80 + bar * 3) % 22);
            canvas.fillRoundRect(48 + bar * 17, 88 - height, 9, height, 3, 0x36D3);
        }
        canvas.setTextColor(g_ui.voiceSteer ? 0xFDC0 : 0x8410, TFT_BLACK);
        canvas.setCursor(g_ui.voiceSteer ? 70 : 66, 112);
        canvas.print(g_ui.voiceSteer ? "release: STEER" : "release: QUEUE");
    } else if (g_ui.voice == VOICE_PROCESSING) {
        canvas.setTextColor(0xFFFF, TFT_BLACK);
        canvas.setTextSize(2);
        canvas.setCursor(44, 46);
        canvas.print("PROCESSING");
        canvas.setTextSize(1);
        int position = (now / 90) % 12;
        for (int dot = 0; dot < 12; dot++) {
            uint16_t color = dot == position ? 0xFFFF : 0x4208;
            canvas.fillCircle(66 + dot * 10, 84, 3, color);
        }
    } else if (g_ui.voice == VOICE_PREVIEW) {
        canvas.fillRect(0, 0, 240, 17, 0x2104);
        canvas.setTextColor(0xFFFF, 0x2104);
        canvas.setCursor(5, 5);
        canvas.print("TRANSCRIPT READY");
        canvas.setTextColor(0xC618, TFT_BLACK);
        String preview = g_ui.voicePreview;
        int offset = 0;
        for (int line = 0; line < 5 && offset < preview.length(); line++) {
            String part = preview.substring(offset, min(offset + 38, (int)preview.length()));
            canvas.setCursor(5, 24 + line * 15);
            canvas.print(part);
            offset += part.length();
        }
        canvas.setTextColor(0x07E8, TFT_BLACK);
        canvas.setCursor(5, 112);
        canvas.print("Enter send");
        canvas.setTextColor(0xF986, TFT_BLACK);
        canvas.setCursor(158, 112);
        canvas.print("Del discard");
    } else {
        canvas.setTextColor(0xF986, TFT_BLACK);
        canvas.setTextSize(2);
        canvas.setCursor(70, 48);
        canvas.print("VOICE ERROR");
        canvas.setTextSize(1);
        canvas.setCursor(62, 82);
        canvas.print("Del to dismiss");
    }
}

void screenBegin() {
    canvas.setColorDepth(8);
    canvas.createSprite(240, 135);
    canvas.setFont(&fonts::Font0);
}

void screenDirty() { dirty = true; }

void screenToast(const char* message) {
    strncpy(toastMessage, message ? message : "", sizeof(toastMessage) - 1);
    toastMessage[sizeof(toastMessage) - 1] = 0;
    toastUntilMs = millis() + 1400;
    dirty = true;
}

void screenLoop() {
    uint32_t now = millis();
    bool animated = g_ui.voice == VOICE_LISTENING || g_ui.voice == VOICE_PROCESSING;
    for (const ChatSlot& chat : g_ui.chats) {
        animated = animated || chat.selected || chat.state == CHAT_THINKING;
    }
    if (!dirty && !animated && now - lastDrawMs < 500) return;
    if (!dirty && now - lastDrawMs < 90) return;
    dirty = false;
    lastDrawMs = now;

    if (g_ui.voice != VOICE_IDLE) {
        drawVoiceOverlay();
    } else {
        canvas.fillSprite(TFT_BLACK);
        drawTopBar();
        if (g_ui.layer == LAYER_CUSTOM) drawPromptShortcuts();
        else drawChats();
        canvas.setTextColor(0xC618, TFT_BLACK);
        canvas.setCursor(4, 94);
        canvas.print(legendLine1());
        canvas.setCursor(4, 106);
        canvas.print(legendLine2());
        drawSelectedModel();
    }

    if (toastUntilMs > now) {
        canvas.fillRoundRect(24, 51, 192, 30, 6, 0xFFFF);
        canvas.setTextColor(TFT_BLACK, 0xFFFF);
        int width = canvas.textWidth(toastMessage);
        canvas.setCursor(max(28, 120 - width / 2), 62);
        canvas.print(toastMessage);
    }
    canvas.pushSprite(0, 0);
}

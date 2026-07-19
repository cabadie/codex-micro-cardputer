#pragma once

#include <Arduino.h>
#include <stdint.h>

enum ChatState : uint8_t {
    CHAT_UNASSIGNED = 0,
    CHAT_IDLE,
    CHAT_THINKING,
    CHAT_COMPLETE,
    CHAT_REQUIRES_INPUT,
    CHAT_ERROR,
    CHAT_STATE_COUNT,
};

enum VoiceUiState : uint8_t {
    VOICE_IDLE = 0,
    VOICE_LISTENING,
    VOICE_PROCESSING,
    VOICE_PREVIEW,
    VOICE_ERROR,
};

enum Layer : uint8_t {
    LAYER_CODEX = 0,
    LAYER_CUSTOM,
    LAYER_TYPING,
    LAYER_COUNT,
};

struct ChatSlot {
    char title[26];
    char model[20];
    char reasoning[12];
    ChatState state;
    bool selected;
};

static const uint8_t MAX_PROMPT_SHORTCUTS = 47;

struct PromptShortcut {
    char key;
    char label[13];
};

struct UiModel {
    ChatSlot chats[6];
    PromptShortcut promptShortcuts[MAX_PROMPT_SHORTCUTS];
    uint8_t promptShortcutCount;
    Layer layer;
    VoiceUiState voice;
    bool voiceSteer;
    String voicePreview;
    bool bridgeConnected;
    bool codexConnected;
    int battery;
};

extern UiModel g_ui;

const char* chatStateName(ChatState state);
const char* layerName(Layer layer);
const PromptShortcut* promptShortcutForKey(char key);

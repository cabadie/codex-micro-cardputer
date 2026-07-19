#include "app_types.h"

UiModel g_ui;

const char* chatStateName(ChatState state) {
    static const char* names[] = {
        "unassigned", "idle", "thinking", "complete", "requires_input", "error",
    };
    return state < CHAT_STATE_COUNT ? names[state] : "unassigned";
}

const char* layerName(Layer layer) {
    static const char* names[] = {
        "Codex Micro", "Custom", "Typing",
    };
    return layer < LAYER_COUNT ? names[layer] : "Unknown";
}

const PromptShortcut* promptShortcutForKey(char key) {
    for (uint8_t index = 0; index < g_ui.promptShortcutCount; index++) {
        if (g_ui.promptShortcuts[index].key == key) return &g_ui.promptShortcuts[index];
    }
    return nullptr;
}

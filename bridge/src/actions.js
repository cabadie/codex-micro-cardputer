const macosDefault = require('./macos');

const DOCUMENTED_SHORTCUTS = {
  'app.command-menu': { key: 'k', modifiers: ['command'] },
  'chat.new': { key: 'n', modifiers: ['command'] },
  'chat.search': { key: 'g', modifiers: ['command'] },
  'chat.previous': { key: '[', modifiers: ['command', 'shift'] },
  'chat.next': { key: ']', modifiers: ['command', 'shift'] },
  'history.back': { key: '[', modifiers: ['command'] },
  'history.forward': { key: ']', modifiers: ['command'] },
  'sidebar.toggle': { key: 'b', modifiers: ['command'] },
  'review.open': { key: 'g', modifiers: ['control', 'shift'] },
  'dictation.toggle': { key: 'd', modifiers: ['control', 'shift'] },
};

function validShortcut(shortcut) {
  return Boolean(
    shortcut &&
    typeof shortcut.key === 'string' &&
    Array.isArray(shortcut.modifiers) &&
    shortcut.modifiers.every((value) => ['command', 'shift', 'option', 'control'].includes(value))
  );
}

class ActionDispatcher {
  constructor(config, macos = macosDefault, device = null) {
    this.config = config;
    this.macos = macos;
    this.device = device;
  }

  async pressShortcut(key, modifiers = []) {
    if (this.device?.connected && this.device.send({ t: 'shortcut', key, modifiers })) return;
    await this.macos.pressShortcut(key, modifiers);
  }

  async pressKey(key, modifiers = []) {
    if (this.device?.connected && this.device.send({ t: 'shortcut', key, modifiers })) return;
    await this.macos.pressKey(key, modifiers);
  }

  async typeText(text) {
    if (this.device?.connected && this.device.send({ t: 'type', text })) return;
    await this.macos.typeText(text);
  }

  async commandMenu(query) {
    await this.macos.activateCodex();
    await new Promise((resolve) => setTimeout(resolve, 180));
    await this.pressShortcut('k', ['command']);
    await new Promise((resolve) => setTimeout(resolve, 180));
    await this.typeText(query);
    await new Promise((resolve) => setTimeout(resolve, 120));
    await this.pressKey('enter');
  }

  async typeCommand(command) {
    await this.macos.activateCodex();
    await new Promise((resolve) => setTimeout(resolve, 180));
    await this.pressShortcut('u', ['control']);
    await this.typeText(command);
    await this.pressKey('enter');
  }

  async shortcut(id) {
    const configured = this.config.actionShortcuts[id];
    const shortcut = validShortcut(configured) ? configured : DOCUMENTED_SHORTCUTS[id];
    if (!shortcut) throw new Error(`No shortcut configured for ${id}`);
    await this.macos.activateCodex();
    await new Promise((resolve) => setTimeout(resolve, 120));
    await this.pressShortcut(shortcut.key, shortcut.modifiers);
    return { ok: true, id };
  }

  async dispatch(id) {
    if (DOCUMENTED_SHORTCUTS[id]) return this.shortcut(id);

    switch (id) {
      case 'fast.toggle':
        await this.typeCommand('/fast');
        return { ok: true, id };
      case 'plan.toggle':
        await this.macos.activateCodex();
        await new Promise((resolve) => setTimeout(resolve, 120));
        await this.pressKey('tab', ['shift']);
        return { ok: true, id };
      case 'reasoning.open':
        await this.commandMenu('Reasoning');
        return { ok: true, id, fallback: 'command-menu' };
      case 'reasoning.decrease':
        await this.commandMenu('Decrease reasoning effort');
        return { ok: true, id, fallback: 'command-menu' };
      case 'reasoning.increase':
        await this.commandMenu('Increase reasoning effort');
        return { ok: true, id, fallback: 'command-menu' };
      case 'model.open':
        await this.commandMenu('Open model picker');
        return { ok: true, id, fallback: 'command-menu' };
      case 'request.approve':
        return this.macos.safeDecision(this.config.axHelper, 'approve');
      case 'request.decline':
        return this.macos.safeDecision(this.config.axHelper, 'decline');
      case 'chat.continue': {
        const configured = this.config.actionShortcuts[id];
        if (validShortcut(configured)) return this.shortcut(id);
        await this.commandMenu('Continue in new task');
        return { ok: true, id, fallback: 'command-menu' };
      }
      case 'composer.send':
        await this.macos.activateCodex();
        await new Promise((resolve) => setTimeout(resolve, 120));
        await this.pressKey('enter');
        return { ok: true, id };
      case 'composer.cancel':
        await this.macos.activateCodex();
        await new Promise((resolve) => setTimeout(resolve, 120));
        await this.pressKey('escape');
        return { ok: true, id };
      default:
        throw new Error(`Unknown Codex action: ${id}`);
    }
  }
}

module.exports = { ActionDispatcher, DOCUMENTED_SHORTCUTS, validShortcut };

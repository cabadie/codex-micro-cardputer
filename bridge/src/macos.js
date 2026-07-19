const { execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const CODEX_BUNDLE_ID = 'com.openai.codex';

const KEY_CODES = {
  enter: 36,
  escape: 53,
  tab: 48,
  backspace: 51,
};

const SHORTCUT_SCRIPT = `
on run argv
  set keyText to item 1 of argv
  set commandPressed to item 2 of argv is "1"
  set shiftPressed to item 3 of argv is "1"
  set optionPressed to item 4 of argv is "1"
  set controlPressed to item 5 of argv is "1"
  set modifierKeys to {}
  if commandPressed then set end of modifierKeys to command down
  if shiftPressed then set end of modifierKeys to shift down
  if optionPressed then set end of modifierKeys to option down
  if controlPressed then set end of modifierKeys to control down
  tell application "System Events" to keystroke keyText using modifierKeys
end run
`;

const KEYCODE_SCRIPT = `
on run argv
  set codeValue to (item 1 of argv) as integer
  set shiftPressed to item 2 of argv is "1"
  set optionPressed to item 3 of argv is "1"
  set controlPressed to item 4 of argv is "1"
  set commandPressed to item 5 of argv is "1"
  set modifierKeys to {}
  if shiftPressed then set end of modifierKeys to shift down
  if optionPressed then set end of modifierKeys to option down
  if controlPressed then set end of modifierKeys to control down
  if commandPressed then set end of modifierKeys to command down
  tell application "System Events" to key code codeValue using modifierKeys
end run
`;

const CLIPBOARD_HELPER = path.resolve(__dirname, '..', 'bin', 'clipboard-window');

async function frontmostBundleId() {
  const script = 'tell application "System Events" to get bundle identifier of first application process whose frontmost is true';
  const { stdout } = await execFileAsync('/usr/bin/osascript', ['-e', script], { timeout: 3000 });
  return stdout.trim();
}

async function activateCodex() {
  await execFileAsync('/usr/bin/osascript', [
    '-e', `tell application id "${CODEX_BUNDLE_ID}" to activate`,
  ], { timeout: 3000 });
}

async function openThread(threadId, foreground = false) {
  const url = `codex://threads/${encodeURIComponent(threadId)}`;
  const args = foreground ? [url] : ['-g', url];
  await execFileAsync('/usr/bin/open', args, { timeout: 5000 });
  if (foreground) await activateCodex();
}

function modifierArgs(modifiers = []) {
  const values = new Set(modifiers);
  return [
    values.has('command') ? '1' : '0',
    values.has('shift') ? '1' : '0',
    values.has('option') ? '1' : '0',
    values.has('control') ? '1' : '0',
  ];
}

async function pressShortcut(key, modifiers = []) {
  await execFileAsync('/usr/bin/osascript', [
    '-e', SHORTCUT_SCRIPT,
    String(key),
    ...modifierArgs(modifiers),
  ], { timeout: 3000 });
}

async function pressKey(name, modifiers = []) {
  const code = KEY_CODES[name];
  if (code === undefined) throw new Error(`Unknown macOS key: ${name}`);
  const [command, shift, option, control] = modifierArgs(modifiers);
  await execFileAsync('/usr/bin/osascript', [
    '-e', KEYCODE_SCRIPT,
    String(code), shift, option, control, command,
  ], { timeout: 3000 });
}

async function typeText(text) {
  const script = 'on run argv\ntell application "System Events" to keystroke (item 1 of argv)\nend run';
  await execFileAsync('/usr/bin/osascript', ['-e', script, String(text)], { timeout: 5000 });
}

async function withClipboardText(text, callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-cardputer-clipboard-'));
  const readyPath = path.join(directory, 'ready');
  const helper = execFileAsync(CLIPBOARD_HELPER, [
    String(text),
    readyPath,
  ], { timeout: 3000 });
  const deadline = Date.now() + 1800;
  let result;
  let callbackError = null;
  let helperError = null;
  try {
    while (!fs.existsSync(readyPath)) {
      if (Date.now() >= deadline) {
        await helper;
        throw new Error('Timed out preparing the transcript clipboard');
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    try {
      result = await callback();
    } catch (error) {
      callbackError = error;
    }
    try {
      await helper;
    } catch (error) {
      helperError = error;
    }
  } finally {
    try { fs.unlinkSync(readyPath); } catch { /* best-effort temporary cleanup */ }
    try { fs.rmdirSync(directory); } catch { /* best-effort temporary cleanup */ }
  }
  if (callbackError) throw callbackError;
  if (helperError) throw helperError;
  return result;
}

async function typeCommand(command) {
  await activateCodex();
  await new Promise((resolve) => setTimeout(resolve, 180));
  await pressShortcut('u', ['control']);
  await typeText(command);
  await pressKey('enter');
}

async function commandMenu(query) {
  await activateCodex();
  await new Promise((resolve) => setTimeout(resolve, 180));
  await pressShortcut('k', ['command']);
  await new Promise((resolve) => setTimeout(resolve, 180));
  await typeText(query);
  await new Promise((resolve) => setTimeout(resolve, 120));
  await pressKey('enter');
}

async function safeDecision(helperPath, action) {
  if (!['approve', 'decline'].includes(action)) throw new Error(`Unsupported decision: ${action}`);
  const { stdout } = await execFileAsync(helperPath, [action], { timeout: 5000 });
  const result = JSON.parse(stdout.trim());
  if (!result.ok) throw new Error(result.reason || `${action} was not available`);
  return result;
}

async function visibleTaskLines(helperPath) {
  const { stdout } = await execFileAsync(helperPath, [], { timeout: 15000 });
  const result = JSON.parse(stdout.trim());
  if (!result.ok || !Array.isArray(result.lines)) {
    throw new Error(result.reason || 'The visible Codex task could not be identified');
  }
  return result.lines;
}

module.exports = {
  CODEX_BUNDLE_ID,
  activateCodex,
  commandMenu,
  frontmostBundleId,
  openThread,
  pressKey,
  pressShortcut,
  safeDecision,
  typeCommand,
  typeText,
  visibleTaskLines,
  withClipboardText,
};

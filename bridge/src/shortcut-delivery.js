async function pastePromptShortcut(shortcut, actions, macos, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))) {
  // Paste the complete prompt as one clipboard payload. Typing multiline text
  // through System Events turns each embedded newline into a real Enter key,
  // which submits partial prompts as separate commands.
  await macos.withClipboardText(shortcut.prompt, async () => {
    await actions.pressShortcut('v', ['command']);
    // Codex applies clipboard paste asynchronously; wait until all embedded
    // newlines are safely in the composer before the one intentional submit.
    await wait(400);
    if (shortcut.delivery === 'queue') await actions.pressKey('enter');
    else if (shortcut.delivery === 'steer') await actions.pressKey('enter', ['command']);
  });
}

module.exports = { pastePromptShortcut };

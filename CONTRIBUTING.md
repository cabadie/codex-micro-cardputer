# Contributing

Thanks for helping improve Codex Micro for Cardputer.

## Before opening a change

1. Search existing issues and pull requests.
2. For a substantial feature or protocol change, open an issue first so the
   behavior and safety boundary can be discussed.
3. Keep Codex state read-only and preserve keyboard-only fallback behavior.
4. Never commit private configuration, Codex task data, transcripts, model
   binaries, credentials, generated helpers, or firmware build output.

## Development checks

Run the bridge tests:

```sh
cd bridge
npm install
npm test
```

Build the firmware:

```sh
cd firmware
../.venv/bin/pio run
```

If a change affects device interaction, describe the Cardputer hardware test
you performed. If it changes the serial contract, update `docs/protocol.md`.

## Pull requests

Keep pull requests focused. Explain the user-visible behavior, safety or
privacy impact, and validation performed. By contributing, you agree that your
contribution is licensed under the MIT License.

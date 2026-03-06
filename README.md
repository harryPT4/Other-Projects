# Fahhhhify Pulse (VS Code Extension)

This extension plays a viral "Fahhh" sound whenever code diagnostics report new errors.

## Features

- Listens to VS Code diagnostics and detects `Error` severity.
- Plays the bundled `Fahhhhify-Pulse.mp3` sound when error count increases.
- Works across desktop environments where VS Code runs (Windows, Linux, macOS) using native OS audio playback (no extra webview tab).
- Includes a manual test command: `Fahhh?`.
- Includes commands for quick verification:
  - `Fahhh!Fahhh!!Fahhh!!!`
  - `Fahhh Status`

## Settings

- `faahSound.enabled`: enable/disable sound.
- `faahSound.volume`: sound volume from `0` to `1`.
- `faahSound.cooldownMs`: minimum time between sounds.
- `faahSound.playOnlyOnIncrease`: only trigger when total errors increase.

## Run Locally

1. Open this folder in VS Code.
2. Run `npm install`.
3. Press `F5` (Run `Run Faah Extension`) to open Extension Development Host.
4. Run `Fahhh?` to confirm audio output.
5. In the new window, create a file with an intentional error.

## Build VSIX

```bash
npm install
npm run package
```

Then install the generated `.vsix` file in VS Code.

## Notes

- No additional VS Code tab/window is required for playback.
- Linux may require one of: `ffplay`, `mpv`, `mpg123`, `cvlc`, or `play` (SoX).
- Sound asset source repo: [radhika0910/Fahhhh--VSCode-extension](https://github.com/radhika0910/Fahhhh--VSCode-extension).

Enjoy Madam

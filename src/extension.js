const vscode = require('vscode');
const path = require('path');
const { execFile } = require('child_process');

class FaahSoundController {
  constructor(context) {
    this.context = context;
    this.lastPlayedAt = 0;
    this.previousErrorCount = 0;
    this.initialized = false;
    this.soundFilePath = context.asAbsolutePath('Fahhhhify-Pulse.mp3');
  }

  async activate() {
    this.previousErrorCount = this.getErrorCount();
    this.initialized = true;

    const diagnosticsDisposable = vscode.languages.onDidChangeDiagnostics(() => {
      this.evaluateAndPlay();
    });

    const commandDisposable = vscode.commands.registerCommand('faahSound.playNow', async () => {
      await this.playSound();
      vscode.window.showInformationMessage('Fahhh? triggered (using Fahhhhify-Pulse.mp3).');
    });

    const burstCommandDisposable = vscode.commands.registerCommand('faahSound.testBurst', async () => {
      for (let i = 0; i < 3; i += 1) {
        await this.playSound();
        await sleep(350);
      }
      vscode.window.showInformationMessage('Fahhh!Fahhh!!Fahhh!!! triggered.');
    });

    const statusCommandDisposable = vscode.commands.registerCommand('faahSound.showStatus', async () => {
      const cfg = this.getConfig();
      const totalErrors = this.getErrorCount();
      const backend = await describeBackend();
      vscode.window.showInformationMessage(
        `Fahhhhify Pulse: enabled=${cfg.enabled}, errors=${totalErrors}, volume=${cfg.volume}, cooldownMs=${cfg.cooldownMs}, backend=${backend}, file=${path.basename(this.soundFilePath)}`
      );
    });

    this.context.subscriptions.push(
      diagnosticsDisposable,
      commandDisposable,
      burstCommandDisposable,
      statusCommandDisposable
    );
  }

  getConfig() {
    const cfg = vscode.workspace.getConfiguration('faahSound');
    return {
      enabled: cfg.get('enabled', true),
      volume: clamp(cfg.get('volume', 0.9), 0, 1),
      cooldownMs: Math.max(0, cfg.get('cooldownMs', 1500)),
      playOnlyOnIncrease: cfg.get('playOnlyOnIncrease', true)
    };
  }

  getErrorCount() {
    let count = 0;
    for (const [, diagnostics] of vscode.languages.getDiagnostics()) {
      for (const diagnostic of diagnostics) {
        if (diagnostic.severity === vscode.DiagnosticSeverity.Error) {
          count += 1;
        }
      }
    }
    return count;
  }

  async evaluateAndPlay() {
    if (!this.initialized) {
      return;
    }

    const cfg = this.getConfig();
    const currentErrorCount = this.getErrorCount();

    if (!cfg.enabled) {
      this.previousErrorCount = currentErrorCount;
      return;
    }

    let shouldPlay = false;

    if (cfg.playOnlyOnIncrease) {
      shouldPlay = currentErrorCount > this.previousErrorCount;
    } else {
      shouldPlay = currentErrorCount > 0 && currentErrorCount !== this.previousErrorCount;
    }

    this.previousErrorCount = currentErrorCount;

    if (!shouldPlay) {
      return;
    }

    const now = Date.now();
    if (now - this.lastPlayedAt < cfg.cooldownMs) {
      return;
    }

    this.lastPlayedAt = now;
    await this.playSound();
  }

  async playSound() {
    const cfg = this.getConfig();
    if (!cfg.enabled) {
      return;
    }

    const ok = await playNativeSound(this.soundFilePath, cfg.volume);
    if (!ok) {
      vscode.window.showWarningMessage(
        'Fahhhhify Pulse: no supported MP3 player found. Run "Fahhh Status" for backend info.'
      );
    }
  }
}

function clamp(value, min, max) {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runCommand(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true }, (error) => {
      resolve(!error);
    });
  });
}

function commandExists(command) {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  return runCommand(probe, [command]);
}

async function playNativeSound(filePath, volume) {
  if (process.platform === 'darwin') {
    return runCommand('afplay', [filePath]);
  }

  if (process.platform === 'win32') {
    const windowsPath = filePath.replace(/\\/g, '\\\\').replace(/'/g, "''");
    const script = [
      'Add-Type -AssemblyName presentationCore',
      "$p = New-Object System.Windows.Media.MediaPlayer",
      `$p.Volume = ${Math.max(0, Math.min(1, volume)).toFixed(2)}`,
      `$p.Open([Uri]'${windowsPath}')`,
      '$p.Play()',
      'Start-Sleep -Milliseconds 1200',
      '$p.Stop()',
      '$p.Close()'
    ].join('; ');

    return runCommand('powershell', [
      '-NoProfile',
      '-NonInteractive',
      '-WindowStyle',
      'Hidden',
      '-Command',
      script
    ]);
  }

  if (process.platform === 'linux') {
    const ffVolume = String(Math.round(Math.max(0, Math.min(1, volume)) * 100));

    if (await commandExists('ffplay')) {
      return runCommand('ffplay', ['-nodisp', '-autoexit', '-loglevel', 'quiet', '-volume', ffVolume, filePath]);
    }
    if (await commandExists('mpv')) {
      return runCommand('mpv', ['--no-video', `--volume=${ffVolume}`, '--really-quiet', filePath]);
    }
    if (await commandExists('mpg123')) {
      return runCommand('mpg123', ['-q', filePath]);
    }
    if (await commandExists('cvlc')) {
      return runCommand('cvlc', ['--play-and-exit', '--quiet', filePath]);
    }
    if (await commandExists('play')) {
      return runCommand('play', ['-q', filePath]);
    }

    return false;
  }

  return false;
}

async function describeBackend() {
  if (process.platform === 'darwin') {
    return 'macOS: afplay';
  }

  if (process.platform === 'win32') {
    return 'Windows: PowerShell MediaPlayer';
  }

  if (process.platform === 'linux') {
    const candidates = ['ffplay', 'mpv', 'mpg123', 'cvlc', 'play'];
    for (const cmd of candidates) {
      if (await commandExists(cmd)) {
        return `Linux: ${cmd}`;
      }
    }
    return 'Linux: none found (need ffplay/mpv/mpg123/cvlc/play)';
  }

  return process.platform;
}

function activate(context) {
  const controller = new FaahSoundController(context);
  controller.activate();
}

function deactivate() {
  // no-op
}

module.exports = {
  activate,
  deactivate
};

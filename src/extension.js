const vscode = require('vscode');
const path = require('path');
const fs = require('fs/promises');
const { execFile } = require('child_process');

class FaahSoundController {
  constructor(context) {
    this.context = context;
    this.lastPlayedAt = 0;
    this.previousErrorCount = 0;
    this.initialized = false;
    this.soundFilePath = context.asAbsolutePath('Fahhhhify-Pulse.mp3');
    this.fallbackWavPath = path.join(context.globalStorageUri.fsPath, 'fahhh-fallback.wav');
  }

  async activate() {
    this.previousErrorCount = this.getErrorCount();
    this.initialized = true;

    const diagnosticsDisposable = vscode.languages.onDidChangeDiagnostics(() => {
      void this.evaluateAndPlay().catch((error) => {
        this.handleError('diagnostics playback', error);
      });
    });

    const commandDisposable = vscode.commands.registerCommand('faahSound.playNow', async () => {
      await this.safeRun('play test sound', () => this.playSound());
      vscode.window.showInformationMessage('Fahhh? triggered (using Fahhhhify-Pulse.mp3).');
    });

    const burstCommandDisposable = vscode.commands.registerCommand('faahSound.testBurst', async () => {
      await this.safeRun('play burst sound', async () => {
        for (let i = 0; i < 3; i += 1) {
          await this.playSound();
          await sleep(350);
        }
      });
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
    const cooldown = Number(cfg.get('cooldownMs', 1500));
    return {
      enabled: cfg.get('enabled', true),
      volume: clamp(cfg.get('volume', 0.9), 0, 1),
      cooldownMs: Number.isFinite(cooldown) ? Math.max(0, cooldown) : 1500,
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

    try {
      await this.ensureFallbackWav();
      const ok = await playNativeSound(this.soundFilePath, cfg.volume, this.fallbackWavPath);
      if (!ok) {
        vscode.window.showWarningMessage(
          'Fahhhhify Pulse: no supported audio backend found. Run "Fahhh Status" for backend info.'
        );
      }
    } catch (error) {
      this.handleError('audio playback', error);
    }
  }

  async ensureFallbackWav() {
    try {
      await fs.mkdir(this.context.globalStorageUri.fsPath, { recursive: true });
      await fs.access(this.fallbackWavPath);
    } catch {
      const wav = generateFaahWavBuffer();
      await fs.writeFile(this.fallbackWavPath, wav);
    }
  }

  async safeRun(action, fn) {
    try {
      await fn();
    } catch (error) {
      this.handleError(action, error);
    }
  }

  handleError(action, error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Fahhhhify Pulse] ${action} failed:`, error);
    vscode.window.setStatusBarMessage(`Fahhhhify Pulse: ${action} failed (${message})`, 5000);
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

async function playNativeSound(filePath, volume, wavFallbackPath) {
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
    if (wavFallbackPath && await commandExists('paplay')) {
      return runCommand('paplay', [wavFallbackPath]);
    }
    if (wavFallbackPath && await commandExists('aplay')) {
      return runCommand('aplay', ['-q', wavFallbackPath]);
    }
    if (wavFallbackPath && await commandExists('canberra-gtk-play')) {
      return runCommand('canberra-gtk-play', ['-f', wavFallbackPath]);
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
    const candidates = ['ffplay', 'mpv', 'mpg123', 'cvlc', 'play', 'paplay', 'aplay', 'canberra-gtk-play'];
    for (const cmd of candidates) {
      if (await commandExists(cmd)) {
        return `Linux: ${cmd}`;
      }
    }
    return 'Linux: none found (need ffplay/mpv/mpg123/cvlc/play/paplay/aplay)';
  }

  return process.platform;
}

function activate(context) {
  const controller = new FaahSoundController(context);
  void controller.activate().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Fahhhhify Pulse] activation failed:', error);
    vscode.window.showErrorMessage(`Fahhhhify Pulse activation failed: ${message}`);
  });
}

function deactivate() {
  // no-op
}

function generateFaahWavBuffer() {
  const sampleRate = 44100;
  const durationSec = 0.62;
  const numSamples = Math.floor(sampleRate * durationSec);
  const pcmData = Buffer.alloc(numSamples * 2);

  for (let i = 0; i < numSamples; i += 1) {
    const t = i / sampleRate;
    const progress = i / numSamples;
    const baseFreq = 220 - (45 * progress);
    const harmonics =
      Math.sin(2 * Math.PI * baseFreq * t)
      + 0.6 * Math.sin(2 * Math.PI * (baseFreq * 2) * t)
      + 0.3 * Math.sin(2 * Math.PI * (baseFreq * 3) * t);
    const attack = Math.min(1, t / 0.03);
    const release = Math.max(0, 1 - (t / durationSec));
    const envelope = Math.pow(attack * release, 0.8);
    const sample = Math.max(-1, Math.min(1, 0.38 * harmonics * envelope));
    pcmData.writeInt16LE(Math.round(sample * 32767), i * 2);
  }

  return encodeWav(pcmData, sampleRate, 1, 16);
}

function encodeWav(pcmData, sampleRate, channels, bitsPerSample) {
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcmData.length;
  const wav = Buffer.alloc(44 + dataSize);

  wav.write('RIFF', 0, 'ascii');
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write('WAVE', 8, 'ascii');
  wav.write('fmt ', 12, 'ascii');
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(channels, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(byteRate, 28);
  wav.writeUInt16LE(blockAlign, 32);
  wav.writeUInt16LE(bitsPerSample, 34);
  wav.write('data', 36, 'ascii');
  wav.writeUInt32LE(dataSize, 40);
  pcmData.copy(wav, 44);

  return wav;
}

module.exports = {
  activate,
  deactivate
};

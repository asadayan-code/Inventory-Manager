/**
 * USB Barcode Scanner Handler
 * USB scanners type fast bursts of characters (< 50ms per key) terminated by 'Enter'.
 * Synthesizes short audio feedback using Web Audio API without needing external sound assets.
 */

class SoundEffects {
  private ctx: AudioContext | null = null;
  public enabled: boolean = true;

  private initCtx() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
  }

  playSuccessBeep() {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1760, this.ctx.currentTime); // High pitch A6
      gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.08);
    } catch {
      // Audio might be blocked by browser policy before first user gesture
    }
  }

  playErrorBeep() {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, this.ctx.currentTime); // Low buzz
      gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.25);
    } catch {
      // ignore
    }
  }
}

export const soundEffects = new SoundEffects();

export interface ScanHandlerOptions {
  onScan: (barcode: string) => void;
  maxKeyIntervalMs?: number;
  minBarcodeLength?: number;
  soundEnabled?: boolean;
}

export function initGlobalScanner(options: ScanHandlerOptions): () => void {
  let buffer: string[] = [];
  let lastKeyTime = 0;
  const maxInterval = options.maxKeyIntervalMs ?? 55;
  const minLength = options.minBarcodeLength ?? 3;

  const handleKeyDown = (e: KeyboardEvent) => {
    const now = Date.now();
    const interval = now - lastKeyTime;
    lastKeyTime = now;

    // If Enter key is pressed and we accumulated characters quickly
    if (e.key === 'Enter') {
      if (buffer.length >= minLength) {
        // Fast burst detected: scanner typed this!
        const barcode = buffer.join('').trim();
        buffer = [];
        if (barcode) {
          e.preventDefault();
          e.stopPropagation();
          options.onScan(barcode);
        }
      } else {
        buffer = [];
      }
      return;
    }

    // Only record printable single-char keys
    if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      if (interval > maxInterval) {
        // Human typing or long pause: reset buffer to current char
        buffer = [e.key];
      } else {
        // Fast burst: accumulate
        buffer.push(e.key);
      }
    }
  };

  window.addEventListener('keydown', handleKeyDown, true);

  return () => {
    window.removeEventListener('keydown', handleKeyDown, true);
  };
}

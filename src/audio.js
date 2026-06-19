/**
 * audio.js - Moduł dźwiękowy oparty o Web Audio API.
 * 
 * Syntetyzuje dźwięki w czasie rzeczywistym, dzięki czemu nie ma potrzeby
 * pobierania plików .mp3/.wav z serwera, a gra brzmi retro 8-bit.
 */

class AudioManager {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.isPlayingBgm = false;
    this.bgmTimer = null;
    this.noteIndex = 0;

    // Definicja częstotliwości nut
    this.NOTE_FREQS = {
      'G3': 196.00,
      'C4': 261.63, 'D4': 293.66, 'E4': 329.63, 'F4': 349.23, 'G4': 392.00, 'Ab4': 415.30, 'A4': 440.00, 'Bb4': 466.16, 'B4': 493.88,
      'C5': 523.25, 'Db5': 554.37, 'D5': 587.33, 'Eb5': 622.25, 'E5': 659.25, 'F5': 698.46, 'Gb5': 739.99, 'G5': 783.99, 'A5': 880.00, 'Bb5': 932.33, 'B5': 987.77,
      'C6': 1046.50, 'E6': 1318.51, 'G6': 1567.98,
      'REST': 0
    };

    // Kultowa melodyjka w stylu Mario Bros
    this.melody = [
      { note: 'E5', dur: 130 }, { note: 'E5', dur: 130 }, { note: 'REST', dur: 130 }, { note: 'E5', dur: 130 },
      { note: 'REST', dur: 130 }, { note: 'C5', dur: 130 }, { note: 'E5', dur: 130 }, { note: 'REST', dur: 130 },
      { note: 'G5', dur: 130 }, { note: 'REST', dur: 130 }, { note: 'REST', dur: 130 }, { note: 'REST', dur: 130 },
      { note: 'G4', dur: 130 }, { note: 'REST', dur: 130 }, { note: 'REST', dur: 130 }, { note: 'REST', dur: 130 },

      { note: 'C5', dur: 180 }, { note: 'REST', dur: 80 }, { note: 'REST', dur: 130 }, { note: 'G4', dur: 130 },
      { note: 'REST', dur: 130 }, { note: 'REST', dur: 130 }, { note: 'E4', dur: 130 }, { note: 'REST', dur: 130 },
      { note: 'REST', dur: 130 }, { note: 'A4', dur: 130 }, { note: 'REST', dur: 130 }, { note: 'B4', dur: 130 },
      { note: 'REST', dur: 130 }, { note: 'Bb4', dur: 130 }, { note: 'A4', dur: 130 }, { note: 'REST', dur: 130 },

      { note: 'G4', dur: 90 }, { note: 'E5', dur: 90 }, { note: 'G5', dur: 90 }, { note: 'A5', dur: 130 },
      { note: 'REST', dur: 130 }, { note: 'F5', dur: 130 }, { note: 'G5', dur: 130 }, { note: 'REST', dur: 130 },
      { note: 'E5', dur: 130 }, { note: 'REST', dur: 130 }, { note: 'C5', dur: 130 }, { note: 'D5', dur: 130 },
      { note: 'B4', dur: 130 }, { note: 'REST', dur: 130 }, { note: 'REST', dur: 130 }, { note: 'REST', dur: 130 }
    ];
  }

  /**
   * Inicjalizuje AudioContext. Wywoływane przy pierwszej interakcji.
   */
  init() {
    if (this.ctx) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      this.ctx = new AudioContextClass();
    }
  }

  /**
   * Wznawia kontekst jeśli został uśpiony przez przeglądarkę.
   */
  resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /**
   * Odtwarza dźwięk skoku (pitch sweep w górę).
   */
  playJump() {
    this.resume();
    if (this.muted || !this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(650, now + 0.16);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.16);
  }

  /**
   * Odtwarza dźwięk monety (dwutonowy pisk).
   */
  playCoin() {
    this.resume();
    if (this.muted || !this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    // B5 (988 Hz) przez 0.08s, potem E6 (1319 Hz) przez 0.25s
    osc.frequency.setValueAtTime(987.77, now);
    osc.frequency.setValueAtTime(1318.51, now + 0.08);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.setValueAtTime(0.08, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.35);
  }

  /**
   * Odtwarza dźwięk rozbicia bloku (szum / brudny sinus).
   */
  playBreak() {
    this.resume();
    if (this.muted || !this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(90, now);
    osc.frequency.linearRampToValueAtTime(10, now + 0.14);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.14);
  }

  /**
   * Odtwarza dźwięk zdeptania wroga (krótkie tłumione tąpnięcie).
   */
  playStomp() {
    this.resume();
    if (this.muted || !this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.linearRampToValueAtTime(20, now + 0.1);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.1);
  }

  /**
   * Odtwarza dźwięk śmierci (szybka opadająca arpeggio).
   */
  playDie() {
    this.resume();
    if (this.muted || !this.ctx) return;
    this.stopBgm();

    const now = this.ctx.currentTime;
    const notes = [450, 400, 350, 300, 250, 200, 150, 100];
    const duration = 0.08;

    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, now + idx * duration);

      gain.gain.setValueAtTime(0.1, now + idx * duration);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (idx + 1) * duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now + idx * duration);
      osc.stop(now + (idx + 1) * duration);
    });
  }

  /**
   * Odtwarza triumfalną fanfarę po ukończeniu poziomu.
   */
  playWin() {
    this.resume();
    if (this.muted || !this.ctx) return;
    this.stopBgm();

    const now = this.ctx.currentTime;
    // Triumfalne nuty: G4, C5, E5, G5, C6, E6, G6
    const notes = ['G4', 'C5', 'E5', 'G5', 'C6', 'E6', 'G6'];
    const durations = [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.4];
    let timeAcc = 0;

    notes.forEach((noteName, idx) => {
      const freq = this.NOTE_FREQS[noteName];
      const dur = durations[idx];
      const t = now + timeAcc;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + dur);

      timeAcc += dur * 0.9;
    });
  }

  /**
   * Dźwięk Game Over.
   */
  playGameOver() {
    this.resume();
    if (this.muted || !this.ctx) return;
    this.stopBgm();

    const now = this.ctx.currentTime;
    const notes = ['C5', 'G4', 'E4', 'A4', 'B4', 'A4', 'Ab4'];
    const dur = 0.22;

    notes.forEach((noteName, idx) => {
      const freq = this.NOTE_FREQS[noteName];
      const t = now + idx * dur;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + dur);
    });
  }

  /**
   * Uruchamia zapętloną muzyczkę w tle.
   */
  startBgm() {
    this.resume();
    if (this.muted || !this.ctx) return;
    if (this.isPlayingBgm) return;

    this.isPlayingBgm = true;
    this.noteIndex = 0;

    const playNextNote = () => {
      if (!this.isPlayingBgm || this.muted || !this.ctx) return;

      const currentNote = this.melody[this.noteIndex];
      const freq = this.NOTE_FREQS[currentNote.note];
      const durSec = currentNote.dur / 1000;

      if (freq > 0) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

        gain.gain.setValueAtTime(0.025, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + durSec * 0.9);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + durSec);
      }

      this.noteIndex = (this.noteIndex + 1) % this.melody.length;
      this.bgmTimer = setTimeout(playNextNote, currentNote.dur);
    };

    playNextNote();
  }

  /**
   * Zatrzymuje odtwarzanie muzyki w tle.
   */
  stopBgm() {
    this.isPlayingBgm = false;
    if (this.bgmTimer) {
      clearTimeout(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  /**
   * Przełącza tryb wyciszenia.
   */
  toggleMute() {
    this.muted = !this.muted;
    if (this.muted) {
      this.stopBgm();
    } else {
      this.startBgm();
    }
    return this.muted;
  }
}

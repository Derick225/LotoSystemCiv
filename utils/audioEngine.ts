
/**
 * NEXUS AUDIO ENGINE v2.0
 * Générateur de sons synthétiques via Web Audio API pour éviter les assets lourds.
 */

class AudioEngine {
    private ctx: AudioContext | null = null;
    private enabled: boolean = true;
    private masterGain: GainNode | null = null;

    constructor() {
        // Initialisation paresseuse sur la première interaction utilisateur
        try {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioContextClass) {
                this.ctx = new AudioContextClass();
                this.masterGain = this.ctx.createGain();
                this.masterGain.connect(this.ctx.destination);
                this.masterGain.gain.value = 0.3; // Volume global modéré
            }
        } catch (e) {
            console.warn("AudioContext non supporté.");
        }
    }

    private init() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    public setEnabled(val: boolean) {
        this.enabled = val;
    }

    public play(type: 'click' | 'success' | 'error' | 'scan' | 'boot') {
        if (!this.enabled || !this.ctx || !this.masterGain) return;
        this.init();

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.connect(gain);
        gain.connect(this.masterGain);

        const now = this.ctx.currentTime;

        switch (type) {
            case 'click':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(800, now);
                osc.frequency.exponentialRampToValueAtTime(1200, now + 0.05);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
                osc.start(now);
                osc.stop(now + 0.05);
                break;

            case 'success':
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(440, now);
                osc.frequency.setValueAtTime(554, now + 0.1); // C#
                osc.frequency.setValueAtTime(659, now + 0.2); // E
                gain.gain.setValueAtTime(0, now);
                gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
                osc.start(now);
                osc.stop(now + 0.6);
                break;

            case 'error':
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(150, now);
                osc.frequency.linearRampToValueAtTime(100, now + 0.3);
                gain.gain.setValueAtTime(0.2, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
                osc.start(now);
                osc.stop(now + 0.3);
                break;

            case 'scan':
                osc.type = 'square';
                osc.frequency.setValueAtTime(2000, now);
                osc.frequency.linearRampToValueAtTime(500, now + 0.2);
                gain.gain.setValueAtTime(0.05, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
                osc.start(now);
                osc.stop(now + 0.2);
                break;
                
            case 'boot':
                // Son de montée en puissance
                osc.type = 'sine';
                osc.frequency.setValueAtTime(50, now);
                osc.frequency.exponentialRampToValueAtTime(800, now + 1.5);
                gain.gain.setValueAtTime(0, now);
                gain.gain.linearRampToValueAtTime(0.3, now + 1.0);
                gain.gain.linearRampToValueAtTime(0, now + 1.5);
                osc.start(now);
                osc.stop(now + 1.5);
                break;
        }
    }
}

export const audioEngine = new AudioEngine();

/**
 * SPEECH ENGINE - SYNTHÈSE VOCALE
 * Permet aux utilisateurs (notamment ceux qui ont des difficultés de lecture ou d'interprétation des graphiques)
 * d'écouter à haute voix les numéros recommandés, les tickets et les conseils en français clair.
 */

class SpeechEngine {
  private isSpeakingState = false;

  public speakText(text: string, onEnd?: () => void) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      console.warn("La synthèse vocale n'est pas supportée par ce navigateur.");
      if (onEnd) onEnd();
      return;
    }

    try {
      window.speechSynthesis.cancel(); // Stop any ongoing speech

      const cleanText = text
        .replace(/[*_#`~]/g, '') // strip markdown
        .replace(/\b([0-9]{1,2})\b/g, '$1 ') // pause slightly on numbers
        .trim();

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'fr-FR';
      utterance.rate = 0.92; // slightly slower for better clarity
      utterance.pitch = 1.0;

      // Try to find a French voice
      const voices = window.speechSynthesis.getVoices();
      const frVoice = voices.find(v => v.lang.startsWith('fr'));
      if (frVoice) {
        utterance.voice = frVoice;
      }

      utterance.onstart = () => {
        this.isSpeakingState = true;
      };

      utterance.onend = () => {
        this.isSpeakingState = false;
        if (onEnd) onEnd();
      };

      utterance.onerror = () => {
        this.isSpeakingState = false;
        if (onEnd) onEnd();
      };

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn("Erreur de synthèse vocale:", e);
      this.isSpeakingState = false;
      if (onEnd) onEnd();
    }
  }

  public speakNumbers(numbers: number[], drawName?: string, onEnd?: () => void) {
    if (!numbers || numbers.length === 0) return;
    
    const intro = drawName 
      ? `Pronostic pour le tirage ${drawName}. ` 
      : `Voici les numéros recommandés : `;

    const numberList = numbers.join(', ');
    const fullPhrase = `${intro} Vos numéros sont : ${numberList}. Bonne chance !`;

    this.speakText(fullPhrase, onEnd);
  }

  public stop() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      this.isSpeakingState = false;
    }
  }

  public isSpeaking(): boolean {
    return this.isSpeakingState || (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.speaking);
  }
}

export const speechEngine = new SpeechEngine();

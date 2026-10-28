let audioContext: AudioContext | undefined;

function context(): AudioContext | undefined {
    if (typeof window === "undefined") {
        return undefined;
    }
    if (audioContext === undefined) {
        const Constructor =
            window.AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Constructor === undefined) {
            return undefined;
        }
        audioContext = new Constructor();
    }
    return audioContext;
}

function playTone(frequency: number, start: number, duration: number): void {
    const audio = context();
    if (audio === undefined) {
        return;
    }
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, audio.currentTime + start);
    gain.gain.exponentialRampToValueAtTime(0.05, audio.currentTime + start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + start + duration);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start(audio.currentTime + start);
    oscillator.stop(audio.currentTime + start + duration + 0.02);
}

export function playCompletionTone(): void {
    playTone(392, 0, 0.12);
    playTone(523.25, 0.1, 0.16);
}

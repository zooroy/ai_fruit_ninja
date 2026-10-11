export class Sound {
  muted = false;
  private context?: AudioContext;
  async unlock() {
    this.context ??= new AudioContext();
    await this.context.resume();
  }
  play(kind: "fruit" | "bomb" | "combo") {
    if (this.muted || !this.context || this.context.state !== "running") return;
    const c = this.context;
    const notes =
      kind === "combo"
        ? [660, 830, 990]
        : kind === "bomb"
          ? [90]
          : [430 + Math.random() * 160];
    notes.forEach((hz, i) => {
      const o = c.createOscillator(),
        g = c.createGain(),
        start = c.currentTime + i * 0.07;
      o.type = kind === "bomb" ? "triangle" : "sine";
      o.frequency.setValueAtTime(hz, start);
      o.frequency.exponentialRampToValueAtTime(
        kind === "bomb" ? 30 : hz * 1.5,
        start + 0.13,
      );
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.12, start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
      o.connect(g).connect(c.destination);
      o.start(start);
      o.stop(start + 0.2);
      o.onended = () => {
        o.disconnect();
        g.disconnect();
      };
    });
  }
}

import { it, expect, vi, afterEach, type Mock } from "vitest";
import { Sound } from "../src/ui/sound";
afterEach(() => vi.unstubAllGlobals());
it("starts only after unlock, produces distinct cues, and stays silent when muted", async () => {
  const param = () => ({
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  });
  type Oscillator = {
    type: string;
    frequency: ReturnType<typeof param>;
    connect: (g: unknown) => unknown;
    start: Mock;
    stop: Mock;
  };
  const oscillators: Oscillator[] = [];
  class Context {
    state = "running";
    currentTime = 1;
    destination = {};
    resume = vi.fn();
    createOscillator() {
      const o = {
        type: "sine",
        frequency: param(),
        connect: (g: unknown) => g,
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(o);
      return o;
    }
    createGain() {
      return { gain: param(), connect: () => ({}) };
    }
  }
  vi.stubGlobal("AudioContext", Context);
  const sound = new Sound();
  sound.play("fruit");
  expect(oscillators).toHaveLength(0);
  await sound.unlock();
  sound.play("fruit");
  sound.play("bomb");
  sound.play("combo");
  expect(oscillators).toHaveLength(5);
  expect(oscillators[1].type).toBe("triangle");
  expect(oscillators.every((o) => o.stop.mock.calls.length === 1)).toBe(true);
  sound.muted = true;
  sound.play("fruit");
  sound.play("bomb");
  sound.play("combo");
  expect(oscillators).toHaveLength(5);
});

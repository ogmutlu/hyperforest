import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { playAchievementChime } from "../src/achievementSound";

interface FakeParam {
  setValueAtTime: ReturnType<typeof vi.fn>;
  exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
}

interface FakeNode {
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

interface FakeOscillator extends FakeNode {
  type: OscillatorType;
  frequency: FakeParam;
  detune: FakeParam;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  onended: (() => void) | null;
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  static initialState: AudioContextState = "running";
  static resumeResolvesTo: AudioContextState = "running";

  state: AudioContextState;
  currentTime = 0;
  destination = {};
  nodes: FakeNode[] = [];
  oscillators: FakeOscillator[] = [];
  resumeCalls = 0;
  closeCalls = 0;
  private resumeResolver: (() => void) | null = null;
  deferResume = false;

  constructor() {
    this.state = FakeAudioContext.initialState;
    FakeAudioContext.instances.push(this);
  }

  private param(): FakeParam {
    return {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    };
  }

  createBiquadFilter() {
    const node = {
      type: "lowpass" as BiquadFilterType,
      frequency: this.param(),
      Q: this.param(),
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    this.nodes.push(node);
    return node;
  }

  createGain() {
    const node = {
      gain: this.param(),
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    this.nodes.push(node);
    return node;
  }

  createOscillator() {
    const osc: FakeOscillator = {
      type: "sine",
      frequency: this.param(),
      detune: this.param(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null,
    };
    this.nodes.push(osc);
    this.oscillators.push(osc);
    return osc;
  }

  resume(): Promise<void> {
    this.resumeCalls += 1;
    if (this.deferResume) {
      return new Promise<void>((resolve) => {
        this.resumeResolver = () => {
          this.state = FakeAudioContext.resumeResolvesTo;
          this.currentTime = 1.5;
          resolve();
        };
      });
    }
    this.state = FakeAudioContext.resumeResolvesTo;
    return Promise.resolve();
  }

  finishResume(): void {
    this.resumeResolver?.();
    this.resumeResolver = null;
  }

  close(): Promise<void> {
    this.closeCalls += 1;
    this.state = "closed";
    return Promise.resolve();
  }
}

describe("achievementSound", () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    vi.useFakeTimers();
    FakeAudioContext.instances = [];
    FakeAudioContext.initialState = "running";
    FakeAudioContext.resumeResolvesTo = "running";
    (globalThis as unknown as { window: unknown }).window = {
      AudioContext: FakeAudioContext,
    };
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
    (globalThis as unknown as { window: unknown }).window = originalWindow;
  });

  it("disconnects all nodes and closes the AudioContext after a chime finishes", async () => {
    playAchievementChime("daily");
    await Promise.resolve();

    expect(FakeAudioContext.instances).toHaveLength(1);
    const ctx = FakeAudioContext.instances[0]!;
    expect(ctx.oscillators.length).toBeGreaterThan(0);

    const lastOsc = ctx.oscillators.find((osc) => osc.onended !== null);
    expect(lastOsc).toBeDefined();
    lastOsc!.onended!();

    for (const node of ctx.nodes) {
      expect(node.disconnect).toHaveBeenCalledTimes(1);
    }
    expect(ctx.closeCalls).toBe(0);

    vi.advanceTimersByTime(400);
    expect(ctx.closeCalls).toBe(1);
    expect(ctx.state).toBe("closed");

    // A subsequent chime creates a fresh AudioContext.
    playAchievementChime("bronze");
    await Promise.resolve();
    expect(FakeAudioContext.instances).toHaveLength(2);
  });

  it("awaits AudioContext.resume() before scheduling oscillators", async () => {
    FakeAudioContext.initialState = "suspended";
    const Ctor = class extends FakeAudioContext {
      constructor() {
        super();
        this.deferResume = true;
      }
    };
    (globalThis as unknown as { window: unknown }).window = {
      AudioContext: Ctor,
    };

    playAchievementChime("daily");
    expect(FakeAudioContext.instances).toHaveLength(1);
    const ctx = FakeAudioContext.instances[0]!;
    expect(ctx.resumeCalls).toBe(1);
    expect(ctx.oscillators).toHaveLength(0);

    ctx.finishResume();
    await Promise.resolve();
    await Promise.resolve();

    expect(ctx.oscillators.length).toBeGreaterThan(0);
    expect(ctx.oscillators[0]!.start).toHaveBeenCalledWith(1.51);
  });

  it("closes the context immediately when resume leaves it suspended", async () => {
    FakeAudioContext.initialState = "suspended";
    FakeAudioContext.resumeResolvesTo = "suspended";

    playAchievementChime("daily");
    await Promise.resolve();
    await Promise.resolve();

    const ctx = FakeAudioContext.instances[0]!;
    expect(ctx.oscillators).toHaveLength(0);
    expect(ctx.closeCalls).toBe(1);
  });
});

import { createModel } from "./model";
import type { Detection } from "./gestures";
export class Tracker {
  private worker?: Worker;
  private model?: Awaited<ReturnType<typeof createModel>>;
  private busy = false;
  private last = 0;
  private frameTime = -1;
  private generation = 0;
  private timeout?: ReturnType<typeof setTimeout>;
  mode = "";
  onResult: (result: Detection, time: number) => void = () => {};
  onError: (e: Error) => void = () => {};
  inferenceMs = 0;
  async start() {
    this.stop();
    const generation = this.generation;
    const base = new URL(import.meta.env.BASE_URL, location.href).href;
    let worker: Worker | undefined;
    try {
      worker = new Worker(base + "tracking-worker.js");
      this.worker = worker;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(Error("Worker initialization timeout")),
          15000,
        );
        worker!.onerror = () => {
          clearTimeout(timer);
          reject(Error("Worker unavailable"));
        };
        worker!.onmessage = ({ data }) => {
          clearTimeout(timer);
          data.type === "ready" ? resolve() : reject(Error(data.message));
        };
        worker!.postMessage({ type: "init", base });
      });
      if (generation !== this.generation) {
        worker.terminate();
        throw Error("Tracking cancelled");
      }
      worker.onmessage = ({ data }) => {
        clearTimeout(this.timeout);
        this.busy = false;
        if (data.type === "result") {
          this.inferenceMs = performance.now() - data.time;
          this.onResult(data.result, data.time);
        } else this.onError(Error("手勢辨識中斷，請重試。"));
      };
      worker.onerror = () => {
        this.busy = false;
        this.onError(Error("手勢辨識中斷，請重試。"));
      };
      this.mode = "worker";
    } catch {
      worker?.terminate();
      if (generation !== this.generation) return;
      this.worker = undefined;
      const model = await createModel(base);
      if (generation !== this.generation) {
        model.close();
        return;
      }
      this.model = model;
      this.mode = "main";
    }
  }
  async frame(video: HTMLVideoElement, now: number) {
    if (
      this.busy ||
      now - this.last < (this.mode === "main" ? 80 : 40) ||
      video.readyState < 2 ||
      video.currentTime === this.frameTime
    )
      return;
    this.frameTime = video.currentTime;
    this.last = now;
    this.busy = true;
    const generation = this.generation;
    try {
      if (this.worker) {
        const frame = await createImageBitmap(video);
        if (generation !== this.generation) {
          frame.close();
          return;
        }
        this.worker.postMessage({ type: "frame", frame, time: now }, [frame]);
        this.timeout = setTimeout(() => {
          this.busy = false;
          this.onError(Error("手勢辨識逾時，請重試。"));
        }, 5000);
      } else if (this.model) {
        const result = this.model.detectForVideo(video, now);
        this.inferenceMs = performance.now() - now;
        this.onResult(result, now);
        this.busy = false;
      } else this.busy = false;
    } catch {
      this.busy = false;
      this.onError(Error("無法讀取攝影機影像，請重試。"));
    }
  }
  stop() {
    this.generation++;
    clearTimeout(this.timeout);
    this.worker?.terminate();
    this.model?.close();
    this.worker = undefined;
    this.model = undefined;
    this.busy = false;
    this.last = 0;
    this.frameTime = -1;
  }
}

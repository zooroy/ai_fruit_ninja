export function cameraError(error: unknown): string {
  const name = (error as Error)?.name;
  if (name === "NotAllowedError")
    return "攝影機權限尚未開啟。請在網址列允許攝影機，再重試。";
  if (name === "NotFoundError") return "找不到攝影機。請連接攝影機後重試。";
  if (name === "NotReadableError")
    return "攝影機可能被其他程式使用。請關閉其他視訊程式後重試。";
  return error instanceof Error ? error.message : "無法啟動攝影機，請重試。";
}
export class Camera {
  stream: MediaStream | null = null;
  private generation = 0;
  onInterrupted = () => {};
  constructor(public video: HTMLVideoElement) {}
  async start() {
    this.stop();
    const generation = this.generation;
    if (!window.isSecureContext || !navigator.mediaDevices)
      throw Error("攝影機需要 HTTPS 或 localhost 安全網址。");
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: "user",
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30, max: 30 },
      },
    });
    if (generation !== this.generation) {
      stream.getTracks().forEach((t) => t.stop());
      throw Error("攝影機啟動已取消。");
    }
    this.stream = stream;
    this.video.srcObject = stream;
    for (const t of stream.getVideoTracks()) {
      t.onended = () => this.onInterrupted();
      t.onmute = () => this.onInterrupted();
    }
    try {
      await this.video.play();
      if (generation !== this.generation) throw Error("攝影機啟動已取消。");
      if (!this.video.videoWidth)
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            cleanup();
            reject(Error("攝影機影像載入逾時，請重試。"));
          }, 10000);
          const loaded = () => {
            cleanup();
            resolve();
          };
          const cleanup = () => {
            clearTimeout(timeout);
            this.video.removeEventListener("loadeddata", loaded);
          };
          this.video.addEventListener("loadeddata", loaded, { once: true });
        });
    } catch (e) {
      if (generation === this.generation) this.stop();
      throw e;
    }
  }
  get live() {
    return !!this.stream
      ?.getVideoTracks()
      .some((t) => t.readyState === "live" && !t.muted);
  }
  stop() {
    this.generation++;
    this.stream?.getTracks().forEach((t) => {
      t.onended = null;
      t.onmute = null;
      t.stop();
    });
    this.stream = null;
    this.video.srcObject = null;
  }
}

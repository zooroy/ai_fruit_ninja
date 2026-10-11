import { createModel } from "./model";
let model: Awaited<ReturnType<typeof createModel>>;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === "init") {
      model = await createModel(data.base);
      self.postMessage({ type: "ready" });
    } else if (data.type === "frame") {
      try {
        const result = model.detectForVideo(data.frame, data.time);
        self.postMessage({ type: "result", result, time: data.time });
      } finally {
        data.frame.close();
      }
    }
  } catch (error) {
    self.postMessage({ type: "error", message: String(error) });
  }
};

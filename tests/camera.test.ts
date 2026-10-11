import { it, expect, vi, afterEach } from "vitest";
import { Camera, cameraError } from "../src/camera/camera";
afterEach(() => vi.unstubAllGlobals());
function mock() {
  const track = {
    stop: vi.fn(),
    onended: null,
    onmute: null,
    readyState: "live",
    muted: false,
  };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  const getUserMedia = vi.fn().mockResolvedValue(stream);
  vi.stubGlobal("window", { isSecureContext: true });
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  const video = {
    srcObject: null,
    play: vi.fn().mockResolvedValue(undefined),
    videoWidth: 640,
  };
  return {
    track,
    stream,
    getUserMedia,
    c: new Camera(video as unknown as HTMLVideoElement),
  };
}
it("requests front camera and cleans up on exit/reentry", async () => {
  const { c, track, getUserMedia } = mock();
  await c.start();
  expect(getUserMedia.mock.calls[0][0].video.facingMode).toBe("user");
  expect(c.live).toBe(true);
  c.stop();
  expect(track.stop).toHaveBeenCalledTimes(1);
  await c.start();
  expect(getUserMedia).toHaveBeenCalledTimes(2);
});
it.each(["NotAllowedError", "NotFoundError", "NotReadableError"])(
  "reports %s and permits retry",
  async (name) => {
    const { c, getUserMedia } = mock();
    getUserMedia.mockRejectedValueOnce(Object.assign(Error(), { name }));
    await expect(c.start()).rejects.toHaveProperty("name", name);
    expect(cameraError({ name })).toBeTruthy();
    await c.start();
    expect(c.live).toBe(true);
  },
);
it("stops a late arriving stream after cancellation", async () => {
  const { c, getUserMedia, stream, track } = mock();
  let finish: (s: unknown) => void = () => {};
  getUserMedia.mockReturnValue(new Promise((r) => (finish = r)));
  const p = c.start();
  c.stop();
  finish(stream);
  await expect(p).rejects.toThrow("取消");
  expect(track.stop).toHaveBeenCalled();
});
it("rejects unsafe origins", async () => {
  const { c } = mock();
  vi.stubGlobal("window", { isSecureContext: false });
  await expect(c.start()).rejects.toThrow("HTTPS");
});
it("cleans up when playback fails", async () => {
  const { c, track } = mock();
  c.video.play = vi.fn().mockRejectedValue(Error("play failed"));
  await expect(c.start()).rejects.toThrow("play failed");
  expect(track.stop).toHaveBeenCalled();
});

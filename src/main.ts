import "./styles/tokens.css";
import "./styles/components.css";
import "./styles/app.css";
import { Game, intersection, type Blade, type Target } from "./game/engine";
import { Camera, cameraError } from "./camera/camera";
import { Tracker } from "./tracking/tracker";
import { Gestures } from "./tracking/gestures";
import { Forest } from "./scene/forest";
import { Sound } from "./ui/sound";
import { createClient, leaderboardUrl } from "./leaderboard/client";
import { newSubmissionId } from "./leaderboard/id";
import { ResultSession, type Snapshot } from "./leaderboard/session";
import { mountResultBoard, setupHomeLeaderboard } from "./ui/leaderboard";
import { deviceSupport } from "./device";
import { createShell } from "./ui/shell";
import { h } from "./ui/dom";

type Mode =
  | "welcome"
  | "loading"
  | "error"
  | "tutorial"
  | "countdown"
  | "playing"
  | "paused"
  | "results";

const ui = createShell(document.querySelector<HTMLDivElement>("#app")!);
// 各畫面要顯示的區塊；未列出的一律隱藏。
const views = {
  panel: ui.panel,
  message: ui.message,
  hud: ui.hud,
  tutorial: ui.tutorial,
  countdown: ui.countdown,
  pause: ui.pause,
  camera: ui.cameraCard,
};
const screens: Record<Mode, readonly (keyof typeof views)[]> = {
  welcome: ["panel"],
  loading: ["message"],
  error: ["message"],
  tutorial: ["tutorial", "camera"],
  countdown: ["hud", "countdown", "camera"],
  playing: ["hud", "pause", "camera"],
  paused: ["message", "hud", "camera"],
  results: ["message"],
};

let forest: Forest;
// 手機與平板不支援遊玩；判斷結果只在首頁套用，不中斷進行中的遊戲。
const device = deviceSupport();
const game = new Game(),
  sound = new Sound(),
  camera = new Camera(ui.video),
  tracker = new Tracker(),
  gestures = new Gestures();
let mode: Mode = "welcome",
  pending: Blade[] = [];
let tutorialTarget: Target = {
  id: -1,
  kind: 0,
  x: 0,
  y: -0.5,
  vx: 0,
  vy: 0,
  r: 0.55,
  born: 0,
};
let lastFrame = performance.now(),
  lastInput = 0,
  setupId = 0,
  tutorialAt = 0;
let injected = false;
let fps = 0;
// 每局一個提交識別；同一局的所有重試沿用。
let roundId = newSubmissionId();
let board: { session: ResultSession; dispose(): void } | null = null;
const leaderboardClient = () => {
  const url = leaderboardUrl();
  return url ? createClient(url) : null;
};
function clearBoard() {
  board?.dispose();
  board = null;
}
function startRound(now: number) {
  game.start(now);
  roundId = newSubmissionId();
}
function setMode(next: Mode) {
  mode = next;
  document.body.dataset.mode = mode;
  const shown = new Set(screens[mode]);
  for (const [key, el] of Object.entries(views))
    el.hidden = !shown.has(key as keyof typeof views);
}
function message(title: string, copy = "", action = "") {
  ui.messageTitle.textContent = title;
  ui.messageCopy.textContent = copy;
  ui.messageCopy.hidden = !copy;
  ui.action.textContent = action;
  ui.action.hidden = !action;
  clearBoard();
  ui.resultStats.replaceChildren();
}
function setTracking(hands: number) {
  ui.trackingDot.classList.toggle("active", hands > 0);
  ui.trackingLabel.hidden = hands > 0;
}
function resetInput() {
  pending = [];
  lastInput = 0;
  gestures.reset();
  forest?.clearTrails();
}
function cleanup() {
  setupId++;
  camera.stop();
  tracker.stop();
  resetInput();
}
function fail(error: unknown) {
  cleanup();
  setMode("error");
  message("無法啟動", cameraError(error), "重試");
}
function applyDevice() {
  const supported = device.supported;
  ui.start.hidden = !supported;
  ui.privacy.hidden = !supported;
  ui.unsupported.hidden = supported;
}
async function setup() {
  // 所有開始入口（首頁、結算重玩、開發 hooks）都在此擋下，不要求攝影機也不載入模型。
  if (!device.supported) {
    home();
    return;
  }
  cleanup();
  game.start(performance.now());
  game.state = "idle";
  const id = setupId;
  setMode("loading");
  message("正在啟動攝影機…");
  try {
    await sound.unlock();
    await camera.start();
    if (id !== setupId) return;
    await tracker.start().catch(() => {
      throw Error("手勢辨識載入失敗，請確認連線後重新啟動。");
    });
    if (id !== setupId) return;
    setMode("tutorial");
    ui.tutorialTitle.textContent = "伸出食指，劃過水果";
    setTracking(0);
    tutorialAt = 0;
  } catch (error) {
    if (id === setupId) fail(error);
  }
}
function home() {
  cleanup();
  clearBoard();
  applyDevice();
  game.start(performance.now());
  game.state = "idle";
  game.targets = [];
  setMode("welcome");
}
function pause() {
  if (mode !== "playing" && mode !== "countdown") return;
  game.pause(performance.now());
  if (game.state === "results") {
    results();
    return;
  }
  resetInput();
  setMode("paused");
  message("已暫停", "", "繼續");
}
function stat(value: number, label: string) {
  return h("span", {}, [h("b", { text: String(value) }), label]);
}
function results() {
  cleanup();
  setMode("results");
  message("本局結束", "", "再玩一次");
  ui.resultStats.append(
    h("div", { className: "final-score" }, [String(game.score), h("small", { text: "分" })]),
    h("div", { className: "stats" }, [
      stat(game.fruits, "水果"),
      stat(game.maxCombo, "最高連切"),
      stat(game.bombs, "炸彈"),
    ]),
  );
  // 結算快照與遊戲物件脫鉤：之後重玩重設 game 不影響這局的提交內容。
  const snapshot: Snapshot = Object.freeze({
    submissionId: roundId,
    score: game.score,
    fruits: game.fruits,
    bombs: game.bombs,
    maxCombo: game.maxCombo,
  });
  let view: ReturnType<typeof mountResultBoard> | null = null;
  const session = new ResultSession(snapshot, leaderboardClient(), (s) =>
    view?.render(s),
  );
  view = mountResultBoard(ui.resultStats, session);
  board = {
    session,
    dispose() {
      session.dispose();
      view?.dispose();
    },
  };
  void session.load();
}
function accept(blades: Blade[]) {
  if (mode !== "tutorial" && mode !== "playing" && mode !== "countdown") return;
  const ids = new Set(blades.filter((b) => b.active).map((b) => b.id));
  for (const id of [0, 1])
    if (!ids.has(id) || blades.some((b) => b.id === id && !b.from))
      game.endBlade(id);
  pending.push(...blades);
  lastInput = performance.now();
  forest.blades(blades);
  setTracking(ids.size);
}
tracker.onResult = (data, time) => {
  if (performance.now() - time > 250) {
    resetInput();
    return;
  }
  accept(gestures.update(data, time, forest.width, forest.height));
};
tracker.onError = fail;
camera.onInterrupted = () => {
  if (mode === "playing" || mode === "countdown") pause();
  else if (mode === "tutorial") fail(Error("攝影機已中斷，請重試。"));
};
ui.start.onclick = () => void setup();
setupHomeLeaderboard(ui.leaderboard, leaderboardClient);
applyDevice();
device.onChange(() => {
  if (mode === "welcome") applyDevice();
});
ui.home.onclick = home;
ui.pause.onclick = pause;
ui.sound.onclick = () => {
  sound.muted = !sound.muted;
  ui.sound.setAttribute("aria-pressed", String(sound.muted));
  ui.sound.textContent = sound.muted ? "♪̸" : "♫";
  void sound.unlock();
};
ui.brand.addEventListener("click", (e) => {
  e.preventDefault();
  home();
});
ui.action.onclick = async () => {
  if (mode !== "paused") {
    void setup();
    return;
  }
  try {
    if (!camera.live && !injected) await camera.start();
    resetInput();
    game.resume(performance.now());
    setMode(game.state === "countdown" ? "countdown" : "playing");
  } catch (e) {
    fail(e);
  }
};
function resize() {
  forest?.resize();
  if (forest) {
    for (const t of game.targets) t.x *= forest.width / game.width;
    game.width = forest.width;
    game.height = forest.height;
    resetInput();
  }
}
try {
  forest = new Forest(ui.world);
  resize();
} catch {
  setMode("error");
  message(
    "無法啟動",
    "這個瀏覽器無法開啟 3D 畫面。請使用支援 WebGL 的瀏覽器，並啟用硬體加速。",
  );
  ui.home.hidden = true;
  ui.start.disabled = true;
  throw Error("WebGL initialization failed");
}
window.addEventListener("resize", resize);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause();
});
window.addEventListener("pagehide", cleanup);
function feedback() {
  for (const e of game.drain()) {
    forest.event(e);
    sound.play(e.type);
    // 一般水果的得分只反映在分數上；連切與炸彈才有飄字。
    if (e.type === "fruit") continue;
    const toast = h("div", {
      className: "toast " + e.type,
      text: e.type === "combo" ? `${e.count} 連切 +${e.count * 5}` : "炸彈 −50",
    });
    toast.style.left = `${(e.x / forest.width + 0.5) * 100}%`;
    toast.style.top = `${(0.5 - e.y / forest.height) * 100}%`;
    ui.toasts.append(toast);
    setTimeout(() => toast.remove(), 1000);
  }
}
function frame(now: number) {
  const rawDt = (now - lastFrame) / 1000;
  const dt = Math.min(rawDt, 0.05);
  fps = fps * 0.95 + 0.05 / Math.max(0.001, rawDt);
  lastFrame = now;
  if ((mode === "tutorial" || mode === "playing" || mode === "countdown") && !injected)
    void tracker.frame(camera.video, now);
  if (lastInput && now - lastInput > 180) {
    for (const id of [0, 1]) game.endBlade(id);
    resetInput();
    setTracking(0);
  }
  if (mode === "tutorial") {
    if (
      !tutorialAt &&
      pending.some(
        (b) =>
          b.active &&
          b.from &&
          intersection(b.from, b.point, tutorialTarget, tutorialTarget.r) !==
            null,
      )
    ) {
      tutorialAt = now;
      forest.event({
        type: "fruit",
        x: 0,
        y: -0.5,
        kind: 0,
        count: 1,
        angle: 0,
      });
      sound.play("fruit");
      ui.tutorialTitle.textContent = "準備開始";
    }
    if (tutorialAt && now - tutorialAt > 700) {
      startRound(now);
      resetInput();
      setMode("countdown");
    }
  }
  if (mode === "playing" || mode === "countdown") {
    game.tick(now, pending);
    if (game.state === "results") {
      feedback();
      results();
    } else if (game.state === "playing" && mode === "countdown")
      setMode("playing");
  }
  pending = [];
  feedback();
  ui.score.textContent = String(game.score).padStart(3, "0");
  ui.time.textContent = String(Math.ceil(game.remaining));
  ui.timerRing.style.strokeDashoffset = String(164 * (1 - game.remaining / 30));
  ui.countdown.textContent = String(Math.ceil(game.countdown));
  forest.render(
    mode === "tutorial" && !tutorialAt ? [tutorialTarget] : game.targets,
    mode === "paused" ? 0 : dt,
    now / 1000,
    mode === "welcome",
  );
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// Explicit development-only hooks. No alternate input path in production builds.
if (import.meta.env.DEV) {
  (window as unknown as { __test: unknown }).__test = {
    game,
    camera,
    tracker,
    forest,
    sound,
    accept,
    setup,
    pause,
    home,
    get mode() {
      return mode;
    },
    get fps() {
      return fps;
    },
    get board() {
      return board?.session.state ?? null;
    },
    get roundId() {
      return roundId;
    },
    tutorial() {
      injected = true;
      setMode("tutorial");
      tutorialAt = 0;
    },
    start() {
      injected = true;
      startRound(performance.now() - 3000);
      setMode("playing");
    },
    finish() {
      game.elapsed = 30000;
      game.tick(performance.now());
    },
    inject: accept,
  };
}

import "./style.css";
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
const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `<canvas id="world" aria-label="森林水果遊戲場景"></canvas>
<div class="vignette"></div><header><a class="brand" href="#" aria-label="返回首頁"><span class="brand-icon">✳</span><span>森之刃<small>FOREST SLICE</small></span></a><div class="top-actions"><span class="edition">A LITTLE FOREST. A BIG CHALLENGE.</span><button id="sound" class="icon-button" aria-label="靜音" aria-pressed="false">♫</button><button id="quality" class="icon-button" aria-label="低畫質" aria-pressed="false">◈</button><button id="pause" class="icon-button" aria-label="暫停" hidden>Ⅱ</button></div></header>
<div id="hud" hidden><div class="hud-score"><span>SCORE · 得分</span><strong id="score">000</strong></div><div class="timer"><svg viewBox="0 0 60 60"><circle cx="30" cy="30" r="26"/><circle id="timer-ring" cx="30" cy="30" r="26"/></svg><strong id="time">30</strong></div><div class="hud-combo"><span>BEST COMBO</span><strong id="combo">—</strong></div></div>
<main id="panel"><div class="eyebrow"><i></i> THE ORCHARD IS YOURS</div><h1>揮手之間，<br>果然<span>痛快。</span></h1><p class="lead">走進森林，伸出食指。<br>用雙手刀光，切出你的 30 秒高分。</p><button id="start" class="primary">啟動攝影機 <span>↗</span></button><button id="leaderboard-open" class="secondary" type="button">歷史排行 TOP 10</button><p class="privacy"><span>◉</span> 影像僅在你的裝置處理，不會上傳</p><div class="rule-row"><span><b>30</b> 秒挑戰</span><span><b>↗↖</b> 雙手出擊</span><span><b>✦</b> 連切加分</span></div></main>
<section id="message" class="message" hidden aria-live="polite"><span class="eyebrow" id="message-tag">GET READY</span><h2 id="message-title"></h2><p id="message-copy"></p><div id="result-stats"></div><button id="action" class="primary" hidden></button><button id="home" class="text-button">返回森林</button></section>
<div id="countdown" hidden></div><div id="tutorial" hidden><span class="eyebrow">FIRST SLICE</span><h2>伸出食指，劃過水果</h2><p>左右手都可以 · 收起食指即可收刀</p></div>
<aside id="camera-card" hidden><div class="camera-frame"><video id="video" autoplay playsinline muted></video><span class="camera-guide"></span></div><div><i id="tracking-dot"></i><span id="tracking-label">把手放進畫面</span><span class="camera-local">LOCAL</span></div></aside>
<div id="toasts" aria-live="polite"></div><footer><span class="footer-note">✧　放好裝置，讓雙手自由發揮</span><span class="footer-right">水果 +10 <i>／</i> 小心炸彈 −50</span></footer>`;
const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
let forest: Forest;
const game = new Game(),
  sound = new Sound(),
  camera = new Camera(el<HTMLVideoElement>("video")),
  tracker = new Tracker(),
  gestures = new Gestures();
let mode = "welcome",
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
function show(id: string, visible: boolean) {
  el(id).hidden = !visible;
}
function setMode(next: string) {
  mode = next;
  document.body.dataset.mode = mode;
  show("panel", mode === "welcome");
  show("message", ["loading", "error", "paused", "results"].includes(mode));
  show("hud", ["playing", "countdown", "paused"].includes(mode));
  show("tutorial", mode === "tutorial");
  show("countdown", mode === "countdown");
  show("pause", mode === "playing");
  show(
    "camera-card",
    ["tutorial", "countdown", "playing", "paused"].includes(mode),
  );
}
function message(title: string, copy: string, action = "", tag = "GET READY") {
  el("message-title").textContent = title;
  el("message-copy").textContent = copy;
  el("message-tag").textContent = tag;
  el("action").textContent = action;
  show("action", !!action);
  clearBoard();
  el("result-stats").innerHTML = "";
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
  message("還差一小步", cameraError(error), "重新啟動", "CAMERA SETUP");
}
async function setup() {
  cleanup();
  game.start(performance.now());
  game.state = "idle";
  const id = setupId;
  setMode("loading");
  message("正在喚醒森林…", "開啟攝影機，準備你的雙手刀光。");
  try {
    await sound.unlock();
    await camera.start();
    if (id !== setupId) return;
    await tracker.start().catch(() => {
      throw Error("手勢辨識載入失敗，請確認連線後重新啟動。");
    });
    if (id !== setupId) return;
    setMode("tutorial");
    el("tutorial").querySelector("h2")!.textContent = "伸出食指，劃過水果";
    tutorialAt = 0;
  } catch (error) {
    if (id === setupId) fail(error);
  }
}
function home() {
  cleanup();
  clearBoard();
  game.start(performance.now());
  game.state = "idle";
  game.targets = [];
  setMode("welcome");
}
function pause() {
  if (!["playing", "countdown"].includes(mode)) return;
  game.pause(performance.now());
  if (game.state === "results") {
    results();
    return;
  }
  resetInput();
  setMode("paused");
  message(
    "讓森林等你一下",
    "準備好後，繼續這一局。",
    "繼續挑戰",
    "TAKE A BREATH",
  );
}
function results() {
  cleanup();
  setMode("results");
  message(
    "漂亮的一刀。",
    "再來一次，看看雙手的極限。",
    "再挑戰一次",
    "ROUND COMPLETE",
  );
  el("result-stats").innerHTML =
    `<div class="final-score">${game.score}<small>POINTS</small></div><div class="stats"><span><b>${game.fruits}</b>切開水果</span><span><b>${game.maxCombo}</b>最高連切</span><span><b>${game.bombs}</b>碰到炸彈</span></div>`;
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
  view = mountResultBoard(el("result-stats"), session);
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
  if (!["tutorial", "playing", "countdown"].includes(mode)) return;
  const ids = new Set(blades.filter((b) => b.active).map((b) => b.id));
  for (const id of [0, 1])
    if (!ids.has(id) || blades.some((b) => b.id === id && !b.from))
      game.endBlade(id);
  pending.push(...blades);
  lastInput = performance.now();
  forest.blades(blades);
  el("tracking-label").textContent = ids.size
    ? `${ids.size} 隻手已就位`
    : "伸出食指，準備出刀";
  el("tracking-dot").classList.toggle("active", ids.size > 0);
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
  if (["playing", "countdown"].includes(mode)) pause();
  else if (mode === "tutorial") fail(Error("攝影機已中斷，請重試。"));
};
el("start").onclick = () => void setup();
setupHomeLeaderboard(el<HTMLButtonElement>("leaderboard-open"), leaderboardClient);
el("home").onclick = home;
el("pause").onclick = pause;
el("sound").onclick = () => {
  sound.muted = !sound.muted;
  el("sound").setAttribute("aria-pressed", String(sound.muted));
  el("sound").textContent = sound.muted ? "♪̸" : "♫";
  void sound.unlock();
};
el("quality").onclick = () => {
  forest.quality(!forest.low);
  el("quality").setAttribute("aria-pressed", String(forest.low));
  resize();
};
document.querySelector(".brand")!.addEventListener("click", (e) => {
  e.preventDefault();
  home();
});
el("action").onclick = async () => {
  if (mode !== "paused") {
    void setup();
    return;
  }
  try {
    if (!camera.live && !injected) await camera.start();
    resetInput();
    game.resume(performance.now());
    setMode(game.state);
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
  forest = new Forest(el<HTMLCanvasElement>("world"));
  resize();
} catch {
  setMode("error");
  message(
    "這個瀏覽器無法開啟 3D 森林",
    "請使用支援 WebGL 的瀏覽器，並確認硬體加速已啟用。",
  );
  show("home", false);
  el<HTMLButtonElement>("start").disabled = true;
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
    const toast = document.createElement("div");
    toast.className = "toast " + e.type;
    toast.textContent =
      e.type === "combo"
        ? `${e.count} 連切！ +${e.count * 5}`
        : e.type === "bomb"
          ? "小心！ −50"
          : "+10";
    toast.style.left = `${(e.x / forest.width + 0.5) * 100}%`;
    toast.style.top = `${(0.5 - e.y / forest.height) * 100}%`;
    el("toasts").append(toast);
    setTimeout(() => toast.remove(), 1000);
  }
}
function frame(now: number) {
  const rawDt = (now - lastFrame) / 1000;
  const dt = Math.min(rawDt, 0.05);
  fps = fps * 0.95 + 0.05 / Math.max(0.001, rawDt);
  lastFrame = now;
  if (["tutorial", "playing", "countdown"].includes(mode) && !injected)
    void tracker.frame(camera.video, now);
  if (lastInput && now - lastInput > 180) {
    for (const id of [0, 1]) game.endBlade(id);
    resetInput();
    el("tracking-label").textContent = "把手放進畫面";
    el("tracking-dot").classList.remove("active");
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
      el("tutorial").querySelector("h2")!.textContent = "漂亮！準備開始";
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
  el("score").textContent = String(game.score).padStart(3, "0");
  el("time").textContent = String(Math.ceil(game.remaining));
  el("combo").textContent = game.maxCombo ? `${game.maxCombo}×` : "—";
  el("timer-ring").style.strokeDashoffset = String(
    164 * (1 - game.remaining / 30),
  );
  el("countdown").textContent = String(Math.ceil(game.countdown));
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

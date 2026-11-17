// 以共用元件組裝整個介面，回傳具型別的元素參照。文字依 simplify-ui-and-components 的文案表。
import { button, h, status, surface } from "./dom";

export const RULE = "伸出食指切水果 · 30 秒 · 炸彈 −50";

export function createShell(root: HTMLElement) {
  const world = h("canvas", { id: "world", attrs: { "aria-label": "森林水果遊戲場景" } });

  const brand = h("a", { className: "brand", text: "森之刃", attrs: { href: "#", "aria-label": "返回首頁" } });
  const sound = button({ variant: "icon", label: "♫", ariaLabel: "靜音" });
  sound.setAttribute("aria-pressed", "false");
  const pause = button({ variant: "icon", label: "Ⅱ", ariaLabel: "暫停", id: "pause" });
  pause.hidden = true;
  const header = h("header", {}, [brand, h("div", { className: "top-actions" }, [pause, sound])]);

  const start = button({ variant: "primary", size: "lg", label: "啟動攝影機" });
  const leaderboard = button({ variant: "secondary", size: "lg", label: "排行榜" });
  const unsupported = h("p", {
    id: "unsupported",
    className: "device-note",
    text: "請改用筆電或桌機遊玩，手機與平板可瀏覽排行榜。",
    attrs: { role: "note" },
  });
  unsupported.hidden = true;
  const privacy = h("p", { id: "privacy", className: "privacy", text: "影像只在本機處理，不會上傳" });
  const panel = h("main", { id: "panel" }, [
    h("h1", {}, [h("span", { text: "揮手之間，" }), h("span", { text: "果然痛快。" })]),
    h("p", { className: "rule", text: RULE }),
    unsupported,
    h("div", { className: "actions" }, [start, leaderboard]),
    privacy,
  ]);

  const score = h("strong", { id: "score", text: "000" });
  const time = h("strong", { id: "time", text: "30" });
  const ring = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  ring.setAttribute("viewBox", "0 0 60 60");
  ring.innerHTML = `<circle cx="30" cy="30" r="26"/><circle id="timer-ring" cx="30" cy="30" r="26"/>`;
  const timerRing = ring.querySelector<SVGCircleElement>("#timer-ring")!;
  const hud = surface({ id: "hud" }, [
    h("div", { className: "hud-score" }, [h("span", { text: "得分" }), score]),
    h("div", { className: "timer", attrs: { "aria-label": "剩餘秒數" } }, [ring, time]),
  ]);
  hud.hidden = true;

  const messageTitle = h("h2", { id: "message-title" });
  const messageCopy = status({ id: "message-copy" });
  const resultStats = h("div", { id: "result-stats" });
  const action = button({ variant: "primary", size: "lg", label: "" });
  const home = button({ variant: "ghost", size: "sm", label: "返回首頁" });
  const message = surface({ tag: "section", id: "message", className: "message" }, [
    messageTitle,
    messageCopy,
    resultStats,
    action,
    home,
  ]);
  message.setAttribute("aria-live", "polite");
  message.hidden = true;

  const countdown = h("div", { id: "countdown" });
  countdown.hidden = true;
  const tutorialTitle = h("h2");
  const tutorial = h("div", { id: "tutorial" }, [tutorialTitle, h("p", { text: "收起食指即收刀" })]);
  tutorial.hidden = true;

  const video = h("video", { id: "video", attrs: { autoplay: "", playsinline: "", muted: "" } });
  video.muted = true;
  const trackingDot = h("i", { id: "tracking-dot" });
  const trackingLabel = h("span", { id: "tracking-label", text: "把手放進畫面" });
  const cameraCard = surface({ tag: "aside", tone: "dark", id: "camera-card" }, [
    h("div", { className: "camera-frame" }, [video, h("span", { className: "camera-guide" })]),
    h("div", { className: "camera-status" }, [trackingDot, trackingLabel]),
  ]);
  cameraCard.hidden = true;

  const toasts = h("div", { id: "toasts", attrs: { "aria-live": "polite" } });

  root.replaceChildren(world, header, panel, hud, message, countdown, tutorial, cameraCard, toasts);
  return {
    world,
    brand,
    sound,
    pause,
    panel,
    start,
    leaderboard,
    unsupported,
    privacy,
    hud,
    score,
    time,
    timerRing,
    message,
    messageTitle,
    messageCopy,
    resultStats,
    action,
    home,
    countdown,
    tutorial,
    tutorialTitle,
    cameraCard,
    video,
    trackingDot,
    trackingLabel,
    toasts,
  };
}

export type Shell = ReturnType<typeof createShell>;

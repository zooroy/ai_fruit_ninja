// 排行榜介面：首頁 dialog 與結算區內嵌榜單。名字一律以 textContent 呈現。
import { LeaderboardError, type Entry, type LeaderboardClient } from "../leaderboard/client";
import { invitation, lines } from "../leaderboard/rules";
import type { ResultSession, SessionState } from "../leaderboard/session";
import { button, h, status, surface } from "./dom";

const TITLE = "排行榜 TOP 10";

/** 榜單列表；highlight 為本局成功紀錄的 id。 */
export function renderList(list: HTMLOListElement, entries: readonly Entry[], highlight = "") {
  list.replaceChildren(
    ...entries.map((e) => {
      const name = h("span", { className: "board-name", text: e.name, attrs: { title: e.name } });
      const row = h("li", { className: "board-row" }, [
        h("span", { className: "board-rank", text: String(e.rank), attrs: { "aria-label": `第 ${e.rank} 名` } }),
        name,
        h("span", { className: "board-score", text: String(e.score), attrs: { "aria-label": `${e.score} 分` } }),
      ]);
      if (e.id === highlight) {
        row.classList.add("mine");
        row.setAttribute("aria-current", "true");
        name.append(h("em", { className: "board-you", text: "你" }));
      }
      return row;
    }),
  );
}

function boardList(titleId: string) {
  const title = h("h3", { className: "board-title", id: titleId, text: TITLE });
  const list = h("ol", { className: "board-list", attrs: { "aria-labelledby": titleId } });
  const empty = h("p", { className: "board-empty", text: lines.emptyBoard });
  return { title, list, empty };
}

// ---------------------------------------------------------------------------
// 首頁 dialog

export function setupHomeLeaderboard(
  trigger: HTMLButtonElement,
  getClient: () => LeaderboardClient | null,
) {
  const { title, list, empty } = boardList("board-dialog-title");
  const close = button({ variant: "icon", size: "sm", label: "✕", ariaLabel: "關閉排行榜" });
  const line = status({ live: "polite", className: "board-line" });
  const retry = button({ variant: "secondary", size: "sm", label: "重新載入" });
  const panel = surface({ className: "board-panel" }, [
    h("div", { className: "board-head" }, [title, close]),
    line,
    list,
    empty,
    retry,
  ]);
  const dialog = h("dialog", { className: "board-dialog", attrs: { "aria-labelledby": "board-dialog-title" } }, [panel]);
  document.body.append(dialog);

  let controller: AbortController | null = null;
  const view = (state: "loading" | "ready" | "error" | "unconfigured", entries: Entry[] = []) => {
    line.textContent =
      state === "loading" ? lines.loading
      : state === "error" ? lines.loadError
      : state === "unconfigured" ? lines.unconfiguredHome
      : "";
    line.hidden = state === "ready";
    list.setAttribute("aria-busy", String(state === "loading"));
    renderList(list, entries);
    list.hidden = state !== "ready" || !entries.length;
    empty.hidden = state !== "ready" || entries.length > 0;
    retry.hidden = state !== "error";
  };

  async function load() {
    controller?.abort();
    const client = getClient();
    if (!client) return view("unconfigured");
    const current = (controller = new AbortController());
    view("loading");
    try {
      const entries = await client.list(current.signal);
      if (!current.signal.aborted) view("ready", entries);
    } catch (e) {
      if (current.signal.aborted || (e instanceof LeaderboardError && e.kind === "aborted")) return;
      view("error");
      retry.focus();
    }
  }

  trigger.addEventListener("click", () => {
    dialog.showModal();
    close.focus();
    void load();
  });
  close.addEventListener("click", () => dialog.close());
  retry.addEventListener("click", () => {
    close.focus();
    void load();
  });
  // 點擊遮罩關閉。
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
  // 焦點圈限：Tab 只在 dialog 內可見控制項間循環。
  dialog.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    const items = [close, retry].filter((b) => !b.hidden);
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    e.preventDefault();
    items[(i + (e.shiftKey ? items.length - 1 : 1)) % items.length].focus();
  });
  dialog.addEventListener("close", () => {
    controller?.abort();
    controller = null;
    trigger.focus();
  });
  return dialog;
}

// ---------------------------------------------------------------------------
// 結算區

export function mountResultBoard(container: HTMLElement, session: ResultSession) {
  const line = status({ live: "polite", className: "board-line" });
  const detail = h("p", { className: "board-detail" });

  const input = h("input", {
    className: "board-input",
    id: "board-name",
    attrs: { "aria-describedby": "board-name-error" },
  });
  Object.assign(input, {
    name: "name",
    type: "text",
    autocomplete: "nickname",
    placeholder: "不知名的勇者",
    enterKeyHint: "send",
    spellcheck: false,
  });
  const label = h("label", { className: "board-label", text: "名字" }, [
    h("span", { className: "board-note", text: "公開顯示，可留白" }),
  ]);
  label.htmlFor = "board-name";
  const send = button({ variant: "primary", size: "md", label: "送出", type: "submit" });
  const fieldError = status({ tone: "error", live: "assertive", id: "board-name-error", className: "board-field-error" });
  const form = h("form", { className: "board-form" }, [
    label,
    h("div", { className: "board-input-row" }, [input, send]),
    fieldError,
  ]);
  form.noValidate = true;

  const retry = button({ variant: "secondary", size: "sm", label: "" });
  const { title, list, empty } = boardList("board-result-title");
  const wrap = h("div", { className: "board-list-wrap" }, [title, list, empty]);
  const section = h("section", { className: "board", attrs: { "aria-label": "排行榜" } }, [
    line,
    detail,
    form,
    retry,
    wrap,
  ]);
  container.append(section);

  let timer = 0;
  function render(state: SessionState) {
    clearTimeout(timer);
    let text = "",
      sub = "",
      showForm = false,
      locked = false,
      retryText = "",
      retryWait = 0,
      entries: Entry[] | null = null,
      highlight = "",
      error = "";
    switch (state.status) {
      case "loading":
        text = lines.loading;
        break;
      case "unconfigured":
        text = lines.unconfigured;
        break;
      case "load-error":
        text = lines.loadError;
        retryText = "重新載入";
        break;
      case "ready":
        text = state.lost ? lines.lost : invitation(state.standing);
        sub = state.lost ? invitation(state.standing) : "";
        showForm = state.qualified;
        error = state.fieldError;
        entries = state.entries;
        break;
      case "submitting":
        text = invitation(state.standing);
        showForm = locked = true;
        input.value = state.payload.name;
        entries = state.entries;
        break;
      case "submitted":
        text = state.onBoard ? lines.submitted : lines.pushedOut;
        entries = state.entries;
        highlight = state.entryId;
        break;
      case "submit-error":
        entries = state.entries;
        if (state.failure === "network" || state.failure === "rate_limited") {
          showForm = locked = true;
          if (state.payload) input.value = state.payload.name;
          retryText = "重新送出";
          retryWait = Math.max(0, state.retryAt - Date.now());
          text =
            state.failure === "network"
              ? lines.submitError
              : lines.rateLimited(Math.ceil(retryWait / 1000) || 1);
        } else text = state.failure === "conflict" ? lines.conflict : lines.invalid;
        break;
    }
    line.textContent = text;
    detail.textContent = sub;
    detail.hidden = !sub;
    const focused = form.contains(document.activeElement);
    form.hidden = !showForm;
    input.readOnly = locked;
    send.hidden = !!retryText;
    send.disabled = state.status === "submitting";
    send.setAttribute("aria-busy", String(state.status === "submitting"));
    send.textContent = state.status === "submitting" ? "送出中…" : "送出";
    fieldError.textContent = error;
    fieldError.hidden = !error;
    input.setAttribute("aria-invalid", String(!!error));
    retry.hidden = !retryText;
    retry.textContent = retryText;
    retry.disabled = retryWait > 0;
    if (retryWait > 0) timer = window.setTimeout(() => render(session.state), Math.min(retryWait, 1000));
    if (focused && form.hidden && !retry.hidden) retry.focus();
    wrap.hidden = !entries;
    list.hidden = !entries?.length;
    empty.hidden = !entries || entries.length > 0;
    if (entries) renderList(list, entries, highlight);
    if (highlight) list.querySelector(".mine")?.scrollIntoView({ block: "nearest" });
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    void session.submit(input.value);
  });
  retry.addEventListener("click", () => {
    if (session.state.status === "load-error") void session.load();
    else void session.submit(input.value);
  });
  render(session.state);
  return { render, dispose: () => clearTimeout(timer) };
}

// 排行榜介面：首頁 dialog 與結算區內嵌榜單。名字一律以 textContent 呈現。
import { LeaderboardError, type Entry, type LeaderboardClient } from "../leaderboard/client";
import { invitation, lines } from "../leaderboard/rules";
import type { ResultSession, SessionState } from "../leaderboard/session";

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text = "",
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}

/** 木牌榜單列表；highlight 為本局成功紀錄的 id。 */
export function renderList(list: HTMLOListElement, entries: readonly Entry[], highlight = "") {
  list.replaceChildren(
    ...entries.map((e) => {
      const row = node("li", "board-row");
      if (e.rank <= 3) row.classList.add(`top${e.rank}`);
      const badge = node("span", "board-rank", String(e.rank));
      badge.setAttribute("aria-label", `第 ${e.rank} 名`);
      const name = node("span", "board-name", e.name);
      name.title = e.name;
      const score = node("span", "board-score", String(e.score));
      score.setAttribute("aria-label", `${e.score} 分`);
      row.append(badge, name, score);
      if (e.id === highlight) {
        row.classList.add("mine");
        row.setAttribute("aria-current", "true");
        name.append(node("em", "board-you", "你"));
      }
      return row;
    }),
  );
}

function sign(titleId: string) {
  const wrap = node("div", "board-sign");
  const head = node("div", "board-head");
  const eyebrow = node("span", "board-eyebrow", "HALL OF HEROES");
  const title = node("h3", "board-title", "歷史排行 TOP 10");
  title.id = titleId;
  head.append(eyebrow, title);
  const list = node("ol", "board-list");
  list.setAttribute("aria-labelledby", titleId);
  const empty = node("p", "board-empty", lines.emptyBoard);
  wrap.append(head, list, empty);
  return { wrap, head, list, empty };
}

// ---------------------------------------------------------------------------
// 首頁 dialog

export function setupHomeLeaderboard(
  trigger: HTMLButtonElement,
  getClient: () => LeaderboardClient | null,
) {
  const dialog = node("dialog", "board-dialog");
  dialog.setAttribute("aria-labelledby", "board-dialog-title");
  const { wrap, head, list, empty } = sign("board-dialog-title");
  const close = node("button", "board-close", "✕");
  close.type = "button";
  close.setAttribute("aria-label", "關閉排行榜");
  head.append(close);
  const status = node("p", "board-line");
  status.setAttribute("role", "status");
  const retry = node("button", "board-retry", "重新載入");
  retry.type = "button";
  wrap.insertBefore(status, list);
  wrap.append(retry);
  dialog.append(wrap);
  document.body.append(dialog);

  let controller: AbortController | null = null;
  const view = (state: "loading" | "ready" | "error" | "unconfigured", entries: Entry[] = []) => {
    status.textContent =
      state === "loading" ? lines.loading
      : state === "error" ? lines.loadError
      : state === "unconfigured" ? lines.unconfiguredHome
      : "";
    status.hidden = state === "ready";
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
  const section = node("section", "board");
  section.setAttribute("aria-label", "森林英雄榜");
  const line = node("p", "board-line");
  line.setAttribute("role", "status");
  const detail = node("p", "board-detail");

  const form = node("form", "board-form");
  form.noValidate = true;
  const label = node("label", "board-label", "留下大名");
  label.htmlFor = "board-name";
  const note = node("span", "board-note", "名字會公開顯示在排行榜，可留白");
  label.append(note);
  const row = node("div", "board-input-row");
  const input = node("input", "board-input");
  Object.assign(input, {
    id: "board-name",
    name: "name",
    type: "text",
    autocomplete: "nickname",
    placeholder: "不知名的勇者",
    enterKeyHint: "send",
    spellcheck: false,
  });
  input.setAttribute("aria-describedby", "board-name-error");
  const send = node("button", "board-submit", "送出");
  send.type = "submit";
  row.append(input, send);
  const fieldError = node("p", "board-field-error");
  fieldError.id = "board-name-error";
  fieldError.setAttribute("role", "alert");
  form.append(label, row, fieldError);

  const retry = node("button", "board-retry");
  retry.type = "button";
  const { wrap, list, empty } = sign("board-result-title");
  section.append(line, detail, form, retry, wrap);
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
        retryText = "重新載入榜單";
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

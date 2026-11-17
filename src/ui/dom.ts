// 共用 DOM factory 與 UI 元件。元件回傳原生元素，狀態以屬性直接更新。

type Child = Node | string;
type Props = {
  className?: string;
  text?: string;
  id?: string;
  attrs?: Record<string, string>;
};

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.className) el.className = props.className;
  if (props.id) el.id = props.id;
  if (props.text) el.textContent = props.text;
  for (const [k, v] of Object.entries(props.attrs ?? {})) el.setAttribute(k, v);
  if (children.length) el.append(...children);
  return el;
}

export type ButtonVariant = "primary" | "secondary" | "ghost" | "icon";
export type ButtonSize = "sm" | "md" | "lg";
type ButtonBase = { size?: ButtonSize; type?: "button" | "submit"; id?: string };
// 圖示按鈕的文字是符號，必須另有無障礙名稱。
export type ButtonOptions = ButtonBase &
  (
    | { variant: "primary" | "secondary" | "ghost"; label: string; ariaLabel?: string }
    | { variant: "icon"; label: string; ariaLabel: string }
  );

export function button(o: ButtonOptions): HTMLButtonElement {
  const el = h("button", {
    className: `btn btn--${o.variant} btn--${o.size ?? "md"}`,
    id: o.id,
    text: o.label,
  });
  el.type = o.type ?? "button";
  if (o.ariaLabel) el.setAttribute("aria-label", o.ariaLabel);
  return el;
}

export function surface<K extends keyof HTMLElementTagNameMap = "div">(
  o: { tag?: K; tone?: "light" | "dark"; className?: string; id?: string } = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const tone = o.tone === "dark" ? " surface--dark" : "";
  return h((o.tag ?? "div") as K, {
    className: `surface${tone}${o.className ? ` ${o.className}` : ""}`,
    id: o.id,
  }, children);
}

// 一行狀態或錯誤提示；live 決定螢幕閱讀器是否主動朗讀。
export function status(
  o: { tone?: "normal" | "error"; live?: "polite" | "assertive"; className?: string; id?: string } = {},
): HTMLParagraphElement {
  const tone = o.tone === "error" ? " status--error" : "";
  const el = h("p", {
    className: `status${tone}${o.className ? ` ${o.className}` : ""}`,
    id: o.id,
  });
  if (o.live) el.setAttribute("role", o.live === "assertive" ? "alert" : "status");
  return el;
}

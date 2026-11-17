import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { button, h, status, surface } from "../src/ui/dom";

// 最小 DOM stub：只實作 dom.ts 用到的介面。
class FakeElement {
  className = "";
  id = "";
  textContent = "";
  type = "";
  children: unknown[] = [];
  attrs: Record<string, string> = {};
  constructor(readonly tagName: string) {}
  setAttribute(k: string, v: string) {
    this.attrs[k] = v;
  }
  getAttribute(k: string) {
    return this.attrs[k] ?? null;
  }
  append(...c: unknown[]) {
    this.children.push(...c);
  }
}
beforeEach(() =>
  vi.stubGlobal("document", { createElement: (t: string) => new FakeElement(t) }),
);
afterEach(() => vi.unstubAllGlobals());

it("builds elements with class, id, text, attributes and children", () => {
  const child = h("span", { text: "a" });
  const el = h("div", { className: "x", id: "y", text: "t", attrs: { "data-k": "v" } }, [child]);
  expect(el.className).toBe("x");
  expect(el.id).toBe("y");
  expect(el.textContent).toBe("t");
  expect(el.getAttribute("data-k")).toBe("v");
  expect((el as unknown as FakeElement).children).toEqual([child]);
});

it("button maps variant and size to classes and defaults to type=button", () => {
  const b = button({ variant: "primary", size: "lg", label: "開始" });
  expect(b.className).toBe("btn btn--primary btn--lg");
  expect(b.type).toBe("button");
  expect(b.textContent).toBe("開始");
  expect(b.getAttribute("aria-label")).toBeNull();
  expect(button({ variant: "ghost", label: "x" }).className).toBe("btn btn--ghost btn--md");
  expect(button({ variant: "primary", label: "送出", type: "submit" }).type).toBe("submit");
});

it("icon button carries an accessible name", () => {
  const b = button({ variant: "icon", label: "♫", ariaLabel: "靜音" });
  expect(b.className).toContain("btn--icon");
  expect(b.getAttribute("aria-label")).toBe("靜音");
  // @ts-expect-error 圖示按鈕缺少 ariaLabel 必須是型別錯誤
  button({ variant: "icon", label: "✕" });
});

it("surface and status expose tone and live region roles", () => {
  expect(surface().className).toBe("surface");
  expect(surface({ tone: "dark", className: "card" }).className).toBe("surface surface--dark card");
  expect(status().getAttribute("role")).toBeNull();
  expect(status({ live: "polite" }).getAttribute("role")).toBe("status");
  const err = status({ tone: "error", live: "assertive" });
  expect(err.className).toBe("status status--error");
  expect(err.getAttribute("role")).toBe("alert");
});

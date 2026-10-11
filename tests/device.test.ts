import { describe, expect, it, vi } from "vitest";
import { deviceSupport, UNSUPPORTED_QUERY, type MatchMedia } from "../src/device";

type Features = { pointer: string; hover: string; "any-pointer": string };

// 依裝置特徵求值 `(feature: value) and ...` 形式的 media query。
function fakeMatchMedia(initial: Features) {
  let features = initial;
  const queries: { query: string; listeners: Set<() => void> }[] = [];
  const matches = (query: string) =>
    query
      .split(" and ")
      .map((c) => c.replace(/[()]/g, "").split(":").map((s) => s.trim()))
      .every(([name, value]) => features[name as keyof Features] === value);
  const matchMedia: MatchMedia = (query) => {
    const entry = { query, listeners: new Set<() => void>() };
    queries.push(entry);
    return {
      get matches() {
        return matches(query);
      },
      addEventListener: (_: string, l: () => void) => entry.listeners.add(l),
      removeEventListener: (_: string, l: () => void) => entry.listeners.delete(l),
    } as unknown as MediaQueryList;
  };
  return {
    matchMedia,
    queries,
    change(next: Features) {
      features = next;
      for (const q of queries) for (const l of q.listeners) l();
    },
  };
}

const phone: Features = { pointer: "coarse", hover: "none", "any-pointer": "coarse" };
const desktop: Features = { pointer: "fine", hover: "hover", "any-pointer": "fine" };
const touchLaptop: Features = { pointer: "fine", hover: "hover", "any-pointer": "coarse" };

describe("device support", () => {
  it("queries the primary pointer and hover capability only", () => {
    const fake = fakeMatchMedia(desktop);
    deviceSupport(fake.matchMedia);
    expect(fake.queries.map((q) => q.query)).toEqual([UNSUPPORTED_QUERY]);
    expect(UNSUPPORTED_QUERY).toBe("(pointer: coarse) and (hover: none)");
  });

  it.each([
    ["phone or tablet (coarse, no hover)", phone, false],
    ["desktop with mouse", desktop, true],
    ["touchscreen laptop with trackpad", touchLaptop, true],
    ["coarse pointer that can still hover", { pointer: "coarse", hover: "hover", "any-pointer": "coarse" }, true],
  ] as const)("%s → supported=%s", (_l, features, supported) => {
    expect(deviceSupport(fakeMatchMedia(features).matchMedia).supported).toBe(supported);
  });

  it("reports changes of the primary input and can unsubscribe", () => {
    const fake = fakeMatchMedia(phone);
    const device = deviceSupport(fake.matchMedia);
    const listener = vi.fn();
    const stop = device.onChange(listener);
    fake.change(touchLaptop); // 平板接上觸控板
    expect(listener).toHaveBeenLastCalledWith(true);
    expect(device.supported).toBe(true);
    fake.change(phone);
    expect(listener).toHaveBeenLastCalledWith(false);
    stop();
    fake.change(desktop);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

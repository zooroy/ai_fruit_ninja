import { describe, expect, it, vi } from "vitest";
import {
  LeaderboardError,
  type Accepted,
  type Entry,
  type LeaderboardClient,
  type SubmitPayload,
} from "../src/leaderboard/client";
import { ResultSession, type SessionState, type Snapshot } from "../src/leaderboard/session";
import { newSubmissionId } from "../src/leaderboard/id";

const board = (scores: number[]): Entry[] =>
  scores.map((score, i) => ({ rank: i + 1, id: `e${i}`, name: `p${i}`, score }));
const snapshot: Snapshot = Object.freeze({
  submissionId: "3f2b8e4a-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
  score: 120,
  fruits: 12,
  bombs: 0,
  maxCombo: 3,
});

function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}

function fakeClient() {
  const lists: ReturnType<typeof deferred<Entry[]>>[] = [];
  const submits: { payload: SubmitPayload; d: ReturnType<typeof deferred<Accepted>> }[] = [];
  const client: LeaderboardClient = {
    list: vi.fn(() => {
      const d = deferred<Entry[]>();
      lists.push(d);
      return d.promise;
    }),
    submit: vi.fn((payload: SubmitPayload) => {
      const d = deferred<Accepted>();
      submits.push({ payload, d });
      return d.promise;
    }),
  };
  return { client, lists, submits };
}

async function loaded(entries: Entry[], now = () => 0) {
  const f = fakeClient();
  const states: SessionState[] = [];
  const session = new ResultSession(snapshot, f.client, (s) => states.push(s), now);
  const loading = session.load();
  f.lists[0].resolve(entries);
  await loading;
  return { ...f, session, states };
}
const tick = () => new Promise((r) => setTimeout(r));

describe("result session", () => {
  it("is unconfigured without a client and never offers submission", async () => {
    const session = new ResultSession(snapshot, null);
    expect(session.state.status).toBe("unconfigured");
    await session.load();
    await session.submit("x");
    expect(session.state.status).toBe("unconfigured");
  });

  it("loads into qualified or unqualified ready states", async () => {
    expect((await loaded(board([200, 100]))).session.state).toMatchObject({
      status: "ready",
      qualified: true,
    });
    const full = board([500, 400, 300, 200, 190, 180, 170, 160, 150, 140]);
    expect((await loaded(full)).session.state).toMatchObject({ status: "ready", qualified: false });
  });

  it("does not treat a failed load as an empty board, and can retry", async () => {
    const f = fakeClient();
    const session = new ResultSession(snapshot, f.client);
    const first = session.load();
    f.lists[0].reject(new LeaderboardError("network"));
    await first;
    expect(session.state.status).toBe("load-error");
    await session.submit("x");
    expect(f.client.submit).not.toHaveBeenCalled();
    const retry = session.load();
    f.lists[1].resolve([]);
    await retry;
    expect(session.state).toMatchObject({ status: "ready", qualified: true });
  });

  it("submits a frozen snapshot with the normalized name, ignoring double clicks", async () => {
    const { session, submits } = await loaded([]);
    void session.submit("  ");
    void session.submit("second click");
    expect(submits).toHaveLength(1);
    expect(submits[0].payload).toEqual({ ...snapshot, name: "不知名的勇者" });
    expect(Object.isFrozen(submits[0].payload)).toBe(true);
    expect(session.state.status).toBe("submitting");
  });

  it("disables further submission after success and highlights the entry", async () => {
    const { session, submits } = await loaded([]);
    const p = session.submit("阿明");
    const entries = [{ rank: 1, id: "mine", name: "阿明", score: 120 }];
    submits[0].d.resolve({ created: true, entryId: "mine", entries });
    await p;
    expect(session.state).toEqual({ status: "submitted", entries, entryId: "mine", onBoard: true });
    await session.submit("again");
    expect(submits).toHaveLength(1);
  });

  it("reports a saved record that already fell off the board", async () => {
    const { session, submits } = await loaded([]);
    const p = session.submit("阿明");
    submits[0].d.resolve({ created: false, entryId: "mine", entries: board([900]) });
    await p;
    expect(session.state).toMatchObject({ status: "submitted", onBoard: false });
  });

  it("validates names locally and keeps the form editable", async () => {
    const { session, submits } = await loaded([]);
    await session.submit("一".repeat(21));
    expect(submits).toHaveLength(0);
    expect(session.state).toMatchObject({ status: "ready", qualified: true, fieldError: "名字最多 20 個字。" });
    void session.submit("一".repeat(20));
    expect(submits).toHaveLength(1);
  });

  it("retries an unknown result with the original payload, ignoring a new name", async () => {
    const { session, submits } = await loaded([]);
    const p = session.submit("原名");
    submits[0].d.reject(new LeaderboardError("timeout"));
    await p;
    expect(session.state).toMatchObject({ status: "submit-error", failure: "network" });
    expect((session.state as { payload: SubmitPayload }).payload.name).toBe("原名");
    void session.submit("新名字");
    expect(submits).toHaveLength(2);
    expect(submits[1].payload).toBe(submits[0].payload);
  });

  it("allows correcting the name only after a definite 400", async () => {
    const { session, submits } = await loaded([]);
    const p = session.submit("名字");
    submits[0].d.reject(new LeaderboardError("rejected", 400, "invalid_name"));
    await p;
    expect(session.state).toMatchObject({ status: "ready", fieldError: expect.stringContaining("20") });
    void session.submit("改好的名字");
    expect(submits[1].payload.name).toBe("改好的名字");
    expect(submits[1].payload.submissionId).toBe(snapshot.submissionId);
  });

  it("updates the board and hides the form when qualification was lost", async () => {
    const { session, submits } = await loaded(board([500, 400, 300, 200, 190, 180, 170, 160, 150]));
    const p = session.submit("阿明");
    const latest = board([500, 400, 300, 200, 190, 180, 170, 160, 150, 130]);
    submits[0].d.reject(new LeaderboardError("rejected", 409, "not_qualified", latest));
    await p;
    expect(session.state).toMatchObject({
      status: "ready",
      lost: true,
      qualified: false,
      entries: latest,
      standing: { kind: "short", tieGap: 10, beatGap: 15 },
    });
    await session.submit("again");
    expect(submits).toHaveLength(1);
  });

  it("stops after a submission conflict", async () => {
    const { session, submits } = await loaded([]);
    const p = session.submit("阿明");
    submits[0].d.reject(new LeaderboardError("rejected", 409, "submission_conflict", []));
    await p;
    expect(session.state).toMatchObject({ status: "submit-error", failure: "conflict" });
    await session.submit("阿明");
    expect(submits).toHaveLength(1);
  });

  it("waits out Retry-After before resubmitting the same payload", async () => {
    let now = 1000;
    const { session, submits } = await loaded([], () => now);
    const p = session.submit("阿明");
    submits[0].d.reject(new LeaderboardError("rejected", 429, "rate_limited", null, 30));
    await p;
    expect(session.state).toMatchObject({ status: "submit-error", failure: "rate_limited", retryAt: 31000 });
    await session.submit("阿明");
    expect(submits).toHaveLength(1);
    now = 31000;
    void session.submit("其他");
    expect(submits).toHaveLength(2);
    expect(submits[1].payload).toBe(submits[0].payload);
  });

  it("ignores late responses after dispose (replay or return home)", async () => {
    const f = fakeClient();
    const onChange = vi.fn();
    const old = new ResultSession(snapshot, f.client, onChange);
    void old.load();
    old.dispose();
    f.lists[0].resolve([]);
    await tick();
    expect(onChange).toHaveBeenCalledTimes(1); // 只有最初的 loading
    expect(old.state.status).toBe("loading");

    const { session, submits, states } = await loaded([]);
    void session.submit("阿明");
    const before = states.length;
    session.dispose();
    submits[0].d.resolve({ created: true, entryId: "x", entries: [] });
    await tick();
    expect(states).toHaveLength(before);
    expect(session.state.status).toBe("submitting");
  });

  it("aborts in-flight requests on dispose", async () => {
    const signals: AbortSignal[] = [];
    const client: LeaderboardClient = {
      list: (signal) => {
        signals.push(signal!);
        return new Promise(() => {});
      },
      submit: () => new Promise(() => {}),
    };
    const session = new ResultSession(snapshot, client);
    void session.load();
    session.dispose();
    expect(signals[0].aborted).toBe(true);
  });

  it("gives each round a distinct submission id", () => {
    const ids = new Set(Array.from({ length: 50 }, newSubmissionId));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

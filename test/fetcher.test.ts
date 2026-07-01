import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { fetchText, FetchError, collectSources } from "../lib/fetcher";
import type { NewsSource, RawItem } from "../lib/sources/types";

// 造一个「够用」的 Response 假体：fetcher 只读 ok / status / text()，其余不碰。
function okResponse(body: string): Response {
  return { ok: true, status: 200, text: async () => body } as unknown as Response;
}
function statusResponse(status: number): Response {
  return { ok: false, status, text: async () => "" } as unknown as Response;
}

// 取全局 fetch 的 mock 引用（每个用例在 beforeEach 里用 stubGlobal 装好）。
function fetchMock() {
  return globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
}

describe("fetchText", () => {
  beforeEach(() => {
    // fake timers 跳过指数退避的 setTimeout 等待，测试不真的睡 1s/2s/4s。
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("一次成功 → 返回正文，不重试", async () => {
    fetchMock().mockResolvedValueOnce(okResponse("hello world"));

    // 成功路径没有退避 sleep，无需推进定时器。
    const result = await fetchText("https://example.test/feed");

    expect(result).toBe("hello world");
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it("先 503 再成功 → 重试后返回内容", async () => {
    fetchMock()
      .mockResolvedValueOnce(statusResponse(503))
      .mockResolvedValueOnce(okResponse("recovered"));

    const promise = fetchText("https://example.test/feed", {
      retries: 3,
      baseDelayMs: 1000,
    });
    // 推进 fake timers，让退避 sleep 结算、进入第二次尝试。
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toBe("recovered");
    expect(fetchMock()).toHaveBeenCalledTimes(2);
  });

  it("429 也算可重试 → 重试后成功", async () => {
    fetchMock()
      .mockResolvedValueOnce(statusResponse(429))
      .mockResolvedValueOnce(okResponse("ok after 429"));

    const promise = fetchText("https://example.test/feed", {
      retries: 3,
      baseDelayMs: 1000,
    });
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toBe("ok after 429");
    expect(fetchMock()).toHaveBeenCalledTimes(2);
  });

  it("404 → 立刻抛 FetchError，不重试", async () => {
    fetchMock().mockResolvedValue(statusResponse(404));

    // 非 429/5xx 不可重试，第一次就放弃，attempts 应为 1。
    await expect(
      fetchText("https://example.test/missing", { retries: 3, baseDelayMs: 1000 }),
    ).rejects.toMatchObject({ name: "FetchError", attempts: 1 });

    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it("一直 500 到上限 → 抛 FetchError，尝试次数为 retries+1", async () => {
    fetchMock().mockResolvedValue(statusResponse(500));

    const promise = fetchText("https://example.test/feed", {
      retries: 2,
      baseDelayMs: 1000,
    });
    // 先挂上断言（吸收 rejection），再推进定时器跑完全部重试。
    const assertion = expect(promise).rejects.toMatchObject({
      name: "FetchError",
      attempts: 3,
    });
    await vi.runAllTimersAsync();
    await assertion;

    // retries:2 → 合计 3 次请求。
    expect(fetchMock()).toHaveBeenCalledTimes(3);
  });
});

describe("collectSources", () => {
  const sampleItem: RawItem = {
    sourceId: "openai",
    title: "Sample",
    link: "https://example.test/post",
    publishedAt: "2026-07-01T00:00:00.000Z",
    content: "body",
  };

  it("单源失败被跳过，其余源正常，整体不抛", async () => {
    const good: NewsSource = {
      id: "openai",
      label: "OpenAI",
      fetch: async () => [sampleItem],
    };
    const bad: NewsSource = {
      id: "anthropic",
      label: "Anthropic",
      fetch: async () => {
        throw new Error("boom");
      },
    };

    // 关键：整个函数 resolve 而非 reject。
    const results = await collectSources([good, bad]);

    expect(results).toHaveLength(2);

    const okResult = results.find((r) => r.sourceId === "openai");
    expect(okResult?.status).toBe("ok");
    expect(okResult?.items).toEqual([sampleItem]);

    const errResult = results.find((r) => r.sourceId === "anthropic");
    expect(errResult?.status).toBe("error");
    expect(errResult?.items).toEqual([]);
    expect(errResult?.error).toBe("boom");
  });
});

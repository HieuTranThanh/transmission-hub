import { describe, it, expect, vi, beforeEach } from "vitest";
import { cached, invalidateCache } from "./query-cache";

beforeEach(() => {
  invalidateCache();
});

describe("cached", () => {
  it("calls fetcher on first request", async () => {
    const fetcher = vi.fn().mockResolvedValue("data");
    const result = await cached("key1", fetcher);
    expect(result).toBe("data");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("returns cached data on subsequent calls", async () => {
    const fetcher = vi.fn().mockResolvedValue("data");
    await cached("key2", fetcher);
    const result = await cached("key2", fetcher);
    expect(result).toBe("data");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("deduplicates concurrent requests", async () => {
    let resolvePromise: (v: string) => void;
    const fetcher = vi.fn().mockReturnValue(
      new Promise<string>((resolve) => {
        resolvePromise = resolve;
      })
    );
    const p1 = cached("key3", fetcher);
    const p2 = cached("key3", fetcher);
    resolvePromise!("result");
    expect(await p1).toBe("result");
    expect(await p2).toBe("result");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not cache failed requests", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("fail")).mockResolvedValue("ok");
    await expect(cached("key4", fetcher)).rejects.toThrow("fail");
    const result = await cached("key4", fetcher);
    expect(result).toBe("ok");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("invalidateCache", () => {
  it("clears all cached entries", async () => {
    const fetcher = vi.fn().mockResolvedValue("v1");
    await cached("key5", fetcher);
    invalidateCache();
    fetcher.mockResolvedValue("v2");
    const result = await cached("key5", fetcher);
    expect(result).toBe("v2");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

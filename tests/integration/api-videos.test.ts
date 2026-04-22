import { describe, expect, it } from "vitest";

describe("GET /api/videos", () => {
  it("responds with the placeholder payload", async () => {
    const { GET } = await import("@/app/api/videos/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: "Videos API route" });
  });
});

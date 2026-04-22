import { describe, expect, it } from "vitest";
import { toCsv, videosToCsv, VIDEO_CSV_HEADERS } from "@/lib/csv";
import { YouTubeVideo } from "@/types/youtube";

function video(overrides: Partial<YouTubeVideo> = {}): YouTubeVideo {
  return {
    id: "vid1",
    title: "Hello world",
    description: "",
    publishedAt: "2025-01-01T00:00:00Z",
    duration: "PT5M",
    viewCount: 1000,
    likeCount: 50,
    commentCount: 10,
    ...overrides,
  };
}

describe("toCsv", () => {
  it("prepends a UTF-8 BOM and joins rows with CRLF", () => {
    const csv = toCsv(["a", "b"], [["1", "2"], ["3", "4"]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe("a,b\r\n1,2\r\n3,4");
  });

  it("escapes commas, quotes, and newlines", () => {
    const csv = toCsv(["x"], [["a,b"], ['quoted "value"'], ["line1\nline2"], ["carriage\rfeed"]]);
    const body = csv.slice(1);
    expect(body).toContain('"a,b"');
    expect(body).toContain('"quoted ""value"""');
    expect(body).toContain('"line1\nline2"');
    expect(body).toContain('"carriage\rfeed"');
  });

  it("renders null and undefined as empty cells", () => {
    const csv = toCsv(["a", "b", "c"], [[null, undefined, "x"]]);
    expect(csv.slice(1)).toBe("a,b,c\r\n,,x");
  });

  it("stringifies numbers and booleans without quoting them", () => {
    const csv = toCsv(["n", "b"], [[42, true], [3.14, false]]);
    expect(csv.slice(1)).toBe("n,b\r\n42,true\r\n3.14,false");
  });

  it("emits headers only when there are no data rows", () => {
    const csv = toCsv(["only", "header"], []);
    expect(csv.slice(1)).toBe("only,header");
  });
});

describe("videosToCsv", () => {
  it("includes the canonical header row in the documented order", () => {
    const csv = videosToCsv([]);
    const headerRow = csv.slice(1).split("\r\n")[0];
    expect(headerRow).toBe(VIDEO_CSV_HEADERS.join(","));
  });

  it("computes engagement percentage and renders a watch URL", () => {
    const csv = videosToCsv([video({ id: "abc", viewCount: 1000, likeCount: 90, commentCount: 10 })]);
    const dataRow = csv.slice(1).split("\r\n")[1];
    // (90 + 10) / 1000 * 100 = 10
    expect(dataRow).toContain(",10,");
    expect(dataRow).toContain("https://www.youtube.com/watch?v=abc");
  });

  it("avoids divide-by-zero when viewCount is 0 (engagement reported against floor of 1)", () => {
    const csv = videosToCsv([video({ viewCount: 0, likeCount: 0, commentCount: 0 })]);
    const dataRow = csv.slice(1).split("\r\n")[1];
    expect(dataRow.split(",").pop()).toContain("https://www.youtube.com/watch?v=");
    expect(dataRow).toContain(",0,"); // engagementRatePct rendered as 0
  });

  it("escapes commas and quotes inside titles", () => {
    const csv = videosToCsv([video({ id: "v", title: 'Hello, "world"' })]);
    expect(csv).toContain('"Hello, ""world"""');
  });
});

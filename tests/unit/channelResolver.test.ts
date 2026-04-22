import { describe, expect, it } from "vitest";
import { parseChannelInput } from "@/lib/channelResolver";

describe("parseChannelInput", () => {
  it("returns empty for empty or whitespace input", () => {
    expect(parseChannelInput("")).toEqual({});
    expect(parseChannelInput("   ")).toEqual({});
  });

  it("extracts a handle from @handle", () => {
    expect(parseChannelInput("@LearnwithManoj")).toEqual({ handle: "LearnwithManoj" });
  });

  it("extracts a handle from a youtube.com/@handle URL", () => {
    expect(parseChannelInput("https://www.youtube.com/@LearnwithManoj")).toEqual({
      handle: "LearnwithManoj",
    });
    expect(parseChannelInput("https://www.youtube.com/@LearnwithManoj/")).toEqual({
      handle: "LearnwithManoj",
    });
  });

  it("extracts channelId from /channel/UC... URLs", () => {
    expect(
      parseChannelInput("https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv")
    ).toEqual({ channelId: "UCabcdefghijklmnopqrstuv" });
  });

  it("recognizes a raw UC… channel id", () => {
    expect(parseChannelInput("UCabcdefghijklmnopqrstuv")).toEqual({
      channelId: "UCabcdefghijklmnopqrstuv",
    });
  });

  it("treats a bare identifier as a handle and strips @", () => {
    expect(parseChannelInput("LearnwithManoj")).toEqual({ handle: "LearnwithManoj" });
    expect(parseChannelInput("learn.with-manoj")).toEqual({ handle: "learn.with-manoj" });
  });

  it("returns empty for input with no channelId/handle pattern", () => {
    expect(parseChannelInput("https://www.youtube.com/watch?v=abc")).toEqual({});
    expect(parseChannelInput("hello world")).toEqual({});
    expect(parseChannelInput("???")).toEqual({});
  });
});

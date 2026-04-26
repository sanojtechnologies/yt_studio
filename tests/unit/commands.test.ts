import { describe, expect, it } from "vitest";
import {
  buildChannelCommands,
  Command,
  filterCommands,
  scoreCommand,
  STATIC_COMMANDS,
} from "@/lib/commands";

const sample: Command = {
  id: "sample",
  title: "Compare channels",
  group: "Navigate",
  href: "/compare",
  keywords: ["versus", "diff"],
};

describe("scoreCommand", () => {
  it("returns 0 for an empty query (everything matches)", () => {
    expect(scoreCommand(sample, "")).toBe(0);
    expect(scoreCommand(sample, "   ")).toBe(0);
  });

  it("ranks title prefixes ahead of word starts ahead of substrings", () => {
    expect(scoreCommand(sample, "compare")).toBe(0);
    expect(scoreCommand(sample, "channels")).toBe(1);
    expect(scoreCommand(sample, "ann")).toBe(2); // substring of 'channels'
  });

  it("falls back to fuzzy in-order matching as a last resort", () => {
    expect(scoreCommand(sample, "cmprcl")).toBe(3);
  });

  it("matches via keywords when the title doesn't fit", () => {
    expect(scoreCommand(sample, "versus")).toBe(1); // word-start of keyword
    expect(scoreCommand(sample, "if")).toBe(2);     // substring of 'diff'
  });

  it("returns +Infinity when nothing in the haystack matches", () => {
    expect(scoreCommand(sample, "zzz")).toBe(Number.POSITIVE_INFINITY);
  });

  it("scores commands that omit the optional keywords field", () => {
    const bare: Command = { id: "bare", title: "Settings", group: "Settings" };
    expect(scoreCommand(bare, "set")).toBe(0); // prefix on title
    expect(scoreCommand(bare, "ngs")).toBe(2); // substring fallback, no keywords
    expect(scoreCommand(bare, "zzz")).toBe(Number.POSITIVE_INFINITY);
  });

  it("exits the fuzzy loop early when the query is exhausted mid-title", () => {
    // 'cc' is not a substring of 'Compare channels' but is an in-order
    // subsequence (the C of Compare and the C of channels); covers the
    // `i === q.length` short-circuit before the loop scans the rest of the
    // title.
    expect(scoreCommand(sample, "cc")).toBe(3);
  });
});

describe("filterCommands", () => {
  it("returns commands sorted best-first, then alphabetically on ties", () => {
    const ranked = filterCommands(STATIC_COMMANDS, "studio");
    expect(ranked.length).toBeGreaterThan(0);
    // The literal 'Studio' word-start beats every fuzzy-only match.
    expect(ranked[0].title.toLowerCase()).toContain("studio");
    // Sorted ascending by score.
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i].score).toBeGreaterThanOrEqual(ranked[i - 1].score);
    }
  });

  it("respects the limit parameter", () => {
    expect(filterCommands(STATIC_COMMANDS, "", 3)).toHaveLength(3);
  });

  it("filters out the no-match sentinel entries", () => {
    expect(filterCommands(STATIC_COMMANDS, "zzz-no-such-thing")).toEqual([]);
  });

  it("surfaces the Getting started guide for help-style queries", () => {
    // The palette is the primary discovery surface for beginners who don't
    // know the URL. This pins both the href and that the command is findable
    // via common help terms.
    const entry = STATIC_COMMANDS.find((c) => c.id === "nav.getting-started");
    expect(entry?.href).toBe("/getting-started");

    for (const query of ["help", "guide", "how", "tutorial", "onboarding"]) {
      const ranked = filterCommands(STATIC_COMMANDS, query);
      expect(ranked.map((c) => c.id)).toContain("nav.getting-started");
    }
  });

  it("surfaces the donate command with supportive keywords", () => {
    const entry = STATIC_COMMANDS.find((c) => c.id === "settings.donate");
    expect(entry?.actionId).toBe("open-donate");
    expect(entry?.group).toBe("Settings");
    expect(entry?.hint).toBe("PayPal");
    for (const query of ["donate", "tip", "paypal", "support", "contribute"]) {
      const ranked = filterCommands(STATIC_COMMANDS, query);
      expect(ranked.map((c) => c.id)).toContain("settings.donate");
    }
  });

  it("surfaces the four new Phase 4 studio commands", () => {
    const ids = STATIC_COMMANDS.map((c) => c.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "studio.script",
        "studio.ab-title",
        "studio.ab-thumbnail",
        "compare.gap",
      ])
    );
    expect(filterCommands(STATIC_COMMANDS, "script").map((c) => c.id)).toContain(
      "studio.script"
    );
    expect(filterCommands(STATIC_COMMANDS, "a/b").map((c) => c.id)).toEqual(
      expect.arrayContaining(["studio.ab-title", "studio.ab-thumbnail"])
    );
    expect(filterCommands(STATIC_COMMANDS, "gap").map((c) => c.id)).toContain(
      "compare.gap"
    );
  });

  it("surfaces the pre-publish analyzer command for draft workflows", () => {
    const entry = STATIC_COMMANDS.find((c) => c.id === "studio.prepublish");
    expect(entry?.href).toBe("/studio/prepublish");
    for (const query of ["draft", "unpublished", "prepublish"]) {
      expect(filterCommands(STATIC_COMMANDS, query).map((c) => c.id)).toContain("studio.prepublish");
    }
  });

  it("surfaces the video ideate command for niche trend workflows", () => {
    const entry = STATIC_COMMANDS.find((c) => c.id === "studio.ideate");
    expect(entry?.href).toBe("/studio/ideate");
    for (const query of ["ideate", "idea", "niche", "trending"]) {
      expect(filterCommands(STATIC_COMMANDS, query).map((c) => c.id)).toContain("studio.ideate");
    }
  });

  it("breaks score ties alphabetically", () => {
    const fixtures: Command[] = [
      { id: "a", title: "Banana", group: "Navigate" },
      { id: "b", title: "Apple", group: "Navigate" },
    ];
    const ranked = filterCommands(fixtures, "");
    expect(ranked.map((c) => c.title)).toEqual(["Apple", "Banana"]);
  });
});

describe("buildChannelCommands", () => {
  it("ignores entries without a channelId", () => {
    expect(
      buildChannelCommands([
        { channelId: "" },
        { channelId: "UC1", channelTitle: "Ok" },
      ] as never)
    ).toEqual([
      {
        id: "channel:UC1",
        title: "Ok",
        group: "Channels",
        href: "/dashboard/UC1",
        keywords: ["UC1"],
        hint: "UC1",
      },
    ]);
  });

  it("falls back to the channelId when no title is available", () => {
    expect(buildChannelCommands([{ channelId: "UC2" }])[0].title).toBe("UC2");
  });

  it("trims whitespace-only titles to the channelId fallback", () => {
    expect(
      buildChannelCommands([{ channelId: "UC3", channelTitle: "   " }])[0].title
    ).toBe("UC3");
  });
});

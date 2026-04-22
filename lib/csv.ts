import { YouTubeVideo } from "@/types/youtube";

export type CsvCell = string | number | boolean | null | undefined;
export type CsvRow = CsvCell[];

const NEEDS_QUOTING = /[",\n\r]/;
const UTF8_BOM = "\uFEFF";

function escape(cell: CsvCell): string {
  if (cell === null || cell === undefined) return "";
  const value = typeof cell === "string" ? cell : String(cell);
  if (!NEEDS_QUOTING.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * RFC 4180-ish CSV serializer with a UTF-8 BOM so Excel opens unicode
 * (em-dashes, emojis in titles) without forcing the user to import.
 */
export function toCsv(headers: string[], rows: CsvRow[]): string {
  const lines = [headers.map(escape).join(",")];
  for (const row of rows) {
    lines.push(row.map(escape).join(","));
  }
  return UTF8_BOM + lines.join("\r\n");
}

export const VIDEO_CSV_HEADERS = [
  "videoId",
  "title",
  "publishedAt",
  "duration",
  "viewCount",
  "likeCount",
  "commentCount",
  "engagementRatePct",
  "url",
];

export function videosToCsv(videos: YouTubeVideo[]): string {
  const rows: CsvRow[] = videos.map((video) => {
    const views = Math.max(video.viewCount, 1);
    const engagement = ((video.likeCount + video.commentCount) / views) * 100;
    return [
      video.id,
      video.title,
      video.publishedAt,
      video.duration,
      video.viewCount,
      video.likeCount,
      video.commentCount,
      Number(engagement.toFixed(2)),
      `https://www.youtube.com/watch?v=${video.id}`,
    ];
  });
  return toCsv(VIDEO_CSV_HEADERS, rows);
}

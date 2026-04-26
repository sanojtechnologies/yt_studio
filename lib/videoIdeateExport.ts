import { jsPDF } from "jspdf";

export interface IdeateIdeaExport {
  title: string;
  hook: string;
  whyNow: string;
  keywordAngle: string;
  format: "short" | "long" | "either";
  confidence: "high" | "medium" | "low";
  supportingSignals: string[];
}

export interface IdeateEvidenceExport {
  sampleSize: number;
  windowDays: number;
  opportunitySignals: string[];
}

export interface IdeateResponseExport {
  summary: string;
  ideas: IdeateIdeaExport[];
  evidence: IdeateEvidenceExport;
}

export function safeIdeateFilename(seedKeywords: string, exportedAt = new Date()): string {
  const keywordPart =
    seedKeywords
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "niche";
  const datePart = exportedAt.toISOString().slice(0, 10);
  return `video-ideate-${keywordPart}-${datePart}.pdf`;
}

function sectionTitle(doc: jsPDF, text: string, y: number): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(text, 14, y);
  return y + 6;
}

function writeWrapped(doc: jsPDF, text: string, y: number, indent = 14): number {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const lines = doc.splitTextToSize(text, 182 - indent);
  doc.text(lines, indent, y);
  return y + lines.length * 5;
}

function ensurePage(doc: jsPDF, y: number): number {
  if (y <= 275) return y;
  doc.addPage();
  return 18;
}

export function buildIdeatePdfDocument(
  result: IdeateResponseExport,
  seedKeywords: string,
  exportedAt = new Date()
): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = 16;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Video Ideate Suggestions", 14, y);
  y += 8;

  y = writeWrapped(doc, `Seed Keywords: ${seedKeywords.trim() || "N/A"}`, y);
  y = writeWrapped(doc, `Exported At: ${exportedAt.toISOString()}`, y);
  y = writeWrapped(
    doc,
    `Evidence Window: Last ${result.evidence.windowDays} days · Sample Size: ${result.evidence.sampleSize}`,
    y
  );
  y += 2;

  y = ensurePage(doc, y);
  y = sectionTitle(doc, "Summary", y);
  y = writeWrapped(doc, result.summary, y);
  y += 2;

  if (result.evidence.opportunitySignals.length > 0) {
    y = ensurePage(doc, y);
    y = sectionTitle(doc, "Opportunity Signals", y);
    for (const signal of result.evidence.opportunitySignals) {
      y = ensurePage(doc, y);
      y = writeWrapped(doc, `- ${signal}`, y);
    }
    y += 2;
  }

  y = ensurePage(doc, y);
  y = sectionTitle(doc, "Ideas", y);
  result.ideas.forEach((idea, index) => {
    y = ensurePage(doc, y + 8);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`${index + 1}. ${idea.title}`, 14, y);
    y += 5;
    y = writeWrapped(
      doc,
      `Format: ${idea.format} · Confidence: ${idea.confidence} · Keyword Angle: ${idea.keywordAngle}`,
      y
    );
    y = writeWrapped(doc, `Hook: ${idea.hook}`, y);
    y = writeWrapped(doc, `Why Now: ${idea.whyNow}`, y);
    if (idea.supportingSignals.length > 0) {
      y = writeWrapped(doc, "Supporting Signals:", y);
      for (const signal of idea.supportingSignals) {
        y = ensurePage(doc, y);
        y = writeWrapped(doc, `- ${signal}`, y, 18);
      }
    }
    y += 2;
  });

  return doc;
}

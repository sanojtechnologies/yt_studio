/**
 * Hand-rolled schema validators for the Gemini API outputs. We avoid adding
 * zod as a dependency per the project's "prefer built-ins" rule; these
 * validators throw a readable message listing every failed constraint so test
 * failures are easy to diagnose.
 */

export interface ThumbnailAnalysisShape {
  faceEmotionDetection: string;
  textReadabilityScore: number;
  colorContrastAssessment: string;
  titleCuriosityGapScore: number;
  improvementSuggestions: string[];
}

export interface MetadataAnalysisShape {
  overallScore: number;
  titleFeedback: string;
  titleSuggestions: string[];
  descriptionFeedback: string;
  descriptionSuggestions: string[];
  tagsFeedback: string;
  suggestedTags: string[];
  topRecommendations: string[];
}

export interface AnalyzeResponseShape {
  topPatternsThatWork: string[];
  topUnderperformingPatterns: string[];
  contentGapSuggestions: string[];
  optimalPostingSchedule: {
    bestDays: string[];
    bestTimeWindows: string[];
    recommendedFrequency: string;
    rationale: string;
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isInt1to10(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 10;
}

function collectThumbnailIssues(value: unknown): string[] {
  const issues: string[] = [];
  if (!isObject(value)) {
    issues.push("response is not an object");
    return issues;
  }

  if (typeof value.faceEmotionDetection !== "string" || value.faceEmotionDetection.length === 0) {
    issues.push("faceEmotionDetection must be a non-empty string");
  }
  if (!isInt1to10(value.textReadabilityScore)) {
    issues.push("textReadabilityScore must be an integer between 1 and 10");
  }
  if (typeof value.colorContrastAssessment !== "string" || value.colorContrastAssessment.length === 0) {
    issues.push("colorContrastAssessment must be a non-empty string");
  }
  if (!isInt1to10(value.titleCuriosityGapScore)) {
    issues.push("titleCuriosityGapScore must be an integer between 1 and 10");
  }
  if (!isStringArray(value.improvementSuggestions)) {
    issues.push("improvementSuggestions must be a string[]");
  } else if (value.improvementSuggestions.length < 1) {
    issues.push("improvementSuggestions must contain at least 1 item");
  }
  return issues;
}

function collectAnalyzeIssues(value: unknown): string[] {
  const issues: string[] = [];
  if (!isObject(value)) {
    issues.push("response is not an object");
    return issues;
  }

  if (!isStringArray(value.topPatternsThatWork)) {
    issues.push("topPatternsThatWork must be a string[]");
  }
  if (!isStringArray(value.topUnderperformingPatterns)) {
    issues.push("topUnderperformingPatterns must be a string[]");
  }
  if (!isStringArray(value.contentGapSuggestions)) {
    issues.push("contentGapSuggestions must be a string[]");
  }

  const schedule = value.optimalPostingSchedule;
  if (!isObject(schedule)) {
    issues.push("optimalPostingSchedule must be an object");
  } else {
    if (!isStringArray(schedule.bestDays)) issues.push("schedule.bestDays must be a string[]");
    if (!isStringArray(schedule.bestTimeWindows))
      issues.push("schedule.bestTimeWindows must be a string[]");
    if (typeof schedule.recommendedFrequency !== "string" || schedule.recommendedFrequency.length === 0)
      issues.push("schedule.recommendedFrequency must be a non-empty string");
    if (typeof schedule.rationale !== "string" || schedule.rationale.length === 0)
      issues.push("schedule.rationale must be a non-empty string");
  }
  return issues;
}

export function assertThumbnailAnalysis(value: unknown): asserts value is ThumbnailAnalysisShape {
  const issues = collectThumbnailIssues(value);
  if (issues.length > 0) {
    throw new Error(
      `Invalid ThumbnailAnalysis payload:\n- ${issues.join("\n- ")}\nReceived: ${JSON.stringify(
        value,
        null,
        2
      )}`
    );
  }
}

function collectMetadataIssues(value: unknown): string[] {
  const issues: string[] = [];
  if (!isObject(value)) {
    issues.push("response is not an object");
    return issues;
  }

  if (!isInt1to10(value.overallScore)) {
    issues.push("overallScore must be an integer between 1 and 10");
  }
  for (const prose of ["titleFeedback", "descriptionFeedback", "tagsFeedback"] as const) {
    if (typeof value[prose] !== "string" || (value[prose] as string).length === 0) {
      issues.push(`${prose} must be a non-empty string`);
    }
  }
  for (const listField of [
    "titleSuggestions",
    "descriptionSuggestions",
    "suggestedTags",
    "topRecommendations",
  ] as const) {
    if (!isStringArray(value[listField])) {
      issues.push(`${listField} must be a string[]`);
    }
  }
  return issues;
}

export function assertMetadataAnalysis(value: unknown): asserts value is MetadataAnalysisShape {
  const issues = collectMetadataIssues(value);
  if (issues.length > 0) {
    throw new Error(
      `Invalid MetadataAnalysis payload:\n- ${issues.join("\n- ")}\nReceived: ${JSON.stringify(
        value,
        null,
        2
      )}`
    );
  }
}

export function assertAnalyzeResponse(value: unknown): asserts value is AnalyzeResponseShape {
  const issues = collectAnalyzeIssues(value);
  if (issues.length > 0) {
    throw new Error(
      `Invalid Analyze payload:\n- ${issues.join("\n- ")}\nReceived: ${JSON.stringify(
        value,
        null,
        2
      )}`
    );
  }
}

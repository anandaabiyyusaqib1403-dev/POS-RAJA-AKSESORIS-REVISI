import { categoryLogoFallback } from "./categoryLogoFallback.js";
import { providerLogoRules } from "./providerLogoRules.js";
import { providerLogoWordmarks } from "./providerLogoWordmarks.js";

const DEFAULT_LOGO_BACKGROUND = "#111827";
const DEFAULT_LOGO_COLOR = "#ffffff";

export const providerLogoAsset = (fileName) => `/assets/provider-logos/${fileName}`;

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeProviderLabel(providerName) {
  return String(providerName || "").trim();
}

function keywordMatchesProvider(haystack, keyword) {
  const normalizedKeyword = normalizeSearchText(keyword);
  if (!normalizedKeyword) return false;

  if (normalizedKeyword.length <= 3) {
    return ` ${haystack} `.includes(` ${normalizedKeyword} `);
  }

  return haystack.includes(normalizedKeyword);
}

function findProviderLogoRule(providerName, category = "") {
  const haystack = normalizeSearchText([providerName, category].join(" "));
  if (!haystack) return null;

  return (
    providerLogoRules.find((rule) =>
      rule.keywords.some((keyword) => keywordMatchesProvider(haystack, keyword))
    ) || null
  );
}

function getInitials(value) {
  const initials = normalizeSearchText(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return initials.slice(0, 3);
}

function withResolvedSource(logoConfig) {
  const asset = logoConfig.asset || "";

  return {
    mark: logoConfig.mark || "",
    label: logoConfig.label || "",
    background: logoConfig.background || DEFAULT_LOGO_BACKGROUND,
    color: logoConfig.color || DEFAULT_LOGO_COLOR,
    asset,
    src: asset && logoConfig.useAsset !== false ? providerLogoAsset(asset) : "",
    wordmark: logoConfig.wordmark || "",
  };
}

export function getProviderWordmark(providerName) {
  const providerLabel = normalizeProviderLabel(providerName);
  if (!providerLabel) return "";

  const directWordmark = providerLogoWordmarks[providerLabel];
  if (directWordmark) return directWordmark;

  const matchedRule = findProviderLogoRule(providerLabel);
  if (!matchedRule) return "";

  return matchedRule.wordmark || providerLogoWordmarks[matchedRule.label] || "";
}

export function resolveProviderLogo(providerName, category = "") {
  const providerLabel = normalizeProviderLabel(providerName);
  const categoryId = String(category || "").trim();
  const matchedRule = findProviderLogoRule(providerLabel, categoryId);

  if (matchedRule) {
    return withResolvedSource({
      ...matchedRule,
      wordmark: matchedRule.wordmark || providerLogoWordmarks[matchedRule.label] || "",
    });
  }

  const fallback = categoryLogoFallback[categoryId];
  if (fallback) {
    return withResolvedSource({
      ...fallback,
      mark: getInitials(providerLabel) || fallback.mark,
      label: providerLabel || fallback.label,
    });
  }

  const fallbackLabel = providerLabel || "Provider";

  return withResolvedSource({
    mark: getInitials(fallbackLabel) || "PR",
    label: fallbackLabel,
    background: DEFAULT_LOGO_BACKGROUND,
    color: DEFAULT_LOGO_COLOR,
  });
}

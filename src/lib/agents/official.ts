/** Official-source helpers shared by the seller and manufacturer agents. No company names are hardcoded. */

const nameKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");
const firstToken = (name: string) => name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)[0] ?? "";

/**
 * A host is treated as the organisation's official site only if one of its labels contains its name.
 * Short names (2–3 chars, e.g. "LG") must equal a label or a hyphen-separated part of one.
 * Heuristic, not a registry lookup: a look-alike host containing the name would pass.
 */
export function isOfficialHost(host: string, name: string): boolean {
  const key = nameKey(name);
  const first = firstToken(name);
  if (key.length < 2) return false;
  const labels = host.toLowerCase().split(".").slice(0, -1); // drop TLD
  if (key.length < 4) return labels.some(l => l === key || l.split("-").includes(key));
  return labels.some(l => l.includes(key) || (first.length >= 4 && l.includes(first)));
}

export function hostOf(url: string): string | null {
  try { return new URL(url).hostname; } catch { return null; }
}

export const isOfficialUrl = (url: string | null, name: string): boolean => {
  const h = url ? hostOf(url) : null;
  return h !== null && isOfficialHost(h, name);
};

export function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[*_`#>|[\]()]/g, " ").replace(/[‘’“”"']/g, "").replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
}

/** True if every ≥20-char segment of the excerpt (split on ellipses) appears in the page text. */
export function excerptAppearsIn(excerpt: string, pageText: string): boolean {
  const page = normalizeForMatch(pageText);
  const segments = excerpt.split(/\.{3}|…/).map(normalizeForMatch).filter(s => s.length >= 20);
  return segments.length > 0 && segments.every(s => page.includes(s));
}

let regionMap: Map<string, string> | undefined;
/** ISO 3166-1 alpha-2 code for an English country name (via Intl.DisplayNames), or null. */
export function countryCode(country: string): string | null {
  if (!regionMap) {
    regionMap = new Map();
    try {
      const names = new Intl.DisplayNames(["en"], { type: "region" });
      for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
        const code = String.fromCharCode(a) + String.fromCharCode(b);
        const name = names.of(code);
        if (name && name !== code) regionMap.set(name.toLowerCase(), code.toLowerCase());
      }
    } catch { /* Intl unavailable: no country preference */ }
  }
  return regionMap.get(country.trim().toLowerCase()) ?? null;
}

/** True if the URL looks like the given country's site (ccTLD, ".co.xx", or a "/xx/" path segment). */
export function urlMatchesCountry(url: string, country: string): boolean {
  const cc = countryCode(country);
  const host = hostOf(url);
  if (!cc || !host) return false;
  const labels = host.toLowerCase().split(".");
  if (labels[labels.length - 1] === cc || labels[labels.length - 2] === cc) return true;
  try { return new URL(url).pathname.toLowerCase().split("/").some(seg => seg === cc || seg.endsWith(`-${cc}`)); } catch { return false; }
}

/**
 * Wikimedia Commons API client for the Everkinetic artwork harvest.
 *
 * Read-only, and deliberately verbose about licensing: every file's licence,
 * artist and file-page URL is captured at ingest, because Commons files DO get
 * deleted and relicensed and the attribution we ship must reflect what we
 * actually downloaded.
 */

export const COMMONS_CATEGORY = 'Category:Weight training diagrams';
const API = 'https://commons.wikimedia.org/w/api.php';

/**
 * Wikimedia asks automated clients to identify themselves and to include a
 * contact. See https://meta.wikimedia.org/wiki/User-Agent_policy
 */
const USER_AGENT =
  'IronLog-art-harvest/0.1 (https://github.com/ironlog; exercise illustration ingest)';

export interface CommonsFile {
  /** Page title, e.g. "File:Bench press 1.svg". */
  readonly title: string;
  /** Title without the "File:" prefix and extension, e.g. "Bench press 1". */
  readonly name: string;
  /** Frame number parsed off the end of the name (1 = start, 2 = end). */
  readonly frame: number | null;
  /** Name with the frame suffix removed — the exercise identity. */
  readonly stem: string;
  readonly url: string;
  readonly descriptionUrl: string;
  readonly mime: string;
  readonly size: number;
  readonly width: number;
  readonly height: number;
  readonly licenseShortName: string | null;
  readonly artist: string | null;
  readonly credit: string | null;
}

interface RawImageInfo {
  url?: string;
  descriptionurl?: string;
  mime?: string;
  size?: number;
  width?: number;
  height?: number;
  extmetadata?: Record<string, { value?: string } | undefined>;
}

/**
 * Commons embeds HTML in extmetadata values (artist fields are often wrapped in
 * an <a> tag). Strip tags and decode the handful of entities that appear.
 */
export function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fold the artist-name spellings that actually occur in this category.
 * A live scan found three: "Everkinetic", "everkinetic", and the typo
 * "Everkineteic". Without this the credits screen lists the same artist
 * three times.
 */
export function normaliseArtist(artist: string | null): string | null {
  if (artist === null) return null;
  const clean = stripHtml(artist);
  if (/^everkinet(e)?ic$/i.test(clean)) return 'Everkinetic';
  return clean;
}

/** Split "Bench press 1" into stem "Bench press" and frame 1. */
export function parseFrame(name: string): { stem: string; frame: number | null } {
  const m = /^(.*?)\s+([12])$/.exec(name);
  if (m && m[1] !== undefined && m[2] !== undefined) {
    return { stem: m[1], frame: Number(m[2]) };
  }
  return { stem: name, frame: null };
}

function meta(info: RawImageInfo, key: string): string | null {
  const v = info.extmetadata?.[key]?.value;
  return v === undefined ? null : stripHtml(v);
}

/** Page through the whole category. Returns every file, all MIME types. */
export async function fetchCategoryFiles(
  category: string = COMMONS_CATEGORY,
  log: (msg: string) => void = () => {},
): Promise<CommonsFile[]> {
  const out: CommonsFile[] = [];
  let cont: Record<string, string> | undefined;
  let page = 0;

  do {
    const params = new URLSearchParams({
      action: 'query',
      generator: 'categorymembers',
      gcmtitle: category,
      gcmtype: 'file',
      gcmlimit: '500',
      prop: 'imageinfo',
      iiprop: 'url|size|mime|extmetadata',
      iiextmetadatafilter: 'LicenseShortName|Artist|Credit|LicenseUrl',
      format: 'json',
      formatversion: '2',
      maxlag: '5',
    });
    if (cont) for (const [k, v] of Object.entries(cont)) params.set(k, v);

    const res = await fetch(`${API}?${params.toString()}`, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Encoding': 'gzip' },
    });
    if (!res.ok) {
      throw new Error(`Commons API ${res.status} ${res.statusText}`);
    }
    const json = (await res.json()) as {
      query?: { pages?: { title: string; imageinfo?: RawImageInfo[] }[] };
      continue?: Record<string, string>;
    };

    const pages = json.query?.pages ?? [];
    page += 1;
    log(`  page ${page}: ${pages.length} files`);

    for (const p of pages) {
      const info = p.imageinfo?.[0];
      if (!info?.url) continue;
      const name = p.title.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '');
      const { stem, frame } = parseFrame(name);
      out.push({
        title: p.title,
        name,
        frame,
        stem,
        url: info.url.split('?')[0] ?? info.url,
        descriptionUrl: info.descriptionurl ?? '',
        mime: info.mime ?? '',
        size: info.size ?? 0,
        width: info.width ?? 0,
        height: info.height ?? 0,
        licenseShortName: meta(info, 'LicenseShortName'),
        artist: normaliseArtist(meta(info, 'Artist')),
        credit: meta(info, 'Credit'),
      });
    }

    cont = json.continue;
  } while (cont);

  return out;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Minimum gap between requests to upload.wikimedia.org. Hammering it earned a
 * flat HTTP 429 during development; Wikimedia asks automated clients to be
 * serial and unhurried rather than parallel and fast.
 */
export const DOWNLOAD_DELAY_MS = 220;

/**
 * Download one file's bytes, VERBATIM. No transformation, ever — see the
 * licensing note at the top of harvest-art.ts.
 *
 * Retries on the transient statuses Wikimedia uses for load shedding (429,
 * 503, 504), honouring `Retry-After` when present and backing off
 * exponentially when it is not.
 */
export async function downloadFile(url: string, maxAttempts = 5): Promise<Buffer> {
  let lastError = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });

    if (res.ok) return Buffer.from(await res.arrayBuffer());

    const retryable = res.status === 429 || res.status === 503 || res.status === 504;
    lastError = `${res.status} ${res.statusText}`;
    if (!retryable || attempt === maxAttempts) break;

    const retryAfter = Number(res.headers.get('retry-after'));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : Math.min(30_000, 1000 * 2 ** attempt);

    console.log(`    ${res.status} on ${url.split('/').pop()}; waiting ${Math.round(waitMs / 1000)}s (attempt ${attempt}/${maxAttempts})`);
    await sleep(waitMs);
  }

  throw new Error(`download failed after ${maxAttempts} attempts (${lastError}) for ${url}`);
}

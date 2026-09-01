import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { artFrames, artMeta } from '@/data/art';
import { BodyMap } from './BodyMap';
import type { HighlightedPart } from '@/domain/muscleMap';
import { normaliseSvgForRenderer } from '@/domain/svgCompat';
import { usePalette } from '@/theme/ThemeProvider';

/**
 * Everkinetic exercise illustration, with the muscle map as fallback.
 *
 * TINTING, NOT EDITING. These SVGs contain no `fill` attribute anywhere, so the
 * colour comes from the `fill` prop at render time and the markup stays exactly
 * as Commons published it. That is what keeps the artwork a "collection" rather
 * than Adapted Material under CC BY-SA — see docs/ART_LICENSING.md. Never
 * pre-process it to theme it.
 *
 * The markup is embedded in the JS bundle (src/data/art) rather than loaded from
 * a bundled asset file. Asset loading looked cleaner but breaks in release
 * builds, where Metro assets become Android resources with no readable file
 * path; see the comment at the top of scripts/build-art-registry.ts.
 *
 * Frame 1 is the start position and frame 2 the end, so alternating them gives a
 * serviceable two-frame animation for free. Alternating two unmodified files is
 * not a modification of either.
 *
 * The markup passes through `normaliseSvgForRenderer` on the way to the
 * renderer, which works around a react-native-svg transform-parsing bug. See
 * src/domain/svgCompat.ts — without it every illustration renders blank.
 */

/**
 * Normalised markup, keyed by `slug:frame`. Populated lazily, so only artwork
 * actually displayed costs memory.
 */
const renderCache = new Map<string, string>();

function renderableSvg(slug: string, frameIndex: number, raw: string): string {
  const key = `${slug}:${frameIndex}`;
  const cached = renderCache.get(key);
  if (cached !== undefined) return cached;
  const normalised = normaliseSvgForRenderer(raw);
  renderCache.set(key, normalised);
  return normalised;
}
interface Props {
  /** `exercises.artKey` — the seed slug, or null when there is no artwork. */
  readonly artKey: string | null | undefined;
  /** Fallback highlight when there is no illustration. */
  readonly parts: readonly HighlightedPart[];
  readonly size?: number;
  /** Alternate start/end frames. Off in dense lists. */
  readonly animate?: boolean;
  readonly frameMs?: number;
}

export function ExerciseArt({
  artKey,
  parts,
  size = 180,
  animate = true,
  frameMs = 900,
}: Props) {
  const palette = usePalette();
  const frames = useMemo(() => artFrames(artKey), [artKey]);
  const meta = useMemo(() => artMeta(artKey), [artKey]);
  const [frame, setFrame] = useState(0);

  const frameCount = frames?.length ?? 0;

  useEffect(() => {
    setFrame(0);
  }, [artKey]);

  useEffect(() => {
    if (!animate || frameCount < 2) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % frameCount), frameMs);
    return () => clearInterval(id);
  }, [animate, frameCount, frameMs]);

  // Preserve the artwork's own aspect ratio — these are NOT uniform. Bench
  // press is 1120x1200 (portrait) while ab rollout is 1200x858 (landscape), so
  // a fixed square box would distort them.
  const box = useMemo(() => {
    if (meta === null || meta.width === 0 || meta.height === 0) {
      return { width: size, height: size };
    }
    const ratio = meta.width / meta.height;
    return ratio >= 1
      ? { width: size, height: size / ratio }
      : { width: size * ratio, height: size };
  }, [meta, size]);

  if (frames === null || frames.length === 0) {
    return <BodyMap parts={parts} scale={size / 220} />;
  }

  const index = Math.min(frame, frames.length - 1);
  const raw = frames[index] ?? frames[0] ?? '';
  const xml = renderableSvg(artKey ?? 'unknown', index, raw);

  return (
    <View style={[box, styles.centre]}>
      <SvgXml
        xml={xml}
        width={box.width}
        height={box.height}
        fill={palette.exerciseArt}
        accessibilityRole="image"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center' },
});

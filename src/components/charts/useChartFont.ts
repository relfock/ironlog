import { matchFont, type SkFont } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { Platform } from 'react-native';

/**
 * A Skia font for chart axis labels.
 *
 * Victory Native draws axis text with Skia, which needs a real typeface object.
 * `matchFont` resolves one from the platform's installed fonts, so no .ttf has
 * to be bundled — which matters here, because bundled non-image assets are
 * awkward to read in release builds (see docs/ARCHITECTURE.md).
 *
 * The family name has to be one the platform actually knows. `'system'` is NOT
 * such a name on Android and silently yields a font that renders nothing, which
 * is how the charts first shipped with no labels at all. Android's real generic
 * families are `sans-serif`/`Roboto`; iOS uses `Helvetica`.
 */
const FAMILIES: readonly string[] = Platform.select({
  android: ['sans-serif', 'Roboto', 'Arial'],
  ios: ['Helvetica', 'System'],
  default: ['sans-serif', 'Arial'],
});

export function useChartFont(size = 10): SkFont | null {
  return useMemo(() => {
    for (const fontFamily of FAMILIES) {
      try {
        const font = matchFont({ fontFamily, fontSize: size });
        // A resolved-but-useless font measures nothing; treat that as a miss so
        // the next candidate gets a turn.
        if (font !== null && font.measureText('0').width > 0) return font;
      } catch {
        // Try the next family.
      }
    }
    // Every Victory axis option accepts null, so charts render unlabelled
    // rather than crashing.
    return null;
  }, [size]);
}

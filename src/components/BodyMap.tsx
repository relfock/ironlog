import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Body from 'react-native-body-highlighter';
import {
  partsVisibleOn,
  preferredSide,
  type BodySide,
  type HighlightedPart,
} from '@/domain/muscleMap';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, radius, spacing } from '@/theme/tokens';

interface Props {
  readonly parts: readonly HighlightedPart[];
  /** Pin the view. Omit to let the highlighted muscles choose. */
  readonly side?: BodySide;
  readonly scale?: number;
  readonly gender?: 'male' | 'female';
  /** Show the front/back toggle. */
  readonly allowFlip?: boolean;
  readonly onPartPress?: (slug: string) => void;
}

/**
 * Muscle-map figure. This is the visual baseline for EVERY exercise: the
 * Everkinetic illustrations only cover part of the catalogue, so the body map
 * is what guarantees nothing renders blank.
 *
 * Side selection is not cosmetic. `gluteal`, `hamstring`, `lower-back` and
 * `upper-back` exist ONLY on the back view in react-native-body-highlighter, so
 * defaulting to front would draw a deadlift as an unhighlighted figure. When
 * `side` is not pinned, `preferredSide` picks whichever view actually shows the
 * muscles being worked.
 */
export function BodyMap({
  parts,
  side,
  scale = 1,
  gender = 'male',
  allowFlip = false,
  onPartPress,
}: Props) {
  const palette = usePalette();
  const auto = useMemo(() => preferredSide(parts), [parts]);
  const [manualSide, setManualSide] = useState<BodySide | null>(null);
  const activeSide: BodySide = side ?? manualSide ?? auto;

  // Filter to what this view can draw, so intensities line up with reality.
  const data = useMemo(
    () =>
      partsVisibleOn(parts, activeSide).map((p) => ({
        slug: p.slug,
        intensity: p.intensity,
      })),
    [parts, activeSide],
  );

  const colors = useMemo(
    () => [palette.bodyPrimary, palette.bodySecondary],
    [palette],
  );

  const hiddenOnThisSide = parts.length - data.length;

  return (
    <View style={styles.container}>
      <Body
        data={data as never}
        side={activeSide}
        gender={gender}
        scale={scale}
        colors={colors}
        border="none"
        defaultFill={palette.bodyBase}
        {...(onPartPress
          ? { onBodyPartPress: (b: { slug?: string }) => b.slug && onPartPress(b.slug) }
          : {})}
      />

      {allowFlip ? (
        <View style={styles.toggleRow}>
          {(['front', 'back'] as const).map((s) => {
            const selected = activeSide === s;
            return (
              <Pressable
                key={s}
                onPress={() => setManualSide(s)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Show ${s} view`}
                style={[
                  styles.toggle,
                  {
                    backgroundColor: selected ? palette.accent : palette.surfaceRaised,
                    borderColor: palette.border,
                  },
                ]}
              >
                <Text
                  style={{
                    color: selected ? palette.accentText : palette.textMuted,
                    fontSize: fontSize.sm,
                    fontWeight: '600',
                  }}
                >
                  {s === 'front' ? 'Front' : 'Back'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {allowFlip && hiddenOnThisSide > 0 ? (
        <Text style={[styles.hint, { color: palette.textFaint }]}>
          {hiddenOnThisSide} more on the {activeSide === 'front' ? 'back' : 'front'}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center' },
  toggleRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  toggle: {
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  hint: { fontSize: fontSize.xs, marginTop: spacing.xs },
});

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, radius, spacing } from '@/theme/tokens';

export interface ChipOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

/** Horizontally scrolling multi-select chips. */
export function FilterChips<T extends string>({
  options,
  selected,
  onToggle,
}: {
  options: readonly ChipOption<T>[];
  selected: readonly T[];
  onToggle: (value: T) => void;
}) {
  const palette = usePalette();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <Pressable
            key={o.value}
            onPress={() => onToggle(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            style={[
              styles.chip,
              {
                backgroundColor: on ? palette.accent : palette.surfaceRaised,
                borderColor: on ? palette.accent : palette.border,
              },
            ]}
          >
            <Text
              style={{
                color: on ? palette.accentText : palette.textMuted,
                fontSize: fontSize.sm,
                fontWeight: '600',
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: 2 },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
});

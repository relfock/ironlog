import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Svg, Path } from 'react-native-svg';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, radius, spacing } from '@/theme/tokens';

function MagnifierIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M14.5 14.5 20 20m-3-9a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder = 'Search',
  autoFocus = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const palette = usePalette();
  return (
    <View
      style={[
        styles.wrap,
        // Hevy-style pill: same tint as the page background, no border.
        { backgroundColor: palette.bg },
      ]}
    >
      <MagnifierIcon color={palette.textFaint} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={palette.textFaint}
        autoCorrect={false}
        autoCapitalize="none"
        autoFocus={autoFocus}
        accessibilityLabel={placeholder}
        style={[styles.input, { color: palette.text }]}
      />
      {value.length > 0 ? (
        <Pressable
          onPress={() => onChange('')}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
        >
          <Text
            style={[styles.clear, { backgroundColor: palette.textFaint, color: palette.bg }]}
          >
            ✕
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
  },
  input: { flex: 1, minHeight: 44, fontSize: fontSize.md },
  clear: {
    width: 18,
    height: 18,
    borderRadius: 9,
    textAlign: 'center',
    lineHeight: 18,
    fontSize: 11,
    overflow: 'hidden',
  },
});
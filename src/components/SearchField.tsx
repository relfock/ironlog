import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, radius, spacing } from '@/theme/tokens';

export function SearchField({
  value,
  onChange,
  placeholder = 'Search',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const palette = usePalette();
  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: palette.surfaceRaised, borderColor: palette.border },
      ]}
    >
      <Text style={{ color: palette.textFaint, fontSize: fontSize.md }}>🔍</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={palette.textFaint}
        autoCorrect={false}
        autoCapitalize="none"
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
          <Text style={{ color: palette.textFaint, fontSize: fontSize.md }}>✕</Text>
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
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
  },
  input: { flex: 1, minHeight: 44, fontSize: fontSize.md },
});

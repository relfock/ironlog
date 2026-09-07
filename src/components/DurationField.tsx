import React, { useEffect, useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, radius } from '@/theme/tokens';
import { formatDuration } from '@/domain/units';

/**
 * Duration input accepting either plain seconds or `m:ss` / `h:mm:ss`.
 *
 * A raw seconds field is hostile for a 2-minute plank ("120"), and a raw m:ss
 * field is fussy for a 30-second one. Accepting both, and normalising to m:ss on
 * blur, avoids making the user think about it.
 */
export function parseDuration(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;

  if (trimmed.includes(':')) {
    const parts = trimmed.split(':').map((p) => Number(p === '' ? 0 : p));
    if (parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
    // Read right-to-left so "90" -> 90s, "1:30" -> 90s, "1:00:00" -> 3600s.
    return parts.reverse().reduce((total, part, i) => total + part * 60 ** i, 0);
  }

  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

export function DurationField({
  value,
  onChange,
  onBlur,
  placeholder,
  accessibilityLabel,
  style,
}: {
  value: number | null;
  onChange: (seconds: number | null) => void;
  onBlur?: () => void;
  placeholder?: string;
  accessibilityLabel?: string;
  style?: import('react-native').StyleProp<import('react-native').TextStyle>;
}) {
  const palette = usePalette();
  const [draft, setDraft] = useState(value === null ? '' : formatDuration(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (focused) return;
    setDraft(value === null ? '' : formatDuration(value));
  }, [value, focused]);

  return (
    <TextInput
      value={draft}
      onChangeText={(text) => {
        const cleaned = text.replace(/[^0-9:]/g, '');
        setDraft(cleaned);
        onChange(parseDuration(cleaned));
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        // Normalise the draft to m:ss so the field reads consistently.
        if (value !== null) setDraft(formatDuration(value));
        onBlur?.();
      }}
      placeholder={placeholder ?? 'm:ss'}
      placeholderTextColor={palette.textFaint}
      keyboardType="numbers-and-punctuation"
      selectTextOnFocus
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.input,
        {
          color: palette.text,
          backgroundColor: palette.surfaceRaised,
          borderColor: focused ? palette.accent : palette.border,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 40,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 6,
    paddingVertical: 6,
    fontSize: fontSize.md,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
});

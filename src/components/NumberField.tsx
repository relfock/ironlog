import React, { useEffect, useState } from 'react';
import { StyleSheet, TextInput, type StyleProp, type TextStyle } from 'react-native';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, radius } from '@/theme/tokens';
import { trimNumber } from '@/domain/units';

interface Props {
  /** Value in DISPLAY units, or null for empty. */
  readonly value: number | null;
  readonly onChange: (value: number | null) => void;
  readonly onBlur?: () => void;
  /** Ghost text: what was done last time. */
  readonly placeholder?: string;
  readonly decimals?: number;
  readonly align?: 'center' | 'left';
  readonly style?: StyleProp<TextStyle>;
  readonly accessibilityLabel?: string;
  readonly editable?: boolean;
}

/**
 * Numeric input for weights and reps.
 *
 * Holds its own draft string rather than reformatting the prop on every
 * keystroke. Without that, typing "10.5" is impossible: the moment "10." parses
 * to 10 the field would rewrite itself and eat the decimal point. The draft is
 * re-synced from the prop only when the field is not being edited.
 */
export function NumberField({
  value,
  onChange,
  onBlur,
  placeholder,
  decimals = 2,
  align = 'center',
  style,
  accessibilityLabel,
  editable = true,
}: Props) {
  const palette = usePalette();
  const [draft, setDraft] = useState<string>(
    value === null ? '' : trimNumber(value, decimals),
  );
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (focused) return;
    setDraft(value === null ? '' : trimNumber(value, decimals));
  }, [value, decimals, focused]);

  function handleChange(text: string) {
    // Accept both separators; people type whichever their keyboard offers.
    const cleaned = text.replace(',', '.').replace(/[^0-9.]/g, '');
    // Keep only the first decimal point.
    const parts = cleaned.split('.');
    const normalised =
      parts.length > 1 ? `${parts[0]}.${parts.slice(1).join('')}` : cleaned;

    setDraft(normalised);

    if (normalised === '' || normalised === '.') {
      onChange(null);
      return;
    }
    const parsed = Number(normalised);
    if (Number.isFinite(parsed)) onChange(parsed);
  }

  return (
    <TextInput
      value={draft}
      onChangeText={handleChange}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        onBlur?.();
      }}
      placeholder={placeholder}
      placeholderTextColor={palette.textFaint}
      keyboardType={decimals > 0 ? 'decimal-pad' : 'number-pad'}
      selectTextOnFocus
      editable={editable}
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.input,
        {
          color: palette.text,
          backgroundColor: palette.surfaceRaised,
          borderColor: focused ? palette.accent : palette.border,
          textAlign: align,
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
    fontVariant: ['tabular-nums'],
  },
});

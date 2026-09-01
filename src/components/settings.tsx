import React from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Body, Caption } from './ui';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, radius, spacing } from '@/theme/tokens';

export function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const palette = usePalette();
  return (
    <View style={{ marginTop: spacing.xl }}>
      <Caption style={{ marginBottom: spacing.xs, marginLeft: spacing.xs }}>
        {title.toUpperCase()}
      </Caption>
      <View
        style={[
          styles.group,
          { backgroundColor: palette.surface, borderColor: palette.border },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

export function SettingsToggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const palette = usePalette();
  return (
    <View style={[styles.row, { borderBottomColor: palette.border }]}>
      <View style={{ flex: 1, paddingRight: spacing.md }}>
        <Body>{label}</Body>
        {description !== undefined ? (
          <Caption style={{ marginTop: 2 }}>{description}</Caption>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        trackColor={{ true: palette.accent, false: palette.border }}
        thumbColor={palette.surface}
      />
    </View>
  );
}

export function SettingsRow({
  label,
  description,
  value,
  onPress,
  destructive = false,
}: {
  label: string;
  description?: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
}) {
  const palette = usePalette();
  return (
    <Pressable
      onPress={onPress}
      disabled={onPress === undefined}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={value === undefined ? label : `${label}: ${value}`}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: palette.border, opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <View style={{ flex: 1, paddingRight: spacing.md }}>
        <Text
          style={{
            color: destructive ? palette.danger : palette.text,
            fontSize: fontSize.md,
          }}
        >
          {label}
        </Text>
        {description !== undefined ? (
          <Caption style={{ marginTop: 2 }}>{description}</Caption>
        ) : null}
      </View>
      {value !== undefined ? (
        <Text style={{ color: palette.textMuted, fontSize: fontSize.md }}>{value}</Text>
      ) : null}
      {onPress !== undefined ? (
        <Text style={{ color: palette.textFaint, fontSize: fontSize.md, marginLeft: 6 }}>
          ›
        </Text>
      ) : null}
    </Pressable>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const palette = usePalette();
  return (
    <View
      style={[
        styles.segment,
        { backgroundColor: palette.surfaceRaised, borderColor: palette.border },
      ]}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            style={[
              styles.segmentItem,
              on ? { backgroundColor: palette.accent } : null,
            ]}
          >
            <Text
              style={{
                color: on ? palette.accentText : palette.textMuted,
                fontSize: fontSize.sm,
                fontWeight: '700',
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 56,
  },
  segment: {
    flexDirection: 'row',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 2,
    alignSelf: 'flex-start',
  },
  segmentItem: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
  },
});

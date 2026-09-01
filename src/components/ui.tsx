/**
 * Small shared UI kit. Deliberately plain components over a styling library:
 * the app has one designer and one theme, so tokens plus StyleSheet is less
 * indirection than a utility framework would add.
 */
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, radius, spacing } from '@/theme/tokens';

export function Screen({
  children,
  scroll = false,
  style,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = usePalette();
  const Inner = scroll ? ScrollView : View;
  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: palette.bg }]} edges={['top']}>
      <Inner
        style={[styles.flex, style]}
        {...(scroll
          ? { contentContainerStyle: { padding: spacing.lg, paddingBottom: spacing.xxl } }
          : {})}
      >
        {children}
      </Inner>
    </SafeAreaView>
  );
}

export function H1({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const palette = usePalette();
  return (
    <Text style={[{ color: palette.text, fontSize: fontSize.xxl, fontWeight: '700' }, style]}>
      {children}
    </Text>
  );
}

export function H2({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const palette = usePalette();
  return (
    <Text style={[{ color: palette.text, fontSize: fontSize.lg, fontWeight: '700' }, style]}>
      {children}
    </Text>
  );
}

export function Body({
  children,
  muted = false,
  style,
  numberOfLines,
}: {
  children: React.ReactNode;
  muted?: boolean;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const palette = usePalette();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[{ color: muted ? palette.textMuted : palette.text, fontSize: fontSize.md }, style]}
    >
      {children}
    </Text>
  );
}

export function Caption({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const palette = usePalette();
  return (
    <Text style={[{ color: palette.textFaint, fontSize: fontSize.xs }, style]}>{children}</Text>
  );
}

export function Card({
  children,
  style,
  onPress,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const palette = usePalette();
  const content = (
    <View
      style={[
        styles.card,
        { backgroundColor: palette.surface, borderColor: palette.border },
        style,
      ]}
    >
      {children}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => (pressed ? styles.pressed : undefined)}
    >
      {content}
    </Pressable>
  );
}

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = usePalette();

  const bg =
    variant === 'primary'
      ? palette.accent
      : variant === 'danger'
        ? palette.danger
        : variant === 'secondary'
          ? palette.surfaceRaised
          : 'transparent';
  const fg =
    variant === 'primary' || variant === 'danger'
      ? palette.accentText
      : variant === 'secondary'
        ? palette.text
        : palette.accent;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading }}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: bg,
          borderColor: variant === 'secondary' ? palette.border : 'transparent',
          borderWidth: variant === 'secondary' ? StyleSheet.hairlineWidth : 0,
          opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={{ color: fg, fontSize: fontSize.md, fontWeight: '700' }}>{label}</Text>
      )}
    </Pressable>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message?: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.empty}>
      <H2 style={{ textAlign: 'center' }}>{title}</H2>
      {message ? (
        <Body muted style={{ textAlign: 'center', marginTop: spacing.sm }}>
          {message}
        </Body>
      ) : null}
      {action ? (
        <Button
          label={action.label}
          onPress={action.onPress}
          style={{ marginTop: spacing.lg, alignSelf: 'center', paddingHorizontal: spacing.xl }}
        />
      ) : null}
    </View>
  );
}

export function Divider() {
  const palette = usePalette();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: palette.border }} />;
}

export function Row({
  children,
  style,
  gap = spacing.md,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  gap?: number;
}) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Pill({ label, tone }: { label: string; tone?: string }) {
  const palette = usePalette();
  const color = tone ?? palette.textMuted;
  return (
    <View style={[styles.pill, { borderColor: color }]}>
      <Text style={{ color, fontSize: fontSize.xs, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
  },
  pressed: { opacity: 0.75 },
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
});

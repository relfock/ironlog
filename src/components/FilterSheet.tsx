import React from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Svg, Path } from 'react-native-svg';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, radius, spacing } from '@/theme/tokens';

function ChevronDown({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path
        d="m6 9 6 6 6-6"
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function CheckMark({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="m5 12.5 4.5 4.5L19 7"
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * Hevy-style dropdown pill ("All Equipment ▾"). It reads as a popover button,
 * not a filter chip, so the single-select sheet it opens is the only other
 * filtering affordance on the screen.
 */
export function DropdownFilter({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const palette = usePalette();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: palette.bg },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.pillText, { color: palette.text }]} numberOfLines={1}>
        {label}
      </Text>
      <ChevronDown color={palette.textMuted} />
    </Pressable>
  );
}

/**
 * Full-screen single-select sheet (muscle group / equipment), matching the way
 * Hevy filters the exercise library. "All" is the first row; picking any row
 * applies it immediately and closes the sheet.
 */
export function FilterSheet({
  visible,
  title,
  allLabel,
  options,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  allLabel: string;
  options: readonly { value: string; label: string }[];
  selected: string | null;
  onSelect: (value: string | null) => void;
  onClose: () => void;
}) {
  const palette = usePalette();

  const rows: { value: string | null; label: string }[] = [
    { value: null, label: allLabel },
    ...options,
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.sheet, { backgroundColor: palette.bg }]}>
        <View style={styles.sheetHeader}>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={[styles.cancel, { color: palette.accent }]}>Cancel</Text>
          </Pressable>
          <Text style={[styles.sheetTitle, { color: palette.text }]}>{title}</Text>
          <View style={{ width: 48 }} />
        </View>

        <FlatList
          data={rows}
          keyExtractor={(r) => (r.value === null ? 'all' : r.value)}
          renderItem={({ item }) => {
            const on = item.value === selected;
            return (
              <Pressable
                onPress={() => {
                  onSelect(item.value);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={({ pressed }) => [
                  styles.row,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.rowText,
                    { color: on ? palette.accent : palette.text },
                  ]}
                >
                  {item.label}
                </Text>
                {on ? (
                  <View style={{ marginLeft: spacing.md }}>
                    <CheckMark color={palette.accent} />
                  </View>
                ) : null}
              </Pressable>
            );
          }}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  pillText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    maxWidth: 180,
  },
  pressed: { opacity: 0.6 },
  sheet: { flex: 1 },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  cancel: { fontSize: fontSize.md, fontWeight: '600' },
  sheetTitle: { fontSize: fontSize.lg, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  rowText: { fontSize: fontSize.md, fontWeight: '600' },
});
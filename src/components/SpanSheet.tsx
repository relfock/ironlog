import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, radius, spacing } from '@/theme/tokens';

/** Single-select bottom-sheet for the progression chart's time span. */
export function SpanSheet<T extends string>({
  visible,
  options,
  current,
  onSelect,
  onClose,
}: {
  visible: boolean;
  options: readonly { key: T; label: string }[];
  current: T;
  onSelect: (k: T) => void;
  onClose: () => void;
}) {
  const palette = usePalette();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close">
        <Pressable style={[styles.sheet, { backgroundColor: palette.surface }]} onPress={() => {}}>
          <View style={[styles.grabber, { backgroundColor: palette.border }]} />

          <Text style={[styles.title, { color: palette.text }]}>Time span</Text>

          <ScrollView style={styles.bodyScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.list}>
              {options.map((o) => {
                const on = o.key === current;
                return (
                  <Pressable
                    key={o.key}
                    onPress={() => onSelect(o.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                  >
                    <Text style={[styles.rowText, { color: on ? palette.accent : palette.text }]}>
                      {o.label}
                    </Text>
                    {on ? (
                      <View
                        style={[
                          styles.check,
                          { borderColor: palette.accent, backgroundColor: palette.accent },
                        ]}
                      >
                        <Text style={[styles.checkMark, { color: palette.accentText }]}>✓</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    maxHeight: '88%',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    marginBottom: spacing.md,
  },
  title: { fontSize: fontSize.lg, fontWeight: '700', marginBottom: spacing.sm },
  bodyScroll: { flexShrink: 1, minHeight: 0 },
  list: { marginTop: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  rowText: { fontSize: fontSize.md, fontWeight: '600' },
  check: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: { fontSize: fontSize.sm, fontWeight: '900' },
  pressed: { opacity: 0.6 },
});

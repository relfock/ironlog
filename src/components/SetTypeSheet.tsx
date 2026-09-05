import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { ALL_SET_TYPES, type SetType } from '@/domain/types';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, radius, spacing } from '@/theme/tokens';

/**
 * Bottom-sheet picker for a set's type (Normal / Warm-up / Drop / Failure),
 * raised from the set-number badge in the live logger. Also carries a
 * "Remove set" action so a set can be deleted without relying on a long press
 * anyone can miss.
 *
 * Matches the PlateCalculatorSheet's sheet-with-dimmed-backdrop pattern (the
 * app's established popup style) rather than the OS `Alert` dialog it replaces.
 */
export function SetTypeSheet({
  visible,
  current,
  onSelect,
  onRemove,
  onClose,
}: {
  visible: boolean;
  current: SetType;
  onSelect: (t: SetType) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const palette = usePalette();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close">
        <Pressable style={[styles.sheet, { backgroundColor: palette.surface }]} onPress={() => {}}>
          <View style={[styles.grabber, { backgroundColor: palette.border }]} />

          <Text style={[styles.title, { color: palette.text }]}>Set type</Text>

          <View style={styles.list}>
            {ALL_SET_TYPES.map((t) => {
              const on = t === current;
              return (
                <Pressable
                  key={t}
                  onPress={() => onSelect(t)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                >
                  <Text style={[styles.rowText, { color: on ? palette.accent : palette.text }]}>
                    {setTypeName(t)}
                  </Text>
                  {on ? (
                    <View style={[styles.check, { borderColor: palette.accent, backgroundColor: palette.accent }]}>
                      <Text style={[styles.checkMark, { color: palette.accentText }]}>✓</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          <View style={[styles.divider, { backgroundColor: palette.border }]} />

          <Pressable
            onPress={onRemove}
            accessibilityRole="button"
            style={({ pressed }) => [styles.removeRow, pressed && styles.pressed]}
          >
            <Text style={[styles.removeText, { color: palette.danger }]}>Remove set</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function setTypeName(t: SetType): string {
  switch (t) {
    case 'normal':
      return 'Normal set';
    case 'warmup':
      return 'Warm-up set';
    case 'drop':
      return 'Drop set';
    case 'failure':
      return 'Failure set';
  }
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    marginBottom: spacing.md,
  },
  title: { fontSize: fontSize.lg, fontWeight: '700', marginBottom: spacing.sm },
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
  divider: { height: StyleSheet.hairlineWidth, marginVertical: spacing.sm },
  removeRow: { paddingVertical: spacing.md },
  removeText: { fontSize: fontSize.md, fontWeight: '700' },
  pressed: { opacity: 0.6 },
});

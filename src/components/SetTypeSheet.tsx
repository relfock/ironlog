import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ALL_SET_TYPES, type SetType } from '@/domain/types';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, radius, spacing } from '@/theme/tokens';

const TYPE_INFO: Record<SetType, { title: string; body: string }> = {
  normal: {
    title: 'Normal set',
    body: 'A standard working set. Lift the target weight to the target reps, push close to failure, and record the load and reps you actually complete. This is the bread-and-butter of every program.',
  },
  warmup: {
    title: 'Warm-up set',
    body: 'A light set done before your working sets to prime the movement and get blood into the muscle. Keep the weight easy and don\'t take it close to failure. Log only the sets you do to warm up — they won\'t count toward your working sets.',
  },
  drop: {
    title: 'Drop set',
    body: 'After reaching failure on a working set, immediately lower the weight (by roughly 20–30%) and keep going to failure again. Record the lighter weight and the reps you manage. Multiple drops can follow — just note them as drop sets.',
  },
  failure: {
    title: 'Failure set',
    body: 'Push the set until you physically cannot complete another full rep with good form. Record the weight and the last rep you completed. Failure sets are very fatiguing — use them sparingly.',
  },
};

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
  const [infoType, setInfoType] = useState<SetType | null>(null);

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close">
          <Pressable style={[styles.sheet, { backgroundColor: palette.surface }]} onPress={() => {}}>
            <View style={[styles.grabber, { backgroundColor: palette.border }]} />

            <Text style={[styles.title, { color: palette.text }]}>Set type</Text>

            <ScrollView style={styles.bodyScroll} showsVerticalScrollIndicator={false}>
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
                      <Pressable
                        onPress={() => setInfoType(t)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={`What is ${setTypeName(t)}?`}
                        style={({ pressed }) => [
                          styles.info,
                          { borderColor: palette.border },
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={[styles.infoText, { color: palette.accent }]}>i</Text>
                      </Pressable>
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
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={infoType !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setInfoType(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setInfoType(null)} accessibilityLabel="Close">
          <Pressable
            style={[styles.sheet, { backgroundColor: palette.surface }]}
            onPress={() => {}}
          >
            <View style={[styles.grabber, { backgroundColor: palette.border }]} />
            {infoType !== null ? (
              <>
                <Text style={[styles.title, { color: palette.text }]}>
                  {TYPE_INFO[infoType].title}
                </Text>
                <ScrollView
                  style={styles.scroll}
                  contentContainerStyle={styles.scrollContent}
                  showsVerticalScrollIndicator={false}
                >
                  <Text style={[styles.body, { color: palette.textMuted }]}>
                    {TYPE_INFO[infoType].body}
                  </Text>
                </ScrollView>
                <Pressable
                  onPress={() => setInfoType(null)}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.close,
                    { backgroundColor: palette.accent, opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Text style={[styles.closeText, { color: palette.accentText }]}>Close</Text>
                </Pressable>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </>
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
  info: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoText: { fontSize: fontSize.sm, fontWeight: '800' },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: spacing.sm },
  removeRow: { paddingVertical: spacing.md },
  removeText: { fontSize: fontSize.md, fontWeight: '700' },
  pressed: { opacity: 0.6 },
  scroll: { maxHeight: 300 },
  scrollContent: { paddingBottom: spacing.md },
  body: { fontSize: fontSize.sm, lineHeight: 20 },
  close: {
    marginTop: spacing.md,
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { fontSize: fontSize.md, fontWeight: '700' },
});

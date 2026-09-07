import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, radius, spacing } from '@/theme/tokens';

export type Action = { key: string; label: string; destructive?: boolean; onPress: () => void };

/**
 * The app's established action menu. Bottom sheet by default; `position="center"`
 * renders the same palette-consistent actions as a centred dialog, for confirmations
 * that should read as a modal decision rather than a pull-up menu.
 */
export function ActionSheet({
  visible,
  title,
  actions,
  onClose,
  position = 'bottom',
}: {
  visible: boolean;
  title?: string;
  actions: readonly Action[];
  onClose: () => void;
  position?: 'bottom' | 'center';
}) {
  const palette = usePalette();

  if (position === 'center') {
    return (
      <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
        <Pressable
          style={[styles.backdrop, styles.centerBackdrop]}
          onPress={onClose}
          accessibilityLabel="Close"
        >
          <View
            style={[
              styles.centerSheet,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            {title !== undefined ? (
              <Text style={[styles.centerTitle, { color: palette.text }]}>{title}</Text>
            ) : null}
            <ScrollView style={styles.actionsScroll} showsVerticalScrollIndicator={false}>
              {actions.map((a, i) => (
                <React.Fragment key={a.key}>
                  {i === 0 ? null : <View style={[styles.sep, { backgroundColor: palette.border }]} />}
                  <Pressable
                    onPress={a.onPress}
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.row,
                      styles.centerRow,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.rowText,
                        { color: a.destructive ? palette.danger : palette.text },
                      ]}
                    >
                      {a.label}
                    </Text>
                  </Pressable>
                </React.Fragment>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close">
        <Pressable style={[styles.sheet, { backgroundColor: palette.surface }]} onPress={() => {}}>
          <View style={[styles.grabber, { backgroundColor: palette.border }]} />

          {title !== undefined ? (
            <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>
              {title}
            </Text>
          ) : null}

          <ScrollView style={styles.actionsScroll} showsVerticalScrollIndicator={false}>
            {actions.map((a, i) => (
              <React.Fragment key={a.key}>
                {i === 0 ? null : <View style={[styles.sep, { backgroundColor: palette.border }]} />}
                <Pressable
                  onPress={a.onPress}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                >
                  <Text
                    style={[
                      styles.rowText,
                      { color: a.destructive ? palette.danger : palette.text },
                    ]}
                  >
                    {a.label}
                  </Text>
                </Pressable>
              </React.Fragment>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
  centerBackdrop: { justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  centerSheet: {
    width: '88%',
    maxWidth: 340,
    maxHeight: '75%',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.xl,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  // Lets the action list scroll before a long menu outgrows the sheet.
  actionsScroll: { flexShrink: 1, minHeight: 0 },
  centerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    maxHeight: '86%',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  row: { paddingVertical: spacing.md },
  centerRow: { alignItems: 'center' },
  rowText: { fontSize: fontSize.md, fontWeight: '600' },
  sep: { height: StyleSheet.hairlineWidth },
  pressed: { opacity: 0.6 },
});

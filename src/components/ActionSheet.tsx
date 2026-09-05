import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, radius, spacing } from '@/theme/tokens';

export type Action = { key: string; label: string; destructive?: boolean; onPress: () => void };

/**
 * Bottom-sheet action menu (the app's established picker pattern). Replaces
 * `Alert.alert` menus that overflow or render as an OS dialog that clashes
 * with the app's design.
 */
export function ActionSheet({
  visible,
  title,
  actions,
  onClose,
}: {
  visible: boolean;
  title?: string;
  actions: readonly Action[];
  onClose: () => void;
}) {
  const palette = usePalette();

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

          <View>
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
          </View>
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
  rowText: { fontSize: fontSize.md, fontWeight: '600' },
  sep: { height: StyleSheet.hairlineWidth },
  pressed: { opacity: 0.6 },
});

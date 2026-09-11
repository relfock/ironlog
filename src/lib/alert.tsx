/**
 * Themed replacement for React Native's `Alert`.
 *
 * The native Android alert is a platform dialog that ignores the app theme and
 * reads as a jarring black square. This module exposes the same `Alert.alert`
 * API as `react-native`'s Alert, but renders an in-app modal styled with the
 * active palette. Mount `<AlertHost />` once (in App) so the dialog overlays
 * the whole navigator.
 *
 * Alerts queue: if one is already on screen when another fires, the new one is
 * shown as soon as the current is dismissed.
 */
import React, { useCallback, useEffect, useReducer } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, radius, spacing } from '@/theme/tokens';

export type AlertButtonStyle = 'default' | 'cancel' | 'destructive';

export interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: AlertButtonStyle;
}

interface AlertOptions {
  /** Whether tapping outside / the back button dismisses (default true). */
  cancelable?: boolean;
  onDismiss?: () => void;
}

interface AlertSpec {
  title: string;
  message?: string;
  buttons?: AlertButton[];
  options?: AlertOptions;
}

interface ActiveAlert extends AlertSpec {
  /** Empty buttons are normalised to a single OK, matching RN. */
  buttons: AlertButton[];
}

const queue: ActiveAlert[] = [];
let current: ActiveAlert | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function advance() {
  current = queue.shift() ?? null;
  notify();
}

function dismiss(button?: AlertButton) {
  if (current === null) return;
  const onPress = button?.onPress;
  current = null;
  notify();
  try {
    onPress?.();
  } finally {
    advance();
  }
}

/** Equivalent of tapping outside on Android. */
function dismissByBackdrop() {
  const alert = current;
  if (alert === null) return;
  if ((alert.options?.cancelable ?? true) === false) return;
  const cancel = alert.buttons.find((b) => b.style === 'cancel');
  if (cancel !== undefined) {
    dismiss(cancel);
    return;
  }
  alert.options?.onDismiss?.();
  dismiss();
}

export const Alert = {
  alert: (
    title: string,
    message?: string,
    buttons?: AlertButton[],
    options?: AlertOptions,
  ): void => {
    const normalized: ActiveAlert = {
      title,
      message,
      buttons: buttons !== undefined && buttons.length > 0 ? buttons : [{ text: 'OK' }],
      options,
    };
    queue.push(normalized);
    if (current === null) advance();
  },
};

function useAlertState() {
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    listeners.add(force);
    return () => {
      listeners.delete(force);
    };
  }, []);
  return current;
}

export function AlertHost() {
  const palette = usePalette();
  const alert = useAlertState();
  const onClose = useCallback(() => dismissByBackdrop(), []);

  return (
    <Modal
      visible={alert !== null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close">
        <View
          style={[
            styles.dialog,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
        >
          {alert !== null ? (
            <>
              <Text style={[styles.title, { color: palette.text }]}>{alert.title}</Text>
              <ScrollView style={styles.actions} showsVerticalScrollIndicator={false}>
                {alert.message !== undefined ? (
                  <Text style={[styles.message, { color: palette.textMuted }]}>
                    {alert.message}
                  </Text>
                ) : null}
                {alert.buttons.map((b, i) => (
                  <React.Fragment key={`${b.text}-${i}`}>
                    {i === 0 ? null : (
                      <View style={[styles.sep, { backgroundColor: palette.border }]} />
                    )}
                    <Pressable
                      onPress={() => dismiss(b)}
                      accessibilityRole="button"
                      accessibilityLabel={b.text}
                      style={({ pressed }) => pressed && styles.pressed}
                    >
                      <Text
                        style={[
                          styles.action,
                          {
                            color:
                              b.style === 'destructive' ? palette.danger : palette.text,
                          },
                        ]}
                      >
                        {b.text}
                      </Text>
                    </Pressable>
                  </React.Fragment>
                ))}
              </ScrollView>
            </>
          ) : null}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#00000066',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  dialog: {
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
  title: { fontSize: fontSize.lg, fontWeight: '700', textAlign: 'center' },
  message: {
    fontSize: fontSize.md,
    lineHeight: 22,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  actions: { flexShrink: 1, minHeight: 0, marginTop: spacing.md },
  action: { fontSize: fontSize.md, fontWeight: '600', paddingVertical: spacing.md },
  sep: { height: StyleSheet.hairlineWidth },
  pressed: { opacity: 0.6 },
});

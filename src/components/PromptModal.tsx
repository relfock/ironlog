import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, TextInput } from 'react-native';
import { Button, H2, Row } from './ui';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, radius, spacing } from '@/theme/tokens';

/**
 * Single-field text prompt.
 *
 * `Alert.prompt` is iOS-only, so a real modal is the portable option — and it
 * also lets the field be themed and properly labelled for screen readers.
 */
export function PromptModal({
  visible,
  title,
  placeholder,
  initialValue = '',
  submitLabel = 'Save',
  onSubmit,
  onCancel,
}: {
  visible: boolean;
  title: string;
  placeholder?: string;
  initialValue?: string;
  submitLabel?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const palette = usePalette();
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} accessibilityLabel="Dismiss">
        <Pressable
          style={[styles.dialog, { backgroundColor: palette.surface }]}
          onPress={() => {}}
        >
          <H2>{title}</H2>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor={palette.textFaint}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => onSubmit(value)}
            accessibilityLabel={title}
            style={[
              styles.input,
              {
                color: palette.text,
                backgroundColor: palette.surfaceRaised,
                borderColor: palette.border,
              },
            ]}
          />
          <Row style={{ marginTop: spacing.lg }} gap={spacing.sm}>
            <Button label="Cancel" variant="secondary" onPress={onCancel} style={{ flex: 1 }} />
            <Button label={submitLabel} onPress={() => onSubmit(value)} style={{ flex: 1 }} />
          </Row>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#00000077',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  dialog: { width: '100%', borderRadius: radius.lg, padding: spacing.xl },
  input: {
    marginTop: spacing.lg,
    minHeight: 46,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.md,
  },
});

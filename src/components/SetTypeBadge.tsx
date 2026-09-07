import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SetType } from '@/domain/types';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, radius } from '@/theme/tokens';

/** Hevy's convention: warm-ups/drops/failures get a letter, normal sets a number. */
export function setTypeLabel(setType: SetType, workingIndex: number): string {
  switch (setType) {
    case 'warmup':
      return 'W';
    case 'drop':
      return 'D';
    case 'failure':
      return 'F';
    case 'normal':
      return String(workingIndex);
  }
}

export function SetTypeBadge({
  setType,
  workingIndex,
  onPress,
  pop = false,
}: {
  setType: SetType;
  workingIndex: number;
  onPress?: () => void;
  pop?: boolean;
}) {
  const palette = usePalette();
  const color =
    setType === 'warmup'
      ? palette.setTypeWarmup
      : setType === 'drop'
        ? palette.setTypeDrop
        : setType === 'failure'
          ? palette.setTypeFailure
          : palette.textMuted;

  if (pop) {
    return (
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole="button"
        accessibilityLabel={`Set type: ${setType}. Tap to change.`}
        hitSlop={8}
      >
        <View
          style={[
            styles.popBadge,
            {
              backgroundColor: color + '18',
              borderColor: color + '40',
            },
          ]}
        >
          <Text style={{ color, fontSize: fontSize.sm, fontWeight: '800' }}>
            {setTypeLabel(setType, workingIndex)}
          </Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={`Set type: ${setType}. Tap to change.`}
      style={styles.badge}
      hitSlop={8}
    >
      <Text style={{ color, fontSize: fontSize.md, fontWeight: '700' }}>
        {setTypeLabel(setType, workingIndex)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: 30,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  popBadge: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
});

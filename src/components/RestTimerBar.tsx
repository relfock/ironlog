import { observer } from 'mobx-react-lite';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTimer } from '@/stores/RootStore';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, radius, spacing } from '@/theme/tokens';
import { formatDuration } from '@/domain/units';

/**
 * Rest countdown with Hevy's ±15 s nudges.
 *
 * The displayed value comes from the store's derived `restRemainingSec`, which
 * is computed from timestamps rather than accumulated ticks — so it is correct
 * immediately after the phone has been in a pocket for two minutes.
 */
export const RestTimerBar = observer(function RestTimerBar() {
  const palette = usePalette();
  const timer = useTimer();

  if (!timer.hasRest) return null;
  const remaining = timer.restRemainingSec ?? 0;
  const paused = timer.restIsPaused;

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: palette.surfaceRaised, borderColor: palette.border },
      ]}
    >
      <View
        style={[
          styles.progress,
          { backgroundColor: palette.accent, width: `${timer.restProgress * 100}%` },
        ]}
      />
      <View style={styles.content}>
        <Nudge label="−15" onPress={() => timer.adjustRest(-15)} />

        <Pressable
          onPress={() => timer.togglePause()}
          accessibilityRole="button"
          accessibilityLabel={paused ? 'Resume rest timer' : 'Pause rest timer'}
          style={styles.centre}
        >
          <Text
            style={{
              color: palette.text,
              fontSize: fontSize.xl,
              fontWeight: '700',
              fontVariant: ['tabular-nums'],
            }}
          >
            {formatDuration(remaining)}
          </Text>
          <Text style={{ color: palette.textFaint, fontSize: fontSize.xs }}>
            {paused ? 'Paused — tap to resume' : 'Rest'}
          </Text>
        </Pressable>

        <Nudge label="+15" onPress={() => timer.adjustRest(15)} />

        <Pressable
          onPress={() => timer.clearRest()}
          accessibilityRole="button"
          accessibilityLabel="Skip rest"
          hitSlop={8}
          style={styles.skip}
        >
          <Text style={{ color: palette.accent, fontSize: fontSize.sm, fontWeight: '700' }}>
            Skip
          </Text>
        </Pressable>
      </View>
    </View>
  );
});

function Nudge({ label, onPress }: { label: string; onPress: () => void }) {
  const palette = usePalette();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} seconds`}
      hitSlop={8}
      style={[styles.nudge, { borderColor: palette.border }]}
    >
      <Text style={{ color: palette.text, fontSize: fontSize.sm, fontWeight: '700' }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  progress: { position: 'absolute', left: 0, top: 0, bottom: 0, opacity: 0.14 },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  centre: { alignItems: 'center', flex: 1 },
  nudge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  skip: { paddingVertical: spacing.xs },
});

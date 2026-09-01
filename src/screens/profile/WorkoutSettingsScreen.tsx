import { observer } from 'mobx-react-lite';
import React from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { Caption } from '@/components/ui';
import {
  SegmentedControl,
  SettingsRow,
  SettingsSection,
  SettingsToggle,
} from '@/components/settings';
import { REST_PRESETS_SEC } from '@/domain/restTimer';
import { formatDuration } from '@/domain/units';
import { useSettings } from '@/stores/RootStore';
import type { PreviousValuesMode, SoundLevel } from '@/stores/SettingsStore';
import { spacing } from '@/theme/tokens';

const SOUND_LEVELS: readonly { value: SoundLevel; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
];

/**
 * The twelve workout preferences, matching what Hevy exposes under
 * Settings → Workout.
 */
export const WorkoutSettingsScreen = observer(function WorkoutSettingsScreen() {
  const settings = useSettings();
  const v = settings.values;

  const chooseRest = () => {
    Alert.alert(
      'Default rest timer',
      'Used when an exercise has no rest time of its own.',
      [
        ...REST_PRESETS_SEC.map((sec) => ({
          text: sec === 0 ? 'Off' : formatDuration(sec),
          onPress: () => void settings.set('defaultRestSec', sec),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
      { cancelable: true },
    );
  };

  const chooseSound = (
    key: 'soundLevel' | 'prSoundLevel',
    title: string,
  ) => {
    Alert.alert(
      title,
      undefined,
      [
        ...SOUND_LEVELS.map((s) => ({
          text: s.label,
          onPress: () => void settings.set(key, s.value),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
      { cancelable: true },
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <SettingsSection title="Timers">
        <SettingsRow
          label="Default rest timer"
          description="Starts automatically when you complete a set"
          value={v.defaultRestSec === 0 ? 'Off' : formatDuration(v.defaultRestSec)}
          onPress={chooseRest}
        />
        <SettingsToggle
          label="Inline stopwatch"
          description="Time plank-style sets from the set row"
          value={v.inlineTimerEnabled}
          onChange={(x) => void settings.set('inlineTimerEnabled', x)}
        />
        <SettingsToggle
          label="Keep awake during workout"
          description="Stops the screen sleeping between sets"
          value={v.keepAwake}
          onChange={(x) => void settings.set('keepAwake', x)}
        />
      </SettingsSection>

      <SettingsSection title="Sounds and feedback">
        <SettingsRow
          label="Timer sounds"
          value={SOUND_LEVELS.find((s) => s.value === v.soundLevel)?.label ?? 'Normal'}
          onPress={() => chooseSound('soundLevel', 'Timer sounds')}
        />
        <SettingsRow
          label="PR notification volume"
          value={SOUND_LEVELS.find((s) => s.value === v.prSoundLevel)?.label ?? 'Normal'}
          onPress={() => chooseSound('prSoundLevel', 'PR notification volume')}
        />
        <SettingsToggle
          label="Live PR notifications"
          description="Announce a personal record the moment you set one"
          value={v.prNotificationsEnabled}
          onChange={(x) => void settings.set('prNotificationsEnabled', x)}
        />
        <SettingsToggle
          label="Haptics"
          value={v.hapticsEnabled}
          onChange={(x) => void settings.set('hapticsEnabled', x)}
        />
      </SettingsSection>

      <SettingsSection title="Logging">
        <SettingsToggle
          label="RPE tracking"
          description="Adds a rate-of-perceived-exertion column"
          value={v.rpeEnabled}
          onChange={(x) => void settings.set('rpeEnabled', x)}
        />
        <SettingsToggle
          label="Plate calculator"
          description="Long-press a weight to see the plates to load"
          value={v.plateCalculatorEnabled}
          onChange={(x) => void settings.set('plateCalculatorEnabled', x)}
        />
        <SettingsToggle
          label="Warm-up calculator"
          description="Generate a percentage ramp up to your working set"
          value={v.warmupCalculatorEnabled}
          onChange={(x) => void settings.set('warmupCalculatorEnabled', x)}
        />
        <SettingsToggle
          label="Smart superset scrolling"
          description="Jump to the next exercise in a superset after each set"
          value={v.smartSupersetScrolling}
          onChange={(x) => void settings.set('smartSupersetScrolling', x)}
        />
        <SettingsToggle
          label="Warm-ups count toward stats"
          description="Include warm-up sets in volume and personal records"
          value={v.countWarmupsInStats}
          onChange={(x) => void settings.set('countWarmupsInStats', x)}
        />
      </SettingsSection>

      <SettingsSection title="Previous values">
        <SettingsRow
          label="Show values from"
          description={
            v.previousValuesMode === 'any'
              ? 'The last time you did this exercise, in any workout'
              : 'Only the last time you did it in this same routine'
          }
        />
      </SettingsSection>
      <SegmentedControl<PreviousValuesMode>
        options={[
          { value: 'any', label: 'Any workout' },
          { value: 'same_routine', label: 'Same routine' },
        ]}
        value={v.previousValuesMode}
        onChange={(x) => void settings.set('previousValuesMode', x)}
      />

      <Caption style={{ marginTop: spacing.xl }}>
        These preferences apply to every workout. Rest times set on an individual
        exercise always take priority over the default above.
      </Caption>
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
});

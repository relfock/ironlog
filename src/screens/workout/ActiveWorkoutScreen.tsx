import { useNavigation } from '@react-navigation/native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { observer } from 'mobx-react-lite';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PlateCalculatorSheet } from '@/components/PlateCalculatorSheet';
import { PrBanner } from '@/components/PrBanner';
import { PromptModal } from '@/components/PromptModal';
import { RestTimerBar } from '@/components/RestTimerBar';
import { Body, Button, Caption, EmptyState, Row } from '@/components/ui';
import { WorkoutExerciseCard } from './WorkoutExerciseCard';
import { formatDuration, formatWeight } from '@/domain/units';
import { useActiveWorkout, useSettings } from '@/stores/RootStore';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, spacing } from '@/theme/tokens';

/**
 * The live logger.
 *
 * `useKeepAwake` is conditional on the user's preference — Hevy's "Keep awake
 * during workout" — because a phone that sleeps between sets makes logging
 * genuinely annoying, but forcing it on drains a battery for people who don't
 * want it.
 */
export const ActiveWorkoutScreen = observer(function ActiveWorkoutScreen() {
  const palette = usePalette();
  const navigation = useNavigation();
  const active = useActiveWorkout();
  const settings = useSettings();
  const [plateTarget, setPlateTarget] = useState<number | null>(null);
  const [plateOpen, setPlateOpen] = useState(false);
  const [editing, setEditing] = useState<'name' | 'notes' | null>(null);

  useKeepAwakeIfEnabled(settings.values.keepAwake);

  const openPlates = useCallback((weightKg: number | null) => {
    setPlateTarget(weightKg);
    setPlateOpen(true);
  }, []);

  const confirmFinish = useCallback(() => {
    if (active.completedSetCount === 0) {
      Alert.alert(
        'No sets completed',
        'Finish anyway and save an empty workout, or keep going?',
        [
          { text: 'Keep going', style: 'cancel' },
          {
            text: 'Discard workout',
            style: 'destructive',
            onPress: () => {
              void active.discard().then(() => navigation.goBack());
            },
          },
        ],
      );
      return;
    }

    const n = active.completedSetCount;
    Alert.alert('Finish workout?', `${n} set${n === 1 ? '' : 's'} completed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Finish',
        onPress: () => {
          void active.finish().then(() => navigation.goBack());
        },
      },
    ]);
  }, [active, navigation]);

  const confirmDiscard = useCallback(() => {
    Alert.alert(
      'Discard workout?',
      'Everything logged in this session will be lost.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            void active.discard().then(() => navigation.goBack());
          },
        },
      ],
    );
  }, [active, navigation]);

  if (!active.isActive) {
    return (
      <SafeAreaView style={[styles.flex, { backgroundColor: palette.bg }]}>
        <EmptyState
          title="No workout in progress"
          message="Start one from the Home tab or a routine."
          action={{ label: 'Close', onPress: () => navigation.goBack() }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: palette.bg }]} edges={['top']}>
      <View
        style={[
          styles.header,
          { backgroundColor: palette.surface, borderBottomColor: palette.border },
        ]}
      >
        <Row style={{ justifyContent: 'space-between' }}>
          <Pressable
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Minimise workout"
            hitSlop={10}
          >
            <Text style={{ color: palette.accent, fontSize: fontSize.md, fontWeight: '700' }}>
              Minimise
            </Text>
          </Pressable>

          <Button label="Finish" onPress={confirmFinish} style={styles.finish} />
        </Row>

        <Pressable
          onPress={() => setEditing('name')}
          accessibilityRole="button"
          accessibilityLabel={`Workout name: ${active.workout?.name ?? ''}. Tap to rename.`}
          style={{ marginTop: spacing.sm }}
        >
          <Text
            numberOfLines={1}
            style={{ color: palette.text, fontSize: fontSize.lg, fontWeight: '700' }}
          >
            {active.workout?.name ?? 'Workout'}
          </Text>
        </Pressable>

        <Row style={{ marginTop: spacing.md, justifyContent: 'space-between' }}>
          <Stat label="DURATION" value={formatDuration(active.elapsedSec)} />
          <Stat
            label="VOLUME"
            value={`${formatWeight(active.totalVolumeKg, settings.values.weightUnit)} ${settings.values.weightUnit}`}
          />
          <Stat label="SETS" value={`${active.completedSetCount}/${active.totalSetCount}`} />
        </Row>
      </View>

      <RestTimerBar />
      <PrBanner />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {active.exercises.length === 0 ? (
            <EmptyState
              title="Add your first exercise"
              message="Pick something from the library to start logging."
              action={{
                label: 'Add exercise',
                onPress: () =>
                  navigation.navigate('ExercisePicker', {
                    mode: 'workout',
                    targetId: 'active',
                  }),
              }}
            />
          ) : (
            active.exercises.map((we) => (
              <WorkoutExerciseCard
                key={we.id}
                we={we}
                onRequestPlateCalculator={openPlates}
              />
            ))
          )}

          {active.exercises.length > 0 ? (
            <Button
              label="Add exercise"
              variant="secondary"
              onPress={() =>
                navigation.navigate('ExercisePicker', { mode: 'workout', targetId: 'active' })
              }
              style={{ marginTop: spacing.sm }}
            />
          ) : null}

          <Pressable
            onPress={() => setEditing('notes')}
            accessibilityRole="button"
            accessibilityLabel="Workout notes"
            style={{ marginTop: spacing.lg }}
          >
            <Caption>WORKOUT NOTES</Caption>
            <Body muted style={{ marginTop: 2 }}>
              {active.workout?.notes !== null &&
              active.workout?.notes !== undefined &&
              active.workout.notes.length > 0
                ? active.workout.notes
                : 'Tap to add a note about this session.'}
            </Body>
          </Pressable>

          <Button
            label="Discard workout"
            variant="ghost"
            onPress={confirmDiscard}
            style={{ marginTop: spacing.lg }}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      <PlateCalculatorSheet
        visible={plateOpen}
        targetKg={plateTarget}
        onClose={() => setPlateOpen(false)}
      />

      <PromptModal
        visible={editing === 'name'}
        title="Workout name"
        initialValue={active.workout?.name ?? ''}
        onCancel={() => setEditing(null)}
        onSubmit={(name) => {
          setEditing(null);
          if (name.trim().length === 0) return;
          void active.rename(name.trim());
        }}
      />

      <PromptModal
        visible={editing === 'notes'}
        title="Workout notes"
        initialValue={active.workout?.notes ?? ''}
        placeholder="How did it go?"
        onCancel={() => setEditing(null)}
        onSubmit={(notes) => {
          setEditing(null);
          void active.setNotes(notes);
        }}
      />
    </SafeAreaView>
  );
});

function Stat({ label, value }: { label: string; value: string }) {
  const palette = usePalette();
  return (
    <View>
      <Caption>{label}</Caption>
      <Text
        style={{
          color: palette.text,
          fontSize: fontSize.lg,
          fontWeight: '800',
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </Text>
    </View>
  );
}

const KEEP_AWAKE_TAG = 'ironlog-workout';

/**
 * Conditional keep-awake.
 *
 * `useKeepAwake` cannot be switched off — it holds the lock for the component's
 * whole lifetime — so the imperative API is used instead, keyed on the
 * preference. Deactivation is best-effort: on Android it rejects if the Activity
 * has already gone away, which is harmless and must not surface as an unhandled
 * rejection.
 */
function useKeepAwakeIfEnabled(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    let released = false;

    void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});

    return () => {
      if (released) return;
      released = true;
      try {
        deactivateKeepAwake(KEEP_AWAKE_TAG);
      } catch {
        // Activity already gone; nothing to release.
      }
    };
  }, [enabled]);
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  finish: { minHeight: 38, paddingHorizontal: spacing.xl },
  scroll: { padding: spacing.md, paddingBottom: spacing.xxl },
});

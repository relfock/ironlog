import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { observer } from 'mobx-react-lite';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { FilterChips, type ChipOption } from '@/components/FilterChips';
import { Body, Button, Caption, Card, H1, H2 } from '@/components/ui';
import { BodyMap } from '@/components/BodyMap';
import {
  createCustomExercise,
  updateExercise,
  type Exercise,
} from '@/db/repositories/exercises';
import { MUSCLE_LABELS, buildHighlight } from '@/domain/muscleMap';
import type { Equipment, Muscle, TrackingType } from '@/domain/types';
import { useExercise } from '@/hooks/useExercises';
import type { RootStackParamList } from '@/navigation/types';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, radius, spacing } from '@/theme/tokens';

const TRACKING_TYPES: readonly { value: TrackingType; label: string; hint: string }[] = [
  { value: 'weight_reps', label: 'Weight & reps', hint: 'Barbell, dumbbell, machine' },
  { value: 'bodyweight_reps', label: 'Bodyweight reps', hint: 'Push-ups, air squats' },
  {
    value: 'weighted_bodyweight',
    label: 'Bodyweight + weight',
    hint: 'Weighted pull-ups and dips',
  },
  {
    value: 'assisted_bodyweight',
    label: 'Assisted bodyweight',
    hint: 'Assisted pull-up machine',
  },
  { value: 'duration', label: 'Duration', hint: 'Planks, holds, stretching' },
  {
    value: 'distance_duration',
    label: 'Distance & duration',
    hint: 'Treadmill, rower, carries',
  },
];

const EQUIPMENT: readonly ChipOption<Equipment>[] = [
  { value: 'barbell', label: 'Barbell' },
  { value: 'dumbbell', label: 'Dumbbell' },
  { value: 'machine', label: 'Machine' },
  { value: 'cable', label: 'Cable' },
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'smith_machine', label: 'Smith' },
  { value: 'kettlebell', label: 'Kettlebell' },
  { value: 'ez_bar', label: 'EZ-bar' },
  { value: 'trap_bar', label: 'Trap bar' },
  { value: 'plate', label: 'Plate' },
  { value: 'band', label: 'Band' },
  { value: 'sled', label: 'Sled' },
  { value: 'cardio_machine', label: 'Cardio' },
  { value: 'other', label: 'Other' },
];

const MUSCLES: readonly Muscle[] = [
  'chest', 'lats', 'upper_back', 'lower_back', 'traps',
  'front_delts', 'side_delts', 'rear_delts',
  'biceps', 'triceps', 'forearms',
  'abs', 'obliques',
  'quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors',
  'neck', 'shins', 'full_body', 'cardio',
];

/**
 * Create or edit a custom exercise.
 *
 * The tracking type is the consequential field, and the one users get wrong:
 * a push-up logged as "weight & reps" reports zero volume forever. So each
 * option carries an example rather than just a label.
 */
export const CustomExerciseScreen = observer(function CustomExerciseScreen() {
  const palette = usePalette();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'CustomExercise'>>();
  const editingId = route.params?.exerciseId;
  const existing: Exercise | null = useExercise(editingId);

  const [name, setName] = useState('');
  const [trackingType, setTrackingType] = useState<TrackingType>('weight_reps');
  const [equipment, setEquipment] = useState<Equipment>('barbell');
  const [primary, setPrimary] = useState<Muscle[]>([]);
  const [secondary, setSecondary] = useState<Muscle[]>([]);
  const [notes, setNotes] = useState('');
  const [hydrated, setHydrated] = useState(false);

  // Populate once when editing; later re-renders must not clobber user edits.
  useEffect(() => {
    if (existing === null || hydrated) return;
    setName(existing.name);
    setTrackingType(existing.trackingType);
    setEquipment(existing.equipment);
    setPrimary([...existing.primary]);
    setSecondary([...existing.secondary]);
    setNotes(existing.notes ?? '');
    setHydrated(true);
  }, [existing, hydrated]);

  const muscleOptions: ChipOption<Muscle>[] = MUSCLES.map((m) => ({
    value: m,
    label: MUSCLE_LABELS[m],
  }));

  const togglePrimary = (m: Muscle) => {
    setPrimary((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
    // A muscle cannot be both; primary wins.
    setSecondary((prev) => prev.filter((x) => x !== m));
  };

  const toggleSecondary = (m: Muscle) => {
    if (primary.includes(m)) return;
    setSecondary((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  };

  const save = async () => {
    if (name.trim().length === 0) {
      Alert.alert('Name required', 'Give the exercise a name.');
      return;
    }
    if (primary.length === 0) {
      Alert.alert(
        'Pick a primary muscle',
        'Statistics and the body map need at least one primary muscle.',
      );
      return;
    }

    if (editingId !== undefined) {
      await updateExercise(editingId, {
        name,
        trackingType,
        equipment,
        primary,
        secondary,
        notes: notes.trim() === '' ? null : notes,
      });
      navigation.goBack();
      return;
    }

    const id = await createCustomExercise({
      name,
      trackingType,
      equipment,
      primary,
      secondary,
      notes: notes.trim() === '' ? null : notes,
    });
    // Pop this form, then open the new exercise, so Back does not return to a
    // stale create form.
    navigation.goBack();
    navigation.navigate('ExerciseDetail', { exerciseId: id });
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <H1>{editingId === undefined ? 'New exercise' : 'Edit exercise'}</H1>

      <Card style={{ marginTop: spacing.lg }}>
        <Caption>NAME</Caption>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Reverse Hyperextension"
          placeholderTextColor={palette.textFaint}
          accessibilityLabel="Exercise name"
          style={[
            styles.input,
            {
              color: palette.text,
              backgroundColor: palette.surfaceRaised,
              borderColor: palette.border,
            },
          ]}
        />
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <H2>How is it measured?</H2>
        <Body muted style={{ marginTop: spacing.xs, fontSize: fontSize.sm }}>
          This decides which columns you log, and how volume is calculated. It cannot be
          guessed from the name.
        </Body>
        {TRACKING_TYPES.map((t) => {
          const on = trackingType === t.value;
          return (
            <Pressable
              key={t.value}
              onPress={() => setTrackingType(t.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={t.label}
              style={[
                styles.option,
                {
                  borderColor: on ? palette.accent : palette.border,
                  backgroundColor: on ? `${palette.accent}18` : 'transparent',
                },
              ]}
            >
              <Text
                style={{
                  color: on ? palette.accent : palette.text,
                  fontSize: fontSize.md,
                  fontWeight: on ? '700' : '500',
                }}
              >
                {t.label}
              </Text>
              <Caption>{t.hint}</Caption>
            </Pressable>
          );
        })}
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <H2>Equipment</H2>
        <FilterChips
          options={EQUIPMENT}
          selected={[equipment]}
          onToggle={(v) => setEquipment(v)}
        />
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <H2>Primary muscles</H2>
        <Caption>Counted in full toward sets per muscle group.</Caption>
        <FilterChips options={muscleOptions} selected={primary} onToggle={togglePrimary} />

        <H2 style={{ marginTop: spacing.md }}>Secondary muscles</H2>
        <Caption>Counted at half weight.</Caption>
        <FilterChips
          options={muscleOptions.filter((o) => !primary.includes(o.value))}
          selected={secondary}
          onToggle={toggleSecondary}
        />

        {primary.length > 0 ? (
          <View style={{ alignItems: 'center', marginTop: spacing.lg }}>
            <BodyMap parts={buildHighlight(primary, secondary)} allowFlip scale={0.7} />
          </View>
        ) : null}
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <Caption>NOTES (OPTIONAL)</Caption>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Setup cues, machine settings, a form reminder"
          placeholderTextColor={palette.textFaint}
          multiline
          accessibilityLabel="Notes"
          style={[
            styles.input,
            {
              minHeight: 80,
              textAlignVertical: 'top',
              color: palette.text,
              backgroundColor: palette.surfaceRaised,
              borderColor: palette.border,
            },
          ]}
        />
      </Card>

      <Button
        label={editingId === undefined ? 'Create exercise' : 'Save changes'}
        onPress={() => void save()}
        style={{ marginTop: spacing.lg }}
      />
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  input: {
    marginTop: spacing.xs,
    minHeight: 46,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
  },
  option: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1.5,
  },
});

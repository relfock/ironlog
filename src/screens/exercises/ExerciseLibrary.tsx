import React, { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { FilterChips, type ChipOption } from '@/components/FilterChips';
import { ExerciseListItem } from '@/components/ExerciseListItem';
import { SearchField } from '@/components/SearchField';
import { Caption, EmptyState } from '@/components/ui';
import { filterExercises, type Exercise } from '@/db/repositories/exercises';
import { MUSCLE_LABELS } from '@/domain/muscleMap';
import type { Equipment, Muscle } from '@/domain/types';
import { useExercises } from '@/hooks/useExercises';
import { spacing } from '@/theme/tokens';

/** Muscle filters, ordered the way lifters think about them, not alphabetically. */
const MUSCLE_FILTERS: readonly Muscle[] = [
  'chest', 'lats', 'upper_back', 'lower_back', 'traps',
  'front_delts', 'side_delts', 'rear_delts',
  'biceps', 'triceps', 'forearms',
  'abs', 'obliques',
  'quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors',
  'neck', 'shins', 'cardio',
];

const EQUIPMENT_FILTERS: readonly ChipOption<Equipment>[] = [
  { value: 'barbell', label: 'Barbell' },
  { value: 'dumbbell', label: 'Dumbbell' },
  { value: 'machine', label: 'Machine' },
  { value: 'cable', label: 'Cable' },
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'smith_machine', label: 'Smith' },
  { value: 'kettlebell', label: 'Kettlebell' },
  { value: 'ez_bar', label: 'EZ-bar' },
  { value: 'plate', label: 'Plate' },
  { value: 'band', label: 'Band' },
  { value: 'cardio_machine', label: 'Cardio' },
  { value: 'other', label: 'Other' },
];

/**
 * Shared searchable exercise list, used by both the library tab and the
 * add-exercise picker so search behaviour cannot drift between them.
 */
export function ExerciseLibrary({
  onSelect,
  header,
  trailingFor,
}: {
  onSelect: (exercise: Exercise) => void;
  header?: React.ReactNode;
  trailingFor?: (exercise: Exercise) => React.ReactNode;
}) {
  const { exercises, loading } = useExercises();
  const [query, setQuery] = useState('');
  const [muscles, setMuscles] = useState<Muscle[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);

  const filtered = useMemo(
    () => filterExercises(exercises, { query, muscles, equipment }),
    [exercises, query, muscles, equipment],
  );

  const muscleOptions = useMemo<ChipOption<Muscle>[]>(
    () => MUSCLE_FILTERS.map((m) => ({ value: m, label: MUSCLE_LABELS[m] })),
    [],
  );

  function toggle<T>(list: T[], value: T, set: (v: T[]) => void) {
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  return (
    <FlatList
      data={filtered}
      keyExtractor={(e) => e.id}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={styles.header}>
          {header}
          <SearchField value={query} onChange={setQuery} placeholder="Search exercises" />
          <FilterChips
            options={muscleOptions}
            selected={muscles}
            onToggle={(v) => toggle(muscles, v, setMuscles)}
          />
          <FilterChips
            options={EQUIPMENT_FILTERS}
            selected={equipment}
            onToggle={(v) => toggle(equipment, v, setEquipment)}
          />
          <Caption style={{ marginTop: spacing.xs }}>
            {loading ? 'Loading…' : `${filtered.length} of ${exercises.length} exercises`}
          </Caption>
        </View>
      }
      renderItem={({ item }) => (
        <ExerciseListItem
          exercise={item}
          onPress={() => onSelect(item)}
          trailing={trailingFor?.(item)}
        />
      )}
      ListEmptyComponent={
        loading ? null : (
          <EmptyState
            title="Nothing matches"
            message="Try a different search or clear the filters."
          />
        )
      }
      contentContainerStyle={{ paddingBottom: spacing.xxl }}
    />
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.xs },
});

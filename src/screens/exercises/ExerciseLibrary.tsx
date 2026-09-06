import React, { useEffect, useMemo, useState } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';
import { DropdownFilter, FilterSheet } from '@/components/FilterSheet';
import { ExerciseListItem } from '@/components/ExerciseListItem';
import { SearchField } from '@/components/SearchField';
import { Body, Button, EmptyState, H2, Row } from '@/components/ui';
import { filterExercises, type Exercise } from '@/db/repositories/exercises';
import { MUSCLE_LABELS } from '@/domain/muscleMap';
import type { Equipment, Muscle } from '@/domain/types';
import { useExercises, useRecentExerciseIds } from '@/hooks/useExercises';
import { fontSize, spacing } from '@/theme/tokens';
import { usePalette } from '@/theme/ThemeProvider';

/** Muscle filters, ordered the way lifters think about them, not alphabetically. */
const MUSCLE_FILTERS: readonly Muscle[] = [
  'chest', 'lats', 'upper_back', 'lower_back', 'traps',
  'front_delts', 'side_delts', 'rear_delts',
  'biceps', 'triceps', 'forearms',
  'abs', 'obliques',
  'quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors',
  'neck', 'shins', 'cardio',
];

const EQUIPMENT_FILTERS: readonly { value: Equipment; label: string }[] = [
  { value: 'barbell', label: 'Barbell' },
  { value: 'dumbbell', label: 'Dumbbell' },
  { value: 'machine', label: 'Machine' },
  { value: 'cable', label: 'Cable' },
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'smith_machine', label: 'Smith machine' },
  { value: 'kettlebell', label: 'Kettlebell' },
  { value: 'ez_bar', label: 'EZ-bar' },
  { value: 'trap_bar', label: 'Trap bar' },
  { value: 'plate', label: 'Plate' },
  { value: 'band', label: 'Band' },
  { value: 'sled', label: 'Sled' },
  { value: 'cardio_machine', label: 'Cardio machine' },
  { value: 'other', label: 'Other' },
];

interface LibrarySection {
  key: string;
  title: string;
  data: Exercise[];
}

/**
 * Hevy-style searchable exercise list, shared by the library tab and the
 * add-exercise picker so behaviour cannot drift between them.
 *
 * Layout (like Hevy): a pinned header with search + two single-select dropdown
 * filters, then a sectioned list — Recent Exercises above All Exercises, or a
 * flat Search Results list while typing. `selectable` turns rows into
 * multi-select with a bottom "Add N exercise" bar for the picker.
 */
export function ExerciseLibrary({
  onPress,
  selectedIds = [],
  selectable = false,
  onAddSelection,
  onCreateCustom,
  header,
  autoFocus = false,
  initialMuscles,
}: {
  onPress: (exercise: Exercise) => void;
  selectedIds?: string[];
  selectable?: boolean;
  onAddSelection?: (ids: string[]) => void;
  onCreateCustom?: () => void;
  header?: React.ReactNode;
  autoFocus?: boolean;
  /** Pre-filter to these muscle groups (e.g. from the 2.5D heatmap explorer). */
  initialMuscles?: readonly Muscle[];
}) {
  const palette = usePalette();
  const { exercises, loading } = useExercises();
  const recentIds = useRecentExerciseIds();
  const [query, setQuery] = useState('');
  const [muscles, setMuscles] = useState<Muscle[]>(() =>
    initialMuscles ? [...initialMuscles] : [],
  );
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [sheet, setSheet] = useState<'muscle' | 'equipment' | null>(null);

  // A fresh navigation with a new muscle group replaces the filter. Picking a
  // muscle in the sheet always wins over the initial list, so the user can
  // drill down from a double-tap without the pre-filter snapping back.
  useEffect(() => {
    if (initialMuscles && initialMuscles.length > 0) setMuscles([...initialMuscles]);
  }, [initialMuscles]);

  const filtered = useMemo(
    () =>
      filterExercises(exercises, {
        query,
        muscles,
        equipment: equipment ? [equipment] : [],
      }),
    [exercises, query, muscles, equipment],
  );

  const byId = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  const recentRows = useMemo(
    () => recentIds.map((id) => byId.get(id)).filter((e): e is Exercise => e !== undefined),
    [recentIds, byId],
  );

  const sections = useMemo<LibrarySection[]>(() => {
    if (query.length > 0) {
      return [{ key: 'search', title: 'Search Results', data: filtered }];
    }
    const out: LibrarySection[] = [
      { key: 'all', title: 'All Exercises', data: filtered },
    ];
    if (muscles.length === 0 && equipment === null && recentRows.length > 0) {
      out.unshift({ key: 'recent', title: 'Recent Exercises', data: recentRows });
    }
    return out;
  }, [query, filtered, muscles, equipment, recentRows]);

  const muscleLabel =
    muscles.length === 0
      ? 'All Muscles'
      : muscles.length === 1
        ? MUSCLE_LABELS[muscles[0] as Muscle]
        : muscles.map((m) => MUSCLE_LABELS[m]).join(' + ');
  const equipmentLabel =
    equipment === null
      ? 'All Equipment'
      : (EQUIPMENT_FILTERS.find((o) => o.value === equipment)?.label ?? 'All Equipment');

  const sheetProps: {
    title: string;
    options: readonly { value: string; label: string }[];
    selected: string | null;
    onSelect: (v: string | null) => void;
  } | null =
    sheet === 'muscle'
      ? {
          title: 'Muscle Group',
          options: MUSCLE_FILTERS.map((m) => ({ value: m, label: MUSCLE_LABELS[m] })),
          selected: muscles.length === 1 ? (muscles[0] as Muscle) : null,
          onSelect: (v) => {
            setMuscles(v === null ? [] : [v as Muscle]);
            setSheet(null);
          },
        }
      : sheet === 'equipment'
        ? {
            title: 'Equipment',
            options: EQUIPMENT_FILTERS,
            selected: equipment,
            onSelect: (v) => {
              setEquipment(v as Equipment | null);
              setSheet(null);
            },
          }
        : null;

  return (
    <View style={{ flex: 1 }}>
      {header ? <View style={styles.header}>{header}</View> : null}

      <View style={styles.searchArea}>
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search exercise"
          autoFocus={autoFocus}
        />
        <Row gap={spacing.sm} style={styles.filterRow}>
          <DropdownFilter label={equipmentLabel} onPress={() => setSheet('equipment')} />
          <DropdownFilter label={muscleLabel} onPress={() => setSheet('muscle')} />
        </Row>
      </View>

      <SectionList<Exercise, LibrarySection>
        style={{ flex: 1 }}
        sections={sections}
        keyExtractor={(e) => e.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <ExerciseListItem
            exercise={item}
            selectable={selectable}
            selected={selectedIds.includes(item.id)}
            onPress={() => onPress(item)}
          />
        )}
        ListEmptyComponent={
          loading ? null : query.length > 0 ? (
            <View style={styles.emptyWrap}>
              <H2 style={{ textAlign: 'center' }}>Can't find?</H2>
              <Body muted style={{ textAlign: 'center', marginTop: spacing.sm }}>
                We don't have that exercise in our database yet.
              </Body>
              {onCreateCustom ? (
                <Button
                  label="Create Custom Exercise"
                  onPress={onCreateCustom}
                  style={{ marginTop: spacing.lg, alignSelf: 'center', paddingHorizontal: spacing.xl }}
                />
              ) : null}
            </View>
          ) : (
            <EmptyState title="Nothing matches" message="Try a different search or clear the filter." />
          )
        }
      />

      {selectable && selectedIds.length > 0 ? (
        <View style={[styles.footer, { borderTopColor: palette.border, backgroundColor: palette.surface }]}>
          <Button
            label={`Add ${selectedIds.length} exercise${selectedIds.length > 1 ? 's' : ''}`}
            onPress={() => onAddSelection?.(selectedIds)}
          />
        </View>
      ) : null}

      {sheetProps ? (
        <FilterSheet
          visible
          title={sheetProps.title}
          allLabel={sheetProps.title === 'Equipment' ? 'All Equipment' : 'All Muscles'}
          options={sheetProps.options}
          selected={sheetProps.selected}
          onSelect={sheetProps.onSelect}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },
  searchArea: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  filterRow: {},
  sectionHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '700' },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  footer: {
    padding: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
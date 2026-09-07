import { useEffect, useMemo } from 'react';
import { WEEK_MS } from '@/domain/streak';
import { setTypeCountsForStats, type Muscle, type SetType } from '@/domain/types';
import { accumulateMuscleSets } from '@/domain/volume';
import { useSettings } from '@/stores/RootStore';
import { useWorkoutHistory } from './useHistory';
import { useMuscleRows } from './useStatistics';

/**
 * Completed work-set counts per muscle for ONE selected 7-day window
 * (`[selectedWindowStartMs, selectedWindowStartMs + 7d)`), the behind-the-map
 * dose for the Home muscle heatmap. The window is a rolling period (the Home
 * screen passes `sevenDayWindowStart(now)` by default) rather than a calendar
 * week, so training on Sunday still lights the map on Monday.
 *
 * A single window's total IS the per-week dose the zones are defined against,
 * so no division happens here. Reactivity matches the other muscle hook: any DB
 * write re-reads, plus a workout-list change re-reads as a belt-and-suspenders
 * so a newly finished workout always redraws the map.
 */
export function useMuscleWeek(selectedWindowStartMs: number): {
  setsPerMuscle: Map<Muscle, number>;
  reload: () => void;
} {
  const { workouts } = useWorkoutHistory(1000);
  const settings = useSettings();
  const { rows, reload } = useMuscleRows(
    selectedWindowStartMs,
    selectedWindowStartMs + WEEK_MS,
  );

  useEffect(() => {
    reload();
  }, [workouts.length, reload]);

  const setsPerMuscle = useMemo<Map<Muscle, number>>(() => {
    const counting = rows.filter((r) =>
      setTypeCountsForStats(r.setType as SetType, settings.values.countWarmupsInStats),
    );
    if (counting.length === 0) return new Map();
    return accumulateMuscleSets(
      counting.map((r) => ({
        primary: r.primaryMuscles as Muscle[],
        secondary: r.secondaryMuscles as Muscle[],
        completedSets: 1,
      })),
    );
  }, [rows, settings.values.countWarmupsInStats]);

  return { setsPerMuscle, reload };
}
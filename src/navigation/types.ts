import type { NavigatorScreenParams } from '@react-navigation/native';
import type { Muscle } from '@/domain/types';

export type TabParamList = {
  Home: undefined;
  Start: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
  /** The live logger. Presented as a modal so it can collapse to a bottom bar. */
  ActiveWorkout: undefined;
  ExerciseDetail: { exerciseId: string };
  /** Omit exerciseId to create; pass it to edit. */
  CustomExercise: { exerciseId?: string } | undefined;
  ExercisePicker: {
    mode: 'routine' | 'workout' | 'replace';
    targetId: string;
    replaceRoutineExerciseId?: string;
    replaceWorkoutExerciseId?: string;
    /** When true, the picker returns picks via the bridge instead of writing to the DB. */
    draft?: boolean;
    /** When mode is 'replace' and draft is true, this is the draft exercise key to replace. */
    replaceDraftKey?: string;
  };
  RoutineEditor: { routineId?: string; folderId?: string };
  WorkoutDetail: { workoutId: string; highlightExerciseId?: string };
  History: undefined;
  Statistics: undefined;
  Measurements: undefined;
  Settings: undefined;
  WorkoutSettings: undefined;
  HeartRateZones: undefined;
  PlateSettings: undefined;
  Credits: undefined;
  DataExport: undefined;
  /** The Routines list, reachable from the Start hub ("Strength Trainer"). */
  StrengthTrainer: undefined;
  /** Non-exercise activities (elliptical, generic cardio) reachable from Start. */
  Activities: undefined;
  /** The exercise library, reachable from the Profile "App" section. */
  ExerciseLibrary: { muscles?: Muscle[] } | undefined;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    // The empty body is the point: this merges our param list into
    // React Navigation's global types so `navigation.navigate` is typed.
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}

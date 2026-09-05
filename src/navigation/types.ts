import type { NavigatorScreenParams } from '@react-navigation/native';

export type TabParamList = {
  Home: undefined;
  Routines: undefined;
  StartWorkout: undefined;
  Exercises: undefined;
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
  };
  RoutineEditor: { routineId?: string; folderId?: string };
  WorkoutDetail: { workoutId: string; highlightExerciseId?: string };
  History: undefined;
  Statistics: undefined;
  Measurements: undefined;
  Settings: undefined;
  WorkoutSettings: undefined;
  PlateSettings: undefined;
  Credits: undefined;
  DataExport: undefined;
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

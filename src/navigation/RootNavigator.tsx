import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { Text } from 'react-native';
import { HomeScreen } from '@/screens/home/HomeScreen';
import { StartWorkoutScreen } from '@/screens/home/StartWorkoutScreen';
import { RoutinesScreen } from '@/screens/routines/RoutinesScreen';
import { RoutineEditorScreen } from '@/screens/routines/RoutineEditorScreen';
import { ExercisesScreen } from '@/screens/exercises/ExercisesScreen';
import { ExercisePickerScreen } from '@/screens/exercises/ExercisePickerScreen';
import { ExerciseDetailScreen } from '@/screens/exercises/ExerciseDetailScreen';
import { CustomExerciseScreen } from '@/screens/exercises/CustomExerciseScreen';
import { ActiveWorkoutScreen } from '@/screens/workout/ActiveWorkoutScreen';
import { HistoryScreen } from '@/screens/history/HistoryScreen';
import { WorkoutDetailScreen } from '@/screens/history/WorkoutDetailScreen';
import { StatisticsScreen } from '@/screens/stats/StatisticsScreen';
import { ProfileScreen } from '@/screens/profile/ProfileScreen';
import { SettingsScreen } from '@/screens/profile/SettingsScreen';
import { WorkoutSettingsScreen } from '@/screens/profile/WorkoutSettingsScreen';
import { MeasurementsScreen } from '@/screens/profile/MeasurementsScreen';
import { PlateSettingsScreen } from '@/screens/profile/PlateSettingsScreen';
import { CreditsScreen } from '@/screens/profile/CreditsScreen';
import { DataExportScreen } from '@/screens/profile/DataExportScreen';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize } from '@/theme/tokens';
import type { RootStackParamList, TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Emoji tab glyphs. A licensed icon set is a later polish pass; these keep the
 * tab bar legible without pulling in an icon font before the screens are done.
 */
function tabIcon(glyph: string) {
  return function Icon({ color }: { color: string }) {
    return <Text style={{ fontSize: fontSize.xl, color }}>{glyph}</Text>;
  };
}

function Tabs() {
  const palette = usePalette();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.accent,
        tabBarInactiveTintColor: palette.textFaint,
        tabBarStyle: {
          backgroundColor: palette.surface,
          borderTopColor: palette.border,
        },
        tabBarLabelStyle: { fontSize: fontSize.xs },
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarIcon: tabIcon('🏠') }} />
      <Tab.Screen
        name="Routines"
        component={RoutinesScreen}
        options={{ tabBarIcon: tabIcon('📋') }}
      />
      <Tab.Screen
        name="StartWorkout"
        component={StartWorkoutScreen}
        options={{ title: 'Start', tabBarIcon: tabIcon('➕') }}
      />
      <Tab.Screen
        name="Exercises"
        component={ExercisesScreen}
        options={{ tabBarIcon: tabIcon('🏋️') }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarIcon: tabIcon('👤') }}
      />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const palette = usePalette();
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: palette.surface },
        headerTitleStyle: { color: palette.text },
        headerTintColor: palette.accent,
        contentStyle: { backgroundColor: palette.bg },
      }}
    >
      <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />

      <Stack.Screen
        name="ActiveWorkout"
        component={ActiveWorkoutScreen}
        options={{ presentation: 'fullScreenModal', headerShown: false }}
      />
      <Stack.Screen
        name="ExerciseDetail"
        component={ExerciseDetailScreen}
        options={{ title: '' }}
      />
      <Stack.Screen
        name="CustomExercise"
        component={CustomExerciseScreen}
        options={{ title: 'Custom Exercise' }}
      />
      <Stack.Screen
        name="ExercisePicker"
        component={ExercisePickerScreen}
        options={{ presentation: 'modal', title: 'Add Exercise' }}
      />
      <Stack.Screen
        name="RoutineEditor"
        component={RoutineEditorScreen}
        options={{ title: 'Edit Routine' }}
      />
      <Stack.Screen
        name="WorkoutDetail"
        component={WorkoutDetailScreen}
        options={{ title: 'Workout' }}
      />
      <Stack.Screen name="History" component={HistoryScreen} options={{ title: 'History' }} />
      <Stack.Screen
        name="Statistics"
        component={StatisticsScreen}
        options={{ title: 'Statistics' }}
      />
      <Stack.Screen
        name="Measurements"
        component={MeasurementsScreen}
        options={{ title: 'Measurements' }}
      />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
      <Stack.Screen
        name="WorkoutSettings"
        component={WorkoutSettingsScreen}
        options={{ title: 'Workout Settings' }}
      />
      <Stack.Screen
        name="PlateSettings"
        component={PlateSettingsScreen}
        options={{ title: 'Plates' }}
      />
      <Stack.Screen name="Credits" component={CreditsScreen} options={{ title: 'Credits' }} />
      <Stack.Screen
        name="DataExport"
        component={DataExportScreen}
        options={{ title: 'Backup' }}
      />
    </Stack.Navigator>
  );
}

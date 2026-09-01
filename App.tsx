import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useDatabaseMigrations } from '@/db/migrate';
import { seedExercises } from '@/db/seed';
import { RootNavigator } from '@/navigation/RootNavigator';
import { StoreProvider, rootStore } from '@/stores/RootStore';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { fontSize, spacing } from '@/theme/tokens';

function Boot() {
  const { palette, isDark } = useTheme();
  const migrations = useDatabaseMigrations();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!migrations.success) return;
    let cancelled = false;

    (async () => {
      try {
        await seedExercises();
        await rootStore.initialise();
        if (!cancelled) setReady(true);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [migrations.success]);

  // Recompute the rest timer the moment we come back to the foreground, since
  // JS timers do not run reliably in the background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') rootStore.timer.sync();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => () => rootStore.dispose(), []);

  const failure = migrations.error?.message ?? error;
  if (failure !== undefined && failure !== null) {
    // A migration or seed failure must be visible. Showing a blank screen here
    // invites the user to clear app data and lose their history.
    return (
      <View style={[styles.centre, { backgroundColor: palette.bg }]}>
        <Text style={{ color: palette.danger, fontSize: fontSize.lg, fontWeight: '700' }}>
          Database error
        </Text>
        <Text
          style={{
            color: palette.textMuted,
            fontSize: fontSize.sm,
            marginTop: spacing.sm,
            textAlign: 'center',
          }}
        >
          {failure}
        </Text>
      </View>
    );
  }

  if (!migrations.success || !ready) {
    return (
      <View style={[styles.centre, { backgroundColor: palette.bg }]}>
        <ActivityIndicator color={palette.accent} />
      </View>
    );
  }

  const navTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme : DefaultTheme).colors,
      background: palette.bg,
      card: palette.surface,
      text: palette.text,
      border: palette.border,
      primary: palette.accent,
    },
  };

  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <RootNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <ThemeProvider>
          <StoreProvider>
            <Boot />
          </StoreProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
});

import { useNavigation } from '@react-navigation/native';
import { observer } from 'mobx-react-lite';
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Alert } from '@/lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Body, Button, Caption, Card, H1, H2, Row } from '@/components/ui';
import { listExercises } from '@/db/repositories/exercises';
import { useActiveWorkout } from '@/stores/RootStore';
import { usePalette } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

/**
 * The non-strength activities a user can record. Each activity is an exercise
 * row with `trackingType === 'hr_cardio'` (currently Elliptical and a generic
 * "Other Cardio"), seeded in `src/data/exercises/extras.ts` and hidden from the
 * strength exercise library. Starting one opens the heart-rate cardio session.
 */
export const ActivitiesScreen = observer(function ActivitiesScreen() {
  const palette = usePalette();
  const navigation = useNavigation();
  const active = useActiveWorkout();
  const [activities, setActivities] = React.useState<
    { id: string; name: string; equipment: string }[]
  >([]);

  React.useEffect(() => {
    void listExercises().then((rows) => {
      setActivities(
        rows
          .filter((r) => r.trackingType === 'hr_cardio' && !r.archived)
          .map((r) => ({ id: r.id, name: r.name, equipment: r.equipment })),
      );
    });
  }, []);

  const startActivity = (activityId: string, name: string) => {
    if (active.isActive) {
      Alert.alert(
        'A session is already in progress',
        'Finish or discard it before starting another.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open session', onPress: () => navigation.navigate('ActiveWorkout') },
        ],
      );
      return;
    }
    void active.startActivity(activityId, name).then(() => navigation.navigate('ActiveWorkout'));
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <H1>Activity</H1>
        <Body muted style={{ marginTop: spacing.xs }}>
          Record cardio by heart rate. Each activity is one continuous session — start
          moving, then press Start.
        </Body>

        {active.isActive ? (
          <Card style={{ marginTop: spacing.lg }}>
            <H2>Session in progress</H2>
            <Button
              label="Resume activity"
              onPress={() => navigation.navigate('ActiveWorkout')}
              style={{ marginTop: spacing.md }}
            />
          </Card>
        ) : null}

        {activities.length === 0 ? (
          <Caption style={{ marginTop: spacing.lg }}>Loading activities…</Caption>
        ) : (
          activities.map((a) => (
            <Card key={a.id} style={{ marginTop: spacing.md }}>
              <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <H2>{a.name}</H2>
                  <Caption style={{ marginTop: 2 }}>
                    {a.equipment === 'cardio_machine' ? 'Cardio machine' : 'General cardio'}
                  </Caption>
                </View>
                <Button label="Start" onPress={() => startActivity(a.id, a.name)} />
              </Row>
            </Card>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
});

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
});

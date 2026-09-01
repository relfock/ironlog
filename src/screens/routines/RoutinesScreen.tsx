import { useNavigation } from '@react-navigation/native';
import { observer } from 'mobx-react-lite';
import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Body, Button, Caption, Card, H1, H2, Row } from '@/components/ui';
import { createFolder, createRoutine, deleteFolder, deleteRoutine } from '@/db/repositories/routines';
import type { RoutineSummary } from '@/db/repositories/routines';
import { useRoutines } from '@/hooks/useRoutines';
import { useActiveWorkout } from '@/stores/RootStore';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, spacing } from '@/theme/tokens';
import { PromptModal } from '@/components/PromptModal';

export const RoutinesScreen = observer(function RoutinesScreen() {
  const palette = usePalette();
  const navigation = useNavigation();
  const { routines, folders, reload, loading } = useRoutines();
  const active = useActiveWorkout();
  const [prompt, setPrompt] = useState<'folder' | 'routine' | null>(null);

  const unfiled = useMemo(
    () => routines.filter((r) => r.folderId === null),
    [routines],
  );

  async function start(routine: RoutineSummary) {
    if (active.isActive) {
      Alert.alert(
        'A workout is already in progress',
        'Finish or discard it before starting another.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open workout', onPress: () => navigation.navigate('ActiveWorkout') },
        ],
      );
      return;
    }
    await active.startFromRoutine(routine.id);
    navigation.navigate('ActiveWorkout');
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Row style={{ justifyContent: 'space-between' }}>
          <H1>Routines</H1>
        </Row>

        <Row style={{ marginTop: spacing.md }} gap={spacing.sm}>
          <Button
            label="New routine"
            onPress={() => setPrompt('routine')}
            style={{ flex: 1 }}
          />
          <Button
            label="New folder"
            variant="secondary"
            onPress={() => setPrompt('folder')}
            style={{ flex: 1 }}
          />
        </Row>

        {loading ? (
          <Caption style={{ marginTop: spacing.xl }}>Loading…</Caption>
        ) : routines.length === 0 && folders.length === 0 ? (
          <Card style={{ marginTop: spacing.xl }}>
            <H2>No routines yet</H2>
            <Body muted style={{ marginTop: spacing.xs }}>
              A routine is a reusable plan — the exercises, sets and target weights you
              intend to hit. Create one, or just start an empty workout and save it as a
              routine afterwards.
            </Body>
          </Card>
        ) : null}

        {folders.map((folder) => {
          const inFolder = routines.filter((r) => r.folderId === folder.id);
          return (
            <View key={folder.id} style={{ marginTop: spacing.xl }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <H2>{folder.name}</H2>
                <Text
                  onPress={() =>
                    Alert.alert(folder.name, undefined, [
                      {
                        text: 'Delete folder',
                        style: 'destructive',
                        onPress: () => void deleteFolder(folder.id).then(reload),
                      },
                      { text: 'Cancel', style: 'cancel' },
                    ])
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`${folder.name} options`}
                  style={{ color: palette.textMuted, fontSize: fontSize.xl }}
                >
                  ⋯
                </Text>
              </Row>
              {inFolder.length === 0 ? (
                <Caption style={{ marginTop: spacing.xs }}>Empty folder</Caption>
              ) : (
                inFolder.map((r) => (
                  <RoutineCard key={r.id} routine={r} onStart={start} onChanged={reload} />
                ))
              )}
            </View>
          );
        })}

        {unfiled.length > 0 ? (
          <View style={{ marginTop: spacing.xl }}>
            {folders.length > 0 ? <H2>Unfiled</H2> : null}
            {unfiled.map((r) => (
              <RoutineCard key={r.id} routine={r} onStart={start} onChanged={reload} />
            ))}
          </View>
        ) : null}
      </ScrollView>

      <PromptModal
        visible={prompt !== null}
        title={prompt === 'folder' ? 'New folder' : 'New routine'}
        placeholder={prompt === 'folder' ? 'e.g. Push / Pull / Legs' : 'e.g. Upper A'}
        onCancel={() => setPrompt(null)}
        onSubmit={(name) => {
          const mode = prompt;
          setPrompt(null);
          if (name.trim().length === 0 || mode === null) return;
          if (mode === 'folder') {
            void createFolder(name).then(reload);
          } else {
            void createRoutine(name).then((id) => {
              reload();
              navigation.navigate('RoutineEditor', { routineId: id });
            });
          }
        }}
      />
    </SafeAreaView>
  );
});

const RoutineCard = observer(function RoutineCard({
  routine,
  onStart,
  onChanged,
}: {
  routine: RoutineSummary;
  onStart: (r: RoutineSummary) => void;
  onChanged: () => void;
}) {
  const palette = usePalette();
  const navigation = useNavigation();

  const preview = routine.exerciseNames.slice(0, 4).join(', ');
  const more = routine.exerciseCount - Math.min(4, routine.exerciseCount);

  return (
    <Card style={{ marginTop: spacing.md }}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <H2>{routine.name}</H2>
          <Caption style={{ marginTop: 2 }}>
            {routine.exerciseCount === 0
              ? 'No exercises yet'
              : `${preview}${more > 0 ? ` +${more} more` : ''}`}
          </Caption>
          {routine.lastPerformedAt !== null ? (
            <Caption style={{ marginTop: 2 }}>
              Last performed {new Date(routine.lastPerformedAt).toLocaleDateString()}
            </Caption>
          ) : null}
        </View>
        <Text
          onPress={() =>
            Alert.alert(routine.name, undefined, [
              {
                text: 'Edit',
                onPress: () => navigation.navigate('RoutineEditor', { routineId: routine.id }),
              },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => void deleteRoutine(routine.id).then(onChanged),
              },
              { text: 'Cancel', style: 'cancel' },
            ])
          }
          accessibilityRole="button"
          accessibilityLabel={`${routine.name} options`}
          style={{ color: palette.textMuted, fontSize: fontSize.xl, paddingHorizontal: spacing.sm }}
        >
          ⋯
        </Text>
      </Row>

      <Row style={{ marginTop: spacing.md }} gap={spacing.sm}>
        <Button
          label="Start routine"
          onPress={() => onStart(routine)}
          style={{ flex: 1 }}
        />
        <Button
          label="Edit"
          variant="secondary"
          onPress={() => navigation.navigate('RoutineEditor', { routineId: routine.id })}
        />
      </Row>
    </Card>
  );
});

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
});

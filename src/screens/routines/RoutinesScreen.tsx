import { useNavigation } from '@react-navigation/native';
import { observer } from 'mobx-react-lite';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Alert } from '@/lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Body, Button, Caption, Card, H1, H2, Row } from '@/components/ui';
import {
  createFolder,
  createRoutine,
  deleteFolder,
  deleteRoutine,
  updateFolderNotes,
} from '@/db/repositories/routines';
import type { FolderData, RoutineSummary } from '@/db/repositories/routines';
import { useRoutines } from '@/hooks/useRoutines';
import { useActiveWorkout } from '@/stores/RootStore';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, radius, spacing } from '@/theme/tokens';
import { PromptModal } from '@/components/PromptModal';

type RoutinePrompt =
  | { mode: 'folder' }
  | { mode: 'routine'; folderId: string | null }
  | null;

export const RoutinesScreen = observer(function RoutinesScreen() {
  const palette = usePalette();
  const navigation = useNavigation();
  const { routines, folders, reload, loading } = useRoutines();
  const active = useActiveWorkout();
  const [prompt, setPrompt] = useState<RoutinePrompt>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const toggleFolder = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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
            onPress={() => setPrompt({ mode: 'routine', folderId: null })}
            style={{ flex: 1 }}
          />
          <Button
            label="New folder"
            variant="secondary"
            onPress={() => setPrompt({ mode: 'folder' })}
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
          const isExpanded = expanded.has(folder.id);
          return (
            <View key={folder.id} style={{ marginTop: spacing.xl }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Pressable
                  onPress={() => toggleFolder(folder.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${isExpanded ? 'Collapse' : 'Expand'} ${folder.name}`}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
                >
                  <Text
                    style={{
                      color: palette.textMuted,
                      fontSize: fontSize.sm,
                      width: 18,
                      textAlign: 'center',
                    }}
                  >
                    {isExpanded ? '▾' : '▸'}
                  </Text>
                  <H2 style={{ flex: 1 }}>{folder.name}</H2>
                </Pressable>
                <Row gap={spacing.lg}>
                  <Text
                    onPress={() => setPrompt({ mode: 'routine', folderId: folder.id })}
                    accessibilityRole="button"
                    accessibilityLabel={`New routine in ${folder.name}`}
                    style={{ color: palette.accent, fontSize: fontSize.xl, lineHeight: fontSize.xl }}
                  >
                    ＋
                  </Text>
                  <Text
                    onPress={() =>
                      Alert.alert(folder.name, undefined, [
                        {
                          text: 'New routine in this folder',
                          onPress: () => setPrompt({ mode: 'routine', folderId: folder.id }),
                        },
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
              </Row>
              {isExpanded ? (
                <>
                  <FolderNotesField folder={folder} onSaved={reload} />
                  {inFolder.length === 0 ? (
                    <Caption style={{ marginTop: spacing.xs }}>Empty folder</Caption>
                  ) : (
                    inFolder.map((r) => (
                      <RoutineCard key={r.id} routine={r} onStart={start} onChanged={reload} />
                    ))
                  )}
                </>
              ) : null}
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
        title={prompt?.mode === 'folder' ? 'New folder' : 'New routine'}
        placeholder={
          prompt?.mode === 'folder' ? 'e.g. Push / Pull / Legs' : 'e.g. Upper A'
        }
        onCancel={() => setPrompt(null)}
        onSubmit={(name) => {
          const target = prompt;
          setPrompt(null);
          if (name.trim().length === 0 || target === null) return;
          if (target.mode === 'folder') {
            void createFolder(name).then(reload);
          } else {
            void createRoutine(name, target.folderId).then((id) => {
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

function FolderNotesField({
  folder,
  onSaved,
}: {
  folder: FolderData;
  onSaved: () => void;
}) {
  const palette = usePalette();
  const [value, setValue] = useState(folder.notes ?? '');

  useEffect(() => {
    setValue(folder.notes ?? '');
  }, [folder.notes]);

  return (
    <Card style={{ marginTop: spacing.sm }}>
      <Caption>NOTES</Caption>
      <TextInput
        value={value}
        onChangeText={setValue}
        onBlur={() => {
          if (value.trim() !== (folder.notes ?? '').trim()) {
            void updateFolderNotes(folder.id, value).then(onSaved);
          }
        }}
        placeholder="What these routines share — the focus, style, or progress note for the folder"
        placeholderTextColor={palette.textFaint}
        multiline
        textAlignVertical="top"
        accessibilityLabel={`${folder.name} notes`}
        style={[
          styles.notesInput,
          {
            color: palette.text,
            backgroundColor: palette.surfaceRaised,
            borderColor: palette.border,
          },
        ]}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  notesInput: {
    marginTop: spacing.xs,
    minHeight: 80,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
  },
});

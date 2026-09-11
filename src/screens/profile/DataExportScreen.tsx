import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { observer } from 'mobx-react-lite';
import React, { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Alert } from '@/lib/alert';
import { Body, Button, Caption, Card, H1, H2 } from '@/components/ui';
import {
  BackupFormatError,
  exportBackup,
  exportSetsCsv,
  importBackup,
} from '@/db/backup';
import { importCsv } from '@/db/csvImport';
import { seedExercises } from '@/db/seed';
import { useStores } from '@/stores/RootStore';
import { spacing } from '@/theme/tokens';
import appConfig from '../../../app.json';

const APP_VERSION = (appConfig as { expo: { version: string } }).expo.version;

/**
 * Backup, export and restore.
 *
 * There is no cloud sync, so this screen is the user's only safety net. The
 * copy says so plainly rather than burying it — someone who loses a phone
 * without ever tapping "Save backup" loses everything.
 */
export const DataExportScreen = observer(function DataExportScreen() {
  const stores = useStores();
  const [busy, setBusy] = useState<string | null>(null);

  async function shareFile(filename: string, contents: string, mime: string) {
    // Written to the cache directory: it is the correct place for transient
    // share payloads and the OS reclaims it, so backups do not silently
    // accumulate in app storage.
    const file = new File(Paths.cache, filename);
    if (file.exists) file.delete();
    file.create();
    file.write(contents);

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, { mimeType: mime, dialogTitle: filename });
    } else {
      Alert.alert('Saved', `Written to ${file.uri}`);
    }
  }

  const doExportJson = async () => {
    setBusy('json');
    try {
      const backup = await exportBackup(APP_VERSION);
      const stamp = new Date().toISOString().slice(0, 10);
      await shareFile(
        `ironlog-backup-${stamp}.json`,
        JSON.stringify(backup, null, 2),
        'application/json',
      );
    } catch (err) {
      Alert.alert('Export failed', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const doExportCsv = async () => {
    setBusy('csv');
    try {
      const csv = await exportSetsCsv();
      const stamp = new Date().toISOString().slice(0, 10);
      await shareFile(`ironlog-sets-${stamp}.csv`, csv, 'text/csv');
    } catch (err) {
      Alert.alert('Export failed', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const doImport = async () => {
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['application/json', '*/*'],
      copyToCacheDirectory: true,
    });
    if (picked.canceled) return;
    const asset = picked.assets[0];
    if (asset === undefined) return;

    Alert.alert(
      'Replace all data?',
      'Importing replaces everything currently on this device — workouts, routines, records and settings. This cannot be undone.\n\nExport a backup first if you are unsure.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Replace everything',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusy('import');
              try {
                const json = await new File(asset.uri).text();
                const result = await importBackup(json);
                // The backup may predate exercises added in a later release, so
                // re-seed to fill in anything missing from the catalogue.
                await seedExercises();
                await stores.settings.load();
                await stores.activeWorkout.resume();

                const total = Object.values(result.imported).reduce((a, b) => a + b, 0);
                Alert.alert(
                  'Import complete',
                  `${total} rows restored.\n\n${Object.entries(result.imported)
                    .filter(([, n]) => n > 0)
                    .map(([k, n]) => `${k}: ${n}`)
                    .join('\n')}`,
                );
              } catch (err) {
                Alert.alert(
                  'Import failed',
                  err instanceof BackupFormatError
                    ? err.message
                    : `Your existing data was left unchanged.\n\n${
                        err instanceof Error ? err.message : String(err)
                      }`,
                );
              } finally {
                setBusy(null);
              }
            })();
          },
        },
      ],
    );
  };

  const doImportCsv = async () => {
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'text/comma-separated-values', '*/*'],
      copyToCacheDirectory: true,
    });
    if (picked.canceled) return;
    const asset = picked.assets[0];
    if (asset === undefined) return;

    Alert.alert(
      'Import CSV?',
      'Workouts from the CSV will be added to your history. Exercises are matched by name — unknown exercises are created automatically.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Import',
          onPress: () => {
            void (async () => {
              setBusy('csv-import');
              try {
                const csv = await new File(asset.uri).text();
                const result = await importCsv(csv);

                const lines: string[] = [
                  `${result.workoutsImported} workout${result.workoutsImported === 1 ? '' : 's'} imported`,
                  `${result.exercisesMatched} exercise${result.exercisesMatched === 1 ? '' : 's'} matched`,
                ];
                if (result.exercisesCreated > 0) {
                  lines.push(`${result.exercisesCreated} new exercise${result.exercisesCreated === 1 ? '' : 's'} created`);
                }
                if (result.routinesCreated > 0) {
                  lines.push(`${result.routinesCreated} routine${result.routinesCreated === 1 ? '' : 's'} created`);
                }
                if (result.skipped.length > 0) {
                  lines.push(`\nSkipped:\n${result.skipped.map((s) => `  · ${s}`).join('\n')}`);
                }
                Alert.alert('CSV import complete', lines.join('\n'));
              } catch (err) {
                Alert.alert(
                  'Import failed',
                  `Your existing data was left unchanged.\n\n${
                    err instanceof Error ? err.message : String(err)
                  }`,
                );
              } finally {
                setBusy(null);
              }
            })();
          },
        },
      ],
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <H1>Backup and export</H1>

      <Card style={{ marginTop: spacing.lg }}>
        <H2>Save a backup</H2>
        <Body muted style={{ marginTop: spacing.xs }}>
          A complete copy of your workouts, routines, records, measurements and settings.
          Keep it somewhere off this device — it is the only way to recover your history.
        </Body>
        <Button
          label="Save backup (JSON)"
          onPress={() => void doExportJson()}
          loading={busy === 'json'}
          style={{ marginTop: spacing.lg }}
        />
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <H2>Export for a spreadsheet</H2>
        <Body muted style={{ marginTop: spacing.xs }}>
          One row per logged set, for your own analysis. This is not a backup and cannot
          be imported again.
        </Body>
        <Button
          label="Export sets (CSV)"
          variant="secondary"
          onPress={() => void doExportCsv()}
          loading={busy === 'csv'}
          style={{ marginTop: spacing.lg }}
        />
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <H2>Restore</H2>
        <Body muted style={{ marginTop: spacing.xs }}>
          Restoring <Body style={{ fontWeight: '700' }}>replaces</Body> everything on this
          device. Merging two devices is not possible yet, so the newer data wins entirely.
        </Body>
        <Button
          label="Restore from backup"
          variant="danger"
          onPress={() => void doImport()}
          loading={busy === 'import'}
          style={{ marginTop: spacing.lg }}
        />
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <H2>Import from CSV</H2>
        <Body muted style={{ marginTop: spacing.xs }}>
          Import workouts from a CSV file (Strong app export or similar format). Exercises
          are matched by name (unknown ones are created automatically), and routines are
          derived from each workout title — combining repeated titles into one routine.
        </Body>
        <Button
          label="Import CSV"
          variant="secondary"
          onPress={() => void doImportCsv()}
          loading={busy === 'csv-import'}
          style={{ marginTop: spacing.lg }}
        />
      </Card>

      <Caption style={{ marginTop: spacing.xl }}>
        Backup format version 1 · IronLog {APP_VERSION}
      </Caption>
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
});

import { observer } from 'mobx-react-lite';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { LineChartCard } from '@/components/charts/LineChartCard';
import { PromptModal } from '@/components/PromptModal';
import { Body, Caption, Card, H1, H2, Row } from '@/components/ui';
import { SettingsRow, SettingsSection } from '@/components/settings';
import {
  MEASUREMENT_KINDS,
  MEASUREMENT_LABELS,
  addMeasurement,
  latestMeasurements,
  listMeasurements,
  measurementUnit,
  type Measurement,
  type MeasurementKind,
} from '@/db/repositories/measurements';
import { formatAxisTick, fromKg, toKg, trimNumber } from '@/domain/units';
import { useSettings } from '@/stores/RootStore';
import { usePalette } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

export const MeasurementsScreen = observer(function MeasurementsScreen() {
  const palette = usePalette();
  const settings = useSettings();
  const [latest, setLatest] = useState<Map<MeasurementKind, Measurement>>(new Map());
  const [selected, setSelected] = useState<MeasurementKind>('weight');
  const [history, setHistory] = useState<Measurement[]>([]);
  const [entering, setEntering] = useState<MeasurementKind | null>(null);

  const reload = useCallback(() => {
    void latestMeasurements().then(setLatest);
    void listMeasurements(selected).then(setHistory);
  }, [selected]);

  useEffect(reload, [reload]);

  const unitFor = useCallback(
    (kind: MeasurementKind): string => {
      const type = measurementUnit(kind);
      if (type === 'mass') return settings.values.weightUnit;
      if (type === 'percent') return '%';
      return 'cm';
    },
    [settings.values.weightUnit],
  );

  /** Mass is stored in kg; lengths and percentages are stored as entered. */
  const display = useCallback(
    (kind: MeasurementKind, value: number): number =>
      measurementUnit(kind) === 'mass'
        ? fromKg(value, settings.values.weightUnit)
        : value,
    [settings.values.weightUnit],
  );

  const series = history.map((m) => ({
    x: m.measuredAt,
    y: display(selected, m.value),
  }));

  return (
    <>
      <ScrollView contentContainerStyle={styles.scroll}>
        <H1>Measurements</H1>
        <Caption style={{ marginTop: 2 }}>
          Tap any measurement to log a new value.
        </Caption>

        <Card style={{ marginTop: spacing.lg }}>
          <H2>{MEASUREMENT_LABELS[selected]}</H2>
          <LineChartCard
            title=""
            subtitle={`${history.length} entr${history.length === 1 ? 'y' : 'ies'} · ${unitFor(selected)}`}
            data={series}
            formatY={formatAxisTick}
          />
          {history.length > 0 ? (
            <Row style={{ marginTop: spacing.md, justifyContent: 'space-between' }}>
              <View>
                <Caption>FIRST</Caption>
                <Body>
                  {trimNumber(display(selected, history[0]!.value), 1)} {unitFor(selected)}
                </Body>
              </View>
              <View>
                <Caption>LATEST</Caption>
                <Body style={{ fontWeight: '700' }}>
                  {trimNumber(display(selected, history[history.length - 1]!.value), 1)}{' '}
                  {unitFor(selected)}
                </Body>
              </View>
              <View>
                <Caption>CHANGE</Caption>
                <Body
                  style={{
                    color:
                      history[history.length - 1]!.value - history[0]!.value >= 0
                        ? palette.success
                        : palette.danger,
                  }}
                >
                  {(() => {
                    const delta =
                      display(selected, history[history.length - 1]!.value) -
                      display(selected, history[0]!.value);
                    return `${delta >= 0 ? '+' : ''}${trimNumber(delta, 1)}`;
                  })()}
                </Body>
              </View>
            </Row>
          ) : null}
        </Card>

        <SettingsSection title="All measurements">
          {MEASUREMENT_KINDS.map((kind) => {
            const m = latest.get(kind);
            return (
              <SettingsRow
                key={kind}
                label={MEASUREMENT_LABELS[kind]}
                description={
                  m === undefined
                    ? 'No entries'
                    : `Last logged ${new Date(m.measuredAt).toLocaleDateString()}`
                }
                value={
                  m === undefined
                    ? '—'
                    : `${trimNumber(display(kind, m.value), 1)} ${unitFor(kind)}`
                }
                onPress={() => {
                  setSelected(kind);
                  setEntering(kind);
                }}
              />
            );
          })}
        </SettingsSection>
      </ScrollView>

      <PromptModal
        visible={entering !== null}
        title={
          entering === null
            ? ''
            : `${MEASUREMENT_LABELS[entering]} (${unitFor(entering)})`
        }
        placeholder="Enter a value"
        onCancel={() => setEntering(null)}
        onSubmit={(text) => {
          const kind = entering;
          setEntering(null);
          if (kind === null) return;
          const n = Number(text.replace(',', '.'));
          if (!Number.isFinite(n) || n <= 0) {
            Alert.alert('Not a valid number', 'Enter a positive value.');
            return;
          }
          const stored =
            measurementUnit(kind) === 'mass' ? toKg(n, settings.values.weightUnit) : n;
          void addMeasurement(kind, stored).then(() => {
            // Logging bodyweight also updates the setting used for
            // bodyweight-exercise volume, so the two cannot drift apart.
            if (kind === 'weight') void settings.set('bodyweightKg', stored);
            reload();
          });
        }}
      />
    </>
  );
});

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
});

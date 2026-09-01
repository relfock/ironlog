import { observer } from 'mobx-react-lite';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PromptModal } from '@/components/PromptModal';
import { Body, Button, Caption, Card, H1, H2, Row } from '@/components/ui';
import { SettingsRow, SettingsSection } from '@/components/settings';
import {
  DEFAULT_KG_PLATES,
  DEFAULT_LB_PLATES,
  formatPerSide,
  smallestIncrement,
  solvePlates,
  type PlateSetup,
} from '@/domain/plateCalculator';
import { toKg } from '@/domain/units';
import { useSettings } from '@/stores/RootStore';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, radius, spacing } from '@/theme/tokens';

/**
 * Plate inventory.
 *
 * Denominations are held in the unit they are physically stamped with — a 20 kg
 * plate and a 45 lb plate are different objects, not conversions of each other
 * — so this screen edits values in the current unit and the calculator solves in
 * that same unit.
 */
export const PlateSettingsScreen = observer(function PlateSettingsScreen() {
  const palette = usePalette();
  const settings = useSettings();
  const v = settings.values;
  const [adding, setAdding] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);

  const setup: PlateSetup = useMemo(
    () => ({ unit: v.weightUnit, barWeight: v.barWeight, plates: v.platePairs }),
    [v.weightUnit, v.barWeight, v.platePairs],
  );

  const sorted = useMemo(
    () => [...v.platePairs].sort((a, b) => b.weight - a.weight),
    [v.platePairs],
  );

  const solution = useMemo(
    () => (preview === null ? null : solvePlates(toKg(preview, v.weightUnit), setup)),
    [preview, setup, v.weightUnit],
  );

  const savePlates = (plates: { weight: number; pairs: number }[]) => {
    void settings.set(
      'platePairs',
      plates.sort((a, b) => b.weight - a.weight),
    );
  };

  const editPairs = (weight: number) => {
    Alert.alert(
      `${weight} ${v.weightUnit} plates`,
      'How many PAIRS do you own?',
      [
        ...[0, 1, 2, 3, 4, 5, 10].map((n) => ({
          text: n === 10 ? '10+ (plenty)' : String(n),
          onPress: () =>
            savePlates(
              v.platePairs.map((p) => (p.weight === weight ? { ...p, pairs: n } : p)),
            ),
        })),
        {
          text: 'Remove denomination',
          style: 'destructive' as const,
          onPress: () => savePlates(v.platePairs.filter((p) => p.weight !== weight)),
        },
        { text: 'Cancel', style: 'cancel' as const },
      ],
      { cancelable: true },
    );
  };

  const resetDefaults = () => {
    const defaults = v.weightUnit === 'kg' ? DEFAULT_KG_PLATES : DEFAULT_LB_PLATES;
    savePlates(
      defaults.map((p) => ({
        weight: p.weight,
        pairs: Number.isFinite(p.pairs) ? p.pairs : 10,
      })),
    );
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.scroll}>
        <H1>Plates</H1>
        <Caption style={{ marginTop: 2 }}>
          Used by the plate calculator and to round warm-up weights.
        </Caption>

        <Card style={{ marginTop: spacing.lg }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View>
              <Caption>BAR</Caption>
              <Body style={{ fontWeight: '800' }}>
                {v.barWeight} {v.weightUnit}
              </Body>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Caption>SMALLEST JUMP</Caption>
              <Body style={{ fontWeight: '800' }}>
                {smallestIncrement(setup) || '—'} {v.weightUnit}
              </Body>
            </View>
          </Row>
          <Caption style={{ marginTop: spacing.sm }}>
            The smallest jump is twice your lightest plate, since plates load in pairs.
          </Caption>
        </Card>

        <SettingsSection title={`Denominations (${v.weightUnit})`}>
          {sorted.length === 0 ? (
            <SettingsRow label="No plates configured" description="Add one below" />
          ) : (
            sorted.map((p) => (
              <SettingsRow
                key={p.weight}
                label={`${p.weight} ${v.weightUnit}`}
                description={
                  p.pairs === 0
                    ? 'None available'
                    : `${p.pairs} pair${p.pairs === 1 ? '' : 's'}${p.pairs >= 10 ? ' (plenty)' : ''}`
                }
                onPress={() => editPairs(p.weight)}
              />
            ))
          )}
        </SettingsSection>

        <Row style={{ marginTop: spacing.md }} gap={spacing.sm}>
          <Button
            label="Add denomination"
            variant="secondary"
            onPress={() => setAdding(true)}
            style={{ flex: 1 }}
          />
          <Button label="Reset" variant="ghost" onPress={resetDefaults} />
        </Row>

        <Card style={{ marginTop: spacing.xl }}>
          <H2>Try it</H2>
          <Caption>Tap a weight to see how it loads.</Caption>
          <Row style={{ marginTop: spacing.md, flexWrap: 'wrap' }} gap={spacing.sm}>
            {(v.weightUnit === 'kg'
              ? [60, 80, 100, 102.5, 140, 180]
              : [135, 185, 225, 275, 315, 405]
            ).map((w) => (
              <Pressable
                key={w}
                onPress={() => setPreview(w)}
                accessibilityRole="button"
                accessibilityLabel={`Preview ${w} ${v.weightUnit}`}
                style={[
                  styles.chip,
                  {
                    backgroundColor:
                      preview === w ? palette.accent : palette.surfaceRaised,
                    borderColor: preview === w ? palette.accent : palette.border,
                  },
                ]}
              >
                <Text
                  style={{
                    color: preview === w ? palette.accentText : palette.textMuted,
                    fontSize: fontSize.sm,
                    fontWeight: '700',
                  }}
                >
                  {w}
                </Text>
              </Pressable>
            ))}
          </Row>

          {solution !== null ? (
            <View style={{ marginTop: spacing.lg }}>
              {solution.belowBar ? (
                <Body style={{ color: palette.warning }}>
                  Below the bar ({v.barWeight} {v.weightUnit}).
                </Body>
              ) : (
                <>
                  <Body style={{ fontWeight: '700' }}>
                    Per side: {formatPerSide(solution)}
                  </Body>
                  <Caption style={{ marginTop: spacing.xs }}>
                    {solution.exact
                      ? `Exactly ${solution.achievedTotal} ${v.weightUnit}`
                      : `Closest is ${solution.achievedTotal} ${v.weightUnit} — ${Math.round(solution.remainder * 100) / 100} short`}
                  </Caption>
                </>
              )}
            </View>
          ) : null}
        </Card>
      </ScrollView>

      <PromptModal
        visible={adding}
        title={`New plate weight (${v.weightUnit})`}
        placeholder="e.g. 1.25"
        onCancel={() => setAdding(false)}
        onSubmit={(text) => {
          setAdding(false);
          const n = Number(text.replace(',', '.'));
          if (!Number.isFinite(n) || n <= 0) return;
          if (v.platePairs.some((p) => p.weight === n)) {
            Alert.alert('Already added', `You already have a ${n} ${v.weightUnit} plate.`);
            return;
          }
          savePlates([...v.platePairs, { weight: n, pairs: 2 }]);
        }}
      />
    </>
  );
});

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  chip: {
    minWidth: 56,
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
});

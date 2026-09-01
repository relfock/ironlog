import { observer } from 'mobx-react-lite';
import React, { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Body, Button, Caption, H2, Row } from './ui';
import { solvePlates, type PlateSetup } from '@/domain/plateCalculator';
import { formatWeight } from '@/domain/units';
import { useSettings } from '@/stores/RootStore';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, radius, spacing } from '@/theme/tokens';

/**
 * "Which plates go on the bar." Shows the per-side stack for the target weight
 * and says plainly when the target is not loadable, rather than silently
 * rounding — a lifter needs to know the bar will be 1 kg light.
 */
export const PlateCalculatorSheet = observer(function PlateCalculatorSheet({
  visible,
  targetKg,
  onClose,
}: {
  visible: boolean;
  targetKg: number | null;
  onClose: () => void;
}) {
  const palette = usePalette();
  const settings = useSettings();
  const unit = settings.values.weightUnit;

  const setup: PlateSetup = useMemo(
    () => ({
      unit,
      barWeight: settings.values.barWeight,
      plates: settings.values.platePairs,
    }),
    [unit, settings.values.barWeight, settings.values.platePairs],
  );

  const solution = useMemo(
    () => (targetKg === null ? null : solvePlates(targetKg, setup)),
    [targetKg, setup],
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close">
        <Pressable
          style={[styles.sheet, { backgroundColor: palette.surface }]}
          onPress={() => {}}
        >
          <H2>Plate calculator</H2>

          {solution === null ? (
            <Body muted style={{ marginTop: spacing.md }}>
              Enter a weight to see the plates.
            </Body>
          ) : (
            <>
              <Row style={{ marginTop: spacing.md, justifyContent: 'space-between' }}>
                <View>
                  <Caption>TARGET</Caption>
                  <Text
                    style={{
                      color: palette.text,
                      fontSize: fontSize.xl,
                      fontWeight: '800',
                      fontVariant: ['tabular-nums'],
                    }}
                  >
                    {formatWeight(targetKg ?? 0, unit)} {unit}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Caption>BAR</Caption>
                  <Text style={{ color: palette.textMuted, fontSize: fontSize.lg }}>
                    {setup.barWeight} {unit}
                  </Text>
                </View>
              </Row>

              {solution.belowBar ? (
                <View
                  style={[styles.warn, { borderColor: palette.warning }]}
                >
                  <Body style={{ color: palette.warning }}>
                    That is below the empty bar ({setup.barWeight} {unit}).
                  </Body>
                </View>
              ) : (
                <>
                  <Caption style={{ marginTop: spacing.lg }}>PER SIDE</Caption>
                  {solution.perSide.length === 0 ? (
                    <Body muted style={{ marginTop: spacing.sm }}>
                      Bar only — no plates needed.
                    </Body>
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <Row style={{ marginTop: spacing.sm }} gap={spacing.sm}>
                        {solution.perSide.map((g, i) => (
                          <View
                            key={`${g.weight}-${i}`}
                            style={[
                              styles.plate,
                              { borderColor: palette.accent, backgroundColor: palette.surfaceRaised },
                            ]}
                          >
                            <Text
                              style={{
                                color: palette.text,
                                fontSize: fontSize.lg,
                                fontWeight: '800',
                              }}
                            >
                              {g.weight}
                            </Text>
                            <Caption>× {g.count}</Caption>
                          </View>
                        ))}
                      </Row>
                    </ScrollView>
                  )}

                  {!solution.exact ? (
                    <View style={[styles.warn, { borderColor: palette.warning }]}>
                      <Body style={{ color: palette.warning }}>
                        Closest loadable is {solution.achievedTotal} {unit} —{' '}
                        {Math.round(solution.remainder * 100) / 100} {unit} short.
                      </Body>
                    </View>
                  ) : (
                    <Body muted style={{ marginTop: spacing.md }}>
                      Total on the bar: {solution.achievedTotal} {unit}
                    </Body>
                  )}
                </>
              )}
            </>
          )}

          <Button label="Done" onPress={onClose} style={{ marginTop: spacing.xl }} />
        </Pressable>
      </Pressable>
    </Modal>
  );
});

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  plate: {
    minWidth: 56,
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1.5,
  },
  warn: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
});

import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Caption, Row } from './ui';
import { calendarColumns, type WeekStart } from '@/domain/streak';
import { usePalette } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

const WEEKS_SHOWN = 18;
const DAY_LABELS_MON = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_LABELS_SUN = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * GitHub-style training calendar: one column per week, one cell per day.
 *
 * Bucketing is done in LOCAL time (see domain/streak.ts) so a late-evening
 * workout appears on the day the user actually trained rather than shifting into
 * tomorrow in UTC.
 */
export function CalendarHeatmap({
  timestamps,
  weekStart = 1,
  onSelectDay,
}: {
  timestamps: readonly number[];
  weekStart?: WeekStart;
  onSelectDay?: (dayKey: string) => void;
}) {
  const palette = usePalette();

  // Grid construction lives in domain/streak.ts so it can be unit-tested;
  // getting "is this day in the future" wrong there hid today's workout all
  // morning, which is not the sort of thing a screenshot reliably reveals.
  const columns = useMemo(
    () => calendarColumns(timestamps, WEEKS_SHOWN, weekStart),
    [timestamps, weekStart],
  );

  const labels = weekStart === 1 ? DAY_LABELS_MON : DAY_LABELS_SUN;

  return (
    <View>
      <Row gap={3} style={{ alignItems: 'flex-start' }}>
        <View style={{ gap: 3, marginRight: 2 }}>
          {labels.map((l, i) => (
            <View key={i} style={styles.dayLabel}>
              <Text style={{ color: palette.textFaint, fontSize: 9 }}>{l}</Text>
            </View>
          ))}
        </View>

        {columns.map((week, wi) => (
          <View key={wi} style={{ gap: 3 }}>
            {week.map((day) => (
              <Pressable
                key={day.dayKey}
                onPress={onSelectDay ? () => onSelectDay(day.dayKey) : undefined}
                disabled={day.count === 0 || !onSelectDay}
                accessibilityLabel={`${day.dayKey}: ${day.count} workout${day.count === 1 ? '' : 's'}`}
                style={[
                  styles.cell,
                  {
                    backgroundColor: day.inFuture
                      ? 'transparent'
                      : day.count === 0
                        ? palette.surfaceRaised
                        : day.count === 1
                          ? palette.bodySecondary
                          : palette.accent,
                    borderColor: palette.border,
                  },
                ]}
              />
            ))}
          </View>
        ))}
      </Row>
      <Caption style={{ marginTop: spacing.sm }}>
        Last {WEEKS_SHOWN} weeks
      </Caption>
    </View>
  );
}

const styles = StyleSheet.create({
  cell: {
    width: 12,
    height: 12,
    borderRadius: 3,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dayLabel: { width: 10, height: 12, alignItems: 'center', justifyContent: 'center' },
});

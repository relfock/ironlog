import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  DAY_MS,
  formatWeekSpan,
  startOfLocalDay,
  startOfLocalMonth,
  startOfLocalWeek,
  weeksOfMonth,
  type WeekStart,
} from '@/domain/streak';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, radius, spacing } from '@/theme/tokens';

const DAY_LABELS_MON = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_LABELS_SUN = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const CELL = 34;

/**
 * Bottom-sheet month calendar for jumping the muscle heatmap to a specific
 * week. Backward month navigation is unlimited; forward is capped at the
 * current month. Tapping any day selects that day's calendar week.
 */
export function WeekCalendarSheet({
  visible,
  selectedWeekStartMs,
  weekStart,
  onSelectWeek,
  onClose,
}: {
  visible: boolean;
  selectedWeekStartMs: number;
  weekStart: WeekStart;
  onSelectWeek: (weekStartMs: number) => void;
  onClose: () => void;
}) {
  const palette = usePalette();
  const [monthAnchor, setMonthAnchor] = useState(() => startOfLocalMonth(selectedWeekStartMs));

  useEffect(() => {
    if (visible) setMonthAnchor(startOfLocalMonth(selectedWeekStartMs));
  }, [visible, selectedWeekStartMs]);

  const labels = weekStart === 1 ? DAY_LABELS_MON : DAY_LABELS_SUN;
  const weeks = useMemo(() => weeksOfMonth(monthAnchor, weekStart), [monthAnchor, weekStart]);

  const currentMonthStart = startOfLocalMonth(Date.now());
  const atCurrentMonth = monthAnchor >= currentMonthStart;
  const todayDay = startOfLocalDay(Date.now());

  const monthLabel = new Date(monthAnchor).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  const shiftMonth = (delta: number) => {
    const d = new Date(monthAnchor);
    d.setDate(1);
    d.setMonth(d.getMonth() + delta);
    setMonthAnchor(startOfLocalDay(d.getTime()));
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close">
        <Pressable style={[styles.sheet, { backgroundColor: palette.surface }]} onPress={() => {}}>
          <View style={[styles.grabber, { backgroundColor: palette.border }]} />
          <Text style={[styles.title, { color: palette.text }]}>Select a week</Text>
          <Text style={[styles.selection, { color: palette.accent }]}>
            {formatWeekSpan(selectedWeekStartMs)}
          </Text>

          <View style={styles.navRow}>
            <Pressable
              onPress={() => shiftMonth(-1)}
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              hitSlop={8}
              style={[styles.navButton, { borderColor: palette.border }]}
            >
              <Text style={[styles.navArrow, { color: palette.text }]}>‹</Text>
            </Pressable>
            <Text style={[styles.monthLabel, { color: palette.text }]}>{monthLabel}</Text>
            <Pressable
              onPress={() => shiftMonth(1)}
              accessibilityRole="button"
              accessibilityLabel="Next month"
              hitSlop={8}
              disabled={atCurrentMonth}
              style={[
                styles.navButton,
                { borderColor: palette.border, opacity: atCurrentMonth ? 0.35 : 1 },
              ]}
            >
              <Text style={[styles.navArrow, { color: palette.text }]}>›</Text>
            </Pressable>
          </View>

          <View style={styles.wkRow}>
            {labels.map((l, i) => (
              <View key={`${l}-${i}`} style={styles.wkLabel}>
                <Text style={{ color: palette.textFaint, fontSize: fontSize.xs }}>{l}</Text>
              </View>
            ))}
          </View>

          {weeks.map((weekStartMs) => (
            <View key={weekStartMs} style={styles.wkRow}>
              {[...Array(7)].map((_, k) => {
                const ms = weekStartMs + k * DAY_MS;
                const day = new Date(ms);
                const inMonth = day.getMonth() === new Date(monthAnchor).getMonth();
                const isSelectedWeek = startOfLocalWeek(ms, weekStart) === selectedWeekStartMs;
                const isToday = startOfLocalDay(ms) === todayDay;
                return (
                  <Pressable
                    key={ms}
                    accessibilityRole="button"
                    accessibilityLabel={`${day.toDateString()} — select this week`}
                    onPress={() => onSelectWeek(startOfLocalWeek(ms, weekStart))}
                    style={[
                      styles.dayCell,
                      { backgroundColor: isSelectedWeek ? palette.accent : 'transparent' },
                      isToday && !isSelectedWeek && { borderColor: palette.accent, borderWidth: 1 },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: fontSize.sm,
                        fontWeight: isSelectedWeek ? '700' : '500',
                        color: isSelectedWeek
                          ? palette.accentText
                          : inMonth
                            ? palette.text
                            : palette.textFaint,
                        opacity: inMonth ? 1 : 0.35,
                      }}
                    >
                      {day.getDate()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    marginBottom: spacing.md,
  },
  title: { fontSize: fontSize.lg, fontWeight: '700' },
  selection: { fontSize: fontSize.sm, fontWeight: '700', marginTop: spacing.xs },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  navButton: {
    width: CELL,
    height: CELL - 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navArrow: { fontSize: fontSize.xl, fontWeight: '700', lineHeight: fontSize.xl + 2 },
  monthLabel: { fontSize: fontSize.md, fontWeight: '700' },
  wkRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  wkLabel: { width: CELL, alignItems: 'center' },
  dayCell: {
    width: CELL,
    height: 28,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
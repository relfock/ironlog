import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { REST_WHEEL_SEC } from '@/domain/restTimer';
import { formatDuration } from '@/domain/units';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, radius, spacing } from '@/theme/tokens';

const ROW_HEIGHT = 44;

/**
 * Rest-duration picker for the routine editor and the live workout.
 *
 * A scrolling wheel from "Off" (first row) through 5 s → 5:00 in 5-second
 * steps; only three rows are ever visible and the middle one is the
 * selection. Scrolling is NATIVE: the wheel is a real ScrollView with
 * `snapToInterval`, so it always ends on a row and flick intensity maps to
 * momentum the OS handles itself — no custom gesture math to fight with.
 */
export function RestPickerSheet({
  visible,
  title,
  valueSec,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title?: string;
  /** Current rest duration, or null when the timer is off. */
  valueSec: number | null;
  onSelect: (sec: number | null) => void;
  onClose: () => void;
}) {
  const palette = usePalette();
  const scrollRef = useRef<ScrollView>(null);

  const items = useMemo(() => ['Off', ...REST_WHEEL_SEC.map((s) => formatDuration(s))], []);
  const maxIndex = items.length - 1;
  const maxOffset = maxIndex * ROW_HEIGHT;

  /** Offset the wheel currently sits at (kept in sync by onScroll). */
  const offsetRef = useRef(0);
  const [index, setIndex] = useState(0);

  const initialIndex = valueSec === null ? 0 : Math.min(60, Math.max(1, Math.round(valueSec / 5)));

  useEffect(() => {
    if (!visible) return;
    const y = initialIndex * ROW_HEIGHT;
    offsetRef.current = y;
    setIndex(initialIndex);
    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [visible, initialIndex]);

  const clampOffset = (y: number): number => Math.max(0, Math.min(maxOffset, y));

  /** Keep the selection highlight on whichever row is centred. */
  const syncIndex = () => {
    const i = Math.max(0, Math.min(maxIndex, Math.round(offsetRef.current / ROW_HEIGHT)));
    setIndex(i);
  };

  /** Correct a slightly-off row and commit the selection, if it has settled. */
  const finalise = () => {
    const snapped = clampOffset(Math.round(offsetRef.current / ROW_HEIGHT) * ROW_HEIGHT);
    if (Math.abs(snapped - offsetRef.current) > 1) {
      scrollRef.current?.scrollTo({ y: snapped, animated: true });
    } else {
      syncIndex();
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { backgroundColor: palette.surface }]}>
          <View style={[styles.grabber, { backgroundColor: palette.border }]} />

          {title !== undefined ? (
            <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>
              {title}
            </Text>
          ) : null}

          {/* Wheel viewport: exactly three rows tall. Native snapping lands on
              a row; `snapToInterval` + fast deceleration gives momentum that
              always finishes on one of them. */}
          <View style={styles.wheel}>
            <View
              pointerEvents="none"
              style={[styles.centerBand, { backgroundColor: palette.accent + '18' }]}
            />
            <View
              pointerEvents="none"
              style={[styles.bandTop, { backgroundColor: palette.border }]}
            />
            <View
              pointerEvents="none"
              style={[styles.bandBottom, { backgroundColor: palette.border }]}
            />
            <ScrollView
              ref={scrollRef}
              showsVerticalScrollIndicator={false}
              snapToInterval={ROW_HEIGHT}
              snapToStart={false}
              snapToEnd={false}
              decelerationRate="fast"
              scrollEventThrottle={16}
              onScroll={(e) => {
                offsetRef.current = e.nativeEvent.contentOffset.y;
                syncIndex();
              }}
              onScrollEndDrag={(e) => {
                // No momentum follows a gentle drag, so settle immediately.
                const v = e.nativeEvent.velocity?.y ?? 0;
                if (Math.abs(v) < 60) finalise();
              }}
              onMomentumScrollEnd={finalise}
              contentContainerStyle={styles.wheelContent}
            >
              {items.map((label, i) => {
                const active = i === index;
                return (
                  <View key={i} style={[styles.row, { height: ROW_HEIGHT }]}>
                    <Text
                      style={[
                        styles.rowText,
                        {
                          color: active ? palette.text : palette.textFaint,
                          fontSize: active ? fontSize.lg : fontSize.md,
                          fontWeight: active ? '800' : '500',
                        },
                      ]}
                    >
                      {label}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>

          <Pressable
            onPress={() => {
              const current =
                items.length > 0
                  ? Math.max(0, Math.min(maxIndex, Math.round(offsetRef.current / ROW_HEIGHT)))
                  : 0;
              const value = current === 0 ? null : REST_WHEEL_SEC[current - 1];
              onSelect(value === undefined ? null : value);
              onClose();
            }}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.done,
              { backgroundColor: palette.accent, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.doneText, { color: palette.accentText }]}>Done</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
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
  title: { fontSize: fontSize.lg, fontWeight: '700', marginBottom: spacing.md },
  wheel: {
    width: '100%',
    height: ROW_HEIGHT * 3,
    overflow: 'hidden',
    borderRadius: radius.md,
    justifyContent: 'center',
  },
  wheelContent: {
    paddingTop: ROW_HEIGHT,
    paddingBottom: ROW_HEIGHT,
  },
  row: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { fontVariant: ['tabular-nums'] },
  centerBand: {
    position: 'absolute',
    top: ROW_HEIGHT,
    left: 0,
    right: 0,
    height: ROW_HEIGHT,
  },
  bandTop: {
    position: 'absolute',
    top: ROW_HEIGHT,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
  bandBottom: {
    position: 'absolute',
    top: ROW_HEIGHT * 2,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
  done: {
    marginTop: spacing.lg,
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: { fontSize: fontSize.md, fontWeight: '700' },
});
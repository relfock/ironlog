import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { REST_WHEEL_SEC } from '@/domain/restTimer';
import { formatDuration } from '@/domain/units';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, radius, spacing } from '@/theme/tokens';

const ROW_HEIGHT = 44;
/** How long (s) a fling keeps gliding before it settles: bigger = longer. */
const MOMENTUM_TAU = 0.3;
/** Below this speed (px/s) a fling has "stopped" and the wheel snaps. */
const SETTLE_VELOCITY = 30;
/** Above this release speed (px/s) we fling; anything slower settles at once. */
const FLING_THRESHOLD = 100;
/** Cap on a fling's starting speed, so an absurd swipe cannot spin forever. */
const MAX_FLING = 5000;
/** Soft push-back at the top/bottom of the wheel when a fling runs past. */
const EDGE_BOUNCE = 0.45;

/**
 * Rest-duration picker for the routine editor and the live workout.
 *
 * A scrolling wheel from "Off" (first row) through 5 s → 5:00 in 5-second
 * steps; only three rows are ever visible and the middle one is the
 * selection.
 *
 * Momentum is CUSTOM, not a native ScrollView: Android's `snapToInterval`
 * scroll view stops dead the instant the finger lifts, so a fast wheel flick
 * never keeps spinning. Here a PanResponder tracks drags 1:1; releasing with
 * speed starts an inertial glide that decelerates exponentially (the faster
 * the flick, the farther it coasts — like Hevy's wheel) and ends with a short
 * ease-out snap onto the nearest row.
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

  const items = useMemo(() => ['Off', ...REST_WHEEL_SEC.map((s) => formatDuration(s))], []);
  const maxIndex = items.length - 1;
  const maxOffset = maxIndex * ROW_HEIGHT;

  const initialIndex = valueSec === null ? 0 : Math.min(maxIndex, Math.max(0, Math.round(valueSec / 5)));

  // The wheel's scroll offset in px, animated without the native driver so
  // momentum can clamp against the wheel's ends. `currentOffset` mirrors it
  // for the physics loop, which is fine to write to every frame.
  const offset = useMemo(() => new Animated.Value(0), []);
  const currentOffset = useRef(initialIndex * ROW_HEIGHT);
  const velocity = useRef(0);
  const startOffset = useRef(0);
  const raf = useRef<number | null>(null);
  const [index, setIndex] = useState(initialIndex);

  const indexFrom = (o: number): number =>
    Math.max(0, Math.min(maxIndex, Math.round(o / ROW_HEIGHT)));

  /** Cache the offset and repaint only when the centred row actually changes. */
  const track = (o: number) => {
    currentOffset.current = o;
    const next = indexFrom(o);
    setIndex((prev) => (prev === next ? prev : next));
  };

  const stopGlide = () => {
    if (raf.current !== null) {
      cancelAnimationFrame(raf.current);
      raf.current = null;
    }
  };

  /** Ease onto the row the wheel now sits nearest to. */
  const snapToNearest = () => {
    stopGlide();
    const target = Math.max(0, Math.min(maxOffset, Math.round(currentOffset.current / ROW_HEIGHT) * ROW_HEIGHT));
    Animated.timing(offset, {
      toValue: target,
      duration: 150,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) track(target);
    });
  };

  /** Inertial glide after a fast flick: v(t) = v0·e^(−t/τ), then snap. */
  const runGlide = (initialVelocity: number) => {
    stopGlide();
    velocity.current = initialVelocity;
    let last = Date.now();
    let first = true;
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (first) {
        first = false;
        void dt;
      }
      let v = velocity.current * Math.exp(-dt / MOMENTUM_TAU);
      if (Math.abs(v) < SETTLE_VELOCITY) {
        raf.current = null;
        snapToNearest();
        return;
      }
      let next = currentOffset.current + v * dt;
      if (next <= 0 && v < 0) {
        next = 0;
        v = -v * EDGE_BOUNCE;
      } else if (next >= maxOffset && v > 0) {
        next = maxOffset;
        v = -v * EDGE_BOUNCE;
      }
      velocity.current = v;
      offset.setValue(next);
      track(next);
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };

  const undoScrolling = () => {
    stopGlide();
    offset.stopAnimation();
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 3,
        onPanResponderGrant: () => {
          undoScrolling();
          startOffset.current = currentOffset.current;
        },
        onPanResponderMove: (_e, g) => {
          const next = Math.max(0, Math.min(maxOffset, startOffset.current - g.dy));
          offset.setValue(next);
          track(next);
        },
        onPanResponderRelease: (_e, g) => {
          const fling = -g.vy;
          if (Math.abs(fling) > FLING_THRESHOLD) {
            runGlide(Math.max(-MAX_FLING, Math.min(MAX_FLING, fling)));
          } else {
            snapToNearest();
          }
        },
        onPanResponderTerminate: () => snapToNearest(),
        onPanResponderTerminationRequest: () => true,
      }),
    // Physics helpers read refs, so the responder itself is stable.
    [maxOffset],
  );

  // Position the wheel at the current value whenever the sheet opens.
  useEffect(() => {
    if (!visible) return;
    const y = initialIndex * ROW_HEIGHT;
    stopGlide();
    offset.stopAnimation();
    offset.setValue(y);
    currentOffset.current = y;
    setIndex(initialIndex);
  }, [visible, initialIndex, offset]);

  // Kill any running glide if the component goes away mid-animation.
  useEffect(() => () => stopGlide(), []);

  const commit = () => {
    stopGlide();
    const current = Math.max(0, Math.min(maxIndex, Math.round(currentOffset.current / ROW_HEIGHT)));
    const value = current === 0 ? null : REST_WHEEL_SEC[current - 1];
    onSelect(value === undefined ? null : value);
    onClose();
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

          {/* Wheel viewport: exactly three rows tall. The marked row in the
              middle is the selection; pan handlers drive the glide. */}
          <View {...panResponder.panHandlers} style={styles.wheel}>
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
            <Animated.View
              pointerEvents="none"
              style={{
                transform: [
                  { translateY: Animated.add(Animated.multiply(offset, -1), ROW_HEIGHT) },
                ],
              }}
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
            </Animated.View>
          </View>

          <Pressable
            onPress={commit}
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
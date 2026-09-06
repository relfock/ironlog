import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Path, Svg } from 'react-native-svg';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  preferredSide,
  SLUG_LABELS,
  SLUG_TO_MUSCLES,
  type BodySide,
  type BodySlug,
  type HighlightedPart,
} from '@/domain/muscleMap';
import type { Muscle } from '@/domain/types';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, radius, spacing } from '@/theme/tokens';

interface Props {
  readonly parts: readonly HighlightedPart[];
  readonly colors: readonly string[];
  readonly onClose: () => void;
  readonly onOpenExercises: (muscles: readonly Muscle[]) => void;
}

/** Horizontal drag distance for a full front↔back turn. */
const ROTATE_PX = 220;
const MAX_SCALE = 4;
/** How long after a long-press to swallow the release tap's name pill. */
const LONG_PRESS_GRACE_MS = 650;
/** Figure at scale 1: 200×400 user units, matching react-native-body-highlighter. */
const FIGURE_WIDTH = 200;
const FIGURE_HEIGHT = 400;

interface AssetPathSet {
  readonly common?: readonly string[];
  readonly left?: readonly string[];
  readonly right?: readonly string[];
}
interface AssetPart {
  readonly slug: string;
  readonly path?: AssetPathSet;
}

// The same 23-slug artwork the library renders; we draw it ourselves so each
// Path gets its own onPress/onLongPress (the shipped <Body> only wires a tap).
const { bodyFront }: { bodyFront: AssetPart[] } = require(
  'react-native-body-highlighter/dist/assets/bodyFront.js',
);
const { bodyBack }: { bodyBack: AssetPart[] } = require(
  'react-native-body-highlighter/dist/assets/bodyBack.js',
);

/** viewBox by side, as the library's own Svg wrappers use it. */
const VIEW_BOX: Record<BodySide, string> = {
  front: '0 0 724 1448',
  back: '724 0 724 1448',
};

const STAGE_SIZE = { width: 220, height: 420 };

/**
 * The 2.5D heatmap explorer. One flat SVG figure that turns front↔back as you
 * drag sideways (a width-pinch card flip — no 3D geometry), pinches to zoom up
 * to 4x with 2D panning, and stays tappable:
 *
 *  - tap a muscle → name it and outline it;
 *  - double-tap anywhere → zoom back out completely;
 *  - hold a muscle → jump to the exercise library pre-filtered to that group.
 *
 * It is deliberately a full-screen overlay raised on top of the Home content,
 * not a route or a Modal: that keeps it inside GestureHandlerRootView (which
 * RN's <Modal> historically fights with) so pinch/pan/flip all behave.
 */
export function MuscleViewer({ parts, colors, onClose, onOpenExercises }: Props) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();

  const initialSide = useMemo(() => preferredSide(parts), [parts]);
  const [side, setSide] = useState<BodySide>(initialSide);
  const [nameSlug, setNameSlug] = useState<BodySlug | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<BodySlug | null>(null);
  const longPressedAt = useRef(0);

  // All gesture state lives in shared values so the worklets can read/write it
  // frame-synchronously; React state is only ever touched via runOnJS.
  const flip = useSharedValue(initialSide === 'back' ? 1 : 0);
  const zoom = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const flipStart = useSharedValue(0);
  const txStart = useSharedValue(0);
  const tyStart = useSharedValue(0);
  const zoomStart = useSharedValue(1);
  /** 0 = drag rotates the figure, 1 = drag pans it (only while zoomed in). */
  const mode = useSharedValue(0);
  const pastMid = useSharedValue(0);

  const setSideJS = useCallback((s: BodySide) => {
    setSide(s);
    setNameSlug(null);
    setSelectedSlug(null);
  }, []);

  const handlePartPress = useCallback((slug: string) => {
    // A press straight after a long-press is just the release of that hold.
    if (Date.now() - longPressedAt.current < LONG_PRESS_GRACE_MS) return;
    const typed = slug as BodySlug;
    setNameSlug(typed);
    setSelectedSlug(typed);
  }, []);

  const handlePartLongPress = useCallback(
    (slug: string) => {
      longPressedAt.current = Date.now();
      const muscles = SLUG_TO_MUSCLES[slug as BodySlug];
      if (muscles.length > 0) onOpenExercises(muscles);
    },
    [onOpenExercises],
  );

  const intensityBySlug = useMemo(() => {
    const map = new Map<BodySlug, number>();
    for (const p of parts) map.set(p.slug, p.intensity);
    return map;
  }, [parts]);

  // Width-pinch card flip: at flip 0/1 the figure is full width, at 0.5 it is
  // a thin line (invisible) — the side swap happens precisely in that blind spot.
  const animatedStyle = useAnimatedStyle(() => {
    const width = Math.max(0.08, Math.abs(2 * flip.value - 1));
    return {
      transform: [
        { translateX: tx.value },
        { translateY: ty.value },
        { scale: zoom.value },
        { scaleX: width },
      ],
    };
  });

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(8)
        .onStart(() => {
          flipStart.value = flip.value;
          txStart.value = tx.value;
          tyStart.value = ty.value;
          mode.value = zoom.value > 1.001 ? 1 : 0;
        })
        .onUpdate((e) => {
          if (mode.value === 1) {
            const reach = (zoom.value - 1) * 110;
            tx.value = Math.min(reach, Math.max(-reach, txStart.value + e.translationX));
            ty.value = Math.min(reach, Math.max(-reach, tyStart.value + e.translationY));
            return;
          }
          const nextFlip = Math.min(
            1,
            Math.max(0, flipStart.value + e.translationX / ROTATE_PX),
          );
          flip.value = nextFlip;
          const crossingUp = nextFlip >= 0.5 && pastMid.value === 0;
          const crossingDown = nextFlip < 0.5 && pastMid.value === 1;
          if (crossingUp || crossingDown) {
            pastMid.value = crossingUp ? 1 : 0;
            runOnJS(setSideJS)(crossingUp ? 'back' : 'front');
          }
        })
        .onEnd(() => {
          if (mode.value === 1) return;
          const back = flip.value >= 0.5;
          flip.value = withTiming(back ? 1 : 0, { duration: 180 });
          pastMid.value = 0;
          runOnJS(setSideJS)(back ? 'back' : 'front');
        }),
    [flip, flipStart, zoom, mode, pastMid, tx, ty, txStart, tyStart, setSideJS],
  );

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => {
          zoomStart.value = zoom.value;
        })
        .onUpdate((e) => {
          zoom.value = Math.min(MAX_SCALE, Math.max(1, zoomStart.value * e.scale));
        })
        .onEnd(() => {
          if (zoom.value < 1.05) {
            zoom.value = withTiming(1, { duration: 150 });
            tx.value = withTiming(0, { duration: 150 });
            ty.value = withTiming(0, { duration: 150 });
          }
        }),
    [zoom, zoomStart, tx, ty],
  );

  const doubleTap = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .onEnd(() => {
          zoom.value = withTiming(1, { duration: 150 });
          tx.value = withTiming(0, { duration: 150 });
          ty.value = withTiming(0, { duration: 150 });
        }),
    [zoom, tx, ty],
  );

  const gesture = useMemo(
    () => Gesture.Simultaneous(pan, pinch, doubleTap),
    [pan, pinch, doubleTap],
  );

  const { width: stageWidth, height: stageHeight } = STAGE_SIZE;
  const figureOffsetX = (stageWidth - FIGURE_WIDTH * 0.95) / 2;
  const figureOffsetY = (stageHeight - FIGURE_HEIGHT * 0.95) / 2;

  const assetParts: AssetPart[] = side === 'front' ? bodyFront : bodyBack;

  return (
    <View
      style={[styles.root, { backgroundColor: palette.bg, paddingTop: insets.top }]}
      accessibilityViewIsModal
    >
      <View style={styles.topRow}>
        <Text style={[styles.title, { color: palette.text }]}>Muscle heatmap</Text>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close heatmap explorer"
          hitSlop={10}
          style={[styles.closeBtn, { borderColor: palette.border }]}
        >
          <Text style={[styles.closeText, { color: palette.text }]}>✕</Text>
        </Pressable>
      </View>

      <Text style={[styles.hint, { color: palette.textMuted }]} numberOfLines={3}>
        Drag sideways to rotate · pinch to zoom · double-tap to zoom out
        {'\n'}Tap a muscle to name it · hold it to list its exercises
      </Text>

      <View style={styles.bodyArea}>
        <GestureDetector gesture={gesture}>
          <Animated.View style={[styles.stage, animatedStyle]}>
            <Svg
              viewBox={VIEW_BOX[side]}
              width={FIGURE_WIDTH * 0.95}
              height={FIGURE_HEIGHT * 0.95}
              style={{ position: 'absolute', left: figureOffsetX, top: figureOffsetY }}
              accessibilityLabel={`muscle-body-${side}`}
            >
              {assetParts.map((part) => {
                const slug = part.slug;
                const intensity = intensityBySlug.get(slug as BodySlug);
                const isSelected = selectedSlug === slug;
                const fill =
                  intensity && intensity > 0
                    ? (colors[intensity - 1] ?? palette.bodyBase)
                    : palette.bodyBase;
                const stroke = isSelected ? palette.accent : 'none';
                const strokeWidth = isSelected ? 9 : 0;
                const common = part.path?.common ?? [];
                const left = part.path?.left ?? [];
                const right = part.path?.right ?? [];
                const all = [
                  ...common.map((d, i) => ({ d, key: `${slug}-c${i}` })),
                  ...left.map((d, i) => ({ d, key: `${slug}-l${i}` })),
                  ...right.map((d, i) => ({ d, key: `${slug}-r${i}` })),
                ];
                return all.map(({ d, key }) => (
                  <Path
                    key={key}
                    id={slug}
                    d={d}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                    onPress={() => handlePartPress(slug)}
                    onLongPress={() => handlePartLongPress(slug)}
                  />
                ));
              })}
            </Svg>
          </Animated.View>
        </GestureDetector>

        {nameSlug ? (
          <View
            style={[
              styles.namePill,
              { backgroundColor: palette.surfaceRaised, borderColor: palette.border },
            ]}
          >
            <Text style={[styles.nameText, { color: palette.text }]}>
              {SLUG_LABELS[nameSlug]}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.footRow}>
        <Text style={[styles.footText, { color: palette.textFaint }]}>
          {side === 'front' ? 'Front view' : 'Back view'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.md + 4,
  },
  title: { fontSize: fontSize.lg, fontWeight: '700' },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  closeText: { fontSize: fontSize.md, lineHeight: fontSize.md + 2 },
  hint: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  bodyArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stage: {
    width: STAGE_SIZE.width,
    height: STAGE_SIZE.height,
    alignItems: 'center',
    justifyContent: 'center',
  },
  namePill: {
    position: 'absolute',
    bottom: spacing.xl,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  nameText: { fontSize: fontSize.md, fontWeight: '700' },
  footRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingBottom: spacing.lg,
    paddingTop: spacing.xs,
  },
  footText: { fontSize: fontSize.sm },
});
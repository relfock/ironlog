/**
 * Exercise demonstration clip, played straight out of the APK.
 *
 * The clips ship as RAW Android assets (see plugins/withExerciseMedia.js), so a
 * slug resolves to a real file URI. media3's `DefaultDataSource` dispatches
 * `file:///android_asset/...` to its `AssetDataSource`, which reads the entry
 * with `AssetManager.open(path, ACCESS_RANDOM)`. That path only performs because
 * the entry is stored uncompressed — the `noCompress 'mp4'` half of the plugin.
 *
 * MUTED, ALWAYS. These are silent form demos; audio would only ever be an
 * artefact, and a screen that starts making noise on open is hostile. Muted also
 * makes the default `audioMixingMode` ('auto') leave other apps' audio alone, so
 * opening an exercise does not stop the user's music.
 *
 * NATIVE CONTROLS DISABLED. A scrubber, timecode and volume slider are noise on
 * a silent 15-second loop. The whole surface is a play/pause toggle instead.
 * Fullscreen adds: play/pause, pinch-to-zoom, and a slider for zoom level.
 */
import React, { useCallback, useContext, useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { NavigationContext } from '@react-navigation/native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useEvent } from 'expo';
import { VideoView, useVideoPlayer } from 'expo-video';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, radius, spacing } from '@/theme/tokens';

/** Every clip in the catalogue is 16:9, so the box can be sized before load. */
const SOURCE_ASPECT = 16 / 9;
const DEFAULT_SCALE = 1.0;
const MIN_SCALE = 1.0;
const MAX_SCALE = 3.0;

export interface ExerciseVideoProps {
  /** Catalogue slug; resolves to file:///android_asset/exercises/<slug>.mp4. Null renders the fallback. */
  readonly slug: string | null | undefined;
  /** Rendered width in dp; height follows the 16:9 source aspect. */
  readonly width: number;
  /** Start playing as soon as the player is ready. Default true. */
  readonly autoPlay?: boolean;
  /** Loop the clip. Default true. */
  readonly loop?: boolean;
  /** Rendered when the slug is null or the file is missing. */
  readonly fallback?: React.ReactNode;
}

function assetUri(slug: string): string {
  return `file:///android_asset/exercises/${slug}.mp4`;
}

/**
 * True while the enclosing screen is the focused one.
 *
 * expo-video already pauses a playing view when the APP goes to the background —
 * its `VideoManager` does this for any player with `staysActiveInBackground`
 * false, which is the default — but it knows nothing about navigation. A screen
 * pushed onto a stack stays mounted, so without this the clip underneath keeps
 * decoding forever.
 *
 * Read through `NavigationContext` rather than `useIsFocused()` so the component
 * also works outside a navigator (sheets, previews, tests), where that hook
 * throws.
 */
function useScreenFocus(): boolean {
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState(true);

  useEffect(() => {
    if (navigation === undefined) return;
    setFocused(navigation.isFocused());
    const offFocus = navigation.addListener('focus', () => setFocused(true));
    const offBlur = navigation.addListener('blur', () => setFocused(false));
    return () => {
      offFocus();
      offBlur();
    };
  }, [navigation]);

  return focused;
}

async function lockLandscape(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
  } catch {
    /* device may not support orientation control */
  }
}

async function lockPortrait(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT);
  } catch {
    /* device may not support orientation control */
  }
}

export function ExerciseVideo({
  slug,
  width,
  autoPlay = true,
  loop = true,
  fallback = null,
}: ExerciseVideoProps): React.ReactElement {
  const palette = usePalette();
  const focused = useScreenFocus();
  const [paused, setPaused] = useState(!autoPlay);
  const [firstFrame, setFirstFrame] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [showScaleSlider, setShowScaleSlider] = useState(false);
  const { width: screenW, height: screenH } = useWindowDimensions();

  const uri = slug === null || slug === undefined ? null : assetUri(slug);

  // `setup` runs once per source, so anything that can change afterwards is
  // mirrored in an effect below rather than set here.
  const player = useVideoPlayer(uri, (instance) => {
    instance.muted = true;
    instance.loop = loop;
    if (autoPlay) instance.play();
  });

  const { status } = useEvent(player, 'statusChange', { status: player.status });

  useEffect(() => {
    player.loop = loop;
  }, [player, loop]);

  // A manual pause has to survive a blur/focus round trip, hence two flags
  // rather than calling play() on focus unconditionally. The player is owned by
  // `useVideoPlayer`, which releases it on unmount, so there is nothing to tear
  // down here.
  useEffect(() => {
    if (focused && !paused) player.play();
    else player.pause();
  }, [player, focused, paused]);

  useEffect(() => {
    setFirstFrame(false);
  }, [uri]);

  const togglePause = useCallback(() => setPaused((was) => !was), []);

  const openFs = useCallback(async () => {
    setFullscreen(true);
    await lockLandscape();
  }, []);

  const closeFs = useCallback(async () => {
    setFullscreen(false);
    setShowScaleSlider(false);
    await lockPortrait();
  }, []);

  const height = Math.round(width / SOURCE_ASPECT);
  const box = { width, height };

  // ── Fullscreen dimensions ────────────────────────────────────────
  // After the orientation lock the screen dimensions update to landscape.
  // Compute from whichever axis is wider so the video always fills the
  // landscape width with small padding.
  const fsLandscapeW = Math.max(screenW, screenH);
  const fsPadding = spacing.lg;
  const fsVideoW = fsLandscapeW - fsPadding * 2;
  const fsVideoH = Math.round(fsVideoW / SOURCE_ASPECT);
  const fsBox = { width: fsVideoW, height: fsVideoH };

  // ── Pinch-to-zoom (fullscreen only) ─────────────────────────────
  // `baseScale` = the settled scale (slider or last pinch end).
  // `pinchScale` = the live pinch multiplier, animated each frame.
  // Visual = baseScale * pinchScale.  On pinch end, collapse into baseScale.
  const baseScale = useSharedValue(DEFAULT_SCALE);
  const pinchScale = useSharedValue(1);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      // Clamp so the product never leaves [MIN_SCALE, MAX_SCALE].
      const raw = baseScale.value * e.scale;
      pinchScale.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE, raw)) / baseScale.value;
    })
    .onEnd(() => {
      const final = baseScale.value * pinchScale.value;
      baseScale.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE, final));
      pinchScale.value = 1;
      // Sync React state so the slider reflects the new value.
      setScale(baseScale.value);
    });

  // Single-finger tap (play/pause) must coexist with the pinch.
  const tapGesture = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd(() => {
      togglePause();
    });

  const composedGesture = Gesture.Simultaneous(pinchGesture, tapGesture);

  const animatedPinchStyle = useAnimatedStyle(() => ({
    transform: [{ scale: baseScale.value * pinchScale.value }],
  }));

  // Sync slider changes into the shared value so pinch starts from the right base.
  const onSliderChange = useCallback(
    (v: number) => {
      setScale(v);
      baseScale.value = v;
    },
    [baseScale],
  );

  // 'error' is how a missing asset surfaces: AssetDataSource throws and the
  // player never leaves the error state, so there is nothing to wait for.
  if (uri === null || status === 'error') {
    return <View style={[box, styles.centre]}>{fallback}</View>;
  }

  return (
    <>
      {/* ── Inline view ────────────────────────────────────────────── */}
      <Pressable
        onPress={togglePause}
        accessibilityRole="button"
        accessibilityLabel={paused ? 'Play demonstration' : 'Pause demonstration'}
        style={[box, styles.frame, { backgroundColor: palette.surfaceRaised }]}
      >
        <View style={styles.zoomContainer}>
          <VideoView
            player={player}
            style={[styles.zoomedVideo, { transform: [{ scale }] }]}
            nativeControls={false}
            contentFit="contain"
            onFirstFrameRender={() => setFirstFrame(true)}
          />
        </View>

        {firstFrame ? null : (
          <View
            style={[styles.placeholder, { backgroundColor: palette.surfaceRaised }]}
            pointerEvents="none"
          />
        )}

        {/* Play/pause overlay — bottom-left corner, always visible */}
        <Pressable
          onPress={togglePause}
          hitSlop={8}
          style={[styles.playBtn, { backgroundColor: palette.surfaceRaised + 'CC' }]}
          accessibilityLabel={paused ? 'Play' : 'Pause'}
        >
          <Text style={{ color: palette.text, fontSize: fontSize.lg }}>{paused ? '▶' : '⏸'}</Text>
        </Pressable>

        {/* Expand button — bottom-right corner */}
        <Pressable
          onPress={openFs}
          hitSlop={8}
          style={[styles.expandBtn, { backgroundColor: palette.surfaceRaised + 'CC' }]}
          accessibilityLabel="Fullscreen"
        >
          <Text style={{ color: palette.text, fontSize: fontSize.sm }}>⛶</Text>
        </Pressable>
      </Pressable>

      {/* ── Fullscreen modal ───────────────────────────────────────── */}
      <Modal
        visible={fullscreen}
        animationType="fade"
        supportedOrientations={['landscape', 'portrait']}
        onRequestClose={closeFs}
        statusBarTranslucent
      >
        <View style={[styles.fsRoot, { backgroundColor: palette.bg }]}>
          {/* Close button — top-left */}
          <Pressable
            onPress={closeFs}
            hitSlop={12}
            style={[styles.closeBtn, { backgroundColor: palette.surfaceRaised + 'CC' }]}
            accessibilityLabel="Close fullscreen"
          >
            <Text style={{ color: palette.text, fontSize: fontSize.lg, fontWeight: '700' }}>
              ✕
            </Text>
          </Pressable>

          {/* Video — pinch-to-zoom + tap-to-pause */}
          <GestureDetector gesture={composedGesture}>
            <View style={styles.fsVideoArea}>
              <Animated.View style={[fsBox, styles.frame, { backgroundColor: palette.surfaceRaised }, animatedPinchStyle]}>
                <View style={styles.zoomContainer}>
                  <VideoView
                    player={player}
                    style={styles.zoomedVideo}
                    nativeControls={false}
                    contentFit="contain"
                  />
                </View>
              </Animated.View>
            </View>
          </GestureDetector>

          {/* Bottom controls */}
          <View style={styles.fsControls}>
            {/* Play/pause */}
            <Pressable
              onPress={togglePause}
              hitSlop={10}
              style={[styles.controlBtn, { backgroundColor: palette.surfaceRaised + 'CC' }]}
              accessibilityLabel={paused ? 'Play' : 'Pause'}
            >
              <Text style={{ color: palette.text, fontSize: fontSize.xl }}>
                {paused ? '▶' : '⏸'}
              </Text>
            </Pressable>

            {/* Scale toggle */}
            <Pressable
              onPress={() => setShowScaleSlider((v) => !v)}
              hitSlop={10}
              style={[styles.controlBtn, { backgroundColor: palette.surfaceRaised + 'CC' }]}
              accessibilityLabel="Adjust zoom"
            >
              <Text
                style={{
                  color: showScaleSlider ? palette.accent : palette.text,
                  fontSize: fontSize.lg,
                  fontWeight: '700',
                }}
              >
                🔍
              </Text>
            </Pressable>
          </View>

          {/* Scale slider — slides in below controls */}
          {showScaleSlider ? (
            <View style={styles.sliderRow}>
              <Text style={[styles.sliderLabel, { color: palette.textMuted }]}>1×</Text>
              <Slider
                value={scale}
                minimumValue={MIN_SCALE}
                maximumValue={MAX_SCALE}
                step={0.05}
                onValueChange={onSliderChange}
                minimumTrackTintColor={palette.accent}
                maximumTrackTintColor={palette.border}
                thumbTintColor={palette.accent}
                style={styles.slider}
              />
              <Text style={[styles.sliderLabel, { color: palette.textMuted }]}>3×</Text>
              <Text style={[styles.scaleValue, { color: palette.text }]}>
                {scale.toFixed(1)}×
              </Text>
            </View>
          ) : null}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center' },
  frame: { borderRadius: radius.md, overflow: 'hidden' },
  zoomContainer: { flex: 1, overflow: 'hidden' },
  zoomedVideo: { flex: 1 },
  placeholder: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },

  /* Inline expand button */
  expandBtn: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Inline play/pause button */
  playBtn: {
    position: 'absolute',
    left: spacing.sm,
    bottom: spacing.sm,
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Fullscreen */
  fsRoot: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  closeBtn: {
    position: 'absolute',
    top: spacing.xl,
    left: spacing.lg,
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  fsVideoArea: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  fsControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xl,
    paddingVertical: spacing.md,
  },
  controlBtn: {
    minWidth: 52,
    minHeight: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
  },

  /* Scale slider */
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  slider: { flex: 1, height: 40 },
  sliderLabel: { fontSize: fontSize.sm, fontWeight: '600', minWidth: 24, textAlign: 'center' },
  scaleValue: { fontSize: fontSize.sm, fontWeight: '700', minWidth: 36, textAlign: 'center' },
});

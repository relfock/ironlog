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
 * NO NATIVE CONTROLS. A scrubber, timecode and volume slider are noise on a
 * silent 15-second loop. The one control worth having is stop-on-a-position, so
 * the whole surface is a play/pause toggle instead — the full affordance, none of
 * the chrome.
 */
import React, { useContext, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { NavigationContext } from '@react-navigation/native';
import { useEvent } from 'expo';
import { VideoView, useVideoPlayer } from 'expo-video';
import { usePalette } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';

/** Every clip in the catalogue is 16:9, so the box can be sized before load. */
const SOURCE_ASPECT = 16 / 9;

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

  const height = Math.round(width / SOURCE_ASPECT);
  const box = { width, height };

  // 'error' is how a missing asset surfaces: AssetDataSource throws and the
  // player never leaves the error state, so there is nothing to wait for.
  if (uri === null || status === 'error') {
    return <View style={[box, styles.centre]}>{fallback}</View>;
  }

  return (
    <Pressable
      onPress={() => setPaused((was) => !was)}
      accessibilityRole="button"
      accessibilityLabel={paused ? 'Play demonstration' : 'Pause demonstration'}
      style={[box, styles.frame, { backgroundColor: palette.surfaceRaised }]}
    >
      <VideoView
        player={player}
        style={styles.fill}
        nativeControls={false}
        contentFit="contain"
        onFirstFrameRender={() => setFirstFrame(true)}
      />
      {/*
        Held at the final size from the first render so the layout never shifts.
        `useExoShutter` is off by default on Android, which would otherwise leave
        the surface transparent — and a themed panel beats ExoPlayer's black one
        in light mode.
      */}
      {firstFrame ? null : (
        <View
          style={[styles.placeholder, { backgroundColor: palette.surfaceRaised }]}
          pointerEvents="none"
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center' },
  frame: { borderRadius: radius.md, overflow: 'hidden' },
  fill: { flex: 1 },
  placeholder: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
});

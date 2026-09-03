import React, { useMemo } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { Body, Caption, Card, H1, H2 } from '@/components/ui';
import { ALL_EXERCISES } from '@/data/exercises';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, spacing } from '@/theme/tokens';

/**
 * Attribution screen, derived from the catalogue rather than hand-written.
 *
 * Every entry carries the `url` its prose, figure and video came from, so the
 * source list below is computed from those URLs and cannot drift from what was
 * actually shipped — the same property the old Commons manifest gave us.
 *
 * The licence of that material is NOT settled; see docs/ART_LICENSING.md. This
 * screen therefore states where the material came from and links to it, and
 * deliberately makes no licence claim on its behalf. Do not add one here
 * without a licence to point at.
 */
export function CreditsScreen() {
  const palette = usePalette();

  const sources = useMemo(() => {
    const hosts = new Map<string, number>();
    for (const ex of ALL_EXERCISES) {
      // Hand-rolled rather than `new URL()`: Hermes has it, but a malformed
      // entry would throw during render, and the credits screen is the last
      // place worth crashing over a string.
      const host = /^https?:\/\/([^/]+)/.exec(ex.url)?.[1];
      if (host === undefined) continue;
      hosts.set(host, (hosts.get(host) ?? 0) + 1);
    }
    return [...hosts].sort((a, b) => b[1] - a[1]);
  }, []);

  const link = (url: string, label: string) => (
    <Pressable onPress={() => void Linking.openURL(url).catch(() => {})}>
      <Text
        style={{
          color: palette.accent,
          fontSize: fontSize.sm,
          textDecorationLine: 'underline',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <H1>Credits</H1>
      <Caption style={{ marginTop: 2 }}>{ALL_EXERCISES.length} exercises</Caption>

      <Card style={{ marginTop: spacing.lg }}>
        <H2>Exercise catalogue</H2>
        <Body muted style={{ marginTop: spacing.sm, fontSize: fontSize.sm }}>
          Exercise names, instructions, common-mistake notes, muscle-worked figures
          and demonstration videos are derived from the pages listed below. Each
          exercise links to the page it came from on its own detail screen.
        </Body>
        {sources.map(([host, count]) => (
          <Body key={host} style={{ marginTop: spacing.sm }}>
            {count} exercise{count === 1 ? '' : 's'} from{' '}
            <Text style={{ fontWeight: '700' }}>{host}</Text>
          </Body>
        ))}
        {sources[0] !== undefined
          ? link(`https://${sources[0][0]}`, `Visit ${sources[0][0]}`)
          : null}
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <H2>Volume heatmap</H2>
        <Body style={{ marginTop: spacing.sm }}>
          Body artwork from{' '}
          <Text style={{ fontWeight: '700' }}>react-native-body-highlighter</Text>,
          © 2022 ELABBASSI Hicham, MIT licence.
        </Body>
        {link('https://github.com/HichamELBSI/react-native-body-highlighter', 'View project')}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
});

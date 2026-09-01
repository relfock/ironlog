import React, { useMemo } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { Body, Caption, Card, H1, H2 } from '@/components/ui';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, spacing } from '@/theme/tokens';
import artManifest from '../../../assets/art/manifest.json';

interface ManifestShape {
  harvestedAt: string;
  category: string;
  artists: string[];
  licenses: string[];
  entries: {
    exerciseSlug: string;
    commonsStem: string;
    artist: string;
    license: string;
    licenseUrl: string | null;
    sourcePages: string[];
  }[];
}

/**
 * Attribution screen, generated from `assets/art/manifest.json`.
 *
 * This is a licence obligation, not a courtesy: the bundled illustrations are
 * CC BY-SA 3.0, which requires attribution. Generating it from the manifest
 * snapshot means it always describes what was actually shipped, and cannot
 * drift out of date when the catalogue changes.
 */
export function CreditsScreen() {
  const palette = usePalette();
  const manifest = artManifest as ManifestShape;

  const grouped = useMemo(() => {
    const byArtistLicence = new Map<string, { count: number; licenseUrl: string | null }>();
    for (const e of manifest.entries) {
      const key = `${e.artist}||${e.license}`;
      const existing = byArtistLicence.get(key);
      byArtistLicence.set(key, {
        count: (existing?.count ?? 0) + 1,
        licenseUrl: existing?.licenseUrl ?? e.licenseUrl,
      });
    }
    return [...byArtistLicence.entries()].map(([key, v]) => {
      const [artist, license] = key.split('||');
      return { artist: artist ?? 'Unknown', license: license ?? '', ...v };
    });
  }, [manifest.entries]);

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
      <Caption style={{ marginTop: 2 }}>
        Artwork harvested {new Date(manifest.harvestedAt).toLocaleDateString()}
      </Caption>

      <Card style={{ marginTop: spacing.lg }}>
        <H2>Exercise illustrations</H2>
        {grouped.map((g) => (
          <Body key={`${g.artist}-${g.license}`} style={{ marginTop: spacing.sm }}>
            {g.count} illustration set{g.count === 1 ? '' : 's'} by{' '}
            <Text style={{ fontWeight: '700' }}>{g.artist}</Text>, licensed under{' '}
            <Text style={{ fontWeight: '700' }}>{g.license}</Text>.
          </Body>
        ))}

        <Body muted style={{ marginTop: spacing.md, fontSize: fontSize.sm }}>
          Sourced from Wikimedia Commons, {manifest.category}. The illustrations are
          bundled unmodified; colour is applied when they are drawn, so the files
          themselves are exactly as published.
        </Body>

        <Body muted style={{ marginTop: spacing.md, fontSize: fontSize.sm }}>
          You are free to extract these illustrations from this app and reuse them under
          their licence. Nothing in IronLog's terms restricts that.
        </Body>

        {manifest.entries[0]?.licenseUrl != null
          ? link(manifest.entries[0].licenseUrl, 'Read the CC BY-SA 3.0 licence')
          : null}
        {link(
          `https://commons.wikimedia.org/wiki/${encodeURIComponent(manifest.category)}`,
          'View the source category on Commons',
        )}
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <H2>Muscle map</H2>
        <Body style={{ marginTop: spacing.sm }}>
          Body artwork from{' '}
          <Text style={{ fontWeight: '700' }}>react-native-body-highlighter</Text>,
          © 2022 ELABBASSI Hicham, MIT licence.
        </Body>
        {link('https://github.com/HichamELBSI/react-native-body-highlighter', 'View project')}
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <H2>Exercise data</H2>
        <Body muted style={{ marginTop: spacing.sm, fontSize: fontSize.sm }}>
          Exercise names, equipment and muscle mappings are hand-curated for IronLog.
          No instruction text is included: the descriptions circulated with most open
          exercise datasets are copied from a commercial source, so they are deliberately
          left out rather than reproduced.
        </Body>
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <H2>Per-exercise attribution</H2>
        <Caption style={{ marginTop: spacing.xs }}>
          {manifest.entries.length} illustrated exercises
        </Caption>
        {manifest.entries.map((e) => (
          <Body
            key={e.exerciseSlug}
            muted
            style={{ marginTop: spacing.xs, fontSize: fontSize.xs }}
          >
            {e.commonsStem} — {e.artist}, {e.license}
          </Body>
        ))}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
});

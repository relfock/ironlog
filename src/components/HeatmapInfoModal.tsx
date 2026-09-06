import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { WEEKLY_SETS_ZONES } from '@/domain/trainingVolume';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, radius, spacing } from '@/theme/tokens';

/**
 * Pop-up that explains the muscle heatmap and the science behind the zones.
 * Rendered as the app's standard bottom sheet so it looks native everywhere.
 */
export function HeatmapInfoModal({
  visible,
  colors,
  onClose,
}: {
  visible: boolean;
  colors: readonly string[];
  onClose: () => void;
}) {
  const palette = usePalette();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close">
        <Pressable style={[styles.sheet, { backgroundColor: palette.surface }]} onPress={() => {}}>
          <View style={[styles.grabber, { backgroundColor: palette.border }]} />
          <Text style={[styles.title, { color: palette.text }]}>How the muscle heatmap works</Text>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.paragraph, { color: palette.textMuted }]}>
              Each muscle is coloured by your work sets in the{"\u00A0"}selected week — not by
              weight lifted. A work set is a hard set taken close to failure; warm-up sets don't
              count unless “Count warm-ups in stats” is enabled, and muscles worked as secondary
              receive half the credit.
            </Text>

            <Text style={[styles.subTitle, { color: palette.text }]}>The zones</Text>
            {WEEKLY_SETS_ZONES.map((z) => (
              <View key={z.heatLevel} style={styles.zoneRow}>
                <View
                  style={[
                    styles.swatch,
                    { backgroundColor: colors[z.heatLevel - 1] ?? palette.bodyPrimary },
                  ]}
                />
                <Text style={[styles.zoneName, { color: palette.text }]}>{z.label}</Text>
                <Text style={[styles.zoneDesc, { color: palette.textMuted }]}>
                  {z.maxWeeklySets === null
                    ? `${z.minWeeklySets}+ sets/wk`
                    : `${z.minWeeklySets}–${z.maxWeeklySets - 1} sets/wk`}{' '}
                  — {zoneNote(z)}
                </Text>
              </View>
            ))}

            <Text style={[styles.subTitle, { color: palette.text }]}>Why sets and not weight × reps?</Text>
            <Text style={[styles.paragraph, { color: palette.textMuted }]}>
              The research on muscle growth measures the training dose in effective sets per muscle
              per week. Total tonnage (kg × reps) isn't comparable across lifters or muscles — a
              90 kg machine press is a very different effort than a 90 kg deadlift — so it isn't a
              reliable yardstick for a heatmap.
            </Text>

            <Text style={[styles.subTitle, { color: palette.text }]}>The evidence</Text>
            <Text style={[styles.paragraph, { color: palette.textMuted }]}>
              • Schoenfeld, Ogborn &amp; Krieger (2017), J Strength Cond Res — a meta-analysis of
              the dose-response: growth rises with weekly sets up to ~10 per muscle, then tapers.{"\n\n"}
              • Schoenfeld et al. (2016), Med Sci Sports Exerc — a trial in trained men: 10
              sets/week beat 5, which beat 3, for chest and arm growth.{"\n\n"}
              • Krieger (2010), J Strength Cond Res — a meta-analysis: multiple sets per exercise
              produce roughly 40% more growth than a single set.{"\n\n"}
              • The 10–20 sets/week “Optimal” zone is the common periodisation landmark used in
              program design (e.g. Renaissance Periodization volume landmarks).
            </Text>

            <Text style={[styles.disclaimer, { color: palette.textFaint }]}>
              This is general guidance from the training literature, not a personalised
              prescription.
            </Text>
          </ScrollView>

          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.close,
              { backgroundColor: palette.accent, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.closeText, { color: palette.accentText }]}>Got it</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function zoneNote(z: (typeof WEEKLY_SETS_ZONES)[number]): string {
  switch (z.heatLevel) {
    case 1:
      return 'very high, diminishing returns';
    case 2:
      return 'the growth-optimal range';
    case 3:
      return 'some stimulus, below the zone';
    default:
      return 'minimal, maintenance-level';
  }
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.xl,
    paddingBottom: spacing.lg,
    maxHeight: '85%',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    marginBottom: spacing.md,
  },
  // Without flexShrink (and minHeight: 0) this grows to its full content
  // height and the sheet exceeds maxHeight, so the body never scrolls.
  scroll: { flexShrink: 1, minHeight: 0 },
  scrollContent: { paddingBottom: spacing.sm },
  title: { fontSize: fontSize.lg, fontWeight: '700', marginBottom: spacing.sm },
  paragraph: { fontSize: fontSize.sm, lineHeight: 20, marginBottom: spacing.md },
  subTitle: { fontSize: fontSize.md, fontWeight: '700', marginTop: spacing.md, marginBottom: spacing.xs },
  zoneRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  zoneName: { fontSize: fontSize.sm, fontWeight: '600' },
  zoneDesc: {
    flex: 1,
    fontSize: fontSize.sm,
    lineHeight: 18,
    marginLeft: spacing.xs,
  },
  disclaimer: { fontSize: fontSize.xs, marginTop: spacing.md },
  close: {
    alignSelf: 'center',
    marginTop: spacing.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
  },
  closeText: { fontSize: fontSize.md, fontWeight: '700' },
});
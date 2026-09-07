import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  ageFactor,
  MUSCLE_RECOVERY_HOURS,
  RECOVERY_ZONES,
  sexFactor,
} from '@/domain/muscleRecovery';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, radius, spacing } from '@/theme/tokens';
import type { Sex } from '@/domain/types';

/**
 * Pop-up explaining the muscle recovery map and the science behind it —
 * the volume-weighted fatigue model, per-muscle windows, and the age/sex
 * modifiers currently in effect for this user.
 */
export function RecoveryInfoModal({
  visible,
  colors,
  birthYear,
  sex,
  onClose,
}: {
  visible: boolean;
  colors: readonly string[];
  birthYear: number | null;
  sex: Sex | null;
  onClose: () => void;
}) {
  const palette = usePalette();

  const windows = [...Object.entries(MUSCLE_RECOVERY_HOURS)]
    .filter(([, hours]) => hours > 0)
    .sort((a, b) => a[1] - b[1]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close">
        <Pressable style={[styles.sheet, { backgroundColor: palette.surface }]} onPress={() => {}}>
          <View style={[styles.grabber, { backgroundColor: palette.border }]} />
          <Text style={[styles.title, { color: palette.text }]}>How the muscle recovery map works</Text>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.paragraph, { color: palette.textMuted }]}>
              Each muscle is coloured by how recovered it is{"\u00A0"}right now, based on the
              last 7 days of training. Green means ready to train hard again; red means a recent
              heavy session is still in the repair shop. A muscle with no sets in the last 7 days
              stays grey.
            </Text>

            <Text style={[styles.subTitle, { color: palette.text }]}>The zones</Text>
            {RECOVERY_ZONES.map((z) => (
              <View key={z.level} style={styles.zoneRow}>
                <View
                  style={[styles.swatch, { backgroundColor: colors[z.level - 1] ?? palette.bodyBase }]}
                />
                <Text style={[styles.zoneName, { color: palette.text }]}>{z.label}</Text>
                <Text style={[styles.zoneDesc, { color: palette.textMuted }]}>
                  {z.legendLabel} — {z.note}
                </Text>
              </View>
            ))}

            <Text style={[styles.subTitle, { color: palette.text }]}>How fatigue is counted</Text>
            <Text style={[styles.paragraph, { color: palette.textMuted }]}>
              Every completed work set adds fatigue to the muscles it trains — full credit to
              primary muscles, half to secondary. Harder sets add more: drop sets and
              failure sets count extra, and a logged RPE of 7 or higher adds a little more.
              Warm-ups only count if “Count warm-ups in stats” is on. That fatigue then fades
              along each muscle's own recovery curve — small muscles clear in a day, large ones
              take three. Only the last 7 days are considered; anything older has already faded
              to nothing.
            </Text>

            <Text style={[styles.subTitle, { color: palette.text }]}>Recovery windows by muscle</Text>
            {windows.map(([muscle, hours]) => (
              <View key={muscle} style={styles.windowRow}>
                <Text style={[styles.windowName, { color: palette.text }]}>{muscleLabel(muscle)}</Text>
                <Text style={[styles.windowHours, { color: palette.textMuted }]}>
                  ~{hours}h
                </Text>
              </View>
            ))}

            <Text style={[styles.subTitle, { color: palette.text }]}>Your modifiers</Text>
            <Text style={[styles.paragraph, { color: palette.textMuted }]}>
              {birthYear !== null
                ? `Age: ${currentAge(birthYear)} (recovery ${Math.round(ageFactor(birthYear) * 100)}% of baseline). `
                : 'Age is not set, so no age modifier applies. '}
              {sex !== null
                ? `Sex: ${sex === 'female' ? 'female' : 'male'} (recovery ${Math.round(sexFactor(sex) * 100)}% of baseline). `
                : 'Sex is not set, so no sex modifier applies. '}
              Set both in Profile → General settings.
            </Text>

            <Text style={[styles.subTitle, { color: palette.text }]}>The evidence</Text>
            <Text style={[styles.paragraph, { color: palette.textMuted }]}>
              • Morán-Navarro et al. (2017), J Strength Cond Res — after moderate-to-hard
              sessions, neuromuscular performance was restored within 48–72h; training to failure
              recovered slower than stopping short of it. This is why the map reads green around
              one recovery window after a normal session.{"\n\n"}
              • Beardsley et al. — recovery time tracks muscle fibre type: slow-twitch-loaded
              muscles (calves, abs) regenerate faster than fast-twitch, large muscles.{"\n\n"}
              • Damas et al. (2015), Sports Med — the muscle-protein synthesis window lengthens
              with age, which is why older trainees need longer.{"\n\n"}
              • Sex — controlled studies on acute recovery in men vs women are mixed; any faster
              recovery is modest, so sex only nudges the windows slightly.
            </Text>

            <Text style={[styles.disclaimer, { color: palette.textFaint }]}>
              "Recovered" (green) means force output is back near baseline — typically within the
              declared window (~48h chest, ~72h back/quads) for a normal session. Very heavy or
              to-failure days can stay amber longer, and any single session's fatigue fades
              exponentially, so "100% recovered" is ~8% of a heavy day's load. The 0–100% scale
              and zone labels are an approximation anchored to these windows, not a prediction.
              This is general guidance from the training literature, not a medical or
              personalised prescription — individual variation of ±20% is normal.
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

function muscleLabel(muscle: string): string {
  const toTitle = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
  return toTitle(muscle);
}

function currentAge(birthYear: number): number {
  return Math.max(0, new Date().getFullYear() - birthYear);
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
  scroll: { flexShrink: 1, minHeight: 0 },
  scrollContent: { paddingBottom: spacing.sm },
  title: { fontSize: fontSize.lg, fontWeight: '700', marginBottom: spacing.sm },
  paragraph: { fontSize: fontSize.sm, lineHeight: 20, marginBottom: spacing.md },
  subTitle: { fontSize: fontSize.md, fontWeight: '700', marginTop: spacing.md, marginBottom: spacing.xs },
  zoneRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  zoneName: { fontSize: fontSize.sm, fontWeight: '600', width: 112 },
  zoneDesc: { flex: 1, fontSize: fontSize.sm, lineHeight: 18 },
  windowRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  windowName: { fontSize: fontSize.sm },
  windowHours: { fontSize: fontSize.sm },
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
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TapeFigure } from '@/components/TapeFigure';
import { MEASUREMENT_LABELS, type MeasurementKind } from '@/db/repositories/measurements';
import {
  MEASUREMENT_GUIDES,
  guideKeyFor,
  type GuideMethod,
  type MeasurementGuide,
} from '@/data/measurementGuides';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, radius, spacing } from '@/theme/tokens';

const METHOD_LABELS: Readonly<Record<GuideMethod, string>> = {
  tape: 'Flexible tape measure',
  scale: 'Bathroom scale',
  impedance: 'Smart scale (bioimpedance)',
};

export function MeasurementGuideSheet({
  visible,
  kind,
  onClose,
}: {
  visible: boolean;
  kind: MeasurementKind | null;
  onClose: () => void;
}) {
  const palette = usePalette();
  const guide: MeasurementGuide | null = kind === null ? null : MEASUREMENT_GUIDES[guideKeyFor(kind)];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close">
        <Pressable style={[styles.sheet, { backgroundColor: palette.surface }]} onPress={() => {}}>
          <View style={[styles.grabber, { backgroundColor: palette.border }]} />

          {guide !== null ? (
            <>
              <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
              >
                <Text style={[styles.title, { color: palette.text }]}>
                  {kind === null ? '' : MEASUREMENT_LABELS[kind]}
                </Text>

                <View style={[styles.badge, { backgroundColor: palette.surfaceRaised, borderColor: palette.border }]}>
                  <Text style={[styles.badgeText, { color: palette.textMuted }]}>
                    {METHOD_LABELS[guide.method]}
                  </Text>
                </View>

                {guide.tape !== undefined ? (
                  <View style={styles.figure}>
                    <TapeFigure site={guide.tape} />
                  </View>
                ) : null}

                <Text style={[styles.subTitle, { color: palette.text }]}>Where you measure</Text>
                <Text style={[styles.body, { color: palette.textMuted }]}>{guide.site}</Text>

                <Text style={[styles.subTitle, { color: palette.text }]}>How</Text>
                {guide.steps.map((step, i) => (
                  <View key={i} style={styles.stepRow}>
                    <Text style={[styles.stepIndex, { color: palette.accent }]}>{i + 1}.</Text>
                    <Text style={[styles.stepText, { color: palette.textMuted }]}>{step}</Text>
                  </View>
                ))}

                <Text style={[styles.subTitle, { color: palette.text }]}>Doing it right</Text>
                {guide.tips.map((tip, i) => (
                  <View key={i} style={styles.stepRow}>
                    <Text style={[styles.stepIndex, { color: palette.accent }]}>•</Text>
                    <Text style={[styles.stepText, { color: palette.textMuted }]}>{tip}</Text>
                  </View>
                ))}

                <Text style={[styles.note, { color: palette.textFaint }]}>
                  For the most useful trend, always measure the same side, at the same time of
                  day, with the same tape and routine — and judge progress over weeks, not single
                  days.
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
            </>
          ) : null}
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
    paddingBottom: spacing.lg,
    maxHeight: '88%',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    marginBottom: spacing.md,
  },
  title: { fontSize: fontSize.lg, fontWeight: '700', marginBottom: spacing.sm },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.sm,
  },
  badgeText: { fontSize: fontSize.xs, fontWeight: '700' },
  figure: { alignItems: 'center', marginTop: spacing.sm, marginBottom: spacing.xs },
  scroll: { flexShrink: 1, minHeight: 0 },
  scrollContent: { paddingBottom: spacing.xl },
  subTitle: { fontSize: fontSize.md, fontWeight: '700', marginTop: spacing.md, marginBottom: spacing.xs },
  body: { fontSize: fontSize.sm, lineHeight: 20, marginBottom: spacing.xs },
  stepRow: { flexDirection: 'row', marginBottom: spacing.xs, paddingRight: spacing.sm },
  stepIndex: {
    width: 24,
    fontSize: fontSize.sm,
    fontWeight: '700',
    lineHeight: 20,
    marginRight: spacing.xs,
  },
  stepText: { flex: 1, fontSize: fontSize.sm, lineHeight: 20 },
  note: { fontSize: fontSize.xs, lineHeight: 17, marginTop: spacing.md },
  close: {
    alignSelf: 'center',
    marginTop: spacing.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
  },
  closeText: { fontSize: fontSize.md, fontWeight: '700' },
});
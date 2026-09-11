import { useNavigation } from '@react-navigation/native';
import { observer } from 'mobx-react-lite';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Alert } from '@/lib/alert';
import { PromptModal } from '@/components/PromptModal';
import { Caption } from '@/components/ui';
import { SegmentedControl, SettingsRow, SettingsSection } from '@/components/settings';
import { formatWeight, fromKg, toKg } from '@/domain/units';
import type { DistanceUnit, Sex, WeightUnit } from '@/domain/types';
import type { WeekStart } from '@/domain/streak';
import { useSettings } from '@/stores/RootStore';
import { spacing } from '@/theme/tokens';

export const SettingsScreen = observer(function SettingsScreen() {
  const navigation = useNavigation();
  const settings = useSettings();
  const v = settings.values;
  const [editing, setEditing] = useState<
    'bodyweight' | 'goal' | 'bar' | 'birthYear' | null
  >(null);

  const chooseSex = () => {
    const current = v.sex;
    Alert.alert('Sex', 'Used to calibrate the muscle recovery map.', [
      {
        text: current === 'male' ? 'Male ✓' : 'Male',
        onPress: () => void settings.set('sex', 'male' as Sex),
      },
      {
        text: current === 'female' ? 'Female ✓' : 'Female',
        onPress: () => void settings.set('sex', 'female' as Sex),
      },
      { text: 'Not set', onPress: () => void settings.set('sex', null) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const chooseFormula = () => {
    Alert.alert(
      'One-rep-max formula',
      'Both are estimates. Epley reads higher at high reps; Brzycki is more conservative.',
      [
        { text: 'Epley', onPress: () => void settings.set('oneRepMaxFormula', 'epley') },
        {
          text: 'Brzycki',
          onPress: () => void settings.set('oneRepMaxFormula', 'brzycki'),
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SettingsSection title="Units">
          <SettingsRow
            label="Weight"
            description="Changing this also swaps the plate inventory"
          />
        </SettingsSection>
        <SegmentedControl<WeightUnit>
          options={[
            { value: 'kg', label: 'Kilograms' },
            { value: 'lb', label: 'Pounds' },
          ]}
          value={v.weightUnit}
          onChange={(x) => void settings.setWeightUnit(x)}
        />

        <View style={{ height: spacing.md }} />
        <SegmentedControl<DistanceUnit>
          options={[
            { value: 'km', label: 'Kilometres' },
            { value: 'mi', label: 'Miles' },
          ]}
          value={v.distanceUnit}
          onChange={(x) => void settings.set('distanceUnit', x)}
        />

        <SettingsSection title="You">
          <SettingsRow
            label="Bodyweight"
            description="Used to calculate volume for push-ups, pull-ups and dips"
            value={
              v.bodyweightKg === null
                ? 'Not set'
                : `${formatWeight(v.bodyweightKg, v.weightUnit)} ${v.weightUnit}`
            }
            onPress={() => setEditing('bodyweight')}
          />
          <SettingsRow
            label="Age"
            description="Calibrates recovery times (Damas et al.)"
            value={v.birthYear === null ? 'Not set' : `${currentAge(v.birthYear)}`}
            onPress={() => setEditing('birthYear')}
          />
          <SettingsRow
            label="Sex"
            description="Women recover ~15% faster at equal effort"
            value={v.sex === null ? 'Not set' : v.sex === 'female' ? 'Female' : 'Male'}
            onPress={chooseSex}
          />
        </SettingsSection>

        <SettingsSection title="Goals">
          <SettingsRow
            label="Workouts per week"
            description="Your streak counts weeks that hit this number"
            value={String(v.weeklyWorkoutGoal)}
            onPress={() => setEditing('goal')}
          />
          <SettingsRow
            label="Week starts on"
            value={v.weekStart === 1 ? 'Monday' : 'Sunday'}
            onPress={() =>
              void settings.set('weekStart', (v.weekStart === 1 ? 0 : 1) as WeekStart)
            }
          />
        </SettingsSection>

        <SettingsSection title="Analytics">
          <SettingsRow
            label="1RM formula"
            value={v.oneRepMaxFormula === 'epley' ? 'Epley' : 'Brzycki'}
            onPress={chooseFormula}
          />
        </SettingsSection>

        <SettingsSection title="Equipment">
          <SettingsRow
            label="Bar weight"
            description="Used by the plate and warm-up calculators"
            value={`${v.barWeight} ${v.weightUnit}`}
            onPress={() => setEditing('bar')}
          />
          <SettingsRow
            label="Plates"
            description="Which denominations you have available"
            value={`${v.platePairs.length} sizes`}
            onPress={() => navigation.navigate('PlateSettings')}
          />
        </SettingsSection>

        <Caption style={{ marginTop: spacing.xl }}>
          Weights are stored in kilograms internally and converted for display, so
          switching units never changes your logged history.
        </Caption>
      </ScrollView>

      <PromptModal
        visible={editing === 'bodyweight'}
        title={`Bodyweight (${v.weightUnit})`}
        initialValue={
          v.bodyweightKg === null ? '' : String(fromKg(v.bodyweightKg, v.weightUnit))
        }
        onCancel={() => setEditing(null)}
        onSubmit={(text) => {
          setEditing(null);
          const n = Number(text.replace(',', '.'));
          if (!Number.isFinite(n) || n <= 0) {
            void settings.set('bodyweightKg', null);
            return;
          }
          void settings.set('bodyweightKg', toKg(n, v.weightUnit));
        }}
      />

      <PromptModal
        visible={editing === 'goal'}
        title="Workouts per week"
        initialValue={String(v.weeklyWorkoutGoal)}
        onCancel={() => setEditing(null)}
        onSubmit={(text) => {
          setEditing(null);
          const n = Math.round(Number(text));
          if (!Number.isFinite(n) || n < 1 || n > 14) return;
          void settings.set('weeklyWorkoutGoal', n);
        }}
      />

      <PromptModal
        visible={editing === 'bar'}
        title={`Bar weight (${v.weightUnit})`}
        initialValue={String(v.barWeight)}
        onCancel={() => setEditing(null)}
        onSubmit={(text) => {
          setEditing(null);
          const n = Number(text.replace(',', '.'));
          if (!Number.isFinite(n) || n < 0) return;
          void settings.set('barWeight', n);
        }}
      />

      <PromptModal
        visible={editing === 'birthYear'}
        title="Year of birth"
        placeholder="e.g. 1994"
        initialValue={v.birthYear === null ? '' : String(v.birthYear)}
        onCancel={() => setEditing(null)}
        onSubmit={(text) => {
          setEditing(null);
          const n = Math.round(Number(text));
          const year = new Date().getFullYear();
          if (!Number.isFinite(n) || n < 1900 || n > year) return;
          void settings.set('birthYear', n);
        }}
      />
    </>
  );
});

function currentAge(birthYear: number): number {
  const a = new Date().getFullYear() - birthYear;
  return Math.max(0, a);
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
});

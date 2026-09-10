import { observer } from 'mobx-react-lite';
import React, { useCallback, useEffect } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Body, Button, Caption } from './ui';
import { useHeartRate } from '@/stores/RootStore';
import { usePalette } from '@/theme/ThemeProvider';
import { fontSize, radius, spacing } from '@/theme/tokens';

/**
 * Bottom sheet for pairing a BLE heart-rate monitor (Polar, Wahoo, …). Lives
 * inside ActiveWorkoutScreen; scan results and connection state come from
 * HeartRateStore.
 */
export const HeartRateSheet = observer(
  function HeartRateSheet({
    visible,
    onClose,
  }: {
    visible: boolean;
    onClose: () => void;
  }) {
    const palette = usePalette();
    const hr = useHeartRate();

    // Stop scanning when the sheet closes so the list does not crawl forever.
    useEffect(() => {
      if (!visible && hr.status === 'scanning') {
        void hr.stopScan();
      }
    }, [visible, hr]);

    const onPressRow = useCallback(
      (id: string) => {
        void hr.connect(id);
      },
      [hr],
    );

    return (
      <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close">
          <Pressable style={[styles.sheet, { backgroundColor: palette.surface }]} onPress={() => {}}>
            <View style={[styles.grabber, { backgroundColor: palette.border }]} />
            <Text style={[styles.title, { color: palette.text }]}>Heart rate</Text>
            <Caption style={{ marginBottom: spacing.md }}>
              Pair a monitor broadcasting the standard heart-rate service.
              Enable broadcasting on the strap first — many devices only
              advertise while broadcasting.
            </Caption>

            <ScrollView
              style={styles.scroll}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
            >
              {hr.status === 'connected' ||
              hr.status === 'connecting' ||
              hr.status === 'reconnecting' ? (
                <View style={styles.statusBox}>
                  <View style={styles.liveRow}>
                    {hr.status === 'connecting' || hr.status === 'reconnecting' ? (
                      <ActivityIndicator color={palette.accent} />
                    ) : (
                      <Text
                        style={[
                          styles.bpm,
                          { color: palette.text, fontVariant: ['tabular-nums'] },
                        ]}
                      >
                        {hr.liveBpm ?? '--'}
                      </Text>
                    )}
                    <View style={{ flex: 1, marginLeft: spacing.md }}>
                      <Body>{hr.deviceName ?? 'Connecting…'}</Body>
                      <Caption>
                        {hr.status === 'connected'
                          ? hr.emulating
                            ? 'Simulator running — readings feed this workout normally.'
                            : 'Recording every ~5 seconds into this workout.'
                          : hr.status === 'reconnecting'
                            ? `Connection lost — reconnecting to ${hr.deviceName ?? 'your monitor'}…`
                            : 'Hang on, establishing a connection.'}
                      </Caption>
                    </View>
                  </View>
                  {hr.connected ? (
                    <>
                      <Button
                        label={hr.emulating ? 'Disconnect simulator' : 'Disconnect'}
                        variant="secondary"
                        onPress={() => void hr.disconnect()}
                        style={{ marginTop: spacing.md }}
                      />
                      {hr.emulating ? (
                        <Button
                          label="Pair a real monitor instead"
                          variant="ghost"
                          onPress={() => hr.switchToScan()}
                          style={{ marginTop: spacing.md }}
                        />
                      ) : (
                        <Button
                          label="Simulate a strap instead (testing)"
                          variant="ghost"
                          onPress={() => hr.switchToEmulator()}
                          style={{ marginTop: spacing.md }}
                        />
                      )}
                    </>
                  ) : null}
                  {hr.status === 'reconnecting' ? (
                    <>
                      <Button
                        label="Stop trying"
                        variant="ghost"
                        onPress={() => hr.cancelReconnect()}
                        style={{ marginTop: spacing.md }}
                      />
                      <Button
                        label="Simulate a strap instead (testing)"
                        variant="ghost"
                        onPress={() => hr.startEmulator()}
                        style={{ marginTop: spacing.md }}
                      />
                    </>
                  ) : null}
                </View>
              ) : null}

              {hr.status === 'error' ? (
                <View style={styles.statusBox}>
                  <Caption style={{ color: palette.danger }}>{hr.errorMessage}</Caption>
                  <Button
                    label="Scan again"
                    onPress={() => void hr.startScan()}
                    style={{ marginTop: spacing.md }}
                  />
                </View>
              ) : null}

              {hr.status === 'scanning' ? (
                <View style={styles.scanRow}>
                  <ActivityIndicator color={palette.accent} style={{ marginRight: spacing.sm }} />
                  <Caption>Scanning for heart-rate devices…</Caption>
                </View>
              ) : hr.status === 'idle' || hr.status === 'error' ? (
                <>
                  <Button
                    label="Scan for devices"
                    onPress={() => void hr.startScan()}
                    style={{ marginBottom: spacing.md }}
                  />
                  <Button
                    label="Simulate a strap (testing)"
                    variant="ghost"
                    onPress={() => hr.startEmulator()}
                    style={{ marginBottom: spacing.md }}
                  />
                </>
              ) : null}

              {hr.devices.map((d) => (
                <Pressable
                  key={d.id}
                  onPress={() => onPressRow(d.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Connect to ${d.name ?? 'unnamed heart-rate device'}`}
                  style={({ pressed }) => [
                    styles.deviceRow,
                    { borderBottomColor: palette.border },
                    pressed ? { opacity: 0.6 } : null,
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Body>{d.name ?? 'Unnamed device'}</Body>
                    <Caption>
                      {d.hasHeartRateService ? 'Heart-rate service' : 'Unknown profile'}
                    </Caption>
                  </View>
                  {d.rssi !== null ? (
                    <Caption>{d.rssi} dBm</Caption>
                  ) : null}
                </Pressable>
              ))}

              {hr.status === 'scanning' && hr.devices.length === 0 ? (
                <Caption style={{ marginTop: spacing.md }}>
                  Nothing yet. Make sure the strap is broadcasting and is near
                  the phone.
                </Caption>
              ) : null}
            </ScrollView>

            {hr.status === 'scanning' ? (
              <Button
                label="Stop scanning"
                variant="ghost"
                onPress={() => void hr.stopScan()}
                style={{ marginTop: spacing.md }}
              />
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    );
  },
);

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    maxHeight: '82%',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  scroll: { flexShrink: 1, minHeight: 0 },
  scrollContent: { paddingBottom: spacing.sm },
  statusBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  liveRow: { flexDirection: 'row', alignItems: 'center' },
  bpm: { fontSize: fontSize.xxl, fontWeight: '800' },
  scanRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
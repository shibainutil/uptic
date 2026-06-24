import { useState, useEffect, useCallback } from 'react';
import {
  Modal, View, Text, TouchableOpacity, ActivityIndicator,
  StyleSheet, Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { captureScreen } from 'react-native-view-shot';
import { usePathname } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, spacing, radius, font } from '../theme';
import BugReportModal from './BugReportModal';

interface Props {
  visible: boolean;
  onClose: () => void;
}

type Phase = 'idle' | 'recording-instructions' | 'capturing' | 'report-ready';

export default function BugReportPickerSheet({ visible, onClose }: Props) {
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>('idle');
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [capturedType, setCapturedType] = useState<'image' | 'video' | null>(null);

  // Reset to idle each time the sheet opens
  useEffect(() => {
    if (visible) {
      setPhase('idle');
      setCapturedUri(null);
      setCapturedType(null);
    }
  }, [visible]);

  const handleScreenshot = useCallback(async () => {
    onClose(); // parent hides the sheet → Modal animates out
    setPhase('capturing'); // triggers the loading overlay below

    // Wait for the slide-out animation before capturing so the sheet isn't in the screenshot
    await new Promise(r => setTimeout(r, 350));

    try {
      const uri = await captureScreen({ format: 'jpg', quality: 0.85 });
      setCapturedUri(uri);
      setCapturedType('image');
    } catch {
      setCapturedUri(null);
      setCapturedType(null);
    }
    setPhase('report-ready');
  }, [onClose]);

  const handleAttachRecording = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library to attach a screen recording.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'videos',
      allowsEditing: false,
      quality: 1,
    });
    if (result.canceled || !result.assets?.[0]) return;

    setCapturedUri(result.assets[0].uri);
    setCapturedType('video');
    onClose();
    setPhase('report-ready');
  }, [onClose]);

  const handleDismissReport = useCallback(() => {
    setCapturedUri(null);
    setCapturedType(null);
    setPhase('idle');
    onClose();
  }, [onClose]);

  // While we're waiting to capture the screen, show nothing (so the screenshot is clean).
  // "capturing" is only entered after onClose() dismisses the sheet, so neither Modal
  // is visible during the actual captureScreen() call.

  // After capture, show the bug report form.
  if (phase === 'report-ready') {
    return (
      <BugReportModal
        visible
        capturedUri={capturedUri}
        capturedType={capturedType}
        currentScreen={pathname}
        onClose={handleDismissReport}
      />
    );
  }

  // Thin loading overlay while uploading/capturing — only shown during video upload wait
  if (phase === 'capturing') {
    return (
      <Modal visible transparent animationType="none">
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      </Modal>
    );
  }

  const sheetVisible = visible && (phase === 'idle' || phase === 'recording-instructions');

  return (
    <Modal
      visible={sheetVisible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />

        {phase === 'idle' ? (
          <>
            <Text style={styles.title}>Report a Bug</Text>
            <Text style={styles.subtitle}>How would you like to document it?</Text>

            <TouchableOpacity style={styles.option} onPress={handleScreenshot} activeOpacity={0.75}>
              <View style={[styles.optionIcon, { backgroundColor: '#3B82F620' }]}>
                <MaterialIcons name="screenshot-monitor" size={26} color="#3B82F6" />
              </View>
              <View style={styles.optionText}>
                <Text style={styles.optionTitle}>Take Screenshot</Text>
                <Text style={styles.optionSubtitle}>Captures the current screen instantly</Text>
              </View>
              <MaterialIcons name="chevron-right" size={22} color={colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.option, styles.optionLast]}
              onPress={() => setPhase('recording-instructions')}
              activeOpacity={0.75}
            >
              <View style={[styles.optionIcon, { backgroundColor: '#EF444420' }]}>
                <MaterialIcons name="videocam" size={26} color="#EF4444" />
              </View>
              <View style={styles.optionText}>
                <Text style={styles.optionTitle}>Attach Screen Recording</Text>
                <Text style={styles.optionSubtitle}>Record first, then attach the video</Text>
              </View>
              <MaterialIcons name="chevron-right" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </>
        ) : (
          /* recording-instructions phase */
          <>
            <Text style={styles.title}>Screen Recording</Text>

            <View style={styles.instructions}>
              <Step n={1} text="Swipe down from the top of your screen" />
              <Step n={2} text="Tap the Screen Record button in your control centre" />
              <Step n={3} text="Record your bug, then stop the recording" />
              <Step n={4} text="Come back here and tap the button below" />
            </View>

            <TouchableOpacity style={styles.attachBtn} onPress={handleAttachRecording} activeOpacity={0.8}>
              <MaterialIcons name="attach-file" size={20} color="#fff" />
              <Text style={styles.attachBtnText}>Done — Attach Recording</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.backBtn} onPress={() => setPhase('idle')}>
              <Text style={styles.backBtnText}>Back</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </Modal>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNumber}>
        <Text style={styles.stepNumberText}>{n}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: font.xl,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: font.md,
    marginBottom: spacing.lg,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionLast: {
    borderBottomWidth: 0,
  },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    flex: 1,
  },
  optionTitle: {
    color: colors.text,
    fontSize: font.md,
    fontWeight: '600',
  },
  optionSubtitle: {
    color: colors.textMuted,
    fontSize: font.sm,
    marginTop: 2,
  },
  instructions: {
    gap: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  stepNumberText: {
    color: '#fff',
    fontSize: font.sm,
    fontWeight: '700',
  },
  stepText: {
    color: colors.text,
    fontSize: font.md,
    flex: 1,
    lineHeight: 22,
  },
  attachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  attachBtnText: {
    color: '#fff',
    fontSize: font.md,
    fontWeight: '700',
  },
  backBtn: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  backBtnText: {
    color: colors.textMuted,
    fontSize: font.md,
  },
  loadingOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
});

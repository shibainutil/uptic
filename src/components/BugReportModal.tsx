import { useState } from 'react';
import {
  Modal, View, Text, TextInput, Image,
  TouchableOpacity, ActivityIndicator, StyleSheet, ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, spacing, radius, font } from '../theme';
import { fileBugReport, BugSeverity } from '../services/notionBugReport';

const SEVERITIES: BugSeverity[] = ['Critical', 'High', 'Medium', 'Low'];

const SEVERITY_COLOR: Record<BugSeverity, string> = {
  Critical: '#EF4444',
  High:     '#F97316',
  Medium:   '#EAB308',
  Low:      '#6366F1',
};

interface Props {
  visible: boolean;
  capturedUri: string | null;
  capturedType: 'image' | 'video' | null;
  currentScreen: string;
  onClose: () => void;
}

export default function BugReportModal({ visible, capturedUri, capturedType, currentScreen, onClose }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<BugSeverity>('Medium');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTitle('');
    setDescription('');
    setSeverity('Medium');
    setSubmitting(false);
    setSubmitted(false);
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit() {
    if (!title.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await fileBugReport({
        title: title.trim(),
        description: description.trim(),
        screen: currentScreen,
        severity,
        capturedUri: capturedUri ?? undefined,
        mediaType: capturedType ?? undefined,
      });
      setSubmitted(true);
      setTimeout(handleClose, 1500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to file bug report');
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Report a Bug</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
              <MaterialIcons name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {submitted ? (
            <View style={styles.successContainer}>
              <MaterialIcons name="check-circle" size={48} color="#22C55E" />
              <Text style={styles.successText}>Bug filed!</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
              {/* Media preview */}
              {capturedType === 'image' && capturedUri && (
                <Image source={{ uri: capturedUri }} style={styles.screenshot} resizeMode="contain" />
              )}
              {capturedType === 'video' && (
                <View style={styles.videoPreview}>
                  <MaterialIcons name="videocam" size={32} color={colors.accent} />
                  <Text style={styles.videoPreviewText}>Screen recording attached</Text>
                </View>
              )}

              <Text style={styles.label}>Screen</Text>
              <View style={styles.readonlyField}>
                <Text style={styles.readonlyText}>{currentScreen}</Text>
              </View>

              <Text style={styles.label}>Title <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="Short summary of the issue"
                placeholderTextColor={colors.textDim}
                maxLength={100}
              />

              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={description}
                onChangeText={setDescription}
                placeholder="Steps to reproduce, expected vs actual…"
                placeholderTextColor={colors.textDim}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />

              <Text style={styles.label}>Severity</Text>
              <View style={styles.severityRow}>
                {SEVERITIES.map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[
                      styles.severityChip,
                      { borderColor: SEVERITY_COLOR[s] },
                      severity === s && { backgroundColor: SEVERITY_COLOR[s] },
                    ]}
                    onPress={() => setSeverity(s)}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.severityText,
                      severity === s ? styles.severityTextSelected : { color: SEVERITY_COLOR[s] },
                    ]}>
                      {s}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {error && <Text style={styles.errorText}>{error}</Text>}

              <TouchableOpacity
                style={[styles.submitBtn, (!title.trim() || submitting) && styles.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={!title.trim() || submitting}
                activeOpacity={0.8}
              >
                {submitting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.submitText}>File Bug Report</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    color: colors.text,
    fontSize: font.lg,
    fontWeight: '700',
  },
  closeBtn: {
    padding: spacing.xs,
  },
  body: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  screenshot: {
    width: '100%',
    height: 180,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface2,
  },
  videoPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  videoPreviewText: {
    color: colors.text,
    fontSize: font.md,
    fontWeight: '500',
  },
  label: {
    color: colors.textMuted,
    fontSize: font.sm,
    fontWeight: '600',
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  required: {
    color: colors.danger,
  },
  readonlyField: {
    backgroundColor: colors.surface2,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  readonlyText: {
    color: colors.textMuted,
    fontSize: font.md,
  },
  input: {
    backgroundColor: colors.surface2,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: font.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  multiline: {
    minHeight: 90,
  },
  severityRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
    marginBottom: spacing.lg,
  },
  severityChip: {
    borderWidth: 1.5,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  severityText: {
    fontSize: font.sm,
    fontWeight: '600',
  },
  severityTextSelected: {
    color: '#fff',
  },
  errorText: {
    color: colors.danger,
    fontSize: font.sm,
    marginBottom: spacing.sm,
  },
  submitBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitText: {
    color: '#fff',
    fontSize: font.md,
    fontWeight: '700',
  },
  successContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: spacing.md,
  },
  successText: {
    color: colors.text,
    fontSize: font.xl,
    fontWeight: '700',
  },
});

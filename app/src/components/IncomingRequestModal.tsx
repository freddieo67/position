import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { IncomingRequest } from '../api';
import i18n from '../i18n';

interface IncomingRequestModalProps {
  request: IncomingRequest | null;
  loading?: boolean;
  onAccept: (req: IncomingRequest, message?: string, durationMinutes?: number) => void;
  onDecline: (req: IncomingRequest) => void;
}

export default function IncomingRequestModal({
  request,
  loading = false,
  onAccept,
  onDecline,
}: IncomingRequestModalProps) {
  const [customText, setCustomText] = useState('');
  const [selectedDuration, setSelectedDuration] = useState<5 | 15 | 30>(15);

  useEffect(() => {
    if (request) {
      setCustomText('');
      setSelectedDuration(15);
    }
  }, [request]);

  if (!request) return null;

  const handleShare = () => {
    const trimmed = customText.trim();
    onAccept(request, trimmed.length > 0 ? trimmed : undefined, selectedDuration);
  };

  const handleDecline = () => {
    onDecline(request);
  };

  const hasMessage = customText.trim().length > 0;

  return (
    <Modal
      visible={Boolean(request)}
      transparent
      animationType="fade"
      onRequestClose={handleDecline}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalContainer}>
          <Text style={styles.title}>
            {i18n.t('wants_to_see_position', { name: request.requester_name })}
          </Text>

          <Text style={styles.subtitle}>
            {i18n.t('if_share_see_each_other_10m')}
          </Text>

          <Text style={styles.durationLabel}>Hur länge vill du dela?</Text>
          <View style={styles.durationRow}>
            {([5, 15, 30] as const).map(mins => (
              <TouchableOpacity
                key={mins}
                style={[
                  styles.durationBtn,
                  selectedDuration === mins && styles.durationBtnActive,
                ]}
                onPress={() => setSelectedDuration(mins)}
              >
                <Text
                  style={[
                    styles.durationText,
                    selectedDuration === mins && styles.durationTextActive,
                  ]}
                >
                  {mins} min
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            style={styles.input}
            placeholder={i18n.t('optional_message_placeholder')}
            placeholderTextColor="#999"
            value={customText}
            onChangeText={setCustomText}
            maxLength={100}
            returnKeyType="done"
            editable={!loading}
          />

          <TouchableOpacity
            style={[styles.shareBtn, loading && styles.disabledBtn]}
            onPress={handleShare}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.shareBtnText}>
                {hasMessage
                  ? `Dela med meddelande (${selectedDuration} min) 💬`
                  : `Dela position (${selectedDuration} min) 📍`}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.denyBtn}
            onPress={handleDecline}
            disabled={loading}
          >
            <Text style={styles.denyBtnText}>{i18n.t('deny')}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: '#fff',
    width: '88%',
    borderRadius: 20,
    padding: 24,
    alignItems: 'stretch',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
    color: '#111',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 14,
    lineHeight: 20,
  },
  durationLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
    marginBottom: 6,
    textAlign: 'center',
  },
  durationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 8,
  },
  durationBtn: {
    flex: 1,
    paddingVertical: 9,
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
  },
  durationBtnActive: {
    backgroundColor: '#2a8a41',
    borderColor: '#2a8a41',
  },
  durationText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#555',
  },
  durationTextActive: {
    color: '#fff',
  },
  input: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e1e1e1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111',
    marginBottom: 16,
  },
  shareBtn: {
    backgroundColor: '#2a8a41',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  shareBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  denyBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  denyBtnText: {
    fontSize: 15,
    color: '#666',
    fontWeight: '600',
  },
  disabledBtn: {
    opacity: 0.6,
  },
});

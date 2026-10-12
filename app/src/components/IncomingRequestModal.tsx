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
  onAccept: (req: IncomingRequest, message?: string) => void;
  onDecline: (req: IncomingRequest) => void;
}

export default function IncomingRequestModal({
  request,
  loading = false,
  onAccept,
  onDecline,
}: IncomingRequestModalProps) {
  const [customText, setCustomText] = useState('');

  useEffect(() => {
    if (request) {
      setCustomText('');
    }
  }, [request]);

  if (!request) return null;

  const handleShare = () => {
    const trimmed = customText.trim();
    onAccept(request, trimmed.length > 0 ? trimmed : undefined);
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
                  ? `${i18n.t('share_with_message')} 💬`
                  : `${i18n.t('share')} 📍`}
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
    marginBottom: 18,
    lineHeight: 20,
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

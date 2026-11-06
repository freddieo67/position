import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Modal, TouchableOpacity, TextInput, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { api } from '../api';
import { ApiError } from '../config';
import { SIGNALS } from '../signals';
import i18n from '../i18n';
import { AppContact } from './ContactsModal';

interface FlashMessModalProps {
  visible: boolean;
  currentUserId: number;
  targets: AppContact[] | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function FlashMessModal({
  visible,
  currentUserId,
  targets,
  onClose,
  onSuccess,
}: FlashMessModalProps) {
  const [customText, setCustomText] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      setCustomText('');
      setLoading(false);
    }
  }, [visible]);

  const sendFlash = async (type: string, message?: string) => {
    if (!targets || targets.length === 0) return;
    setLoading(true);
    const targetNames = targets.map(t => t.name).join(', ');
    try {
      await Promise.all(
        targets.map(target => api.sendSignal(currentUserId, target.userId, type, message))
      );
      setCustomText('');
      Alert.alert(
        'Flash-mess',
        i18n.t('flash_mess_sent', { names: targetNames })
      );
      onSuccess();
    } catch (error: any) {
      const msg = error instanceof ApiError && error.serverMessage 
        ? error.serverMessage 
        : (error?.serverMessage || error?.message || i18n.t('phing_send_failed'));
      Alert.alert('Flash-mess', msg);
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  const targetNames = targets?.map(t => t.name).join(', ') ?? '';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>{i18n.t('flash_target_title', { names: targetNames })} ⚡</Text>

            <Text style={styles.subtitle}>
              {i18n.t('ready_flash_mess_label')}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickButtonsScroll}
            >
              {SIGNALS.map(s => (
                <TouchableOpacity
                  key={s.type}
                  style={styles.quickBtn}
                  disabled={loading}
                  onPress={() => sendFlash(s.type)}
                >
                  <Text style={styles.emoji}>{s.emoji}</Text>
                  <Text style={styles.quickText}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.divider} />

            <Text style={styles.subtitle}>
              {i18n.t('write_flash_mess_label')}
            </Text>
            <TextInput
              style={styles.input}
              placeholder={i18n.t('message_placeholder')}
              placeholderTextColor="#999"
              value={customText}
              onChangeText={setCustomText}
              maxLength={100}
            />

            <TouchableOpacity 
              style={[styles.sendBtn, (!customText.trim() || loading) && styles.disabledBtn]} 
              disabled={!customText.trim() || loading}
              onPress={() => sendFlash('custom', customText.trim())}
            >
              {loading ? (
                <ActivityIndicator color="#333" />
              ) : (
                <Text style={styles.sendBtnText}>
                  {`${i18n.t('send_flash_mess_btn')} ⚡`}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.closeBtn} onPress={onClose} disabled={loading}>
              <Text style={styles.closeBtnText}>{i18n.t('cancel')}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 22,
    width: '100%',
    maxWidth: 380,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
    color: '#1a1a1a',
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: '#ebebeb',
    marginVertical: 12,
  },
  quickButtonsScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 2,
    marginBottom: 10,
  },
  quickBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f7',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    minWidth: 92,
    height: 62,
    borderWidth: 1.5,
    borderColor: '#e2e4e8',
  },
  emoji: {
    fontSize: 22,
    marginBottom: 3,
  },
  quickText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    marginBottom: 12,
    backgroundColor: '#fafafa',
  },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f4f5f7',
    borderWidth: 1.5,
    borderColor: '#e1e4e8',
    height: 46,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginBottom: 10,
  },
  sendBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
  },
  disabledBtn: {
    opacity: 0.45,
  },
  closeBtn: {
    padding: 12,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#f4f5f7',
    borderWidth: 1.5,
    borderColor: '#e1e4e8',
  },
  closeBtnText: {
    color: '#666',
    fontWeight: '600',
    fontSize: 15,
  },
});


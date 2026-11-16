import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
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
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (visible) {
      setCustomText('');
      setLoading(false);
      setIsKeyboardOpen(false);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvt, () => {
      setIsKeyboardOpen(true);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300);
    });

    const hideSub = Keyboard.addListener(hideEvt, () => {
      setIsKeyboardOpen(false);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
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
      Alert.alert('Flash-mess', i18n.t('flash_mess_sent', { names: targetNames }));
      onSuccess();
    } catch (error: any) {
      const msg =
        error instanceof ApiError && error.serverMessage
          ? error.serverMessage
          : error?.serverMessage || error?.message || i18n.t('phing_send_failed');
      Alert.alert('Flash-mess', msg);
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  const targetNames = targets?.map(t => t.name).join(', ') ?? '';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => {
            if (isKeyboardOpen) {
              Keyboard.dismiss();
            } else {
              onClose();
            }
          }}
        />

        <View style={styles.sheetContainer}>
          <ScrollView
            ref={scrollRef}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: isKeyboardOpen ? 180 : Platform.OS === 'ios' ? 36 : 24 },
            ]}
          >
            <View style={styles.dragHandle} />

            <Text style={styles.title}>Flash-mess till {targetNames} ⚡</Text>
            <Text style={styles.subtitle}>
              {i18n.t('flash_mess_subtitle', { names: targetNames })}
            </Text>

            <Text style={styles.sectionHeader}>{i18n.t('quick_replies_label')}</Text>

            <View style={styles.chipsContainer}>
              {SIGNALS.slice(0, 4).map(s => (
                <TouchableOpacity
                  key={s.type}
                  style={styles.chipBtn}
                  disabled={loading}
                  onPress={() => sendFlash(s.type)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.chipText}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionHeader}>{i18n.t('or_write_yourself_label')}</Text>

            <View style={styles.inputRow}>
              <TextInput
                style={styles.inputField}
                placeholder={i18n.t('write_message_placeholder')}
                placeholderTextColor="#94a3b8"
                value={customText}
                onChangeText={setCustomText}
                maxLength={100}
                returnKeyType="send"
                onSubmitEditing={() => customText.trim() && sendFlash('custom', customText.trim())}
                onFocus={() => {
                  setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
                  setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300);
                }}
              />
              <TouchableOpacity
                style={[
                  styles.arrowSendBtn,
                  (!customText.trim() || loading) && styles.arrowSendBtnDisabled,
                ]}
                disabled={!customText.trim() || loading}
                onPress={() => sendFlash('custom', customText.trim())}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <FontAwesome6 name="arrow-right" size={15} color="#fff" />
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onClose}
              disabled={loading}
              activeOpacity={0.6}
            >
              <Text style={styles.cancelBtnText}>{i18n.t('cancel')}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
  },
  sheetContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '90%',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 10,
  },
  scrollContent: {
    paddingTop: 12,
    paddingHorizontal: 22,
  },
  dragHandle: {
    width: 44,
    height: 4.5,
    borderRadius: 3,
    backgroundColor: '#cbd5e1',
    alignSelf: 'center',
    marginBottom: 18,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 20,
    lineHeight: 19,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  chipBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#134e5e',
    backgroundColor: '#fff',
  },
  chipText: {
    fontSize: 14.5,
    fontWeight: '500',
    color: '#0f172a',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 14,
    paddingLeft: 14,
    paddingRight: 6,
    height: 52,
    marginBottom: 24,
    borderWidth: 1.5,
    borderColor: '#134e5e',
  },
  inputField: {
    flex: 1,
    fontSize: 15,
    color: '#0f172a',
  },
  arrowSendBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#134e5e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrowSendBtnDisabled: {
    opacity: 0.4,
  },
  cancelBtn: {
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  cancelBtnText: {
    color: '#475569',
    fontSize: 15,
    fontWeight: '600',
  },
});

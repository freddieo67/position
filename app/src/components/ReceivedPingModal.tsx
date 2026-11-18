import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { AppContact } from './ContactsModal';
import i18n from '../i18n';

export interface ReceivedPingData {
  title: string;
  message: string;
  sender: AppContact;
}

interface ReceivedPingModalProps {
  visible: boolean;
  data: ReceivedPingData | null;
  onClose: () => void;
  onReply: (sender: AppContact) => void;
}

export default function ReceivedPingModal({
  visible,
  data,
  onClose,
  onReply,
}: ReceivedPingModalProps) {
  if (!visible || !data) return null;

  const displayTitle = data.title || `${data.sender.name} skickade ett flashmess`;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

        <View style={styles.sheetContainer}>
          <View style={styles.dragHandle} />

          <Text style={styles.title}>{displayTitle}</Text>
          <Text style={styles.subtitle}>
            {i18n.t('flash_mess_subtitle', { names: data.sender.name })}
          </Text>

          {Boolean(data.message) && (
            <View style={styles.messageCard}>
              <Text style={styles.messageText}>"{data.message}"</Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.replyBtn}
            activeOpacity={0.85}
            onPress={() => {
              onClose();
              onReply(data.sender);
            }}
          >
            <Text style={styles.replyBtnText}>{i18n.t('reply')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.closeBtn}
            activeOpacity={0.6}
            onPress={onClose}
          >
            <Text style={styles.closeBtnText}>{i18n.t('close')}</Text>
          </TouchableOpacity>
        </View>
      </View>
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
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 22,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 10,
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
  messageCard: {
    backgroundColor: '#f1f5f9',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 20,
    marginBottom: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a',
    textAlign: 'center',
    lineHeight: 24,
  },
  replyBtn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#134e5e',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  replyBtnIcon: {
    fontSize: 18,
  },
  replyBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  closeBtn: {
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  closeBtnText: {
    fontSize: 15,
    color: '#475569',
    fontWeight: '600',
  },
});

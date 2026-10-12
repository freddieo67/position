import React from 'react';
import { StyleSheet, Text, View, Modal, TouchableOpacity } from 'react-native';
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

export default function ReceivedPingModal({ visible, data, onClose, onReply }: ReceivedPingModalProps) {
  if (!visible || !data) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <Text style={styles.title}>{data.title}</Text>

          {Boolean(data.message) && (
            <View style={styles.messageBox}>
              <Text style={styles.messageText}>"{data.message}"</Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.replyBtn}
            onPress={() => {
              onClose();
              onReply(data.sender);
            }}
          >
            <Text style={styles.replyBtnText}>{i18n.t('ping_back')} ⚡</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: '#fff',
    width: '85%',
    borderRadius: 20,
    padding: 24,
    alignItems: 'stretch',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
    color: '#111',
  },
  messageBox: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e1e1e1',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  messageText: {
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
    lineHeight: 22,
  },
  replyBtn: {
    backgroundColor: '#805d7e',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  replyBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  closeBtn: {
    padding: 12,
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '600',
  },
});

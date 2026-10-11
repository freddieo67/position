import React, { useState } from 'react';
import { StyleSheet, Text, View, Modal, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { api } from '../api';

import { AppContact } from './ContactsModal';

interface PingModalProps {
  visible: boolean;
  currentUserId: number;
  targets: AppContact[] | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function PingModal({ visible, currentUserId, targets, onClose, onSuccess }: PingModalProps) {
  const [customText, setCustomText] = useState('');
  const [loading, setLoading] = useState(false);

  const sendPing = async (type: string, message?: string) => {
    if (!targets || targets.length === 0) return;
    setLoading(true);
    try {
      await Promise.all(
        targets.map(target => api.sendSignal(currentUserId, target.userId, type, message))
      );
      setCustomText('');
      onSuccess();
    } catch (error) {
      alert('Kunde inte skicka ping.');
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
          <Text style={styles.title}>Pinga {targetNames}</Text>
          
          <View style={styles.quickButtons}>
            <TouchableOpacity style={styles.quickBtn} onPress={() => sendPing('beer')}>
              <Text style={styles.emoji}>🍻</Text>
              <Text style={styles.quickText}>Öl?</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickBtn} onPress={() => sendPing('coffee', 'Sugen på en kaffe?')}>
              <Text style={styles.emoji}>☕</Text>
              <Text style={styles.quickText}>Kaffe?</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickBtn} onPress={() => sendPing('wave', 'Var håller du hus?')}>
              <Text style={styles.emoji}>👋</Text>
              <Text style={styles.quickText}>Hallå?</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />
          
          <Text style={styles.subtitle}>Eller skriv eget:</Text>
          <TextInput
            style={styles.input}
            placeholder="Skriv ett meddelande..."
            value={customText}
            onChangeText={setCustomText}
            maxLength={100}
          />
          
          <TouchableOpacity 
            style={[styles.sendBtn, (!customText.trim() || loading) && styles.disabledBtn]} 
            disabled={!customText.trim() || loading}
            onPress={() => sendPing('custom', customText.trim())}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendBtnText}>Skicka ⚡</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.closeBtn} onPress={onClose} disabled={loading}>
            <Text style={styles.closeBtnText}>Avbryt</Text>
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
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 20,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  quickButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  quickBtn: {
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    padding: 12,
    borderRadius: 16,
    flex: 1,
    marginHorizontal: 4,
  },
  emoji: {
    fontSize: 28,
    marginBottom: 4,
  },
  quickText: {
    fontSize: 12,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#e1e1e1',
    marginVertical: 16,
  },
  input: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e1e1e1',
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  sendBtn: {
    backgroundColor: '#FFD700',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  disabledBtn: {
    opacity: 0.5,
  },
  sendBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  closeBtn: {
    padding: 14,
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
});

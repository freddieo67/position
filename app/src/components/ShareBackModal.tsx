import React from 'react';
import { StyleSheet, Text, View, Modal, TouchableOpacity } from 'react-native';
import i18n from '../i18n';
import { IncomingPosition } from '../api';

interface ShareBackModalProps {
  visible: boolean;
  position: IncomingPosition | null;
  onClose: () => void;
  onSelectPosition: () => void;
  onSelectFlashMess: () => void;
  onSelectPhing: () => void;
}

export default function ShareBackModal({
  visible,
  position,
  onClose,
  onSelectPosition,
  onSelectFlashMess,
  onSelectPhing,
}: ShareBackModalProps) {
  if (!visible || !position) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>
            {i18n.t('share_back_to', { name: position.sender_name })}
          </Text>

          <TouchableOpacity style={styles.optionBtn} onPress={onSelectPosition} activeOpacity={0.7}>
            <Text style={styles.optionEmoji}>📍</Text>
            <View style={styles.optionTextContainer}>
              <Text style={styles.optionTitle}>{i18n.t('share_back_position')}</Text>
              <Text style={styles.optionSub}>{i18n.t('share_back_position_sub')}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.optionBtn} onPress={onSelectFlashMess} activeOpacity={0.7}>
            <Text style={styles.optionEmoji}>⚡</Text>
            <View style={styles.optionTextContainer}>
              <Text style={styles.optionTitle}>Flash-mess</Text>
              <Text style={styles.optionSub}>{i18n.t('share_back_flash_sub')}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.optionBtn} onPress={onSelectPhing} activeOpacity={0.7}>
            <Text style={styles.optionEmoji}>📷</Text>
            <View style={styles.optionTextContainer}>
              <Text style={styles.optionTitle}>{i18n.t('share_back_phing')}</Text>
              <Text style={styles.optionSub}>{i18n.t('share_back_phing_sub')}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>{i18n.t('cancel')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 360,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a1a',
    textAlign: 'center',
    marginBottom: 18,
  },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f7',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: '#e2e4e8',
  },
  optionEmoji: {
    fontSize: 26,
    marginRight: 14,
  },
  optionTextContainer: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#222',
  },
  optionSub: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  cancelBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 6,
    borderRadius: 8,
    backgroundColor: '#f4f5f7',
    borderWidth: 1.5,
    borderColor: '#e1e4e8',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
  },
});


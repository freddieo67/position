import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Modal, TouchableOpacity, TextInput, ActivityIndicator, Alert, Image, ScrollView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { api } from '../api';
import { ApiError } from '../config';
import { SIGNALS } from '../signals';
import i18n from '../i18n';

import { AppContact } from './ContactsModal';

interface PingModalProps {
  visible: boolean;
  currentUserId: number;
  targets: AppContact[] | null;
  onClose: () => void;
  onSuccess: () => void;
  onSendPhotoPing?: (
    targets: AppContact[],
    photoThumb: string,
    photoData: string,
    message: string | undefined,
    durationMinutes: number
  ) => Promise<void>;
}

export default function PingModal({
  visible,
  currentUserId,
  targets,
  onClose,
  onSuccess,
  onSendPhotoPing,
}: PingModalProps) {
  const [customText, setCustomText] = useState('');
  const [loading, setLoading] = useState(false);
  const [photoThumb, setPhotoThumb] = useState<string | null>(null);
  const [photoData, setPhotoData] = useState<string | null>(null);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState<15 | 30 | 60>(15);

  useEffect(() => {
    if (visible) {
      setCustomText('');
      setPhotoThumb(null);
      setPhotoData(null);
      setProcessingPhoto(false);
      setSelectedDuration(15);
    }
  }, [visible]);

  const processSelectedAsset = async (uri: string) => {
    setProcessingPhoto(true);
    try {
      const [thumbRes, fullRes] = await Promise.all([
        ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: 160 } }],
          { compress: 0.65, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        ),
        ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: 900 } }],
          { compress: 0.68, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        ),
      ]);
      if (thumbRes.base64) {
        setPhotoThumb(`data:image/jpeg;base64,${thumbRes.base64}`);
      }
      if (fullRes.base64) {
        setPhotoData(`data:image/jpeg;base64,${fullRes.base64}`);
      }
    } catch (e) {
      console.warn('Kunde inte bearbeta bild:', e);
      Alert.alert(i18n.t('error'), i18n.t('photo_error'));
    } finally {
      setProcessingPhoto(false);
    }
  };

  const pickFromCamera = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(i18n.t('permission_missing_title'), i18n.t('camera_permission_needed'));
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });
      if (!res.canceled && res.assets?.[0]?.uri) {
        await processSelectedAsset(res.assets[0].uri);
      }
    } catch (e) {
      console.warn('Kamerafel:', e);
      Alert.alert(i18n.t('error'), i18n.t('camera_error'));
    }
  };

  const handleSendPhoto = async () => {
    if (!targets || targets.length === 0 || !photoThumb || !photoData || !onSendPhotoPing) return;
    setLoading(true);
    try {
      await onSendPhotoPing(
        targets,
        photoThumb,
        photoData,
        customText.trim() || undefined,
        selectedDuration
      );
      setCustomText('');
      setPhotoThumb(null);
      setPhotoData(null);
    } catch (error: any) {
      const msg = error instanceof ApiError && error.serverMessage
        ? error.serverMessage
        : (error?.serverMessage || error?.message || i18n.t('phing_send_failed'));
      Alert.alert('Phing', msg);
    } finally {
      setLoading(false);
    }
  };

  const sendPing = async (type: string, message?: string) => {
    if (!targets || targets.length === 0) return;
    // Om användaren valt ett foto och trycker på en signal: skicka foto-ping + signal!
    if (photoThumb && photoData && onSendPhotoPing) {
      setLoading(true);
      try {
        await onSendPhotoPing(
          targets,
          photoThumb,
          photoData,
          customText.trim() || undefined,
          selectedDuration
        );
        await Promise.all(
          targets.map(target => api.sendSignal(currentUserId, target.userId, type, message))
        ).catch(() => {});
        setCustomText('');
        setPhotoThumb(null);
        setPhotoData(null);
      } catch (error: any) {
        const msg = error instanceof ApiError && error.serverMessage
          ? error.serverMessage
          : (error?.serverMessage || error?.message || i18n.t('phing_send_failed'));
        Alert.alert('Phing', msg);
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      await Promise.all(
        targets.map(target => api.sendSignal(currentUserId, target.userId, type, message))
      );
      setCustomText('');
      onSuccess();
    } catch (error: any) {
      const msg = error instanceof ApiError && error.serverMessage 
        ? error.serverMessage 
        : (error?.serverMessage || error?.message || i18n.t('phing_send_failed'));
      Alert.alert('Phing', msg);
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
            <Text style={styles.title}>{i18n.t('phing_target_title', { names: targetNames })}</Text>

            {/* Foto-sektion överst */}
            {!photoThumb ? (
              <View style={styles.photoPickerRow}>
                <TouchableOpacity
                  style={styles.photoOptionBtn}
                  onPress={pickFromCamera}
                  disabled={loading || processingPhoto}
                  activeOpacity={0.8}
                >
                  <Text style={styles.photoOptionEmoji}>📷</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.photoPreviewCard}>
                <Image source={{ uri: photoThumb }} style={styles.previewImage} resizeMode="cover" />
                <TouchableOpacity
                  style={styles.removePhotoBtn}
                  onPress={() => {
                    setPhotoThumb(null);
                    setPhotoData(null);
                  }}
                >
                  <Text style={styles.removePhotoText}>{i18n.t('remove_photo')}</Text>
                </TouchableOpacity>
              </View>
            )}

            {processingPhoto && (
              <View style={{ paddingVertical: 12, alignItems: 'center' }}>
                <ActivityIndicator size="small" color="#ff3131" />
                <Text style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{i18n.t('preparing_photo')}</Text>
              </View>
            )}

            {photoThumb && (
              <>
                <Text style={styles.subtitle}>{i18n.t('shown_on_map_for')}</Text>
                <View style={styles.durationRow}>
                  {([15, 30, 60] as const).map(mins => (
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
                        {mins} {i18n.t('min_short')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  style={[styles.sendPhotoBtn, (loading || processingPhoto) && styles.disabledBtn]}
                  disabled={loading || processingPhoto}
                  onPress={handleSendPhoto}
                >
                  {loading ? (
                    <ActivityIndicator color="#333" />
                  ) : (
                    <>
                      <Text style={styles.sendPhotoEmoji}>📷</Text>
                      <Text style={styles.sendPhotoBtnText}>
                        {i18n.t('send_phing_btn', { mins: selectedDuration }).replace('📷 ', '')}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}

            <View style={styles.divider} />

            <Text style={styles.subtitle}>
              {photoThumb ? i18n.t('or_send_photo_signal') : i18n.t('quick_ping_no_photo')}
            </Text>
            <View style={styles.quickButtons}>
              {SIGNALS.map(s => (
                <TouchableOpacity
                  key={s.type}
                  style={styles.quickBtn}
                  disabled={loading || processingPhoto}
                  onPress={() => sendPing(s.type)}
                >
                  <Text style={styles.emoji}>{s.emoji}</Text>
                  <Text style={styles.quickText}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.divider} />

            <Text style={styles.subtitle}>{i18n.t('optional_message_label')}</Text>
            <TextInput
              style={styles.input}
              placeholder={photoThumb ? i18n.t('caption_placeholder') : i18n.t('message_placeholder')}
              value={customText}
              onChangeText={setCustomText}
              maxLength={100}
            />

            <TouchableOpacity 
              style={[styles.sendBtn, (!customText.trim() || loading || processingPhoto) && styles.disabledBtn]} 
              disabled={!customText.trim() || loading || processingPhoto}
              onPress={() => photoThumb ? handleSendPhoto() : sendPing('custom', customText.trim())}
            >
              {loading ? (
                <ActivityIndicator color="#333" />
              ) : (
                <Text style={styles.sendBtnText}>
                  {photoThumb
                    ? `${i18n.t('send_flash_mess_btn')} (${selectedDuration} ${i18n.t('min_short')}) 💬`
                    : `${i18n.t('send_flash_mess_btn')} ⚡`}
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: '#fff',
    width: '94%',
    maxHeight: '90%',
    borderRadius: 20,
    padding: 16,
    alignItems: 'stretch',
    elevation: 5,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 14,
    color: '#111',
  },
  photoPickerRow: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
  },
  photoOptionBtn: {
    width: 83,
    height: 83,
    borderRadius: 41.5,
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(226, 228, 232, 0.9)',
  },
  photoOptionEmoji: {
    fontSize: 34,
    textAlign: 'center',
    lineHeight: 40,
  },
  photoPreviewCard: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
  },
  previewImage: {
    width: 120,
    height: 120,
    borderRadius: 12,
    backgroundColor: '#222',
  },
  removePhotoBtn: {
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  removePhotoText: {
    fontSize: 13,
    color: '#ff3b30',
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
    marginTop: 2,
  },
  durationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    marginTop: 4,
  },
  durationBtn: {
    flex: 1,
    height: 46,
    marginHorizontal: 3,
    backgroundColor: '#f4f5f7',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#e1e4e8',
  },
  durationBtnActive: {
    backgroundColor: '#fff',
    borderColor: '#ff3131',
  },
  durationText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#555',
  },
  durationTextActive: {
    color: '#ff3131',
    fontWeight: 'bold',
  },
  sendPhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f4f5f7',
    borderWidth: 1.5,
    borderColor: '#e1e4e8',
    height: 46,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginBottom: 14,
    marginTop: 4,
  },
  sendPhotoEmoji: {
    fontSize: 18,
    marginRight: 8,
  },
  sendPhotoBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
  },
  quickButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 6,
  },
  quickBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f7',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 8,
    flex: 1,
    height: 54,
    borderWidth: 1.5,
    borderColor: '#e2e4e8',
  },
  emoji: {
    fontSize: 24,
    marginBottom: 1,
  },
  quickText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#555',
    textAlign: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: '#e1e1e1',
    marginVertical: 14,
  },
  input: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e1e1e1',
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
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
    marginBottom: 8,
  },
  disabledBtn: {
    opacity: 0.5,
  },
  sendBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
  },
  closeBtn: {
    marginTop: 6,
    padding: 12,
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#666',
    fontWeight: 'bold',
    fontSize: 16,
  },
});

import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Modal, TouchableOpacity, TextInput, ActivityIndicator, Alert, Image, ScrollView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { api } from '../api';
import { ApiError } from '../config';
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

  const pickFromGallery = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(i18n.t('permission_missing_title'), i18n.t('gallery_permission_needed'));
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });
      if (!res.canceled && res.assets?.[0]?.uri) {
        await processSelectedAsset(res.assets[0].uri);
      }
    } catch (e) {
      console.warn('Gallerifel:', e);
      Alert.alert(i18n.t('error'), i18n.t('gallery_error'));
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
              <View style={styles.cameraSection}>
                <Text style={styles.cameraHeading}>{i18n.t('take_photo_heading')}</Text>

                <View style={styles.photoOptionsRow}>
                  <TouchableOpacity
                    style={styles.photoOptionWrapper}
                    onPress={pickFromCamera}
                    disabled={loading || processingPhoto}
                    activeOpacity={0.8}
                  >
                    <View style={styles.photoOptionBtn}>
                      <Text style={styles.photoOptionEmoji}>📷</Text>
                    </View>
                    <Text style={styles.photoOptionLabel}>{i18n.t('take_photo_camera')}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.photoOptionWrapper}
                    onPress={pickFromGallery}
                    disabled={loading || processingPhoto}
                    activeOpacity={0.8}
                  >
                    <View style={styles.photoOptionBtn}>
                      <Text style={styles.photoOptionEmoji}>🖼️</Text>
                    </View>
                    <Text style={styles.photoOptionLabel}>{i18n.t('choose_from_gallery')}</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.photoExplanationText}>
                  {i18n.t('phing_explanation')}
                </Text>
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

                <View style={styles.divider} />

                <Text style={styles.subtitle}>{i18n.t('photo_message_label')}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={i18n.t('caption_placeholder')}
                  value={customText}
                  onChangeText={setCustomText}
                  maxLength={100}
                />

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
  cameraSection: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
    paddingHorizontal: 8,
  },
  cameraHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#222',
    marginBottom: 16,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  photoOptionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 36,
    marginBottom: 16,
  },
  photoOptionWrapper: {
    alignItems: 'center',
  },
  photoOptionBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f5f5f7',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#e1e4e8',
  },
  photoOptionEmoji: {
    fontSize: 36,
    textAlign: 'center',
    lineHeight: 40,
  },
  photoOptionLabel: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  photoExplanationText: {
    fontSize: 13.5,
    lineHeight: 19,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 12,
    marginBottom: 8,
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
    color: '#000',
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

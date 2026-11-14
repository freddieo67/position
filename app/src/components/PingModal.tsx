import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Modal, TouchableOpacity, TextInput, ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, TouchableWithoutFeedback } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView 
        style={styles.overlay} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        <View style={styles.sheetContainer}>
          <View style={styles.dragHandle} />

          {/* Steg 1: Välj bild (Ta bild / Välj ur galleriet) */}
          {!photoThumb ? (
            <>
              <Text style={styles.title}>
                Phinga {targetNames}
              </Text>
              <Text style={styles.subtitle}>
                {i18n.t('phing_subtitle', { names: targetNames })}
              </Text>

              <View style={styles.actionCardsRow}>
                <TouchableOpacity
                  style={styles.actionCardTeal}
                  onPress={pickFromCamera}
                  disabled={loading || processingPhoto}
                  activeOpacity={0.8}
                >
                  {processingPhoto ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <FontAwesome6 name="camera" size={26} color="#fff" />
                      <Text style={styles.actionCardTealText}>
                        {i18n.t('take_a_photo')}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionCardGrey}
                  onPress={pickFromGallery}
                  disabled={loading || processingPhoto}
                  activeOpacity={0.8}
                >
                  <FontAwesome6 name="image" size={26} color="#0F4C5C" />
                  <Text style={styles.actionCardGreyText}>
                    {i18n.t('choose_from_gallery_btn')}
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={loading} activeOpacity={0.6}>
                <Text style={styles.cancelBtnText}>{i18n.t('cancel')}</Text>
              </TouchableOpacity>
            </>
          ) : (
            /* Steg 2: Bild vald - förhandsgranska, tid, bildtext, skicka */
            <>
              <Text style={styles.title}>
                Phinga {targetNames}
              </Text>

              <View style={styles.previewContainer}>
                <Image source={{ uri: photoThumb }} style={styles.previewImage} resizeMode="cover" />
                <TouchableOpacity
                  style={styles.removeImageBtn}
                  onPress={() => {
                    setPhotoThumb(null);
                    setPhotoData(null);
                  }}
                  activeOpacity={0.8}
                >
                  <FontAwesome6 name="xmark" size={15} color="#fff" />
                </TouchableOpacity>
              </View>

              <Text style={styles.sectionHeader}>
                {i18n.t('shown_on_map_in')}
              </Text>

              <View style={styles.durationRow}>
                {([15, 30, 60] as const).map(mins => (
                  <TouchableOpacity
                    key={mins}
                    style={[
                      styles.durationBtn,
                      selectedDuration === mins ? styles.durationBtnActive : styles.durationBtnInactive,
                    ]}
                    onPress={() => setSelectedDuration(mins)}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.durationBtnText,
                        selectedDuration === mins ? styles.durationBtnTextActive : styles.durationBtnTextInactive,
                      ]}
                    >
                      {mins} min
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput
                style={styles.captionInput}
                placeholder={i18n.t('add_caption_placeholder')}
                placeholderTextColor="#94a3b8"
                value={customText}
                onChangeText={setCustomText}
                maxLength={80}
              />

              <TouchableOpacity
                style={[styles.primarySendBtn, loading && { opacity: 0.6 }]}
                disabled={loading}
                onPress={handleSendPhoto}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <FontAwesome6 name="arrow-right" size={16} color="#fff" />
                    <Text style={styles.primarySendBtnText}>
                      {i18n.t('send_phing_btn_text')}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={loading} activeOpacity={0.6}>
                <Text style={styles.cancelBtnText}>{i18n.t('cancel')}</Text>
              </TouchableOpacity>
            </>
          )}
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
    marginBottom: 22,
    lineHeight: 19,
  },
  actionCardsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 26,
  },
  actionCardTeal: {
    flex: 1,
    height: 115,
    borderRadius: 16,
    backgroundColor: '#0F4C5C',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  actionCardTealText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  actionCardGrey: {
    flex: 1,
    height: 115,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  actionCardGreyText: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '700',
  },
  previewContainer: {
    width: '100%',
    height: 185,
    borderRadius: 16,
    backgroundColor: '#e2e8f0',
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 18,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  removeImageBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeader: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  durationRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  durationBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationBtnActive: {
    backgroundColor: '#0F4C5C',
  },
  durationBtnInactive: {
    backgroundColor: '#f1f5f9',
  },
  durationBtnText: {
    fontSize: 14,
  },
  durationBtnTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  durationBtnTextInactive: {
    color: '#0f172a',
    fontWeight: '600',
  },
  captionInput: {
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14.5,
    color: '#0f172a',
    marginBottom: 16,
  },
  primarySendBtn: {
    height: 50,
    borderRadius: 12,
    backgroundColor: '#0F4C5C',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 18,
  },
  primarySendBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  cancelBtn: {
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#475569',
  },
});

import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Modal, TouchableOpacity, TextInput, ActivityIndicator, Alert, Image, ScrollView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { api } from '../api';
import { ApiError } from '../config';
import { SIGNALS } from '../signals';

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
      Alert.alert('Fel', 'Kunde inte läsa in bilden.');
    } finally {
      setProcessingPhoto(false);
    }
  };

  const pickFromCamera = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Behörighet saknas', 'Appen behöver tillgång till kameran för att ta en bild.');
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
      Alert.alert('Fel', 'Kunde inte öppna kameran.');
    }
  };

  const pickFromLibrary = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Behörighet saknas', 'Appen behöver tillgång till dina bilder.');
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
      console.warn('Bildbiblioteksfel:', e);
      Alert.alert('Fel', 'Kunde inte öppna bildbiblioteket.');
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
        : (error?.serverMessage || error?.message || 'Kunde inte skicka foto-ping.');
      Alert.alert('Foto-Ping', msg);
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
          : (error?.serverMessage || error?.message || 'Kunde inte skicka foto-ping.');
        Alert.alert('Foto-Ping', msg);
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
        : (error?.serverMessage || error?.message || 'Kunde inte skicka ping.');
      Alert.alert('Pinga', msg);
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
            <Text style={styles.title}>Foto-Ping till {targetNames} 📷</Text>

            {/* Foto-sektion överst */}
            <View style={styles.photoPickerRow}>
              <TouchableOpacity
                style={styles.photoOptionBtn}
                onPress={pickFromCamera}
                disabled={loading || processingPhoto}
              >
                <Text style={styles.photoOptionEmoji}>📷</Text>
                <Text style={styles.photoOptionText}>Ta bild</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.photoOptionBtn}
                onPress={pickFromLibrary}
                disabled={loading || processingPhoto}
              >
                <Text style={styles.photoOptionEmoji}>🖼️</Text>
                <Text style={styles.photoOptionText}>Välj bild</Text>
              </TouchableOpacity>
            </View>

            {processingPhoto && (
              <View style={{ paddingVertical: 12, alignItems: 'center' }}>
                <ActivityIndicator size="small" color="#805072" />
                <Text style={{ fontSize: 12, color: '#666', marginTop: 4 }}>Förbereder bild...</Text>
              </View>
            )}

            {photoThumb && (
              <View style={styles.previewBox}>
                <Image source={{ uri: photoThumb }} style={styles.previewImage} resizeMode="cover" />
                <View style={styles.previewControls}>
                  <Text style={styles.durationLabel}>Visas på kartan i (max 60 min):</Text>
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
                          {mins}m
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      setPhotoThumb(null);
                      setPhotoData(null);
                    }}
                  >
                    <Text style={styles.removePhotoText}>Ta bort bild ✕</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {photoThumb && (
              <TouchableOpacity
                style={[styles.sendPhotoBtn, (loading || processingPhoto) && styles.disabledBtn]}
                disabled={loading || processingPhoto}
                onPress={handleSendPhoto}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.sendBtnText}>
                    📷 Skicka Foto-Ping ({selectedDuration} min)
                  </Text>
                )}
              </TouchableOpacity>
            )}

            <View style={styles.divider} />

            <Text style={styles.subtitle}>
              {photoThumb ? 'Eller skicka bild + snabb-signal:' : 'Snabb-ping (utan bild):'}
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

            <Text style={styles.subtitle}>Valfritt meddelande:</Text>
            <TextInput
              style={styles.input}
              placeholder={photoThumb ? 'Skriv en bildtext (valfritt)...' : 'Skriv ett meddelande...'}
              value={customText}
              onChangeText={setCustomText}
              maxLength={100}
            />

            {!photoThumb && (
              <TouchableOpacity 
                style={[styles.sendBtn, (!customText.trim() || loading) && styles.disabledBtn]} 
                disabled={!customText.trim() || loading}
                onPress={() => sendPing('custom', customText.trim())}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendBtnText}>Skicka meddelande ⚡</Text>}
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.closeBtn} onPress={onClose} disabled={loading}>
              <Text style={styles.closeBtnText}>Avbryt</Text>
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
    maxHeight: '88%',
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
  },
  photoPickerRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  photoOptionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f0f4',
    borderWidth: 1.5,
    borderColor: '#805072',
    borderRadius: 10,
    paddingVertical: 12,
    gap: 8,
  },
  photoOptionEmoji: {
    fontSize: 22,
  },
  photoOptionText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#805072',
  },
  previewBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e1e4e8',
    gap: 12,
  },
  previewImage: {
    width: 78,
    height: 78,
    borderRadius: 10,
    backgroundColor: '#222',
  },
  previewControls: {
    flex: 1,
  },
  durationLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555',
    marginBottom: 6,
  },
  durationRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  durationBtn: {
    flex: 1,
    paddingVertical: 6,
    backgroundColor: '#fff',
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#d0d4d9',
  },
  durationBtnActive: {
    backgroundColor: '#805072',
    borderColor: '#805072',
  },
  durationText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#555',
  },
  durationTextActive: {
    color: '#fff',
  },
  removePhotoText: {
    fontSize: 12,
    color: '#ff3b30',
    fontWeight: '600',
  },
  sendPhotoBtn: {
    backgroundColor: '#805072',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  quickButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 6,
  },
  quickBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f7',
    paddingVertical: 4,
    paddingHorizontal: 2,
    borderRadius: 4,
    flex: 1,
    aspectRatio: 1,
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
    backgroundColor: '#805d7e',
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
    color: '#fff',
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

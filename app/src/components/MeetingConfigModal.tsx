import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { AppContact } from './ContactsModal';
import { DetectedPlace } from '../places';
import TimeWheelPicker from './TimeWheelPicker';
import i18n from '../i18n';

interface MeetingConfigModalProps {
  visible: boolean;
  contacts: AppContact[];
  place: DetectedPlace | null;
  initialDuration?: 30 | 60 | 120;
  initialTime?: string | null;
  initialMessage?: string;
  sending?: boolean;
  onClose: () => void;
  onChangePlaceOnMap: () => void;
  onConfirm: (durationMinutes: number, timeString: string | null, message: string) => void;
}

export default function MeetingConfigModal({
  visible,
  contacts,
  place,
  initialDuration = 60,
  initialTime = null,
  initialMessage = '',
  sending = false,
  onClose,
  onChangePlaceOnMap,
  onConfirm,
}: MeetingConfigModalProps) {
  const [selectedDuration, setSelectedDuration] = useState<30 | 60 | 120>(initialDuration);
  const [hasSpecificTime, setHasSpecificTime] = useState<boolean>(true);
  const [selectedHour, setSelectedHour] = useState<number>(() => {
    const d = new Date(Date.now() + 30 * 60 * 1000);
    return d.getHours();
  });
  const [selectedMinute, setSelectedMinute] = useState<number>(() => {
    const d = new Date(Date.now() + 30 * 60 * 1000);
    const m = d.getMinutes();
    return Math.round(m / 5) * 5 % 60;
  });
  const [message, setMessage] = useState<string>(initialMessage);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (visible) {
      setSelectedDuration(initialDuration);
      setMessage(initialMessage);

      // Sätt starttid om angivet eller förslag
      if (initialTime && initialTime.includes(':')) {
        const match = initialTime.match(/(\d{1,2}):(\d{2})/);
        if (match) {
          const h = parseInt(match[1], 10);
          const m = parseInt(match[2], 10);
          if (!isNaN(h)) setSelectedHour(h);
          if (!isNaN(m)) setSelectedMinute(Math.round(m / 5) * 5 % 60);
          setHasSpecificTime(true);
          return;
        }
      }

      // Förval: nästa avrundade tid (om 30 min)
      const d = new Date(Date.now() + 30 * 60 * 1000);
      setSelectedHour(d.getHours());
      const m = d.getMinutes();
      setSelectedMinute(Math.round(m / 5) * 5 % 60);
      setHasSpecificTime(true);
    }
  }, [visible, initialTime, initialDuration, initialMessage]);

  useEffect(() => {
    if (!visible) return;
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvt, () => {
      setIsKeyboardOpen(true);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    });

    const hideSub = Keyboard.addListener(hideEvt, () => {
      setIsKeyboardOpen(false);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [visible]);

  const names = contacts.map(c => c.name).join(', ');
  const formattedHour = String(selectedHour).padStart(2, '0');
  const formattedMinute = String(selectedMinute).padStart(2, '0');
  const timeString = hasSpecificTime ? `Kl ${formattedHour}:${formattedMinute}` : null;

  const handleTimeChange = (h: number, m: number) => {
    setSelectedHour(h);
    setSelectedMinute(m);
  };

  const handleSend = () => {
    onConfirm(selectedDuration, timeString, message.trim());
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => {
            if (isKeyboardOpen) Keyboard.dismiss();
            else onClose();
          }}
        />

        <View style={styles.modalContent}>
          <View style={styles.dragHandle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{i18n.t('share_tab_meeting_point')}</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {i18n.t('meeting_with_name', { name: names })}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            ref={scrollViewRef}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: isKeyboardOpen ? 180 : 32 }}
          >
            {/* Vald plats */}
            <Text style={styles.sectionLabel}>VALD MÖTESPLATS</Text>
            <View style={styles.placeCard}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.placeName} numberOfLines={2}>
                  {place?.name || i18n.t('move_map_instruction')}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.changePlaceBtn}
                onPress={onChangePlaceOnMap}
                activeOpacity={0.7}
              >
                <Text style={styles.changePlaceText}>Ändra</Text>
              </TouchableOpacity>
            </View>

            {/* Tid för möte (med snurrorna) */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionLabel}>{i18n.t('meeting_time_label')}</Text>
              {hasSpecificTime && (
                <Text style={styles.selectedTimeBadge}>
                  Kl {formattedHour}:{formattedMinute}
                </Text>
              )}
            </View>

            {/* Tidstyp-knappar */}
            <View style={styles.timeModeRow}>
              <TouchableOpacity
                style={[styles.timeModeBtn, hasSpecificTime && styles.timeModeBtnActive]}
                onPress={() => setHasSpecificTime(true)}
                activeOpacity={0.8}
              >
                <Text style={[styles.timeModeText, hasSpecificTime && styles.timeModeTextActive]}>
                  Välj klockslag
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.timeModeBtn, !hasSpecificTime && styles.timeModeBtnActive]}
                onPress={() => setHasSpecificTime(false)}
                activeOpacity={0.8}
              >
                <Text style={[styles.timeModeText, !hasSpecificTime && styles.timeModeTextActive]}>
                  Nu direkt / Valfri tid
                </Text>
              </TouchableOpacity>
            </View>

            {/* Snurrorna för timme och minut */}
            {hasSpecificTime && (
              <TimeWheelPicker
                selectedHour={selectedHour}
                selectedMinute={selectedMinute}
                onChange={handleTimeChange}
              />
            )}

            {/* Hur länge mötesplatsen visas */}
            <Text style={[styles.sectionLabel, { marginTop: 16 }]}>
              {i18n.t('meeting_duration_label')}
            </Text>
            <View style={styles.durationRow}>
              {([30, 60, 120] as const).map(mins => (
                <TouchableOpacity
                  key={mins}
                  style={[
                    styles.durationPill,
                    selectedDuration === mins && styles.durationPillActive,
                  ]}
                  onPress={() => setSelectedDuration(mins)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.durationPillText,
                      selectedDuration === mins && styles.durationPillTextActive,
                    ]}
                  >
                    {mins} {i18n.t('min_short')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Meddelande */}
            <Text style={[styles.sectionLabel, { marginTop: 16 }]}>
              {i18n.t('write_custom_message').toUpperCase()}
            </Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.messageInput}
                placeholder={i18n.t('meeting_note_placeholder')}
                placeholderTextColor="#94a3b8"
                value={message}
                onChangeText={setMessage}
                maxLength={100}
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
                onFocus={() => {
                  setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 120);
                }}
              />
              {Boolean(message) && (
                <TouchableOpacity
                  style={styles.clearInputBtn}
                  onPress={() => setMessage('')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.clearInputText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Skicka-knapp */}
            <TouchableOpacity
              style={[styles.primaryButton, sending && { opacity: 0.7 }]}
              activeOpacity={0.85}
              onPress={handleSend}
              disabled={sending}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {i18n.t('send_meeting_point_btn')}
                </Text>
              )}
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
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 20,
  },
  dragHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
    alignSelf: 'center',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: 'bold',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: '#64748b',
    marginBottom: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 8,
  },
  selectedTimeBadge: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F4C5C',
    backgroundColor: '#0F4C5C15',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  placeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  placeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  placeEmoji: {
    fontSize: 24,
    marginRight: 10,
  },
  placeName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  changePlaceBtn: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  changePlaceText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F4C5C',
  },
  timeModeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  timeModeBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  timeModeBtnActive: {
    backgroundColor: '#ffffff',
    borderColor: '#0F4C5C',
  },
  timeModeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  timeModeTextActive: {
    color: '#0F4C5C',
    fontWeight: '700',
  },
  durationRow: {
    flexDirection: 'row',
    gap: 8,
  },
  durationPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  durationPillActive: {
    backgroundColor: '#0F4C5C',
    borderColor: '#0F4C5C',
  },
  durationPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  durationPillTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  inputContainer: {
    position: 'relative',
    justifyContent: 'center',
  },
  messageInput: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 14,
    paddingVertical: 12,
    paddingRight: 36,
    fontSize: 14,
    color: '#0f172a',
  },
  clearInputBtn: {
    position: 'absolute',
    right: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearInputText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  primaryButton: {
    marginTop: 20,
    backgroundColor: '#0F4C5C',
    borderRadius: 16,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F4C5C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  primaryButtonIcon: {
    fontSize: 16,
    color: '#ffffff',
    marginRight: 6,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});

import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import i18n from '../i18n';

interface TimePickerModalProps {
  visible: boolean;
  initialTime?: string | null;
  onClose: () => void;
  onSelectTime: (timeString: string) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];

export default function TimePickerModal({
  visible,
  initialTime,
  onClose,
  onSelectTime,
}: TimePickerModalProps) {
  const [selectedHour, setSelectedHour] = useState<number>(() => {
    const d = new Date(Date.now() + 30 * 60 * 1000);
    return d.getHours();
  });
  const [selectedMinute, setSelectedMinute] = useState<number>(() => {
    const d = new Date(Date.now() + 30 * 60 * 1000);
    const m = d.getMinutes();
    if (m < 15) return 0;
    if (m < 30) return 15;
    if (m < 45) return 30;
    return 45;
  });

  useEffect(() => {
    if (visible) {
      if (initialTime && initialTime.includes(':')) {
        const match = initialTime.match(/(\d{1,2}):(\d{2})/);
        if (match) {
          const h = parseInt(match[1], 10);
          const m = parseInt(match[2], 10);
          if (!isNaN(h) && h >= 0 && h < 24) setSelectedHour(h);
          if (!isNaN(m) && m >= 0 && m < 60) {
            const roundedMin = Math.round(m / 15) * 15 % 60;
            setSelectedMinute(roundedMin);
          }
          return;
        }
      }
      // Standard: nästa halvtimme
      const d = new Date(Date.now() + 30 * 60 * 1000);
      setSelectedHour(d.getHours());
      const m = d.getMinutes();
      if (m < 15) setSelectedMinute(0);
      else if (m < 30) setSelectedMinute(15);
      else if (m < 45) setSelectedMinute(30);
      else setSelectedMinute(45);
    }
  }, [visible, initialTime]);

  const formattedHour = String(selectedHour).padStart(2, '0');
  const formattedMinute = String(selectedMinute).padStart(2, '0');
  const timeString = `Kl ${formattedHour}:${formattedMinute}`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          style={styles.card}
          activeOpacity={1}
          onPress={() => {}}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>{i18n.t('choose_time_title') || 'Välj klockslag'}</Text>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Big Digital Display */}
          <View style={styles.displayRow}>
            <View style={styles.digitBoxActive}>
              <Text style={styles.digitTextActive}>{formattedHour}</Text>
            </View>
            <Text style={styles.colonText}>:</Text>
            <View style={styles.digitBoxActive}>
              <Text style={styles.digitTextActive}>{formattedMinute}</Text>
            </View>
          </View>

          {/* Välj timme */}
          <Text style={styles.sectionLabel}>TIMME</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.hoursScroll}
          >
            {HOURS.map(h => {
              const isSelected = selectedHour === h;
              return (
                <TouchableOpacity
                  key={`h-${h}`}
                  style={[styles.hourPill, isSelected && styles.hourPillActive]}
                  onPress={() => setSelectedHour(h)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.hourPillText, isSelected && styles.hourPillTextActive]}>
                    {String(h).padStart(2, '0')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Välj minut */}
          <Text style={styles.sectionLabel}>MINUTER</Text>
          <View style={styles.minutesRow}>
            {MINUTES.map(m => {
              const isSelected = selectedMinute === m;
              return (
                <TouchableOpacity
                  key={`m-${m}`}
                  style={[styles.minutePill, isSelected && styles.minutePillActive]}
                  onPress={() => setSelectedMinute(m)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.minutePillText, isSelected && styles.minutePillTextActive]}>
                    :{String(m).padStart(2, '0')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Spara-knapp */}
          <TouchableOpacity
            style={styles.confirmBtn}
            onPress={() => {
              onSelectTime(timeString);
              onClose();
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.confirmBtnText}>
              {i18n.t('confirm_time_btn', { time: timeString }) || `Välj ${timeString}`}
            </Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
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
    fontSize: 15,
    color: '#64748b',
    fontWeight: 'bold',
  },
  displayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    gap: 10,
  },
  digitBoxActive: {
    backgroundColor: '#134e5e',
    borderRadius: 14,
    paddingHorizontal: 22,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digitTextActive: {
    fontSize: 36,
    fontWeight: '800',
    color: '#ffffff',
    fontVariant: ['tabular-nums'],
  },
  colonText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#134e5e',
  },
  sectionLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  hoursScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 4,
    marginBottom: 16,
  },
  hourPill: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    borderWidth: 1.5,
    borderColor: '#134e5e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hourPillActive: {
    backgroundColor: '#134e5e',
  },
  hourPillText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  hourPillTextActive: {
    color: '#ffffff',
  },
  minutesRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 22,
  },
  minutePill: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    borderWidth: 1.5,
    borderColor: '#134e5e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  minutePillActive: {
    backgroundColor: '#134e5e',
  },
  minutePillText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  minutePillTextActive: {
    color: '#ffffff',
  },
  confirmBtn: {
    backgroundColor: '#134e5e',
    borderRadius: 14,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});

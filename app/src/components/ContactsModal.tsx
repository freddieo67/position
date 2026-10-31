import React, { useEffect, useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, ActivityIndicator, ScrollView } from 'react-native';
import * as Contacts from 'expo-contacts/legacy';
import { normalizePhone } from '../config';
import { api } from '../api';
import { SIGNALS } from '../signals';
import i18n from '../i18n';

// En kontakt i telefonboken som också har appen
export interface AppContact {
  id: string;
  name: string;
  phoneNumber: string;
  userId: number;
}

interface ContactsModalProps {
  visible: boolean;
  mode: 'send' | 'request' | 'signal' | 'ping' | null;
  currentUserId: number;
  onClose: () => void;
  onSelect: (contacts: AppContact | AppContact[], signalType?: string, message?: string, durationMinutes?: number) => void;
}

export default function ContactsModal({ visible, mode, currentUserId, onClose, onSelect }: ContactsModalProps) {
  const [contacts, setContacts] = useState<AppContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Array of contacts chosen for the final step (signal/message)
  const [chosenContacts, setChosenContacts] = useState<AppContact[]>([]);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [checkedContacts, setCheckedContacts] = useState<AppContact[]>([]);
  const [showCustomMessageInput, setShowCustomMessageInput] = useState(false);
  const [customMessageText, setCustomMessageText] = useState('');
  const [selectedDuration, setSelectedDuration] = useState<5 | 15 | 30>(15);

  useEffect(() => {
    if (visible) {
      setSearchQuery('');
      setChosenContacts([]);
      setMultiSelectMode(false);
      setCheckedContacts([]);
      setShowCustomMessageInput(false);
      setCustomMessageText('');
      setSelectedDuration(15);
      loadContacts();
    }
  }, [visible]);

  const loadContacts = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      await loadContactsInner();
    } catch (error) {
      console.error('Kunde inte läsa kontakter:', error);
      setErrorMsg(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  const loadContactsInner = async () => {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') {
      setErrorMsg('Appen behöver tillgång till dina kontakter för att hitta vänner.');
      return;
    }

    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.PhoneNumbers],
    });

    // Alla nummer från telefonboken, normaliserade till +46-format
    const entries = data.flatMap(c =>
      (c.phoneNumbers ?? [])
        .filter(p => !!p.number)
        .map(p => ({ id: String(c.id), name: c.name, phone: normalizePhone(p.number!) }))
    );
    if (entries.length === 0) {
      setContacts([]);
      return;
    }

    const uniqueNumbers = Array.from(new Set(entries.map(e => e.phone)));
    const { matches } = await api.matchContacts(uniqueNumbers);
    const userByPhone = new Map(matches.map(m => [m.phone_number, m]));

    // En rad per app-användare (en kontakt kan ha flera nummer), exkludera mig själv
    const seen = new Set<number>();
    const result: AppContact[] = [];
    for (const entry of entries) {
      const user = userByPhone.get(entry.phone);
      if (!user || Number(user.id) === Number(currentUserId) || seen.has(user.id)) continue;
      seen.add(user.id);
      result.push({ id: `${entry.id}-${user.id}`, name: entry.name, phoneNumber: entry.phone, userId: user.id });
    }

    setContacts(result);
  };

  const filteredContacts = contacts.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          {chosenContacts.length > 0 ? (
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.title}>
                {mode === 'send' ? `Dela med ${chosenContacts.map(c => c.name).join(', ')}` : `${i18n.t('send_to')} ${chosenContacts.map(c => c.name).join(', ')}`}
              </Text>

              {mode === 'send' && (
                <>
                  <Text style={styles.subtitle}>Hur länge vill du dela?</Text>
                  <View style={styles.durationRow}>
                    {([5, 15, 30] as const).map(mins => (
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
                          {mins} min
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <TouchableOpacity
                    style={styles.justPositionBtn}
                    onPress={() => onSelect(chosenContacts, 'none', undefined, selectedDuration)}
                  >
                    <Text style={styles.justPositionEmoji}>📍</Text>
                    <Text style={styles.justPositionText}>
                      {i18n.t('just_position')} ({selectedDuration} min)
                    </Text>
                  </TouchableOpacity>
                </>
              )}

              <Text style={styles.subtitle}>
                {mode === 'send' ? i18n.t('want_to_send_signal') : 'Snabbmeddelande:'}
              </Text>

              <View style={styles.quickButtons}>
                {SIGNALS.map(s => (
                  <TouchableOpacity
                    key={s.type}
                    style={styles.quickBtn}
                    onPress={() => onSelect(chosenContacts, s.type, undefined, selectedDuration)}
                  >
                    <Text style={styles.emoji}>{s.emoji}</Text>
                    <Text style={styles.quickText}>{i18n.t(`signal_${s.type}`, { defaultValue: s.label })}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.divider} />

              <Text style={styles.subtitle}>{i18n.t('write_custom_message')}:</Text>
              <TextInput
                style={styles.input}
                placeholder={i18n.t('eg_see_you_bar')}
                value={customMessageText}
                onChangeText={setCustomMessageText}
                maxLength={100}
              />
              <TouchableOpacity
                style={[styles.sendBtn, !customMessageText.trim() && styles.disabledBtn]}
                disabled={!customMessageText.trim()}
                onPress={() => onSelect(chosenContacts, 'custom', customMessageText.trim(), selectedDuration)}
              >
                <Text style={styles.sendBtnText}>
                  {mode === 'send' ? `${i18n.t('send_position_and_message')} (${selectedDuration} min)` : 'Skicka meddelande 💬'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.backButton} onPress={() => setChosenContacts([])}>
                <Text style={styles.backButtonText}>{i18n.t('back')}</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : (
            <>
              <Text style={styles.title}>
                {mode === 'send' ? 'Dela position med...' : mode === 'signal' ? 'Skicka signal till...' : mode === 'ping' ? 'Pinga...' : 'Begär position från...'}
              </Text>
              {mode !== 'send' && (
                <Text style={styles.subtitle}>
                  {mode === 'signal'
                    ? 'Bjud på en öl, skicka en kram eller en kyss.'
                    : mode === 'ping'
                    ? 'Skicka en snabb notis till...'
                    : 'När de tackar ja ser ni varandras position.'}
                </Text>
              )}
              <Text style={styles.hint}>({i18n.t('long_press_hint')})</Text>

              <TextInput
                style={styles.searchInput}
                placeholder={i18n.t('search_friends')}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />

              {loading ? (
                <ActivityIndicator style={{ marginTop: 20 }} />
              ) : errorMsg ? (
                <Text style={styles.errorText}>{errorMsg}</Text>
              ) : (
                <FlatList
                  data={filteredContacts}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[styles.contactRow, checkedContacts.some(c => c.id === item.id) && { backgroundColor: '#f0f8ff' }]}
                      onPress={() => {
                        if (multiSelectMode) {
                          setCheckedContacts(prev => prev.some(c => c.id === item.id) ? prev.filter(c => c.id !== item.id) : [...prev, item]);
                        } else {
                          if (mode === 'send' || mode === 'signal') {
                            setChosenContacts([item]);
                          } else {
                            onSelect([item]);
                          }
                        }
                      }}
                      onLongPress={() => {
                        if (!multiSelectMode) {
                          setMultiSelectMode(true);
                          setCheckedContacts([item]);
                        }
                      }}
                    >
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{item.name.charAt(0)}</Text>
                      </View>
                      <Text style={styles.contactName}>{item.name}</Text>
                      {multiSelectMode && (
                        <View style={{ marginLeft: 'auto' }}>
                          <Text style={{ fontSize: 24 }}>{checkedContacts.some(c => c.id === item.id) ? '✅' : '⚪'}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  )}
                  ListEmptyComponent={<Text style={styles.emptyText}>Inga vänner med appen hittades.</Text>}
                />
              )}
              {multiSelectMode && checkedContacts.length > 0 && (
                <TouchableOpacity
                  style={[styles.closeButton, { backgroundColor: '#34C759', marginBottom: 10 }]}
                  onPress={() => {
                    if (mode === 'request' || mode === 'ping') {
                      onSelect(checkedContacts);
                    } else {
                      setChosenContacts(checkedContacts);
                    }
                  }}
                >
                  <Text style={styles.closeButtonText}>Gå vidare ({checkedContacts.length} valda)</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {chosenContacts.length === 0 && (
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>Avbryt</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    height: '80%', // Tar upp 80% av skärmen
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  hint: {
    fontSize: 13,
    color: '#888',
    marginBottom: 15,
  },
  searchInput: {
    backgroundColor: '#f0f0f0',
    padding: 12,
    borderRadius: 10,
    marginBottom: 15,
    fontSize: 16,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  avatarText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  contactName: {
    fontSize: 16,
  },
  signalEmoji: {
    fontSize: 28,
    marginRight: 15,
  },
  backButton: {
    marginTop: 15,
    padding: 12,
    alignItems: 'center',
  },
  backButtonText: {
    color: '#805d73',
    fontWeight: 'bold',
    fontSize: 16,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 20,
    color: '#666',
  },
  errorText: {
    textAlign: 'center',
    marginTop: 20,
    color: '#ff3b30',
  },
  closeButton: {
    marginTop: 20,
    padding: 15,
    backgroundColor: '#ff3b30',
    borderRadius: 10,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  durationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    marginTop: 4,
  },
  durationBtn: {
    flex: 1,
    paddingVertical: 10,
    marginHorizontal: 4,
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
  },
  durationBtnActive: {
    backgroundColor: '#5d7e80',
    borderColor: '#5d7e80',
  },
  durationText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#555',
  },
  durationTextActive: {
    color: '#fff',
  },
  justPositionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f4f5f7',
    borderWidth: 1,
    borderColor: '#e1e4e8',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    marginBottom: 16,
    marginTop: 6,
  },
  justPositionEmoji: {
    fontSize: 20,
    marginRight: 8,
  },
  justPositionText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
  },
  quickButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  quickBtn: {
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    paddingVertical: 12,
    paddingHorizontal: 6,
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
    backgroundColor: '#805d73',
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
});

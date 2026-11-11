import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, ActivityIndicator, ScrollView, Alert, Image, KeyboardAvoidingView, Keyboard, Platform, RefreshControl } from 'react-native';
import * as Contacts from 'expo-contacts/legacy';
import { normalizePhone } from '../config';
import { api } from '../api';
import { SIGNALS } from '../signals';
import { MAP_ICONS, getSavedMapIcon, saveMapIcon, MapIconEmoji, DEFAULT_MAP_ICON } from '../mapIcons';
import {
  ContactUsageMap,
  getCachedContacts,
  getContactUsage,
  getFavoriteIds,
  getQuickContacts,
  saveCachedContacts,
  toggleFavoriteId,
} from '../contactPrefs';
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
  mode: 'send' | 'request' | 'signal' | 'ping' | 'flash' | null;
  currentUserId: number;
  onClose: () => void;
  onSelect: (
    contacts: AppContact | AppContact[],
    signalType?: string,
    message?: string,
    durationMinutes?: number,
    icon?: string,
    photoThumb?: string | null,
    photoData?: string | null
  ) => void;
}

export default function ContactsModal({ visible, mode, currentUserId, onClose, onSelect }: ContactsModalProps) {
  const [contacts, setContacts] = useState<AppContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Array of contacts chosen for the final step (signal/message)
  const [chosenContacts, setChosenContacts] = useState<AppContact[]>([]);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [checkedContacts, setCheckedContacts] = useState<AppContact[]>([]);
  const [showCustomMessageInput, setShowCustomMessageInput] = useState(false);
  const [customMessageText, setCustomMessageText] = useState('');
  const [selectedDuration, setSelectedDuration] = useState<15 | 30 | 60>(15);
  const [selectedIcon, setSelectedIcon] = useState<MapIconEmoji>(DEFAULT_MAP_ICON);
  const [favoriteIds, setFavoriteIds] = useState<number[]>([]);
  const [usageMap, setUsageMap] = useState<ContactUsageMap>({});
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!visible || chosenContacts.length === 0) return;
    const event = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const sub = Keyboard.addListener(event, () => {
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 120);
    });
    return () => sub.remove();
  }, [visible, chosenContacts.length]);

  useEffect(() => {
    if (!visible) return;
    setSearchQuery('');
    setChosenContacts([]);
    setMultiSelectMode(false);
    setCheckedContacts([]);
    setShowCustomMessageInput(false);
    setCustomMessageText('');
    setSelectedDuration(15);
    getSavedMapIcon().then(setSelectedIcon);
    initContacts();
  }, [visible]);

  const sortAlphabetically = (list: AppContact[]) =>
    [...list].sort((a, b) => a.name.localeCompare(b.name, 'sv'));

  const initContacts = async () => {
    setErrorMsg(null);
    const [cached, favs, usage] = await Promise.all([
      getCachedContacts(currentUserId),
      getFavoriteIds(currentUserId),
      getContactUsage(currentUserId),
    ]);
    setFavoriteIds(favs);
    setUsageMap(usage);

    if (cached.length > 0) {
      setContacts(sortAlphabetically(cached));
      setLoading(false);
      // Tyst uppdatering i bakgrunden så nya vänner dyker upp automatiskt utan väntetid
      loadContactsInner(true).catch(err => console.warn('Bakgrundssynk av kontakter misslyckades:', err));
    } else {
      await loadContacts(false);
    }
  };

  const loadContacts = async (isPullRefresh: boolean = false) => {
    if (isPullRefresh) setRefreshing(true);
    else setLoading(true);
    setErrorMsg(null);
    try {
      await loadContactsInner(false);
    } catch (error) {
      console.error('Kunde inte läsa kontakter:', error);
      setErrorMsg(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadContactsInner = async (silent: boolean = false) => {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') {
      if (!silent) setErrorMsg(i18n.t('contacts_permission_needed'));
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
      await saveCachedContacts(currentUserId, []);
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

    const sorted = sortAlphabetically(result);
    setContacts(sorted);
    await saveCachedContacts(currentUserId, sorted);
  };

  const handleToggleFavorite = async (targetUserId: number) => {
    const next = await toggleFavoriteId(currentUserId, targetUserId);
    setFavoriteIds(next);
  };

  const handleContactTap = (item: AppContact) => {
    if (multiSelectMode) {
      setCheckedContacts(prev =>
        prev.some(c => c.id === item.id) ? prev.filter(c => c.id !== item.id) : [...prev, item]
      );
    } else if (mode === 'send' || mode === 'signal') {
      setChosenContacts([item]);
    } else {
      onSelect([item]);
    }
  };

  const handleContactLongPress = (item: AppContact) => {
    if (!multiSelectMode) {
      setMultiSelectMode(true);
      setCheckedContacts([item]);
    }
  };

  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  const quickContacts = useMemo(() => {
    const { favorites, recent } = getQuickContacts(contacts, favoriteIds, usageMap, 8);
    return [...favorites, ...recent];
  }, [contacts, favoriteIds, usageMap]);

  const filteredContacts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(c => c.name.toLowerCase().includes(q));
  }, [contacts, searchQuery]);

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior="padding"
      >
        <View style={styles.modalContent}>
          {chosenContacts.length > 0 ? (
            <ScrollView
              ref={scrollViewRef}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 28 }}
            >
              <Text style={styles.title}>
                {mode === 'send' ? i18n.t('share_with_names', { names: chosenContacts.map(c => c.name).join(', ') }) : `${i18n.t('send_to')} ${chosenContacts.map(c => c.name).join(', ')}`}
              </Text>

              {mode === 'send' && (
                <>
                  <Text style={styles.subtitle}>{i18n.t('how_long_share')}</Text>
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

                  <Text style={styles.subtitle}>{i18n.t('your_map_icon')}</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.mapIconScroll}
                  >
                    {MAP_ICONS.map(item => {
                      const isSelected = selectedIcon === item.emoji;
                      return (
                        <TouchableOpacity
                          key={item.id}
                          style={[
                            styles.mapIconBtn,
                            isSelected && styles.mapIconBtnActive,
                          ]}
                          onPress={() => {
                            setSelectedIcon(item.emoji);
                            saveMapIcon(item.emoji);
                          }}
                        >
                          <Text style={styles.mapIconEmoji}>{item.emoji}</Text>
                          <Text style={[styles.mapIconLabel, isSelected && styles.mapIconLabelActive]}>
                            {item.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  <TouchableOpacity
                    style={styles.justPositionBtn}
                    onPress={() =>
                      onSelect(
                        chosenContacts,
                        'none',
                        undefined,
                        selectedDuration,
                        selectedIcon
                      )
                    }
                  >
                    <Text style={styles.justPositionEmoji}>{selectedIcon}</Text>
                    <Text style={styles.justPositionText}>
                      {`${i18n.t('just_position')} (${selectedDuration} ${i18n.t('min_short')})`}
                    </Text>
                  </TouchableOpacity>
                </>
              )}

              <Text style={styles.subtitle}>
                {mode === 'send'
                  ? i18n.t('ready_flash_mess_with_pos_label')
                  : i18n.t('ready_flash_mess_label')}
              </Text>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.signalsScroll}
              >
                {SIGNALS.map(s => (
                  <TouchableOpacity
                    key={s.type}
                    style={styles.readySignalBtn}
                    onPress={() =>
                      onSelect(
                        chosenContacts,
                        s.type,
                        undefined,
                        selectedDuration,
                        selectedIcon
                      )
                    }
                  >
                    <Text style={styles.readySignalEmoji}>{s.emoji}</Text>
                    <Text style={styles.readySignalLabel}>{s.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={styles.divider} />

              <Text style={styles.subtitle}>{i18n.t('write_custom_message')}:</Text>
              <TextInput
                style={styles.input}
                placeholder={i18n.t('eg_see_you_bar')}
                value={customMessageText}
                onChangeText={setCustomMessageText}
                maxLength={100}
                onFocus={() => {
                  setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 150);
                }}
              />
              <TouchableOpacity
                style={[styles.sendBtn, !customMessageText.trim() && styles.disabledBtn]}
                disabled={!customMessageText.trim()}
                onPress={() =>
                  onSelect(
                    chosenContacts,
                    'custom',
                    customMessageText.trim(),
                    selectedDuration,
                    selectedIcon
                  )
                }
              >
                <Text style={styles.sendBtnText}>
                  {mode === 'send' ? `${i18n.t('send_position_and_message')} (${selectedDuration} ${i18n.t('min_short')})` : `${i18n.t('send_message_btn')} 💬`}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.backButton} onPress={() => setChosenContacts([])}>
                <Text style={styles.backButtonText}>{i18n.t('back')}</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : (
            <>
              <Text style={styles.title}>
                {mode === 'send'
                  ? i18n.t('share_position_with')
                  : mode === 'signal'
                  ? i18n.t('send_signal_to')
                  : mode === 'ping'
                  ? i18n.t('phing_to_title')
                  : mode === 'flash'
                  ? i18n.t('flash_to_title')
                  : i18n.t('request_from_title')}
              </Text>
              {mode !== 'send' && (
                <Text style={styles.subtitle}>
                  {mode === 'signal'
                    ? i18n.t('signal_hint')
                    : mode === 'ping'
                    ? i18n.t('phing_hint')
                    : mode === 'flash'
                    ? i18n.t('flash_hint')
                    : i18n.t('request_hint')}
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
                <>
                  {!searchQuery.trim() && quickContacts.length > 0 && (
                    <View style={styles.quickSection}>
                      <Text style={styles.sectionHeader}>{i18n.t('quick_contacts_label')}</Text>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={styles.quickScroll}
                      >
                        {quickContacts.map(item => {
                          const isFav = favoriteSet.has(item.userId);
                          const isChecked = checkedContacts.some(c => c.id === item.id);
                          const firstName = item.name.trim().split(/\s+/)[0] || item.name;
                          return (
                            <TouchableOpacity
                              key={`quick-${item.id}`}
                              style={styles.quickItem}
                              onPress={() => handleContactTap(item)}
                              onLongPress={() => handleContactLongPress(item)}
                            >
                              <View
                                style={[
                                  styles.quickAvatar,
                                  isFav ? styles.quickAvatarFav : styles.quickAvatarRecent,
                                  isChecked && styles.quickAvatarChecked,
                                ]}
                              >
                                <Text style={styles.quickAvatarText}>{item.name.charAt(0).toUpperCase()}</Text>
                                {isChecked ? (
                                  <View style={styles.quickBadge}>
                                    <Text style={styles.quickBadgeText}>✅</Text>
                                  </View>
                                ) : isFav ? (
                                  <View style={styles.quickBadge}>
                                    <Text style={styles.quickBadgeText}>⭐</Text>
                                  </View>
                                ) : null}
                              </View>
                              <Text style={styles.quickName} numberOfLines={1}>
                                {firstName}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>
                  )}

                  {filteredContacts.length > 0 && (
                    <Text style={styles.sectionHeader}>
                      {i18n.t('all_friends_label', { count: filteredContacts.length })}
                    </Text>
                  )}

                  <FlatList
                    data={filteredContacts}
                    keyExtractor={(item) => item.id}
                    keyboardShouldPersistTaps="handled"
                    initialNumToRender={20}
                    maxToRenderPerBatch={20}
                    windowSize={10}
                    refreshControl={
                      <RefreshControl refreshing={refreshing} onRefresh={() => loadContacts(true)} />
                    }
                    renderItem={({ item }) => {
                      const isFav = favoriteSet.has(item.userId);
                      const isChecked = checkedContacts.some(c => c.id === item.id);
                      return (
                        <TouchableOpacity
                          style={[styles.contactRow, isChecked && { backgroundColor: '#f0f8ff' }]}
                          onPress={() => handleContactTap(item)}
                          onLongPress={() => handleContactLongPress(item)}
                        >
                          <View style={[styles.avatar, isFav && styles.avatarFavorite]}>
                            <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
                          </View>
                          <Text style={styles.contactName} numberOfLines={1}>
                            {item.name}
                          </Text>
                          {multiSelectMode ? (
                            <View style={{ marginLeft: 'auto' }}>
                              <Text style={{ fontSize: 24 }}>{isChecked ? '✅' : '⚪'}</Text>
                            </View>
                          ) : (
                            <TouchableOpacity
                              style={styles.starBtn}
                              onPress={() => handleToggleFavorite(item.userId)}
                              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            >
                              <Text style={[styles.starText, isFav && styles.starTextActive]}>
                                {isFav ? '⭐' : '☆'}
                              </Text>
                            </TouchableOpacity>
                          )}
                        </TouchableOpacity>
                      );
                    }}
                    ListEmptyComponent={<Text style={styles.emptyText}>{i18n.t('no_friends_found')}</Text>}
                  />
                </>
              )}
              {multiSelectMode && checkedContacts.length > 0 && (
                <TouchableOpacity
                  style={[styles.closeButton, { backgroundColor: '#34C759', marginBottom: 10 }]}
                  onPress={() => {
                    if (mode === 'request' || mode === 'ping' || mode === 'flash') {
                      onSelect(checkedContacts);
                    } else {
                      setChosenContacts(checkedContacts);
                    }
                  }}
                >
                  <Text style={styles.closeButtonText}>{i18n.t('continue_selected', { count: checkedContacts.length })}</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {chosenContacts.length === 0 && (
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>{i18n.t('cancel')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
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
    height: '88%',
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
    marginBottom: 12,
    fontSize: 16,
  },
  quickSection: {
    marginBottom: 10,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  quickScroll: {
    paddingVertical: 4,
    gap: 12,
  },
  quickItem: {
    width: 60,
    alignItems: 'center',
  },
  quickAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  quickAvatarFav: {
    backgroundColor: '#0F4C5C',
  },
  quickAvatarRecent: {
    backgroundColor: '#007AFF',
  },
  quickAvatarChecked: {
    borderWidth: 2.5,
    borderColor: '#34C759',
  },
  quickAvatarText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18,
  },
  quickBadge: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    backgroundColor: '#fff',
    borderRadius: 10,
    width: 19,
    height: 19,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
    elevation: 2,
  },
  quickBadgeText: {
    fontSize: 11,
  },
  quickName: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
    color: '#222',
    textAlign: 'center',
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
  avatarFavorite: {
    backgroundColor: '#0F4C5C',
  },
  avatarText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  contactName: {
    fontSize: 16,
    flex: 1,
    marginRight: 8,
  },
  starBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    marginLeft: 'auto',
  },
  starText: {
    fontSize: 22,
    color: '#bbb',
  },
  starTextActive: {
    color: '#f5a623',
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
    color: '#666',
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
  justPositionBtn: {
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
  justPositionEmoji: {
    fontSize: 20,
    marginRight: 8,
  },
  justPositionText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
  },
  justPositionPinThumb: {
    width: 20,
    height: 20,
    marginRight: 8,
  },
  quickButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 6,
  },
  quickBtn: {
    alignItems: 'center',
    backgroundColor: '#f5f5f7',
    paddingVertical: 6,
    paddingHorizontal: 2,
    borderRadius: 4, // Fyrkantig ruta
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#e2e4e8',
  },
  emoji: {
    fontSize: 24,
    marginBottom: 1,
  },
  quickText: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    color: '#333',
  },
  signalsScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 2,
    marginBottom: 10,
  },
  readySignalBtn: {
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
  readySignalEmoji: {
    fontSize: 22,
    marginBottom: 3,
  },
  readySignalLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  mapIconScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 2,
    marginBottom: 10,
  },
  mapIconRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 6,
  },
  mapIconBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f7',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    minWidth: 54,
    height: 54,
    borderWidth: 1.5,
    borderColor: '#e2e4e8',
  },
  pinIconImage: {
    width: 24,
    height: 24,
    marginBottom: 2,
  },
  mapIconBtnActive: {
    backgroundColor: '#eaf2ff',
    borderColor: '#007AFF',
  },
  mapIconEmoji: {
    fontSize: 24,
    marginBottom: 1,
  },
  mapIconLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#555',
    textAlign: 'center',
  },
  mapIconLabelActive: {
    color: '#007AFF',
    fontWeight: '700',
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
});

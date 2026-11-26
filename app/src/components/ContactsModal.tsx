import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  RefreshControl,
  AppState,
  Linking,
} from 'react-native';
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
    photoData?: string | null,
    isMeetingPoint?: boolean
  ) => void;
}

const formatShortName = (name?: string) => {
  if (!name) return '';
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return parts[0] || '';
  return `${parts[0]} ${parts[1]?.charAt(0) || ''}.`;
};

const QUICK_SIGNALS = [
  { type: 'where_are_you', label: 'Var är du?' },
  { type: 'on_my_way', label: 'På väg!' },
  { type: 'soon', label: 'Kommer snart' },
  { type: 'here', label: 'Jag är här' },
];

export default function ContactsModal({ visible, mode, currentUserId, onClose, onSelect }: ContactsModalProps) {
  const [contacts, setContacts] = useState<AppContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [chosenContacts, setChosenContacts] = useState<AppContact[]>([]);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [checkedContacts, setCheckedContacts] = useState<AppContact[]>([]);
  const [customMessageText, setCustomMessageText] = useState('');
  const [selectedDuration, setSelectedDuration] = useState<30 | 60 | 240>(30);
  const [shareSubMode, setShareSubMode] = useState<'position' | 'meeting'>('position');
  const [selectedMeetingDuration, setSelectedMeetingDuration] = useState<30 | 60 | 240>(60);
  const [selectedIcon, setSelectedIcon] = useState<MapIconEmoji>(DEFAULT_MAP_ICON);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<number[]>([]);
  const [usageMap, setUsageMap] = useState<ContactUsageMap>({});
  const [isLimitedAccess, setIsLimitedAccess] = useState(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!visible) return;
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvt, () => {
      setIsKeyboardOpen(true);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 300);
    });

    const hideSub = Keyboard.addListener(hideEvt, () => {
      setIsKeyboardOpen(false);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [visible, chosenContacts.length]);

  useEffect(() => {
    if (!visible) return;
    setSearchQuery('');
    setChosenContacts([]);
    setMultiSelectMode(false);
    setCheckedContacts([]);
    setCustomMessageText('');
    setSelectedDuration(30);
    setShareSubMode('position');
    setSelectedMeetingDuration(60);
    setShowIconPicker(false);
    getSavedMapIcon().then(setSelectedIcon);
    initContacts();

    const appStateSub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        setContacts(current => {
          if (current.length === 0) {
            loadContactsInner(true).catch(() => {});
          }
          return current;
        });
      }
    });
    return () => appStateSub.remove();
  }, [visible]);

  const sortAlphabetically = (list: AppContact[]) =>
    [...list].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'sv'));

  const checkLimitedStatus = async () => {
    try {
      const perm = await Contacts.getPermissionsAsync();
      const isLimited = Platform.OS === 'ios' && (perm as any).accessPrivileges === 'limited';
      setIsLimitedAccess(isLimited);
    } catch (_) {}
  };

  const initContacts = async () => {
    setErrorMsg(null);
    checkLimitedStatus();
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
    try {
      const currentPerm = await Contacts.getPermissionsAsync();
      if (currentPerm.status === 'undetermined') {
        await new Promise<void>(resolve => {
          Alert.alert(
            i18n.t('contacts_pre_perm_title'),
            i18n.t('contacts_pre_perm_desc'),
            [{ text: i18n.t('continue'), onPress: () => resolve() }],
            { cancelable: false }
          );
        });
      }
    } catch (_) {}

    const perm = await Contacts.requestPermissionsAsync();
    if (perm.status !== 'granted') {
      if (!silent) setErrorMsg(i18n.t('contacts_permission_needed'));
      return;
    }
    const isLimited = Platform.OS === 'ios' && (perm as any).accessPrivileges === 'limited';
    setIsLimitedAccess(isLimited);

    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.PhoneNumbers],
    });

    const entries = data.flatMap(c =>
      (c.phoneNumbers ?? [])
        .filter(p => !!p.number)
        .map(p => ({
          id: String(c.id),
          name: (c.name || `${c.firstName || ''} ${c.lastName || ''}`.trim() || p.number || 'Okänd').trim(),
          phone: normalizePhone(p.number!),
        }))
    );
    if (entries.length === 0) {
      setContacts([]);
      await saveCachedContacts(currentUserId, []);
      return;
    }

    const uniqueNumbers = Array.from(new Set(entries.map(e => e.phone)));
    const { matches } = await api.matchContacts(uniqueNumbers);
    const userByPhone = new Map(matches.map(m => [m.phone_number, m]));

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

  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  const favoriteContacts = useMemo(() => {
    const favs = contacts.filter(c => favoriteSet.has(c.userId));
    if (favs.length > 0) return favs;
    const { favorites, recent } = getQuickContacts(contacts, favoriteIds, usageMap, 6);
    return [...favorites, ...recent].slice(0, 6);
  }, [contacts, favoriteIds, favoriteSet, usageMap]);

  const filteredContacts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(c => c.name.toLowerCase().includes(q));
  }, [contacts, searchQuery]);

  const chosenNames = chosenContacts.map(c => c.name).join(', ');

  const getModalTitle = () => {
    if (mode === 'send') return i18n.t('share_position_with');
    if (mode === 'ping') return i18n.t('phing_to_title');
    if (mode === 'flash') return i18n.t('flash_to_title');
    if (mode === 'request') return i18n.t('request_from_title');
    if (mode === 'signal') return i18n.t('send_signal_to');
    return i18n.t('share_position_with');
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={() => {
        if (chosenContacts.length > 0) {
          setChosenContacts([]);
        } else {
          onClose();
        }
      }}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => {
            if (isKeyboardOpen) {
              Keyboard.dismiss();
            } else if (chosenContacts.length === 0) {
              onClose();
            }
          }}
        />
        <View
          style={[
            styles.modalContent,
            chosenContacts.length === 0 && { height: '88%' },
          ]}
        >
          <View style={styles.dragHandle} />

          {chosenContacts.length > 0 ? (
            /* STEP 2: SHARE / SIGNAL CONFIGURATION (Mockup Image 5) */
            <ScrollView
              ref={scrollViewRef}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: isKeyboardOpen ? 180 : 28 }}
            >
              <Text style={styles.title}>
                {i18n.t('share_with_name_title', { names: chosenNames })}
              </Text>
              <Text style={styles.subtitle}>
                {i18n.t('share_with_name_subtitle', { names: chosenNames, mins: selectedDuration })}
              </Text>

              {mode === 'send' && (
                <View style={styles.segmentedContainer}>
                  <TouchableOpacity
                    style={[styles.segmentBtn, shareSubMode === 'position' && styles.segmentBtnActive]}
                    onPress={() => setShareSubMode('position')}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.segmentText, shareSubMode === 'position' && styles.segmentTextActive]}>
                      {i18n.t('share_tab_my_position')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.segmentBtn, shareSubMode === 'meeting' && styles.segmentBtnActive]}
                    onPress={() => setShareSubMode('meeting')}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.segmentText, shareSubMode === 'meeting' && styles.segmentTextActive]}>
                      {i18n.t('share_tab_meeting_point')}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {mode === 'send' && shareSubMode === 'meeting' ? (
                <View style={styles.firstStageMeetingContainer}>
                  <View style={styles.firstStageMeetingCard}>
                    <Text style={styles.firstStageMeetingEmoji}>📍</Text>
                    <Text style={styles.firstStageMeetingTitle}>
                      {i18n.t('meeting_point_pick_desc')}
                    </Text>
                    <Text style={styles.firstStageMeetingSub}>
                      {i18n.t('meeting_point_pick_sub')}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.primaryActionButton}
                    activeOpacity={0.85}
                    onPress={() =>
                      onSelect(
                        chosenContacts,
                        'meeting_point',
                        undefined,
                        60,
                        '📍',
                        null,
                        null,
                        true
                      )
                    }
                  >
                    <Text style={styles.primaryActionButtonText}>{i18n.t('pick_on_map_btn')}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  {mode === 'send' && (
                    <>
                      <Text style={styles.sectionLabel}>{i18n.t('how_long_label')}</Text>
                      <View style={styles.durationRow}>
                        {([30, 60, 240] as const).map(mins => (
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
                              {mins === 240 ? '4 tim' : `${mins} ${i18n.t('min_short')}`}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  )}

                  {/* Section: Snabbsvar */}
                  <Text style={styles.sectionLabel}>{i18n.t('quick_replies_direct_label')}</Text>
                  <View style={styles.chipsWrap}>
                    {QUICK_SIGNALS.map(s => {
                      const sigObj = SIGNALS.find(sig => sig.type === s.type);
                      const displayLabel = sigObj ? sigObj.label : s.label;
                      return (
                        <TouchableOpacity
                          key={s.type}
                          style={styles.chip}
                          activeOpacity={0.7}
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
                          <Text style={styles.chipText}>{displayLabel}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Custom Message Input with embedded arrow button */}
                  <View style={styles.inputContainer}>
                    <TextInput
                      style={styles.input}
                      placeholder={i18n.t('custom_message_share_placeholder')}
                      placeholderTextColor="#94a3b8"
                      value={customMessageText}
                      onChangeText={setCustomMessageText}
                      maxLength={100}
                      returnKeyType="send"
                      onSubmitEditing={() => {
                        if (customMessageText.trim()) {
                          onSelect(
                            chosenContacts,
                            'custom',
                            customMessageText.trim(),
                            selectedDuration,
                            selectedIcon
                          );
                        }
                      }}
                      onFocus={() => {
                        setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
                        setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 300);
                      }}
                    />
                    <TouchableOpacity
                      style={[
                        styles.sendArrowBtn,
                        !customMessageText.trim() && styles.sendArrowBtnDisabled,
                      ]}
                      disabled={!customMessageText.trim()}
                      activeOpacity={0.8}
                      onPress={() => {
                        if (customMessageText.trim()) {
                          onSelect(
                            chosenContacts,
                            'custom',
                            customMessageText.trim(),
                            selectedDuration,
                            selectedIcon
                          );
                        }
                      }}
                    >
                      <Text style={styles.sendArrowBtnText}>→</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Primary Button: Dela position */}
                  {mode === 'send' && (
                    <TouchableOpacity
                      style={styles.primaryActionButton}
                      activeOpacity={0.85}
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
                      <Text style={styles.primaryActionButtonText}>{i18n.t('share_position_btn_text')}</Text>
                    </TouchableOpacity>
                  )}

                  {/* Map Icon Row */}
                  {mode === 'send' && (
                    <View style={styles.mapIconRowContainer}>
                      <View style={styles.mapIconRow}>
                        <View style={styles.mapIconCircle}>
                          <Text style={styles.mapIconEmojiText}>{selectedIcon}</Text>
                        </View>
                        <Text style={styles.mapIconRowTitle}>{i18n.t('your_map_icon_row')}</Text>
                        <TouchableOpacity
                          onPress={() => setShowIconPicker(prev => !prev)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.mapIconChangeLink}>{i18n.t('change_word')}</Text>
                        </TouchableOpacity>
                      </View>

                      {showIconPicker && (
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.iconPickerScroll}
                        >
                          {MAP_ICONS.map(item => {
                            const isSelected = selectedIcon === item.emoji;
                            return (
                              <TouchableOpacity
                                key={item.id}
                                style={[
                                  styles.iconPickerItem,
                                  isSelected && styles.iconPickerItemActive,
                                ]}
                                onPress={() => {
                                  setSelectedIcon(item.emoji);
                                  saveMapIcon(item.emoji);
                                }}
                              >
                                <Text style={styles.iconPickerEmoji}>{item.emoji}</Text>
                                <Text
                                  style={[
                                    styles.iconPickerLabel,
                                    isSelected && styles.iconPickerLabelActive,
                                  ]}
                                >
                                  {item.label}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                      )}
                    </View>
                  )}
                </>
              )}

              <TouchableOpacity
                style={styles.cancelTextBtn}
                activeOpacity={0.6}
                onPress={() => setChosenContacts([])}
              >
                <Text style={styles.cancelText}>{i18n.t('cancel')}</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : (
            /* STEP 1: CONTACTS LIST (Mockup Image 1) */
            <>
              {/* Header Row */}
              <View style={styles.headerRow}>
                <Text style={styles.title}>{getModalTitle()}</Text>
                <TouchableOpacity
                  style={styles.closeRoundBtn}
                  onPress={onClose}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.closeRoundBtnText}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Search & Multi-select row */}
              <View style={styles.searchRow}>
                <TextInput
                  style={styles.searchInput}
                  placeholder={i18n.t('search_friends')}
                  placeholderTextColor="#94a3b8"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={[
                    styles.chooseMultipleBtn,
                    multiSelectMode && styles.chooseMultipleBtnActive,
                  ]}
                  activeOpacity={0.8}
                  onPress={() => {
                    setMultiSelectMode(prev => !prev);
                    if (multiSelectMode) {
                      setCheckedContacts([]);
                    }
                  }}
                >
                  <Text
                    style={[
                      styles.chooseMultipleBtnText,
                      multiSelectMode && styles.chooseMultipleBtnTextActive,
                    ]}
                  >
                    {multiSelectMode ? i18n.t('done') : i18n.t('choose_multiple')}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Limited contacts permission banner on iOS */}
              {isLimitedAccess && (
                <View style={styles.limitedBanner}>
                  <View style={styles.limitedBannerTextCol}>
                    <Text style={styles.limitedBannerTitle}>
                      {i18n.t('limited_contacts_title')}
                    </Text>
                    <Text style={styles.limitedBannerText}>
                      {i18n.t('limited_contacts_text')}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.limitedBannerBtn}
                    onPress={() => Linking.openSettings()}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.limitedBannerBtnText}>
                      {i18n.t('limited_contacts_btn')}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {loading ? (
                <ActivityIndicator style={{ marginTop: 30 }} size="large" color="#134e5e" />
              ) : errorMsg ? (
                <Text style={styles.errorText}>{errorMsg}</Text>
              ) : (
                <View style={{ flex: 1 }}>
                  {/* FAVORITER Section (Horizontal Row) */}
                  {!searchQuery.trim() && favoriteContacts.length > 0 && (
                    <View style={styles.favoritesSection}>
                      <Text style={styles.sectionLabel}>{i18n.t('favorites_label')}</Text>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={styles.favoritesScroll}
                      >
                        {favoriteContacts.map(item => {
                          const isChecked = checkedContacts.some(c => c.id === item.id);
                          return (
                            <TouchableOpacity
                              key={`fav-${item.id}`}
                              style={styles.favoriteItem}
                              activeOpacity={0.8}
                              onPress={() => handleContactTap(item)}
                              onLongPress={() => {
                                if (!multiSelectMode) {
                                  setMultiSelectMode(true);
                                  setCheckedContacts([item]);
                                }
                              }}
                            >
                              <View
                                style={[
                                  styles.favoriteAvatar,
                                  isChecked && styles.favoriteAvatarChecked,
                                ]}
                              >
                                <Text style={styles.favoriteAvatarText}>
                                  {item.name.charAt(0).toUpperCase()}
                                </Text>
                                {isChecked && (
                                  <View style={styles.favoriteCheckBadge}>
                                    <Text style={styles.favoriteCheckBadgeText}>✓</Text>
                                  </View>
                                )}
                              </View>
                              <Text style={styles.favoriteName} numberOfLines={1}>
                                {formatShortName(item.name)}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>
                  )}

                  {/* ALLA VÄNNER Section Header */}
                  {filteredContacts.length > 0 && (
                    <Text style={styles.sectionLabel}>
                      {i18n.t('all_friends_caps_label', { count: filteredContacts.length })}
                    </Text>
                  )}

                  {/* Contact List */}
                  <FlatList
                    data={filteredContacts}
                    keyExtractor={item => item.id}
                    keyboardShouldPersistTaps="handled"
                    initialNumToRender={20}
                    maxToRenderPerBatch={20}
                    windowSize={10}
                    refreshControl={
                      <RefreshControl
                        refreshing={refreshing}
                        onRefresh={() => loadContacts(true)}
                        tintColor="#134e5e"
                      />
                    }
                    renderItem={({ item }) => {
                      const isFav = favoriteSet.has(item.userId);
                      const isChecked = checkedContacts.some(c => c.id === item.id);
                      return (
                        <TouchableOpacity
                          style={[styles.contactRow, isChecked && styles.contactRowChecked]}
                          activeOpacity={0.7}
                          onPress={() => handleContactTap(item)}
                          onLongPress={() => {
                            if (!multiSelectMode) {
                              setMultiSelectMode(true);
                              setCheckedContacts([item]);
                            }
                          }}
                        >
                          <View style={styles.friendAvatar}>
                            <Text style={styles.friendAvatarText}>
                              {item.name.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                          <Text style={styles.contactName} numberOfLines={1}>
                            {item.name}
                          </Text>
                          {multiSelectMode ? (
                            <View
                              style={[
                                styles.multiCheckCircle,
                                isChecked && styles.multiCheckCircleChecked,
                              ]}
                            >
                              {isChecked && <Text style={styles.multiCheckText}>✓</Text>}
                            </View>
                          ) : (
                            <TouchableOpacity
                              style={styles.starBtn}
                              onPress={() => handleToggleFavorite(item.userId)}
                              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                            >
                              <Text style={[styles.starIcon, isFav && styles.starIconActive]}>
                                {isFav ? '★' : '☆'}
                              </Text>
                            </TouchableOpacity>
                          )}
                        </TouchableOpacity>
                      );
                    }}
                    ListEmptyComponent={
                      <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>{i18n.t('no_friends_found')}</Text>
                        {isLimitedAccess && (
                          <TouchableOpacity
                            style={styles.emptySettingsBtn}
                            onPress={() => Linking.openSettings()}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.emptySettingsBtnText}>
                              {i18n.t('limited_empty_settings_btn')}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    }
                  />
                </View>
              )}

              {/* Multi-select Proceed Button */}
              {multiSelectMode && checkedContacts.length > 0 && (
                <TouchableOpacity
                  style={styles.multiProceedButton}
                  activeOpacity={0.85}
                  onPress={() => {
                    if (mode === 'request' || mode === 'ping' || mode === 'flash') {
                      onSelect(checkedContacts);
                    } else {
                      setChosenContacts(checkedContacts);
                    }
                  }}
                >
                  <Text style={styles.multiProceedButtonText}>
                    {i18n.t('continue_selected', { count: checkedContacts.length })} →
                  </Text>
                </TouchableOpacity>
              )}
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
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    maxHeight: '92%',
  },
  dragHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
    alignSelf: 'center',
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a',
    flex: 1,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 4,
    marginBottom: 18,
    lineHeight: 20,
  },
  closeRoundBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  closeRoundBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  searchInput: {
    flex: 1,
    height: 44,
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#0f172a',
  },
  chooseMultipleBtn: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#134e5e',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  chooseMultipleBtnActive: {
    backgroundColor: '#134e5e',
  },
  chooseMultipleBtnText: {
    color: '#134e5e',
    fontWeight: '600',
    fontSize: 14.5,
  },
  chooseMultipleBtnTextActive: {
    color: '#ffffff',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 0.5,
    marginTop: 10,
    marginBottom: 10,
  },
  favoritesSection: {
    marginBottom: 8,
  },
  favoritesScroll: {
    paddingVertical: 4,
    gap: 16,
  },
  favoriteItem: {
    width: 60,
    alignItems: 'center',
  },
  favoriteAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#134e5e',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  favoriteAvatarChecked: {
    borderWidth: 2.5,
    borderColor: '#34c759',
  },
  favoriteAvatarText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
  },
  favoriteCheckBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    backgroundColor: '#34c759',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  favoriteCheckBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  favoriteName: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '500',
    color: '#0f172a',
    textAlign: 'center',
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  contactRowChecked: {
    backgroundColor: '#f8fafc',
  },
  friendAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  friendAvatarText: {
    color: '#0369a1',
    fontWeight: '700',
    fontSize: 17,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
    flex: 1,
    marginRight: 8,
  },
  starBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  starIcon: {
    fontSize: 22,
    color: '#94a3b8',
  },
  starIconActive: {
    color: '#eab308',
  },
  multiCheckCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  multiCheckCircleChecked: {
    backgroundColor: '#134e5e',
    borderColor: '#134e5e',
  },
  multiCheckText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  multiProceedButton: {
    backgroundColor: '#134e5e',
    borderRadius: 14,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  multiProceedButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  segmentedContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#134e5e',
  },
  segmentBtnActive: {
    backgroundColor: '#134e5e',
    borderColor: '#134e5e',
  },
  segmentText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
  },
  segmentTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  durationRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  durationPill: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#134e5e',
  },
  durationPillActive: {
    backgroundColor: '#134e5e',
    borderColor: '#134e5e',
  },
  durationPillText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
  },
  durationPillTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  primaryActionButton: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#134e5e',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 22,
  },
  primaryActionButtonIcon: {
    fontSize: 18,
  },
  primaryActionButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    borderWidth: 1.5,
    borderColor: '#134e5e',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 9,
    backgroundColor: '#ffffff',
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0f172a',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 14,
    paddingLeft: 14,
    paddingRight: 6,
    height: 50,
    marginBottom: 18,
    borderWidth: 1.5,
    borderColor: '#134e5e',
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: '#0f172a',
  },
  meetingInput: {
    backgroundColor: '#f1f5f9',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 50,
    fontSize: 14,
    color: '#0f172a',
    marginBottom: 18,
    borderWidth: 1.5,
    borderColor: '#134e5e',
  },
  firstStageMeetingContainer: {
    marginTop: 6,
    marginBottom: 12,
  },
  firstStageMeetingCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16,
  },
  firstStageMeetingEmoji: {
    fontSize: 36,
    marginBottom: 8,
  },
  firstStageMeetingTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 6,
  },
  firstStageMeetingSub: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
  },
  sendArrowBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#134e5e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendArrowBtnDisabled: {
    opacity: 0.4,
  },
  sendArrowBtnText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  mapIconRowContainer: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 14,
    marginBottom: 18,
  },
  mapIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mapIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: '#134e5e',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  mapIconEmojiText: {
    fontSize: 18,
  },
  mapIconRowTitle: {
    fontSize: 14.5,
    fontWeight: '500',
    color: '#334155',
    flex: 1,
  },
  mapIconChangeLink: {
    color: '#134e5e',
    fontSize: 14.5,
    fontWeight: '700',
  },
  iconPickerScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 12,
    paddingBottom: 4,
  },
  iconPickerItem: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    minWidth: 54,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
  },
  iconPickerItemActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#134e5e',
  },
  iconPickerEmoji: {
    fontSize: 22,
    marginBottom: 2,
  },
  iconPickerLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    textAlign: 'center',
  },
  iconPickerLabelActive: {
    color: '#134e5e',
    fontWeight: '700',
  },
  cancelTextBtn: {
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  cancelText: {
    color: '#64748b',
    fontSize: 15,
    fontWeight: '600',
  },
  limitedBanner: {
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    padding: 12,
    marginBottom: 12,
  },
  limitedBannerTextCol: {
    marginBottom: 8,
  },
  limitedBannerTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#1e40af',
    marginBottom: 3,
  },
  limitedBannerText: {
    fontSize: 12,
    color: '#2563eb',
    lineHeight: 16,
  },
  limitedBannerBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#134e5e',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  limitedBannerBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 14,
    color: '#64748b',
  },
  emptySettingsBtn: {
    marginTop: 10,
    backgroundColor: '#134e5e',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  emptySettingsBtnText: {
    color: '#ffffff',
    fontSize: 12.5,
    fontWeight: '700',
  },
  errorText: {
    textAlign: 'center',
    marginTop: 20,
    color: '#ef4444',
  },
});

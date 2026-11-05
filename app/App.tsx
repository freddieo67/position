import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, TouchableOpacity, Platform, Alert, AppState, ScrollView, Image, Modal } from 'react-native';
import * as Location from 'expo-location';
import { FontAwesome6 } from '@expo/vector-icons';
import LeafletMap, { MapMarkerData, LeafletMapRef } from './src/components/LeafletMap';

import ContactsModal, { AppContact } from './src/components/ContactsModal';
import RegisterScreen from './src/components/RegisterScreen';
import PingModal from './src/components/PingModal';
import ReceivedPingModal, { ReceivedPingData } from './src/components/ReceivedPingModal';
import IncomingRequestModal from './src/components/IncomingRequestModal';
import { api, Inbox, IncomingPosition, IncomingRequest, User, ActiveShare } from './src/api';
import { ApiError } from './src/config';
import { clearUser, loadUser } from './src/session';
import { getCurrentCoords } from './src/location';
import { syncBackgroundLocation, addActiveShare } from './src/backgroundLocation';
import { SIGNALS } from './src/signals';
import { getSavedMapIcon, saveMapIcon, MapIconEmoji, DEFAULT_MAP_ICON } from './src/mapIcons';
import { registerForPushToken, getNotifications, refreshNotificationTexts } from './src/push';
import type * as NotificationsType from 'expo-notifications';
import i18n, { syncSystemLocale } from './src/i18n';
import mobileAds, { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
const POLL_INTERVAL_MS = 30_000;
const EMPTY_INBOX: Inbox = { positions: [], requests: [], outgoing: [], sharing: [], active_shares: [] };

function minutesLeft(expiresAt: string): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 60_000));
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function App() {
  // undefined = laddar sparad användare, null = inte registrerad än
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState<'send' | 'request' | 'signal' | 'ping' | null>(null);
  const [pingModalVisible, setPingModalVisible] = useState(false);
  const [pingTarget, setPingTarget] = useState<AppContact[] | null>(null);
  const [receivedPing, setReceivedPing] = useState<ReceivedPingData | null>(null);
  const [inbox, setInbox] = useState<Inbox>(EMPTY_INBOX);
  const [pendingRequest, setPendingRequest] = useState<IncomingRequest | null>(null);
  const [sendingBackIds, setSendingBackIds] = useState<Set<number>>(new Set());
  const [myMapIcon, setMyMapIcon] = useState<MapIconEmoji>(DEFAULT_MAP_ICON);
  const [photoViewer, setPhotoViewer] = useState<{
    shareId: number;
    senderName: string;
    message?: string | null;
    expiresAt?: string;
    imageUri: string;
    loadingFull: boolean;
  } | null>(null);

  const [locale, setLocale] = useState(() => i18n.locale);

  // Synka språket direkt om telefonens systemspråk ändras när appen återupptas
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        const next = syncSystemLocale();
        setLocale(prev => (prev !== next ? next : prev));
        refreshNotificationTexts();
      }
    });
    return () => sub.remove();
  }, []);

  const openPhotoViewer = useCallback(async (
    shareId: number,
    senderName: string,
    thumbUri?: string | null,
    message?: string | null,
    expiresAt?: string
  ) => {
    setPhotoViewer({
      shareId,
      senderName,
      message,
      expiresAt,
      imageUri: thumbUri || '',
      loadingFull: true,
    });
    try {
      const full = await api.getSharePhoto(shareId);
      setPhotoViewer(prev =>
        prev && prev.shareId === shareId
          ? { ...prev, imageUri: full.photo_data || prev.imageUri, loadingFull: false }
          : prev
      );
    } catch (e) {
      console.warn('Kunde inte hämta fullstor bild:', e);
      setPhotoViewer(prev => (prev && prev.shareId === shareId ? { ...prev, loadingFull: false } : prev));
    }
  }, []);

  useEffect(() => {
    getSavedMapIcon().then(setMyMapIcon);
  }, []);
  const [isRespondingRequest, setIsRespondingRequest] = useState(false);

  const mapRef = useRef<LeafletMapRef>(null);
  const locationRef = useRef<Location.LocationObject | null>(null);
  const refreshRef = useRef<() => void>(() => {});
  const pendingRequestRef = useRef<IncomingRequest | null>(null);
  // Håller koll på vad vi redan hanterat så att inget visas eller skickas dubbelt
  const promptedRequests = useRef(new Set<number>());
  const reciprocatedRequests = useRef(new Set<number>());
  const notifiedDeclines = useRef(new Set<number>());

  const [adsInitialized, setAdsInitialized] = useState(false);

  // Initiera Google Mobile Ads och ladda sparad användare
  useEffect(() => {
    mobileAds()
      .initialize()
      .then(() => setAdsInitialized(true))
      .catch(err => console.warn('MobileAds init error:', err));

    (async () => {
      const saved = await loadUser();
      // Sätt sparad användare direkt så att appen aldrig fastnar på laddningsskärmen om servern är seg
      setUser(saved);
      if (saved) {
        try {
          await api.getUser(saved.id);
        } catch (error) {
          if (error instanceof ApiError && error.status === 404) {
            await clearUser();
            setUser(null);
          }
          // Nätverksfel/timeout: behåll användaren inloggad
        }
      }
    })();
  }, []);

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    let active = true;

    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg(i18n.t('location_permission_denied'));
        return;
      }

      // 1. Visa senast kända position omedelbart om den finns så kartan dyker upp direkt
      try {
        const lastKnown = await Location.getLastKnownPositionAsync();
        if (active && lastKnown) {
          locationRef.current = lastKnown;
          setLocation(lastKnown);
        }
      } catch (_) {}

      // 2. Hämta färsk position med timeout så att appen inte står och snurrar inomhus
      try {
        const posPromise = Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Initial location timeout')), 5000)
        );
        const currentLocation = await Promise.race([posPromise, timeoutPromise]);
        if (active) {
          locationRef.current = currentLocation;
          setLocation(currentLocation);
        }
      } catch (e) {
        console.warn('Kunde inte hämta initial position (Balanced), provar lägre noggrannhet:', e);
        try {
          const lowLocation = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Low,
          });
          if (active) {
            locationRef.current = lowLocation;
            setLocation(lowLocation);
          }
        } catch (err) {
          console.warn('Kunde inte hämta initial position:', err);
        }
      }

      try {
        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 180000, // Var 3:e minut
            distanceInterval: 50, // Minst 50 meter förflyttning
          },
          (newLocation) => {
            if (active) {
              locationRef.current = newLocation;
              setLocation(newLocation);
            }
          }
        );
      } catch (e) {
        console.warn('Kunde inte starta watchPositionAsync:', e);
      }
    })();

    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);

  // Registrera enhetens push-token hos backend när användaren är inloggad
  useEffect(() => {
    if (!user) return;
    (async () => {
      const token = await registerForPushToken();
      if (token) {
        await api.savePushToken(user.id, token).catch(error => console.warn('Kunde inte spara push-token:', error));
      }
    })();
  }, [user]);

  // Dela min (färska) position med en annan användare
  const shareTo = useCallback(async (
    receiverId: number,
    requestId: number | null = null,
    message?: string,
    durationMinutes: number = 15,
    icon?: string,
    photoThumb?: string | null,
    photoData?: string | null
  ) => {
    if (!user) return;
    const coords = await getCurrentCoords(locationRef.current);
    const activeIcon = photoThumb ? '📷' : (icon || myMapIcon || DEFAULT_MAP_ICON);
    await api.sharePosition({
      sender_id: user.id,
      receiver_id: receiverId,
      request_id: requestId,
      message,
      duration_minutes: durationMinutes,
      icon: activeIcon,
      photo_thumb: photoThumb ?? null,
      photo_data: photoData ?? null,
      ...coords,
    });
    await addActiveShare(receiverId, durationMinutes);
  }, [user, myMapIcon]);

  const respondToRequest = useCallback(async (req: IncomingRequest, accept: boolean, message?: string, durationMinutes: number = 15) => {
    if (!user) return;
    setIsRespondingRequest(true);
    try {
      if (accept) {
        const coords = await getCurrentCoords(locationRef.current);
        await api.respondToRequest(req.id, { user_id: user.id, accept: true, message, duration_minutes: durationMinutes, icon: myMapIcon, ...coords });
        await addActiveShare(req.requester_id, durationMinutes);
        Alert.alert(i18n.t('shared'), i18n.t('you_and_name_see_each_other', { name: req.requester_name, mins: durationMinutes }));
      } else {
        await api.respondToRequest(req.id, { user_id: user.id, accept: false });
      }
      pendingRequestRef.current = null;
      setPendingRequest(null);
      refreshRef.current();
    } catch (error) {
      Alert.alert(i18n.t('could_not_respond'), errorText(error));
    } finally {
      setIsRespondingRequest(false);
    }
  }, [user]);

  const handleInbox = useCallback((data: Inbox) => {
    // Inkommande förfrågningar: visa dialog en i taget
    if (!pendingRequestRef.current) {
      for (const req of data.requests) {
        if (promptedRequests.current.has(req.id)) continue;
        promptedRequests.current.add(req.id);
        pendingRequestRef.current = req;
        setPendingRequest(req);
        break;
      }
    }

    // Mina förfrågningar
    for (const out of data.outgoing) {
      if (out.status === 'accepted' && !out.reciprocated_at && !reciprocatedRequests.current.has(out.id)) {
        // Mottagaren tackade ja: dela automatiskt min position tillbaka
        reciprocatedRequests.current.add(out.id);
        shareTo(out.target_id, out.id).catch(error => {
          reciprocatedRequests.current.delete(out.id);
          console.warn('Kunde inte dela tillbaka:', error);
        });
      } else if (out.status === 'declined' && !notifiedDeclines.current.has(out.id)) {
        notifiedDeclines.current.add(out.id);
        Alert.alert(i18n.t('declined_title'), i18n.t('declined_body', { name: out.target_name }));
      }
    }
  }, [respondToRequest, shareTo]);

  // Hämta inkorgen regelbundet
  useEffect(() => {
    if (!user) return;
    let active = true;

    const poll = async () => {
      try {
        const data = await api.inbox(user.id);
        if (!active) return;
        setInbox(data);
        handleInbox(data);
      } catch (error) {
        console.warn('Kunde inte hämta inkorg:', error);
      }
    };

    refreshRef.current = poll;
    poll();
    let timer: ReturnType<typeof setInterval> | null = setInterval(poll, POLL_INTERVAL_MS);

    // Pausa pollningen när appen är i bakgrunden, hämta direkt när den kommer tillbaka
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        if (!timer) {
          poll();
          timer = setInterval(poll, POLL_INTERVAL_MS);
        }
      } else if (timer) {
        clearInterval(timer);
        timer = null;
      }
    });

    return () => {
      active = false;
      sub.remove();
      if (timer) clearInterval(timer);
    };
  }, [user, handleInbox]);

  // Live-uppdatering av position var 60:e sekund för aktiva delningar (när appen är öppen)
  // Samt synkronisering till bakgrundstjänsten
  const sharingRef = useRef<number[]>([]);
  useEffect(() => {
    const sharing = inbox.sharing || [];
    sharingRef.current = sharing;
    if (user) {
      syncBackgroundLocation(inbox.active_shares && inbox.active_shares.length > 0 ? inbox.active_shares : sharing);
    }
  }, [inbox.sharing, inbox.active_shares, user]);

  useEffect(() => {
    if (!user) {
      syncBackgroundLocation([]);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    let active = true;

    const updateLocation = async () => {
      const sharing = sharingRef.current;
      if (!sharing || sharing.length === 0) return;
      try {
        const coords = await getCurrentCoords(locationRef.current);
        if (!active) return;
        
        // Uppdatera backend för alla vi delar med tyst i bakgrunden
        await Promise.all(
          sharing.map(receiverId => 
            api.sharePosition({ sender_id: user.id, receiver_id: receiverId, is_background: true, ...coords })
          )
        );
        console.log(`Live-uppdaterade positionen till ${sharing.length} användare`);
      } catch (e) {
        console.warn('Kunde inte live-uppdatera positionen:', e);
      }
    };

    timer = setInterval(updateLocation, 60000); // 60 sekunder

    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [user]);


  // Tryck på en avisering: hämta inkorgen direkt och hoppa till den som delade sin position
  const pendingFocusSender = useRef<number | null>(null);
  const handledColdStart = useRef(false);

  useEffect(() => {
    const Notifications = getNotifications();
    if (!user || !Notifications) return;

    const handleResponse = async (response: NotificationsType.NotificationResponse) => {
      try {
        const payload = response.notification.request.content.data as {
          type?: string;
          sender_id?: number;
          sender_name?: string;
          title?: string;
          message?: string;
        };

        if (payload?.type === 'share' && payload.sender_id) {
          pendingFocusSender.current = payload.sender_id;
        } else if (payload?.type === 'signal' && payload.sender_id) {
          const senderContact: AppContact = {
            id: String(payload.sender_id),
            userId: payload.sender_id,
            name: payload.sender_name || i18n.t('a_friend'),
            phoneNumber: '',
          };

          if (response.actionIdentifier === 'reply_ping') {
            // Användaren tryckte på "Pinga tillbaka" direkt i notisen
            setPingTarget([senderContact]);
            setPingModalVisible(true);
          } else {
            // Användaren tryckte på själva notisen: visa vad personen skickade så det inte missas
            const title: string = payload.title || (response.notification.request.content.title ?? undefined) || i18n.t('pinged_you', { name: senderContact.name });
            const message: string = payload.message || (response.notification.request.content.body ?? '') || '';
            setReceivedPing({
              title,
              message,
              sender: senderContact,
            });
          }
        }
        const data = await api.inbox(user.id);
        setInbox(data);
        handleInbox(data);
      } catch (error) {
        console.warn('Kunde inte hantera avisering:', error);
      }
    };

    // Kallstart: appen öppnades genom att trycka på en avisering innan lyssnaren fanns
    if (!handledColdStart.current) {
      handledColdStart.current = true;
      Notifications.getLastNotificationResponseAsync().then(last => {
        if (last) handleResponse(last);
      });
    }

    const sub = Notifications.addNotificationResponseReceivedListener(handleResponse);
    return () => sub.remove();
  }, [user, handleInbox]);

  // Fokusera på den som delade så fort både kartan (position) och inkorgen finns
  useEffect(() => {
    const sender = pendingFocusSender.current;
    if (sender === null || !location) return;
    const pos = inbox.positions.find(p => p.sender_id === sender);
    if (!pos) return;
    pendingFocusSender.current = null;
    // Vänta en tick så att kartan hunnit monteras
    setTimeout(() => mapRef.current?.focusOn(pos.latitude, pos.longitude), 0);
  }, [inbox, location]);

  const openModal = (mode: 'send' | 'request' | 'signal' | 'ping') => {
    setModalMode(mode);
    setModalVisible(true);
  };

  const handleContactSelected = async (
    contactOrContacts: AppContact | AppContact[],
    signalType?: string,
    message?: string,
    durationMinutes: number = 15,
    icon?: string,
    photoThumb?: string | null,
    photoData?: string | null
  ) => {
    setModalVisible(false);
    if (!user) return;

    if (icon && icon !== '📷') {
      setMyMapIcon(icon as MapIconEmoji);
      saveMapIcon(icon as MapIconEmoji);
    }

    const contacts = Array.isArray(contactOrContacts) ? contactOrContacts : [contactOrContacts];
    const names = contacts.map(c => c.name).join(', ');

    if (modalMode === 'ping') {
      setPingTarget(contacts);
      setPingModalVisible(true);
      return;
    }

    try {
      if (modalMode === 'signal' && signalType) {
        for (const contact of contacts) await api.sendSignal(user.id, contact.userId, signalType);
        const sent = SIGNALS.find(s => s.type === signalType);
        Alert.alert(i18n.t('sent'), i18n.t('signal_received', { emoji: sent?.emoji ?? '', names }).trim());
        return;
      }
      if (modalMode === 'send') {
        // Kontrollera om vi redan delar med någon av kontakterna
        const activeSharesList = inbox.active_shares || [];
        const alreadySharingContacts = contacts.filter(c =>
          activeSharesList.some(s => s.receiver_id === c.userId && new Date(s.expires_at).getTime() > Date.now()) ||
          inbox.sharing?.includes(c.userId)
        );

        if (alreadySharingContacts.length > 0) {
          const contact = alreadySharingContacts[0];
          const share = activeSharesList.find(s => s.receiver_id === contact.userId);
          const mins = share ? minutesLeft(share.expires_at) : 15;
          const msg = alreadySharingContacts.length === 1
            ? i18n.t('already_sharing_one', { name: contact.name, mins })
            : i18n.t('already_sharing_multi', { names: alreadySharingContacts.map(c => c.name).join(', ') });
          Alert.alert(i18n.t('already_sharing_title'), msg);
          return;
        }

        if (signalType === 'custom' && message) {
          for (const contact of contacts) await shareTo(contact.userId, null, message, durationMinutes, icon, photoThumb, photoData);
          Alert.alert(i18n.t('shared'), `${i18n.t('position_shared_with_message')} "${message}" (${durationMinutes} ${i18n.t('min_short')})`);
        } else {
          for (const contact of contacts) await shareTo(contact.userId, null, undefined, durationMinutes, icon, photoThumb, photoData);
          const sent = signalType && signalType !== 'none' ? SIGNALS.find(s => s.type === signalType) : undefined;
          if (signalType && signalType !== 'none') {
            for (const contact of contacts) await api.sendSignal(user.id, contact.userId, signalType);
          }
          Alert.alert(
            i18n.t('shared'),
            i18n.t(photoThumb ? 'shared_photo_for_mins' : 'shared_for_mins', { names, mins: durationMinutes, emoji: sent?.emoji ?? '' }).trim()
          );
        }
      } else {
        for (const contact of contacts) await api.requestPosition(user.id, contact.userId);
        Alert.alert(
          i18n.t('request_sent'),
          i18n.t('when_accept_see_each_other_10m', { name: names })
        );
      }
      refreshRef.current();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && error.serverMessage) {
        Alert.alert(i18n.t('already_sharing_title'), error.serverMessage);
        return;
      }
      Alert.alert(i18n.t('error'), errorText(error));
    }
  };

  const sendBack = async (pos: IncomingPosition) => {
    if (sendingBackIds.has(pos.sender_id)) return;
    setSendingBackIds(prev => new Set(prev).add(pos.sender_id));
    try {
      await shareTo(pos.sender_id);
      Alert.alert(i18n.t('sent'), i18n.t('sees_your_position_10m', { name: pos.sender_name }));
      refreshRef.current();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && error.serverMessage) {
        Alert.alert(i18n.t('already_sharing_title'), error.serverMessage);
      } else {
        Alert.alert(i18n.t('error'), errorText(error));
      }
    } finally {
      setSendingBackIds(prev => {
        const next = new Set(prev);
        next.delete(pos.sender_id);
        return next;
      });
    }
  };

  const focusOn = (pos: IncomingPosition) => {
    mapRef.current?.focusOn(pos.latitude, pos.longitude);
  };

  const handleStopSharePress = (clickedShare: ActiveShare) => {
    if (!user) return;
    const allShares = inbox.active_shares ?? [];
    const isMultiple = allShares.length > 1;

    const stopAll = async () => {
      try {
        const ids = Array.from(
          new Set([
            ...(inbox.sharing ?? []),
            ...allShares.map(s => s.receiver_id),
          ])
        );
        await syncBackgroundLocation([]);
        if (ids.length > 0) {
          await Promise.all(ids.map(rid => api.stopSharing(user.id, rid)));
        } else {
          await api.stopSharing(user.id);
        }
        setInbox(prev => ({ ...prev, sharing: [], active_shares: [] }));
        refreshRef.current();
      } catch (error) {
        Alert.alert(i18n.t('error'), errorText(error));
      }
    };

    const stopSingle = async (receiverId: number) => {
      try {
        await api.stopSharing(user.id, receiverId);
        const remaining = allShares.filter(s => s.receiver_id !== receiverId);
        await syncBackgroundLocation(remaining);
        setInbox(prev => ({
          ...prev,
          sharing: (prev.sharing ?? []).filter(id => id !== receiverId),
          active_shares: (prev.active_shares ?? []).filter(s => s.receiver_id !== receiverId),
        }));
        refreshRef.current();
      } catch (error) {
        Alert.alert(i18n.t('error'), errorText(error));
      }
    };

    if (!isMultiple) {
      Alert.alert(
        i18n.t('stop_sharing_title'),
        i18n.t('stop_sharing_one', { name: clickedShare.receiver_name }),
        [
          { text: i18n.t('cancel'), style: 'cancel' },
          { text: i18n.t('stop_sharing_btn'), style: 'destructive', onPress: stopAll },
        ]
      );
    } else {
      Alert.alert(
        i18n.t('stop_sharing_title'),
        i18n.t('stop_sharing_count', { count: allShares.length }),
        [
          { text: i18n.t('stop_only_name', { name: clickedShare.receiver_name }), onPress: () => stopSingle(clickedShare.receiver_id) },
          { text: i18n.t('stop_with_all'), style: 'destructive', onPress: stopAll },
          { text: i18n.t('cancel'), style: 'cancel' },
        ]
      );
    }
  };

  const logout = () => {
    Alert.alert(i18n.t('switch_user'), i18n.t('logout_confirm'), [
      { text: i18n.t('cancel'), style: 'cancel' },
      {
        text: i18n.t('logout'),
        style: 'destructive',
        onPress: async () => {
          await clearUser();
          promptedRequests.current.clear();
          reciprocatedRequests.current.clear();
          notifiedDeclines.current.clear();
          setInbox(EMPTY_INBOX);
          setUser(null);
        },
      },
    ]);
  };

  if (user === undefined) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (user === null) {
    return (
      <>
        <RegisterScreen onRegistered={setUser} />
        <StatusBar style="auto" />
      </>
    );
  }

  const pendingOutgoing = inbox.outgoing.filter(o => o.status === 'pending' && minutesLeft(o.expires_at) > 0);
  const activeShares = inbox.active_shares ?? [];
  const myActivePhotoShare = activeShares.find(s => Boolean(s.photo_thumb));
  const hasTopItems = activeShares.length > 0 || inbox.positions.length > 0 || pendingOutgoing.length > 0;

  return (
    <View style={styles.container}>
      <View style={styles.mapContainer}>
        {location ? (
          Platform.OS === 'web' ? (
            <View style={{ flex: 1, backgroundColor: '#e1e1e1', justifyContent: 'center', alignItems: 'center', width: '100%', height: '100%' }}>
              <Text>{i18n.t('map_disabled_web')}</Text>
            </View>
          ) : (
            <LeafletMap 
              ref={mapRef}
              centerLat={location.coords.latitude}
              centerLng={location.coords.longitude}
              markers={[
                {
                  id: 'me',
                  lat: location.coords.latitude,
                  lng: location.coords.longitude,
                  title: i18n.t('my_position'),
                  color: '#007AFF',
                  emoji: myActivePhotoShare ? '📷' : myMapIcon,
                  photoThumb: myActivePhotoShare?.photo_thumb ?? null,
                  shareId: myActivePhotoShare?.id,
                },
                ...inbox.positions.map(pos => ({
                  id: String(pos.sender_id),
                  lat: pos.latitude,
                  lng: pos.longitude,
                  title: pos.message ? `${pos.sender_name}: "${pos.message}"` : pos.sender_name,
                  color: '#FF3B30',
                  emoji: pos.icon || '🐷',
                  photoThumb: pos.photo_thumb ?? null,
                  shareId: pos.id,
                }))
              ]}
              onMarkerPress={(marker) => {
                if (!marker.shareId) return;
                if (marker.id === 'me' && myActivePhotoShare) {
                  openPhotoViewer(
                    myActivePhotoShare.id,
                    user.display_name,
                    myActivePhotoShare.photo_thumb,
                    myActivePhotoShare.message,
                    myActivePhotoShare.expires_at
                  );
                  return;
                }
                const pos = inbox.positions.find(p => String(p.sender_id) === marker.id);
                if (pos && (pos.photo_thumb || pos.has_photo || pos.icon === '📷')) {
                  openPhotoViewer(pos.id, pos.sender_name, pos.photo_thumb, pos.message, pos.expires_at);
                }
              }}
            />
          )
        ) : (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0000ff" />
            <Text style={styles.loadingText}>{errorMsg || i18n.t('fetching_position')}</Text>
          </View>
        )}

        {/* Logotyp högst upp på kartan (döljs när första kortet i karusellen dyker upp) */}
        {!hasTopItems && (
          <View style={styles.logoHeader} pointerEvents="none">
            <Image
              source={require('./assets/logo-header.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
        )}

        {/* Överst: vilka som delar med mig, vad jag delar och väntande förfrågningar */}
        {hasTopItems && (
          <View style={styles.topOverlay} pointerEvents="box-none">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.topScrollContent}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              directionalLockEnabled
            >
              {/* Mina aktiva utgående delningar */}
              {activeShares.map(share => (
                <TouchableOpacity
                  key={`my-share-${share.receiver_id}`}
                  style={styles.shareCard}
                  activeOpacity={0.8}
                  onPress={() => handleStopSharePress(share)}
                >
                  <View style={styles.shareHeader}>
                    {share.photo_thumb ? (
                      <Image source={{ uri: share.photo_thumb }} style={styles.cardThumb} />
                    ) : null}
                    <Text style={styles.shareTitle} numberOfLines={1}>
                      {!share.photo_thumb && (
                        <Text style={{ fontSize: 16 }}>{share.icon || myMapIcon || '🐷'} </Text>
                      )}
                      <Text style={styles.shareMeta}>{i18n.t('you_share_with')} </Text>
                      <Text style={styles.shareName}>{share.receiver_name}</Text>
                    </Text>
                    <Text style={styles.shareBadge}>{minutesLeft(share.expires_at)}{i18n.t('min_short')} ✕</Text>
                  </View>
                </TouchableOpacity>
              ))}

            {inbox.positions.map(pos => (
              <View key={`card-${pos.sender_id}`} style={styles.shareCard}>
                <TouchableOpacity
                  style={{ flex: 1 }}
                  onPress={() => {
                    focusOn(pos);
                    if (pos.photo_thumb || pos.has_photo) {
                      openPhotoViewer(pos.id, pos.sender_name, pos.photo_thumb, pos.message, pos.expires_at);
                    }
                  }}
                >
                  <View style={styles.shareHeader}>
                    {pos.photo_thumb ? (
                      <Image source={{ uri: pos.photo_thumb }} style={styles.cardThumb} />
                    ) : null}
                    <Text style={styles.shareTitle} numberOfLines={1}>
                      {!pos.photo_thumb && (
                        <Text style={{ fontSize: 16 }}>{pos.icon || '🐷'} </Text>
                      )}
                      <Text style={styles.shareName}>{pos.sender_name}</Text>
                      <Text style={styles.shareMeta}>
                        {pos.photo_thumb || pos.has_photo ? ` ${i18n.t('shared_photo')}` : ` ${i18n.t('shares_position')}`}
                      </Text>
                    </Text>
                    <Text style={styles.shareBadge}>{minutesLeft(pos.expires_at)}{i18n.t('min_short')}</Text>
                  </View>
                  {Boolean(pos.message) && (
                    <Text style={styles.shareMessage} numberOfLines={1}>
                      💬 "{pos.message}"
                    </Text>
                  )}
                </TouchableOpacity>
                {!inbox.sharing?.includes(pos.sender_id) && (
                  <TouchableOpacity
                    style={[styles.smallButton, sendingBackIds.has(pos.sender_id) && { opacity: 0.7 }]}
                    onPress={() => sendBack(pos)}
                    disabled={sendingBackIds.has(pos.sender_id)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    {sendingBackIds.has(pos.sender_id) ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.smallButtonText}>{i18n.t('share_back')}</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            ))}

            {pendingOutgoing.map(out => (
              <View key={`out-${out.id}`} style={styles.pendingChip}>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.pendingText}>{i18n.t('waiting_for', { name: out.target_name })}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

        {/* Centrera på min position (GPS-knapp) */}
        {location && (
          <TouchableOpacity
            style={styles.myLocationButton}
            onPress={async () => {
              mapRef.current?.focusOn(location.coords.latitude, location.coords.longitude);
              try {
                const fresh = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                locationRef.current = fresh;
                setLocation(fresh);
                mapRef.current?.focusOn(fresh.coords.latitude, fresh.coords.longitude);
              } catch (_) {}
            }}
            activeOpacity={0.8}
          >
            <FontAwesome6 name="location-crosshairs" size={20} color="#007AFF" />
          </TouchableOpacity>
        )}

        {/* Knappar som ligger ovanpå kartan i botten */}
        <View style={styles.buttonRow}>
          <TouchableOpacity 
            style={[styles.actionButton, styles.requestButton]} 
            onPress={() => openModal('request')}
          >
            <Text style={[styles.buttonText, styles.requestButtonText]}>{i18n.t('request')}</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.actionButton, styles.pingButton]} 
            onPress={() => openModal('ping')}
          >
            <Text style={[styles.buttonText, styles.pingButtonText]}>Phing</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.actionButton, styles.sendButton]} 
            onPress={() => openModal('send')}
          >
            <Text style={[styles.buttonText, styles.sendButtonText]}>{i18n.t('share')}</Text>
          </TouchableOpacity>
        </View>
      </View>
      
      {/* Reklamyta: Visas först när annonsmotorn är helt initierad */}
      {adsInitialized && (
        <View style={styles.adContainer}>
          <BannerAd
            unitId={TestIds.BANNER}
            size={BannerAdSize.MEDIUM_RECTANGLE}
            requestOptions={{
              requestNonPersonalizedAdsOnly: true,
            }}
            onAdFailedToLoad={(error) => {
              console.warn('Ad failed to load:', error);
            }}
          />
        </View>
      )}

      <ContactsModal 
        visible={modalVisible} 
        mode={modalMode} 
        currentUserId={user.id}
        onClose={() => setModalVisible(false)} 
        onSelect={handleContactSelected}
      />

      <PingModal
        visible={pingModalVisible}
        currentUserId={user.id}
        targets={pingTarget}
        onClose={() => setPingModalVisible(false)}
        onSuccess={() => {
          setPingModalVisible(false);
          const names = pingTarget?.map(t => t.name).join(', ') ?? '';
          Alert.alert(i18n.t('sent'), i18n.t('ping_sent_to', { names }));
        }}
        onSendPhotoPing={async (targets, photoThumb, photoData, message, durationMinutes) => {
          for (const target of targets) {
            await shareTo(target.userId, null, message, durationMinutes, '📷', photoThumb, photoData);
          }
          setPingModalVisible(false);
          const names = targets.map(t => t.name).join(', ');
          Alert.alert(i18n.t('sent'), i18n.t('shared_photo_for_mins', { names, mins: durationMinutes, emoji: '📷' }));
          refreshRef.current();
        }}
      />

      <ReceivedPingModal
        visible={receivedPing !== null}
        data={receivedPing}
        onClose={() => setReceivedPing(null)}
        onReply={(sender) => {
          setReceivedPing(null);
          setPingTarget([sender]);
          setPingModalVisible(true);
        }}
      />

      <IncomingRequestModal
        request={pendingRequest}
        loading={isRespondingRequest}
        onAccept={(req, msg, dur) => respondToRequest(req, true, msg, dur)}
        onDecline={(req) => respondToRequest(req, false)}
      />

      <Modal
        visible={photoViewer !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoViewer(null)}
      >
        <TouchableOpacity
          style={styles.photoModalOverlay}
          activeOpacity={1}
          onPress={() => setPhotoViewer(null)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={styles.photoModalCard}
            onPress={() => {}}
          >
            <View style={styles.photoModalHeader}>
              <Text style={styles.photoModalTitle}>{photoViewer?.senderName}</Text>
              {photoViewer?.expiresAt && (
                <Text style={styles.photoModalBadge}>{i18n.t('min_left', { mins: minutesLeft(photoViewer.expiresAt) })}</Text>
              )}
            </View>

            <View style={styles.photoImageContainer}>
              {photoViewer?.imageUri ? (
                <Image
                  source={{ uri: photoViewer.imageUri }}
                  style={styles.photoModalImage}
                  resizeMode="cover"
                />
              ) : null}
              {photoViewer?.loadingFull && (
                <View style={styles.photoLoadingBadge}>
                  <ActivityIndicator size="small" color="#fff" />
                </View>
              )}
            </View>

            {Boolean(photoViewer?.message) && (
              <Text style={styles.photoModalMessage}>💬 "{photoViewer?.message}"</Text>
            )}

            <TouchableOpacity
              style={styles.photoModalCloseBtn}
              onPress={() => setPhotoViewer(null)}
            >
              <Text style={styles.photoModalCloseText}>{i18n.t('close')}</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  mapContainer: {
    flex: 1, 
    position: 'relative', // För att vi ska kunna lägga knapparna ovanpå
  },
  map: {
    width: '100%',
    height: '100%',
  },
  logoHeader: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 38,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 90,
  },
  logoImage: {
    width: 260,
    height: 72,
    opacity: 0.7,
  },
  topOverlay: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 52 : 40,
    left: 0,
    right: 0,
    zIndex: 100,
    elevation: 10,
  },
  topScrollContent: {
    paddingHorizontal: 12,
    gap: 10,
    alignItems: 'center',
  },
  userBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  userBadgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  shareCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 4,
    minWidth: 240,
    maxWidth: 320,
    borderWidth: 1,
    borderColor: '#e8ecef',
  },
  shareHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  shareTitle: {
    flex: 1,
  },
  shareName: {
    fontSize: 14.5,
    fontWeight: 'bold',
    color: '#222',
  },
  shareMeta: {
    fontSize: 13,
    color: '#666',
    fontWeight: 'normal',
  },
  shareBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2a8a41',
    backgroundColor: '#eaf5eb',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  shareMessage: {
    fontSize: 12,
    color: '#555',
    fontStyle: 'italic',
    marginTop: 2,
  },
  smallButton: {
    backgroundColor: '#805d73', // Din snygga lila färg
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginLeft: 8,
  },
  smallButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  pendingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#805d73',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 4,
  },
  pendingText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  myLocationButton: {
    position: 'absolute',
    bottom: 105,
    right: 18,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 8,
    zIndex: 10,
  },
  buttonRow: {
    position: 'absolute',
    bottom: 10, 
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    paddingHorizontal: 10,
    zIndex: 10, // Viktigt för att synas över kartan
    elevation: 10, // Extra viktigt för Android
  },
  actionButton: {
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
  },
  requestButton: {
    borderColor: 'rgba(126, 137, 93, 0.35)',
  },
  pingButton: {
    borderColor: 'rgba(128, 80, 114, 0.35)',
  },
  sendButton: {
    borderColor: 'rgba(93, 126, 128, 0.35)',
  },
  buttonText: {
    fontSize: 14.5,
    fontWeight: 'bold',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#ff3131',
  },
  requestButtonText: {
    color: '#ff3131',
  },
  pingButtonText: {
    color: '#ff3131',
  },
  sendButtonText: {
    color: '#ff3131',
  },
  adContainer: {
    minHeight: 60,
    maxHeight: 250,
    width: '100%',
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: '#ccc',
  },
  adText: {
    fontSize: 16,
    color: '#666',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
  },
  cardThumb: {
    width: 24,
    height: 24,
    borderRadius: 6,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  cardPinThumb: {
    width: 18,
    height: 18,
    resizeMode: 'contain',
    marginRight: 4,
  },
  photoModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  photoModalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#1c1c1e',
    borderRadius: 18,
    padding: 14,
    alignItems: 'center',
  },
  photoModalHeader: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  photoModalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  photoModalBadge: {
    color: '#ccc',
    fontSize: 13,
    fontWeight: '600',
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  photoImageContainer: {
    width: '100%',
    aspectRatio: 4 / 5,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#111',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoModalImage: {
    width: '100%',
    height: '100%',
  },
  photoLoadingBadge: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 14,
    padding: 6,
  },
  photoModalMessage: {
    color: '#f2f2f7',
    fontSize: 15,
    fontStyle: 'italic',
    marginTop: 10,
    textAlign: 'center',
  },
  photoModalCloseBtn: {
    marginTop: 14,
    width: '100%',
    height: 46,
    backgroundColor: '#f4f5f7',
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#e1e4e8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoModalCloseText: {
    color: '#333',
    fontSize: 15,
    fontWeight: '700',
  },
});

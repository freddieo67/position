import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, TouchableOpacity, Platform, Alert, AppState } from 'react-native';
import * as Location from 'expo-location';
import { FontAwesome6 } from '@expo/vector-icons';
import LeafletMap, { MapMarkerData, LeafletMapRef } from './src/components/LeafletMap';

import ContactsModal, { AppContact } from './src/components/ContactsModal';
import RegisterScreen from './src/components/RegisterScreen';
import PingModal from './src/components/PingModal';
import { api, Inbox, IncomingPosition, IncomingRequest, User } from './src/api';
import { ApiError } from './src/config';
import { clearUser, loadUser } from './src/session';
import { getCurrentCoords } from './src/location';
import { SIGNALS } from './src/signals';
import { registerForPushToken, getNotifications } from './src/push';
import type * as NotificationsType from 'expo-notifications';
import i18n from './src/i18n';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
const POLL_INTERVAL_MS = 30_000;
const EMPTY_INBOX: Inbox = { positions: [], requests: [], outgoing: [], sharing: [] };

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
  const [inbox, setInbox] = useState<Inbox>(EMPTY_INBOX);

  const mapRef = useRef<LeafletMapRef>(null);
  const locationRef = useRef<Location.LocationObject | null>(null);
  const refreshRef = useRef<() => void>(() => {});
  // Håller koll på vad vi redan hanterat så att inget visas eller skickas dubbelt
  const promptedRequests = useRef(new Set<number>());
  const reciprocatedRequests = useRef(new Set<number>());
  const notifiedDeclines = useRef(new Set<number>());

  // Ladda sparad användare och kontrollera att den fortfarande finns i databasen
  useEffect(() => {
    (async () => {
      const saved = await loadUser();
      if (saved) {
        try {
          await api.getUser(saved.id);
        } catch (error) {
          if (error instanceof ApiError && error.status === 404) {
            await clearUser();
            setUser(null);
            return;
          }
          // Nätverksfel: behåll användaren, pollningen visar felet senare
        }
      }
      setUser(saved);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permission to access location was denied');
        return;
      }

      let currentLocation = await Location.getCurrentPositionAsync({});
      locationRef.current = currentLocation;
      setLocation(currentLocation);
    })();
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
  const shareTo = useCallback(async (receiverId: number, requestId: number | null = null, message?: string) => {
    if (!user) return;
    const coords = await getCurrentCoords(locationRef.current);
    await api.sharePosition({ sender_id: user.id, receiver_id: receiverId, request_id: requestId, message, ...coords });
  }, [user]);

  const respondToRequest = useCallback(async (req: IncomingRequest, accept: boolean) => {
    if (!user) return;
    try {
      if (accept) {
        const coords = await getCurrentCoords(locationRef.current);
        await api.respondToRequest(req.id, { user_id: user.id, accept: true, ...coords });
        Alert.alert(i18n.t('shared'), i18n.t('you_and_name_see_each_other_10m', { name: req.requester_name }));
      } else {
        await api.respondToRequest(req.id, { user_id: user.id, accept: false });
      }
      refreshRef.current();
    } catch (error) {
      Alert.alert('Kunde inte svara', errorText(error));
    }
  }, [user]);

  const handleInbox = useCallback((data: Inbox) => {
    // Inkommande förfrågningar: fråga en gång per förfrågan
    for (const req of data.requests) {
      if (promptedRequests.current.has(req.id)) continue;
      promptedRequests.current.add(req.id);
      Alert.alert(
        i18n.t('wants_to_see_position', { name: req.requester_name }),
        i18n.t('if_share_see_each_other_10m'),
        [
          { text: i18n.t('deny'), style: 'cancel', onPress: () => respondToRequest(req, false) },
          { text: i18n.t('share'), onPress: () => respondToRequest(req, true) },
        ],
        { cancelable: false }
      );
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
        Alert.alert('Nekad', `${out.target_name} valde att inte dela sin position.`);
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
  const sharingRef = useRef<number[]>([]);
  useEffect(() => {
    sharingRef.current = inbox.sharing || [];
  }, [inbox.sharing]);

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
        
        // Uppdatera backend för alla vi delar med
        await Promise.all(
          sharing.map(receiverId => 
            api.sharePosition({ sender_id: user.id, receiver_id: receiverId, ...coords })
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
        const payload = response.notification.request.content.data as { type?: string; sender_id?: number };
        if (payload?.type === 'share' && payload.sender_id) {
          pendingFocusSender.current = payload.sender_id;
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

  const handleContactSelected = async (contactOrContacts: AppContact | AppContact[], signalType?: string, message?: string) => {
    setModalVisible(false);
    if (!user) return;

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
        Alert.alert('Skickat', `${sent?.emoji ?? ''} ${names} har fått din signal.`);
        return;
      }
      if (modalMode === 'send') {
        if (signalType === 'custom' && message) {
          for (const contact of contacts) await shareTo(contact.userId, null, message);
          Alert.alert(i18n.t('sent'), `${i18n.t('position_shared_with_message')} "${message}"`);
        } else {
          for (const contact of contacts) await shareTo(contact.userId);
          if (signalType && signalType !== 'none') {
            for (const contact of contacts) await api.sendSignal(user.id, contact.userId, signalType);
            const sent = SIGNALS.find(s => s.type === signalType);
            Alert.alert(i18n.t('sent'), i18n.t('position_shared_signal', { emoji: sent?.emoji ?? '', name: names }));
          } else {
            Alert.alert(i18n.t('sent'), i18n.t('sees_your_position_10m', { name: names }));
          }
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
      if (modalMode === 'request' && error instanceof ApiError && error.status === 409 && error.serverMessage) {
        Alert.alert('Delar redan', error.serverMessage);
        return;
      }
      Alert.alert('Något gick fel', errorText(error));
    }
  };

  const sendBack = async (pos: IncomingPosition) => {
    try {
      await shareTo(pos.sender_id);
      Alert.alert(i18n.t('sent'), i18n.t('sees_your_position_10m', { name: pos.sender_name }));
    } catch (error) {
      Alert.alert(i18n.t('error'), errorText(error));
    }
  };

  const focusOn = (pos: IncomingPosition) => {
    mapRef.current?.focusOn(pos.latitude, pos.longitude);
  };

  const logout = () => {
    Alert.alert('Byt användare', 'Vill du logga ut från den här telefonen?', [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: 'Logga ut',
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

  return (
    <View style={styles.container}>
      <View style={styles.mapContainer}>
        {location ? (
          Platform.OS === 'web' ? (
            <View style={{ flex: 1, backgroundColor: '#e1e1e1', justifyContent: 'center', alignItems: 'center', width: '100%', height: '100%' }}>
              <Text>Kartan är avstängd på webben under testning.</Text>
            </View>
          ) : (
            <LeafletMap 
              ref={mapRef}
              centerLat={location.coords.latitude}
              centerLng={location.coords.longitude}
              markers={[
                { id: 'me', lat: location.coords.latitude, lng: location.coords.longitude, title: 'Min position', color: '#007AFF', emoji: '🐷' },
                ...inbox.positions.map(pos => ({
                  id: String(pos.sender_id),
                  lat: pos.latitude,
                  lng: pos.longitude,
                  title: pos.sender_name,
                  color: '#FF3B30',
                  emoji: '🐷'
                }))
              ]}
            />
          )
        ) : (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0000ff" />
            <Text style={styles.loadingText}>{errorMsg || 'Hämtar position...'}</Text>
          </View>
        )}

        {/* Överst: vem jag är, vilka som delar med mig och väntande förfrågningar */}
        <View style={styles.topOverlay} pointerEvents="box-none">

          {inbox.positions.map(pos => (
            <View key={`card-${pos.sender_id}`} style={styles.shareCard}>
              <TouchableOpacity style={{ flex: 1 }} onPress={() => focusOn(pos)}>
                <Text style={styles.shareName}>{pos.sender_name}</Text>
                <Text style={styles.shareMeta}>Delar sin position · {minutesLeft(pos.expires_at)} min kvar</Text>
              </TouchableOpacity>
              {!inbox.sharing?.includes(pos.sender_id) && (
                <TouchableOpacity style={styles.smallButton} onPress={() => sendBack(pos)}>
                  <Text style={styles.smallButtonText}>Skicka tillbaka</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}

          {pendingOutgoing.map(out => (
            <View key={`out-${out.id}`} style={styles.pendingChip}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.pendingText}>Väntar på svar från {out.target_name}…</Text>
            </View>
          ))}
        </View>

        {/* Knappar som ligger ovanpå kartan i botten */}
        <View style={styles.buttonRow}>
          <TouchableOpacity 
            style={[styles.actionButton, styles.requestButton]} 
            onPress={() => openModal('request')}
          >
            <Text style={styles.buttonText}>Begär</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.actionButton, styles.pingButton]} 
            onPress={() => openModal('ping')}
          >
            <Text style={styles.buttonText}>Pinga</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.actionButton, styles.sendButton]} 
            onPress={() => openModal('send')}
          >
            <Text style={styles.buttonText}>Skicka</Text>
          </TouchableOpacity>
        </View>
      </View>
      
      {/* Reklamyta: Anpassar sig efter annonsens storlek */}
      <View style={styles.adContainer}>
        <BannerAd
          unitId={TestIds.BANNER}
          size={BannerAdSize.MEDIUM_RECTANGLE}
          requestOptions={{
            requestNonPersonalizedAdsOnly: true,
          }}
        />
      </View>

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
          Alert.alert('Skickat!', `Du pingade ${names}.`);
        }}
      />

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
  topOverlay: {
    position: 'absolute',
    top: 40,
    left: 12,
    right: 12,
    zIndex: 100,
    elevation: 10,
    gap: 8,
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
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  shareName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  shareMeta: {
    fontSize: 13,
    color: '#2a8a41', // Mycket mörkare och mer läslig grön
    marginTop: 2,
  },
  smallButton: {
    backgroundColor: '#805d73', // Din snygga lila färg
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8, // Samma lätt fyrkantiga stil
    marginLeft: 8,
  },
  smallButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  pendingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#805d73', // Ny murrig lila/rosa färg
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8, // Lätt rundade hörn (fyrkantig)
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
  buttonRow: {
    position: 'absolute',
    bottom: 20, 
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    paddingHorizontal: 10,
    zIndex: 10, // Viktigt för att synas över kartan
    elevation: 10, // Extra viktigt för Android
  },
  actionButton: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 8, // Lätt rundade hörn (mer fyrkantig känsla)
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestButton: {
    backgroundColor: '#7e895d', // Din färg 1
  },
  pingButton: {
    backgroundColor: '#805072',
  },
  sendButton: {
    backgroundColor: '#5d7e80', // Din färg 2
  },
  buttonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
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
  }
});

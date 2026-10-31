import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, TouchableOpacity, Platform, Alert, AppState, ScrollView } from 'react-native';
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
import { syncBackgroundLocation } from './src/backgroundLocation';
import { SIGNALS } from './src/signals';
import { registerForPushToken, getNotifications } from './src/push';
import type * as NotificationsType from 'expo-notifications';
import i18n from './src/i18n';
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
  const [isRespondingRequest, setIsRespondingRequest] = useState(false);

  const mapRef = useRef<LeafletMapRef>(null);
  const locationRef = useRef<Location.LocationObject | null>(null);
  const refreshRef = useRef<() => void>(() => {});
  const pendingRequestRef = useRef<IncomingRequest | null>(null);
  // Håller koll på vad vi redan hanterat så att inget visas eller skickas dubbelt
  const promptedRequests = useRef(new Set<number>());
  const reciprocatedRequests = useRef(new Set<number>());
  const notifiedDeclines = useRef(new Set<number>());

  // Initiera Google Mobile Ads och ladda sparad användare
  useEffect(() => {
    mobileAds()
      .initialize()
      .catch(err => console.warn('MobileAds init error:', err));

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
    let subscription: Location.LocationSubscription | null = null;
    let active = true;

    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permission to access location was denied');
        return;
      }

      try {
        let currentLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (active) {
          locationRef.current = currentLocation;
          setLocation(currentLocation);
        }
      } catch (e) {
        console.warn('Kunde inte hämta initial position:', e);
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
  const shareTo = useCallback(async (receiverId: number, requestId: number | null = null, message?: string, durationMinutes: number = 15) => {
    if (!user) return;
    const coords = await getCurrentCoords(locationRef.current);
    await api.sharePosition({ sender_id: user.id, receiver_id: receiverId, request_id: requestId, message, duration_minutes: durationMinutes, ...coords });
    const next = Array.from(new Set([...(sharingRef.current || []), receiverId]));
    syncBackgroundLocation(next);
  }, [user]);

  const respondToRequest = useCallback(async (req: IncomingRequest, accept: boolean, message?: string, durationMinutes: number = 15) => {
    if (!user) return;
    setIsRespondingRequest(true);
    try {
      if (accept) {
        const coords = await getCurrentCoords(locationRef.current);
        await api.respondToRequest(req.id, { user_id: user.id, accept: true, message, duration_minutes: durationMinutes, ...coords });
        const next = Array.from(new Set([...(sharingRef.current || []), req.requester_id]));
        syncBackgroundLocation(next);
        Alert.alert(i18n.t('shared'), `${req.requester_name} och du ser nu varandras position i ${durationMinutes} minuter.`);
      } else {
        await api.respondToRequest(req.id, { user_id: user.id, accept: false });
      }
      pendingRequestRef.current = null;
      setPendingRequest(null);
      refreshRef.current();
    } catch (error) {
      Alert.alert('Kunde inte svara', errorText(error));
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
  // Samt synkronisering till bakgrundstjänsten
  const sharingRef = useRef<number[]>([]);
  useEffect(() => {
    const sharing = inbox.sharing || [];
    sharingRef.current = sharing;
    if (user) {
      syncBackgroundLocation(sharing);
    }
  }, [inbox.sharing, user]);

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
            name: payload.sender_name || 'En vän',
            phoneNumber: '',
          };

          if (response.actionIdentifier === 'reply_ping') {
            // Användaren tryckte på "Pinga tillbaka" direkt i notisen
            setPingTarget([senderContact]);
            setPingModalVisible(true);
          } else {
            // Användaren tryckte på själva notisen: visa vad personen skickade så det inte missas
            const title = payload.title || response.notification.request.content.title || `${senderContact.name} pingade dig!`;
            const message = payload.message || response.notification.request.content.body || '';
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
    durationMinutes: number = 15
  ) => {
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
          for (const contact of contacts) await shareTo(contact.userId, null, message, durationMinutes);
          Alert.alert(i18n.t('shared'), `${i18n.t('position_shared_with_message')} "${message}" (${durationMinutes} min)`);
        } else {
          for (const contact of contacts) await shareTo(contact.userId, null, undefined, durationMinutes);
          if (signalType && signalType !== 'none') {
            for (const contact of contacts) await api.sendSignal(user.id, contact.userId, signalType);
            const sent = SIGNALS.find(s => s.type === signalType);
            Alert.alert(i18n.t('shared'), `${names} ser din position i ${durationMinutes} min ${sent?.emoji ?? ''}`);
          } else {
            Alert.alert(i18n.t('shared'), `${names} ser din position i ${durationMinutes} minuter.`);
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
  const activeShares = inbox.active_shares ?? [];
  const hasTopItems = activeShares.length > 0 || inbox.positions.length > 0 || pendingOutgoing.length > 0;

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
                  title: pos.message ? `${pos.sender_name}: "${pos.message}"` : pos.sender_name,
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
                <View key={`my-share-${share.receiver_id}`} style={styles.shareCard}>
                  <View style={styles.shareHeader}>
                    <Text style={styles.shareTitle} numberOfLines={1}>
                      <Text style={styles.shareMeta}>Du delar med </Text>
                      <Text style={styles.shareName}>{share.receiver_name}</Text>
                    </Text>
                    <Text style={styles.shareBadge}>{minutesLeft(share.expires_at)}m</Text>
                  </View>
                </View>
              ))}

            {inbox.positions.map(pos => (
              <View key={`card-${pos.sender_id}`} style={styles.shareCard}>
                <TouchableOpacity style={{ flex: 1 }} onPress={() => focusOn(pos)}>
                  <View style={styles.shareHeader}>
                    <Text style={styles.shareTitle} numberOfLines={1}>
                      <Text style={styles.shareName}>{pos.sender_name}</Text>
                      <Text style={styles.shareMeta}> delar sin position</Text>
                    </Text>
                    <Text style={styles.shareBadge}>{minutesLeft(pos.expires_at)}m</Text>
                  </View>
                  {Boolean(pos.message) && (
                    <Text style={styles.shareMessage} numberOfLines={1}>
                      💬 "{pos.message}"
                    </Text>
                  )}
                </TouchableOpacity>
                {!inbox.sharing?.includes(pos.sender_id) && (
                  <TouchableOpacity style={styles.smallButton} onPress={() => sendBack(pos)}>
                    <Text style={styles.smallButtonText}>Dela tillbaka</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}

            {pendingOutgoing.map(out => (
              <View key={`out-${out.id}`} style={styles.pendingChip}>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.pendingText}>Väntar på {out.target_name}…</Text>
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
            <Text style={[styles.buttonText, styles.requestButtonText]}>Begär</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.actionButton, styles.pingButton]} 
            onPress={() => openModal('ping')}
          >
            <Text style={[styles.buttonText, styles.pingButtonText]}>Pinga</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.actionButton, styles.sendButton]} 
            onPress={() => openModal('send')}
          >
            <Text style={[styles.buttonText, styles.sendButtonText]}>{i18n.t('share')}</Text>
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
          onAdFailedToLoad={(error) => {
            console.warn('Ad failed to load:', error);
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
  },
  requestButtonText: {
    color: '#7e895d',
  },
  pingButtonText: {
    color: '#805072',
  },
  sendButtonText: {
    color: '#5d7e80',
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

import React, { useRef, useEffect } from 'react';
import { WebView } from 'react-native-webview';
import { StyleSheet, View } from 'react-native';
import { PIN_DATA_URI, HAMMARBY_DATA_URI } from '../iconDataUris';

export interface MapMarkerData {
  id: string;
  lat: number;
  lng: number;
  title: string;
  color: string;
  emoji?: string;
  photoThumb?: string | null;
  shareId?: number;
}

interface Props {
  centerLat: number;
  centerLng: number;
  markers: MapMarkerData[];
  onMarkerPress?: (marker: MapMarkerData) => void;
}

export interface LeafletMapRef {
  focusOn: (lat: number, lng: number) => void;
}

const LeafletMap = React.forwardRef<LeafletMapRef, Props>(({ centerLat, centerLng, markers, onMarkerPress }, ref) => {
  const webViewRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const pendingFocus = useRef<{ lat: number; lng: number } | null>(null);

  const flyTo = (lat: number, lng: number) => {
    // Säg åt Leaflet att flyga till den nya positionen med en snygg animering
    const js = `if (typeof map !== 'undefined') { map.flyTo([${lat}, ${lng}], 16, { animate: true, duration: 1 }); }; true;`;
    webViewRef.current?.injectJavaScript(js);
  };

  React.useImperativeHandle(ref, () => ({
    focusOn: (lat: number, lng: number) => {
      // Kartan är inte klar än (t.ex. vid kallstart från en avisering): vänta tills den laddats
      if (!readyRef.current) {
        pendingFocus.current = { lat, lng };
        return;
      }
      flyTo(lat, lng);
    }
  }));


  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        body { padding: 0; margin: 0; }
        html, body, #map { height: 100vh; width: 100vw; }
        /* Lätt dämpad färg-karta så att markörerna fortfarande syns tydligt, men med färg. */
        .leaflet-tile-pane { filter: grayscale(0.35) sepia(0.22) contrast(0.96) brightness(1.02); }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var map = L.map('map', { zoomControl: false }).setView([${centerLat}, ${centerLng}], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19
        }).addTo(map);

        var markers = {};

        function updateMarkers(newMarkers) {
          var newIds = {};
          newMarkers.forEach(function(m) {
            newIds[m.id] = true;
            var isUser = m.id === 'me';
            var existing = markers[m.id];
            var prevThumb = existing ? (existing._photoThumb || '') : '';
            var prevEmoji = existing ? (existing._emoji || '') : '';
            var nextThumb = m.photoThumb || '';
            var nextEmoji = m.emoji || '';

            if (existing && prevThumb === nextThumb && prevEmoji === nextEmoji) {
              existing.setLatLng([m.lat, m.lng]);
              if (existing.getPopup()) {
                existing.getPopup().setContent(m.title);
              }
            } else {
              if (existing) {
                map.removeLayer(existing);
                delete markers[m.id];
              }
              var marker;
              var nameHtml = !isUser && m.title ? '<div style="margin-top:2px;font-size:11px;font-weight:600;color:#fff;background:rgba(0,0,0,0.65);padding:2px 6px;border-radius:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:76px;text-align:center;">' + m.title.split(':')[0].split(' ')[0] + '</div>' : '';

              if (m.photoThumb) {
                var thumbHtml = '<div style="position:relative;width:48px;height:48px;border-radius:12px;border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.45);overflow:hidden;background:#222;">' +
                  '<img src="' + m.photoThumb + '" style="width:100%;height:100%;object-fit:cover;display:block;" />' +
                  '<div style="position:absolute;bottom:1px;right:2px;font-size:11px;line-height:12px;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.8));">📷</div>' +
                '</div>';
                marker = L.marker([m.lat, m.lng], {
                  icon: L.divIcon({
                    className: '',
                    html: '<div style="display:flex;flex-direction:column;align-items:center;width:84px;justify-content:center;">' + thumbHtml + nameHtml + '</div>',
                    iconSize: [84, 84],
                    iconAnchor: [42, 48],
                    popupAnchor: [0, -34],
                  }),
                });
                marker.on('click', function() {
                  if (window.ReactNativeWebView) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'markerPress', id: m.id, shareId: m.shareId }));
                  }
                });
              } else if (m.emoji) {
                var isPin = m.emoji === 'pin' || m.emoji === '📍';
                var isHammarby = m.emoji === 'hammarby';
                var emojiNameHtml = !isUser && m.title ? '<div style="margin-top:-4px;font-size:11px;font-weight:600;color:#fff;background:rgba(0,0,0,0.6);padding:2px 6px;border-radius:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70px;text-align:center;">' + m.title.split(':')[0].split(' ')[0] + '</div>' : '';

                var iconInnerHtml;
                if (isPin) {
                  iconInnerHtml = '<img src="' + PIN_DATA_URI + '" style="width:36px;height:36px;object-fit:contain;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.45));display:block;" />';
                } else if (isHammarby) {
                  iconInnerHtml = '<img src="' + HAMMARBY_DATA_URI + '" style="width:38px;height:38px;object-fit:contain;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.45));display:block;" />';
                } else {
                  iconInnerHtml = '<div style="font-size:44px;line-height:44px;text-align:center;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.45));">' + m.emoji + '</div>';
                }

                marker = L.marker([m.lat, m.lng], {
                  icon: L.divIcon({
                    className: '',
                    html: '<div style="display:flex;flex-direction:column;align-items:center;width:80px;justify-content:center;">' + iconInnerHtml + emojiNameHtml + '</div>',
                    iconSize: [80, 80],
                    iconAnchor: [40, (isPin || isHammarby) ? 38 : 44],
                    popupAnchor: [0, (isPin || isHammarby) ? -28 : -30],
                  }),
                });
                if (m.shareId && m.emoji === '📷') {
                  marker.on('click', function() {
                    if (window.ReactNativeWebView) {
                      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'markerPress', id: m.id, shareId: m.shareId }));
                    }
                  });
                } else {
                  marker.bindPopup(m.title);
                }
              } else {
                marker = L.circleMarker([m.lat, m.lng], {
                  color: m.color,
                  fillColor: m.color,
                  fillOpacity: 1,
                  radius: isUser ? 6 : 8,
                  weight: isUser ? 2 : 0,
                });
                marker.bindPopup(m.title);
              }
              marker._photoThumb = nextThumb;
              marker._emoji = nextEmoji;
              marker.addTo(map);
              markers[m.id] = marker;
            }
          });

          for (var id in markers) {
            if (!newIds[id]) {
              map.removeLayer(markers[id]);
              delete markers[id];
            }
          }
        }
      </script>
    </body>
    </html>
  `;

  // Skicka in nya markörer via JS när React-staten ändras
  useEffect(() => {
    const js = `updateMarkers(${JSON.stringify(markers)}); true;`;
    webViewRef.current?.injectJavaScript(js);
  }, [markers]);

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html }}
        style={styles.map}
        scrollEnabled={false}
        onMessage={(event) => {
          try {
            const payload = JSON.parse(event.nativeEvent.data);
            if (payload?.type === 'markerPress' && onMarkerPress) {
              const found = markers.find(m => m.id === String(payload.id));
              if (found) onMarkerPress(found);
            }
          } catch (_) {}
        }}
        onLoadEnd={() => {
          readyRef.current = true;
          webViewRef.current?.injectJavaScript(`updateMarkers(${JSON.stringify(markers)}); true;`);
          if (pendingFocus.current) {
            const { lat, lng } = pendingFocus.current;
            pendingFocus.current = null;
            flyTo(lat, lng);
          }
        }}
      />
    </View>
  );
});

export default LeafletMap;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
  },
  map: {
    flex: 1,
  }
});

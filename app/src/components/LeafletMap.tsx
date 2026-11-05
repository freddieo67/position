import React, { useRef, useEffect } from 'react';
import { WebView } from 'react-native-webview';
import { StyleSheet, View } from 'react-native';

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

  const PIN_DATA_URI = "data:image/png;base64,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";

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
                var emojiNameHtml = !isUser && m.title ? '<div style="margin-top:-4px;font-size:11px;font-weight:600;color:#fff;background:rgba(0,0,0,0.6);padding:2px 6px;border-radius:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70px;text-align:center;">' + m.title.split(':')[0].split(' ')[0] + '</div>' : '';

                var iconInnerHtml = isPin
                  ? '<img src="' + PIN_DATA_URI + '" style="width:36px;height:36px;object-fit:contain;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.45));display:block;" />'
                  : '<div style="font-size:44px;line-height:44px;text-align:center;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.45));">' + m.emoji + '</div>';

                marker = L.marker([m.lat, m.lng], {
                  icon: L.divIcon({
                    className: '',
                    html: '<div style="display:flex;flex-direction:column;align-items:center;width:80px;justify-content:center;">' + iconInnerHtml + emojiNameHtml + '</div>',
                    iconSize: [80, 80],
                    iconAnchor: [40, isPin ? 38 : 44],
                    popupAnchor: [0, isPin ? -28 : -30],
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

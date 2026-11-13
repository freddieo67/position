import React, { useRef, useEffect } from 'react';
import { WebView } from 'react-native-webview';
import { StyleSheet, View } from 'react-native';

export interface MapMarkerData {
  id: string;
  lat: number;
  lng: number;
  title: string;
  label?: string;
  color: string;
  emoji?: string;
  photoThumb?: string | null;
  shareId?: number;
  isMeetingPoint?: boolean;
}

interface Props {
  centerLat: number;
  centerLng: number;
  markers: MapMarkerData[];
  onMarkerPress?: (marker: MapMarkerData) => void;
  onCenterChange?: (lat: number, lng: number) => void;
}

export interface LeafletMapRef {
  focusOn: (lat: number, lng: number) => void;
}

const LeafletMap = React.forwardRef<LeafletMapRef, Props>(({ centerLat, centerLng, markers, onMarkerPress, onCenterChange }, ref) => {
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

        map.on('moveend', function() {
          var c = map.getCenter();
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'centerChanged', lat: c.lat, lng: c.lng }));
          }
        });

        var markers = {};

        function updateMarkers(newMarkers) {
          var newIds = {};
          newMarkers.forEach(function(m) {
            newIds[m.id] = true;
            var isUser = m.id === 'me';
            var existing = markers[m.id];
            var prevThumb = existing ? (existing._photoThumb || '') : '';
            var prevEmoji = existing ? (existing._emoji || '') : '';
            var prevLabel = existing ? (existing._label || '') : '';
            var nextThumb = m.photoThumb || '';
            var nextEmoji = m.emoji || '';
            var nextLabel = m.label || '';

            if (existing && prevThumb === nextThumb && prevEmoji === nextEmoji && prevLabel === nextLabel) {
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

              if (m.photoThumb) {
                var photoBadgeText = m.label || (!isUser && m.title ? m.title.split(':')[0].split(' ')[0] : '');
                var clipId = 'photoClip-' + String(m.id).replace(/[^a-zA-Z0-9]/g, '_');
                var thumbHtml = '<svg width="46" height="54" viewBox="0 0 46 54" style="filter:drop-shadow(0 4px 6px rgba(0,0,0,0.4)) drop-shadow(0 1px 2px rgba(0,0,0,0.25));display:block;">' +
                  '<defs>' +
                    '<clipPath id="' + clipId + '">' +
                      '<circle cx="23" cy="20" r="15.5" />' +
                    '</clipPath>' +
                  '</defs>' +
                  '<path d="M 23 52 L 8.1 30.1 A 18 18 0 1 1 37.9 30.1 Z" fill="#000" />' +
                  '<circle cx="23" cy="20" r="16" fill="#fff" />' +
                  '<image href="' + m.photoThumb + '" x="7.5" y="4.5" width="31" height="31" preserveAspectRatio="xMidYMid slice" clip-path="url(#' + clipId + ')" />' +
                '</svg>';
                var photoGroundShadow = '<div style="width:18px;height:5px;background:radial-gradient(ellipse at center,rgba(0,0,0,0.5) 0%,rgba(0,0,0,0) 75%);border-radius:50%;margin-top:-3px;margin-bottom:2px;"></div>';
                var photoBadgeHtml = photoBadgeText ? '<div style="font-size:11px;font-weight:700;color:#fff;background:rgba(15,23,42,0.85);padding:2px 7px;border-radius:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:88px;text-align:center;box-shadow:0 2px 4px rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.25);">' + photoBadgeText + '</div>' : '';

                marker = L.marker([m.lat, m.lng], {
                  icon: L.divIcon({
                    className: '',
                    html: '<div style="display:flex;flex-direction:column;align-items:center;width:90px;overflow:visible;">' + thumbHtml + photoGroundShadow + photoBadgeHtml + '</div>',
                    iconSize: [90, 80],
                    iconAnchor: [45, 52],
                    popupAnchor: [0, -52],
                  }),
                });
                marker.on('click', function() {
                  if (window.ReactNativeWebView) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'markerPress', id: m.id, shareId: m.shareId }));
                  }
                });
              } else if (m.emoji) {
                var isMeeting = Boolean(m.isMeetingPoint || m.emoji === '📍');
                var badgeText = m.label || (isMeeting ? 'Mötesplats' : (!isUser && m.title ? m.title.split(':')[0].split(' ')[0] : ''));
                var emojiNameHtml = badgeText ? '<div style="margin-top:1px;font-size:11px;font-weight:700;color:#fff;background:' + (isMeeting ? 'rgba(15,76,92,0.92)' : 'rgba(15,23,42,0.85)') + ';padding:2px 7px;border-radius:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:96px;text-align:center;box-shadow:0 2px 4px rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.25);">' + badgeText + '</div>' : '';
                var iconInnerHtml = '<div style="font-size:46px;line-height:1.15;padding-top:4px;overflow:visible;text-align:center;filter:drop-shadow(0 6px 8px rgba(0,0,0,0.35)) drop-shadow(0 1px 2px rgba(0,0,0,0.25));">' + m.emoji + '</div>';
                var groundShadowHtml = isMeeting
                  ? '<div style="width:16px;height:5px;background:radial-gradient(ellipse at center,rgba(0,0,0,0.55) 0%,rgba(0,0,0,0) 75%);border-radius:50%;margin-top:-4px;margin-bottom:2px;"></div>'
                  : '<div style="width:26px;height:7px;background:radial-gradient(ellipse at center,rgba(0,0,0,0.45) 0%,rgba(0,0,0,0) 75%);border-radius:50%;margin-top:-6px;margin-bottom:2px;"></div>';

                marker = L.marker([m.lat, m.lng], {
                  icon: L.divIcon({
                    className: '',
                    html: '<div style="display:flex;flex-direction:column;align-items:center;width:100px;overflow:visible;">' + iconInnerHtml + groundShadowHtml + emojiNameHtml + '</div>',
                    iconSize: [100, 80],
                    iconAnchor: isMeeting ? [50, 52] : [50, 46],
                    popupAnchor: isMeeting ? [0, -50] : [0, -32],
                  }),
                });
                if (m.shareId && (m.emoji === '📷' || m.isMeetingPoint)) {
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
              marker._label = nextLabel;
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
            } else if (payload?.type === 'centerChanged' && onCenterChange) {
              onCenterChange(Number(payload.lat), Number(payload.lng));
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

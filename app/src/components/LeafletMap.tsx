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
}

interface Props {
  centerLat: number;
  centerLng: number;
  markers: MapMarkerData[];
}

export interface LeafletMapRef {
  focusOn: (lat: number, lng: number) => void;
}

const LeafletMap = React.forwardRef<LeafletMapRef, Props>(({ centerLat, centerLng, markers }, ref) => {
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
          // Rensa gamla
          for (var id in markers) {
            map.removeLayer(markers[id]);
          }
          markers = {};
          
          // Lägg till nya
          newMarkers.forEach(m => {
            var isUser = m.id === 'me';
            var marker;
            if (m.emoji) {
              var nameHtml = !isUser && m.title ? '<div style="margin-top:-4px;font-size:11px;font-weight:600;color:#fff;background:rgba(0,0,0,0.6);padding:2px 6px;border-radius:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70px;text-align:center;">' + m.title.split(' ')[0] + '</div>' : '';

              marker = L.marker([m.lat, m.lng], {
                icon: L.divIcon({
                  className: '',
                  html: '<div style="display:flex;flex-direction:column;align-items:center;width:80px;justify-content:center;"><div style="font-size:44px;line-height:44px;text-align:center;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.45));">' + m.emoji + '</div>' + nameHtml + '</div>',
                  iconSize: [80, 80],
                  iconAnchor: [40, 44],
                  popupAnchor: [0, -30],
                }),
              });
            } else {
              marker = L.circleMarker([m.lat, m.lng], {
                color: m.color,
                fillColor: m.color,
                fillOpacity: 1,
                radius: isUser ? 6 : 8,
                weight: isUser ? 2 : 0,
              });
            }
            marker.addTo(map).bindPopup(m.title);
            markers[m.id] = marker;
          });
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

import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';

const ITEM_HEIGHT = 42;
const VISIBLE_ITEMS = 3;
const CONTAINER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS; // 126px
const PADDING = (CONTAINER_HEIGHT - ITEM_HEIGHT) / 2; // 42px

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

interface TimeWheelPickerProps {
  selectedHour: number;
  selectedMinute: number;
  onChange: (hour: number, minute: number) => void;
}

export default function TimeWheelPicker({
  selectedHour,
  selectedMinute,
  onChange,
}: TimeWheelPickerProps) {
  const hourScrollRef = useRef<ScrollView>(null);
  const minScrollRef = useRef<ScrollView>(null);
  const isUserScrollingHour = useRef(false);
  const isUserScrollingMin = useRef(false);

  // Hitta närmaste 5-minuters index för minuten
  const closestMinIndex = Math.max(
    0,
    MINUTES.findIndex(m => m >= selectedMinute) !== -1
      ? MINUTES.findIndex(m => m >= selectedMinute)
      : MINUTES.length - 1
  );

  useEffect(() => {
    // Scrolla till startposition på mount
    const timer = setTimeout(() => {
      hourScrollRef.current?.scrollTo({
        y: selectedHour * ITEM_HEIGHT,
        animated: false,
      });
      minScrollRef.current?.scrollTo({
        y: closestMinIndex * ITEM_HEIGHT,
        animated: false,
      });
    }, 60);
    return () => clearTimeout(timer);
  }, []);

  const handleHourScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    isUserScrollingHour.current = false;
    const y = e.nativeEvent.contentOffset.y;
    const index = Math.max(0, Math.min(HOURS.length - 1, Math.round(y / ITEM_HEIGHT)));
    if (index !== selectedHour) {
      onChange(index, selectedMinute);
    }
  };

  const handleMinScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    isUserScrollingMin.current = false;
    const y = e.nativeEvent.contentOffset.y;
    const index = Math.max(0, Math.min(MINUTES.length - 1, Math.round(y / ITEM_HEIGHT)));
    const newMin = MINUTES[index] ?? 0;
    if (newMin !== selectedMinute) {
      onChange(selectedHour, newMin);
    }
  };

  const selectHour = (h: number) => {
    hourScrollRef.current?.scrollTo({ y: h * ITEM_HEIGHT, animated: true });
    onChange(h, selectedMinute);
  };

  const selectMin = (m: number, idx: number) => {
    minScrollRef.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated: true });
    onChange(selectedHour, m);
  };

  return (
    <View style={styles.outerContainer}>
      <View style={styles.wheelWrapper}>
        {/* Aktiv markeringsram i mitten */}
        <View style={styles.activeHighlight} pointerEvents="none" />

        {/* Timme snurra */}
        <View style={styles.column}>
          <Text style={styles.columnHeader}>TIMME</Text>
          <ScrollView
            ref={hourScrollRef}
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            snapToInterval={ITEM_HEIGHT}
            decelerationRate="fast"
            onScrollBeginDrag={() => {
              isUserScrollingHour.current = true;
            }}
            onMomentumScrollEnd={handleHourScrollEnd}
            onScrollEndDrag={handleHourScrollEnd}
          >
            {HOURS.map(h => {
              const isSelected = h === selectedHour;
              return (
                <TouchableOpacity
                  key={`h-${h}`}
                  style={styles.item}
                  onPress={() => selectHour(h)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.itemText, isSelected && styles.itemTextSelected]}>
                    {String(h).padStart(2, '0')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Kolon separator */}
        <View style={styles.colonColumn}>
          <Text style={styles.colonText}>:</Text>
        </View>

        {/* Minut snurra */}
        <View style={styles.column}>
          <Text style={styles.columnHeader}>MINUTER</Text>
          <ScrollView
            ref={minScrollRef}
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            snapToInterval={ITEM_HEIGHT}
            decelerationRate="fast"
            onScrollBeginDrag={() => {
              isUserScrollingMin.current = true;
            }}
            onMomentumScrollEnd={handleMinScrollEnd}
            onScrollEndDrag={handleMinScrollEnd}
          >
            {MINUTES.map((m, idx) => {
              const isSelected = m === selectedMinute;
              return (
                <TouchableOpacity
                  key={`m-${m}`}
                  style={styles.item}
                  onPress={() => selectMin(m, idx)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.itemText, isSelected && styles.itemTextSelected]}>
                    {String(m).padStart(2, '0')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    alignItems: 'center',
    marginVertical: 4,
  },
  wheelWrapper: {
    width: '100%',
    maxWidth: 280,
    height: CONTAINER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
    position: 'relative',
  },
  activeHighlight: {
    position: 'absolute',
    top: PADDING,
    left: 12,
    right: 12,
    height: ITEM_HEIGHT,
    backgroundColor: '#0F4C5C15',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#0F4C5C40',
    zIndex: 1,
  },
  column: {
    flex: 1,
    height: CONTAINER_HEIGHT,
    alignItems: 'center',
    zIndex: 2,
  },
  columnHeader: {
    position: 'absolute',
    top: 4,
    fontSize: 9,
    fontWeight: '700',
    color: '#94a3b8',
    letterSpacing: 0.8,
    zIndex: 3,
  },
  scrollView: {
    width: '100%',
    height: CONTAINER_HEIGHT,
  },
  scrollContent: {
    paddingTop: PADDING,
    paddingBottom: PADDING,
  },
  item: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: {
    fontSize: 17,
    fontWeight: '500',
    color: '#94a3b8',
  },
  itemTextSelected: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F4C5C',
  },
  colonColumn: {
    width: 24,
    height: CONTAINER_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  colonText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F4C5C',
    marginTop: -2,
  },
});


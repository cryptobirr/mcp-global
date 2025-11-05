import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface OfflineBannerProps {
  isVisible?: boolean;
}

export function OfflineBanner({ isVisible = true }: OfflineBannerProps) {
  if (!isVisible) {
    return null;
  }

  return (
    <View
      style={styles.banner}
      accessibilityRole="alert"
      accessibilityLabel="Device offline, data not synced"
      accessibilityLiveRegion="polite"
    >
      <Text style={styles.icon}>{'\u26A0'}</Text>
      <Text style={styles.text}>Offline {'\u00B7'} Data not synced</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#fef3c7',
    borderBottomWidth: 1,
    borderBottomColor: '#fbbf24',
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    width: '100%',
  },
  icon: {
    fontSize: 16,
    color: '#92400e',
    marginRight: 8,
  },
  text: {
    fontSize: 14,
    fontWeight: '500',
    color: '#92400e',
  },
});

export default OfflineBanner;

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface MoonRefreshIndicatorProps {
  phase?: 'new' | 'crescent' | 'quarter' | 'gibbous' | 'full';
}

const MOON_PHASES = {
  new: '\u25CF',      // Black circle
  crescent: '\u{1F319}',  // Crescent moon (using unicode escape to avoid emoji in source)
  quarter: '\u{1F313}',   // First quarter moon
  gibbous: '\u{1F315}',   // Full moon face
  full: '\u25CB',     // White circle
};

export function MoonRefreshIndicator({ phase = 'quarter' }: MoonRefreshIndicatorProps) {
  return (
    <View
      style={styles.container}
      accessibilityRole="progressbar"
      accessibilityLabel="Refreshing health data"
    >
      <View style={styles.moonContainer}>
        <Text style={styles.moonText}>{MOON_PHASES[phase]}</Text>
      </View>
      <Text style={styles.label}>Refreshing...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  moonContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  moonText: {
    fontSize: 24,
    color: '#374151',
  },
  label: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
});

export default MoonRefreshIndicator;

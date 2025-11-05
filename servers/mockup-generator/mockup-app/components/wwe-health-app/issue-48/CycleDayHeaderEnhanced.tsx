import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface CycleDayHeaderEnhancedProps {
  cycleDay?: number | null;
  totalDays?: number;
  phase?: 'menstrual' | 'follicular' | 'ovulation' | 'luteal' | null;
}

const PHASE_COLORS = {
  menstrual: '#dc2626',
  follicular: '#3b82f6',
  ovulation: '#ec4899',
  luteal: '#9333ea',
};

const PHASE_LABELS = {
  menstrual: 'Menstrual',
  follicular: 'Follicular',
  ovulation: 'Ovulation',
  luteal: 'Luteal',
};

export function CycleDayHeaderEnhanced({
  cycleDay = 14,
  totalDays = 28,
  phase = 'ovulation'
}: CycleDayHeaderEnhancedProps) {
  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  if (!cycleDay || !phase) {
    return (
      <View style={[styles.container, { backgroundColor: '#6b7280' }]}>
        <Text style={styles.dateText}>{currentDate}</Text>
        <Text style={styles.dayText}>No cycle data</Text>
        <Text style={styles.phaseText}>Start tracking to see your cycle</Text>
      </View>
    );
  }

  const backgroundColor = PHASE_COLORS[phase];
  const phaseLabel = PHASE_LABELS[phase];

  return (
    <View
      style={[styles.container, { backgroundColor }]}
      accessibilityRole="header"
      accessibilityLabel={`${currentDate}, Day ${cycleDay} of ${totalDays}, ${phaseLabel} phase`}
    >
      <Text style={styles.dateText}>{currentDate}</Text>
      <Text style={styles.combinedText}>
        Day {cycleDay} of {totalDays} {'\u00B7'} {phaseLabel}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 24,
    alignItems: 'center',
    width: '100%',
  },
  dateText: {
    fontSize: 14,
    fontWeight: '400',
    color: '#ffffff',
    opacity: 0.9,
    marginBottom: 4,
  },
  combinedText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
  },
  dayText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  phaseText: {
    fontSize: 16,
    color: '#ffffff',
    opacity: 0.9,
  },
});

export default CycleDayHeaderEnhanced;

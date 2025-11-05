import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface TodayMoodCardEnhancedProps {
  moodLog?: any | null;
  onLogMood: () => void;
  onViewHistory: () => void;
}

export function TodayMoodCardEnhanced({
  moodLog,
  onLogMood,
  onViewHistory
}: TodayMoodCardEnhancedProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.promptText}>How are you feeling today?</Text>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={onLogMood}
        accessibilityLabel="Log today's mood"
        accessibilityRole="button"
      >
        <Text style={styles.primaryButtonText}>Log Mood</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={onViewHistory}
        accessibilityLabel="View mood log history"
        accessibilityRole="button"
        accessibilityHint="Opens your complete mood log history"
      >
        <Text style={styles.secondaryButtonText}>View History</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    alignItems: 'center',
    width: '100%',
    maxWidth: 600,
  },
  promptText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 16,
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    minHeight: 44,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  secondaryButton: {
    backgroundColor: '#ffffff',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3b82f6',
    minHeight: 44,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3b82f6',
  },
});

export default TodayMoodCardEnhanced;

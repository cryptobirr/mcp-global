import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, typography, borderRadius, shadows } from './designTokens';

interface MoodData {
  mood: string; // e.g., "Happy", "Neutral", "Sad"
  energy: string; // e.g., "Energetic", "Tired"
  timestamp: string; // e.g., "8:30 AM"
}

interface TodayMoodCardProps {
  moodData?: MoodData | null;
  onLogMoodPress?: () => void;
}

export const TodayMoodCard: React.FC<TodayMoodCardProps> = ({
  moodData,
  onLogMoodPress,
}) => {
  const hasMoodLogged = !!moodData;

  return (
    <View
      style={styles.card}
      accessible={true}
      accessibilityRole={hasMoodLogged ? 'text' : 'button'}
      accessibilityLabel={
        hasMoodLogged
          ? `Today's mood: ${moodData.mood}, ${moodData.energy}, logged at ${moodData.timestamp}`
          : "Today's mood not logged yet"
      }
    >
      <Text style={styles.cardTitle}>Today's Mood</Text>

      {hasMoodLogged ? (
        <View style={styles.moodContent}>
          <View style={styles.moodRow}>
            <Text style={styles.moodEmoji}>{getMoodEmoji(moodData.mood)}</Text>
            <View style={styles.moodDetails}>
              <Text style={styles.moodLabel}>{moodData.energy}</Text>
              <Text style={styles.moodTimestamp}>Logged at {moodData.timestamp}</Text>
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.emptyMoodContent}>
          <Text style={styles.emptyMoodText}>How are you feeling today?</Text>
          <TouchableOpacity
            style={styles.logMoodButton}
            onPress={onLogMoodPress}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Log today's mood"
            activeOpacity={0.8}
          >
            <Text style={styles.logMoodButtonText}>Log Mood</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const getMoodEmoji = (mood: string): string => {
  // Using unicode escapes instead of emoji characters for UTF-8 safety
  const moodMap: Record<string, string> = {
    Happy: '\u263A',     // Smiley
    Neutral: '\u25CF',   // Circle
    Sad: '\u2639',       // Frown
    Anxious: '\u26A0',   // Warning
    Energetic: '\u26A1', // Lightning
  };
  return moodMap[mood] || '\u25CF';
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    ...shadows.sm,
  },
  cardTitle: {
    fontSize: typography.h3.fontSize,
    fontWeight: typography.h3.fontWeight,
    color: colors.neutral[900],
    marginBottom: spacing.md,
  },
  moodContent: {
    paddingVertical: spacing.sm,
  },
  moodRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  moodEmoji: {
    fontSize: 40,
    marginRight: spacing.md,
  },
  moodDetails: {
    flex: 1,
  },
  moodLabel: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.bodyBold.fontWeight,
    color: colors.neutral[900],
    marginBottom: spacing.xs,
  },
  moodTimestamp: {
    fontSize: typography.small.fontSize,
    fontWeight: typography.small.fontWeight,
    color: colors.neutral[500],
  },
  emptyMoodContent: {
    paddingVertical: spacing.md,
  },
  emptyMoodText: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    color: colors.neutral[500],
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  logMoodButton: {
    minHeight: 44,
    backgroundColor: colors.secondary[500],
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logMoodButtonText: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.bodyBold.fontWeight,
    color: colors.white,
  },
});

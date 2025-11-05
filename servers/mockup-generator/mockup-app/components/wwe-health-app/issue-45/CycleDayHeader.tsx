import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, typography, borderRadius, shadows } from './designTokens';

interface CycleDayHeaderProps {
  cycleDay: number;
  totalDays: number;
  phase: 'menstrual' | 'follicular' | 'ovulation' | 'luteal';
  date: string;
  onCalendarPress?: () => void;
}

export const CycleDayHeader: React.FC<CycleDayHeaderProps> = ({
  cycleDay,
  totalDays,
  phase,
  date,
  onCalendarPress,
}) => {
  const phaseLabel = phase.charAt(0).toUpperCase() + phase.slice(1);
  const backgroundColor = colors.cyclePhases[phase];

  return (
    <View
      style={[styles.container, { backgroundColor }]}
      accessible={true}
      accessibilityRole="header"
      accessibilityLabel={`Day ${cycleDay} of ${totalDays}, ${phaseLabel} phase`}
    >
      <View style={styles.content}>
        <View style={styles.textContainer}>
          <Text style={styles.cycleDayText}>
            Day {cycleDay} of {totalDays} {'\u00B7'} {phaseLabel}
          </Text>
          <Text style={styles.dateText}>{date}</Text>
        </View>

        {onCalendarPress && (
          <TouchableOpacity
            style={styles.calendarButton}
            onPress={onCalendarPress}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="View full calendar"
            activeOpacity={0.7}
          >
            <Text style={styles.calendarButtonText}>Calendar {'\u00BB'}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    minHeight: 80,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.lg,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    ...shadows.sm,
  },
  content: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
  },
  cycleDayText: {
    fontSize: typography.h2.fontSize,
    fontWeight: typography.h2.fontWeight,
    color: colors.white,
    marginBottom: spacing.xs,
  },
  dateText: {
    fontSize: typography.small.fontSize,
    fontWeight: typography.small.fontWeight,
    color: colors.white,
    opacity: 0.9,
  },
  calendarButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  calendarButtonText: {
    fontSize: typography.small.fontSize,
    fontWeight: typography.bodyBold.fontWeight,
    color: colors.white,
  },
});

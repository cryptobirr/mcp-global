import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { colors, spacing, typography, borderRadius, shadows } from './designTokens';

interface CalendarDay {
  day: number;
  isPeriod: boolean;
  isOvulation: boolean;
  isToday: boolean;
}

interface CalendarPreviewProps {
  days: CalendarDay[];
}

export const CalendarPreview: React.FC<CalendarPreviewProps> = ({ days }) => {
  return (
    <View
      style={styles.card}
      accessible={true}
      accessibilityRole="scrollbar"
      accessibilityLabel="Cycle calendar, scrollable"
    >
      <Text style={styles.cardTitle}>Cycle Calendar</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        snapToInterval={48 + spacing.sm} // Day width + margin
        decelerationRate="fast"
        accessible={true}
        accessibilityLabel={`Showing ${days.length} days`}
      >
        {days.map((dayData, index) => (
          <View
            key={index}
            style={[
              styles.dayCell,
              dayData.isToday && styles.todayCell,
            ]}
            accessible={true}
            accessibilityLabel={getDayAccessibilityLabel(dayData)}
          >
            <Text
              style={[
                styles.dayNumber,
                dayData.isToday && styles.todayDayNumber,
              ]}
            >
              {dayData.day}
            </Text>
            {(dayData.isPeriod || dayData.isOvulation) && (
              <View style={styles.markerContainer}>
                <Text
                  style={[
                    styles.marker,
                    dayData.isPeriod && styles.periodMarker,
                    dayData.isOvulation && styles.ovulationMarker,
                  ]}
                >
                  {dayData.isPeriod ? 'P' : 'O'}
                </Text>
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

const getDayAccessibilityLabel = (dayData: CalendarDay): string => {
  let label = `Day ${dayData.day}`;
  if (dayData.isToday) label += ', today';
  if (dayData.isPeriod) label += ', period day';
  if (dayData.isOvulation) label += ', ovulation day';
  return label;
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    paddingVertical: spacing.lg,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.xl,
    ...shadows.sm,
  },
  cardTitle: {
    fontSize: typography.h3.fontSize,
    fontWeight: typography.h3.fontWeight,
    color: colors.neutral[900],
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
  },
  dayCell: {
    width: 48,
    height: 64,
    marginRight: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.neutral[100],
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  todayCell: {
    backgroundColor: colors.secondary[100],
    borderWidth: 2,
    borderColor: colors.secondary[500],
  },
  dayNumber: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.bodyBold.fontWeight,
    color: colors.neutral[700],
  },
  todayDayNumber: {
    color: colors.secondary[700],
  },
  markerContainer: {
    position: 'absolute',
    bottom: spacing.xs,
  },
  marker: {
    fontSize: typography.tiny.fontSize,
    fontWeight: typography.bodyBold.fontWeight,
  },
  periodMarker: {
    color: colors.cyclePhases.menstrual,
  },
  ovulationMarker: {
    color: colors.cyclePhases.ovulation,
  },
});

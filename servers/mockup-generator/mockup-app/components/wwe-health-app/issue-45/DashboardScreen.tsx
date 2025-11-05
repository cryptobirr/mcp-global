import React, { useState } from 'react';
import { ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { LoadingSpinner } from './LoadingSpinner';
import { ErrorView } from './ErrorView';
import { CycleDayHeader } from './CycleDayHeader';
import { TodayMoodCard } from './TodayMoodCard';
import { InsightCard } from './InsightCard';
import { CalendarPreview } from './CalendarPreview';
import { colors } from './designTokens';

// Mock data for demonstration
const mockHealthData = {
  cycleDay: 14,
  totalDays: 28,
  phase: 'ovulation' as const,
  date: 'Nov 2, 2025',
  mood: {
    mood: 'Happy',
    energy: 'Energetic',
    timestamp: '8:30 AM',
  },
  insight: {
    title: 'Energy Pattern Detected',
    description: 'Your energy peaks during ovulation phase',
    chartData: [45, 60, 75, 85, 90, 80, 65], // Last 7 days
  },
  calendarDays: [
    { day: 27, isPeriod: false, isOvulation: false, isToday: false },
    { day: 28, isPeriod: false, isOvulation: false, isToday: false },
    { day: 1, isPeriod: true, isOvulation: false, isToday: false },
    { day: 2, isPeriod: true, isOvulation: false, isToday: true },
    { day: 3, isPeriod: true, isOvulation: false, isToday: false },
    { day: 4, isPeriod: false, isOvulation: false, isToday: false },
    { day: 5, isPeriod: false, isOvulation: false, isToday: false },
    { day: 6, isPeriod: false, isOvulation: false, isToday: false },
    { day: 7, isPeriod: false, isOvulation: false, isToday: false },
  ],
};

export const DashboardScreen: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const handleRetry = () => {
    setError(false);
    setLoading(true);
    // Simulate data fetch
    setTimeout(() => setLoading(false), 1000);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    // Simulate data refresh
    setTimeout(() => setRefreshing(false), 500);
  };

  const handleLogMood = () => {
    console.log('Navigate to mood logging screen');
  };

  const handleSeeAllInsights = () => {
    console.log('Navigate to insights list');
  };

  const handleCalendarPress = () => {
    console.log('Navigate to full calendar');
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return <ErrorView onRetry={handleRetry} />;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={colors.secondary[500]}
          colors={[colors.secondary[500]]}
        />
      }
      accessible={true}
      accessibilityRole="scrollbar"
    >
      <CycleDayHeader
        cycleDay={mockHealthData.cycleDay}
        totalDays={mockHealthData.totalDays}
        phase={mockHealthData.phase}
        date={mockHealthData.date}
        onCalendarPress={handleCalendarPress}
      />

      <TodayMoodCard
        moodData={mockHealthData.mood}
        onLogMoodPress={handleLogMood}
      />

      <InsightCard
        insight={mockHealthData.insight}
        onSeeAllPress={handleSeeAllInsights}
      />

      <CalendarPreview days={mockHealthData.calendarDays} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral[50],
  },
  contentContainer: {
    paddingTop: 8,
    paddingBottom: 40,
  },
});

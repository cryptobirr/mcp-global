import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, typography, borderRadius, shadows } from './designTokens';

interface InsightData {
  title: string;
  description: string;
  chartData?: number[]; // Simple bar chart data for visualization
}

interface InsightCardProps {
  insight?: InsightData | null;
  onSeeAllPress?: () => void;
}

export const InsightCard: React.FC<InsightCardProps> = ({
  insight,
  onSeeAllPress,
}) => {
  const hasInsight = !!insight;

  return (
    <View
      style={styles.card}
      accessible={true}
      accessibilityLabel={hasInsight ? `Insight: ${insight.title}` : 'No insights available yet'}
    >
      <View style={styles.header}>
        <Text style={styles.cardTitle}>Insights</Text>
        {hasInsight && onSeeAllPress && (
          <TouchableOpacity
            onPress={onSeeAllPress}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="See all insights"
            activeOpacity={0.7}
          >
            <Text style={styles.seeAllText}>See All</Text>
          </TouchableOpacity>
        )}
      </View>

      {hasInsight ? (
        <View style={styles.insightContent}>
          {/* Simple bar chart visualization */}
          {insight.chartData && (
            <View style={styles.chartContainer}>
              {insight.chartData.map((value, index) => (
                <View key={index} style={styles.barWrapper}>
                  <View
                    style={[
                      styles.bar,
                      {
                        height: Math.max(value * 2, 4), // Min 4px height
                        backgroundColor: getBarColor(value),
                      },
                    ]}
                  />
                  <Text style={styles.barLabel}>{index + 1}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.insightTextContainer}>
            <Text style={styles.insightTitle}>{insight.title}</Text>
            <Text style={styles.insightDescription}>{insight.description}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.emptyInsightContent}>
          <View style={styles.emptyPlaceholder}>
            <Text style={styles.emptyPlaceholderIcon}>{'\u2026'}</Text>
          </View>
          <Text style={styles.emptyInsightText}>Start tracking to see insights</Text>
        </View>
      )}
    </View>
  );
};

const getBarColor = (value: number): string => {
  if (value >= 80) return colors.success;
  if (value >= 50) return colors.secondary[500];
  if (value >= 30) return colors.warning;
  return colors.neutral[500];
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
    minHeight: 300,
    ...shadows.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  cardTitle: {
    fontSize: typography.h3.fontSize,
    fontWeight: typography.h3.fontWeight,
    color: colors.neutral[900],
  },
  seeAllText: {
    fontSize: typography.small.fontSize,
    fontWeight: typography.bodyBold.fontWeight,
    color: colors.secondary[500],
  },
  insightContent: {
    flex: 1,
  },
  chartContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 150,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
  barWrapper: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    flex: 1,
    marginHorizontal: spacing.xs,
  },
  bar: {
    width: '100%',
    borderRadius: borderRadius.sm,
    marginBottom: spacing.xs,
  },
  barLabel: {
    fontSize: typography.tiny.fontSize,
    fontWeight: typography.tiny.fontWeight,
    color: colors.neutral[500],
  },
  insightTextContainer: {
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.neutral[200],
  },
  insightTitle: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.bodyBold.fontWeight,
    color: colors.neutral[900],
    marginBottom: spacing.sm,
  },
  insightDescription: {
    fontSize: typography.small.fontSize,
    fontWeight: typography.small.fontWeight,
    color: colors.neutral[500],
    lineHeight: 20,
  },
  emptyInsightContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  emptyPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.neutral[100],
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  emptyPlaceholderIcon: {
    fontSize: 48,
    color: colors.neutral[500],
  },
  emptyInsightText: {
    fontSize: typography.small.fontSize,
    fontWeight: typography.small.fontWeight,
    color: colors.neutral[500],
  },
});

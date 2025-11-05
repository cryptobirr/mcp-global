import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, typography, borderRadius } from './designTokens';

interface ErrorViewProps {
  onRetry: () => void;
}

export const ErrorView: React.FC<ErrorViewProps> = ({ onRetry }) => {
  return (
    <View
      style={styles.container}
      accessible={true}
      accessibilityLiveRegion="assertive"
    >
      <View style={styles.errorIcon}>
        <Text style={styles.errorIconText}>!</Text>
      </View>

      <Text style={styles.title}>Unable to load health data</Text>
      <Text style={styles.subtitle}>Please check your connection and try again</Text>

      <TouchableOpacity
        style={styles.retryButton}
        onPress={onRetry}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel="Retry loading health data"
        activeOpacity={0.8}
      >
        <Text style={styles.retryButtonText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral[50],
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  errorIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  errorIconText: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.white,
  },
  title: {
    fontSize: typography.h3.fontSize,
    fontWeight: typography.h3.fontWeight,
    color: colors.neutral[900],
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    color: colors.neutral[500],
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  retryButton: {
    minHeight: 44,
    minWidth: 200,
    backgroundColor: colors.secondary[500],
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryButtonText: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.bodyBold.fontWeight,
    color: colors.white,
  },
});

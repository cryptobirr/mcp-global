import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { colors, spacing, typography } from './designTokens';

export const LoadingSpinner: React.FC = () => {
  return (
    <View
      style={styles.container}
      accessible={true}
      accessibilityLabel="Loading health data, please wait"
      accessibilityLiveRegion="polite"
    >
      <ActivityIndicator size="large" color={colors.secondary[500]} />
      <Text style={styles.loadingText}>Loading health data...</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral[50],
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    color: colors.neutral[500],
    textAlign: 'center',
  },
});

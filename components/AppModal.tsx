import React, { useMemo } from 'react';
import ReactNativeModal from 'react-native-modal';
import { Platform, StyleSheet, View } from 'react-native';
import type { ViewStyle } from 'react-native';

export type AppModalProps = {
  isVisible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  backdropOpacity?: number;
  useNativeDriver?: boolean;
  avoidKeyboard?: boolean;
  contentStyle?: ViewStyle;
  testID?: string;
};

export function AppModal({
  isVisible,
  onClose,
  children,
  backdropOpacity = 0.4,
  useNativeDriver = true,
  avoidKeyboard = true,
  contentStyle,
  testID,
}: AppModalProps) {
  const shouldUseNativeDriver = useMemo(() => {
    if (Platform.OS === 'android') {
      return false;
    }
    return useNativeDriver;
  }, [useNativeDriver]);

  return (
    <ReactNativeModal
      isVisible={isVisible}
      onBackdropPress={onClose}
      onBackButtonPress={onClose}
      backdropOpacity={backdropOpacity}
      backdropTransitionOutTiming={0}
      useNativeDriver={shouldUseNativeDriver}
      useNativeDriverForBackdrop={shouldUseNativeDriver}
      avoidKeyboard={avoidKeyboard}
      propagateSwipe
      swipeDirection={[ 'down' ]}
      onSwipeComplete={onClose}
      style={styles.modal}
      testID={testID}
      statusBarTranslucent>
      <View style={[styles.content, contentStyle]}>{children}</View>
    </ReactNativeModal>
  );
}

const styles = StyleSheet.create({
  modal: {
    margin: 0,
    justifyContent: 'flex-end',
  },
  content: {
    width: '100%',
  },
});

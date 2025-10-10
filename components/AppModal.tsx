import React from 'react';
import ReactNativeModal from 'react-native-modal';
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
  return (
    <ReactNativeModal
      isVisible={isVisible}
      onBackdropPress={onClose}
      onBackButtonPress={onClose}
      backdropOpacity={backdropOpacity}
      useNativeDriver={useNativeDriver}
      useNativeDriverForBackdrop={useNativeDriver}
      avoidKeyboard={avoidKeyboard}
      style={{ margin: 0 }}
      propagateSwipe
      testID={testID}
      statusBarTranslucent>
      {children}
    </ReactNativeModal>
  );
}

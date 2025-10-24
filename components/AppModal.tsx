import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';

export type AppModalProps = {
  isVisible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  backdropOpacity?: number;
  avoidKeyboard?: boolean;
  contentStyle?: ViewStyle;
  testID?: string;
};

export function AppModal({
  isVisible,
  onClose,
  children,
  backdropOpacity = 0.4,
  avoidKeyboard = true,
  contentStyle,
  testID,
}: AppModalProps) {
  if (!isVisible) {
    return null;
  }

  const SheetWrapper = avoidKeyboard ? KeyboardAvoidingView : View;
  const sheetWrapperProps = avoidKeyboard
    ? ({ behavior: Platform.OS === 'ios' ? 'padding' : undefined } as const)
    : ({} as const);
  const overlayColor = `rgba(15, 23, 42, ${backdropOpacity})`;

  return (
    <Modal
      transparent
      visible
      animationType="fade"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent>
      <View style={styles.overlay} pointerEvents="box-none">
        <Pressable
          style={[styles.backdrop, { backgroundColor: overlayColor }]}
          onPress={onClose}
          testID={testID && `${testID}-backdrop`}
        />
        <SheetWrapper
          style={[styles.sheetWrapper, contentStyle]}
          {...sheetWrapperProps}
          pointerEvents="box-none"
          testID={testID}>
          {children}
        </SheetWrapper>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
  },
  sheetWrapper: {
    flex: 1,
    width: '100%',
    alignSelf: 'stretch',
    justifyContent: 'flex-end',
    alignItems: 'stretch',
  },
});

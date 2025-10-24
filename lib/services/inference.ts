import { NativeModules } from 'react-native';

type InferenceResult = {
  score: number;
  matches: Array<{ label: string; excerpt?: string }>;
  risk?: { severity: 'high' | 'medium' | 'low' | 'safe' };
};

const { InferenceModule } = NativeModules as any;

export const analyzeNotificationNative = async (text: string): Promise<InferenceResult> => {
  if (!InferenceModule || !InferenceModule.analyzeNotification) {
    throw new Error('InferenceModule not available');
  }

  const res = await InferenceModule.analyzeNotification(text);
  return res as InferenceResult;
};

export default { analyzeNotificationNative };

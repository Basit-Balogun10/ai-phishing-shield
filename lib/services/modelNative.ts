import { NativeModules } from 'react-native';

const { InferenceModule } = NativeModules as { InferenceModule?: any };

// Thin wrapper around the native inference module methods. Keeps calls optional so JS can run
// in environments where the native module isn't present (web / unbuilt dev).

export async function activateModel(
  modelPath: string | null,
  tokenizerPath: string | null,
  metadataPath: string | null
): Promise<boolean> {
  if (!InferenceModule || typeof InferenceModule.activateModel !== 'function') {
    // Native module not present; resolve false so callers can fallback
    return false;
  }

  try {
    const res = await InferenceModule.activateModel(modelPath ?? '', tokenizerPath ?? '', metadataPath ?? '');
    return Boolean(res);
  } catch (e) {
    // bubble up a useful error shape
    throw e;
  }
}

export async function analyzeNotification(text: string): Promise<any> {
  if (!InferenceModule || typeof InferenceModule.analyzeNotification !== 'function') {
    throw new Error('Native inference module not available');
  }
  return InferenceModule.analyzeNotification(text);
}

export default {
  activateModel,
  analyzeNotification,
};

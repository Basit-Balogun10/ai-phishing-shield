/*
	Clean notification listener wrapper
	- Single, well-formed implementation replacing older merged content
	- Dynamic native require so development/CI works without the native module
	- Safe no-op on non-Android platforms
	- Exports: init(), isPermissionGranted(), requestPermission(), start(), stop(), onNotification(cb), offNotification(cb)
*/

import { NativeEventEmitter, Platform, AppState } from 'react-native';

export type NotificationPayload = {
	time?: string;
	app?: string;
	title?: string;
	titleBig?: string;
	text?: string;
	subText?: string;
	summaryText?: string;
	bigText?: string;
	extraInfoText?: string;
	groupedMessages?: { title?: string; text?: string }[];
	icon?: string;
	image?: string;
	[k: string]: any;
};

let nativeModule: any = null;
let eventEmitter: NativeEventEmitter | null = null;
let subscription: any = null;
const listeners = new Set<(n: NotificationPayload) => void>();
let initialized = false;

async function _loadNative(): Promise<void> {
	if (nativeModule || Platform.OS !== 'android') return;
	try {
		// Try the recommended external native package first (dynamic import)
		const mod = await import('react-native-android-notification-listener');
		nativeModule = (mod && (mod.default || mod)) || mod;
		if (nativeModule) {
			eventEmitter = new NativeEventEmitter(nativeModule);
			return;
		}
	} catch (err) {
		console.debug('[notificationListener] external native module not available', err);
	}

	try {
		// Fallback: use an in-repo/native module registered on NativeModules
		const RN = await import('react-native');
		const { NativeModules } = RN as any;
		const bridge = NativeModules && (NativeModules.NotificationBridge || NativeModules.NotificationListener);
		if (bridge) {
			nativeModule = bridge;
			eventEmitter = new NativeEventEmitter(nativeModule);
			return;
		}
	} catch (err) {
		console.debug('[notificationListener] fallback native bridge not available', err);
	}

	nativeModule = null;
	eventEmitter = null;
}

function _forwardEvent(raw: any) {
	const payload = raw?.notification || raw;
	listeners.forEach((cb) => {
		try {
			cb(payload);
		} catch (err) {
			// swallow listener errors to avoid crashing host app
			console.warn('[notificationListener] listener error', err);
		}
	});
}

const NotificationListener = {
	async init() {
		if (initialized) return;
		await _loadNative();
		initialized = true;
	},

	async isPermissionGranted(): Promise<boolean> {
		if (Platform.OS !== 'android') return false;
		await _loadNative();
		try {
			if (!nativeModule || typeof nativeModule.getPermissionStatus !== 'function') return false;
			const status = await nativeModule.getPermissionStatus();
			return status === 'authorized' || status === 'granted' || status === 'allowed';
		} catch (err) {
			console.debug('[notificationListener] isPermissionGranted error', err);
			return false;
		}
	},

	async requestPermission(): Promise<void> {
		if (Platform.OS !== 'android') return;
		await _loadNative();
		try {
			if (!nativeModule || typeof nativeModule.requestPermission !== 'function') return;
			await nativeModule.requestPermission();
		} catch (err) {
			console.debug('[notificationListener] requestPermission error', err);
		}
	},

	async start(): Promise<void> {
		if (Platform.OS !== 'android') return;
		await _loadNative();
		if (!nativeModule || !eventEmitter) return;

		if (!subscription) {
			// subscribe to both common event names so we interoperate with different native implementations
			try {
				eventEmitter.addListener('notification', _forwardEvent);
				eventEmitter.addListener('NotificationPosted', _forwardEvent);
			} catch (err) {
				console.debug('[notificationListener] failed to add listeners', err);
			}

			subscription = {
				remove: () => {
					try {
						if (eventEmitter && typeof (eventEmitter as any).removeAllListeners === 'function') {
							(eventEmitter as any).removeAllListeners('notification');
							(eventEmitter as any).removeAllListeners('NotificationPosted');
						}
					} catch (err) {
						console.debug('[notificationListener] remove listeners failed', err);
					}
				},
			};
		}

		try {
			if (typeof nativeModule.start === 'function') {
				await nativeModule.start();
			}
		} catch (err) {
			console.debug('[notificationListener] native start failed', err);
		}
	},

	async stop(): Promise<void> {
		try {
			if (subscription && typeof subscription.remove === 'function') {
				subscription.remove();
			}
			subscription = null;
			if (nativeModule && typeof nativeModule.stop === 'function') {
				await nativeModule.stop();
			}
		} catch (err) {
			console.debug('[notificationListener] stop failed', err);
		}
	},

	onNotification(cb: (n: NotificationPayload) => void) {
		listeners.add(cb);
		return () => {
			listeners.delete(cb);
		};
	},

	offNotification(cb: (n: NotificationPayload) => void) {
		listeners.delete(cb);
	},
};

// Stop listener when app goes to background to conserve resources. App-level
// code should start() when appropriate (e.g., when the shield is enabled).
try {
	AppState.addEventListener('change', (state) => {
		try {
			if (state === 'background') {
				void NotificationListener.stop();
			}
		} catch (e) {
			console.debug('[notificationListener] AppState handler error', e);
		}
	});
} catch (e) {
	console.debug('[notificationListener] AppState.addEventListener not supported', e);
}

export default NotificationListener;
 

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
	groupedMessages?: Array<{ title?: string; text?: string }>;
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
		// dynamic require so projects without the native dep still run JS-only flows
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const mod = require('react-native-android-notification-listener');
		nativeModule = mod && (mod.default || mod);
		// create an event emitter bound to the native module (if present)
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const RN = require('react-native');
		if (nativeModule && RN && RN.NativeEventEmitter) {
			eventEmitter = new RN.NativeEventEmitter(nativeModule);
		}
	} catch (err) {
		nativeModule = null;
		eventEmitter = null;
	}
}

function _forwardEvent(raw: any) {
	const payload = raw?.notification || raw;
	listeners.forEach((cb) => {
		try {
			cb(payload);
		} catch (err) {
			// swallow listener errors to avoid crashing host app
			// eslint-disable-next-line no-console
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
			// ignore
		}
	},

	async start(): Promise<void> {
		if (Platform.OS !== 'android') return;
		await _loadNative();
		if (!nativeModule || !eventEmitter) return;

		if (!subscription) {
			subscription = eventEmitter.addListener('notification', _forwardEvent);
		}

		try {
			if (typeof nativeModule.start === 'function') {
				await nativeModule.start();
			}
		} catch (err) {
			// ignore start errors from native side
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
			// ignore
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
			// ignore
		}
	});
} catch (e) {
	// older RN versions may not support AppState.addEventListener in the same way
}

export default NotificationListener;
 

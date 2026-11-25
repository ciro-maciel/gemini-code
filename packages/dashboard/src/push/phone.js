import { removePush, savePush } from '../services/api'

// Phone notifications from the panel: the service worker receives them, the
// central keeps one subscription per device. iOS only offers it once the panel
// is on the home screen.

export const canPush = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

/** The VAPID key as the bytes PushManager wants. */
export function keyBytes(base64url) {
    const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
    return Uint8Array.from(atob(base64), char => char.charCodeAt(0))
}

const registration = () => navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready)

export async function currentSubscription() {
    if (!canPush()) return null
    return (await registration()).pushManager.getSubscription()
}

/** Asks the person, subscribes this device and tells the central; false when they said no. */
export async function turnOn(publicKey) {
    if ((await Notification.requestPermission()) !== 'granted') return false
    const subscription = await (await registration()).pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) })
    await savePush(subscription.toJSON())
    return true
}

export async function turnOff() {
    const subscription = await currentSubscription()
    if (!subscription) return
    await removePush(subscription.endpoint)
    await subscription.unsubscribe()
}

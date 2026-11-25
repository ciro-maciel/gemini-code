// The panel's service worker: only phone notifications. A notice says who
// needs the person or what was delivered, and a tap opens that agent.
self.addEventListener('push', event => {
    const notice = event.data ? event.data.json() : {}
    event.waitUntil(
        self.registration.showNotification(notice.title || 'Assistant', {
            body: notice.body || '',
            tag: notice.tag,
            icon: '/images/icon-512.png',
            data: { url: notice.url || '/' },
        })
    )
})

self.addEventListener('notificationclick', event => {
    event.notification.close()
    const url = new URL(event.notification.data?.url || '/', self.location.origin).href
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
            const open = windows.find(client => client.url.startsWith(self.location.origin))
            if (open) return open.focus().then(client => client.navigate(url))
            return self.clients.openWindow(url)
        })
    )
})

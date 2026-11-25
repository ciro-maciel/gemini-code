import { describe, expect, test } from 'bun:test'

import { keyBytes } from './phone'

describe('the VAPID key for PushManager', () => {
    test('base64url without padding becomes its bytes', () => {
        expect([...keyBytes('AQID_-8')]).toEqual([1, 2, 3, 255, 239])
    })
})

import { afterEach, describe, expect, test } from 'bun:test'
import { createPlan, tierFromSlugs } from './plan.js'

const realFetch = globalThis.fetch
afterEach(() => {
    globalThis.fetch = realFetch
})

const answer = body => {
    globalThis.fetch = async () => new Response(JSON.stringify(body), { status: 200 })
}
const SPACE = { one: 'agente', many: 'agentes' }
const ON = { PAYMENTS_SECRET_KEY: 'pmr_test', PAYMENTS_API_URL: 'https://payments.test' }

describe('the plan gate', () => {
    test('the largest slug of this product wins, and another product does not count', () => {
        expect(tierFromSlugs('assistant', new Set(['assistant-plan-starter', 'assistant-plan-pro'])).limit).toBe(9)
        expect(tierFromSlugs('assistant', new Set(['brain-plan-scale'])).limit).toBe(1)
    })

    test('a free account is refused its second space with PLAN_LIMIT', async () => {
        answer({ hasActiveSubscription: false, features: [] })
        const gate = await createPlan({ product: 'assistant' }).canCreate(ON, 'u1', 1, SPACE)
        expect(gate.allowed).toBe(false)
        expect(gate.body.code).toBe('PLAN_LIMIT')
        expect(gate.body.message).toContain('Billing')
    })

    test('a Starter account keeps creating up to three', async () => {
        answer({ hasActiveSubscription: true, features: [{ slug: 'assistant-plan-starter' }] })
        const plan = createPlan({ product: 'assistant' })
        expect((await plan.canCreate(ON, 'u1', 2, SPACE)).allowed).toBe(true)
        expect((await plan.canCreate(ON, 'u1', 3, SPACE)).allowed).toBe(false)
    })

    test('PLAN_LIMITS off refuses nothing, and still reads the plan', async () => {
        answer({ hasActiveSubscription: false, features: [] })
        const gate = await createPlan({ product: 'assistant' }).canCreate({ ...ON, PLAN_LIMITS: 'off' }, 'u1', 50, SPACE)
        expect(gate.allowed).toBe(true)
        expect(gate.plan).toMatchObject({ tier: 'free', limit: 1, isKnown: true, isEnforced: false })
    })

    test('Payments down lets the account through', async () => {
        globalThis.fetch = async () => {
            throw new Error('down')
        }
        expect((await createPlan({ product: 'assistant' }).canCreate(ON, 'u1', 50, SPACE)).allowed).toBe(true)
    })
})

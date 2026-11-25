import { lazy, Suspense } from 'react'
import { Skeleton } from '@mantine/core'

// noVNC is most of the bundle, and most visits never open the screen: it
// loads the first time a screen is shown.
const LiveScreenModule = lazy(() => import('./LiveScreen').then(module => ({ default: module.LiveScreen })))

export function LiveScreen(props) {
    return (
        <Suspense
            fallback={
                <Skeleton
                    h={props.height ?? 420}
                    radius={0}
                />
            }
        >
            <LiveScreenModule {...props} />
        </Suspense>
    )
}

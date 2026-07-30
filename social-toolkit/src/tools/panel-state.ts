/**
 * Returns whether the viewport is at least the md breakpoint.
 * @returns True on desktop-width viewports
 */
const isDesktop = (): boolean => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches

/**
 * Initial panel open state — open on desktop, closed on mobile.
 * @returns Whether the controls panel should start open
 */
export const initialPanelOpen = (): boolean => isDesktop()

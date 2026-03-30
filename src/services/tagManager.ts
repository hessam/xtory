/**
 * Google Tag Manager helper utilities.
 *
 * GTM itself is initialized in index.html using Vite's %VITE_GTM_ID% env
 * substitution — this ensures the container is present in the raw HTML
 * before any JS executes, which is required for:
 *   - GTM Preview / Debug Mode
 *   - Google's Tag Assistant
 *   - Bot & crawler detection
 *
 * This file only provides runtime helpers for interacting with the
 * already-running GTM dataLayer.
 */

/**
 * Pushes a custom event to the GTM dataLayer.
 * Safe to call even if GTM hasn't initialized yet — events will queue.
 *
 * @example
 * pushToDataLayer('ai_search_start', { query: 'Achaemenid Empire' });
 * pushToDataLayer('region_selected', { region: 'Fars', era: 'ancient' });
 */
export const pushToDataLayer = (event: string, payload?: Record<string, unknown>) => {
  if (typeof window === 'undefined') return;
  // Initialize dataLayer if it doesn't exist yet (safe guard)
  (window as any).dataLayer = (window as any).dataLayer || [];
  (window as any).dataLayer.push({ event, ...payload });

  // --- Engagement Tracking Logic ---
  // Count interactions in the current browser session
  try {
    const MILESTONE_TARGET = 10;
    const currentCount = parseInt(sessionStorage.getItem('xtory_interactions') || '0', 10) + 1;
    sessionStorage.setItem('xtory_interactions', currentCount.toString());

    // If they hit the target and haven't fired the milestone yet this session
    if (currentCount >= MILESTONE_TARGET && !sessionStorage.getItem('xtory_milestone_fired')) {
      (window as any).dataLayer.push({ 
        event: 'deep_exploration_milestone',
        total_interactions: currentCount,
        milestone_name: 'Engaged Explorer'
      });
      sessionStorage.setItem('xtory_milestone_fired', 'true');
    }
  } catch (e) {
    // Silently fail if sessionStorage is blocked (private mode)
  }
};

/**
 * Tracks a virtual pageview — useful for SPA route changes.
 */
export const trackPageView = (path: string, title?: string) => {
  pushToDataLayer('virtualPageView', {
    page_path: path,
    page_title: title ?? document.title,
  });
};

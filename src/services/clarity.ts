import Clarity from '@microsoft/clarity';

/**
 * Initializes Microsoft Clarity with the project ID from environment variables.
 * Initialized with a slight delay and using requestIdleCallback to ensure
 * it doesn't impact the initial Lighthouse scores or First Contentful Paint.
 */
export const initClarity = () => {
  // Check if we are in a browser environment
  if (typeof window === 'undefined') return;

  const init = () => {
    const projectId = import.meta.env.VITE_CLARITY_PROJECT_ID;

    if (projectId && projectId !== 'your_project_id_here') {
      try {
        Clarity.init(projectId);
      } catch (err) {
        console.warn('Failed to initialize Microsoft Clarity:', err);
      }
    }
  };

  const scheduleInitialization = () => {
    // Increased delay to 3 seconds to ensure zero impact on initial TBT/INP.
    setTimeout(init, 3000);
  };

  // If already loaded, schedule; otherwise wait for load event
  if (document.readyState === 'complete') {
    scheduleInitialization();
  } else {
    window.addEventListener('load', scheduleInitialization, { once: true });
  }
};

/**
 * Tracks a custom event in Microsoft Clarity.
 */
export const trackClarityEvent = (name: string) => {
  try {
    Clarity.event(name);
  } catch (err) {
    // Silent fail if not initialized
  }
};

/**
 * Identifies a user in Microsoft Clarity.
 */
export const identifyClarityUser = (id: string, sessionId?: string, pageId?: string, name?: string) => {
  try {
    Clarity.identify(id, sessionId, pageId, name);
  } catch (err) {
    // Silent fail
  }
};

export default Clarity;

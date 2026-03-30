/**
 * Initializes Google Tag Manager (GTM) with the Container ID from environment variables.
 * Standard GTM installation involves two parts: a Head script and a Body noscript.
 */
export const initGTM = () => {
  // Check if we are in a browser environment
  if (typeof window === 'undefined') return;

  const gtmId = import.meta.env.VITE_GTM_ID;

  if (gtmId) {
    const init = () => {
      // 1. Google Tag Manager (Script)
      // Standard snippet adjusted for programmatic injection
      const gtmScript = document.createElement('script');
      gtmScript.id = 'gtm-script';
      gtmScript.innerHTML = `
        (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
        new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
        j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
        'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
        })(window,document,'script','dataLayer','${gtmId}');
      `;
      document.head.appendChild(gtmScript);

      // 2. Google Tag Manager (Noscript fallback)
      // Though this is a React app and usually requires JS, sticking to GTM best practices
      const gtmNoScript = document.createElement('noscript');
      const gtmIframe = document.createElement('iframe');
      gtmIframe.src = `https://www.googletagmanager.com/ns.html?id=${gtmId}`;
      gtmIframe.height = '0';
      gtmIframe.width = '0';
      gtmIframe.style.display = 'none';
      gtmIframe.style.visibility = 'hidden';
      gtmNoScript.appendChild(gtmIframe);
      document.body.insertBefore(gtmNoScript, document.body.firstChild);
    };

    // Initialize immediately when called to ensure Tag Manager Preview can detect it
    init();
  }
};

/**
 * Pushes a custom event to the GTM Data Layer.
 * Use this for conversion tracking, search monitoring, etc.
 */
export const pushToDataLayer = (event: string, payload?: object) => {
  if (typeof window !== 'undefined' && (window as any).dataLayer) {
    (window as any).dataLayer.push({
      event,
      ...payload
    });
  }
};

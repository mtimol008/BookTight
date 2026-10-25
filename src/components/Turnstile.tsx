"use client";

import { useEffect, useId, useRef } from "react";
import Script from "next/script";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
        }
      ) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

/**
 * Renders a Turnstile widget and reports its token up via onToken (null
 * while unsolved, expired, or errored). The caller is responsible for
 * putting the token in a hidden form field — this component only handles
 * the widget itself, not form wiring, so it can be reused across signup,
 * login, and the password-reset request form.
 */
export function Turnstile({ onToken }: { onToken: (token: string | null) => void }) {
  const rawId = useId();
  const containerId = `turnstile-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    function renderWidget() {
      if (!window.turnstile || widgetIdRef.current) return;
      const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
      if (!siteKey) return;
      widgetIdRef.current = window.turnstile.render(`#${containerId}`, {
        sitekey: siteKey,
        callback: (token) => onToken(token),
        "expired-callback": () => onToken(null),
        "error-callback": () => onToken(null),
      });
    }

    if (window.turnstile) {
      renderWidget();
      return;
    }
    window.addEventListener("turnstile-loaded", renderWidget);
    return () => window.removeEventListener("turnstile-loaded", renderWidget);
  }, [containerId, onToken]);

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
        onLoad={() => window.dispatchEvent(new Event("turnstile-loaded"))}
      />
      <div id={containerId} />
    </>
  );
}

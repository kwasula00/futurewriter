"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      remove: (widgetId: string) => void;
    };
  }
}

export function TurnstileWidget() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [token, setToken] = useState("");

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !SITE_KEY) return;

    let widgetId: string | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;

    const tryRender = () => {
      if (widgetId !== undefined) return true;
      if (!window.turnstile) return false;
      widgetId = window.turnstile.render(container, {
        sitekey: SITE_KEY,
        theme: "auto",
        // Explicit rendering does not add the token to the form for us, so we
        // capture it here and submit it through the hidden input below.
        callback: (value: string) => setToken(value),
        "expired-callback": () => setToken(""),
        "error-callback": () => setToken(""),
      });
      return true;
    };

    // The script may not have finished loading yet, so poll until it is ready.
    if (!tryRender()) {
      timer = setInterval(() => {
        if (tryRender() && timer) clearInterval(timer);
      }, 200);
    }

    return () => {
      if (timer) clearInterval(timer);
      if (widgetId !== undefined) window.turnstile?.remove(widgetId);
    };
  }, []);

  if (!SITE_KEY) {
    return (
      <p className="rounded-lg border border-dashed border-black/[.15] px-3 py-2 text-xs text-zinc-500 dark:border-white/[.2] dark:text-zinc-400">
        CAPTCHA is disabled. Add NEXT_PUBLIC_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY to enable it.
      </p>
    );
  }

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
      />
      <div ref={containerRef} />
      <input type="hidden" name="turnstileToken" value={token} />
    </>
  );
}

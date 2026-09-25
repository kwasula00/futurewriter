const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Cloudflare Turnstile server-side verification.
 *
 * Without `TURNSTILE_SECRET_KEY` the check is skipped in development so the
 * signup flow stays testable. In production a missing key rejects every
 * submission rather than silently letting bots through.
 */
export async function verifyTurnstile(token: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.error("TURNSTILE_SECRET_KEY is not set - rejecting submission.");
      return false;
    }
    console.warn("TURNSTILE_SECRET_KEY is not set - skipping CAPTCHA verification.");
    return true;
  }

  if (!token) {
    return false;
  }

  try {
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token }),
    });

    if (!response.ok) {
      return false;
    }

    const result = (await response.json()) as {
      success?: boolean;
      "error-codes"?: string[];
    };

    if (result.success !== true) {
      console.error("Turnstile rejected the token", result["error-codes"]);
    }

    return result.success === true;
  } catch (error) {
    console.error("Turnstile verification request failed", error);
    return false;
  }
}
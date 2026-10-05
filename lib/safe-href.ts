/** Returns the URL only when it is absolute https, so a provider-supplied value can never become a javascript: or data: href. */
export const safeHref = (u: string | null): string | null => (u && /^https:\/\//i.test(u) ? u : null)

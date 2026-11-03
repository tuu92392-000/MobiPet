// Per-viewer conveniences only (remembered invite, name, language). Safe if storage is unavailable.
export function readPref(key: string): string | null {
  try {
    return window.localStorage.getItem(`family.${key}`);
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(`family.${key}`);
    else window.localStorage.setItem(`family.${key}`, value);
  } catch {
    // Private mode or blocked storage: the page still works without it.
  }
}

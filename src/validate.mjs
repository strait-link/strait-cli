// Input checks for `strait init`. Each throws a UsageError with a message a person
// can act on; the CLI prints it and exits 2.

export class UsageError extends Error {}

const PUB_KEY = /^st_pub_(live|test)_[A-Za-z0-9]{8,}$/;
const SECRET_KEY = /^st_(live|test)_/;
const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/** A publishable key (st_pub_live_…). A secret key is refused: it must never ship in an app. */
export function normalizeKey(value) {
  const k = String(value ?? '').trim();
  if (!k) throw new UsageError('A publishable key is required (--key st_pub_live_…). Find it in Dashboard → Get started.');
  if (SECRET_KEY.test(k)) {
    throw new UsageError(
      'That is a secret key (st_live_…). Apps must use the publishable key (st_pub_live_…) from Dashboard → Get started. ' +
        'If the secret key was pasted somewhere public, rotate it in Dashboard → Settings → Secret keys.',
    );
  }
  if (!PUB_KEY.test(k)) throw new UsageError(`"${k}" is not a publishable key. It starts with st_pub_live_ (Dashboard → Get started).`);
  return k;
}

/** "https://Acme.strait.link/summer" → "acme.strait.link". */
export function normalizeHost(value) {
  let h = String(value ?? '').trim().toLowerCase();
  if (!h) throw new UsageError('A link host is required (--host acme.strait.link). It is your workspace link domain in Dashboard → Get started.');
  h = h.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/[/?#].*$/, '').replace(/\.$/, '');
  const labels = h.split('.');
  if (h.length > 253 || labels.length < 2 || !labels.every((l) => LABEL.test(l)) || !/^[a-z]{2,}$/.test(labels.at(-1))) {
    throw new UsageError(`"${value}" is not a link host. Use your link domain, for example acme.strait.link.`);
  }
  return h;
}

/** A custom URL scheme such as "acmeshop". */
export function normalizeScheme(value) {
  const s = String(value ?? '').trim().toLowerCase().replace(/:\/*$/, '');
  if (!/^[a-z][a-z0-9+.-]{1,63}$/.test(s) || ['http', 'https', 'intent', 'file', 'javascript', 'data'].includes(s)) {
    throw new UsageError(`"${value}" can't be your app's custom scheme. Use a short lowercase word, for example acmeshop.`);
  }
  return s;
}

/** A scheme guess from the Android package or app name: "com.acme.shop" → "acmeshop". */
export function suggestScheme({ scheme, androidPackage, appName } = {}) {
  if (scheme) return scheme;
  const parts = androidPackage?.split('.') ?? [];
  const fromPkg = (parts.length > 1 && /^(com|org|net|io|dev|co|in|app|me)$/.test(parts[0]) ? parts.slice(1) : parts).join('').slice(0, 30);
  for (const c of [fromPkg, appName]) {
    const s = String(c ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (/^[a-z][a-z0-9]{1,}$/.test(s) && !['app', 'android', 'mobile', 'example'].includes(s)) return s;
  }
  return null;
}

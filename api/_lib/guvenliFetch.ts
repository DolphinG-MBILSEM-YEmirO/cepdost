// SSRF-safe fetch for user-supplied URLs (the .ics proxy and link unfurling).
//
// These routes run inside Vercel's network. Fetching whatever URL a caller
// sends would let them reach internal services and cloud metadata endpoints
// through us, so every URL is checked before it is fetched:
// - http/https only, default ports (80/443) only;
// - local-only hostnames (localhost, *.internal, ...) are refused;
// - the hostname is resolved and EVERY address must be public unicast;
// - redirects are followed by hand and each hop is checked the same way.
//
// Known limit: fetch resolves the hostname again when it connects, so a DNS
// server that answers differently a second time (DNS rebinding) can still
// slip through. Global fetch offers no hook to pin the checked address;
// closing that gap would need node:http(s) with a custom `lookup`. The port
// restriction keeps what such an attack could reach small.

import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

// The URL itself is unacceptable (scheme, port, private address). Callers
// answer 400; other errors (DNS failure, timeout, too many redirects) are
// "could not reach" and answer 502.
export class GuvenliOlmayanAdresHatasi extends Error {
  name = 'GuvenliOlmayanAdresHatasi'
}

const AZAMI_YONLENDIRME = 5

// Hostnames that only mean something on a local network.
function yerelHostAdiMi(host: string): boolean {
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.internal') ||
    host.endsWith('.local') ||
    host.endsWith('.home.arpa')
  )
}

function ipv4Oktetleri(ip: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip)
  if (!m) return null
  const oktetler = m.slice(1).map(Number)
  return oktetler.every((o) => o <= 255) ? oktetler : null
}

function ipv4OzelMi([a, b, c]: number[]): boolean {
  if (a === 0 || a === 10 || a === 127) return true // "this network", private, loopback
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  if (a === 169 && b === 254) return true // link-local, cloud metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true // IETF assignments, TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true // benchmarking
  if (a === 198 && b === 51 && c === 100) return true // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true // TEST-NET-3
  if (a >= 224) return true // multicast, reserved, broadcast
  return false
}

// Expands an IPv6 literal to its eight 16-bit groups, including the dotted
// IPv4 tail form (::ffff:127.0.0.1). Returns null if it does not parse.
function ipv6Gruplari(ip: string): number[] | null {
  let h = ip.toLowerCase()
  const bolge = h.indexOf('%') // zone id, as in fe80::1%eth0
  if (bolge >= 0) h = h.slice(0, bolge)

  let kuyruk: number[] = []
  const v4 = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(h)
  if (v4) {
    const o = ipv4Oktetleri(v4[1])
    if (!o) return null
    kuyruk = [(o[0] << 8) | o[1], (o[2] << 8) | o[3]]
    h = h.slice(0, -v4[1].length)
    if (h.endsWith(':') && !h.endsWith('::')) h = h.slice(0, -1)
  }

  const grupla = (s: string): number[] =>
    s === '' ? [] : s.split(':').map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN))

  const yarilar = h.split('::')
  let gruplar: number[]
  if (yarilar.length === 1) {
    gruplar = [...grupla(h), ...kuyruk]
  } else if (yarilar.length === 2) {
    const bas = grupla(yarilar[0])
    const son = [...grupla(yarilar[1]), ...kuyruk]
    const eksik = 8 - bas.length - son.length
    if (eksik < 1) return null
    gruplar = [...bas, ...new Array<number>(eksik).fill(0), ...son]
  } else {
    return null
  }

  return gruplar.length === 8 && gruplar.every((g) => !Number.isNaN(g)) ? gruplar : null
}

function gomuluIpv4(ust: number, alt: number): number[] {
  return [ust >> 8, ust & 0xff, alt >> 8, alt & 0xff]
}

function ipv6OzelMi(g: number[]): boolean {
  if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0) {
    // ::/96 (unspecified ::, loopback ::1, IPv4-compatible) and
    // ::ffff:0:0/96 (IPv4-mapped) carry an IPv4 in the low 32 bits: judge
    // that. The rest of ::/64 is not public unicast.
    if (g[4] === 0 && (g[5] === 0 || g[5] === 0xffff)) return ipv4OzelMi(gomuluIpv4(g[6], g[7]))
    return true
  }
  // NAT64 (64:ff9b::/96) also embeds an IPv4; the local-use /48 is private.
  if (g[0] === 0x64 && g[1] === 0xff9b) {
    if (g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0) return ipv4OzelMi(gomuluIpv4(g[6], g[7]))
    return g[2] === 1
  }
  if (g[0] === 0x100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return true // discard-only 100::/64
  if (g[0] === 0x2001 && (g[1] === 0 || g[1] === 0xdb8)) return true // Teredo, documentation
  if (g[0] === 0x2002) return ipv4OzelMi(gomuluIpv4(g[1], g[2])) // 6to4 embeds an IPv4
  if ((g[0] & 0xfe00) === 0xfc00) return true // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
  if ((g[0] & 0xffc0) === 0xfec0) return true // fec0::/10 site-local (deprecated)
  if ((g[0] & 0xff00) === 0xff00) return true // ff00::/8 multicast
  return false
}

// True for any address we must not connect to. Only IP literals are judged
// here; the fc/fd/fe80 prefixes are IPv6 ranges, so a hostname such as
// "fdx.com" never reaches these checks. Unparseable input fails closed.
export function ipOzelMi(ip: string): boolean {
  const aile = isIP(ip)
  if (aile === 4) {
    const oktetler = ipv4Oktetleri(ip)
    return oktetler ? ipv4OzelMi(oktetler) : true
  }
  if (aile === 6) {
    const gruplar = ipv6Gruplari(ip)
    return gruplar ? ipv6OzelMi(gruplar) : true
  }
  return true
}

// Rejects as soon as `signal` aborts; dns.lookup takes no signal itself.
function iptalliBekle<T>(is: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason)
  return new Promise<T>((coz, reddet) => {
    const iptal = () => reddet(signal.reason)
    signal.addEventListener('abort', iptal, { once: true })
    is.then(coz, reddet).finally(() => signal.removeEventListener('abort', iptal))
  })
}

// Throws GuvenliOlmayanAdresHatasi if `url` must not be fetched. DNS errors
// propagate as they are (the host may simply not exist).
export async function urlDogrula(url: URL, signal: AbortSignal): Promise<void> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new GuvenliOlmayanAdresHatasi('only http(s) is allowed')
  }
  // URL drops a scheme's default port, so '' covers http:80 and https:443.
  if (url.port !== '' && url.port !== '80' && url.port !== '443') {
    throw new GuvenliOlmayanAdresHatasi('port not allowed')
  }

  // URL keeps IPv6 literals in brackets and a trailing root dot on names;
  // it has already normalised odd IPv4 forms (2130706433, 0x7f.1).
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase()
  if (!host || yerelHostAdiMi(host)) throw new GuvenliOlmayanAdresHatasi('local network hostname')

  if (isIP(host)) {
    if (ipOzelMi(host)) throw new GuvenliOlmayanAdresHatasi('private address')
    return
  }

  const adresler = await iptalliBekle(lookup(host, { all: true }), signal)
  // Every address, not just the first: fetch may connect to any of them.
  if (adresler.length === 0 || adresler.some((a) => ipOzelMi(a.address))) {
    throw new GuvenliOlmayanAdresHatasi('resolves to a private address')
  }
}

export interface GuvenliFetchSecenekleri {
  headers?: Record<string, string>
  // Covers DNS, every redirect hop AND reading the body, since the same
  // signal stays attached to the returned response.
  zamanAsimiMs: number
}

// GET `adres` after the checks above, following up to five redirects by hand
// so each Location is checked before it is requested.
export async function guvenliFetch(
  adres: string | URL,
  { headers, zamanAsimiMs }: GuvenliFetchSecenekleri,
): Promise<Response> {
  const signal = AbortSignal.timeout(zamanAsimiMs)

  let url: URL
  try {
    url = new URL(adres)
  } catch {
    throw new GuvenliOlmayanAdresHatasi('invalid URL')
  }

  for (let yonlendirme = 0; ; yonlendirme++) {
    await urlDogrula(url, signal)
    const res = await fetch(url, { headers, redirect: 'manual', signal })

    const konum = res.headers.get('location')
    if (res.status < 300 || res.status > 399 || !konum) return res

    // Release the connection before moving on; the redirect body is unused.
    await res.body?.cancel().catch(() => {})
    if (yonlendirme >= AZAMI_YONLENDIRME) throw new Error('too many redirects')

    try {
      url = new URL(konum, url)
    } catch {
      throw new GuvenliOlmayanAdresHatasi('invalid redirect')
    }
  }
}

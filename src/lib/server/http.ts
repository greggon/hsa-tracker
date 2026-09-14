/**
 * Builds the `filename` part of a Content-Disposition header.
 *
 * The name comes from whatever the browser uploaded, so it reaches us as
 * untrusted text. A CR or LF would split the header; anything non-ASCII is not
 * representable in a quoted string at all; and a quote or backslash would
 * escape it. So: a sanitised ASCII fallback for `filename`, plus RFC 5987
 * `filename*` carrying the real name percent-encoded, which browsers prefer
 * when both are present.
 */
export function dispositionFilename(raw: string | null | undefined): string {
	const name = (raw ?? '').replace(/[\\/]/g, '_').trim().slice(0, 200) || 'receipt';
	const ascii = name.replace(/[^ -~]/g, '_').replace(/["\\]/g, '_');
	return `filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

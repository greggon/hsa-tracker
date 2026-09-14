import { describe, expect, it } from 'vitest';
import { dispositionFilename } from './http';

describe('dispositionFilename', () => {
	it('passes an ordinary name through both parameters', () => {
		expect(dispositionFilename('receipt.jpg')).toBe(
			'filename="receipt.jpg"; filename*=UTF-8\'\'receipt.jpg'
		);
	});

	it('falls back when there is no name', () => {
		expect(dispositionFilename(null)).toContain('filename="receipt"');
		expect(dispositionFilename('')).toContain('filename="receipt"');
		expect(dispositionFilename('   ')).toContain('filename="receipt"');
	});

	/** The filename is user input, so a newline must not be able to split the header. */
	it('cannot inject a header', () => {
		const header = dispositionFilename('a\r\nX-Evil: 1');
		expect(header).not.toMatch(/[\r\n]/);
	});

	it('cannot escape the quoted string', () => {
		const header = dispositionFilename('a".jpg');
		expect(header.match(/"/g)).toHaveLength(2);
		expect(dispositionFilename('a\\.jpg')).not.toContain('\\');
	});

	it('keeps a non-ASCII name in the encoded parameter', () => {
		const header = dispositionFilename('reçu—2026.pdf');
		// The ASCII copy is sanitised...
		expect(header).toContain('filename="re_u_2026.pdf"');
		// ...but the real name survives, percent-encoded.
		expect(header).toContain(`filename*=UTF-8''${encodeURIComponent('reçu—2026.pdf')}`);
	});

	it('strips path separators so a name cannot suggest a directory', () => {
		expect(dispositionFilename('../../etc/passwd')).toContain('filename=".._.._etc_passwd"');
	});

	it('bounds the length', () => {
		expect(dispositionFilename('a'.repeat(500))).toContain(`filename="${'a'.repeat(200)}"`);
	});
});

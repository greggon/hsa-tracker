import sharp from 'sharp';

type Rect = { left: number; top: number; width: number; height: number };

export async function makeDerivatives(buf: Buffer, rect?: Rect) {
	let base = sharp(buf, { failOn: 'none' }).rotate();

	if (rect) {
		const meta = await sharp(buf).rotate().metadata();
		const left = Math.max(0, Math.min(rect.left, (meta.width ?? 1) - 1));
		const top = Math.max(0, Math.min(rect.top, (meta.height ?? 1) - 1));
		const width = Math.min(rect.width, (meta.width ?? 1) - left);
		const height = Math.min(rect.height, (meta.height ?? 1) - top);
		if (width > 0 && height > 0) {
			base = base.extract({ left, top, width, height });
		}
	}

	const [original, web, thumb] = await Promise.all([
		base
			.clone()
			.resize(2400, 2400, { fit: 'inside', withoutEnlargement: true })
			.jpeg({ quality: 92 })
			.toBuffer(),
		base
			.clone()
			.resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
			.jpeg({ quality: 80 })
			.toBuffer(),
		base.clone().resize(240, 240, { fit: 'inside' }).jpeg({ quality: 70 }).toBuffer()
	]);

	return { original, web, thumb };
}

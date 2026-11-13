import { useEffect, useState } from 'react';

/** A temporary URL for a picked file, released when the file changes or the view goes. */
export function useObjectUrl(file?: File) {
	const [url, setUrl] = useState<string>();
	useEffect(() => {
		if (!file) return setUrl(undefined);
		const u = URL.createObjectURL(file);
		setUrl(u);
		return () => URL.revokeObjectURL(u);
	}, [file]);
	return url;
}

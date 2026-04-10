export async function createSelectionLink({ addDoc, shareCol, ids, baseUrl }) {
    const cleanIds = Array.from(new Set((ids || []).filter(Boolean)));
    if (!cleanIds.length) throw new Error('No items selected');
    const docRef = await addDoc(shareCol, { ids: cleanIds, createdAt: Date.now() });
    return `${baseUrl}?s=${docRef.id}`;
}

export async function copyTextToClipboard(text) {
    if (!text) throw new Error('No text to copy');
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
}

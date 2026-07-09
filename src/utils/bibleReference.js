export function formatBibleReference(reference, version) {
    const trimmedVersion = (version || '').trim();
    if (!reference) return '';
    if (!trimmedVersion) return reference;
    return `${reference} (${trimmedVersion})`;
}

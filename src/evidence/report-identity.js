// Keep every report preview bound to the selected investigation, never the shell fixture.
export function syncReportIdentity(root, selectedCase, sampleLabel) {
  const cover = root.querySelector('.report-preview .report-cover');
  if (!cover) return;
  const title = cover.querySelector('h3');
  const context = cover.querySelector('p');
  const rawTitle = String(selectedCase.title || 'Investigation record');
  if (title) title.textContent = sampleLabel && !/^SAMPLE\b/i.test(rawTitle)
    ? `SAMPLE ONLY - ${rawTitle}` : rawTitle;
  if (context) context.textContent = `${selectedCase.id} · Investigator evidence reconstruction`;
}

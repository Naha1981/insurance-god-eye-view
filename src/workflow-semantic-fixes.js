const evidenceHeading = document.querySelector('#evidenceRegister')?.closest('.panel-block')?.querySelector('.section-kicker');
if (evidenceHeading) evidenceHeading.textContent = 'SOURCE INTAKE';

const claimsHeading = document.querySelector('#claims')?.closest('.panel-block')?.querySelector('.section-kicker');
if (claimsHeading) claimsHeading.textContent = 'EVIDENCE-BACKED FINDINGS';

const casePill = document.querySelector('.case-pill');
const caseContextId = document.querySelector('.case-context-id');
const caseTitle = document.querySelector('.topbar h1');
if (casePill && caseContextId) {
  const syncCaseId = () => { caseContextId.textContent = casePill.textContent || 'CASE'; };
  syncCaseId();
  new MutationObserver(syncCaseId).observe(casePill, { childList: true, characterData: true, subtree: true });
}

const fitScene = document.querySelector('#fitScene');
if (fitScene) fitScene.hidden = true;

const titleSyncTarget = caseTitle;
if (titleSyncTarget) {
  const h1Observer = new MutationObserver(() => { titleSyncTarget.setAttribute('data-case-title', titleSyncTarget.textContent || ''); });
  h1Observer.observe(titleSyncTarget, { childList: true, characterData: true, subtree: true });
}

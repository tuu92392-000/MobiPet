// Dev-only accessibility audit. In the browser console run:  await __audit()
// Reports axe (WCAG 2.2 AA + best practices), touch targets under 48px, and, on patient screens, text under 20px.
import axe from 'axe-core';

const MIN_TARGET = 48;
const MIN_PATIENT_TEXT = 20;

function visible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  const s = getComputedStyle(el);
  return s.visibility !== 'hidden' && s.display !== 'none' && !el.closest('.sr-only, [aria-hidden="true"]');
}

function label(el: Element): string {
  return (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40);
}

export async function audit() {
  const result = await axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
  });
  const axeIssues = result.violations.map((v) => ({
    rule: v.id,
    impact: v.impact,
    count: v.nodes.length,
    first: v.nodes[0]?.html.slice(0, 120),
  }));

  // With a modal open, everything behind it is inert, so only the dialog counts.
  const scope: ParentNode = document.querySelector('dialog[open]') ?? document;
  // Inline text links inside sentences are exempt (WCAG 2.5.8 inline exception).
  const smallTargets = [...scope.querySelectorAll('button, a[href], input, select, textarea, summary, [role="radio"], [tabindex="0"]')]
    .filter(visible)
    .filter((el) => !(el.tagName === 'A' && getComputedStyle(el).display === 'inline'))
    .filter((el) => !(el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox') && el.closest('label')))
    .filter((el) => !['OL', 'PRE'].includes(el.tagName))
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.width < MIN_TARGET || r.height < MIN_TARGET)
    .map(({ el, r }) => `${label(el)} (${Math.round(r.width)}×${Math.round(r.height)})`);

  const patientRoot = location.pathname.startsWith('/patient/') ? document.querySelector('main') : null;
  const smallText: string[] = [];
  if (patientRoot) {
    const walker = document.createTreeWalker(patientRoot, NodeFilter.SHOW_TEXT);
    const seen = new Set<Element>();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || seen.has(el) || !n.textContent?.trim() || el.closest('svg') || !visible(el)) continue;
      seen.add(el);
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size < MIN_PATIENT_TEXT) smallText.push(`${n.textContent.trim().slice(0, 40)} (${size}px)`);
    }
  }

  return { page: location.pathname, axe: axeIssues, smallTargets, smallText };
}

(window as unknown as { __audit: typeof audit }).__audit = audit;

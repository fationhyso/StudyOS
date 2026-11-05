import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Markdown } from './ui';

const render = (content: string) => renderToStaticMarkup(createElement(Markdown, { children: content }));
describe('Markdown math previews', () => {
  it('renders inline and display LaTeX', () => {
    const html = render('Energy is $E=mc^2$.\n\n$$\n\\frac{1}{2} + \\sqrt{x}\n$$');
    expect(html).toContain('class="katex"');
    expect(html).toContain('class="katex-display"');
    expect(html).toContain('<math');
    expect(html).toContain('<mfrac>');
  });
  it('keeps fenced code as code and handles malformed math', () => {
    const html = render('```latex\n$x^2$\n```\n\n$\\unknowncommand{x}$');
    expect(html).toContain('$x^2$');
    expect(html).toContain('unknowncommand');
    expect(html).toContain('#cc0000');
  });
  it('does not execute raw HTML or trusted LaTeX extensions', () => {
    const html = render('<script>alert(1)</script>\n\n$\\href{javascript:alert(1)}{click}$');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('href="javascript:');
  });
});

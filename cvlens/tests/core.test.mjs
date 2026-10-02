import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCv, parseDate, unionLength, formatDuration, formatYears } from '../core/normalize.js';
import { renderCvSvg, renderCvTable } from '../core/render.js';
import { sampleCv } from '../core/sample.js';

const NOW = new Date('2026-10-02T00:00:00Z');
const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} is not within ${eps} of ${b}`);

test('parseDate understands the common formats', () => {
  assert.deepEqual(parseDate('2021-03'), { year: 2021, month: 3 });
  assert.deepEqual(parseDate('03/2021'), { year: 2021, month: 3 });
  assert.deepEqual(parseDate('Mar 2021'), { year: 2021, month: 3 });
  assert.deepEqual(parseDate('March 2021'), { year: 2021, month: 3 });
  assert.deepEqual(parseDate('2021'), { year: 2021, month: null });
  assert.equal(parseDate('Present'), 'ongoing');
  assert.equal(parseDate('now'), 'ongoing');
  assert.equal(parseDate(''), null);
  assert.equal(parseDate(null), null);
  assert.equal(parseDate('2021-13'), null);
  assert.equal(parseDate('sometime'), null);
  assert.equal(parseDate('1800'), null);
});

test('unionLength does not double count overlapping jobs', () => {
  near(unionLength([[2010, 2014], [2012, 2016]]), 6);
  near(unionLength([[2010, 2012], [2014, 2016]]), 4);
  near(unionLength([[2010, 2020], [2012, 2013]]), 10);
  assert.equal(unionLength([]), 0);
});

test('formatters', () => {
  assert.equal(formatDuration(1 / 12), '1m');
  assert.equal(formatDuration(1), '1y');
  assert.equal(formatDuration(2 + 3 / 12), '2y 3m');
  assert.equal(formatYears(9.166), '9.2');
  assert.equal(formatYears(12.4), '12');
});

test('sample CV normalizes to the numbers worked out by hand', () => {
  const cv = normalizeCv(sampleCv, { now: NOW });
  assert.deepEqual(cv.warnings, []);
  assert.equal(cv.stats.roles, 4);
  assert.equal(cv.stats.employers, 4);
  // 4y8m + 2y9m + 1y9m + 4m, no overlaps
  near(cv.stats.yearsExperience, 4 + 8 / 12 + 2 + 9 / 12 + 1 + 9 / 12 + 4 / 12);
  assert.equal(cv.work[0].title, 'Senior Analytics Engineer', 'newest first');
  assert.equal(cv.work[0].ongoing, true);
  const sql = cv.skills.find((s) => s.name === 'SQL');
  assert.equal(sql.roles, 3);
  near(sql.years, 4 + 8 / 12 + 2 + 9 / 12 + 1 + 9 / 12);
  assert.deepEqual(cv.extraSkills, ['Public speaking', 'Mentoring', 'German (fluent)']);
  assert.equal(cv.axis.min, 2012);
  assert.equal(cv.axis.max, 2027);
});

test('overlapping jobs and repeated skills count once', () => {
  const cv = normalizeCv(
    {
      name: 'A',
      experience: [
        { title: 'x', organization: 'One', start: '2020-01', end: '2021-12', skills: ['Go', 'go'] },
        { title: 'y', organization: 'Two', start: '2021-01', end: '2022-12', skills: ['GO'] },
      ],
    },
    { now: NOW },
  );
  near(cv.stats.yearsExperience, 3);
  assert.equal(cv.skills.length, 1);
  assert.equal(cv.skills[0].name, 'GO', 'casing from the newest role wins');
  near(cv.skills[0].years, 3);
});

test('bad input is skipped with a warning, not a crash', () => {
  const cv = normalizeCv(
    {
      name: 'B',
      experience: [
        { title: 'ok', organization: 'Fine', start: '2020', end: '2021' },
        { title: 'no date', organization: 'Nope', start: 'last spring' },
        { title: 'backwards', organization: 'Nope', start: '2022-05', end: '2021-01' },
        { start: '2020' },
        null,
        'text',
      ],
      education: 'not a list',
    },
    { now: NOW },
  );
  assert.equal(cv.work.length, 1);
  assert.equal(cv.warnings.length, 3);
  assert.ok(cv.warnings.some((w) => w.includes('no date')));
  assert.ok(cv.warnings.some((w) => w.includes('ends before it starts')));
  assert.deepEqual(cv.edu, []);
});

test('a month-long role still has a visible length, and "present" ends now', () => {
  const cv = normalizeCv(
    { name: 'C', experience: [{ title: 'Short', organization: 'X', start: '2020-03', end: '2020-03' }, { title: 'Now', organization: 'Y', start: '2026-10' }] },
    { now: NOW },
  );
  const short = cv.work.find((w) => w.title === 'Short');
  near(short.years, 1 / 12);
  const now = cv.work.find((w) => w.title === 'Now');
  assert.ok(now.ongoing);
  near(now.years, 1 / 12);
});

test('empty input yields an empty, valid structure', () => {
  const cv = normalizeCv({}, { now: NOW });
  assert.equal(cv.name, 'Unnamed');
  assert.deepEqual(cv.work, []);
  const svg = renderCvSvg(cv);
  assert.ok(svg.startsWith('<svg'));
  assert.ok(!svg.includes('NaN'));
});

test('renderCvSvg is well formed and has no NaN or undefined', () => {
  const cv = normalizeCv(sampleCv, { now: NOW });
  for (const theme of ['auto', 'light', 'dark']) {
    const svg = renderCvSvg(cv, { theme });
    assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'));
    assert.ok(!/NaN|undefined|\[object/.test(svg), `${theme} svg has a bad value`);
    assert.ok(svg.includes('Sam Rivera'));
    assert.ok(svg.includes('Career timeline'));
    assert.ok(svg.includes('Skills by years used on the job'));
  }
  assert.ok(renderCvSvg(cv, { theme: 'light' }).includes('--cvl-bg:#fcfcfb'));
  assert.ok(!renderCvSvg(cv, { theme: 'light' }).includes('prefers-color-scheme'));
  assert.ok(renderCvSvg(cv, { theme: 'auto' }).includes('prefers-color-scheme: dark'));
  assert.ok(renderCvSvg(cv, { footer: '' }).indexOf('Made with') === -1);
});

test('user text is escaped in the SVG and the table', () => {
  const cv = normalizeCv(
    {
      name: '<img src=x onerror=alert(1)> & Co',
      headline: '"quoted" <b>',
      experience: [{ title: '<script>alert(1)</script>', organization: "O'Reilly & Sons", start: '2020', skills: ['<i>x</i>'] }],
      skills: ['<u>y</u>'],
    },
    { now: NOW },
  );
  for (const html of [renderCvSvg(cv), renderCvTable(cv)]) {
    assert.ok(!/<script|<img|<b>|<i>|<u>/i.test(html), 'raw tag leaked');
  }
  assert.ok(renderCvSvg(cv).includes('&lt;script&gt;'));
});

test('long labels are truncated and many skills are capped', () => {
  const cv = normalizeCv(
    {
      name: 'N'.repeat(300),
      experience: [
        {
          title: 'A very long job title that goes on and on and on and on and on and on',
          organization: 'An equally long organization name that should never overflow its column',
          start: '2010',
          end: '2020',
          skills: Array.from({ length: 12 }, (_, i) => `Skill ${i}`),
        },
        { title: 'Second', organization: 'Other', start: '2011', end: '2012', skills: Array.from({ length: 12 }, (_, i) => `Other ${i}`) },
      ],
    },
    { now: NOW },
  );
  const svg = renderCvSvg(cv);
  assert.ok(svg.includes('…'));
  assert.ok(svg.includes('more in the table view'));
  assert.equal(cv.skills.length, 24);
});

test('renderCvTable lists every skill, including those past the chart cap', () => {
  const cv = normalizeCv(sampleCv, { now: NOW });
  const table = renderCvTable(cv);
  assert.ok(table.includes('Stakeholder management'));
  assert.ok(table.includes('Public speaking'));
  assert.equal((table.match(/<table/g) ?? []).length, 3);
});

test('the narrow layout is a 380px canvas, stays well formed and keeps every row', () => {
  const cv = normalizeCv(sampleCv, { now: NOW });
  const wide = renderCvSvg(cv, { theme: 'light' });
  const narrow = renderCvSvg(cv, { theme: 'light', layout: 'narrow' });
  assert.match(wide, /viewBox="0 0 760 /);
  assert.match(narrow, /viewBox="0 0 380 /);
  assert.ok(!/NaN|undefined|\[object/.test(narrow));
  for (const label of ['Senior Analytics Engineer', 'Operations Intern', 'MSc Statistics', 'SQL', 'Stakeholder management']) {
    assert.ok(narrow.includes(label), `${label} missing in narrow layout`);
  }
  // No text starts beyond the canvas
  for (const m of narrow.matchAll(/<text[^>]* x="([\d.]+)"/g)) assert.ok(+m[1] < 380, `text at x=${m[1]} is off the canvas`);
});

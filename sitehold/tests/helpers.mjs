let failures = 0;
let checks = 0;
export function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${name}${detail ? '  (' + detail + ')' : ''}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? '  (' + detail + ')' : ''}`); }
}
export function near(name, got, want, tol) {
  check(name, Math.abs(got - want) <= tol, `got ${got.toFixed(3)}, want ${want} +/- ${tol}`);
}
export function done(title) {
  console.log(`${title}: ${checks - failures}/${checks} passed`);
  if (failures) process.exit(1);
}

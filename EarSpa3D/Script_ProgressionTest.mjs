import assert from 'node:assert/strict';
import {COLLECTION_GRADES, TOOL_CATALOG, CaptureWaxSources, ValueWax, AppraiseHarvest, UniqueWaxPieces} from './Data_Progression.mjs';
let checks = 0;
function Check(ok, label) {assert.ok(ok, label); checks++;}
const original = [
  {id: 'dust0', mass: .075, type: 'dry', depth: 4.4, fine: true},
  {id: 0, mass: .9, type: 'dry', depth: 4.4},
  {id: 1, mass: .9, type: 'wet', depth: 4.4},
  {id: 2, mass: .9, type: 'wet', depth: 8.1},
  {id: 3, mass: .9, type: 'wet', depth: 14.6},
  {id: 4, mass: .9, type: 'impacted', depth: 4.4},
  {id: 5, mass: 3, type: 'oily', depth: 9},
];
const sources = CaptureWaxSources(original);
Check(COLLECTION_GRADES.length === 5 && Object.keys(TOOL_CATALOG).length === 6, 'five collection grades and all six existing instruments are specified');
const intact = original.slice(0, 5).map(piece => ValueWax(piece, sources));
Check(intact.map(item => item.grade).join(',') === '1,2,3,4,5', 'native material and depth produce every grade at full integrity');
Check(intact.every((item, index) => !index || item.value > intact[index - 1].value), 'increasing difficulty and collection grade produce increasing actual sale values');
Check(intact[4].sparkle && intact.slice(0, 4).every(item => !item.sparkle), 'only the highest grade requests the sparkle celebration');
Check(ValueWax(original[5], sources).grade === 5, 'genuinely hard shallow material can qualify without invented depth');
const fake = ValueWax({id: 0, mass: .9, type: 'impacted', depth: 20, grade: 5, sourceMass: .1}, sources);
Check(fake.grade === 2 && fake.value === intact[1].value, 'piece-supplied rarity, mass baseline, material and depth cannot inflate native source appraisal');
Check(ValueWax({id: 'missing', mass: 999, type: 'impacted', depth: 30}, sources).value === 0, 'unregistered material has no sale value');
const broke = ValueWax([{id: '3.0', mass: .81, fragment: true, generation: 1}, {id: '3.1', mass: .09, fragment: true, generation: 1}], sources);
Check(broke.fragmented && broke.integrity < .7 && broke.grade < 5 && !broke.sparkle && broke.value < intact[4].value, 'recovering all fragments never restores original integrity or highest-grade sparkle');
const singleDescendant = ValueWax({id: '3.0', mass: .9}, sources);
Check(singleDescendant.fragmented && singleDescendant.grade < 4, 'a fragment-looking ID cannot pass as an intact deposit when flags are missing');
const inherited = ValueWax({id: '3.1.2', sourceRoot: 3, mass: .3, generation: 2, fragment: true}, sources);
Check(inherited.sourceMass === .9 && inherited.integrity < .25, 'deep descendants keep their original deposit baseline');
const allOil = ValueWax(Array.from({length: 10}, (_, index) => ({id: '5.' + index, mass: .3, fragment: true, generation: 1})), sources);
Check(Math.abs(allOil.collectedMass - 3) < 1e-8 && allOil.integrity < .1 && allOil.grade === 1, 'many oil nibbles conserve the full recovered mass but remain a low-integrity group');
const duplicate = AppraiseHarvest([{id: '3.0', mass: .45, fragment: true}, {id: '3.1', mass: .45, fragment: true}, {id: '3.0', mass: .45, fragment: true}], sources);
Check(duplicate.length === 1 && Math.abs(duplicate[0].collectedMass - .9) < 1e-8 && duplicate[0].pieces === 2, 'duplicate receipts cannot create another collectible, mass or piece count');
Check(UniqueWaxPieces([{id: 3, mass: .9}, {id: '3.0', mass: .4}, {id: '3.0.0', mass: .2}]).length === 1, 'parent and descendant receipts form one non-overlapping material record');
Check(Object.keys(CaptureWaxSources([{id: '3.0', mass: .1}, {id: 4, mass: .1, fragment: true}])).length === 0, 'fragments cannot be registered as fresh native sources');
let randomState = 73019;
function Random() {randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return randomState / 4294967296;}
let simulations = 0;
for (const source of original.filter(item => !item.fine)) {
  const whole = ValueWax(source, sources);
  for (let count = 2; count <= 24; count++) {
    const shares = Array.from({length: count}, () => .05 + Random()), sum = shares.reduce((a, b) => a + b, 0);
    const pieces = shares.map((share, index) => ({id: source.id + '.' + index, mass: source.mass * share / sum, fragment: true, generation: 1}));
    const appraisal = ValueWax(pieces, sources), repeated = ValueWax([...pieces, ...pieces], sources);
    assert.ok(appraisal.value <= whole.value && appraisal.grade <= whole.grade && !appraisal.sparkle, 'fragmentation cannot increase value or grade');
    assert.ok(Math.abs(appraisal.collectedMass - source.mass) < 1e-7, 'source mass is conserved');
    assert.equal(repeated.value, appraisal.value, 'duplicate fragments cannot increase value');
    simulations++;
  }
}
Check(simulations === 138, '138 deterministic fragmented-source simulations preserve mass and prevent price farming');
console.log('PASS ' + checks + ' progression checks, ' + simulations + ' fragmentation simulations');
console.log('Intact grade samples: ' + JSON.stringify(intact.map(item => ({grade: item.grade, value: item.value, difficulty: item.difficulty}))));

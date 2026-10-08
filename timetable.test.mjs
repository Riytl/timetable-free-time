import assert from 'node:assert/strict';
import test from 'node:test';
import { findCommonFreeSlots, findDailyFreeSlots, intersectTimeRanges, makeClockCourse, makeDailyWindow, mergeCourseSessions, parseTimetableCsv, renderWeekTimetable } from './.test-build/timetable.js';

test('CSV handles reordered headers, BOM, CRLF, quoted commas and escaped quotes', () => {
  const courses=parseTimetableCsv('\uFEFFday,name,end,start\r\nMonday,"Math, ""A""",10:00,09:00\r\n');
  assert.equal(courses[0].name,'Math, "A"'); assert.equal(courses[0].day,1); assert.equal(courses[0].startMinute,540);
});
test('a bad record reports its position and prevents a partial import', () => {
  assert.throws(()=>parseTimetableCsv('name,day,start,end\nValid,1,09:00,10:00\nInvalid,2,11:00,10:00'),e=>e.code==='order'&&e.row===3);
});
test('invalid times and weekdays are rejected; 24:00 is an end boundary', () => {
  assert.throws(()=>makeClockCourse({name:'Math',day:8,start:'09:00',end:'10:00'},'a'));
  assert.throws(()=>makeClockCourse({name:'Math',day:1,start:'24:00',end:'24:00'},'a'));
  assert.equal(makeClockCourse({name:'Math',day:'周日',start:'23:00',end:'24:00'},'a').endMinute,1440);
});
test('weekly text includes empty days and sorts courses by start', () => {
  const items=parseTimetableCsv('name,day,start,end\nLater,1,11:00,12:00\nEarlier,1,09:00,10:00');
  const output=renderWeekTimetable(items,['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],'empty');
  assert.ok(output.indexOf('Earlier')<output.indexOf('Later')); assert.ok(output.includes('Sun\n  empty'));
});

test('same-course sessions merge at the gap boundary without changing the original records', () => {
  const courses = parseTimetableCsv('name,day,start,end\nMath,1,09:00,09:45\nMath,1,09:55,10:40');
  const original = structuredClone(courses);
  assert.equal(mergeCourseSessions(courses, 10).length, 1);
  assert.equal(mergeCourseSessions(courses, 9).length, 2);
  assert.deepEqual(courses, original);
  const window = makeDailyWindow(1, '08:00', '12:00');
  assert.deepEqual(findDailyFreeSlots(courses, window, 1, 10), [
    { startMinute: 480, endMinute: 540 },
    { startMinute: 640, endMinute: 720 },
  ]);
  assert.ok(findDailyFreeSlots(courses, window, 1, 0).some(slot => slot.startMinute === 585 && slot.endMinute === 595));
});

test('different courses preserve their gap and different weekdays do not merge', () => {
  const courses = parseTimetableCsv('name,day,start,end\nMath,1,09:00,09:45\nEnglish,1,09:55,10:40\nMath,2,09:45,10:40');
  assert.equal(mergeCourseSessions(courses, 10).length, 3);
  assert.ok(findDailyFreeSlots(courses, makeDailyWindow(1, '08:00', '12:00'), 1, 10).some(slot => slot.startMinute === 585 && slot.endMinute === 595));
});

test('daily windows clip classes and overlapping classes are treated as one occupied interval', () => {
  const courses = parseTimetableCsv('name,day,start,end\nEarly,1,07:00,09:00\nA,1,10:00,11:00\nB,1,10:30,13:00');
  assert.deepEqual(findDailyFreeSlots(courses, makeDailyWindow(1, '08:00', '12:00')), [
    { startMinute: 540, endMinute: 600 },
  ]);
  assert.deepEqual(findDailyFreeSlots(courses, makeDailyWindow(1, '08:00', '12:00'), 61), []);
});

test('three-person common free slots are intersected, filtered and ordered longest first', () => {
  const schedules = [
    'Math,1,09:00,09:45\nMath,1,09:55,10:40\nEnglish,1,14:00,15:30',
    'Physics,1,10:00,12:00\nLab,1,14:00,15:00',
    'Programming,1,09:30,11:00\nPE,1,14:30,15:30',
  ].map(rows => parseTimetableCsv(`name,day,start,end\n${rows}`));
  const windows = [makeDailyWindow(1, '08:00', '22:00')];
  const expected = [
    { day: 1, startMinute: 930, endMinute: 1320 },
    { day: 1, startMinute: 720, endMinute: 840 },
    { day: 1, startMinute: 480, endMinute: 540 },
  ];
  assert.deepEqual(findCommonFreeSlots(schedules, windows, 60), expected);
  assert.deepEqual(findCommonFreeSlots(schedules, windows, 61), expected.slice(0, 2));
});

test('touching endpoints are not positive common free slots; empty schedules use the daily window', () => {
  assert.deepEqual(intersectTimeRanges([{ startMinute: 480, endMinute: 540 }], [{ startMinute: 540, endMinute: 600 }]), []);
  const window = makeDailyWindow(1, '08:00', '22:00');
  assert.deepEqual(findCommonFreeSlots([], [window]), []);
  assert.deepEqual(findCommonFreeSlots([[]], [window]), [window]);
});

test('invalid daily windows and calculation settings are rejected', () => {
  assert.throws(() => makeDailyWindow(1, '12:00', '08:00'));
  assert.throws(() => makeDailyWindow(8, '08:00', '22:00'));
  assert.throws(() => findDailyFreeSlots([], makeDailyWindow(1, '08:00', '22:00'), 0));
  assert.throws(() => findCommonFreeSlots([[]], [makeDailyWindow(1, '08:00', '22:00')], 1441));
  assert.throws(() => mergeCourseSessions([], 61));
});

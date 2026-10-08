import assert from 'node:assert/strict';
import test from 'node:test';
import { makeClockCourse, parseTimetableCsv, renderWeekTimetable } from './.test-build/timetable.js';

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

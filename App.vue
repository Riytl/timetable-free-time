<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ClockCourse, DailyWindow, MergedClockCourse, TimetableParticipant } from './timetable';
import { TimetableInputError, courseKey, exportTimetableCsv, formatClockTime, findCommonFreeSlots, findDailyFreeSlots, makeDailyWindow, mergeCourseSessions, makeClockCourse, parseTimetableCsv, renderWeekTimetable } from './timetable';

const days = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
function load<T>(key: string, fallback: T): T {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; }
  catch { return fallback; }
}
const error = ref('');
const status = ref('');
const storageWarning = ref('');
function validCourses(value: unknown): value is ClockCourse[] {
  return Array.isArray(value)&&value.every(item=>item&&typeof item.id==='string'&&typeof item.name==='string'&&item.name.trim().length>0&&item.name.length<=100&&Number.isInteger(item.day)&&item.day>=1&&item.day<=7&&Number.isInteger(item.startMinute)&&Number.isInteger(item.endMinute)&&item.startMinute>=0&&item.endMinute<=1440&&item.endMinute>item.startMinute);
}
const legacy=load<unknown>('timetable-free-time:courses:v1',[]);
const savedPeople=load<unknown>('timetable-free-time:people:v1',null);
function validPeople(value: unknown): value is TimetableParticipant[] {
  return Array.isArray(value)&&value.length>0&&value.length<=20&&value.every(item=>item&&typeof item.id==='string'&&typeof item.name==='string'&&item.name.trim().length>0&&item.name.length<=40&&typeof item.confirmed==='boolean'&&validCourses(item.courses))&&new Set(value.map(item=>item.id)).size===value.length&&new Set(value.map(item=>item.name)).size===value.length;
}
const people = ref<TimetableParticipant[]>(validPeople(savedPeople)?savedPeople:[{id:crypto.randomUUID(),name:'我',courses:validCourses(legacy)?legacy:[],confirmed:validCourses(legacy)&&legacy.length>0}]);
const activeId = ref(people.value[0].id);
const activePerson = computed(()=>people.value.find(person=>person.id===activeId.value)??people.value[0]);
const courses = computed({get:()=>activePerson.value.courses,set:(value:ClockCourse[])=>{activePerson.value.courses=value;activePerson.value.confirmed=value.length>0;}});
const memberName=ref('');
const commonDay=ref(0);
const ready = computed(()=>people.value.length>=2&&people.value.every(person=>person.courses.length>0||person.confirmed));
const commonFree = computed(()=>ready.value&&settings.value.valid?findCommonFreeSlots(people.value.map(person=>person.courses),settings.value.windows,minimumMinutes.value,gapMinutes.value):[]);
const visibleCommon = computed(()=>commonFree.value.filter(range=>!commonDay.value||range.day===commonDay.value));
const commonText = computed(()=>`成员：${people.value.map(person=>person.name).join('、')}\n`+visibleCommon.value.map(range=>`${days[range.day-1]} ${formatClockTime(range.startMinute)}–${formatClockTime(range.endMinute)}（${range.endMinute-range.startMinute} 分钟）`).join('\n'));
watch(people,value=>save('people:v1',value),{deep:true});
function save(key:string,value:unknown){try{localStorage.setItem('timetable-free-time:'+key,JSON.stringify(value));}catch{storageWarning.value='浏览器无法保存数据，请导出各成员的 CSV 备份。';}}
function addPerson(){
  const value=memberName.value.trim();
  if(!value||value.length>40||people.value.some(person=>person.name===value)){error.value='成员名须为 1–40 个字符，且不能重名。';return;}
  if(people.value.length>=20){error.value='最多可添加 20 位成员。';return;}
  const person={id:crypto.randomUUID(),name:value,courses:[],confirmed:false};people.value.push(person);activeId.value=person.id;memberName.value='';csv.value='';error.value='';status.value=`已添加 ${value}，请录入该成员的课表。`;
}
function selectPerson(id:string){activeId.value=id;csv.value='';error.value='';status.value='';}
function removePerson(){
  if(people.value.length<=1)return;
  if(!window.confirm(`移除“${activePerson.value.name}”及其课表？请先导出 CSV 备份。`))return;
  people.value=people.value.filter(person=>person.id!==activeId.value);activeId.value=people.value[0].id;csv.value='';status.value='成员已移除。';
}
function groupExample(){
  if(people.value.some(person=>person.courses.length)||people.value.length>1){error.value='请先保留当前数据；多人示例只在空白初始状态载入。';return;}
  const samples=[['我','高等数学,1,09:00,09:45\n高等数学,1,09:55,10:40\n英语,1,14:00,15:30'],['同学 A','物理,1,10:00,12:00\n实验,1,14:00,15:00'],['同学 B','程序设计,1,09:30,11:00\n体育,1,14:30,15:30']];
  people.value=samples.map(([name,rows])=>({id:crypto.randomUUID(),name,courses:parseTimetableCsv('name,day,start,end\n'+rows).map(course=>({...course,id:crypto.randomUUID()})),confirmed:true}));
  activeId.value=people.value[0].id;commonDay.value=1;status.value='已载入三人示例。周一共同空档按时长排列：390、120、60 分钟。';error.value='';
}
const name = ref('');
const courseDay = ref(1);
const start = ref('09:00');
const end = ref('09:45');
const selectedDay = ref(1);
const csv = ref('');
const defaultWindows=days.map((_,index)=>({day:index+1,start:'08:00',end:'22:00'}));
const savedWindows=load<unknown>('timetable-free-time:windows:v1',null);
const windowInputs = ref(Array.isArray(savedWindows)&&savedWindows.length===7&&savedWindows.every((item,index)=>item&&item.day===index+1&&typeof item.start==='string'&&typeof item.end==='string')?savedWindows as typeof defaultWindows:defaultWindows);
const savedRules=load<{minimum:number,gap:number}>('timetable-free-time:rules:v1',{minimum:30,gap:10});
const minimumMinutes = ref(savedRules?.minimum??30);
const gapMinutes = ref(savedRules?.gap??10);
watch([minimumMinutes,gapMinutes],()=>save('rules:v1',{minimum:minimumMinutes.value,gap:gapMinutes.value}));
const freeDay = ref(0);
watch(windowInputs,value=>save('windows:v1',value),{deep:true});
const settings = computed(()=>{
  try {
    if(!Number.isInteger(minimumMinutes.value)||minimumMinutes.value<1||minimumMinutes.value>1440||!Number.isInteger(gapMinutes.value)||gapMinutes.value<0||gapMinutes.value>60)throw new Error();
    return {windows:windowInputs.value.map(item=>makeDailyWindow(item.day,item.start,item.end)),valid:true};
  }catch{return {windows:[] as DailyWindow[],valid:false};}
});
const displayCourses = computed(() => mergeCourseSessions(courses.value, settings.value.valid?gapMinutes.value:0));
const dailyFree = computed(()=>settings.value.valid?settings.value.windows.flatMap(window=>findDailyFreeSlots(courses.value,window,minimumMinutes.value,gapMinutes.value).map(range=>({...range,day:window.day,duration:range.endMinute-range.startMinute}))):[]);
const visibleFree = computed(()=>dailyFree.value.filter(range=>!freeDay.value||range.day===freeDay.value));
const freeText = computed(()=>visibleFree.value.map(range=>`${days[range.day-1]} ${formatClockTime(range.startMinute)}–${formatClockTime(range.endMinute)}（${range.duration} 分钟）`).join('\n'));
const weeklyText = computed(() => renderWeekTimetable(displayCourses.value, days, '无课程'));
const errors: Record<string, string> = {
  name: '课程名须为 1–100 个字符。', day: '星期须为 1–7、中文或英文星期。', time: '请使用有效的 HH:mm 时间，结束可为 24:00。', order: '结束须晚于开始；跨天课程请拆开录入。', header: '表头须为课程名、星期几、开始时间、结束时间，或 name,day,start,end。', columns: '每条记录须包含 4 个字段。', quote: 'CSV 的引号格式不完整或错误。', empty: '没有可导入的课程。', large: 'CSV 不超过 1 MB、1000 条记录。',
};
function showError(cause: unknown) {
  error.value = cause instanceof TimetableInputError ? `${cause.row ? `CSV 记录 ${cause.row}：` : ''}${errors[cause.code] ?? '输入无效。'}` : '操作失败，请检查输入或文件编码。';
  status.value = '';
}
function append(items: ClockCourse[], targetId = activeId.value) {
  const target=people.value.find(person=>person.id===targetId);
  if(!target){error.value="目标成员已移除，未导入文件。";return;}
  const keys = new Set(target.courses.map(courseKey));
  const added = items.filter(item => { const key=courseKey(item); if(keys.has(key))return false; keys.add(key); return true; }).map(item => ({ ...item, id: crypto.randomUUID() }));
  if(target.courses.length+added.length>2000){error.value="每位成员最多录入 2000 条课程，请检查重复数据。";return;}
  target.courses = [...target.courses, ...added]; target.confirmed=target.courses.length>0;
  error.value=''; status.value=`已为 ${target.name} 添加 ${added.length} 条，跳过 ${items.length-added.length} 条重复课程。`;
}
function addCourse() {
  try { append([makeClockCourse({name:name.value,day:courseDay.value,start:start.value,end:end.value},crypto.randomUUID())]); selectedDay.value=courseDay.value; name.value=''; }
  catch(cause){showError(cause);}
}
function importCsv() { try { append(parseTimetableCsv(csv.value)); } catch(cause){showError(cause);} }
async function readCsv(event: Event) {
  const input=event.target as HTMLInputElement; const file=input.files?.[0]; const targetId=activeId.value; if(!file)return;
  try { if(file.size>1024*1024)throw new TimetableInputError('large'); const text=await file.text(); if(activeId.value===targetId)csv.value=text; append(parseTimetableCsv(text),targetId); }
  catch(cause){showError(cause);} finally {input.value='';}
}
const sampleCsv='课程名,星期几,开始时间,结束时间\n高等数学,1,09:00,09:45\n高等数学,1,09:55,10:40\n大学英语,3,14:00,15:30';
function download(value: string, filename: string) {
  const url=URL.createObjectURL(new Blob(['\uFEFF',value],{type:'text/csv;charset=utf-8'}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function copy(value: string) { try { await navigator.clipboard.writeText(value);status.value='已复制到剪贴板。';error.value=''; } catch { error.value='复制失败，请选中文本手动复制。'; } }
function removeCourse(course: MergedClockCourse) {courses.value=courses.value.filter(item=>!course.sourceIds.includes(item.id));}
</script>

<template>
  <div class="page">
    <header class="topbar"><a class="brand" href="#"><span class="brand-mark">空</span><span>空课<small>TIMETABLE & FREE TIME</small></span></a><span class="local-badge">● 本地计算 · 无需登录</span></header>
    <section class="hero"><div><span class="eyebrow">留一点时间，给课表之外的生活。</span><h1>你的课表，<br>也藏着自由时间。</h1><p>从一周的课程开始，整理清楚每一次上课的时间。合并连续课程，找到每天真正可用的时间；再叠加大家的课表，安排小组讨论、社团会议或一起运动。</p></div><div class="hero-note"><span class="note-top">THIS WEEK</span><strong>{{ courses.length }}</strong><span>条已录入课程</span><small>数据仅保存于当前浏览器</small></div></section>
    <nav class="steps"><a href="#courses"><b>01</b> 录入课表 <span>手动 / CSV</span></a><a href="#free"><b>02</b> 每日空档 <span>范围 / 连堂合并</span></a><a href="#common"><b>03</b> 共同空档 <span>多人 / 长空档优先</span></a></nav>
    <div v-if="storageWarning" class="alert error" role="alert">{{storageWarning}}</div><div v-if="error" class="alert error" role="alert">{{ error }}</div><div v-if="status" class="alert success" role="status">{{ status }}</div>
    <main class="workspace">
      <div class="input-column">
        <section class="card people-card"><div class="section-title"><h2>谁的课表？</h2><span>{{people.length}} 位成员</span></div><div class="people-list"><button v-for="person in people" :key="person.id" class="person" :class="{active:person.id===activeId}" :aria-pressed="person.id===activeId" @click="selectPerson(person.id)"><span>{{person.name}}</span><small>{{person.courses.length?`${person.courses.length} 条课程`:person.confirmed?'已确认无课':'待录入'}}</small></button></div><form class="add-person" @submit.prevent="addPerson"><input v-model="memberName" placeholder="成员名，如同学 A" aria-label="新成员名称" maxlength="40" required><button class="btn" type="submit">添加</button></form><div v-if="!courses.length&&!activePerson.confirmed" class="confirm-empty"><p>空白课表尚未参与共同空档计算。若该成员整周确实无课，请明确确认。</p><button class="btn small" @click="activePerson.confirmed=true">确认此成员整周无课</button></div><button v-if="people.length>1" class="btn subtle" @click="removePerson">移除当前成员</button><button v-if="people.length===1&&!courses.length" class="btn subtle" @click="groupExample">试用三人示例</button></section>
        <section id="courses" class="card"><div class="section-title"><h2>为 {{activePerson.name}} 录入课程</h2><span>01 / INPUT</span></div><form class="course-form" @submit.prevent="addCourse"><label class="wide">课程名<input v-model="name" placeholder="例如：高等数学" maxlength="100" required></label><label class="wide">星期几<select v-model="courseDay"><option v-for="(label,index) in days" :key="label" :value="index+1">{{label}}</option></select></label><label>开始时间<input v-model="start" type="time" required></label><label>结束时间<input v-model="end" type="time" required></label><button class="btn primary wide" type="submit">＋ 添加课程</button></form><button v-if="!courses.length" class="btn subtle" @click="csv=sampleCsv;importCsv()">载入示例课表</button></section>
        <section class="card"><details><summary>从 CSV 导入</summary><p class="hint">UTF-8 文件，4 个字段：课程名、星期几、开始时间、结束时间。星期用 1–7，时间用 HH:mm。导入会追加，重复项跳过。</p><label class="btn file-button">选择 CSV 文件<input type="file" accept=".csv,text/csv" @change="readCsv"></label><button class="btn subtle" @click="download(sampleCsv,'timetable-example.csv')">下载示例 CSV</button><label class="paste-field">或粘贴 CSV<textarea v-model="csv" rows="5" placeholder="name,day,start,end"></textarea></label><button class="btn primary" @click="importCsv">导入课表</button></details></section>
      </div>
      <div class="output-column">
        <section class="card"><div class="section-title"><h2>{{activePerson.name}} · 本周课表</h2><button class="btn small" :disabled="!courses.length" @click="download(exportTimetableCsv(courses),'timetable.csv')">导出 CSV</button></div><div class="day-tabs" role="group" aria-label="查看星期"><button v-for="(label,index) in days" :key="label" :class="{active:selectedDay===index+1}" :aria-pressed="selectedDay===index+1" @click="selectedDay=index+1">{{label.slice(2)}}</button></div><div class="course-list"><div v-for="course in displayCourses.filter(item=>item.day===selectedDay)" :key="course.id" class="course"><div class="course-time">{{formatClockTime(course.startMinute)}}<span>{{formatClockTime(course.endMinute)}}</span></div><div class="course-name"><strong>{{course.name}}</strong><small>{{days[course.day-1]}}<template v-if="course.sourceIds.length>1"> · 已合并 {{course.sourceIds.length}} 节</template></small></div><button class="btn small" @click="removeCourse(course)">删除</button></div><div v-if="!displayCourses.some(course=>course.day===selectedDay)" class="empty"><span>◌</span><strong>这一天没有课程</strong><p>可以开始录入，或载入左侧的示例课表。</p></div></div><details class="text-timetable" open><summary>本周课表 · 文本视图</summary><textarea :value="weeklyText" readonly rows="12" aria-label="本周课表文本"></textarea><button class="btn" @click="copy(weeklyText)">复制完整课表</button></details></section>
        <section id="free" class="card"><div class="section-title"><h2>{{activePerson.name}} · 每日空档</h2><span>02 / FREE TIME</span></div><details class="time-settings"><summary>设置每日范围与计算规则</summary><p class="hint">同一天同名课程，间隔不超过阈值时合并。避免把课间休息当作空档。</p><div class="window-grid"><div v-for="item in windowInputs" :key="item.day"><span>{{days[item.day-1]}}</span><input v-model="item.start" type="time" :aria-label="days[item.day-1]+'可用开始'"><span>至</span><input v-model="item.end" placeholder="22:00" :aria-label="days[item.day-1]+'可用结束'"></div></div><div class="rule-fields"><label>最短空档（分钟）<input v-model.number="minimumMinutes" type="number" min="1" max="1440"></label><label>同名课间合并（分钟）<input v-model.number="gapMinutes" type="number" min="0" max="60"></label></div></details><p v-if="!settings.valid" class="inline-error" role="alert">请填写有效范围，结束须晚于开始。最短空档为 1–1440 分钟，合并阈值为 0–60 分钟。</p><div class="result-toolbar"><span>{{visibleFree.length}} 段可用时间</span><select v-model="freeDay" aria-label="筛选每日空档"><option :value="0">整周</option><option v-for="(label,index) in days" :key="label" :value="index+1">{{label}}</option></select><button class="btn small" :disabled="!visibleFree.length" @click="copy(freeText)">复制结果</button></div><div class="slot-list"><div v-for="range in visibleFree" :key="`${range.day}-${range.startMinute}`" class="slot"><span>{{days[range.day-1]}}</span><strong>{{formatClockTime(range.startMinute)}} — {{formatClockTime(range.endMinute)}}</strong><b>{{range.duration}} <small>分钟</small></b></div></div><p v-if="settings.valid&&!visibleFree.length" class="hint">当前规则下没有符合时长的空档，可调整日期或最短时长。</p></section>
        <section id="common" class="card common-card"><div class="section-title"><h2>找到大家都空闲的时刻</h2><span>03 / TOGETHER</span></div><p class="hint">共同空档为所有成员每日空档的交集。只计算已录入或明确确认无课的成员；结果按时长从长到短排列。</p><div v-if="!ready" class="pending"><strong>还需要准备课表</strong><p v-if="people.length<2">至少添加两位成员，才能计算共同空档。</p><p v-else>请补齐：{{people.filter(person=>!person.courses.length&&!person.confirmed).map(person=>person.name).join('、')}}。点击成员卡片分别录入。</p></div><template v-else><div class="result-toolbar"><span>{{visibleCommon.length}} 段 · {{people.length}} 人共同空闲</span><select v-model="commonDay" aria-label="筛选共同空档"><option :value="0">整周</option><option v-for="(label,index) in days" :key="label" :value="index+1">{{label}}</option></select><button class="btn small" :disabled="!visibleCommon.length" @click="copy(commonText)">复制结果</button></div><div class="slot-list"><div v-for="(range,index) in visibleCommon" :key="`${range.day}-${range.startMinute}`" class="slot common-slot"><span class="rank">{{String(index+1).padStart(2,'0')}}</span><div><small>{{days[range.day-1]}}</small><strong>{{formatClockTime(range.startMinute)}} — {{formatClockTime(range.endMinute)}}</strong></div><b>{{range.endMinute-range.startMinute}} <small>分钟</small></b></div></div><p v-if="settings.valid&&!visibleCommon.length" class="hint">没有满足条件的共同空档，可调整日期、时间范围或最短时长。</p><p v-if="!settings.valid" class="inline-error">请先修正每日时间设置。</p></template></section>
      </div>
    </main>
    <footer>空课 · 独立课表工具 <span>课程按每周重复计算，跨天课程请分开录入。</span></footer>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ClockCourse } from './timetable';
import { TimetableInputError, courseKey, exportTimetableCsv, formatClockTime, makeClockCourse, parseTimetableCsv, renderWeekTimetable } from './timetable';

const days = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
function load<T>(key: string, fallback: T): T {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; }
  catch { return fallback; }
}
const courses = ref<ClockCourse[]>(load('timetable-free-time:courses:v1', []));
const error = ref('');
const status = ref('');
watch(courses, value => {
  try { localStorage.setItem('timetable-free-time:courses:v1', JSON.stringify(value)); }
  catch { error.value = '浏览器无法保存数据，请导出 CSV 备份。'; }
}, { deep: true });
const name = ref('');
const courseDay = ref(1);
const start = ref('09:00');
const end = ref('09:45');
const selectedDay = ref(1);
const csv = ref('');
const displayCourses = computed(() => [...courses.value].sort((a,b) => a.day - b.day || a.startMinute - b.startMinute));
const weeklyText = computed(() => renderWeekTimetable(displayCourses.value, days, '无课程'));
const errors: Record<string, string> = {
  name: '课程名须为 1–100 个字符。', day: '星期须为 1–7、中文或英文星期。', time: '请使用有效的 HH:mm 时间，结束可为 24:00。', order: '结束须晚于开始；跨天课程请拆开录入。', header: '表头须为课程名、星期几、开始时间、结束时间，或 name,day,start,end。', columns: '每条记录须包含 4 个字段。', quote: 'CSV 的引号格式不完整或错误。', empty: '没有可导入的课程。', large: 'CSV 不超过 1 MB、1000 条记录。',
};
function showError(cause: unknown) {
  error.value = cause instanceof TimetableInputError ? `${cause.row ? `CSV 记录 ${cause.row}：` : ''}${errors[cause.code] ?? '输入无效。'}` : '操作失败，请检查输入或文件编码。';
  status.value = '';
}
function append(items: ClockCourse[]) {
  const keys = new Set(courses.value.map(courseKey));
  const added = items.filter(item => { const key=courseKey(item); if(keys.has(key))return false; keys.add(key); return true; }).map(item => ({ ...item, id: crypto.randomUUID() }));
  courses.value = [...courses.value, ...added];
  error.value=''; status.value=`已添加 ${added.length} 条，跳过 ${items.length-added.length} 条重复课程。`;
}
function addCourse() {
  try { append([makeClockCourse({name:name.value,day:courseDay.value,start:start.value,end:end.value},crypto.randomUUID())]); selectedDay.value=courseDay.value; name.value=''; }
  catch(cause){showError(cause);}
}
function importCsv() { try { append(parseTimetableCsv(csv.value)); } catch(cause){showError(cause);} }
async function readCsv(event: Event) {
  const input=event.target as HTMLInputElement; const file=input.files?.[0]; if(!file)return;
  try { if(file.size>1024*1024)throw new TimetableInputError('large'); csv.value=await file.text(); importCsv(); }
  catch(cause){showError(cause);} finally {input.value='';}
}
const sampleCsv='课程名,星期几,开始时间,结束时间\n高等数学,1,09:00,09:45\n高等数学,1,09:55,10:40\n大学英语,3,14:00,15:30';
function download(value: string, filename: string) {
  const url=URL.createObjectURL(new Blob(['\uFEFF',value],{type:'text/csv;charset=utf-8'}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function copy(value: string) { try { await navigator.clipboard.writeText(value);status.value='已复制到剪贴板。';error.value=''; } catch { error.value='复制失败，请选中文本手动复制。'; } }
function removeCourse(course: ClockCourse) {courses.value=courses.value.filter(item=>item.id!==course.id);}
</script>

<template>
  <div class="page">
    <header class="topbar"><a class="brand" href="#"><span class="brand-mark">空</span><span>空课<small>TIMETABLE & FREE TIME</small></span></a><span class="local-badge">● 本地计算 · 无需登录</span></header>
    <section class="hero"><div><span class="eyebrow">留一点时间，给课表之外的生活。</span><h1>你的课表，<br>也藏着自由时间。</h1><p>从一周的课程开始，整理清楚每一次上课的时间。手动录入、CSV 导入，再把完整课表带走。</p></div><div class="hero-note"><span class="note-top">THIS WEEK</span><strong>{{ courses.length }}</strong><span>条已录入课程</span><small>数据仅保存于当前浏览器</small></div></section>
    <nav class="steps"><a href="#courses"><b>01</b> 录入课表 <span>手动 / CSV</span></a></nav>
    <div v-if="error" class="alert error" role="alert">{{ error }}</div><div v-if="status" class="alert success" role="status">{{ status }}</div>
    <main class="workspace">
      <div class="input-column">
        <section id="courses" class="card"><div class="section-title"><h2>录入一门课程</h2><span>01 / INPUT</span></div><form class="course-form" @submit.prevent="addCourse"><label class="wide">课程名<input v-model="name" placeholder="例如：高等数学" maxlength="100" required></label><label class="wide">星期几<select v-model="courseDay"><option v-for="(label,index) in days" :key="label" :value="index+1">{{label}}</option></select></label><label>开始时间<input v-model="start" type="time" required></label><label>结束时间<input v-model="end" type="time" required></label><button class="btn primary wide" type="submit">＋ 添加课程</button></form><button v-if="!courses.length" class="btn subtle" @click="csv=sampleCsv;importCsv()">载入示例课表</button></section>
        <section class="card"><details><summary>从 CSV 导入</summary><p class="hint">UTF-8 文件，4 个字段：课程名、星期几、开始时间、结束时间。星期用 1–7，时间用 HH:mm。导入会追加，重复项跳过。</p><label class="btn file-button">选择 CSV 文件<input type="file" accept=".csv,text/csv" @change="readCsv"></label><button class="btn subtle" @click="download(sampleCsv,'timetable-example.csv')">下载示例 CSV</button><label class="paste-field">或粘贴 CSV<textarea v-model="csv" rows="5" placeholder="name,day,start,end"></textarea></label><button class="btn primary" @click="importCsv">导入课表</button></details></section>
      </div>
      <div class="output-column">
        <section class="card"><div class="section-title"><h2>本周课表</h2><button class="btn small" :disabled="!courses.length" @click="download(exportTimetableCsv(courses),'timetable.csv')">导出 CSV</button></div><div class="day-tabs" role="group" aria-label="查看星期"><button v-for="(label,index) in days" :key="label" :class="{active:selectedDay===index+1}" :aria-pressed="selectedDay===index+1" @click="selectedDay=index+1">{{label.slice(2)}}</button></div><div class="course-list"><div v-for="course in displayCourses.filter(item=>item.day===selectedDay)" :key="course.id" class="course"><div class="course-time">{{formatClockTime(course.startMinute)}}<span>{{formatClockTime(course.endMinute)}}</span></div><div class="course-name"><strong>{{course.name}}</strong><small>{{days[course.day-1]}}</small></div><button class="btn small" @click="removeCourse(course)">删除</button></div><div v-if="!displayCourses.some(course=>course.day===selectedDay)" class="empty"><span>◌</span><strong>这一天没有课程</strong><p>可以开始录入，或载入左侧的示例课表。</p></div></div><details class="text-timetable" open><summary>本周课表 · 文本视图</summary><textarea :value="weeklyText" readonly rows="12" aria-label="本周课表文本"></textarea><button class="btn" @click="copy(weeklyText)">复制完整课表</button></details></section>
      </div>
    </main>
    <footer>空课 · 独立课表工具 <span>课程按每周重复计算，跨天课程请分开录入。</span></footer>
  </div>
</template>

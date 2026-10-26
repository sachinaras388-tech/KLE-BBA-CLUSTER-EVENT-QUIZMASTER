const fs = require('fs');
const path = require('path');

// Extract questionsData from seedAiMindMasters.js
const content = fs.readFileSync(path.join(__dirname, 'seedAiMindMasters.js'), 'utf8');
const match = content.match(/const questionsData = (\[[\s\S]*?\]);\s*async function main/);

if (!match) {
  console.error('Could not match questionsData array');
  process.exit(1);
}

// Evaluate array safely
const questionsData = eval(match[1]);

// 1. Write JSON
const jsonOutput = {
  competition: {
    title: 'AI MIND MASTERS – FIRST ROUND',
    institution: 'KLE Society’s College of BBA, Mahalingpur',
    totalQuestions: 60,
    maxMarks: 60,
    durationMinutes: 30,
    eventDate: '28-11-2026',
    startTime: '11:00 AM IST',
    endTime: '01:00 PM IST',
  },
  questions: questionsData,
};

fs.writeFileSync(
  path.join(__dirname, '../data/ai-mind-masters-questions.json'),
  JSON.stringify(jsonOutput, null, 2),
  'utf8'
);

// 2. Write CSV
const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
const escapeCsv = (val) => {
  const str = String(val === undefined || val === null ? '' : val);
  return `"${str.replace(/"/g, '""')}"`;
};

const csvHeader = 'Question,Option A,Option B,Option C,Option D,Correct Option,Marks,Explanation\r\n';
const csvRows = questionsData
  .map((q) => {
    return [
      escapeCsv(q.text),
      escapeCsv(q.options[0]),
      escapeCsv(q.options[1]),
      escapeCsv(q.options[2]),
      escapeCsv(q.options[3]),
      letters[q.correctIndex] || 'A',
      q.marks || 1,
      escapeCsv(q.explanation || ''),
    ].join(',');
  })
  .join('\r\n');

fs.writeFileSync(
  path.join(__dirname, '../data/ai-mind-masters-questions.csv'),
  csvHeader + csvRows,
  'utf8'
);

console.log('Successfully generated:');
console.log('• server/data/ai-mind-masters-questions.json');
console.log('• server/data/ai-mind-masters-questions.csv');

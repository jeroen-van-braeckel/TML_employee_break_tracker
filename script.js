const fileInput = document.getElementById('fileInput');
const tableBody = document.querySelector('#employeeTable tbody');
//let employees = [];

const data = JSON.parse(localStorage.getItem('employeeData') || '[]');

let employees = data.sort((a, b) => new Date(a.startShift) - new Date(b.startShift));

fileInput.addEventListener('change', handleFile);

function handleFile(event) {
  const file = event.target.files[0];
  const reader = new FileReader();

  reader.onload = (e) => {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    employees = jsonData.slice(1).map(emp => {
      const startShift = parseExcelDate(emp[1], emp[2]);
      const endShift = parseExcelDate(emp[3], emp[4]);

      const calculatedEndTime = new Date(startShift.getTime() + 11 * 60 * 60000);
      return {
        name: emp[0],
        startShift,
        endShift,
        breakNeeded: parseFloat(emp[5]) * 60,
        breaks: [],
        onBreak: false,
        breakStartTime: null,
        expectedReturn: null,
        justHadBreak: false,
        calculatedEndTime: calculatedEndTime,
        totalBreakTime : 0
      };
    });

    renderTable();
    saveState();
  };

  reader.readAsArrayBuffer(file);
}

function parseExcelDate(dateVal, timeVal) {
  const date = typeof dateVal === 'number' ? new Date((dateVal - 25569) * 86400 * 1000) : new Date(dateVal);
  let hours = 0, minutes = 0;

  if (typeof timeVal === 'number') {
    const totalSeconds = Math.round(timeVal * 86400);
    hours = Math.floor(totalSeconds / 3600);
    minutes = Math.floor((totalSeconds % 3600) / 60);
  } else if (typeof timeVal === 'string') {
    const timeParts = timeVal.split(':');
    hours = parseInt(timeParts[0], 10) || 0;
    minutes = parseInt(timeParts[1], 10) || 0;
  }

  date.setHours(hours, minutes, 0, 0);
  return date;
}

function renderTable() {
  tableBody.innerHTML = '';
  employees.sort((a, b) => {
    if (a.onBreak && !b.onBreak) return -1;
    if (!a.onBreak && b.onBreak) return 1; if (a.justHadBreak && !b.justHadBreak) return 1;
    if (!a.justHadBreak && b.justHadBreak) return -1;
    if (a.startShift < b.startShift) return -1;
    if (a.startShift > b.startShift) return 1;

    return 0;
  });

  employees.forEach((emp, index) => {
    const row = document.createElement('tr');
    if (emp.onBreak) row.classList.add('active-break');
    else if (emp.breakNeeded === 0) row.classList.add('completed-break');

    const startShift = new Date(emp.startShift)
    const endShift = new Date(emp.endShift)

    const calculatedEndTime = new Date(emp.startShift.getTime() + 11 * 60 * 60000 + getTotalBreakTime(emp) * 60000);
    emp.calculatedEndTime = calculatedEndTime;
    const calculatedEndTimeStr = new Date(emp.calculatedEndTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const listedShiftTimeStr = `${startShift.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(emp.endShift).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const endTimeCellClass = emp.calculatedEndTime < emp.endShift ? 'overwork-warning' : '';

    row.innerHTML = `
          <td>${emp.name}</td>
          <td><button onclick="toggleBreak(${index})" class="${emp.onBreak ? 'end-break-btn' : 'start-break-btn'}">${emp.onBreak ? 'End Break' : 'Start Break'}</button></td>
          <td>${emp.breakNeeded}'</td>
          <td>${emp.totalBreakTime}</td>
          <td>${emp.breaks.map((b, i) => `<span class="editable" onclick="editBreak(${index}, ${i})">${b.start} - ${b.end}</span>`).join('<br>') || '-'}</td>
          <td>${emp.onBreak ? getCurrentBreakDuration(emp.breakStartTime) : '-'}</td>
          <td>${emp.expectedReturn || '-'}</td>
          <td class="${endTimeCellClass}">${calculatedEndTimeStr}</td>
          <td>${listedShiftTimeStr}</td>
        `;

    tableBody.appendChild(row);
  });
}

function toggleBreak(index) {
  const emp = employees[index];
  const now = new Date();

  if (!emp.onBreak) {
    emp.onBreak = true;
    emp.breakStartTime = now;
    emp.expectedReturn = new Date(now.getTime() + 30 * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    emp.justHadBreak = false;
  } else {
    emp.onBreak = false;
    const endBreak = new Date();
    emp.breaks.push({
      start: emp.breakStartTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      end: endBreak.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
    const breakDuration = Math.round((endBreak - emp.breakStartTime) / 60000);

    const calculatedEndTime = new Date(new Date(emp.endShift).getTime() + 11 * 60 * 60000 + getTotalBreakTime(emp) * 60000);
    emp.calculatedEndTime = calculatedEndTime;
    emp.breakNeeded = Math.max(0, emp.breakNeeded - breakDuration);
    emp.breakStartTime = null;
    emp.expectedReturn = null;
    emp.justHadBreak = true;
  }

  renderTable();
  saveState();
}

function editBreak(empIndex, breakIndex) {
  const emp = employees[empIndex];
  const breakEntry = emp.breaks[breakIndex];
  const newStart = prompt("Edit Break Start Time (HH:MM)", breakEntry.start);
  const newEnd = prompt("Edit Break End Time (HH:MM)", breakEntry.end);
  if (newStart && newEnd) {
    if (newStart > newEnd - 5) {
      alert("start time needs to be before end time")
    }
    else {
      breakEntry.start = newStart;
      breakEntry.end = newEnd;
      try{
          recalculateBreaks(emp);
      renderTable();
      saveState();
      }
      catch(Exception){
        alert("Invalid input, please try again ith the format HH:MM")
        editBreak(empIndex, breakIndex)
      }
    
    }
  }
}

function recalculateBreaks(emp) {
  const totalBreakTime = getTotalBreakTime(emp);
  if(isNaN(totalBreakTime)){
    throw new Exception()
  }
  emp.breakNeeded = Math.max(0, emp.breakNeeded - totalBreakTime);
}

function getCurrentBreakDuration(startTime) {
  const now = new Date();
  const diff = Math.round((now - startTime) / 60000);
  return `${diff} min`;
}

function saveState() {
  localStorage.setItem('employeeData', JSON.stringify(employees));
}

function loadState() {
  const savedData = localStorage.getItem('employeeData');
  if (savedData) {
    employees = JSON.parse(savedData);
    employees.forEach(emp => {
      emp.startShift = new Date(emp.startShift);
      emp.endShift = new Date(emp.endShift);
      emp.breakStartTime = emp.breakStartTime ? new Date(emp.breakStartTime) : null;
    });
    renderTable();
  }
}

window.onload = loadState;

function clearState() {
  if (confirm("Are you sure you want to clear all saved data?")) {
    localStorage.removeItem('employeeData');
    employees = [];
    renderTable();
  }
}

function getTotalBreakTime(emp) {
  var total =  emp.breaks.reduce((sum, b) => {
    const start = new Date(`1970-01-01T${b.start}`);
    let end = new Date(`1970-01-01T${b.end}`);
    if (end < start) {
      end.setDate(end.getDate() + 1);
    }
    return sum + Math.round((end - start) / 60000);
  }, 0);

  emp.totalBreakTime = total;
  return total;
}

setInterval(renderTable, 60000);

function showTab(tabId) {
  renderTimeline()
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
}

const START_HOUR = 10; // Start time in hours
const END_HOUR = 4 + 24; // If next day, add 24

const START_TIMELINE = new Date(employees[0].startShift);
START_TIMELINE.setHours(START_HOUR, 0, 0, 0);

const END_TIMELINE = new Date(START_TIMELINE);
END_TIMELINE.setHours(END_HOUR, 0, 0, 0);

const TIMELINE_WIDTH = 1200; // Pixel width of the timeline

function durationToWidth(duration) {
  const pixelsPerMilliSecond = TIMELINE_WIDTH / (END_TIMELINE - START_TIMELINE);
  return pixelsPerMilliSecond * duration;
}

function renderTimeline() {
  const visual = document.getElementById('visual');
  visual.innerHTML = '';

  const now = new Date().getTime();

  // Sticky header with hour markers
  const header = document.createElement('div');
  header.className = 'timeline-header';
  for (let h = START_HOUR; h <= END_HOUR; h++) {
    const hourPosition = durationToWidth((h - START_HOUR) * 60 * 60 * 1000) + 230;
    const hourMarker = document.createElement('div');
    hourMarker.className = 'hour-marker';
    hourMarker.style.left = `${hourPosition}px`;

    const hourLabel = document.createElement('div');
    hourLabel.className = 'hour-label';
    hourLabel.style.left = `${hourPosition}px`;
    hourLabel.textContent = `${h % 24}:00`;

    header.appendChild(hourMarker);
    header.appendChild(hourLabel);
  }
  visual.appendChild(header);

  employees.forEach(employee => {
    const row = document.createElement('div');
    row.className = 'timeline-row';

    // Employee name
    const name = document.createElement('div');
    name.className = 'timeline-name';
    name.textContent = employee.name;
    row.appendChild(name);

    // Timeline bar
    const bar = document.createElement('div');
    bar.className = 'timeline-bar';
    bar.style.width = `${TIMELINE_WIDTH}px`;

    const shiftStart = new Date(employee.startShift);
    const shiftEnd = new Date(employee.endShift);
    const calculatedEnd = new Date(employee.calculatedEndTime);
    const expectedReturn = employee.expectedReturn ? new Date(employee.expectedReturn) : null;

    const totalDuration = shiftEnd - shiftStart;
    const nowPosition = durationToWidth(now - shiftStart);

    // Working time (blue)
    if (now > shiftStart.getTime()) {
      const workedWidth = Math.min(nowPosition, TIMELINE_WIDTH);
      const workedSegment = createSegment(0, '#4a90e2', `Worked until ${new Date(now).toLocaleTimeString()}`, workedWidth);
      bar.appendChild(workedSegment);
    }

    // Remaining time (grey)
    if (now < shiftEnd.getTime()) {
      const remainingWidth = durationToWidth(shiftEnd - now);
      const remainingSegment = createSegment(nowPosition, '#d3d3d3', `Remaining work time`, remainingWidth);
      bar.appendChild(remainingSegment);
    }

    // Breaks
    employee.breaks.forEach(b => {
      const breakStart = getDateWithTime(shiftStart, b.start);
      const breakEnd = getDateWithTime(shiftStart, b.end);
      const breakStartPos = durationToWidth(breakStart - shiftStart);
      const breakWidth = durationToWidth(breakEnd - breakStart);
      const breakColor = breakEnd < now ? '#4caf50' : '#a5d6a7';

      const breakSegment = createSegment(breakStartPos, breakColor, `Break from ${b.start} to ${b.end}`, breakWidth);
      bar.appendChild(breakSegment);
    });

    // Calculated end time (yellow)
    if (calculatedEnd > shiftStart) {
      const calcEndPos = durationToWidth(calculatedEnd - shiftStart);
      const calcEndSegment = createSegment(calcEndPos, '#ffeb3b', `Calculated end time: ${calculatedEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
      calcEndSegment.style.width = '2px';
      bar.appendChild(calcEndSegment);
    }

    // Expected return (purple)
    if (expectedReturn) {
      const expReturnPos = durationToWidth(expectedReturn - shiftStart);
      const expReturnSegment = createSegment(expReturnPos, '#9c27b0', `Expected return`);
      expReturnSegment.style.width = '2px';
      bar.appendChild(expReturnSegment);
    }

    row.appendChild(bar);
    visual.appendChild(row);
  });
}

function createSegment(left, color, tooltipText, width = 2) {
  const segment = document.createElement('div');
  segment.className = 'segment';
  segment.style.left = `${left}px`;
  segment.style.width = `${width}px`;
  segment.style.backgroundColor = color;

  segment.addEventListener('mouseenter', e => showTooltip(e, tooltipText));
  segment.addEventListener('mouseleave', hideTooltip);

  return segment;
}

function showTooltip(event, text) {
  let tooltip = document.querySelector('.tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    document.body.appendChild(tooltip);
  }
  tooltip.style.left = `${event.pageX + 10}px`;
  tooltip.style.top = `${event.pageY + 10}px`;
  tooltip.textContent = text;
  tooltip.style.display = 'block';
}

function hideTooltip() {
  const tooltip = document.querySelector('.tooltip');
  if (tooltip) tooltip.style.display = 'none';
}

function getDateWithTime(baseDate, time) {
  const [hours, minutes] = time.split(':');
  const date = new Date(baseDate);
  date.setHours(hours, minutes);
  return date;
}

renderTimeline();


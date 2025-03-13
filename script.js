 const fileInput = document.getElementById('fileInput');
    const tableBody = document.querySelector('#employeeTable tbody');
    let employees = [];

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
          return {
            name: emp[0],
            startShift,
            endShift,
            breakNeeded: parseFloat(emp[5]) * 60,
            breaks: [],
            onBreak: false,
            breakStartTime: null,
            expectedReturn: null,
            justHadBreak: false
          };
        });

        renderTable();
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
        if (!a.onBreak && b.onBreak) return 1;if (a.justHadBreak && !b.justHadBreak) return 1;
        if (!a.justHadBreak && b.justHadBreak) return -1;
        if (a.startShift < b.startShift) return -1;
        if (a.startShift > b.startShift) return 1;
        
        return 0;
      });

      employees.forEach((emp, index) => {
        const row = document.createElement('tr');
        if (emp.onBreak) row.classList.add('active-break');
        else if (emp.breakNeeded === 0) row.classList.add('completed-break');

        const calculatedEndTime = new Date(emp.startShift.getTime() + 11 * 60 * 60000 + getTotalBreakTime(emp) * 60000);
        const calculatedEndTimeStr = calculatedEndTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const listedShiftTimeStr = `${emp.startShift.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${emp.endShift.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        const endTimeCellClass = calculatedEndTime < emp.endShift ? 'overwork-warning' : '';

        row.innerHTML = `
          <td>${emp.name}</td>
          <td><button onclick="toggleBreak(${index})" class="${emp.onBreak ? 'end-break-btn' : 'start-break-btn'}">${emp.onBreak ? 'End Break' : 'Start Break'}</button></td>
          <td>${emp.breakNeeded}'</td>
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
        if(newStart > newEnd - 5){
          alert("start time needs to be before end time")
        }
        else{
          breakEntry.start = newStart;
        breakEntry.end = newEnd;
        recalculateBreaks(emp);
        renderTable();
        saveState();
        }
      }
    }

    function recalculateBreaks(emp) {
      const totalBreakTime = getTotalBreakTime(emp);
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
      return emp.breaks.reduce((sum, b) => {
        const start = new Date(`1970-01-01T${b.start}`);
        let end = new Date(`1970-01-01T${b.end}`);
        if (end < start) {
          end.setDate(end.getDate() + 1);
        }
        return sum + Math.round((end - start) / 60000);
      }, 0);
    }

    setInterval(renderTable, 60000);











    function renderTimeline() {
        const container = document.getElementById("timeline-container");
        container.innerHTML = "";
        
        const startHour = 6; // Earliest hour to show
        const endHour = 22; // Latest hour to show
        const totalHours = endHour - startHour;
        
        employees.forEach(emp => {
          const timeline = document.createElement("div");
          timeline.classList.add("timeline");
          
          for (let h = startHour; h <= endHour; h++) {
            const hourMark = document.createElement("div");
            hourMark.classList.add("hour-mark");
            hourMark.style.left = `${((h - startHour) / totalHours) * 100}%`;
            timeline.appendChild(hourMark);
          }
          
          const shiftStartPercent = ((emp.startShift.getHours() + emp.startShift.getMinutes() / 60 - startHour) / totalHours) * 100;
          const shiftEndPercent = ((emp.endShift.getHours() + emp.endShift.getMinutes() / 60 - startHour) / totalHours) * 100;
          
          const plannedShift = document.createElement("div");
          plannedShift.classList.add("shift-segment", "shift-planned");
          plannedShift.style.left = `${shiftStartPercent}%`;
          plannedShift.style.width = `${shiftEndPercent - shiftStartPercent}%`;
          timeline.appendChild(plannedShift);
          
          const now = new Date();
          if (now >= emp.startShift && now <= emp.endShift) {
            const runningShift = document.createElement("div");
            runningShift.classList.add("shift-segment", "shift-running");
            runningShift.style.left = `${shiftStartPercent}%`;
            runningShift.style.width = `${((now - emp.startShift) / (emp.endShift - emp.startShift)) * (shiftEndPercent - shiftStartPercent)}%`;
            timeline.appendChild(runningShift);
          }
          
          emp.breaks.forEach(brk => {
            const breakStartPercent = ((brk.start.getHours() + brk.start.getMinutes() / 60 - startHour) / totalHours) * 100;
            const breakEndPercent = ((brk.end.getHours() + brk.end.getMinutes() / 60 - startHour) / totalHours) * 100;
            const breakSegment = document.createElement("div");
            breakSegment.classList.add("shift-segment", "break-segment");
            breakSegment.style.left = `${breakStartPercent}%`;
            breakSegment.style.width = `${breakEndPercent - breakStartPercent}%`;
            timeline.appendChild(breakSegment);
          });
          
          if (emp.calculatedEndTime) {
            const endTimePercent = ((emp.calculatedEndTime.getHours() + emp.calculatedEndTime.getMinutes() / 60 - startHour) / totalHours) * 100;
            const endSegment = document.createElement("div");
            endSegment.classList.add("shift-segment", "shift-end");
            endSegment.style.left = `${endTimePercent}%`;
            endSegment.style.width = "2px";
            timeline.appendChild(endSegment);
          }
          
          container.appendChild(timeline);
        });
      }